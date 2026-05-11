import { describe, it, expect } from 'vitest';
import { renderIssue } from './markdown-renderer.js';
import type { JiraIssueDetails } from '../types/index.js';

// Minimal fixture builder — keeps test rows readable while satisfying the type's required fields.
function makeIssue(overrides: Partial<JiraIssueDetails> = {}): JiraIssueDetails {
  return {
    key: 'PAID-192',
    summary: 'Safe to delete',
    description: '',
    issueType: 'Task',
    priority: null,
    parent: null,
    assignee: null,
    reporter: 'someone',
    status: 'To Do',
    statusCategory: 'new',
    resolution: null,
    labels: [],
    created: '2026-05-01T00:00:00.000Z',
    updated: '2026-05-01T00:00:00.000Z',
    resolutionDate: null,
    statusCategoryChanged: null,
    dueDate: null,
    startDate: null,
    storyPoints: null,
    timeEstimate: null,
    originalEstimate: null,
    timeSpent: null,
    sprint: null,
    issueLinks: [],
    ...overrides,
  };
}

const POPULATED_THREE = [
  { name: 'Tempo Account', value: 'Internal Ops', type: 'option', description: '' },
  { name: 'Acceptance Criteria', value: 'All checks pass', type: 'string', description: '' },
  { name: 'Sprint Goal', value: ['Goal A', 'Goal B'], type: 'array', description: '' },
];

describe('renderIssue — custom field reveal modes (ADR-214)', () => {
  it('dump: renders the full Custom Fields block', () => {
    const out = renderIssue(
      makeIssue({ customFieldValues: POPULATED_THREE }),
      undefined,
      { customFields: 'dump' },
    );
    expect(out).toContain('Custom Fields:');
    expect(out).toContain('Tempo Account (option): Internal Ops');
    expect(out).toContain('Acceptance Criteria (string): All checks pass');
    expect(out).toContain('Sprint Goal (array): Goal A, Goal B');
    expect(out).not.toContain('not shown');
  });

  it('breadcrumb (default): one-line hint with count + expand + scoped URI', () => {
    const out = renderIssue(
      makeIssue({ customFieldValues: POPULATED_THREE }),
      undefined,
      { customFields: 'breadcrumb', projectKey: 'PAID', issueTypeName: 'Task' },
    );
    expect(out).toContain('3 populated custom fields not shown');
    expect(out).toContain('`expand: ["custom_fields"]`');
    expect(out).toContain('`jira://custom-fields/PAID/Task`');
    expect(out).not.toContain('Custom Fields:');
    expect(out).not.toContain('Tempo Account (option)');
  });

  it('breadcrumb: omits the URI clause when projectKey/issueTypeName are absent', () => {
    const out = renderIssue(
      makeIssue({ customFieldValues: POPULATED_THREE }),
      undefined,
      { customFields: 'breadcrumb' },
    );
    expect(out).toContain('3 populated custom fields not shown');
    expect(out).toContain('`expand: ["custom_fields"]`');
    expect(out).not.toContain('jira://custom-fields/');
  });

  it('breadcrumb: singular phrasing when exactly one field is populated', () => {
    const out = renderIssue(
      makeIssue({ customFieldValues: POPULATED_THREE.slice(0, 1) }),
      undefined,
      { customFields: 'breadcrumb' },
    );
    expect(out).toContain('1 populated custom field not shown');
  });

  it('none: renders neither the block nor the breadcrumb', () => {
    const out = renderIssue(
      makeIssue({ customFieldValues: POPULATED_THREE }),
      undefined,
      { customFields: 'none' },
    );
    expect(out).not.toContain('Custom Fields:');
    expect(out).not.toContain('not shown');
    expect(out).not.toContain('Tempo Account');
  });

  it('default (no opts): treats as breadcrumb', () => {
    const out = renderIssue(
      makeIssue({ customFieldValues: POPULATED_THREE }),
    );
    expect(out).toContain('not shown');
    expect(out).not.toContain('Custom Fields:');
  });

  describe('zero populated → silent in every mode', () => {
    it.each(['dump', 'breadcrumb', 'none'] as const)('%s mode is silent', (mode) => {
      const out = renderIssue(
        makeIssue({ customFieldValues: [] }),
        undefined,
        { customFields: mode, projectKey: 'PAID', issueTypeName: 'Task' },
      );
      expect(out).not.toContain('Custom Fields:');
      expect(out).not.toContain('not shown');
    });

    it('undefined customFieldValues is silent', () => {
      const out = renderIssue(makeIssue(), undefined, { customFields: 'breadcrumb' });
      expect(out).not.toContain('not shown');
    });
  });
});
