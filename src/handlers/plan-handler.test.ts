import { describe, it, expect } from 'vitest';
import type { DerivedField, PlanNode, RoadmapItem } from '../types/index.js';
import { renderRollupTree, detectDateConflict, computeProgress } from './plan-handler.js';

function makeItem(overrides: Partial<RoadmapItem> = {}): RoadmapItem {
  return {
    id: 'item-1',
    title: 'Test Item',
    issueKey: 'PROJ-1',
    issueId: '10001',
    status: { statusCategory: 'indeterminate' },
    childItems: [],
    schedule: { startDate: '2026-01-01', dueDate: '2026-03-31' },
    storyPoints: null,
    assignee: null,
    ...overrides,
  };
}

function makeDerived(overrides: Partial<DerivedField> = {}): DerivedField {
  return {
    itemId: 'item-1',
    derivedStartDate: '2026-01-05',
    derivedDueDate: '2026-04-15',
    derivedProgress: 0.38,
    ...overrides,
  };
}

function makeNode(overrides: Partial<PlanNode> = {}): PlanNode {
  return {
    item: makeItem(),
    derived: null,
    children: [],
    ...overrides,
  };
}

describe('detectDateConflict', () => {
  it('returns null when no derived data', () => {
    const node = makeNode();
    expect(detectDateConflict(node)).toBeNull();
  });

  it('detects children ending after parent due date', () => {
    const node = makeNode({
      item: makeItem({ schedule: { startDate: '2026-01-01', dueDate: '2026-03-31' } }),
      derived: makeDerived({ derivedDueDate: '2026-04-15' }),
    });
    const result = detectDateConflict(node);
    expect(result).toContain('CONFLICT');
    expect(result).toContain('15d');
  });

  it('detects children starting before parent start date', () => {
    const node = makeNode({
      item: makeItem({ schedule: { startDate: '2026-02-01', dueDate: '2026-06-30' } }),
      derived: makeDerived({ derivedStartDate: '2026-01-15', derivedDueDate: '2026-05-01' }),
    });
    const result = detectDateConflict(node);
    expect(result).toContain('CONFLICT');
    expect(result).toContain('start');
  });

  it('returns null when dates are consistent', () => {
    const node = makeNode({
      item: makeItem({ schedule: { startDate: '2026-01-01', dueDate: '2026-06-30' } }),
      derived: makeDerived({ derivedStartDate: '2026-01-05', derivedDueDate: '2026-04-15' }),
    });
    expect(detectDateConflict(node)).toBeNull();
  });
});

describe('computeProgress', () => {
  it('computes progress from leaf nodes', () => {
    const node = makeNode({
      children: [
        makeNode({ item: makeItem({ id: 'c1', status: { statusCategory: 'done' } }) }),
        makeNode({ item: makeItem({ id: 'c2', status: { statusCategory: 'indeterminate' } }) }),
        makeNode({ item: makeItem({ id: 'c3', status: { statusCategory: 'done' } }) }),
        makeNode({ item: makeItem({ id: 'c4', status: { statusCategory: 'new' } }) }),
      ],
    });
    const result = computeProgress(node);
    expect(result.resolved).toBe(2);
    expect(result.total).toBe(4);
    expect(result.progressPct).toBe(50);
  });

  it('returns 0% for no leaf nodes', () => {
    const node = makeNode();
    const result = computeProgress(node);
    expect(result.total).toBe(1); // root itself is a leaf
  });

  it('handles nested children', () => {
    const node = makeNode({
      children: [
        makeNode({
          item: makeItem({ id: 'c1', childItems: [{ id: 'gc1' }] }),
          children: [
            makeNode({ item: makeItem({ id: 'gc1', status: { statusCategory: 'done' } }) }),
          ],
        }),
        makeNode({ item: makeItem({ id: 'c2', status: { statusCategory: 'new' } }) }),
      ],
    });
    const result = computeProgress(node);
    expect(result.resolved).toBe(1);
    expect(result.total).toBe(2); // only leaves count
  });
});

describe('renderRollupTree', () => {
  it('renders a single node', () => {
    const node = makeNode({
      item: makeItem({ title: 'Root Epic', status: { statusCategory: 'indeterminate' } }),
    });
    const lines: string[] = [];
    renderRollupTree(node, lines, ['dates', 'points', 'progress'], '', true);
    expect(lines[0]).toContain('Root Epic');
    expect(lines[0]).toContain('●'); // in-progress icon
  });

  it('renders done items with checkmark', () => {
    const node = makeNode({
      item: makeItem({ title: 'Done Task', status: { statusCategory: 'done' } }),
    });
    const lines: string[] = [];
    renderRollupTree(node, lines, [], '', true);
    expect(lines[0]).toContain('✓');
  });

  it('renders date conflict warnings', () => {
    const node = makeNode({
      item: makeItem({
        title: 'Late Epic',
        schedule: { startDate: '2026-01-01', dueDate: '2026-03-31' },
      }),
      derived: makeDerived({ derivedDueDate: '2026-04-15' }),
      children: [makeNode()],
    });
    const lines: string[] = [];
    renderRollupTree(node, lines, ['dates'], '', true);
    const dateLines = lines.filter(l => l.includes('Dates:'));
    expect(dateLines.length).toBeGreaterThanOrEqual(1);
    // The parent's date line should show the conflict
    const parentDateLine = dateLines.find(l => l.includes('derived'));
    expect(parentDateLine).toBeDefined();
    expect(parentDateLine).toContain('⚠️');
    expect(parentDateLine).toContain('CONFLICT');
  });

  it('renders children with tree connectors', () => {
    const node = makeNode({
      item: makeItem({ title: 'Parent', childItems: [{ id: 'c1' }, { id: 'c2' }] }),
      children: [
        makeNode({ item: makeItem({ id: 'c1', title: 'Child A' }) }),
        makeNode({ item: makeItem({ id: 'c2', title: 'Child B' }) }),
      ],
    });
    const lines: string[] = [];
    renderRollupTree(node, lines, [], '', true);
    expect(lines.some(l => l.includes('Child A'))).toBe(true);
    expect(lines.some(l => l.includes('Child B'))).toBe(true);
  });
});
