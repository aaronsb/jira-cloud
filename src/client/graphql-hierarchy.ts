/**
 * GraphQL hierarchy walker — traverses issue trees via AGG and computes rollups.
 * Reusable module: serves plan analysis, data cube hierarchy, and future tools.
 */
import type { GraphQLClient } from './graphql-client.js';
import type { GraphIssue, GraphTreeNode, RollupConflict, RollupResult } from '../types/index.js';

const ISSUE_SEARCH_QUERY = `
  query SearchChildren($cloudId: ID!, $jql: String!, $first: Int!) {
    jira {
      issueSearch(
        cloudId: $cloudId,
        issueSearchInput: { jql: $jql },
        first: $first
      ) @optIn(to: "JiraSpreadsheetComponent-M1") {
        totalCount
        edges {
          node {
            key
            summary
            issueTypeField { issueType { name hierarchy { level } } }
            statusField { status { name statusCategory { name } } }
            assigneeField { user { name } }
            dueDateField { date }
            startDateField { date }
            storyPointsField { number }
            storyPointEstimateField { number }
            isResolved
            hasChildIssues
            parentIssueField { parentIssue { key } }
          }
        }
      }
    }
  }
`;

const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_ITEMS = 200;
const PAGE_SIZE = 50;
const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/;

/** Map a raw AGG issue node to our clean GraphIssue type */
function mapIssueNode(node: any): GraphIssue {
  return {
    key: node.key,
    summary: node.summary,
    issueType: node.issueTypeField?.issueType?.name ?? 'Unknown',
    hierarchyLevel: node.issueTypeField?.issueType?.hierarchy?.level ?? null,
    status: node.statusField?.status?.name ?? 'Unknown',
    statusCategory: node.statusField?.status?.statusCategory?.name ?? 'unknown',
    assignee: node.assigneeField?.user?.name ?? null,
    startDate: node.startDateField?.date ?? null,
    dueDate: node.dueDateField?.date ?? null,
    storyPoints: node.storyPointsField?.number ?? node.storyPointEstimateField?.number ?? null,
    isResolved: node.isResolved ?? false,
    hasChildIssues: node.hasChildIssues ?? false,
    parentKey: node.parentIssueField?.parentIssue?.key ?? null,
  };
}

export class GraphQLHierarchyWalker {
  private client: GraphQLClient;
  private itemCount = 0;
  private truncated = false;

  constructor(client: GraphQLClient) {
    this.client = client;
  }

  /**
   * Walk down from a root issue key, collecting all descendants.
   * Uses JQL `parent = KEY` at each level for efficient batch fetching.
   */
  async walkDown(
    issueKey: string,
    maxDepth = DEFAULT_MAX_DEPTH,
    maxItems = DEFAULT_MAX_ITEMS,
  ): Promise<{ tree: GraphTreeNode; totalItems: number; truncated: boolean }> {
    this.itemCount = 0;
    this.truncated = false;

    if (!ISSUE_KEY_PATTERN.test(issueKey)) {
      throw new Error(`Invalid issue key format: ${issueKey}`);
    }

    const rootResult = await this.client.query<any>(ISSUE_SEARCH_QUERY, {
      jql: `key = ${issueKey}`,
      first: 1,
    });

    const rootNode = rootResult.data?.jira?.issueSearch?.edges?.[0]?.node;
    if (!rootResult.success || !rootNode) {
      throw new Error(
        rootResult.error
          ? `GraphQL error: ${rootResult.error}`
          : `Issue ${issueKey} not found via GraphQL search`,
      );
    }

    const rootIssue = mapIssueNode(rootNode);
    this.itemCount = 1;

    const tree: GraphTreeNode = {
      issue: rootIssue,
      children: [],
    };

    if (rootIssue.hasChildIssues && maxDepth > 0) {
      await this.fetchChildren(tree, 1, maxDepth, maxItems);
    }

    return {
      tree,
      totalItems: this.itemCount,
      truncated: this.truncated,
    };
  }

  private async fetchChildren(
    parent: GraphTreeNode,
    currentDepth: number,
    maxDepth: number,
    maxItems: number,
  ): Promise<void> {
    if (currentDepth > maxDepth || this.itemCount >= maxItems) {
      this.truncated = true;
      return;
    }

    const jql = `parent = ${parent.issue.key} ORDER BY rank`;
    const remaining = maxItems - this.itemCount;
    const first = Math.min(PAGE_SIZE, remaining);

    const result = await this.client.query<any>(ISSUE_SEARCH_QUERY, {
      jql,
      first,
    });

    if (!result.success || !result.data) return;

    const edges = result.data.jira?.issueSearch?.edges ?? [];
    const totalCount = result.data.jira?.issueSearch?.totalCount ?? 0;

    if (totalCount > first) {
      this.truncated = true;
    }

    for (const edge of edges) {
      if (this.itemCount >= maxItems) {
        this.truncated = true;
        break;
      }

      const issue = mapIssueNode(edge.node);
      this.itemCount++;

      const childNode: GraphTreeNode = { issue, children: [] };
      parent.children.push(childNode);

      if (issue.hasChildIssues && currentDepth < maxDepth) {
        await this.fetchChildren(childNode, currentDepth + 1, maxDepth, maxItems);
      }
    }
  }

  /**
   * Compute rollups bottom-up on a collected tree.
   * Aggregates dates, points, progress, and assignees from leaves upward.
   */
  static computeRollups(tree: GraphTreeNode): RollupResult {
    const leaves = collectLeaves(tree);
    const allNodes: GraphIssue[] = [];
    walkTree(tree, n => allNodes.push(n.issue));

    const conflicts: RollupConflict[] = [];
    detectConflicts(tree, conflicts);

    // Dates: earliest start, latest due across all descendants
    const starts = allNodes
      .map(n => n.startDate)
      .filter((d): d is string => d !== null);
    const dues = allNodes
      .map(n => n.dueDate)
      .filter((d): d is string => d !== null);

    const rolledUpStart = starts.length > 0 ? starts.sort()[0] : null;
    const rolledUpEnd = dues.length > 0 ? dues.sort().reverse()[0] : null;

    // Points
    const totalPoints = leaves.reduce((sum, n) => sum + (n.storyPoints ?? 0), 0);
    const earnedPoints = leaves
      .filter(n => n.isResolved)
      .reduce((sum, n) => sum + (n.storyPoints ?? 0), 0);

    // Progress (leaf-based)
    const resolvedItems = leaves.filter(n => n.isResolved).length;
    const totalItems = leaves.length;
    const progressPct = totalItems > 0 ? Math.round((resolvedItems / totalItems) * 100) : 0;

    // Assignees
    const assigneeSet = new Set<string>();
    let unassignedCount = 0;
    for (const node of allNodes) {
      if (node.assignee) {
        assigneeSet.add(node.assignee);
      } else if (!node.isResolved) {
        unassignedCount++;
      }
    }

    return {
      rolledUpStart,
      rolledUpEnd,
      totalItems: allNodes.length,
      resolvedItems,
      progressPct,
      totalPoints,
      earnedPoints,
      assignees: [...assigneeSet].sort(),
      unassignedCount,
      conflicts,
    };
  }
}

// --- Tree utilities (exported for testing) ---

export function collectLeaves(node: GraphTreeNode): GraphIssue[] {
  if (node.children.length === 0) return [node.issue];
  return node.children.flatMap(collectLeaves);
}

export function walkTree(
  node: GraphTreeNode,
  fn: (node: GraphTreeNode) => void,
): void {
  fn(node);
  for (const child of node.children) {
    walkTree(child, fn);
  }
}

export function computeDepth(node: GraphTreeNode): number {
  if (node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(computeDepth));
}

function detectConflicts(node: GraphTreeNode, conflicts: RollupConflict[]): void {
  if (node.children.length === 0) return;

  // Own due date earlier than latest child due
  if (node.issue.dueDate) {
    const childDues = node.children
      .map(c => c.issue.dueDate)
      .filter((d): d is string => d !== null);
    const latestChild = childDues.sort().reverse()[0];
    if (latestChild && latestChild > node.issue.dueDate) {
      const ownDate = new Date(node.issue.dueDate);
      const childDate = new Date(latestChild);
      const diffDays = Math.ceil((childDate.getTime() - ownDate.getTime()) / (1000 * 60 * 60 * 24));
      conflicts.push({
        issueKey: node.issue.key,
        type: 'due_date',
        message: `Children end ${diffDays}d after parent due date`,
      });
    }
  }

  // Own start date later than earliest child start
  if (node.issue.startDate) {
    const childStarts = node.children
      .map(c => c.issue.startDate)
      .filter((d): d is string => d !== null);
    const earliestChild = childStarts.sort()[0];
    if (earliestChild && earliestChild < node.issue.startDate) {
      conflicts.push({
        issueKey: node.issue.key,
        type: 'start_date',
        message: 'Children start before parent start date',
      });
    }
  }

  // Resolved parent with open children
  if (node.issue.isResolved) {
    const openChildren = node.children.filter(c => !c.issue.isResolved);
    if (openChildren.length > 0) {
      conflicts.push({
        issueKey: node.issue.key,
        type: 'resolved_with_open_children',
        message: `Resolved but has ${openChildren.length} open children`,
      });
    }
  }

  // Recurse
  for (const child of node.children) {
    detectConflicts(child, conflicts);
  }
}
