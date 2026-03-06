/**
 * Sliding-window tracker for bulk-destructive operations (ADR-202 §1.4).
 *
 * Detects when an LLM agent is calling destructive operations (delete, move)
 * in rapid succession and deflects to Jira's bulk-operations UI.
 */

const WINDOW_MS = 60_000; // 60-second sliding window

const DEFAULT_LIMIT = 3;

export type DestructiveOp = 'delete' | 'move';

interface TrackedOp {
  operation: DestructiveOp;
  issueKey: string;
  timestamp: number;
}

/** Session-level operation tracker (singleton) */
class BulkOperationGuard {
  private ops: TrackedOp[] = [];
  private limit: number;

  constructor() {
    const envLimit = process.env.JIRA_BULK_DESTRUCTIVE_LIMIT;
    this.limit = envLimit ? parseInt(envLimit, 10) : DEFAULT_LIMIT;
    if (isNaN(this.limit) || this.limit < 1) {
      this.limit = DEFAULT_LIMIT;
    }
  }

  /** Prune entries outside the sliding window */
  private prune(): void {
    const cutoff = Date.now() - WINDOW_MS;
    this.ops = this.ops.filter(op => op.timestamp >= cutoff);
  }

  /**
   * Check whether a destructive operation should be allowed.
   * Returns `null` if allowed, or a deflection message if refused.
   */
  check(operation: DestructiveOp, issueKey: string, jiraHost?: string | null): string | null {
    this.prune();

    const recentCount = this.ops.length;
    if (recentCount < this.limit) {
      return null; // allowed
    }

    // Build deflection
    const recentKeys = this.ops.map(op => op.issueKey);
    recentKeys.push(issueKey);
    const jql = `key in (${recentKeys.join(', ')})`;
    const encodedJql = encodeURIComponent(jql);

    const lines = [
      `Bulk ${operation} is not supported through this tool — ${operation === 'delete' ? 'deleting' : 'moving'} ${recentKeys.length} issues in quick succession is best done with manual review.`,
      '',
      `**Your JQL query:** \`${jql}\``,
    ];

    if (jiraHost) {
      lines.push(`**Review in Jira:** https://${jiraHost}/issues/?jql=${encodedJql}`);
    }

    lines.push('');
    lines.push(`From Jira's issue list, select the issues and use the bulk operations menu.`);
    lines.push('');
    lines.push(`To ${operation} a single issue, wait a moment and try again with one issue at a time.`);

    return lines.join('\n');
  }

  /** Record a successful destructive operation */
  record(operation: DestructiveOp, issueKey: string): void {
    this.ops.push({ operation, issueKey, timestamp: Date.now() });
  }

  /** Reset for testing */
  reset(): void {
    this.ops = [];
  }

  /** Visible for testing */
  getLimit(): number {
    return this.limit;
  }
}

/** Singleton instance — lives for the MCP server process lifetime */
export const bulkOperationGuard = new BulkOperationGuard();
