import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import type { GraphObjectCache } from '../client/graph-object-cache.js';
import type { GraphQLClient } from '../client/graphql-client.js';
import { searchGoals, getGoalByKey, resolveGoalWorkItems, createGoal, editGoal, createGoalStatusUpdate, linkWorkItem, unlinkWorkItem } from '../client/graphql-goals.js';
import { GraphQLHierarchyWalker, collectLeaves, computeDepth, walkTree } from '../client/graphql-hierarchy.js';
import type { JiraClient } from '../client/jira-client.js';
import type { GraphTreeNode, RollupResult } from '../types/index.js';
import { planNextSteps, goalNextSteps } from '../utils/next-steps.js';
import { normalizeArgs } from '../utils/normalize-args.js';

const ALL_ROLLUPS = ['dates', 'points', 'progress', 'assignees'];
const MAX_CHILDREN_DISPLAY = 20;

export async function handlePlanRequest(
  _jiraClient: JiraClient,
  graphqlClient: GraphQLClient,
  request: { params: { name: string; arguments?: Record<string, unknown> } },
  cache?: GraphObjectCache,
) {
  const args = normalizeArgs(request.params?.arguments ?? {});
  const operation = (args.operation as string) ?? 'analyze';
  const goalKey = args.goalKey as string | undefined;

  // Goal operations
  if (operation === 'list_goals') {
    return handleListGoals(graphqlClient, args);
  }
  if (operation === 'get_goal') {
    if (!goalKey) throw new McpError(ErrorCode.InvalidParams, 'goalKey is required for get_goal');
    return handleGetGoal(graphqlClient, goalKey);
  }
  if (goalKey && operation === 'analyze') {
    return handleAnalyzeGoal(graphqlClient, goalKey, args, cache);
  }
  if (operation === 'create_goal') {
    return handleCreateGoal(graphqlClient, args);
  }
  if (operation === 'update_goal') {
    if (!goalKey) throw new McpError(ErrorCode.InvalidParams, 'goalKey is required for update_goal');
    return handleUpdateGoal(graphqlClient, goalKey, args);
  }
  if (operation === 'update_goal_status') {
    if (!goalKey) throw new McpError(ErrorCode.InvalidParams, 'goalKey is required for update_goal_status');
    return handleUpdateGoalStatus(graphqlClient, goalKey, args);
  }
  if (operation === 'link_work_item') {
    if (!goalKey) throw new McpError(ErrorCode.InvalidParams, 'goalKey is required for link_work_item');
    const issueKeyArg = args.issueKey as string | undefined;
    if (!issueKeyArg) throw new McpError(ErrorCode.InvalidParams, 'issueKey is required for link_work_item');
    return handleLinkWorkItem(graphqlClient, goalKey, issueKeyArg);
  }
  if (operation === 'unlink_work_item') {
    if (!goalKey) throw new McpError(ErrorCode.InvalidParams, 'goalKey is required for unlink_work_item');
    const issueKeyArg = args.issueKey as string | undefined;
    if (!issueKeyArg) throw new McpError(ErrorCode.InvalidParams, 'issueKey is required for unlink_work_item');
    return handleUnlinkWorkItem(graphqlClient, goalKey, issueKeyArg);
  }

  // Issue operations require issueKey
  const issueKey = args.issueKey as string | undefined;
  if (!issueKey) {
    throw new McpError(ErrorCode.InvalidParams, 'issueKey or goalKey is required for manage_jira_plan');
  }

  // Handle release operation
  if (operation === 'release') {
    if (!cache) {
      return { content: [{ type: 'text', text: 'Cache not available.' }] };
    }
    const released = cache.release(issueKey);
    return {
      content: [{
        type: 'text',
        text: released
          ? `Released cached walk for ${issueKey}.`
          : `No cached walk found for ${issueKey}.`,
      }],
    };
  }

  const rollups = (Array.isArray(args.rollups) ? args.rollups : ALL_ROLLUPS) as string[];
  const mode = (args.mode as string) ?? 'rollup';
  const focus = args.focus as string | undefined;

  // Try cache-first path
  if (cache) {
    const status = cache.getStatus(issueKey);

    if (status.state === 'error') {
      cache.release(issueKey);
      return {
        content: [{
          type: 'text',
          text: `Walk failed for ${issueKey}: ${status.error ?? 'unknown error'}. Cleared from cache — call again to retry.`,
        }],
        isError: true,
      };
    }

    if (status.state === 'walking') {
      return {
        content: [{
          type: 'text',
          text: `Walking hierarchy for ${issueKey}... ${status.itemCount} items collected so far.\nCall again to check progress or wait for completion.`,
        }],
      };
    }

    if (status.state === 'not_found') {
      cache.startWalk(issueKey, graphqlClient);
      return {
        content: [{
          type: 'text',
          text: `Started hierarchy walk for ${issueKey}. Call again to check progress.\n\n*The walk runs in the background — subsequent calls will show progress or full results once complete.*`,
        }],
      };
    }

    if (status.state === 'complete' || status.state === 'stale') {
      const cached = cache.get(issueKey)!;
      const staleNote = status.stale
        ? '> **Note:** This data may be stale. Call again to refresh, or use `operation: "release"` to clear.\n\n'
        : '';

      if (status.stale) {
        cache.startWalk(issueKey, graphqlClient);
      }

      // Focus mode: windowed view of a specific node
      if (focus) {
        const output = renderFocusView(cached.tree, focus, rollups);
        return { content: [{ type: 'text', text: staleNote + output }] };
      }

      // Default: summary + entry points (bounded)
      const rollupResult = GraphQLHierarchyWalker.computeRollups(cached.tree);
      const output = mode === 'gaps'
        ? renderGapsSummary(cached.tree, rollups, rollupResult)
        : renderOverview(cached.tree, issueKey, cached.itemCount, rollups, rollupResult);

      return {
        content: [{
          type: 'text',
          text: staleNote + output + planNextSteps(issueKey, mode, rollupResult.conflicts, rollupResult),
        }],
      };
    }
  }

  // Fallback: no cache, walk synchronously with original limits
  const walker = new GraphQLHierarchyWalker(graphqlClient);
  let tree: GraphTreeNode;
  let totalItems: number;

  try {
    ({ tree, totalItems } = await walker.walkDown(issueKey));
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not found')) {
      throw new McpError(ErrorCode.InvalidParams, `Issue ${issueKey} not found.`);
    }
    throw new McpError(ErrorCode.InternalError, `Hierarchy walk failed: ${message}`);
  }

  const rollupResult = GraphQLHierarchyWalker.computeRollups(tree);
  const output = renderOverview(tree, issueKey, totalItems, rollups);

  return {
    content: [{
      type: 'text',
      text: output + planNextSteps(issueKey, mode, rollupResult.conflicts, rollupResult),
    }],
  };
}

// --- Rendering: Overview (summary + entry points) ---

function renderOverview(
  tree: GraphTreeNode,
  issueKey: string,
  totalItems: number,
  rollups: string[],
  rollupResult?: RollupResult,
): string {
  const lines: string[] = [];
  const depth = computeDepth(tree);
  rollupResult ??= GraphQLHierarchyWalker.computeRollups(tree);

  lines.push(`# Plan: ${issueKey} — ${tree.issue.summary}`);
  lines.push(`${totalItems} items, ${depth} levels deep | cached`);
  lines.push('');

  renderSummaryBlock(tree, lines, rollups, rollupResult);
  lines.push('');

  // Entry points: immediate children with their rollup summaries
  if (tree.children.length > 0) {
    lines.push('## Children');
    lines.push('');
    const shown = tree.children.slice(0, MAX_CHILDREN_DISPLAY);
    for (const child of shown) {
      renderNodeLine(child, lines, rollups);
    }
    if (tree.children.length > MAX_CHILDREN_DISPLAY) {
      lines.push(`*...and ${tree.children.length - MAX_CHILDREN_DISPLAY} more — use \`focus\` to navigate*`);
    }
    lines.push('');
    lines.push('*Use `focus: "ISSUE-KEY"` to explore any node and its neighborhood.*');
  }

  return lines.join('\n');
}

// --- Rendering: Focus (windowed view of a specific node) ---

function findInTree(
  node: GraphTreeNode,
  key: string,
  parent: GraphTreeNode | null = null,
): { node: GraphTreeNode; parent: GraphTreeNode | null } | null {
  if (node.issue.key === key) return { node, parent };
  for (const child of node.children) {
    const found = findInTree(child, key, node);
    if (found) return found;
  }
  return null;
}

function renderFocusView(
  tree: GraphTreeNode,
  focusKey: string,
  rollups: string[],
): string {
  const found = findInTree(tree, focusKey);
  if (!found) {
    return `Issue ${focusKey} not found in cached hierarchy. Available root: ${tree.issue.key}`;
  }

  const focusNode = found.node;
  const parentNode = found.parent;

  const lines: string[] = [];
  const rollupResult = GraphQLHierarchyWalker.computeRollups(focusNode);

  lines.push(`# Focus: ${focusNode.issue.key} — ${focusNode.issue.summary}`);
  lines.push(`[${focusNode.issue.issueType}] ${focusNode.issue.status}`);
  lines.push('');

  // Parent context
  if (parentNode) {
    const parentRollup = GraphQLHierarchyWalker.computeRollups(parentNode);
    lines.push(`**Parent:** ${parentNode.issue.key} — ${parentNode.issue.summary} [${parentNode.issue.issueType}]`);
    lines.push(`  Progress: ${parentRollup.resolvedItems}/${parentRollup.totalItems} (${parentRollup.progressPct}%)`);
    lines.push('');
  }

  // This node's details
  renderSummaryBlock(focusNode, lines, rollups, rollupResult);
  lines.push('');

  // Siblings (if has parent)
  if (parentNode) {
    const siblings = parentNode.children.filter(c => c.issue.key !== focusKey);
    if (siblings.length > 0) {
      lines.push(`## Siblings (${siblings.length})`);
      lines.push('');
      const shown = siblings.slice(0, MAX_CHILDREN_DISPLAY);
      for (const sib of shown) {
        renderNodeLine(sib, lines, rollups);
      }
      if (siblings.length > MAX_CHILDREN_DISPLAY) {
        lines.push(`*...and ${siblings.length - MAX_CHILDREN_DISPLAY} more*`);
      }
      lines.push('');
    }
  }

  // Children
  if (focusNode.children.length > 0) {
    lines.push(`## Children (${focusNode.children.length})`);
    lines.push('');
    const shown = focusNode.children.slice(0, MAX_CHILDREN_DISPLAY);
    for (const child of shown) {
      renderNodeLine(child, lines, rollups);
    }
    if (focusNode.children.length > MAX_CHILDREN_DISPLAY) {
      lines.push(`*...and ${focusNode.children.length - MAX_CHILDREN_DISPLAY} more*`);
    }
  } else {
    lines.push('*Leaf node — no children*');
  }

  return lines.join('\n');
}

/** Render a single node as a compact line with rollup summary */
function renderNodeLine(node: GraphTreeNode, lines: string[], rollups: string[]): void {
  const statusCat = node.issue.statusCategory.toLowerCase();
  const icon = statusCat === 'done' ? '✓' : statusCat === 'in progress' ? '●' : '○';

  const parts: string[] = [];
  parts.push(`${icon} **${node.issue.key}**: ${node.issue.summary} [${node.issue.issueType}]`);

  const details: string[] = [];
  if (node.children.length > 0) {
    const rollup = GraphQLHierarchyWalker.computeRollups(node);
    if (rollups.includes('progress')) {
      details.push(`${rollup.resolvedItems}/${rollup.totalItems} (${rollup.progressPct}%)`);
    }
    if (rollups.includes('points') && rollup.totalPoints > 0) {
      details.push(`${rollup.earnedPoints}/${rollup.totalPoints} pts`);
    }
    if (rollups.includes('dates') && (rollup.rolledUpStart || rollup.rolledUpEnd)) {
      details.push(`${rollup.rolledUpStart ?? '—'} – ${rollup.rolledUpEnd ?? '—'}`);
    }
    if (rollup.conflicts.length > 0) {
      details.push(`${rollup.conflicts.length} conflicts`);
    }
  } else {
    if (node.issue.assignee) details.push(node.issue.assignee);
    if (rollups.includes('dates') && (node.issue.startDate || node.issue.dueDate)) {
      details.push(`${node.issue.startDate ?? '—'} – ${node.issue.dueDate ?? '—'}`);
    }
    if (rollups.includes('points') && node.issue.storyPoints != null) {
      details.push(`${node.issue.storyPoints} pts`);
    }
  }

  if (details.length > 0) {
    lines.push(`- ${parts[0]}`);
    lines.push(`  ${details.join(' | ')}`);
  } else {
    lines.push(`- ${parts[0]}`);
  }
}

// --- Rendering: Gaps summary (bounded) ---

function renderGapsSummary(
  tree: GraphTreeNode,
  rollups: string[],
  rollupResult?: RollupResult,
): string {
  const lines: string[] = [];
  rollupResult ??= GraphQLHierarchyWalker.computeRollups(tree);

  lines.push(`# Gaps: ${tree.issue.key} — ${tree.issue.summary}`);
  lines.push('');

  const gaps: string[] = [];

  for (const c of rollupResult.conflicts) {
    gaps.push(`- **${c.issueKey}** [${c.type}]: ${c.message}`);
  }

  walkTree(tree, (node) => {
    if (node.children.length === 0) return;

    if (rollups.includes('dates')) {
      const undated = node.children.filter(c => !c.issue.startDate && !c.issue.dueDate);
      const dated = node.children.length - undated.length;
      if (undated.length > 0 && dated > 0) {
        gaps.push(`- **${node.issue.key}**: ${undated.length}/${node.children.length} children have no dates`);
      }
    }

    if (rollups.includes('points')) {
      const unestimated = node.children.filter(c => c.issue.storyPoints == null);
      const estimated = node.children.length - unestimated.length;
      if (unestimated.length > 0 && estimated > 0) {
        gaps.push(`- **${node.issue.key}**: ${unestimated.length}/${node.children.length} children have no story points`);
      }
    }

    if (rollups.includes('assignees')) {
      const unassigned = node.children.filter(c => !c.issue.assignee && !c.issue.isResolved);
      if (unassigned.length > 0) {
        gaps.push(`- **${node.issue.key}**: ${unassigned.length} active children unassigned`);
      }
    }
  });

  if (gaps.length === 0) {
    lines.push('No gaps or conflicts detected.');
  } else {
    const unique = [...new Set(gaps)];
    // Cap output to first 30 gaps
    const shown = unique.slice(0, 30);
    lines.push(...shown);
    if (unique.length > 30) {
      lines.push(`\n*...and ${unique.length - 30} more. Use \`focus\` on a specific subtree to narrow down.*`);
    }
  }

  return lines.join('\n');
}

// --- Shared rendering ---

function renderSummaryBlock(
  tree: GraphTreeNode,
  lines: string[],
  rollups: string[],
  result: RollupResult,
): void {
  if (rollups.includes('dates')) {
    const own = `${tree.issue.startDate ?? '—'} – ${tree.issue.dueDate ?? '—'}`;
    const derived = `${result.rolledUpStart ?? '—'} – ${result.rolledUpEnd ?? '—'}`;
    lines.push(`**Dates:** own ${own} | rolled-up ${derived}`);
  }
  if (rollups.includes('points') && result.totalPoints > 0) {
    lines.push(`**Points:** ${result.totalPoints} total, ${result.earnedPoints} earned`);
  }
  if (rollups.includes('progress')) {
    lines.push(`**Progress:** ${result.resolvedItems}/${result.totalItems} resolved (${result.progressPct}%)`);
  }
  if (rollups.includes('assignees') && result.assignees.length > 0) {
    lines.push(`**Team:** ${result.assignees.join(', ')}${result.unassignedCount > 0 ? ` | ${result.unassignedCount} unassigned` : ''}`);
  }
  if (result.conflicts.length > 0) {
    lines.push(`**Conflicts:** ${result.conflicts.length} detected`);
  }
}

/** Full tree renderer — kept for analysis-handler hierarchy metric (small trees only) */
export function renderRollupTree(
  node: GraphTreeNode,
  lines: string[],
  rollups: string[],
  prefix: string,
  isLast: boolean,
): void {
  const connector = prefix === '' ? '' : (isLast ? '└── ' : '├── ');
  const statusCat = node.issue.statusCategory.toLowerCase();
  const icon = statusCat === 'done' ? '✓' : statusCat === 'in progress' ? '●' : '○';

  const label = `${icon} **${node.issue.key}**: ${node.issue.summary} [${node.issue.issueType}]`;
  lines.push(`${prefix}${connector}${label}`);

  const indent = prefix + (prefix === '' ? '' : (isLast ? '    ' : '│   '));

  if (rollups.includes('dates')) {
    const start = node.issue.startDate ?? '—';
    const due = node.issue.dueDate ?? '—';
    if (start !== '—' || due !== '—' || node.children.length > 0) {
      let dateLine = `${indent}  ${start} – ${due}`;
      if (node.children.length > 0) {
        const childRollup = GraphQLHierarchyWalker.computeRollups(node);
        if (childRollup.rolledUpStart || childRollup.rolledUpEnd) {
          dateLine += ` | rolled-up ${childRollup.rolledUpStart ?? '—'} – ${childRollup.rolledUpEnd ?? '—'}`;
        }
        const conflict = childRollup.conflicts.find(c => c.issueKey === node.issue.key);
        if (conflict) dateLine += ` ⚠️ ${conflict.message}`;
      }
      lines.push(dateLine);
    }
  }

  if (rollups.includes('points') && node.issue.storyPoints != null) {
    lines.push(`${indent}  ${node.issue.storyPoints} pts`);
  }

  if (rollups.includes('progress') && node.children.length > 0) {
    const leaves = collectLeaves(node);
    const resolved = leaves.filter(l => l.isResolved).length;
    lines.push(`${indent}  Progress: ${resolved}/${leaves.length} (${leaves.length > 0 ? Math.round(resolved / leaves.length * 100) : 0}%)`);
  }

  if (rollups.includes('assignees') && node.children.length === 0 && node.issue.assignee) {
    lines.push(`${indent}  ${node.issue.assignee}`);
  }

  const childPrefix = prefix + (prefix === '' ? '' : (isLast ? '    ' : '│   '));
  node.children.forEach((child, i) => {
    renderRollupTree(child, lines, rollups, childPrefix, i === node.children.length - 1);
  });
}

// --- Goal operations ---

async function handleListGoals(
  graphqlClient: GraphQLClient,
  args: Record<string, unknown>,
) {
  const searchString = (args.searchString as string) ?? '';
  const sort = (args.sort as string) ?? 'HIERARCHY_ASC';

  const result = await searchGoals(graphqlClient, searchString, sort);
  if (!result.success || !result.goals) {
    const error = result.error ?? 'Unknown error';
    if (error.includes('not found') || error.includes('Cannot route')) {
      return { content: [{ type: 'text', text: 'No goals found. Goals may not be enabled on this instance.' }] };
    }
    return { content: [{ type: 'text', text: `Goal search failed: ${error}` }], isError: true };
  }

  if (result.goals.length === 0) {
    const hint = searchString.includes('status =')
      ? '\n\n*Note: TQL status filtering may be incomplete for some values. Try without the status filter to see all goals.*'
      : '';
    return { content: [{ type: 'text', text: `No goals found for search: "${searchString}"${hint}` }] };
  }

  const lines: string[] = [];
  lines.push(`# Goals (${result.goals.length})`);
  lines.push('');

  for (const goal of result.goals) {
    const workCount = result.workItemCounts?.get(goal.key) ?? 0;
    const indent = goal.parentGoal ? '  ' : '';
    const stateIcon = goalStateIcon(goal.state.value);
    const owner = goal.owner ? ` — ${goal.owner.name}` : '';
    const workLabel = workCount > 0 ? ` | ${workCount} linked issues` : '';

    lines.push(`${indent}${stateIcon} **${goal.key}**: ${goal.name} [${goal.state.label}]${owner}${workLabel}`);
  }

  lines.push('');
  lines.push(goalNextSteps('list_goals'));

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

async function handleGetGoal(
  graphqlClient: GraphQLClient,
  goalKey: string,
) {
  const result = await getGoalByKey(graphqlClient, goalKey);
  if (!result.success || !result.goal) {
    return { content: [{ type: 'text', text: `Goal ${goalKey} not found: ${result.error ?? 'unknown error'}` }], isError: true };
  }

  const goal = result.goal;
  const lines: string[] = [];

  lines.push(`# Goal: ${goal.key} — ${goal.name}`);
  lines.push(`**State:** ${goal.state.label} | **Owner:** ${goal.owner?.name ?? 'Unassigned'}`);
  if (goal.parentGoal) {
    lines.push(`**Parent:** ${goal.parentGoal.key} — ${goal.parentGoal.name}`);
  }
  if (goal.description) {
    lines.push(`**Description:** ${goal.description}`);
  }
  lines.push('');

  if (goal.subGoals.length > 0) {
    lines.push(`## Sub-Goals (${goal.subGoals.length})`);
    lines.push('');
    for (const sg of goal.subGoals) {
      const stateIcon = goalStateIcon(sg.state.value);
      lines.push(`${stateIcon} **${sg.key}**: ${sg.name} [${sg.state.label}]`);
    }
    lines.push('');
  }

  if (goal.projects.length > 0) {
    lines.push(`## Projects (${goal.projects.length})`);
    lines.push('');
    for (const p of goal.projects) {
      lines.push(`- ${p.name} [${p.state.value}]`);
    }
    lines.push('');
  }

  if (goal.workItems.length > 0) {
    lines.push(`## Linked Issues (${goal.workItems.length})`);
    lines.push('');
    for (const w of goal.workItems) {
      lines.push(`- **${w.key}** [${w.issueType.name}] ${w.summary} — ${w.status.name}`);
    }
    lines.push('');
  } else {
    lines.push('*No linked Jira issues.*');
    lines.push('');
  }

  lines.push(goalNextSteps('get_goal', goalKey, goal.workItems.length));

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

async function handleAnalyzeGoal(
  graphqlClient: GraphQLClient,
  goalKey: string,
  args: Record<string, unknown>,
  cache?: GraphObjectCache,
) {
  const result = await resolveGoalWorkItems(graphqlClient, goalKey);
  if (!result.success || !result.goal) {
    return { content: [{ type: 'text', text: `Failed to resolve goal ${goalKey}: ${result.error ?? 'unknown error'}` }], isError: true };
  }

  const goal = result.goal;
  const issueKeys = result.issueKeys ?? [];

  if (issueKeys.length === 0) {
    const lines: string[] = [];
    lines.push(`# Goal: ${goal.key} — ${goal.name} [${goal.state.label}]`);
    lines.push('');
    lines.push('No linked Jira issues to analyze. Cannot resolve linked Jira issues — the workItems API may have changed, or no issues are linked to this goal.');
    lines.push('');
    lines.push(goalNextSteps('analyze', goalKey, 0));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  // Goal context header
  const header: string[] = [];
  header.push(`# Goal: ${goal.key} — ${goal.name} [${goal.state.label}]`);
  header.push(`**Owner:** ${goal.owner?.name ?? 'Unassigned'} | **Linked issues:** ${issueKeys.length}`);
  if (goal.subGoals.length > 0) {
    header.push(`**Sub-goals:** ${goal.subGoals.map(sg => `${sg.key} [${sg.state.value}]`).join(', ')}`);
  }
  header.push('');

  // Walk each issue's hierarchy and compute rollups
  const rollups = (Array.isArray(args.rollups) ? args.rollups : ALL_ROLLUPS) as string[];

  // For goal analysis, walk each linked issue and merge results
  const walker = new GraphQLHierarchyWalker(graphqlClient);
  const allTrees: GraphTreeNode[] = [];
  const errors: string[] = [];

  // Separate cached from uncached keys
  const uncachedKeys: string[] = [];
  for (const key of issueKeys) {
    if (cache) {
      const status = cache.getStatus(key);
      if (status.state === 'complete' || status.state === 'stale') {
        allTrees.push(cache.get(key)!.tree);
        continue;
      }
    }
    uncachedKeys.push(key);
  }

  // Walk uncached keys in parallel
  const walkResults = await Promise.allSettled(
    uncachedKeys.map(key => walker.walkDown(key)),
  );
  for (let i = 0; i < walkResults.length; i++) {
    const result = walkResults[i];
    if (result.status === 'fulfilled') {
      allTrees.push(result.value.tree);
    } else {
      errors.push(uncachedKeys[i]);
    }
  }

  if (allTrees.length === 0) {
    header.push('All issue hierarchy walks failed. The linked issues may not be accessible.');
    if (errors.length > 0) header.push(`Failed keys: ${errors.join(', ')}`);
    return { content: [{ type: 'text', text: header.join('\n') }] };
  }

  // Render each tree's rollup as a summary line
  header.push(`## Issue Rollups (${allTrees.length} of ${issueKeys.length} resolved)`);
  if (errors.length > 0) {
    header.push(`*${errors.length} issues could not be walked: ${errors.join(', ')}*`);
  }
  header.push('');

  let totalResolved = 0;
  let totalItems = 0;
  let totalPoints = 0;
  let earnedPoints = 0;

  for (const tree of allTrees) {
    const rollup = GraphQLHierarchyWalker.computeRollups(tree);
    totalResolved += rollup.resolvedItems;
    totalItems += rollup.totalItems;
    totalPoints += rollup.totalPoints;
    earnedPoints += rollup.earnedPoints;
    renderNodeLine(tree, header, rollups);
  }

  header.push('');
  header.push('## Aggregate');
  if (rollups.includes('progress')) {
    const pct = totalItems > 0 ? Math.round(totalResolved / totalItems * 100) : 0;
    header.push(`**Progress:** ${totalResolved}/${totalItems} resolved (${pct}%)`);
  }
  if (rollups.includes('points') && totalPoints > 0) {
    header.push(`**Points:** ${earnedPoints}/${totalPoints} earned`);
  }
  header.push('');
  header.push(goalNextSteps('analyze', goalKey, issueKeys.length));

  return { content: [{ type: 'text', text: header.join('\n') }] };
}

function goalStateIcon(state: string): string {
  switch (state) {
    case 'done': return '✓';
    case 'on_track': return '●';
    case 'at_risk': return '⚠';
    case 'off_track': return '✗';
    default: return '○';
  }
}

// --- Goal mutations ---

async function handleCreateGoal(
  graphqlClient: GraphQLClient,
  args: Record<string, unknown>,
) {
  const name = args.name as string | undefined;
  if (!name) throw new McpError(ErrorCode.InvalidParams, 'name is required for create_goal');

  const result = await createGoal(graphqlClient, {
    name,
    description: args.description as string | undefined,
    parentGoalKey: args.parentGoalKey as string | undefined,
    targetDate: args.targetDate as string | undefined,
  });

  if (!result.success || !result.goal) {
    return { content: [{ type: 'text', text: `Failed to create goal: ${result.error}` }], isError: true };
  }

  const goal = result.goal;
  const lines = [
    `Goal created: **${goal.key}** — ${goal.name}`,
    `URL: ${goal.url}`,
    '',
    goalNextSteps('create_goal', goal.key),
  ];
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

async function handleUpdateGoal(
  graphqlClient: GraphQLClient,
  goalKey: string,
  args: Record<string, unknown>,
) {
  const result = await editGoal(graphqlClient, goalKey, {
    name: args.name as string | undefined,
    description: args.description as string | undefined,
    targetDate: args.targetDate as string | undefined,
    startDate: args.startDate as string | undefined,
    archived: args.archived as boolean | undefined,
  });

  if (!result.success) {
    return { content: [{ type: 'text', text: `Failed to update goal ${goalKey}: ${result.error}` }], isError: true };
  }

  const lines = [
    `Goal ${goalKey} updated.`,
    '',
    goalNextSteps('update_goal', goalKey),
  ];
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

async function handleUpdateGoalStatus(
  graphqlClient: GraphQLClient,
  goalKey: string,
  args: Record<string, unknown>,
) {
  const status = args.status as string | undefined;
  if (!status) throw new McpError(ErrorCode.InvalidParams, 'status is required for update_goal_status');

  const result = await createGoalStatusUpdate(
    graphqlClient,
    goalKey,
    status,
    args.summary as string | undefined,
  );

  if (!result.success) {
    return { content: [{ type: 'text', text: `Failed to update status for ${goalKey}: ${result.error}` }], isError: true };
  }

  const lines = [
    `Goal ${goalKey} status updated to **${status}**.`,
    args.summary ? `Summary: ${args.summary}` : '',
    '',
    goalNextSteps('update_goal_status', goalKey),
  ].filter(Boolean);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

async function handleLinkWorkItem(
  graphqlClient: GraphQLClient,
  goalKey: string,
  issueKey: string,
) {
  const result = await linkWorkItem(graphqlClient, goalKey, issueKey);
  if (!result.success) {
    return { content: [{ type: 'text', text: `Failed to link ${issueKey} to goal ${goalKey}: ${result.error}` }], isError: true };
  }

  const lines = [
    `Linked **${issueKey}** to goal **${goalKey}**.`,
    '',
    goalNextSteps('link_work_item', goalKey),
  ];
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

async function handleUnlinkWorkItem(
  graphqlClient: GraphQLClient,
  goalKey: string,
  issueKey: string,
) {
  const result = await unlinkWorkItem(graphqlClient, goalKey, issueKey);
  if (!result.success) {
    return { content: [{ type: 'text', text: `Failed to unlink ${issueKey} from goal ${goalKey}: ${result.error}` }], isError: true };
  }

  const lines = [
    `Unlinked **${issueKey}** from goal **${goalKey}**.`,
    '',
    goalNextSteps('unlink_work_item', goalKey),
  ];
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
