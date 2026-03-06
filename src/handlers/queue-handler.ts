/**
 * Queue handler — execute multiple Jira operations in a single call (ADR-203).
 *
 * Dispatches to existing tool handlers sequentially, with:
 * - Per-operation error strategies (bail / continue)
 * - Result references ($N.field) resolved from prior results
 * - Pre-scan for destructive operations against ADR-202 guardrails
 * - Compact result formatting with consolidated next-steps
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from '../client/jira-client.js';
import { bulkOperationGuard, type DestructiveOp } from '../utils/bulk-operation-guard.js';

// ── Types ──────────────────────────────────────────────────────────────

interface QueueOperation {
  tool: string;
  args: Record<string, unknown>;
  onError?: 'bail' | 'continue';
}

interface OperationResult {
  index: number;
  status: 'success' | 'error' | 'skipped';
  text: string;
  isError?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolHandler = (client: JiraClient, request: any) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

// ── Constants ──────────────────────────────────────────────────────────

const MAX_OPERATIONS = 16;
const DESTRUCTIVE_OPERATIONS = new Set<string>(['delete', 'move']);

// ── Queue Handler ──────────────────────────────────────────────────────

export function createQueueHandler(
  handlers: Record<string, ToolHandler>,
  jiraHost?: string | null,
) {
  return async function handleQueueRequest(
    jiraClient: JiraClient,
    request: { params: { name: string; arguments?: Record<string, unknown> } },
  ) {
    const args = request.params.arguments;
    if (!args?.operations || !Array.isArray(args.operations)) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: operations (array)');
    }

    const operations = args.operations as QueueOperation[];
    const detail = (args.detail as string) === 'full' ? 'full' : 'summary';

    if (operations.length === 0) {
      throw new McpError(ErrorCode.InvalidParams, 'Operations list is empty.');
    }

    if (operations.length > MAX_OPERATIONS) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Maximum ${MAX_OPERATIONS} operations per queue. Got ${operations.length}.`,
      );
    }

    // Validate each operation has required fields
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (!op.tool) {
        throw new McpError(ErrorCode.InvalidParams, `Operation ${i}: missing 'tool' field.`);
      }
      if (!handlers[op.tool]) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Operation ${i}: unknown tool '${op.tool}'. Valid: ${Object.keys(handlers).join(', ')}`,
        );
      }
      if (!op.args || typeof op.args !== 'object') {
        throw new McpError(ErrorCode.InvalidParams, `Operation ${i}: missing 'args' object.`);
      }
    }

    // Pre-scan for destructive operations (ADR-202 integration)
    const prescanRefusal = prescanDestructive(operations, jiraHost);
    if (prescanRefusal) {
      return {
        content: [{ type: 'text', text: prescanRefusal }],
        isError: true,
      };
    }

    // Execute sequentially
    const results: OperationResult[] = [];
    let bailedAt = -1;

    for (let i = 0; i < operations.length; i++) {
      // Skip if we bailed earlier
      if (bailedAt >= 0) {
        results.push({ index: i, status: 'skipped', text: `Bailed at operation ${bailedAt}` });
        continue;
      }

      const op = operations[i];
      const errorStrategy = op.onError ?? 'bail';

      // Resolve result references
      let resolvedArgs: Record<string, unknown>;
      try {
        resolvedArgs = resolveReferences(op.args, results);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ index: i, status: 'error', text: msg, isError: true });
        if (errorStrategy === 'bail') {
          bailedAt = i;
        }
        continue;
      }

      // Dispatch to handler
      try {
        const handler = handlers[op.tool];
        const response = await handler(jiraClient, {
          params: { name: op.tool, arguments: resolvedArgs },
        });

        const text = extractText(response);
        const isError = response.isError === true;

        results.push({ index: i, status: isError ? 'error' : 'success', text, isError });

        // Record successful destructive ops in the sliding window (ADR-202)
        if (!isError && op.tool === 'manage_jira_issue') {
          const opName = (op.args.operation as string) || '';
          if (DESTRUCTIVE_OPERATIONS.has(opName)) {
            bulkOperationGuard.record(
              opName as DestructiveOp,
              (resolvedArgs.issueKey as string) || `queue-op-${i}`,
            );
          }
        }

        if (isError && errorStrategy === 'bail') {
          bailedAt = i;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ index: i, status: 'error', text: msg, isError: true });
        if (errorStrategy === 'bail') {
          bailedAt = i;
        }
      }
    }

    return {
      content: [{ type: 'text', text: formatResults(results, operations.length, bailedAt, detail) }],
    };
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Pre-scan queue for destructive operations. If the total would exceed
 * the ADR-202 sliding window, refuse the entire queue before execution.
 */
function prescanDestructive(operations: QueueOperation[], jiraHost?: string | null): string | null {
  const destructiveOps: Array<{ index: number; operation: DestructiveOp; issueKey: string }> = [];

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    if (op.tool === 'manage_jira_issue') {
      const operation = (op.args.operation as string) || '';
      if (DESTRUCTIVE_OPERATIONS.has(operation)) {
        const issueKey = (op.args.issueKey as string) || `<queue-op-${i}>`;
        destructiveOps.push({ index: i, operation: operation as DestructiveOp, issueKey });
      }
    }
  }

  if (destructiveOps.length === 0) return null;

  // Check cumulative count: all destructive ops in the queue vs remaining window capacity
  const remaining = bulkOperationGuard.remainingCapacity();
  if (destructiveOps.length > remaining) {
    // Use the first destructive op to generate a deflection message with JQL
    const refusal = bulkOperationGuard.check(destructiveOps[0].operation, destructiveOps[0].issueKey, jiraHost);
    const fallbackMsg = `Bulk destructive limit would be exceeded: ${destructiveOps.length} destructive op(s) in queue, only ${remaining} allowed.`;
    return `**Queue refused** — contains ${destructiveOps.length} destructive operation(s) that would exceed the bulk limit.\n\n${refusal || fallbackMsg}`;
  }

  return null;
}

/**
 * Resolve $N.field references in operation args.
 * Only string values are checked for references.
 */
function resolveReferences(
  args: Record<string, unknown>,
  results: OperationResult[],
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && value.match(/\$\d+\./)) {
      resolved[key] = resolveRef(value, results);
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

/**
 * Resolve a single reference string like "$0.key" or "prefix-$0.key-suffix".
 */
function resolveRef(value: string, results: OperationResult[]): string {
  return value.replace(/\$(\d+)\.(\w+)/g, (_match, indexStr, field) => {
    const index = parseInt(indexStr, 10);

    if (index >= results.length) {
      throw new Error(`Reference $${index}.${field}: operation ${index} hasn't executed yet.`);
    }

    const result = results[index];
    if (result.status !== 'success') {
      throw new Error(`Reference $${index}.${field}: operation ${index} ${result.status}.`);
    }

    const extracted = extractField(result.text, field);
    if (extracted === null) {
      throw new Error(`Reference $${index}.${field}: could not extract '${field}' from operation ${index} result.`);
    }

    return extracted;
  });
}

/**
 * Extract a named field from a tool response text.
 *
 * Supports:
 * - key: issue key (e.g., PROJ-123) from markdown headings or "key": "..."
 * - id: numeric ID from "id": "..." or similar
 * - filterId: filter ID
 * - sprintId: sprint ID
 */
function extractField(text: string, field: string): string | null {
  switch (field) {
    case 'key': {
      // Match issue key pattern in markdown (## PROJ-123 or **Key:** PROJ-123)
      const keyMatch = text.match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
      return keyMatch ? keyMatch[1] : null;
    }
    case 'id':
    case 'filterId':
    case 'sprintId':
    case 'boardId': {
      // Match "ID: 12345" or "id: 12345" pattern
      const idMatch = text.match(new RegExp(`(?:${field}|ID)[:\\s]+?(\\d+)`, 'i'));
      return idMatch ? idMatch[1] : null;
    }
    default:
      return null;
  }
}

/** Extract text content from a handler response */
function extractText(response: { content: Array<{ type: string; text: string }> }): string {
  return response.content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n');
}

/** Strip next-step guidance from a result line (suppress per-operation hints) */
function stripNextSteps(text: string): string {
  const idx = text.indexOf('\n---\n**Next steps:**');
  return idx >= 0 ? text.slice(0, idx) : text;
}

/** Get the first meaningful line of a result for compact display */
function firstLine(text: string): string {
  const stripped = stripNextSteps(text);
  // Get the first heading or first non-empty line
  for (const line of stripped.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && trimmed !== '---') {
      // Strip markdown heading prefix for compactness
      return trimmed.replace(/^#+\s*/, '');
    }
  }
  return stripped.slice(0, 100);
}

/** Format the queue results */
function formatResults(results: OperationResult[], total: number, bailedAt: number, detail: 'full' | 'summary' = 'summary'): string {
  const success = results.filter(r => r.status === 'success').length;
  const errors = results.filter(r => r.status === 'error').length;
  const skipped = results.filter(r => r.status === 'skipped').length;

  const lines: string[] = [
    `Executed ${results.length - skipped} of ${total} operations. Success: ${success}, Errors: ${errors}${skipped > 0 ? `, Skipped: ${skipped}` : ''}`,
  ];

  if (bailedAt >= 0) {
    lines.push(`Stopped at operation ${bailedAt + 1} due to error.`);
  }

  if (detail === 'full') {
    for (const r of results) {
      const icon = r.status === 'success' ? 'ok' : r.status === 'error' ? 'ERR' : 'SKIP';
      lines.push('');
      lines.push(`---`);
      lines.push(`**[${r.index + 1}] ${icon}**`);
      if (r.status === 'skipped') {
        lines.push(r.text);
      } else {
        lines.push(stripNextSteps(r.text));
      }
    }
  } else {
    lines.push('');
    for (const r of results) {
      const icon = r.status === 'success' ? 'ok' : r.status === 'error' ? 'ERR' : 'SKIP';
      const summary = r.status === 'skipped' ? r.text : firstLine(r.text);
      lines.push(`  [${r.index + 1}] ${icon}: ${summary}`);
    }
    lines.push('');
    lines.push('_Use `detail: "full"` for complete output from each operation._');
  }

  // Consolidated next-step: use the last successful operation's context
  const lastSuccess = [...results].reverse().find(r => r.status === 'success');
  if (lastSuccess) {
    const fullText = lastSuccess.text;
    const nextStepsIdx = fullText.indexOf('\n---\n**Next steps:**');
    if (nextStepsIdx >= 0) {
      lines.push(fullText.slice(nextStepsIdx));
    }
  }

  return lines.join('\n');
}
