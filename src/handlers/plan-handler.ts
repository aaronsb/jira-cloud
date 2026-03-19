import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import type { GraphObjectCache } from '../client/graph-object-cache.js';
import type { GraphQLClient } from '../client/graphql-client.js';
import { GraphQLHierarchyWalker, collectLeaves, computeDepth, walkTree } from '../client/graphql-hierarchy.js';
import type { JiraClient } from '../client/jira-client.js';
import type { GraphTreeNode, RollupResult } from '../types/index.js';
import { planNextSteps } from '../utils/next-steps.js';
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
  const focus = args.focus as string | undefined;

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
      const output = mode === 'gaps'
        ? renderGapsSummary(cached.tree, rollups)
        : renderOverview(cached.tree, issueKey, cached.itemCount, rollups);

      return {
        content: [{
          type: 'text',
          text: staleNote + output + planNextSteps(issueKey, mode, GraphQLHierarchyWalker.computeRollups(cached.tree).conflicts, GraphQLHierarchyWalker.computeRollups(cached.tree)),
        }],
      };
    }
  }

  // Fallback: no cache, walk synchronously with original limits
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
): string {
  const lines: string[] = [];
  const depth = computeDepth(tree);
  const rollupResult = GraphQLHierarchyWalker.computeRollups(tree);

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
): string {
  const lines: string[] = [];
  const rollupResult = GraphQLHierarchyWalker.computeRollups(tree);

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
