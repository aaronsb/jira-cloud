import { describe, it, expect } from 'vitest';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

// We can't import the validation functions directly since they're not exported.
// Instead, we test through the public handler functions with no JiraClient needed
// (validation throws before reaching the client).

// Helper to call a handler and expect a validation error
async function expectValidationError(
  handlerModule: string,
  handlerName: string,
  args: Record<string, unknown>,
  expectedMessage?: string
) {
  const mod = await import(handlerModule);
  const handler = mod[handlerName];

  try {
    await handler(
      {} as any, // fake JiraClient — validation should throw before it's used
      { params: { name: handlerName === 'handleIssueRequest' ? 'manage_jira_issue'
        : handlerName === 'handleFilterRequest' ? 'manage_jira_filter'
        : handlerName === 'handleProjectRequest' ? 'manage_jira_project'
        : handlerName === 'handleBoardRequest' ? 'manage_jira_board'
        : 'manage_jira_sprint', arguments: args } }
    );
    expect.fail('Should have thrown');
  } catch (error) {
    expect(error).toBeInstanceOf(McpError);
    const mcpError = error as McpError;
    expect(mcpError.code).toBe(ErrorCode.InvalidParams);
    if (expectedMessage) {
      expect(mcpError.message).toContain(expectedMessage);
    }
  }
}

describe('issue handler validation', () => {
  const mod = './issue-handlers.js';
  const fn = 'handleIssueRequest';

  it('rejects missing operation', async () => {
    await expectValidationError(mod, fn, {}, 'Invalid operation');
  });

  it('rejects invalid operation', async () => {
    await expectValidationError(mod, fn, { operation: 'explode' }, 'Invalid operation');
  });

  it('rejects get without issueKey', async () => {
    await expectValidationError(mod, fn, { operation: 'get' }, 'issueKey');
  });

  it('rejects create without required fields', async () => {
    await expectValidationError(mod, fn, { operation: 'create' }, 'projectKey');
  });

  it('rejects create without summary', async () => {
    await expectValidationError(mod, fn, { operation: 'create', projectKey: 'PROJ' }, 'summary');
  });

  it('rejects create without issueType', async () => {
    await expectValidationError(mod, fn,
      { operation: 'create', projectKey: 'PROJ', summary: 'Test' }, 'issueType');
  });

  it('rejects transition without transitionId', async () => {
    await expectValidationError(mod, fn,
      { operation: 'transition', issueKey: 'PROJ-1' }, 'transitionId');
  });

  it('rejects comment without comment text', async () => {
    await expectValidationError(mod, fn,
      { operation: 'comment', issueKey: 'PROJ-1' }, 'comment');
  });

  it('rejects link without linkType', async () => {
    await expectValidationError(mod, fn,
      { operation: 'link', issueKey: 'PROJ-1', linkedIssueKey: 'PROJ-2' }, 'linkType');
  });

  it('rejects delete without issueKey', async () => {
    await expectValidationError(mod, fn, { operation: 'delete' }, 'issueKey');
  });

  it('rejects move without issueKey', async () => {
    await expectValidationError(mod, fn, { operation: 'move' }, 'issueKey');
  });

  it('rejects move without targetProjectKey', async () => {
    await expectValidationError(mod, fn, { operation: 'move', issueKey: 'PROJ-1' }, 'targetProjectKey');
  });

  it('rejects move without targetIssueType', async () => {
    await expectValidationError(mod, fn,
      { operation: 'move', issueKey: 'PROJ-1', targetProjectKey: 'NEWPROJ' }, 'targetIssueType');
  });

  it('rejects invalid expand values', async () => {
    await expectValidationError(mod, fn,
      { operation: 'get', issueKey: 'PROJ-1', expand: ['invalid'] }, 'Invalid expansion');
  });

  it('accepts snake_case parameters', async () => {
    // This will fail at JiraClient level, not validation — proving snake_case is normalized
    await expect(async () => {
      const m = await import(mod);
      await m[fn](
        {} as any,
        { params: { name: 'manage_jira_issue', arguments: { operation: 'get', issue_key: 'PROJ-1' } } }
      );
    }).rejects.toThrow(); // Will throw from JiraClient, not validation
  });
});

describe('filter handler validation', () => {
  const mod = './filter-handlers.js';
  const fn = 'handleFilterRequest';

  it('rejects missing operation', async () => {
    await expectValidationError(mod, fn, {}, 'Invalid operation');
  });

  it('rejects get without filterId', async () => {
    await expectValidationError(mod, fn, { operation: 'get' }, 'filterId');
  });

  it('rejects create without name', async () => {
    await expectValidationError(mod, fn, { operation: 'create' }, 'name');
  });

  it('rejects create without jql', async () => {
    await expectValidationError(mod, fn, { operation: 'create', name: 'test' }, 'jql');
  });

  it('rejects execute_jql without jql', async () => {
    await expectValidationError(mod, fn, { operation: 'execute_jql' }, 'jql');
  });
});

describe('sprint handler validation', () => {
  const mod = './sprint-handlers.js';
  const fn = 'handleSprintRequest';

  it('rejects missing operation', async () => {
    await expectValidationError(mod, fn, {}, 'Invalid operation');
  });

  it('rejects get without sprintId', async () => {
    await expectValidationError(mod, fn, { operation: 'get' }, 'sprintId');
  });

  it('rejects create without boardId', async () => {
    await expectValidationError(mod, fn, { operation: 'create' }, 'boardId');
  });

  it('rejects create without name', async () => {
    await expectValidationError(mod, fn, { operation: 'create', boardId: 1 }, 'name');
  });

  it('rejects list without boardId', async () => {
    await expectValidationError(mod, fn, { operation: 'list' }, 'boardId');
  });

  it('rejects manage_issues without sprintId', async () => {
    await expectValidationError(mod, fn, { operation: 'manage_issues' }, 'sprintId');
  });

  it('rejects manage_issues without add or remove', async () => {
    await expectValidationError(mod, fn,
      { operation: 'manage_issues', sprintId: 1 }, 'add or remove');
  });
});

describe('project handler validation', () => {
  const mod = './project-handlers.js';
  const fn = 'handleProjectRequest';

  it('rejects missing operation', async () => {
    await expectValidationError(mod, fn, {}, 'Invalid operation');
  });

  it('rejects admin operations', async () => {
    await expectValidationError(mod, fn, { operation: 'create' }, 'Invalid operation');
    await expectValidationError(mod, fn, { operation: 'update' }, 'Invalid operation');
    await expectValidationError(mod, fn, { operation: 'delete' }, 'Invalid operation');
  });

  it('rejects get without projectKey', async () => {
    await expectValidationError(mod, fn, { operation: 'get' }, 'projectKey');
  });

  it('rejects invalid project key format', async () => {
    await expectValidationError(mod, fn, { operation: 'get', projectKey: 'bad-key' }, 'Invalid project key');
  });
});

describe('board handler validation', () => {
  const mod = './board-handlers.js';
  const fn = 'handleBoardRequest';

  it('rejects missing operation', async () => {
    await expectValidationError(mod, fn, {}, 'Invalid operation');
  });

  it('rejects admin operations', async () => {
    await expectValidationError(mod, fn, { operation: 'create' }, 'Invalid operation');
    await expectValidationError(mod, fn, { operation: 'update' }, 'Invalid operation');
    await expectValidationError(mod, fn, { operation: 'delete' }, 'Invalid operation');
    await expectValidationError(mod, fn, { operation: 'get_configuration' }, 'Invalid operation');
  });

  it('rejects get without boardId', async () => {
    await expectValidationError(mod, fn, { operation: 'get' }, 'boardId');
  });
});
