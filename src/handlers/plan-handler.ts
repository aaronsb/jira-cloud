import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import type { GraphObjectCache } from '../client/graph-object-cache.js';
import type { GraphQLClient } from '../client/graphql-client.js';
import { GraphQLHierarchyWalker, collectLeaves, computeDepth, walkTree } from '../client/graphql-hierarchy.js';
import type { JiraClient } from '../client/jira-client.js';
import type { GraphTreeNode, RollupResult } from '../types/index.js';
import { planNextSteps } from '../utils/next-steps.js';
import { normalizeArgs } from '../utils/normalize-args.js';

const ALL_ROLLUPS = ['dates', 'points', 'progress', 'assignees'];

export async function handlePlanRequest(
  _jiraClient: JiraClient,
  graphqlClient: GraphQLClient,
  request: { params: { name: string; arguments?: Record<string, unknown> } },
  cache?: GraphObjectCache,
) {
  const args = normalizeArgs(request.params?.arguments ?? {});
  const issueKey = args.issueKey as string | undefined;

  if (!issueKey) {
    throw new McpError(ErrorCode.InvalidParams, 'issueKey is required for analyze_jira_plan');
  }

  const operation = (args.operation as string) ?? 'analyze';

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

  // Try cache-first path
  if (cache) {
    const status = cache.getStatus(issueKey);

    if (status.state === 'walking') {
      return {
        content: [{
          type: 'text',
          text: `Walking hierarchy for ${issueKey}... ${status.itemCount} items collected so far.\nCall again to check progress or wait for completion.`,
        }],
      };
    }

    if (status.state === 'not_found') {
      // Start background walk, return immediately with status
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
      const rollupResult = GraphQLHierarchyWalker.computeRollups(cached.tree);
      const staleNote = status.stale
        ? '\n> **Note:** This data may be stale. Call again to refresh, or use `operation: "release"` to clear.\n'
        : '';

      // If stale, start a background re-walk
      if (status.stale) {
        cache.startWalk(issueKey, graphqlClient);
      }

      const output = renderPlanOutput(cached.tree, issueKey, cached.itemCount, false, rollups, mode, rollupResult);
      return {
        content: [{
          type: 'text',
          text: staleNote + output + planNextSteps(issueKey, mode, rollupResult.conflicts, rollupResult),
        }],
      };
    }
  }

  // Fallback: no cache, walk synchronously (backward compat)
  const walker = new GraphQLHierarchyWalker(graphqlClient);
  let tree: GraphTreeNode;
  let totalItems: number;
  let truncated: boolean;

  try {
    ({ tree, totalItems, truncated } = await walker.walkDown(issueKey));
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not found')) {
      throw new McpError(ErrorCode.InvalidParams, `Issue ${issueKey} not found.`);
    }
    throw new McpError(ErrorCode.InternalError, `Hierarchy walk failed: ${message}`);
  }

  const rollupResult = GraphQLHierarchyWalker.computeRollups(tree);
  const output = renderPlanOutput(tree, issueKey, totalItems, truncated, rollups, mode, rollupResult);

  return {
    content: [{
      type: 'text',
      text: output + planNextSteps(issueKey, mode, rollupResult.conflicts, rollupResult),
    }],
  };
}

// --- Rendering ---

function renderPlanOutput(
  tree: GraphTreeNode,
  issueKey: string,
  totalItems: number,
  truncated: boolean,
  rollups: string[],
  mode: string,
  rollupResult: RollupResult,
): string {
  const lines: string[] = [];
  const depth = computeDepth(tree);

  lines.push(`# Plan: ${issueKey} — ${tree.issue.summary}`);
  lines.push(`Depth: ${depth} levels, ${totalItems} items`);
  lines.push('Source: GraphQL hierarchy (computed rollups)');
  if (truncated) {
    lines.push('⚠️ Truncated — consider analyzing a narrower subtree');
  }
  lines.push('');

  switch (mode) {
    case 'gaps':
      renderGaps(tree, lines, rollups, rollupResult);
      break;
    case 'timeline':
      renderTimeline(tree, lines);
      break;
    default:
      renderSummaryBlock(tree, lines, rollups, rollupResult);
      lines.push('');
      renderRollupTree(tree, lines, rollups, '', true);
      break;
  }

  return lines.join('\n');
}

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

function renderGaps(
  tree: GraphTreeNode,
  lines: string[],
  rollups: string[],
  rollupResult: RollupResult,
): void {
  lines.push('## Gaps and Conflicts\n');

  const gaps: string[] = [];

  // Conflicts from rollup computation
  for (const c of rollupResult.conflicts) {
    gaps.push(`- **${c.issueKey}**: ${c.message}`);
  }

  // Additional gap detection
  walkTree(tree, (node) => {
    if (node.children.length === 0) return;

    if (rollups.includes('dates')) {
      const undated = node.children.filter(c =>
        !c.issue.startDate && !c.issue.dueDate
      );
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
      const unassigned = node.children.filter(c =>
        !c.issue.assignee && !c.issue.isResolved
      );
      if (unassigned.length > 0) {
        gaps.push(`- **${node.issue.key}**: ${unassigned.length} active children unassigned`);
      }
    }
  });

  if (gaps.length === 0) {
    lines.push('No gaps or conflicts detected.');
  } else {
    // Deduplicate (conflicts may overlap with gap detection)
    const unique = [...new Set(gaps)];
    lines.push(...unique);
  }
}

function renderTimeline(tree: GraphTreeNode, lines: string[]): void {
  lines.push('## Timeline\n');

  const items: Array<{ key: string; title: string; start: string | null; due: string | null; depth: number; resolved: boolean }> = [];
  function collect(node: GraphTreeNode, depth: number) {
    items.push({
      key: node.issue.key,
      title: node.issue.summary,
      start: node.issue.startDate,
      due: node.issue.dueDate,
      depth,
      resolved: node.issue.isResolved,
    });
    for (const child of node.children) {
      collect(child, depth + 1);
    }
  }
  collect(tree, 0);

  // Sort by start date (nulls last), then by due date
  items.sort((a, b) => {
    const aDate = a.start ?? a.due ?? 'z';
    const bDate = b.start ?? b.due ?? 'z';
    return aDate.localeCompare(bDate);
  });

  lines.push('| Item | Start | Due | Status |');
  lines.push('|------|-------|-----|--------|');
  for (const item of items) {
    const indent = '  '.repeat(item.depth);
    const status = item.resolved ? '✓' : '';
    lines.push(`| ${indent}${item.key}: ${item.title} | ${item.start ?? '—'} | ${item.due ?? '—'} | ${status} |`);
  }
}
