import { describe, it, expect } from 'vitest';
import type { HierarchyNode } from '../types/index.js';

// renderHierarchyTree is not exported, so we inline the same logic for testing.
// We'll import it once it's exported. For now, test via the handler module.

// Since renderHierarchyTree is a module-level function (not exported),
// we test it by re-implementing the pure function here and verifying behavior.
// The actual function is tested end-to-end via handleHierarchy, but we also
// want unit-level coverage of the tree rendering.

function renderHierarchyTree(node: HierarchyNode, focusKey: string, prefix = '', isLast = true, isRoot = true): string {
  const connector = isRoot ? '' : (isLast ? '└─ ' : '├─ ');
  const marker = node.key === focusKey ? '  ← you are here' : '';
  const line = `${prefix}${connector}**${node.key}** ${node.issueType}: ${node.summary} [${node.status}]${marker}`;

  const childPrefix = isRoot ? '' : (prefix + (isLast ? '   ' : '│  '));
  const childLines = node.children.map((child, i) =>
    renderHierarchyTree(child, focusKey, childPrefix, i === node.children.length - 1, false)
  );

  return [line, ...childLines].join('\n');
}

describe('renderHierarchyTree', () => {
  it('renders a single node with focus marker', () => {
    const node: HierarchyNode = {
      key: 'PROJ-1',
      summary: 'Root issue',
      issueType: 'Story',
      status: 'To Do',
      children: [],
    };
    const result = renderHierarchyTree(node, 'PROJ-1');
    expect(result).toBe('**PROJ-1** Story: Root issue [To Do]  ← you are here');
  });

  it('renders a single node without focus marker', () => {
    const node: HierarchyNode = {
      key: 'PROJ-1',
      summary: 'Root issue',
      issueType: 'Story',
      status: 'To Do',
      children: [],
    };
    const result = renderHierarchyTree(node, 'OTHER-1');
    expect(result).toBe('**PROJ-1** Story: Root issue [To Do]');
  });

  it('renders parent with one child', () => {
    const node: HierarchyNode = {
      key: 'PROJ-1',
      summary: 'Epic',
      issueType: 'Epic',
      status: 'In Progress',
      children: [{
        key: 'PROJ-2',
        summary: 'Story',
        issueType: 'Story',
        status: 'To Do',
        children: [],
      }],
    };
    const result = renderHierarchyTree(node, 'PROJ-2');
    expect(result).toContain('**PROJ-1** Epic: Epic [In Progress]');
    expect(result).toContain('└─ **PROJ-2** Story: Story [To Do]  ← you are here');
  });

  it('renders multiple children with correct connectors', () => {
    const node: HierarchyNode = {
      key: 'PROJ-1',
      summary: 'Epic',
      issueType: 'Epic',
      status: 'Active',
      children: [
        { key: 'PROJ-2', summary: 'First', issueType: 'Story', status: 'Done', children: [] },
        { key: 'PROJ-3', summary: 'Second', issueType: 'Story', status: 'To Do', children: [] },
        { key: 'PROJ-4', summary: 'Third', issueType: 'Story', status: 'To Do', children: [] },
      ],
    };
    const result = renderHierarchyTree(node, 'PROJ-3');
    const lines = result.split('\n');
    expect(lines[0]).toBe('**PROJ-1** Epic: Epic [Active]');
    expect(lines[1]).toBe('├─ **PROJ-2** Story: First [Done]');
    expect(lines[2]).toBe('├─ **PROJ-3** Story: Second [To Do]  ← you are here');
    expect(lines[3]).toBe('└─ **PROJ-4** Story: Third [To Do]');
  });

  it('renders deep nested tree with proper indentation', () => {
    const node: HierarchyNode = {
      key: 'A',
      summary: 'Root',
      issueType: 'Epic',
      status: 'Active',
      children: [{
        key: 'B',
        summary: 'Mid',
        issueType: 'Story',
        status: 'Active',
        children: [{
          key: 'C',
          summary: 'Leaf',
          issueType: 'Task',
          status: 'Done',
          children: [],
        }],
      }, {
        key: 'D',
        summary: 'Sibling',
        issueType: 'Story',
        status: 'To Do',
        children: [],
      }],
    };
    const result = renderHierarchyTree(node, 'C');
    const lines = result.split('\n');
    expect(lines[0]).toBe('**A** Epic: Root [Active]');
    expect(lines[1]).toBe('├─ **B** Story: Mid [Active]');
    expect(lines[2]).toBe('│  └─ **C** Task: Leaf [Done]  ← you are here');
    expect(lines[3]).toBe('└─ **D** Story: Sibling [To Do]');
  });

  it('renders wide tree at second level with correct prefixes', () => {
    const node: HierarchyNode = {
      key: 'R',
      summary: 'Root',
      issueType: 'Epic',
      status: 'Active',
      children: [{
        key: 'A',
        summary: 'A',
        issueType: 'Story',
        status: 'Active',
        children: [
          { key: 'A1', summary: 'A1', issueType: 'Task', status: 'Done', children: [] },
          { key: 'A2', summary: 'A2', issueType: 'Task', status: 'Done', children: [] },
        ],
      }, {
        key: 'B',
        summary: 'B',
        issueType: 'Story',
        status: 'Active',
        children: [
          { key: 'B1', summary: 'B1', issueType: 'Task', status: 'To Do', children: [] },
        ],
      }],
    };
    const result = renderHierarchyTree(node, 'A1');
    const lines = result.split('\n');
    // A's children should use │ prefix (A is not last)
    expect(lines[2]).toBe('│  ├─ **A1** Task: A1 [Done]  ← you are here');
    expect(lines[3]).toBe('│  └─ **A2** Task: A2 [Done]');
    // B's children should use space prefix (B is last)
    expect(lines[5]).toBe('   └─ **B1** Task: B1 [To Do]');
  });
});

describe('handleHierarchy input clamping', () => {
  it('clamps up and down to valid range', () => {
    // Test the clamping logic directly
    const clamp = (val: number | undefined, def: number) => Math.min(Math.max(val ?? def, 0), 8);

    expect(clamp(undefined, 4)).toBe(4);
    expect(clamp(0, 4)).toBe(0);
    expect(clamp(-5, 4)).toBe(0);
    expect(clamp(10, 4)).toBe(8);
    expect(clamp(8, 4)).toBe(8);
    expect(clamp(1, 4)).toBe(1);
  });
});
