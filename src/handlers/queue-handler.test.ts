import { describe, it, expect, beforeEach } from 'vitest';
import { createQueueHandler } from './queue-handler.js';
import { bulkOperationGuard } from '../utils/bulk-operation-guard.js';

// ── Mock Handlers ──────────────────────────────────────────────────────

function mockHandler(text: string, isError = false) {
  return async () => ({
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  });
}

function createMockHandlers(overrides: Record<string, any> = {}) {
  return {
    manage_jira_issue: overrides.manage_jira_issue ?? mockHandler('## PROJ-123\n**Status:** Open\n\n---\n**Next steps:**\n- Do something'),
    manage_jira_filter: overrides.manage_jira_filter ?? mockHandler('Found 5 issues'),
    manage_jira_sprint: overrides.manage_jira_sprint ?? mockHandler('Sprint 1'),
    manage_jira_project: overrides.manage_jira_project ?? mockHandler('Project PROJ'),
  };
}

function makeQueue(handlers?: Record<string, any>, jiraHost?: string) {
  const h = handlers ?? createMockHandlers();
  return createQueueHandler(h, jiraHost);
}

function makeRequest(operations: any[], detail?: 'full' | 'summary') {
  return {
    params: {
      name: 'queue_jira_operations',
      arguments: { operations, ...(detail ? { detail } : {}) },
    },
  };
}

describe('queue-handler', () => {
  beforeEach(() => {
    bulkOperationGuard.reset();
  });

  describe('validation', () => {
    it('rejects missing operations', async () => {
      const handler = makeQueue();
      await expect(handler({} as any, { params: { name: 'queue_jira_operations', arguments: {} } }))
        .rejects.toThrow('Missing required parameter');
    });

    it('rejects empty operations', async () => {
      const handler = makeQueue();
      await expect(handler({} as any, makeRequest([])))
        .rejects.toThrow('empty');
    });

    it('rejects more than 16 operations', async () => {
      const handler = makeQueue();
      const ops = Array.from({ length: 17 }, () => ({
        tool: 'manage_jira_issue', args: { operation: 'get', issueKey: 'X-1' },
      }));
      await expect(handler({} as any, makeRequest(ops)))
        .rejects.toThrow('Maximum 16');
    });

    it('rejects unknown tool', async () => {
      const handler = makeQueue();
      await expect(handler({} as any, makeRequest([
        { tool: 'unknown_tool', args: {} },
      ]))).rejects.toThrow("unknown tool 'unknown_tool'");
    });

    it('rejects missing args', async () => {
      const handler = makeQueue();
      await expect(handler({} as any, makeRequest([
        { tool: 'manage_jira_issue' },
      ]))).rejects.toThrow("missing 'args'");
    });
  });

  describe('execution', () => {
    it('executes a single operation', async () => {
      const handler = makeQueue();
      const result = await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'get', issueKey: 'PROJ-123' } },
      ]));

      const text = result.content[0].text;
      expect(text).toContain('1 of 1');
      expect(text).toContain('Success: 1');
      expect(text).toContain('[1] ok:');
    });

    it('executes multiple operations', async () => {
      const handler = makeQueue();
      const result = await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'get', issueKey: 'PROJ-1' } },
        { tool: 'manage_jira_filter', args: { operation: 'execute_jql', jql: 'project = PROJ' } },
      ]));

      const text = result.content[0].text;
      expect(text).toContain('2 of 2');
      expect(text).toContain('Success: 2');
      expect(text).toContain('[1] ok:');
      expect(text).toContain('[2] ok:');
    });

    it('strips per-operation next-steps from compact output', async () => {
      const handler = makeQueue();
      const result = await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'get', issueKey: 'PROJ-123' } },
      ]));

      const text = result.content[0].text;
      // The compact [1] line should NOT contain next steps
      const compactLine = text.split('\n').find((l: string) => l.includes('[1]'));
      expect(compactLine).not.toContain('Next steps');
    });

    it('appends consolidated next-steps from last success', async () => {
      const handler = makeQueue();
      const result = await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'get', issueKey: 'PROJ-123' } },
      ]));

      const text = result.content[0].text;
      // Should have next steps at the end from the last successful op
      expect(text).toContain('**Next steps:**');
    });

    it('defaults to summary mode with hint about full', async () => {
      const handler = makeQueue();
      const result = await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'get', issueKey: 'PROJ-123' } },
      ]));

      const text = result.content[0].text;
      expect(text).toContain('[1] ok:');
      expect(text).toContain('detail: "full"');
    });

    it('returns full detail when detail=full', async () => {
      const handler = makeQueue();
      const result = await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'get', issueKey: 'PROJ-123' } },
      ], 'full'));

      const text = result.content[0].text;
      expect(text).toContain('**[1] ok**');
      expect(text).toContain('PROJ-123');
      expect(text).toContain('**Status:** Open');
      expect(text).not.toContain('detail: "full"');
    });
  });

  describe('error strategies', () => {
    it('bails by default on error', async () => {
      const handlers = createMockHandlers({
        manage_jira_issue: async (_client: any, req: any) => {
          const args = req.params.arguments;
          if (args?.issueKey === 'BAD-1') {
            throw new Error('Not found');
          }
          return { content: [{ type: 'text', text: '## PROJ-1\nOK' }] };
        },
      });

      const handler = makeQueue(handlers);
      const result = await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'get', issueKey: 'PROJ-1' } },
        { tool: 'manage_jira_issue', args: { operation: 'get', issueKey: 'BAD-1' } },
        { tool: 'manage_jira_issue', args: { operation: 'get', issueKey: 'PROJ-2' } },
      ]));

      const text = result.content[0].text;
      expect(text).toContain('Success: 1');
      expect(text).toContain('Errors: 1');
      expect(text).toContain('Skipped: 1');
      expect(text).toContain('Stopped at operation 2');
      expect(text).toContain('[3] SKIP:');
    });

    it('continues on error when onError=continue', async () => {
      const handlers = createMockHandlers({
        manage_jira_issue: async (_client: any, req: any) => {
          const args = req.params.arguments;
          if (args?.issueKey === 'BAD-1') {
            throw new Error('Not found');
          }
          return { content: [{ type: 'text', text: '## PROJ-1\nOK' }] };
        },
      });

      const handler = makeQueue(handlers);
      const result = await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'get', issueKey: 'PROJ-1' } },
        { tool: 'manage_jira_issue', args: { operation: 'get', issueKey: 'BAD-1' }, onError: 'continue' },
        { tool: 'manage_jira_issue', args: { operation: 'get', issueKey: 'PROJ-2' } },
      ]));

      const text = result.content[0].text;
      expect(text).toContain('Success: 2');
      expect(text).toContain('Errors: 1');
      expect(text).not.toContain('Skipped');
      expect(text).not.toContain('Stopped');
    });

    it('treats isError responses as errors', async () => {
      const handlers = createMockHandlers({
        manage_jira_issue: async () => ({
          content: [{ type: 'text', text: 'Permission denied' }],
          isError: true,
        }),
      });

      const handler = makeQueue(handlers);
      const result = await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'delete', issueKey: 'X-1' } },
        { tool: 'manage_jira_filter', args: { operation: 'list' } },
      ]));

      const text = result.content[0].text;
      expect(text).toContain('Errors: 1');
      expect(text).toContain('Skipped: 1');
    });
  });

  describe('result references', () => {
    it('resolves $N.key from prior results', async () => {
      let capturedArgs: any;
      const handlers = createMockHandlers({
        manage_jira_issue: async (_client: any, req: any) => {
          const args = req.params.arguments;
          if (args?.operation === 'create') {
            return { content: [{ type: 'text', text: '# Issue Created\n\n## PROJ-456\n**Status:** Open' }] };
          }
          capturedArgs = args;
          return { content: [{ type: 'text', text: 'Comment added' }] };
        },
      });

      const handler = makeQueue(handlers);
      await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'create', projectKey: 'PROJ', summary: 'Test', issueType: 'Task' } },
        { tool: 'manage_jira_issue', args: { operation: 'comment', issueKey: '$0.key', comment: 'Hello' } },
      ]));

      expect(capturedArgs.issueKey).toBe('PROJ-456');
    });

    it('fails reference to failed operation', async () => {
      let callCount = 0;
      const handlers = createMockHandlers({
        manage_jira_issue: async () => {
          callCount++;
          if (callCount === 1) throw new Error('Create failed');
          return { content: [{ type: 'text', text: 'OK' }] };
        },
      });

      const handler = makeQueue(handlers);
      const result = await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'create', projectKey: 'PROJ', summary: 'Test', issueType: 'Task' }, onError: 'continue' },
        { tool: 'manage_jira_issue', args: { operation: 'comment', issueKey: '$0.key', comment: 'Hello' }, onError: 'continue' },
      ]));

      const text = result.content[0].text;
      // Op 0 fails, op 1 fails because $0 reference is to a failed op
      expect(text).toContain('Errors: 2');
    });

    it('fails reference to future operation', async () => {
      const handler = makeQueue();
      const result = await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'comment', issueKey: '$1.key', comment: 'Hello' }, onError: 'continue' },
        { tool: 'manage_jira_issue', args: { operation: 'get', issueKey: 'PROJ-1' } },
      ]));

      const text = result.content[0].text;
      expect(text).toContain('[1] ERR:');
    });
  });

  describe('destructive prescan', () => {
    it('allows non-destructive queues', async () => {
      const handler = makeQueue();
      const result = await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'get', issueKey: 'PROJ-1' } },
        { tool: 'manage_jira_issue', args: { operation: 'create', projectKey: 'PROJ', summary: 'New', issueType: 'Task' } },
      ]));

      expect(result.isError).toBeUndefined();
    });

    it('refuses queue that would exceed destructive limit', async () => {
      // Fill the guard to the limit (default limit is 3)
      bulkOperationGuard.record('delete', 'X-1');
      bulkOperationGuard.record('delete', 'X-2');
      bulkOperationGuard.record('delete', 'X-3');

      const handler = makeQueue(undefined, 'test.atlassian.net');
      const result = await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'delete', issueKey: 'X-3' } },
      ]));

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Queue refused');
    });

    it('allows destructive ops within limit', async () => {
      const handler = makeQueue();
      const result = await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'delete', issueKey: 'X-1' } },
      ]));

      // Should execute, not refuse
      expect(result.isError).toBeUndefined();
    });

    it('records destructive ops in sliding window after execution', async () => {
      const handler = makeQueue();
      // Execute a queue with 2 deletes (limit is 3, window is empty)
      await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'delete', issueKey: 'Y-1' } },
        { tool: 'manage_jira_issue', args: { operation: 'delete', issueKey: 'Y-2' } },
      ]));

      // Window should now have 2 recorded — only 1 more allowed
      expect(bulkOperationGuard.remainingCapacity()).toBe(1);

      // A third delete should still pass
      const result2 = await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'delete', issueKey: 'Y-3' } },
      ]));
      expect(result2.isError).toBeUndefined();

      // A fourth should be refused
      const result3 = await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'delete', issueKey: 'Y-4' } },
      ]));
      expect(result3.isError).toBe(true);
      expect(result3.content[0].text).toContain('Queue refused');
    });

    it('refuses queue with cumulative destructive ops exceeding limit', async () => {
      // Window has 2 recorded, limit is 3 — only 1 more allowed
      bulkOperationGuard.record('delete', 'Z-1');
      bulkOperationGuard.record('delete', 'Z-2');

      const handler = makeQueue(undefined, 'test.atlassian.net');
      // Queue has 2 deletes but only 1 slot — should refuse the entire queue
      const result = await handler({} as any, makeRequest([
        { tool: 'manage_jira_issue', args: { operation: 'delete', issueKey: 'Z-3' } },
        { tool: 'manage_jira_issue', args: { operation: 'delete', issueKey: 'Z-4' } },
      ]));

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Queue refused');
    });
  });
});
