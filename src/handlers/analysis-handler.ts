import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import type { GraphObjectCache } from '../client/graph-object-cache.js';
import type { GraphQLClient } from '../client/graphql-client.js';
import { GraphQLHierarchyWalker, walkTree } from '../client/graphql-hierarchy.js';
import { JiraClient } from '../client/jira-client.js';
import { renderRollupTree } from '../handlers/plan-handler.js';
import { JiraIssueDetails, GraphIssue, GraphTreeNode } from '../types/index.js';
import { ComputeColumn, evaluateRow, extractColumnRefs, parseComputeList } from '../utils/cube-dsl.js';
import { analysisNextSteps } from '../utils/next-steps.js';
import { normalizeArgs } from '../utils/normalize-args.js';

// ── Types ──────────────────────────────────────────────────────────────

type MetricGroup = 'points' | 'time' | 'schedule' | 'cycle' | 'distribution' | 'flow' | 'hierarchy' | 'summary' | 'cube_setup';

const ALL_METRICS: MetricGroup[] = ['points', 'time', 'schedule', 'cycle', 'distribution'];
// flow and hierarchy are opt-in only
const VALID_GROUP_BY = ['project', 'assignee', 'priority', 'issuetype', 'parent', 'sprint'] as const;
type GroupByField = typeof VALID_GROUP_BY[number];
const MAX_ISSUES_HARD = 500;   // absolute ceiling for detail metrics — beyond this, context explodes
const MAX_ISSUES_DEFAULT = 100;
const CUBE_SAMPLE_PCT = 0.2;   // 20% of total issues
const CUBE_SAMPLE_MIN = 50;    // floor — enough for rare dimension values
const CUBE_SAMPLE_MAX = 500;   // ceiling — proven fast with lean search
const DEFAULT_GROUP_LIMIT = 20;
const MAX_COUNT_QUERIES = 150; // ADR-206 budget: max count API calls per execution
const STANDARD_MEASURES = 6;   // total, open, overdue, high+, created_7d, resolved_7d

type StatusBucket = 'To Do' | 'In Progress' | 'Done';

// ── Helpers ────────────────────────────────────────────────────────────

function bucketStatus(category: string): StatusBucket {
  switch (category) {
    case 'new': return 'To Do';
    case 'indeterminate': return 'In Progress';
    case 'done': return 'Done';
    default: return 'To Do';
  }
}

/** Parse a date string to a Date without timezone shift for date-only values */
function parseDate(dateStr: string): Date {
  const dateOnly = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  return new Date(dateStr);
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const days = Math.floor(hours / 8); // 8-hour work day
  if (days > 0) {
    const remainingHours = hours % 8;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function sumBy<T>(items: T[], valueFn: (item: T) => number | null): number {
  return items.reduce((sum, item) => sum + (valueFn(item) || 0), 0);
}

function mapToString(map: Map<string, number>, separator = ' | ', limit?: number): string {
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const capped = limit ? sorted.slice(0, limit) : sorted;
  const result = capped.map(([k, v]) => `${k}: ${v}`).join(separator);
  if (limit && sorted.length > limit) {
    return `${result} | (+${sorted.length - limit} more — use groupLimit to see all)`;
  }
  return result;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// ── Metric Renderers (exported for testing) ────────────────────────────

export function renderPoints(issues: JiraIssueDetails[]): string {
  const estimated = issues.filter(i => i.storyPoints != null);
  const unestimated = issues.length - estimated.length;

  const byBucket = new Map<StatusBucket, number>();
  for (const issue of issues) {
    const bucket = bucketStatus(issue.statusCategory);
    byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + (issue.storyPoints ?? 0));
  }

  const pv = sumBy(issues, i => i.storyPoints);
  const ev = byBucket.get('Done') ?? 0;
  const remaining = pv - ev;
  const spi = pv > 0 ? (ev / pv) : null;

  const lines = ['## Points (Earned Value)', ''];
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Planned Value (PV) | ${pv} pts |`);
  lines.push(`| Earned Value (EV) | ${ev} pts |`);
  lines.push(`| Remaining | ${remaining} pts |`);
  lines.push(`| SPI | ${spi !== null ? spi.toFixed(2) : 'N/A (no estimates)'} |`);
  if (unestimated > 0) {
    lines.push(`| Unestimated | ${unestimated} issue${unestimated !== 1 ? 's' : ''} |`);
  }
  lines.push('');

  const bucketStr = ['To Do', 'In Progress', 'Done']
    .map(b => `${b}: ${byBucket.get(b as StatusBucket) ?? 0} pts`)
    .join(' | ');
  lines.push(`**By status:** ${bucketStr}`);

  return lines.join('\n');
}

export function renderTime(issues: JiraIssueDetails[]): string {
  const estimated = issues.filter(i => i.timeEstimate != null);
  const unestimated = issues.length - estimated.length;
  const total = sumBy(issues, i => i.timeEstimate);

  const byBucket = new Map<StatusBucket, number>();
  for (const issue of issues) {
    const bucket = bucketStatus(issue.statusCategory);
    byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + (issue.timeEstimate ?? 0));
  }

  const done = byBucket.get('Done') ?? 0;
  const remaining = total - done;

  const lines = ['## Time (Effort)', ''];
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Original Estimate | ${formatDuration(total)} |`);
  lines.push(`| Completed | ${formatDuration(done)} |`);
  lines.push(`| Remaining | ${formatDuration(remaining)} |`);
  if (unestimated > 0) {
    lines.push(`| Unestimated | ${unestimated} issue${unestimated !== 1 ? 's' : ''} |`);
  }

  return lines.join('\n');
}

export function renderSchedule(issues: JiraIssueDetails[], now: Date): string {
  const lines = ['## Schedule', ''];

  // Date range
  const startDates = issues.filter(i => i.startDate).map(i => parseDate(i.startDate!));
  const dueDates = issues.filter(i => i.dueDate).map(i => parseDate(i.dueDate!));
  const allDates = [...startDates, ...dueDates];

  if (allDates.length > 0) {
    const earliest = new Date(Math.min(...allDates.map(d => d.getTime())));
    const latest = new Date(Math.max(...allDates.map(d => d.getTime())));
    lines.push(`**Window:** ${formatDateShort(earliest)} - ${formatDateShort(latest)}`);
  }

  // Overdue
  const overdue = issues.filter(i =>
    i.dueDate && !i.resolutionDate && parseDate(i.dueDate) < now
  );
  if (overdue.length > 0) {
    const totalSlip = overdue.reduce((sum, i) => sum + daysBetween(parseDate(i.dueDate!), now), 0);
    const keys = overdue.slice(0, 5).map(i => i.key).join(', ');
    const more = overdue.length > 5 ? ` +${overdue.length - 5} more` : '';
    lines.push(`**Overdue:** ${overdue.length} issue${overdue.length !== 1 ? 's' : ''}, ${totalSlip} days total slip (${keys}${more})`);
  } else {
    lines.push('**Overdue:** none');
  }

  // Due soon
  for (const window of [7, 14, 30]) {
    const cutoff = new Date(now.getTime() + window * 24 * 60 * 60 * 1000);
    const dueSoon = issues.filter(i =>
      i.dueDate && !i.resolutionDate &&
      parseDate(i.dueDate) >= now && parseDate(i.dueDate) <= cutoff
    );
    if (dueSoon.length > 0) {
      lines.push(`**Due next ${window} days:** ${dueSoon.length} issue${dueSoon.length !== 1 ? 's' : ''}`);
    }
  }

  // Concentration risk
  const dueDateCounts = countBy(
    issues.filter(i => i.dueDate && !i.resolutionDate),
    i => i.dueDate!
  );
  const concentrated = [...dueDateCounts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);
  if (concentrated.length > 0) {
    const top = concentrated.slice(0, 3)
      .map(([date, count]) => `${formatDateShort(parseDate(date))} has ${count} issues`)
      .join('; ');
    lines.push(`**Concentration:** ${top}`);
  }

  // No due date
  const noDueDate = issues.filter(i => !i.dueDate && !i.resolutionDate);
  if (noDueDate.length > 0) {
    lines.push(`**No due date:** ${noDueDate.length} issue${noDueDate.length !== 1 ? 's' : ''}`);
  }

  return lines.join('\n');
}

export function renderCycle(issues: JiraIssueDetails[], now: Date): string {
  const lines = ['## Cycle (Flow Metrics)', ''];

  // Lead time for resolved issues
  const resolved = issues.filter(i => i.resolutionDate && i.created);
  if (resolved.length > 0) {
    const leadTimes = resolved.map(i =>
      daysBetween(parseDate(i.created), parseDate(i.resolutionDate!))
    );
    const med = median(leadTimes);
    const avg = mean(leadTimes);
    lines.push(`**Lead time (resolved):** median ${med.toFixed(1)} days, mean ${avg.toFixed(1)} days (${resolved.length} issues)`);

    // Throughput
    const createdDates = resolved.map(i => parseDate(i.resolutionDate!).getTime());
    const earliest = Math.min(...createdDates);
    const latest = Math.max(...createdDates);
    const weeks = Math.max(1, (latest - earliest) / (7 * 24 * 60 * 60 * 1000));
    const throughput = resolved.length / weeks;
    lines.push(`**Throughput:** ${throughput.toFixed(1)} issues/week`);
  } else {
    lines.push('**Lead time:** no resolved issues in set');
  }

  // Age of open issues
  const open = issues.filter(i => !i.resolutionDate && i.created);
  if (open.length > 0) {
    const ages = open.map(i => daysBetween(parseDate(i.created), now));
    const avgAge = mean(ages);
    lines.push(`**Open issue age:** mean ${avgAge.toFixed(1)} days (${open.length} issues)`);

    // Oldest open
    const oldest = open
      .map(i => ({ key: i.key, age: daysBetween(parseDate(i.created), now) }))
      .sort((a, b) => b.age - a.age)
      .slice(0, 5);
    const oldestStr = oldest.map(o => `${o.key} (${o.age}d)`).join(', ');
    lines.push(`**Oldest open:** ${oldestStr}`);

    // Staleness — how long since last update
    const staleness = open.map(i => ({
      key: i.key,
      days: daysBetween(parseDate(i.updated), now),
    }));
    const buckets = { fresh: 0, aging: 0, stale: 0, abandoned: 0 };
    for (const s of staleness) {
      if (s.days < 7) buckets.fresh++;
      else if (s.days < 30) buckets.aging++;
      else if (s.days < 90) buckets.stale++;
      else buckets.abandoned++;
    }
    lines.push(`**Staleness:** <7d: ${buckets.fresh} | 7-30d: ${buckets.aging} | 30-90d: ${buckets.stale} | 90d+: ${buckets.abandoned}`);

    // Most stale open issues
    const mostStale = staleness
      .sort((a, b) => b.days - a.days)
      .slice(0, 5);
    if (mostStale.length > 0 && mostStale[0].days >= 30) {
      const staleStr = mostStale.map(s => `${s.key} (${s.days}d)`).join(', ');
      lines.push(`**Most stale:** ${staleStr}`);
    }

    // Status age — how long in current status
    const withStatusAge = open.filter(i => i.statusCategoryChanged);
    if (withStatusAge.length > 0) {
      const statusAges = withStatusAge.map(i =>
        daysBetween(parseDate(i.statusCategoryChanged!), now)
      );
      const med = median(statusAges);
      const avg = mean(statusAges);
      lines.push(`**Status age:** median ${med.toFixed(1)} days, mean ${avg.toFixed(1)} days in current status (${withStatusAge.length} issues)`);

      const stuck = withStatusAge
        .map(i => ({ key: i.key, status: i.status, days: daysBetween(parseDate(i.statusCategoryChanged!), now) }))
        .filter(s => s.days >= 30)
        .sort((a, b) => b.days - a.days)
        .slice(0, 5);
      if (stuck.length > 0) {
        const stuckStr = stuck.map(s => `${s.key} ${s.status} (${s.days}d)`).join(', ');
        lines.push(`**Stuck:** ${stuckStr}`);
      }
    }
  }

  return lines.join('\n');
}

export function renderDistribution(issues: JiraIssueDetails[], groupLimit = DEFAULT_GROUP_LIMIT): string {
  const lines = ['## Distribution', ''];

  const byStatus = countBy(issues, i => i.status);
  lines.push(`**By status:** ${mapToString(byStatus, ' | ', groupLimit)}`);

  const byAssignee = countBy(issues, i => i.assignee || 'Unassigned');
  lines.push(`**By assignee:** ${mapToString(byAssignee, ' | ', groupLimit)}`);

  const byPriority = countBy(issues, i => i.priority || 'None');
  lines.push(`**By priority:** ${mapToString(byPriority, ' | ', groupLimit)}`);

  const byType = countBy(issues, i => i.issueType || 'Unknown');
  lines.push(`**By type:** ${mapToString(byType, ' | ', groupLimit)}`);

  const bySprint = countBy(issues, i => i.sprint || '(no sprint)');
  if (bySprint.size > 1 || !bySprint.has('(no sprint)')) {
    lines.push(`**By sprint:** ${mapToString(bySprint, ' | ', groupLimit)}`);
  }

  return lines.join('\n');
}

// ── Flow (bulk changelog) ─────────────────────────────────────────────

interface StatusFlowStats {
  status: string;
  entries: number;       // how many times issues entered this status
  totalDaysIn: number;   // total days spent across all visits
  issueCount: number;    // distinct issues that visited this status
  bounces: number;       // re-entries (entered more than once by same issue)
}

export async function renderFlow(jiraClient: JiraClient, issues: JiraIssueDetails[]): Promise<string> {
  if (issues.length === 0) return '## Flow\n\nNo issues to analyze.';

  const issueKeys = issues.map(i => i.key);
  // Build a map of issue key → issue ID for matching bulk response
  const keyToId = new Map<string, string>();
  const idToKey = new Map<string, string>();
  for (const issue of issues) {
    if (issue.id) {
      keyToId.set(issue.key, issue.id);
      idToKey.set(issue.id, issue.key);
    }
  }

  const changelogs = await jiraClient.getBulkChangelogs(issueKeys);

  // Aggregate per-status stats
  const statusStats = new Map<string, StatusFlowStats>();
  const issueBounceCounts = new Map<string, Map<string, number>>(); // issueId → status → entry count
  let totalTransitions = 0;

  for (const [issueId, transitions] of changelogs) {
    if (transitions.length === 0) continue;
    totalTransitions += transitions.length;

    // Sort transitions by date
    const sorted = [...transitions].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Track entries per status for this issue
    const issueStatusEntries = new Map<string, number>();

    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      const toStatus = t.to;

      // Count entries into the target status
      issueStatusEntries.set(toStatus, (issueStatusEntries.get(toStatus) || 0) + 1);

      // Calculate time spent in the target status
      const enteredAt = new Date(t.date).getTime();
      const exitedAt = i + 1 < sorted.length
        ? new Date(sorted[i + 1].date).getTime()
        : Date.now();
      const daysIn = (exitedAt - enteredAt) / (1000 * 60 * 60 * 24);

      const stats = statusStats.get(toStatus) || { status: toStatus, entries: 0, totalDaysIn: 0, issueCount: 0, bounces: 0 };
      stats.entries++;
      stats.totalDaysIn += daysIn;
      statusStats.set(toStatus, stats);
    }

    issueBounceCounts.set(issueId, issueStatusEntries);
  }

  // Count distinct issues and bounces per status
  const issuesPerStatus = new Map<string, Set<string>>();
  for (const [issueId, statusEntries] of issueBounceCounts) {
    for (const [status, count] of statusEntries) {
      if (!issuesPerStatus.has(status)) issuesPerStatus.set(status, new Set());
      issuesPerStatus.get(status)!.add(issueId);

      const stats = statusStats.get(status);
      if (stats && count > 1) {
        stats.bounces += count - 1;
      }
    }
  }
  for (const [status, issueSet] of issuesPerStatus) {
    const stats = statusStats.get(status);
    if (stats) stats.issueCount = issueSet.size;
  }

  if (statusStats.size === 0) {
    return '## Flow\n\nNo status transitions found in these issues.';
  }

  // Render table
  const lines = ['## Flow (Status Transitions)', ''];
  lines.push(`${totalTransitions} transitions across ${changelogs.size} issues`);
  lines.push('');
  lines.push('| Status | Entries | Avg days in | Bounce rate | Issues |');
  lines.push('|--------|--------:|------------:|------------:|-------:|');

  const sorted = [...statusStats.values()].sort((a, b) => b.entries - a.entries);
  for (const s of sorted) {
    const avgDays = s.entries > 0 ? (s.totalDaysIn / s.entries).toFixed(1) : '—';
    const bounceRate = s.issueCount > 0 ? Math.round((s.bounces / s.issueCount) * 100) : 0;
    lines.push(`| ${s.status} | ${s.entries} | ${avgDays} | ${bounceRate}% | ${s.issueCount} |`);
  }

  // Top bouncers — issues with most re-entries to any status
  const bouncerScores: Array<{ key: string; bounces: number }> = [];
  for (const [issueId, statusEntries] of issueBounceCounts) {
    const totalBounces = [...statusEntries.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
    if (totalBounces > 0) {
      const key = idToKey.get(issueId) || issueId;
      bouncerScores.push({ key, bounces: totalBounces });
    }
  }
  if (bouncerScores.length > 0) {
    bouncerScores.sort((a, b) => b.bounces - a.bounces);
    const top = bouncerScores.slice(0, 5);
    lines.push('');
    lines.push(`**Top bouncers:** ${top.map(b => `${b.key} (${b.bounces}×)`).join(', ')}`);
  }

  return lines.join('\n');
}

// ── Summary (count-based) ─────────────────────────────────────────────

interface CountRow {
  label: string;
  total: number;
  unresolved: number;
  overdue: number;
  highPriority: number;
  createdRecently: number;
  resolvedRecently: number;
  implicitMeasures?: Record<string, number>;
}

/** Extract project keys from JQL like "project in (AA, GC, GD)" or "project = AA" */
export function extractProjectKeys(jql: string): string[] {
  // project in (AA, GC, GD)
  const inMatch = jql.match(/project\s+in\s*\(([^)]+)\)/i);
  if (inMatch) {
    return inMatch[1].split(',').map(k => k.trim().replace(/['"]/g, ''));
  }
  // project = AA
  const eqMatch = jql.match(/project\s*=\s*['"]?(\w+)['"]?/i);
  if (eqMatch) {
    return [eqMatch[1]];
  }
  return [];
}

/** Remove the project clause from JQL, returning remaining constraints */
export function removeProjectClause(jql: string): string {
  return jql
    .replace(/project\s+in\s*\([^)]+\)\s*(AND\s*)?/i, '')
    .replace(/project\s*=\s*['"]?\w+['"]?\s*(AND\s*)?/i, '')
    .replace(/^\s*AND\s*/i, '')
    .replace(/\s*AND\s*$/i, '')
    .trim();
}

/** Run async tasks in batches to avoid API rate limiting */
async function batchParallel<T>(tasks: (() => Promise<T>)[], batchSize: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    results.push(...await Promise.all(batch.map(fn => fn())));
  }
  return results;
}

const ROW_BATCH_SIZE = 3; // ~18-33 concurrent count queries per batch

/** Build a scoped JQL by adding a condition to the base query */
function scopeJql(baseJql: string, condition: string): string {
  return `(${baseJql}) AND ${condition}`;
}

/** Implicit measures — lazily resolved if referenced in compute expressions.
 *  Built dynamically because some use custom field IDs. */
function buildImplicitMeasures(customFieldIds?: { startDate: string; storyPoints: string }): Record<string, string> {
  const measures: Record<string, string> = {
    bugs: 'issuetype = Bug AND resolution = Unresolved',
    unassigned: 'assignee is EMPTY AND resolution = Unresolved',
    no_due_date: 'dueDate is EMPTY AND resolution = Unresolved',
    blocked: 'status = Blocked',
    no_labels: 'labels is EMPTY AND resolution = Unresolved',
    stale: 'resolution = Unresolved AND updated <= -60d',
    stale_status: 'resolution = Unresolved AND statusCategoryChangedDate <= -30d',
    backlog_rot: 'resolution = Unresolved AND dueDate is EMPTY AND assignee is EMPTY AND updated <= -60d',
  };
  if (customFieldIds) {
    measures.no_estimate = `${customFieldIds.storyPoints} is EMPTY AND resolution = Unresolved`;
    measures.no_start_date = `${customFieldIds.startDate} is EMPTY AND resolution = Unresolved`;
  }
  return measures;
}

/** Map dimension values to JQL clauses for groupBy scoping */
export function groupByJqlClause(dimension: GroupByField, values: string[]): string[] {
  switch (dimension) {
    case 'project':
      return values.map(v => `project = ${v}`);
    case 'assignee':
      return values.map(v =>
        v === 'Unassigned' ? 'assignee is EMPTY' : `assignee = "${v}"`
      );
    case 'priority':
      return values.map(v => `priority = "${v}"`);
    case 'issuetype':
      return values.map(v => `issuetype = "${v}"`);
    case 'parent':
      return values.map(v =>
        v === '(no parent)' ? 'issue not in childIssuesOf("")' : `parent = ${v}`
      );
    case 'sprint':
      return values.map(v =>
        v === '(no sprint)' ? 'sprint is EMPTY' : `sprint = "${v}"`
      );
  }
}

async function buildCountRow(
  jiraClient: JiraClient,
  label: string,
  baseJql: string,
  implicitMeasureNames?: string[],
  implicitMeasureDefs?: Record<string, string>,
): Promise<CountRow> {
  const [total, unresolved, overdue, highPriority, createdRecently, resolvedRecently] = await Promise.all([
    jiraClient.countIssues(baseJql),
    jiraClient.countIssues(scopeJql(baseJql, 'resolution = Unresolved')),
    jiraClient.countIssues(scopeJql(baseJql, 'resolution = Unresolved AND dueDate < now()')),
    jiraClient.countIssues(scopeJql(baseJql, 'priority in (High, Highest, Critical, Blocker)')),
    jiraClient.countIssues(scopeJql(baseJql, 'created >= -7d')),
    jiraClient.countIssues(scopeJql(baseJql, 'resolved >= -7d')),
  ]);

  let implicitMeasures: Record<string, number> | undefined;
  if (implicitMeasureNames && implicitMeasureNames.length > 0 && implicitMeasureDefs) {
    const counts = await Promise.all(
      implicitMeasureNames.map(name =>
        jiraClient.countIssues(scopeJql(baseJql, implicitMeasureDefs[name]))
      )
    );
    implicitMeasures = {};
    for (let i = 0; i < implicitMeasureNames.length; i++) {
      implicitMeasures[implicitMeasureNames[i]] = counts[i];
    }
  }

  return { label, total, unresolved, overdue, highPriority, createdRecently, resolvedRecently, implicitMeasures };
}

export function renderSummaryTable(rows: CountRow[], computeColumns?: ComputeColumn[]): string {
  const lines = ['## Summary (exact counts)', ''];
  const extraHeaders = computeColumns?.map(c => c.name) ?? [];
  const headerExtra = extraHeaders.map(h => ` ${h} |`).join('');
  const alignExtra = extraHeaders.map(() => '---:|').join('');
  lines.push(`| Scope | Total | Open | Overdue | High+ | Created 7d | Resolved 7d |${headerExtra}`);
  lines.push(`|-------|------:|-----:|--------:|------:|-----------:|------------:|${alignExtra}`);
  for (const r of rows) {
    let computed = '';
    if (computeColumns && computeColumns.length > 0) {
      const rowMap = countRowToMap(r);
      const results = evaluateRow(computeColumns, rowMap);
      computed = results.map(res => {
        const val = typeof res.value === 'number' ? formatComputed(res.value) : res.value;
        return ` ${val} |`;
      }).join('');
    }
    lines.push(`| ${r.label} | ${r.total} | ${r.unresolved} | ${r.overdue} | ${r.highPriority} | ${r.createdRecently} | ${r.resolvedRecently} |${computed}`);
  }
  // Totals row if multiple
  if (rows.length > 1) {
    const sum = (fn: (r: CountRow) => number) => rows.reduce((s, r) => s + fn(r), 0);
    const totalExtra = extraHeaders.map(() => ' — |').join('');
    lines.push(`| **Total** | **${sum(r => r.total)}** | **${sum(r => r.unresolved)}** | **${sum(r => r.overdue)}** | **${sum(r => r.highPriority)}** | **${sum(r => r.createdRecently)}** | **${sum(r => r.resolvedRecently)}** |${totalExtra}`);
  }
  return lines.join('\n');
}

/** Convert a CountRow to a Map for DSL evaluation */
function countRowToMap(row: CountRow): Map<string, number> {
  const m = new Map<string, number>();
  m.set('total', row.total);
  m.set('open', row.unresolved);
  m.set('overdue', row.overdue);
  m.set('high', row.highPriority);
  m.set('created_7d', row.createdRecently);
  m.set('resolved_7d', row.resolvedRecently);
  // Add implicit measure values if present
  if (row.implicitMeasures) {
    for (const [k, v] of Object.entries(row.implicitMeasures)) {
      m.set(k, v);
    }
  }
  return m;
}

/** Format a computed number — round to 1 decimal if fractional */
function formatComputed(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Compute max groups that fit within the query budget */
function maxGroupsForBudget(implicitCount: number): number {
  const queriesPerGroup = STANDARD_MEASURES + implicitCount;
  return Math.floor(MAX_COUNT_QUERIES / queriesPerGroup);
}

async function handleSummary(jiraClient: JiraClient, jql: string, groupBy?: GroupByField, compute?: ComputeColumn[], groupLimit = DEFAULT_GROUP_LIMIT): Promise<string> {
  const lines: string[] = [];
  lines.push(`# Summary: ${jql}`);
  lines.push(`As of ${formatDateShort(new Date())} — counts are exact (no sampling cap)`);

  // Build implicit measures with custom field IDs for JQL construction
  const implicitDefs = buildImplicitMeasures(jiraClient.customFieldIds);
  const neededImplicits = compute ? detectImplicitMeasures(compute, implicitDefs) : [];
  const groupBudget = maxGroupsForBudget(neededImplicits.length);

  // Effective group cap: user's preference vs API query budget (whichever is smaller)
  const effectiveGroupCap = Math.min(groupLimit, groupBudget);

  if (groupBy === 'project' && extractProjectKeys(jql).length > 0) {
    // Fast path: project keys are explicit in JQL — no sampling needed
    let keys = extractProjectKeys(jql);
    const capped = keys.length > effectiveGroupCap;
    if (capped) keys = keys.slice(0, effectiveGroupCap);
    const remaining = removeProjectClause(jql);
    const rows = await batchParallel(
      keys.map(k => () => buildCountRow(jiraClient, k,
        remaining ? `project = ${k} AND (${remaining})` : `project = ${k}`,
        neededImplicits, implicitDefs
      )),
      ROW_BATCH_SIZE,
    );
    rows.sort((a, b) => b.unresolved - a.unresolved);
    lines.push('');
    lines.push(renderSummaryTable(rows, compute));
    if (capped) {
      const reason = effectiveGroupCap < groupBudget
        ? `groupLimit=${effectiveGroupCap} — increase groupLimit to see more`
        : `${MAX_COUNT_QUERIES}-query budget`;
      lines.push(`*Capped at ${effectiveGroupCap} groups (${reason})*`);
    }
  } else if (groupBy) {
    // For non-project groupBy, sample per-project for representative dimension values
    const issues = await samplePerProject(jiraClient, jql);
    if (issues.length === 0) {
      throw new McpError(ErrorCode.InvalidParams, `No issues matched JQL — cannot discover ${groupBy} values`);
    }
    const dims = extractDimensions(issues, groupLimit);
    const dim = dims.find(d => d.name === groupBy);
    if (!dim || dim.values.length === 0) {
      throw new McpError(ErrorCode.InvalidParams, `No ${groupBy} values found in sampled issues`);
    }

    // Cap groups to effective limit
    const cappedValues = dim.values.slice(0, effectiveGroupCap);

    const jqlClause = groupByJqlClause(groupBy, cappedValues);
    const rows = await batchParallel(
      cappedValues.map((value, idx) => () => buildCountRow(jiraClient, value,
        `(${jql}) AND ${jqlClause[idx]}`,
        neededImplicits, implicitDefs
      )),
      ROW_BATCH_SIZE,
    );
    rows.sort((a, b) => b.unresolved - a.unresolved);
    lines.push('');
    lines.push(renderSummaryTable(rows, compute));
    if (dim.count > cappedValues.length) {
      const reasons: string[] = [];
      if (cappedValues.length < dim.values.length) {
        reasons.push(effectiveGroupCap < groupBudget
          ? `groupLimit=${effectiveGroupCap} — increase groupLimit to see more`
          : `${MAX_COUNT_QUERIES}-query budget`);
      } else {
        reasons.push(`from ${issues.length}-issue sample`);
      }
      lines.push(`*Showing top ${cappedValues.length} of ${dim.count} ${groupBy} values (${reasons.join(', ')})*`);
    }
  } else {
    // No groupBy — single row for the whole JQL
    const row = await buildCountRow(jiraClient, 'All', jql, neededImplicits, implicitDefs);
    lines.push('');
    lines.push(renderSummaryTable([row], compute));
  }

  // Workload interpretation hint — steer LLMs to decompose before reporting raw numbers
  if (groupBy === 'assignee') {
    lines.push('');
    lines.push('*Interpretation tip: High open counts per person may include backlog, review, and future-planned work — not just active tasks. Before reporting workload, break down by status: `metrics: ["summary"], groupBy: "issuetype"` scoped to one assignee to distinguish active work from queued/backlog items.*');
  }

  return lines.join('\n');
}

/** Detect which implicit measures are referenced by compute expressions */
function detectImplicitMeasures(compute: ComputeColumn[], implicitMeasureDefs: Record<string, string>): string[] {
  const refs = extractColumnRefs(compute);
  return Object.keys(implicitMeasureDefs).filter(name => refs.has(name));
}

// ── Cube Setup ────────────────────────────────────────────────────────

interface DimensionInfo {
  name: string;
  values: string[];
  count: number;
}

/** Extract distinct dimension values from sampled issues */
export function extractDimensions(issues: JiraIssueDetails[], groupLimit = DEFAULT_GROUP_LIMIT): DimensionInfo[] {
  const dims: { name: string; extractor: (i: JiraIssueDetails) => string }[] = [
    { name: 'project', extractor: i => i.key.split('-')[0] },
    { name: 'status', extractor: i => i.status },
    { name: 'assignee', extractor: i => i.assignee || 'Unassigned' },
    { name: 'priority', extractor: i => i.priority || 'None' },
    { name: 'issuetype', extractor: i => i.issueType || 'Unknown' },
    { name: 'parent', extractor: i => i.parent || '(no parent)' },
    { name: 'sprint', extractor: i => i.sprint || '(no sprint)' },
  ];

  return dims.map(({ name, extractor }) => {
    const counts = new Map<string, number>();
    for (const issue of issues) {
      const val = extractor(issue);
      counts.set(val, (counts.get(val) || 0) + 1);
    }
    // Sort by count descending, cap at groupLimit
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, groupLimit);
    return {
      name,
      values: sorted.map(([v]) => v),
      count: counts.size,
    };
  });
}

/** Render cube setup response with dimension catalog and cost estimates */
export function renderCubeSetup(jql: string, sampleSize: number, dimensions: DimensionInfo[]): string {
  const lines = [`# Cube Setup: ${jql}`, `Sampled ${sampleSize} issues to discover dimensions.`, ''];

  // Dimension table
  lines.push('## Available Dimensions');
  lines.push('| Dimension | Distinct Values | Count |');
  lines.push('|-----------|----------------|------:|');
  for (const dim of dimensions) {
    const displayed = dim.values.slice(0, 5).join(', ');
    const more = dim.count > 5 ? ` +${dim.count - 5}` : '';
    lines.push(`| ${dim.name} | ${displayed}${more} | ${dim.count} |`);
  }

  // Available measures
  lines.push('');
  lines.push('## Available Measures');
  lines.push('Standard columns per group (via count API):');
  lines.push('- total, open, overdue, high+, created_7d, resolved_7d');
  lines.push('');
  lines.push('Implicit measures (lazily resolved if referenced in `compute`):');
  lines.push('- bugs, unassigned, no_due_date, no_estimate, no_start_date, no_labels, blocked, stale, stale_status, backlog_rot');

  // Suggested cubes with cost estimates
  lines.push('');
  lines.push(`## Suggested Cubes (budget: ${MAX_COUNT_QUERIES} queries)`);
  for (const dim of dimensions) {
    const groups = Math.min(dim.count, DEFAULT_GROUP_LIMIT);
    const queries = groups * STANDARD_MEASURES;
    const estSeconds = Math.max(1, Math.round(queries / 12)); // ~12 parallel queries/sec
    const withinBudget = queries <= MAX_COUNT_QUERIES;
    const badge = withinBudget ? '' : ' ⚠️ add compute measures to stay in budget';
    lines.push(`- \`groupBy: "${dim.name}"\` — ${groups} groups, ${queries} base queries (~${estSeconds}s)${badge}`);
  }

  return lines.join('\n');
}

/** Compute dynamic sample size: 20% of total, clamped to [50, 500] */
async function computeSampleSize(jiraClient: JiraClient, jql: string): Promise<number> {
  const total = await jiraClient.countIssues(jql);
  return Math.max(CUBE_SAMPLE_MIN, Math.min(CUBE_SAMPLE_MAX, Math.ceil(total * CUBE_SAMPLE_PCT)));
}

/** Sample issues across all projects in scope for representative dimension discovery */
async function samplePerProject(jiraClient: JiraClient, jql: string): Promise<JiraIssueDetails[]> {
  let projectKeys = extractProjectKeys(jql);

  if (projectKeys.length === 0) {
    const allProjects = await jiraClient.listProjects();
    projectKeys = allProjects.map(p => p.key);
  }

  const sampleSize = await computeSampleSize(jiraClient, jql);

  if (projectKeys.length <= 1) {
    const result = await jiraClient.searchIssuesLean(jql, sampleSize);
    return result.issues;
  }

  const remaining = removeProjectClause(jql);
  const perProject = Math.max(5, Math.floor(sampleSize / projectKeys.length));
  const samples = await Promise.all(
    projectKeys.map(async k => {
      const scopedJql = remaining ? `project = ${k} AND (${remaining})` : `project = ${k}`;
      try {
        const result = await jiraClient.searchIssuesLean(scopedJql, perProject);
        return result.issues;
      } catch {
        return [];
      }
    })
  );
  return samples.flat();
}

async function handleCubeSetup(jiraClient: JiraClient, jql: string): Promise<string> {
  const issues = await samplePerProject(jiraClient, jql);

  if (issues.length === 0) {
    return `# Cube Setup: ${jql}\n\nNo issues matched this query. Cannot discover dimensions.`;
  }

  // Extract dimensions — project dimension uses actual keys from sample
  // (samplePerProject ensures coverage across all projects in scope)
  const dimensions = extractDimensions(issues);

  return renderCubeSetup(jql, issues.length, dimensions);
}

// ── Hierarchy Metric ──────────────────────────────────────────────────

const MAX_HIERARCHY_ROOTS = 3;
const HIERARCHY_MAX_DEPTH = 3;
const HIERARCHY_MAX_ITEMS = 50;

async function renderHierarchy(issues: JiraIssueDetails[], graphqlClient: GraphQLClient): Promise<string> {
  const lines = ['## Hierarchy Rollups'];

  // Find root issues: those with parents not in the result set
  const issueKeys = new Set(issues.map(i => i.key));
  const parentKeys = new Set<string>();
  for (const issue of issues) {
    if (issue.parent && !issueKeys.has(issue.parent)) {
      parentKeys.add(issue.parent);
    }
  }
  // Also include issues in the set that have no parent (they are roots)
  for (const issue of issues) {
    if (!issue.parent) {
      parentKeys.add(issue.key);
    }
  }

  // If no hierarchy detected, say so
  if (parentKeys.size === 0) {
    lines.push('', '*No parent-child relationships detected in this issue set.*');
    return lines.join('\n');
  }

  // Walk each root (cap at MAX_HIERARCHY_ROOTS)
  const roots = [...parentKeys].slice(0, MAX_HIERARCHY_ROOTS);
  const walker = new GraphQLHierarchyWalker(graphqlClient);

  for (const rootKey of roots) {
    try {
      const { tree } = await walker.walkDown(rootKey, HIERARCHY_MAX_DEPTH, HIERARCHY_MAX_ITEMS);
      const rollup = GraphQLHierarchyWalker.computeRollups(tree);

      lines.push('');
      lines.push(`### ${rootKey}: ${tree.issue.summary}`);
      lines.push(`Progress: ${rollup.resolvedItems}/${rollup.totalItems} (${rollup.progressPct}%) | Points: ${rollup.totalPoints} (${rollup.earnedPoints} earned)`);
      if (rollup.rolledUpStart || rollup.rolledUpEnd) {
        lines.push(`Dates: ${rollup.rolledUpStart ?? '—'} – ${rollup.rolledUpEnd ?? '—'}`);
      }
      if (rollup.conflicts.length > 0) {
        lines.push(`Conflicts: ${rollup.conflicts.map(c => `${c.issueKey}: ${c.message}`).join('; ')}`);
      }
      lines.push('');
      renderRollupTree(tree, lines, ['dates', 'points', 'progress'], '', true);
    } catch {
      lines.push('', `*Could not walk hierarchy for ${rootKey}*`);
    }
  }

  if (parentKeys.size > MAX_HIERARCHY_ROOTS) {
    lines.push('', `*Showing ${MAX_HIERARCHY_ROOTS} of ${parentKeys.size} root issues. Use analyze_jira_plan for a focused subtree.*`);
  }

  return lines.join('\n');
}

// ── Cache → Issue Mapping ─────────────────────────────────────────────

/** Map a GraphIssue from cache to JiraIssueDetails for metric renderers */
function graphIssueToDetails(issue: GraphIssue): JiraIssueDetails {
  const statusCategoryMap: Record<string, JiraIssueDetails['statusCategory']> = {
    'To Do': 'new',
    'In Progress': 'indeterminate',
    'Done': 'done',
  };
  return {
    key: issue.key,
    summary: issue.summary,
    description: '',
    issueType: issue.issueType,
    priority: null,
    parent: issue.parentKey,
    assignee: issue.assignee,
    reporter: '',
    status: issue.status,
    statusCategory: statusCategoryMap[issue.statusCategory] ?? 'unknown',
    resolution: issue.isResolved ? 'Done' : null,
    labels: [],
    created: '',
    updated: '',
    resolutionDate: null,
    statusCategoryChanged: null,
    dueDate: issue.dueDate,
    startDate: issue.startDate,
    storyPoints: issue.storyPoints,
    sprint: null,
    timeEstimate: null,
    issueLinks: [],
  };
}

/** Flatten a cached hierarchy tree to JiraIssueDetails[] for existing metric renderers */
export function flattenCacheToIssueDetails(tree: GraphTreeNode): JiraIssueDetails[] {
  const issues: JiraIssueDetails[] = [];
  walkTree(tree, (node) => {
    issues.push(graphIssueToDetails(node.issue));
  });
  return issues;
}

// ── DataRef Handler (cached plan data) ─────────────────────────────────

async function handleDataRefAnalysis(
  cached: import('../types/index.js').CachedWalk,
  args: Record<string, unknown>,
  graphqlClient?: GraphQLClient | null,
  groupLimit = DEFAULT_GROUP_LIMIT,
) {
  const allIssues = flattenCacheToIssueDetails(cached.tree);

  const requested = (args.metrics && Array.isArray(args.metrics))
    ? args.metrics as string[]
    : [];
  const fetchMetrics = requested.length > 0
    ? requested.filter(m => ALL_METRICS.includes(m as MetricGroup)) as MetricGroup[]
    : ALL_METRICS;
  const hasHierarchy = requested.includes('hierarchy');

  const now = new Date();
  const lines: string[] = [];
  lines.push(`# Analysis: ${cached.rootKey} (from cache)`);
  lines.push(`Analyzing ${allIssues.length} issues from cached hierarchy walk`);
  lines.push('');

  const renderers: Record<string, () => string> = {
    points: () => renderPoints(allIssues),
    time: () => renderTime(allIssues),
    schedule: () => renderSchedule(allIssues, now),
    cycle: () => renderCycle(allIssues, now),
    distribution: () => renderDistribution(allIssues, groupLimit),
  };

  for (const metric of fetchMetrics) {
    if (renderers[metric]) {
      lines.push(renderers[metric]());
      lines.push('');
    }
  }

  // Hierarchy renders the cached tree directly (no re-walk)
  if (hasHierarchy) {
    lines.push('## Hierarchy Rollups');
    lines.push('');
    const rollup = GraphQLHierarchyWalker.computeRollups(cached.tree);
    lines.push(`Progress: ${rollup.resolvedItems}/${rollup.totalItems} (${rollup.progressPct}%) | Points: ${rollup.totalPoints} (${rollup.earnedPoints} earned)`);
    if (rollup.rolledUpStart || rollup.rolledUpEnd) {
      lines.push(`Dates: ${rollup.rolledUpStart ?? '—'} – ${rollup.rolledUpEnd ?? '—'}`);
    }
    lines.push('');
    renderRollupTree(cached.tree, lines, ['dates', 'points', 'progress'], '', true);
  }

  // Flow not supported from cache — no changelog data
  if (requested.includes('flow')) {
    lines.push('');
    lines.push('## Flow\n\n*Flow metric requires changelog data and is not available from cached plan data. Use jql or filterId instead.*');
  }

  // Summary not supported from cache — needs count API
  if (requested.includes('summary')) {
    lines.push('');
    lines.push('## Summary\n\n*Summary metric uses the count API and is not available from cached plan data. Use jql or filterId instead.*');
  }

  const nextSteps = analysisNextSteps(`dataRef:${cached.rootKey}`, allIssues.slice(0, 3).map(i => i.key), false, undefined);
  lines.push(nextSteps);

  return {
    content: [{
      type: 'text',
      text: lines.join('\n'),
    }],
  };
}

// ── Main Handler ───────────────────────────────────────────────────────

export async function handleAnalysisRequest(jiraClient: JiraClient, request: any, graphqlClient?: GraphQLClient | null, cache?: GraphObjectCache) {
  const args = normalizeArgs(request.params?.arguments || {});

  // Parse groupLimit early — needed by dataRef path and summary path
  const rawGroupLimit = Number(args.groupLimit);
  const groupLimit = rawGroupLimit > 0 ? rawGroupLimit : DEFAULT_GROUP_LIMIT;

  // dataRef: analyze cached plan data instead of fetching from Jira
  const dataRef = args.dataRef as string | undefined;
  if (dataRef && typeof dataRef === 'string' && dataRef.trim() !== '') {
    if (!cache) {
      throw new McpError(ErrorCode.InvalidParams, 'dataRef requires the graph object cache (start a walk with analyze_jira_plan first).');
    }
    const cached = cache.get(dataRef);
    if (!cached) {
      throw new McpError(ErrorCode.InvalidParams, `No cached walk for "${dataRef}". Start one with analyze_jira_plan first.`);
    }
    if (cached.state === 'walking') {
      return {
        content: [{
          type: 'text',
          text: `Walk for ${dataRef} is still in progress (${cached.itemCount} items so far). Try again shortly.`,
        }],
      };
    }
    return handleDataRefAnalysis(cached, args, graphqlClient, groupLimit);
  }

  // Resolve JQL: filterId takes precedence over inline jql
  let jql: string;
  let filterSource: string | undefined;
  const filterId = args.filterId as string | undefined;
  if (filterId && typeof filterId === 'string' && filterId.trim() !== '') {
    let filter: { name?: string; jql?: string };
    try {
      filter = await jiraClient.getFilter(filterId);
    } catch {
      throw new McpError(ErrorCode.InvalidParams, `Filter ${filterId} not found or not accessible. Use manage_jira_filter with operation "list" to see available filters.`);
    }
    if (!filter.jql) {
      throw new McpError(ErrorCode.InvalidParams, `Filter ${filterId} has no JQL query.`);
    }
    jql = filter.jql;
    filterSource = `${filter.name || filterId} (filter ${filterId})`;
  } else {
    jql = args.jql as string;
    if (!jql || typeof jql !== 'string' || jql.trim() === '') {
      throw new McpError(ErrorCode.InvalidParams, 'Either jql, filterId, or dataRef parameter is required.');
    }
  }

  // Parse requested metrics
  const requested = (args.metrics && Array.isArray(args.metrics))
    ? args.metrics as string[]
    : [];
  const hasSummary = requested.includes('summary');
  const hasCubeSetup = requested.includes('cube_setup');
  const hasFlow = requested.includes('flow');
  const hasHierarchy = requested.includes('hierarchy');
  const fetchMetrics = requested.length > 0
    ? requested.filter(m => ALL_METRICS.includes(m as MetricGroup)) as MetricGroup[]
    : ALL_METRICS;
  // flow and hierarchy need issue fetching but aren't in ALL_METRICS (opt-in only)
  const needsIssueFetch = fetchMetrics.length > 0 || hasFlow || hasHierarchy;

  // Parse groupBy
  const groupBy = (typeof args.groupBy === 'string' && VALID_GROUP_BY.includes(args.groupBy as GroupByField))
    ? args.groupBy as GroupByField
    : undefined;

  // Parse compute expressions
  let compute: ComputeColumn[] | undefined;
  if (args.compute && Array.isArray(args.compute) && args.compute.length > 0) {
    compute = parseComputeList(args.compute as string[]);
  }

  // Cube setup — discover dimensions from sample, no issue fetching
  if (hasCubeSetup) {
    const cubeText = await handleCubeSetup(jiraClient, jql);
    const nextSteps = analysisNextSteps(jql, [], false, undefined, filterSource);
    const banner = filterSource ? `*Using saved filter: ${filterSource}*\n\n` : '';
    return {
      content: [{
        type: 'text',
        text: banner + cubeText + '\n' + nextSteps,
      }],
    };
  }

  // If only summary requested (no flow or detail metrics), skip issue fetching entirely
  if (hasSummary && !needsIssueFetch) {
    const summaryText = await handleSummary(jiraClient, jql, groupBy, compute, groupLimit);
    const nextSteps = analysisNextSteps(jql, [], false, groupBy, filterSource);
    const banner = filterSource ? `*Using saved filter: ${filterSource}*\n\n` : '';
    return {
      content: [{
        type: 'text',
        text: banner + summaryText + '\n' + nextSteps,
      }],
    };
  }

  const maxResults = Math.min(Number(args.maxResults) || MAX_ISSUES_DEFAULT, MAX_ISSUES_HARD);

  // Fetch issues using cursor-based pagination (50 per page, Jira enhanced search API)
  const allIssues: JiraIssueDetails[] = [];
  const seen = new Set<string>();
  let nextPageToken: string | undefined;
  let truncated = false;
  const maxPages = Math.ceil(maxResults / 50) + 1;
  let pageCount = 0;

  while (allIssues.length < maxResults) {
    if (++pageCount > maxPages) break;
    const remaining = maxResults - allIssues.length;
    const result = await jiraClient.searchIssuesLean(jql, Math.min(50, remaining), nextPageToken);
    for (const issue of result.issues) {
      if (!seen.has(issue.key)) {
        seen.add(issue.key);
        allIssues.push(issue);
      }
    }

    if (!result.pagination.hasMore || result.issues.length === 0) break;
    nextPageToken = result.pagination.nextPageToken;

    if (allIssues.length >= maxResults) {
      truncated = result.pagination.hasMore;
      break;
    }
  }

  if (allIssues.length === 0 && !hasSummary) {
    return {
      content: [{
        type: 'text',
        text: `# Analysis\n\n**JQL:** \`${jql}\`\n\nNo issues matched this query.`,
      }],
    };
  }

  const now = new Date();
  const lines: string[] = [];

  if (filterSource) {
    lines.push(`*Using saved filter: ${filterSource}*`);
    lines.push('');
  }

  // Summary first if requested alongside other metrics
  if (hasSummary) {
    const summaryText = await handleSummary(jiraClient, jql, groupBy, compute, groupLimit);
    lines.push(summaryText);
  }

  // Header for fetch-based metrics
  if ((fetchMetrics.length > 0 || hasFlow) && allIssues.length > 0) {
    if (hasSummary) lines.push('');
    lines.push(`# Detail: ${jql}`);
    lines.push(`Analyzed ${allIssues.length} issues (as of ${formatDateShort(now)})`);
    if (truncated) {
      lines.push(`*Results capped at ${maxResults} issues — distributions below are approximate. For exact counts, use metrics: ["summary"] with groupBy instead.*`);
    }

    // Render requested metrics
    const renderers: Record<string, () => string> = {
      points: () => renderPoints(allIssues),
      time: () => renderTime(allIssues),
      schedule: () => renderSchedule(allIssues, now),
      cycle: () => renderCycle(allIssues, now),
      distribution: () => renderDistribution(allIssues, groupLimit),
    };

    for (const metric of fetchMetrics) {
      lines.push('');
      lines.push(renderers[metric]());
    }
  }

  // Flow is opt-in and requires async bulk changelog fetch
  if (hasFlow && allIssues.length > 0) {
    lines.push('');
    lines.push(await renderFlow(jiraClient, allIssues));
  }

  // Hierarchy is opt-in and requires GraphQL client
  if (hasHierarchy && allIssues.length > 0) {
    lines.push('');
    if (graphqlClient) {
      lines.push(await renderHierarchy(allIssues, graphqlClient));
    } else {
      lines.push('## Hierarchy\n\n*Hierarchy metric requires GraphQL (cloudId discovery). Not available for this instance.*');
    }
  }

  // Next steps
  const nextSteps = analysisNextSteps(jql, allIssues.slice(0, 3).map(i => i.key), truncated, groupBy, filterSource);
  lines.push(nextSteps);

  return {
    content: [{
      type: 'text',
      text: lines.join('\n'),
    }],
  };
}
