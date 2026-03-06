import { describe, it, expect } from 'vitest';
import { issueNextSteps, filterNextSteps, sprintNextSteps, projectNextSteps, boardNextSteps } from './next-steps.js';

describe('issueNextSteps', () => {
  it('returns suggestions for create', () => {
    const result = issueNextSteps('create', 'PROJ-1');
    expect(result).toContain('Next steps');
    expect(result).toContain('manage_jira_issue');
    expect(result).toContain('PROJ-1');
  });

  it('returns suggestions for get', () => {
    const result = issueNextSteps('get', 'PROJ-1');
    expect(result).toContain('Update fields');
    expect(result).toContain('comment');
  });

  it('returns suggestions for transition', () => {
    const result = issueNextSteps('transition', 'PROJ-1');
    expect(result).toContain('comment');
  });

  it('returns suggestions for link', () => {
    const result = issueNextSteps('link', 'PROJ-1');
    expect(result).toContain('issue-link-types');
  });

  it('returns empty for unknown operation', () => {
    expect(issueNextSteps('unknown')).toBe('');
  });
});

describe('filterNextSteps', () => {
  it('returns suggestions for execute_jql including save hint', () => {
    const result = filterNextSteps('execute_jql', undefined, 'project = PROJ');
    expect(result).toContain('Next steps');
    expect(result).toContain('Save this query');
    expect(result).toContain('project = PROJ');
  });

  it('returns suggestions for execute_filter', () => {
    const result = filterNextSteps('execute_filter', '123');
    expect(result).toContain('manage_jira_issue');
  });

  it('returns suggestions for list', () => {
    const result = filterNextSteps('list');
    expect(result).toContain('execute_jql');
  });

  it('returns empty for unknown operation', () => {
    expect(filterNextSteps('unknown')).toBe('');
  });
});

describe('sprintNextSteps', () => {
  it('returns suggestions for create', () => {
    const result = sprintNextSteps('create', 10, 5);
    expect(result).toContain('Add issues');
    expect(result).toContain('Start the sprint');
  });

  it('suggests close for active sprint get', () => {
    const result = sprintNextSteps('get', 10, 5, 'active');
    expect(result).toContain('Close the sprint');
  });

  it('suggests start for future sprint get', () => {
    const result = sprintNextSteps('get', 10, 5, 'future');
    expect(result).toContain('Start the sprint');
  });

  it('suggests next sprint after close', () => {
    const result = sprintNextSteps('update', 10, 5, 'closed');
    expect(result).toContain('Create the next sprint');
  });

  it('returns empty for unknown operation', () => {
    expect(sprintNextSteps('unknown')).toBe('');
  });
});

describe('projectNextSteps', () => {
  it('returns suggestions for list', () => {
    const result = projectNextSteps('list');
    expect(result).toContain('Get project details');
  });

  it('returns suggestions for get with project key', () => {
    const result = projectNextSteps('get', 'PROJ');
    expect(result).toContain('project = PROJ');
    expect(result).toContain('jira://projects/PROJ/overview');
  });

  it('returns empty for unknown operation', () => {
    expect(projectNextSteps('unknown')).toBe('');
  });
});

describe('boardNextSteps', () => {
  it('returns suggestions for list', () => {
    const result = boardNextSteps('list');
    expect(result).toContain('Get board details');
  });

  it('returns suggestions for get with board ID', () => {
    const result = boardNextSteps('get', 42);
    expect(result).toContain('manage_jira_sprint');
    expect(result).toContain('jira://boards/42/overview');
  });

  it('returns suggestions for get_configuration', () => {
    const result = boardNextSteps('get_configuration', 42);
    expect(result).toContain('sprint');
  });

  it('returns empty for unknown operation', () => {
    expect(boardNextSteps('unknown')).toBe('');
  });
});
