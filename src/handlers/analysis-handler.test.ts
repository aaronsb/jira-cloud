import { describe, it, expect } from 'vitest';
import { renderPoints, renderTime, renderSchedule, renderCycle, renderDistribution, renderSummaryTable, extractProjectKeys, removeProjectClause, extractDimensions, renderCubeSetup } from './analysis-handler.js';
import { JiraIssueDetails } from '../types/index.js';

// ── Test Helpers ───────────────────────────────────────────────────────

function makeIssue(overrides: Partial<JiraIssueDetails> = {}): JiraIssueDetails {
  return {
    key: 'TEST-1',
    summary: 'Test issue',
    description: '',
    issueType: 'Story',
    priority: 'Medium',
    parent: null,
    assignee: 'Alice',
    reporter: 'Bob',
    status: 'To Do',
    statusCategory: 'new',
    resolution: null,
    labels: [],
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-02T00:00:00.000Z',
    resolutionDate: null,
    dueDate: null,
    startDate: null,
    storyPoints: null,
    timeEstimate: null,
    issueLinks: [],
    ...overrides,
  };
}

// ── Points ─────────────────────────────────────────────────────────────

describe('renderPoints', () => {
  it('computes SPI from story points by status category', () => {
    const issues = [
      makeIssue({ key: 'A-1', storyPoints: 5, statusCategory: 'done' }),
      makeIssue({ key: 'A-2', storyPoints: 3, statusCategory: 'indeterminate' }),
      makeIssue({ key: 'A-3', storyPoints: 2, statusCategory: 'new' }),
    ];
    const output = renderPoints(issues);
    expect(output).toContain('| Planned Value (PV) | 10 pts |');
    expect(output).toContain('| Earned Value (EV) | 5 pts |');
    expect(output).toContain('| Remaining | 5 pts |');
    expect(output).toContain('| SPI | 0.50 |');
  });

  it('shows N/A when no issues have story points', () => {
    const issues = [makeIssue(), makeIssue({ key: 'A-2' })];
    const output = renderPoints(issues);
    expect(output).toContain('N/A (no estimates)');
    expect(output).toContain('| Unestimated | 2 issues |');
  });

  it('shows SPI 1.00 when all points are done', () => {
    const issues = [
      makeIssue({ storyPoints: 8, statusCategory: 'done' }),
    ];
    const output = renderPoints(issues);
    expect(output).toContain('| SPI | 1.00 |');
  });

  it('breaks down points by status bucket', () => {
    const issues = [
      makeIssue({ storyPoints: 3, statusCategory: 'new' }),
      makeIssue({ storyPoints: 5, statusCategory: 'indeterminate' }),
      makeIssue({ storyPoints: 2, statusCategory: 'done' }),
    ];
    const output = renderPoints(issues);
    expect(output).toContain('To Do: 3 pts');
    expect(output).toContain('In Progress: 5 pts');
    expect(output).toContain('Done: 2 pts');
  });
});

// ── Time ───────────────────────────────────────────────────────────────

describe('renderTime', () => {
  it('sums time estimates by status bucket', () => {
    const issues = [
      makeIssue({ timeEstimate: 3600, statusCategory: 'done' }),      // 1h
      makeIssue({ timeEstimate: 7200, statusCategory: 'new' }),       // 2h
      makeIssue({ timeEstimate: 1800, statusCategory: 'indeterminate' }), // 30m
    ];
    const output = renderTime(issues);
    expect(output).toContain('| Original Estimate | 3h 30m |');
    expect(output).toContain('| Completed | 1h |');
    expect(output).toContain('| Remaining | 2h 30m |');
  });

  it('counts unestimated issues', () => {
    const issues = [
      makeIssue({ timeEstimate: 3600 }),
      makeIssue(),
      makeIssue(),
    ];
    const output = renderTime(issues);
    expect(output).toContain('| Unestimated | 2 issues |');
  });

  it('formats large durations as days', () => {
    const issues = [
      makeIssue({ timeEstimate: 8 * 3600 * 3, statusCategory: 'new' }), // 3 work days
    ];
    const output = renderTime(issues);
    expect(output).toContain('3d');
  });
});

// ── Schedule ───────────────────────────────────────────────────────────

describe('renderSchedule', () => {
  const now = new Date(2026, 2, 6); // Mar 6, 2026

  it('detects overdue issues', () => {
    const issues = [
      makeIssue({ key: 'OD-1', dueDate: '2026-03-01' }),
      makeIssue({ key: 'OD-2', dueDate: '2026-03-04' }),
      makeIssue({ key: 'OK-1', dueDate: '2026-03-10' }),
    ];
    const output = renderSchedule(issues, now);
    expect(output).toContain('**Overdue:** 2 issues');
    expect(output).toContain('OD-1');
    expect(output).toContain('OD-2');
  });

  it('does not count resolved issues as overdue', () => {
    const issues = [
      makeIssue({ dueDate: '2026-03-01', resolutionDate: '2026-03-02' }),
    ];
    const output = renderSchedule(issues, now);
    expect(output).toContain('**Overdue:** none');
  });

  it('shows date window from earliest start to latest due', () => {
    const issues = [
      makeIssue({ startDate: '2026-02-01', dueDate: '2026-03-15' }),
      makeIssue({ startDate: '2026-02-10', dueDate: '2026-03-01' }),
    ];
    const output = renderSchedule(issues, now);
    expect(output).toContain('Feb 1, 2026');
    expect(output).toContain('Mar 15, 2026');
  });

  it('detects concentration risk', () => {
    const issues = [
      makeIssue({ key: 'C-1', dueDate: '2026-03-10' }),
      makeIssue({ key: 'C-2', dueDate: '2026-03-10' }),
      makeIssue({ key: 'C-3', dueDate: '2026-03-10' }),
    ];
    const output = renderSchedule(issues, now);
    expect(output).toContain('**Concentration:');
    expect(output).toContain('3 issues');
  });

  it('counts issues with no due date', () => {
    const issues = [
      makeIssue({ dueDate: null }),
      makeIssue({ dueDate: null }),
      makeIssue({ dueDate: '2026-03-10' }),
    ];
    const output = renderSchedule(issues, now);
    expect(output).toContain('**No due date:** 2 issues');
  });

  it('handles all dates missing gracefully', () => {
    const issues = [makeIssue(), makeIssue()];
    const output = renderSchedule(issues, now);
    expect(output).not.toContain('**Window:**');
    expect(output).toContain('**Overdue:** none');
  });
});

// ── Cycle ──────────────────────────────────────────────────────────────

describe('renderCycle', () => {
  const now = new Date(2026, 2, 6); // Mar 6, 2026

  it('computes lead time median and mean', () => {
    const issues = [
      makeIssue({ created: '2026-02-01T00:00:00.000Z', resolutionDate: '2026-02-04T00:00:00.000Z' }), // 3 days
      makeIssue({ created: '2026-02-01T00:00:00.000Z', resolutionDate: '2026-02-08T00:00:00.000Z' }), // 7 days
      makeIssue({ created: '2026-02-01T00:00:00.000Z', resolutionDate: '2026-02-11T00:00:00.000Z' }), // 10 days
    ];
    const output = renderCycle(issues, now);
    expect(output).toContain('median 7.0 days');
    // mean = (3+7+10)/3 = 6.67
    expect(output).toContain('mean 6.7 days');
    expect(output).toContain('3 issues');
  });

  it('computes throughput', () => {
    const issues = [
      makeIssue({ created: '2026-02-01T00:00:00.000Z', resolutionDate: '2026-02-08T00:00:00.000Z' }),
      makeIssue({ created: '2026-02-01T00:00:00.000Z', resolutionDate: '2026-02-15T00:00:00.000Z' }),
    ];
    const output = renderCycle(issues, now);
    expect(output).toContain('issues/week');
  });

  it('shows oldest open issues', () => {
    const issues = [
      makeIssue({ key: 'OLD-1', created: '2026-01-01T00:00:00.000Z' }),
      makeIssue({ key: 'OLD-2', created: '2026-02-01T00:00:00.000Z' }),
    ];
    const output = renderCycle(issues, now);
    expect(output).toContain('OLD-1');
    expect(output).toContain('OLD-2');
    // OLD-1 should be listed first (older)
    expect(output.indexOf('OLD-1')).toBeLessThan(output.indexOf('OLD-2'));
  });

  it('handles no resolved issues', () => {
    const issues = [makeIssue()];
    const output = renderCycle(issues, now);
    expect(output).toContain('no resolved issues');
  });
});

// ── Distribution ───────────────────────────────────────────────────────

describe('renderDistribution', () => {
  it('groups by status, assignee, priority, type', () => {
    const issues = [
      makeIssue({ status: 'To Do', assignee: 'Alice', priority: 'High', issueType: 'Story' }),
      makeIssue({ status: 'To Do', assignee: 'Alice', priority: 'Medium', issueType: 'Story' }),
      makeIssue({ status: 'Done', assignee: 'Bob', priority: 'High', issueType: 'Bug' }),
    ];
    const output = renderDistribution(issues);
    expect(output).toContain('To Do: 2');
    expect(output).toContain('Done: 1');
    expect(output).toContain('Alice: 2');
    expect(output).toContain('Bob: 1');
    expect(output).toContain('High: 2');
    expect(output).toContain('Medium: 1');
    expect(output).toContain('Story: 2');
    expect(output).toContain('Bug: 1');
  });

  it('shows Unassigned for null assignees', () => {
    const issues = [makeIssue({ assignee: null })];
    const output = renderDistribution(issues);
    expect(output).toContain('Unassigned: 1');
  });
});

// ── Edge Cases ─────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('renders points for a single issue', () => {
    const issues = [makeIssue({ storyPoints: 5, statusCategory: 'new' })];
    const output = renderPoints(issues);
    expect(output).toContain('| Planned Value (PV) | 5 pts |');
    expect(output).toContain('| SPI | 0.00 |');
  });

  it('renders schedule with a single overdue issue', () => {
    const now = new Date(2026, 2, 6);
    const issues = [makeIssue({ key: 'LATE-1', dueDate: '2026-03-01' })];
    const output = renderSchedule(issues, now);
    expect(output).toContain('**Overdue:** 1 issue,');
    expect(output).toContain('LATE-1');
  });
});

// ── Summary Table Tests ───────────────────────────────────────────────

describe('renderSummaryTable', () => {
  it('renders a single row', () => {
    const output = renderSummaryTable([
      { label: 'AA', total: 623, unresolved: 500, overdue: 85, highPriority: 1, createdRecently: 12, resolvedRecently: 8 },
    ]);
    expect(output).toContain('## Summary (exact counts)');
    expect(output).toContain('| AA | 623 | 500 | 85 | 1 | 12 | 8 |');
    expect(output).not.toContain('**Total**');
  });

  it('renders multiple rows with totals', () => {
    const output = renderSummaryTable([
      { label: 'AA', total: 600, unresolved: 500, overdue: 80, highPriority: 1, createdRecently: 10, resolvedRecently: 5 },
      { label: 'LGS', total: 400, unresolved: 300, overdue: 30, highPriority: 47, createdRecently: 5, resolvedRecently: 3 },
    ]);
    expect(output).toContain('| AA |');
    expect(output).toContain('| LGS |');
    expect(output).toContain('| **Total** | **1000** | **800** | **110** | **48** | **15** | **8** |');
  });

  it('handles zero counts', () => {
    const output = renderSummaryTable([
      { label: 'EMPTY', total: 0, unresolved: 0, overdue: 0, highPriority: 0, createdRecently: 0, resolvedRecently: 0 },
    ]);
    expect(output).toContain('| EMPTY | 0 | 0 | 0 | 0 | 0 | 0 |');
  });
});

// ── JQL Parsing Tests ─────────────────────────────────────────────────

describe('extractProjectKeys', () => {
  it('extracts keys from project in (...)', () => {
    expect(extractProjectKeys('project in (AA, GC, GD)')).toEqual(['AA', 'GC', 'GD']);
  });

  it('extracts single key from project = X', () => {
    expect(extractProjectKeys('project = AA')).toEqual(['AA']);
  });

  it('handles quoted keys', () => {
    expect(extractProjectKeys('project in ("AA", \'GC\')')).toEqual(['AA', 'GC']);
  });

  it('extracts keys with additional JQL clauses', () => {
    expect(extractProjectKeys('project in (AA, GC) AND status = Open')).toEqual(['AA', 'GC']);
  });

  it('returns empty array when no project clause', () => {
    expect(extractProjectKeys('assignee = currentUser()')).toEqual([]);
  });
});

describe('removeProjectClause', () => {
  it('removes project in (...) and trailing AND', () => {
    expect(removeProjectClause('project in (AA, GC) AND resolution = Unresolved'))
      .toBe('resolution = Unresolved');
  });

  it('removes project = X and trailing AND', () => {
    expect(removeProjectClause('project = AA AND status = Open'))
      .toBe('status = Open');
  });

  it('returns empty string when only project clause', () => {
    expect(removeProjectClause('project in (AA, GC)')).toBe('');
  });

  it('preserves complex remaining JQL', () => {
    expect(removeProjectClause('project in (AA) AND resolution = Unresolved AND priority = High'))
      .toBe('resolution = Unresolved AND priority = High');
  });
});

// ── Cube Setup Tests ─────────────────────────────────────────────────

describe('extractDimensions', () => {
  it('extracts project from issue key prefix', () => {
    const issues = [
      makeIssue({ key: 'AA-1' }),
      makeIssue({ key: 'AA-2' }),
      makeIssue({ key: 'GC-1' }),
    ];
    const dims = extractDimensions(issues);
    const project = dims.find(d => d.name === 'project')!;
    expect(project.values).toEqual(['AA', 'GC']);
    expect(project.count).toBe(2);
  });

  it('extracts all five dimensions', () => {
    const issues = [
      makeIssue({ key: 'AA-1', status: 'Backlog', assignee: 'Alice', priority: 'High', issueType: 'Story' }),
    ];
    const dims = extractDimensions(issues);
    expect(dims.map(d => d.name)).toEqual(['project', 'status', 'assignee', 'priority', 'issuetype']);
  });

  it('sorts values by count descending', () => {
    const issues = [
      makeIssue({ key: 'AA-1', priority: 'Low' }),
      makeIssue({ key: 'AA-2', priority: 'High' }),
      makeIssue({ key: 'AA-3', priority: 'High' }),
      makeIssue({ key: 'AA-4', priority: 'High' }),
      makeIssue({ key: 'AA-5', priority: 'Low' }),
    ];
    const dims = extractDimensions(issues);
    const priority = dims.find(d => d.name === 'priority')!;
    expect(priority.values[0]).toBe('High');
    expect(priority.values[1]).toBe('Low');
  });

  it('uses Unassigned for null assignee', () => {
    const issues = [makeIssue({ assignee: null })];
    const dims = extractDimensions(issues);
    const assignee = dims.find(d => d.name === 'assignee')!;
    expect(assignee.values).toEqual(['Unassigned']);
  });

  it('caps values at 20 groups', () => {
    // Create 25 distinct statuses
    const issues = Array.from({ length: 25 }, (_, i) =>
      makeIssue({ key: `T-${i + 1}`, status: `Status${i}` })
    );
    const dims = extractDimensions(issues);
    const status = dims.find(d => d.name === 'status')!;
    expect(status.values.length).toBe(20);
    expect(status.count).toBe(25);
  });
});

describe('renderCubeSetup', () => {
  it('renders dimension table with counts', () => {
    const dims = [
      { name: 'project', values: ['AA', 'GC'], count: 2 },
      { name: 'status', values: ['Backlog', 'In Progress'], count: 2 },
    ];
    const output = renderCubeSetup('project in (AA, GC)', 50, dims);
    expect(output).toContain('# Cube Setup:');
    expect(output).toContain('Sampled 50 issues');
    expect(output).toContain('| project | AA, GC | 2 |');
    expect(output).toContain('| status | Backlog, In Progress | 2 |');
  });

  it('truncates dimension values at 5 with +N more', () => {
    const dims = [
      { name: 'assignee', values: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], count: 7 },
    ];
    const output = renderCubeSetup('project = AA', 50, dims);
    expect(output).toContain('A, B, C, D, E +2');
  });

  it('includes cost estimates in suggested cubes', () => {
    const dims = [
      { name: 'project', values: ['AA', 'GC', 'GD', 'LGS'], count: 4 },
    ];
    const output = renderCubeSetup('project in (AA, GC, GD, LGS)', 50, dims);
    expect(output).toContain('## Suggested Cubes');
    expect(output).toContain('`groupBy: "project"`');
    expect(output).toContain('4 groups');
    expect(output).toContain('24 count queries');
  });

  it('includes available measures', () => {
    const dims = [{ name: 'project', values: ['AA'], count: 1 }];
    const output = renderCubeSetup('project = AA', 50, dims);
    expect(output).toContain('total, open, overdue');
    expect(output).toContain('bugs, unassigned, no_due_date, blocked');
  });
});
