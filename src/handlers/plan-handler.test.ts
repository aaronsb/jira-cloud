import { describe, it, expect } from 'vitest';
import type { GraphIssue, GraphTreeNode } from '../types/index.js';
import { GraphQLHierarchyWalker, collectLeaves, computeDepth } from '../client/graphql-hierarchy.js';
import { renderRollupTree } from './plan-handler.js';

function makeIssue(overrides: Partial<GraphIssue> = {}): GraphIssue {
  return {
    key: 'PROJ-1',
    summary: 'Test Issue',
    issueType: 'Story',
    hierarchyLevel: 1,
    status: 'In Progress',
    statusCategory: 'In Progress',
    assignee: null,
    startDate: null,
    dueDate: null,
    storyPoints: null,
    isResolved: false,
    hasChildIssues: false,
    parentKey: null,
    ...overrides,
  };
}

function makeNode(issue?: Partial<GraphIssue>, children: GraphTreeNode[] = []): GraphTreeNode {
  return {
    issue: makeIssue(issue),
    children,
  };
}

describe('collectLeaves', () => {
  it('returns the node itself if no children', () => {
    const node = makeNode({ key: 'A' });
    expect(collectLeaves(node).map(l => l.key)).toEqual(['A']);
  });

  it('returns only leaf nodes', () => {
    const tree = makeNode({ key: 'ROOT' }, [
      makeNode({ key: 'A' }),
      makeNode({ key: 'B' }, [
        makeNode({ key: 'C' }),
        makeNode({ key: 'D' }),
      ]),
    ]);
    expect(collectLeaves(tree).map(l => l.key)).toEqual(['A', 'C', 'D']);
  });
});

describe('computeDepth', () => {
  it('returns 1 for leaf', () => {
    expect(computeDepth(makeNode())).toBe(1);
  });

  it('returns correct depth for nested tree', () => {
    const tree = makeNode({}, [
      makeNode({}, [makeNode({}, [makeNode()])]),
    ]);
    expect(computeDepth(tree)).toBe(4);
  });
});

describe('computeRollups', () => {
  it('rolls up dates from leaves', () => {
    const tree = makeNode({ key: 'ROOT' }, [
      makeNode({ key: 'A', startDate: '2026-02-01', dueDate: '2026-03-15' }),
      makeNode({ key: 'B', startDate: '2026-01-15', dueDate: '2026-04-01' }),
      makeNode({ key: 'C', startDate: '2026-03-01', dueDate: '2026-03-31' }),
    ]);
    const result = GraphQLHierarchyWalker.computeRollups(tree);
    expect(result.rolledUpStart).toBe('2026-01-15');
    expect(result.rolledUpEnd).toBe('2026-04-01');
  });

  it('computes progress from leaves', () => {
    const tree = makeNode({ key: 'ROOT' }, [
      makeNode({ key: 'A', isResolved: true }),
      makeNode({ key: 'B', isResolved: false }),
      makeNode({ key: 'C', isResolved: true }),
      makeNode({ key: 'D', isResolved: false }),
    ]);
    const result = GraphQLHierarchyWalker.computeRollups(tree);
    expect(result.resolvedItems).toBe(2);
    expect(result.progressPct).toBe(50);
  });

  it('sums points from leaves', () => {
    const tree = makeNode({ key: 'ROOT' }, [
      makeNode({ key: 'A', storyPoints: 5, isResolved: true }),
      makeNode({ key: 'B', storyPoints: 8, isResolved: false }),
      makeNode({ key: 'C', storyPoints: 3, isResolved: true }),
    ]);
    const result = GraphQLHierarchyWalker.computeRollups(tree);
    expect(result.totalPoints).toBe(16);
    expect(result.earnedPoints).toBe(8);
  });

  it('collects unique assignees', () => {
    const tree = makeNode({ key: 'ROOT' }, [
      makeNode({ key: 'A', assignee: 'alice' }),
      makeNode({ key: 'B', assignee: 'bob' }),
      makeNode({ key: 'C', assignee: 'alice' }),
      makeNode({ key: 'D', assignee: null }),
    ]);
    const result = GraphQLHierarchyWalker.computeRollups(tree);
    expect(result.assignees).toEqual(['alice', 'bob']);
    expect(result.unassignedCount).toBe(2); // ROOT and D are unassigned and not resolved
  });

  it('detects due date conflict', () => {
    const tree = makeNode({ key: 'ROOT', dueDate: '2026-03-31' }, [
      makeNode({ key: 'A', dueDate: '2026-04-15' }),
      makeNode({ key: 'B', dueDate: '2026-03-20' }),
    ]);
    const result = GraphQLHierarchyWalker.computeRollups(tree);
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0].type).toBe('due_date');
    expect(result.conflicts[0].issueKey).toBe('ROOT');
  });

  it('detects resolved parent with open children', () => {
    const tree = makeNode({ key: 'ROOT', isResolved: true }, [
      makeNode({ key: 'A', isResolved: true }),
      makeNode({ key: 'B', isResolved: false }),
    ]);
    const result = GraphQLHierarchyWalker.computeRollups(tree);
    expect(result.conflicts.some(c => c.type === 'resolved_with_open_children')).toBe(true);
  });

  it('handles tree with no dates', () => {
    const tree = makeNode({ key: 'ROOT' }, [
      makeNode({ key: 'A' }),
      makeNode({ key: 'B' }),
    ]);
    const result = GraphQLHierarchyWalker.computeRollups(tree);
    expect(result.rolledUpStart).toBeNull();
    expect(result.rolledUpEnd).toBeNull();
  });
});

describe('renderRollupTree', () => {
  it('renders a single node with status icon', () => {
    const node = makeNode({ key: 'PROJ-1', summary: 'Root', statusCategory: 'In Progress' });
    const lines: string[] = [];
    renderRollupTree(node, lines, [], '', true);
    expect(lines[0]).toContain('●');
    expect(lines[0]).toContain('PROJ-1');
  });

  it('renders done items with checkmark', () => {
    const node = makeNode({ key: 'PROJ-1', summary: 'Done', statusCategory: 'Done' });
    const lines: string[] = [];
    renderRollupTree(node, lines, [], '', true);
    expect(lines[0]).toContain('✓');
  });

  it('renders children', () => {
    const tree = makeNode({ key: 'ROOT', summary: 'Parent' }, [
      makeNode({ key: 'A', summary: 'Child A' }),
      makeNode({ key: 'B', summary: 'Child B' }),
    ]);
    const lines: string[] = [];
    renderRollupTree(tree, lines, [], '', true);
    expect(lines.some(l => l.includes('Child A'))).toBe(true);
    expect(lines.some(l => l.includes('Child B'))).toBe(true);
  });
});
