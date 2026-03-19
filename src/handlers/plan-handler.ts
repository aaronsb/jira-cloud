import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { GraphQLClient } from '../client/graphql-client.js';
import type { JiraClient } from '../client/jira-client.js';
import type { DerivedField, PlanNode, RoadmapItem } from '../types/index.js';
import { normalizeArgs } from '../utils/normalize-args.js';
import { planNextSteps } from '../utils/next-steps.js';

// --- GraphQL queries (string constants for easy updating if schema changes) ---

const ROADMAP_FOR_SOURCE = `
  query RoadmapForSource($cloudId: ID!, $sourceAri: ID!) {
    roadmaps {
      roadmapForSource(cloudId: $cloudId, sourceAri: $sourceAri) {
        id
      }
    }
  }
`;

const ROADMAP_ITEMS = `
  query RoadmapItems($cloudId: ID!, $roadmapId: ID!, $itemIds: [ID!]!) {
    roadmaps {
      roadmapItemByIds(cloudId: $cloudId, roadmapId: $roadmapId, itemIds: $itemIds) {
        id
        title
        status { statusCategory }
        childItems { id }
        schedule { startDate dueDate }
        storyPoints
        assignee { displayName }
      }
    }
  }
`;

const DERIVE_FIELDS = `
  query DeriveFields($cloudId: ID!, $roadmapId: ID!, $itemIds: [ID!]!) {
    roadmaps {
      roadmapDeriveFields(cloudId: $cloudId, roadmapId: $roadmapId, itemIds: $itemIds) {
        itemId
        derivedStartDate
        derivedDueDate
        derivedProgress
      }
    }
  }
`;

const MAX_PLAN_ITEMS = 200;
const ALL_ROLLUPS = ['dates', 'points', 'progress', 'assignees'];

// --- Public handler ---

export async function handlePlanRequest(
  jiraClient: JiraClient,
  graphqlClient: GraphQLClient,
  request: { params: { name: string; arguments?: Record<string, unknown> } },
) {
  const args = normalizeArgs(request.params?.arguments ?? {});
  const issueKey = args.issueKey as string | undefined;

  if (!issueKey) {
    throw new McpError(ErrorCode.InvalidParams, 'issueKey is required for analyze_jira_plan');
  }

  const rollups = (Array.isArray(args.rollups) ? args.rollups : ALL_ROLLUPS) as string[];
  const mode = (args.mode as string) ?? 'rollup';

  // 1. Resolve issue to get numeric ID and project ID for ARI construction
  const cloudId = graphqlClient.getCloudId();
  let issueId: string;
  let projectId: string;

  try {
    const issue = await jiraClient.v3Client.issues.getIssue({
      issueIdOrKey: issueKey,
      fields: ['summary', 'project'],
    });
    issueId = issue.id;
    projectId = issue.fields?.project?.id ?? '';
  } catch {
    throw new McpError(ErrorCode.InvalidParams, `Issue ${issueKey} not found or not accessible.`);
  }

  // 2. Find roadmap — try project ARI first (Plans are scoped to projects/boards)
  const projectAri = `ari:cloud:jira:${cloudId}:project/${projectId}`;
  let roadmapId: string | null = null;

  const projectResult = await graphqlClient.query<{
    roadmaps: { roadmapForSource: { id: string } | null };
  }>(ROADMAP_FOR_SOURCE, { sourceAri: projectAri });

  if (projectResult.success) {
    roadmapId = projectResult.data?.roadmaps?.roadmapForSource?.id ?? null;
  }

  // Fallback: try issue ARI
  if (!roadmapId) {
    const issueAri = `ari:cloud:jira:${cloudId}:issue/${issueId}`;
    const issueResult = await graphqlClient.query<{
      roadmaps: { roadmapForSource: { id: string } | null };
    }>(ROADMAP_FOR_SOURCE, { sourceAri: issueAri });

    if (issueResult.success) {
      roadmapId = issueResult.data?.roadmaps?.roadmapForSource?.id ?? null;
    }
  }

  if (!roadmapId) {
    return {
      content: [{
        type: 'text',
        text: [
          `**${issueKey} is not in a Jira Plan.**`,
          '',
          'This tool requires the issue to be part of a configured Jira Plan (Advanced Roadmaps).',
          '',
          '**Alternatives:**',
          `- Use \`manage_jira_issue\` with \`operation: "hierarchy"\` and \`issueKey: "${issueKey}"\` to explore the issue tree structure`,
          `- Use \`analyze_jira_issues\` with \`jql: "parent = ${issueKey}"\` for flat metrics on child issues`,
        ].join('\n'),
      }],
    };
  }

  // 3. Walk hierarchy — start with finding the root item, then fetch children in batches
  const allItems = new Map<string, RoadmapItem>();
  const itemQueue: string[] = [];

  // We need to find the roadmap item corresponding to our issue.
  // Fetch items for the roadmap — start by searching for all items and filtering.
  // For v1, we use roadmapFilterItems or fetch root-level items.
  // Since we don't have the roadmap item ID, we'll query with a broad initial fetch.
  // TODO: This is the biggest uncertainty — we may need roadmapFilterItems to find the item by issue.

  // Attempt: fetch items by walking from a hypothetical item ID derived from issue
  // The actual approach needs live testing — for now, try the issue ARI as an item ID
  const issueAri = `ari:cloud:jira:${cloudId}:issue/${issueId}`;

  const rootResult = await graphqlClient.query<{
    roadmaps: { roadmapItemByIds: RoadmapItem[] };
  }>(ROADMAP_ITEMS, { roadmapId, itemIds: [issueAri] });

  let rootItems = rootResult.data?.roadmaps?.roadmapItemByIds ?? [];

  // If ARI-based lookup fails, the item IDs may use a different format.
  // Log for debugging and return a helpful message.
  if (!rootResult.success || rootItems.length === 0) {
    return {
      content: [{
        type: 'text',
        text: [
          `**Could not find ${issueKey} in the roadmap.**`,
          '',
          `The issue's project has a Plan, but ${issueKey} may not be included in it.`,
          `Check the Plan configuration in Jira to ensure this issue type is included.`,
          '',
          rootResult.error ? `GraphQL error: ${rootResult.error}` : '',
          '',
          '**Alternatives:**',
          `- Use \`manage_jira_issue\` with \`operation: "hierarchy"\` to explore the tree`,
          `- Use \`analyze_jira_issues\` with \`jql: "parent = ${issueKey}"\` for flat metrics`,
        ].filter(Boolean).join('\n'),
      }],
    };
  }

  const rootItem = rootItems[0];
  allItems.set(rootItem.id, rootItem);

  // Walk children breadth-first
  for (const child of rootItem.childItems) {
    itemQueue.push(child.id);
  }

  while (itemQueue.length > 0 && allItems.size < MAX_PLAN_ITEMS) {
    const batch = itemQueue.splice(0, 50);
    const childResult = await graphqlClient.query<{
      roadmaps: { roadmapItemByIds: RoadmapItem[] };
    }>(ROADMAP_ITEMS, { roadmapId, itemIds: batch });

    if (!childResult.success || !childResult.data) break;

    for (const item of childResult.data.roadmaps.roadmapItemByIds) {
      if (!allItems.has(item.id)) {
        allItems.set(item.id, item);
        for (const child of item.childItems) {
          if (!allItems.has(child.id) && allItems.size + itemQueue.length < MAX_PLAN_ITEMS) {
            itemQueue.push(child.id);
          }
        }
      }
    }
  }

  // 4. Fetch derived fields for items with children
  const parentIds = [...allItems.values()]
    .filter(item => item.childItems.length > 0)
    .map(item => item.id);

  const derivedMap = new Map<string, DerivedField>();

  if (parentIds.length > 0) {
    const derivedResult = await graphqlClient.query<{
      roadmaps: { roadmapDeriveFields: DerivedField[] };
    }>(DERIVE_FIELDS, { roadmapId, itemIds: parentIds });

    if (derivedResult.success && derivedResult.data) {
      for (const df of derivedResult.data.roadmaps.roadmapDeriveFields) {
        derivedMap.set(df.itemId, df);
      }
    }
  }

  // 5. Build tree
  const tree = buildPlanTree(rootItem.id, allItems, derivedMap);
  const truncated = allItems.size >= MAX_PLAN_ITEMS;

  // 6. Render output
  const output = renderPlanOutput(tree, issueKey, allItems.size, rollups, mode, truncated);

  return {
    content: [{
      type: 'text',
      text: output + planNextSteps(issueKey, mode),
    }],
  };
}

// --- Tree building ---

function buildPlanTree(
  rootId: string,
  items: Map<string, RoadmapItem>,
  derived: Map<string, DerivedField>,
): PlanNode {
  const item = items.get(rootId)!;
  const children = item.childItems
    .filter(c => items.has(c.id))
    .map(c => buildPlanTree(c.id, items, derived));

  return {
    item,
    derived: derived.get(rootId) ?? null,
    children,
  };
}

// --- Rendering ---

function renderPlanOutput(
  tree: PlanNode,
  issueKey: string,
  totalItems: number,
  rollups: string[],
  mode: string,
  truncated: boolean,
): string {
  const lines: string[] = [];
  const depth = computeDepth(tree);

  lines.push(`# Plan: ${issueKey} — ${tree.item.title}`);
  lines.push(`Depth: ${depth} levels, ${totalItems} items`);
  lines.push('Source: Atlassian Plans (derived fields)');
  if (truncated) {
    lines.push(`⚠️ Truncated at ${MAX_PLAN_ITEMS} items — consider analyzing a narrower subtree`);
  }
  lines.push('');

  switch (mode) {
    case 'gaps':
      renderGaps(tree, lines, rollups);
      break;
    case 'timeline':
      renderTimeline(tree, lines);
      break;
    default:
      renderRollupTree(tree, lines, rollups, '', true);
      break;
  }

  return lines.join('\n');
}

export function renderRollupTree(
  node: PlanNode,
  lines: string[],
  rollups: string[],
  prefix: string,
  isLast: boolean,
): void {
  const connector = prefix === '' ? '' : (isLast ? '└── ' : '├── ');
  const status = node.item.status?.statusCategory ?? 'unknown';
  const statusIcon = status === 'done' ? '✓' : status === 'indeterminate' ? '●' : '○';

  lines.push(`${prefix}${connector}${statusIcon} **${node.item.title}**`);

  const indent = prefix + (prefix === '' ? '' : (isLast ? '    ' : '│   '));

  if (rollups.includes('dates')) {
    const ownStart = node.item.schedule?.startDate ?? '—';
    const ownDue = node.item.schedule?.dueDate ?? '—';
    let dateLine = `${indent}  Dates: own ${formatDate(ownStart)} – ${formatDate(ownDue)}`;

    if (node.derived) {
      const derivedStart = node.derived.derivedStartDate ?? '—';
      const derivedDue = node.derived.derivedDueDate ?? '—';
      dateLine += ` | derived ${formatDate(derivedStart)} – ${formatDate(derivedDue)}`;

      const conflict = detectDateConflict(node);
      if (conflict) dateLine += ` ⚠️ ${conflict}`;
    }
    lines.push(dateLine);
  }

  if (rollups.includes('points')) {
    const ownPts = node.item.storyPoints;
    if (ownPts !== null && ownPts !== undefined) {
      lines.push(`${indent}  Points: ${ownPts}`);
    } else if (node.children.length > 0) {
      const total = sumPoints(node);
      const done = sumPoints(node, 'done');
      if (total > 0) {
        lines.push(`${indent}  Points: rolled-up ${total} pts (${done} earned)`);
      }
    }
  }

  if (rollups.includes('progress') && node.children.length > 0) {
    const { resolved, total, progressPct } = computeProgress(node);
    let progressLine = `${indent}  Progress: ${resolved}/${total} resolved (${progressPct}%)`;

    if (node.derived?.derivedProgress != null) {
      progressLine += ` | derived ${Math.round(node.derived.derivedProgress * 100)}%`;
    }
    lines.push(progressLine);
  }

  if (rollups.includes('assignees') && node.children.length === 0) {
    const assignee = node.item.assignee?.displayName;
    if (assignee) {
      lines.push(`${indent}  Assignee: ${assignee}`);
    }
  } else if (rollups.includes('assignees') && node.children.length > 0) {
    const team = collectAssignees(node);
    if (team.length > 0) {
      lines.push(`${indent}  Team: ${team.join(', ')}`);
    }
  }

  // Render children
  const childPrefix = prefix + (prefix === '' ? '' : (isLast ? '    ' : '│   '));
  node.children.forEach((child, i) => {
    renderRollupTree(child, lines, rollups, childPrefix, i === node.children.length - 1);
  });
}

function renderGaps(tree: PlanNode, lines: string[], rollups: string[]): void {
  lines.push('## Gaps and Conflicts\n');

  const gaps: string[] = [];
  walkTree(tree, (node) => {
    const title = node.item.title;

    if (rollups.includes('dates')) {
      const conflict = detectDateConflict(node);
      if (conflict) {
        gaps.push(`- **${title}**: ${conflict}`);
      }
      if (node.children.length > 0) {
        const undated = node.children.filter(c =>
          !c.item.schedule?.startDate && !c.item.schedule?.dueDate
        );
        const dated = node.children.length - undated.length;
        if (undated.length > 0 && dated > 0) {
          gaps.push(`- **${title}**: ${undated.length}/${node.children.length} children have no dates`);
        }
      }
    }

    if (rollups.includes('points') && node.children.length > 0) {
      const unestimated = node.children.filter(c => c.item.storyPoints == null);
      const estimated = node.children.length - unestimated.length;
      if (unestimated.length > 0 && estimated > 0) {
        gaps.push(`- **${title}**: ${unestimated.length}/${node.children.length} children have no story points`);
      }
    }

    // Open children under resolved parent
    if (node.item.status?.statusCategory === 'done' && node.children.length > 0) {
      const openChildren = node.children.filter(c => c.item.status?.statusCategory !== 'done');
      if (openChildren.length > 0) {
        gaps.push(`- **${title}**: resolved but has ${openChildren.length} open children`);
      }
    }

    if (rollups.includes('assignees') && node.children.length > 0) {
      const unassigned = node.children.filter(c =>
        !c.item.assignee && c.item.status?.statusCategory !== 'done'
      );
      if (unassigned.length > 0) {
        gaps.push(`- **${title}**: ${unassigned.length} active children unassigned`);
      }
    }
  });

  if (gaps.length === 0) {
    lines.push('No gaps or conflicts detected.');
  } else {
    lines.push(...gaps);
  }
}

function renderTimeline(tree: PlanNode, lines: string[]): void {
  lines.push('## Timeline\n');

  const items: Array<{ title: string; start: string | null; due: string | null; derivedDue: string | null; depth: number }> = [];
  walkTreeWithDepth(tree, 0, (node, depth) => {
    items.push({
      title: node.item.title,
      start: node.item.schedule?.startDate ?? node.derived?.derivedStartDate ?? null,
      due: node.item.schedule?.dueDate ?? node.derived?.derivedDueDate ?? null,
      derivedDue: node.derived?.derivedDueDate ?? null,
      depth,
    });
  });

  // Sort by start date (nulls last)
  items.sort((a, b) => {
    const aDate = a.start ?? 'z';
    const bDate = b.start ?? 'z';
    return aDate.localeCompare(bDate);
  });

  lines.push('| Item | Start | Due | Derived Due |');
  lines.push('|------|-------|-----|-------------|');
  for (const item of items) {
    const indent = '  '.repeat(item.depth);
    lines.push(`| ${indent}${item.title} | ${formatDate(item.start)} | ${formatDate(item.due)} | ${formatDate(item.derivedDue)} |`);
  }
}

// --- Helpers ---

export function detectDateConflict(node: PlanNode): string | null {
  if (!node.derived) return null;

  const ownDue = node.item.schedule?.dueDate;
  const derivedDue = node.derived.derivedDueDate;

  if (ownDue && derivedDue && derivedDue > ownDue) {
    const ownDate = new Date(ownDue);
    const derivedDate = new Date(derivedDue);
    const diffDays = Math.ceil((derivedDate.getTime() - ownDate.getTime()) / (1000 * 60 * 60 * 24));
    return `CONFLICT: children end ${diffDays}d after parent due date`;
  }

  const ownStart = node.item.schedule?.startDate;
  const derivedStart = node.derived.derivedStartDate;

  if (ownStart && derivedStart && derivedStart < ownStart) {
    return 'CONFLICT: children start before parent start date';
  }

  return null;
}

export function computeProgress(node: PlanNode): { resolved: number; total: number; progressPct: number } {
  let resolved = 0;
  let total = 0;

  walkTree(node, (n) => {
    if (n.children.length === 0) {
      total++;
      if (n.item.status?.statusCategory === 'done') resolved++;
    }
  });

  // Exclude root from count if it has children
  if (node.children.length > 0 && node.item.status?.statusCategory === 'done') {
    // Root counted as leaf above only if no children — skip adjustment
  }

  const progressPct = total > 0 ? Math.round((resolved / total) * 100) : 0;
  return { resolved, total, progressPct };
}

function sumPoints(node: PlanNode, statusFilter?: string): number {
  let total = 0;
  walkTree(node, (n) => {
    if (n.children.length === 0 && n.item.storyPoints != null) {
      if (!statusFilter || n.item.status?.statusCategory === statusFilter) {
        total += n.item.storyPoints;
      }
    }
  });
  return total;
}

function collectAssignees(node: PlanNode): string[] {
  const assignees = new Set<string>();
  walkTree(node, (n) => {
    if (n.item.assignee?.displayName) {
      assignees.add(n.item.assignee.displayName);
    }
  });
  return [...assignees].sort();
}

function computeDepth(node: PlanNode): number {
  if (node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(computeDepth));
}

function walkTree(node: PlanNode, fn: (node: PlanNode) => void): void {
  fn(node);
  for (const child of node.children) {
    walkTree(child, fn);
  }
}

function walkTreeWithDepth(node: PlanNode, depth: number, fn: (node: PlanNode, depth: number) => void): void {
  fn(node, depth);
  for (const child of node.children) {
    walkTreeWithDepth(child, depth + 1, fn);
  }
}

function formatDate(d: string | null | undefined): string {
  if (!d || d === '—') return '—';
  try {
    const date = new Date(d);
    return date.toISOString().slice(0, 10);
  } catch {
    return d;
  }
}
