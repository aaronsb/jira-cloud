import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from '../client/jira-client.js';
import { JiraIssueDetails } from '../types/index.js';
import { analysisNextSteps } from '../utils/next-steps.js';
import { normalizeArgs } from '../utils/normalize-args.js';

// ── Types ──────────────────────────────────────────────────────────────

type MetricGroup = 'points' | 'time' | 'schedule' | 'cycle' | 'distribution' | 'summary';

const ALL_METRICS: MetricGroup[] = ['points', 'time', 'schedule', 'cycle', 'distribution'];
const VALID_GROUP_BY = ['project', 'assignee', 'priority', 'issuetype'] as const;
type GroupByField = typeof VALID_GROUP_BY[number];
const MAX_ISSUES = 500;

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

function mapToString(map: Map<string, number>, separator = ' | '): string {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${v}`)
    .join(separator);
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
  }

  return lines.join('\n');
}

export function renderDistribution(issues: JiraIssueDetails[]): string {
  const lines = ['## Distribution', ''];

  const byStatus = countBy(issues, i => i.status);
  lines.push(`**By status:** ${mapToString(byStatus)}`);

  const byAssignee = countBy(issues, i => i.assignee || 'Unassigned');
  lines.push(`**By assignee:** ${mapToString(byAssignee)}`);

  const byPriority = countBy(issues, i => i.priority || 'None');
  lines.push(`**By priority:** ${mapToString(byPriority)}`);

  const byType = countBy(issues, i => i.issueType || 'Unknown');
  lines.push(`**By type:** ${mapToString(byType)}`);

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
}

/** Extract project keys from JQL like "project in (AA, GC, GD)" or "project = AA" */
function extractProjectKeys(jql: string): string[] {
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

/** Build a scoped JQL by adding a condition to the base query */
function scopeJql(baseJql: string, condition: string): string {
  return `(${baseJql}) AND ${condition}`;
}

async function buildCountRow(jiraClient: JiraClient, label: string, baseJql: string): Promise<CountRow> {
  const [total, unresolved, overdue, highPriority, createdRecently, resolvedRecently] = await Promise.all([
    jiraClient.countIssues(baseJql),
    jiraClient.countIssues(scopeJql(baseJql, 'resolution = Unresolved')),
    jiraClient.countIssues(scopeJql(baseJql, 'resolution = Unresolved AND dueDate < now()')),
    jiraClient.countIssues(scopeJql(baseJql, 'priority in (High, Highest, Critical, Blocker)')),
    jiraClient.countIssues(scopeJql(baseJql, 'created >= -7d')),
    jiraClient.countIssues(scopeJql(baseJql, 'resolved >= -7d')),
  ]);
  return { label, total, unresolved, overdue, highPriority, createdRecently, resolvedRecently };
}

export function renderSummaryTable(rows: CountRow[]): string {
  const lines = ['## Summary (exact counts)', ''];
  lines.push('| Scope | Total | Open | Overdue | High+ | Created 7d | Resolved 7d |');
  lines.push('|-------|------:|-----:|--------:|------:|-----------:|------------:|');
  for (const r of rows) {
    lines.push(`| ${r.label} | ${r.total} | ${r.unresolved} | ${r.overdue} | ${r.highPriority} | ${r.createdRecently} | ${r.resolvedRecently} |`);
  }
  // Totals row if multiple
  if (rows.length > 1) {
    const sum = (fn: (r: CountRow) => number) => rows.reduce((s, r) => s + fn(r), 0);
    lines.push(`| **Total** | **${sum(r => r.total)}** | **${sum(r => r.unresolved)}** | **${sum(r => r.overdue)}** | **${sum(r => r.highPriority)}** | **${sum(r => r.createdRecently)}** | **${sum(r => r.resolvedRecently)}** |`);
  }
  return lines.join('\n');
}

async function handleSummary(jiraClient: JiraClient, jql: string, groupBy?: GroupByField): Promise<string> {
  const lines: string[] = [];
  lines.push(`# Summary: ${jql}`);
  lines.push(`As of ${formatDateShort(new Date())} — counts are exact (no sampling cap)`);

  if (groupBy === 'project') {
    const keys = extractProjectKeys(jql);
    if (keys.length === 0) {
      throw new McpError(ErrorCode.InvalidParams, 'groupBy "project" requires project keys in JQL (e.g., project in (AA, GC))');
    }
    const rows = await Promise.all(
      keys.map(k => buildCountRow(jiraClient, k, `project = ${k}`))
    );
    rows.sort((a, b) => b.unresolved - a.unresolved);
    lines.push('');
    lines.push(renderSummaryTable(rows));
  } else if (groupBy) {
    // For non-project groupBy, get the overall count first
    const overallRow = await buildCountRow(jiraClient, 'All', jql);
    lines.push('');
    lines.push(renderSummaryTable([overallRow]));
    lines.push('');
    lines.push(`*groupBy "${groupBy}" — only "project" supports per-group breakdown currently. Other dimensions coming soon.*`);
  } else {
    // No groupBy — single row for the whole JQL
    const row = await buildCountRow(jiraClient, 'All', jql);
    lines.push('');
    lines.push(renderSummaryTable([row]));
  }

  return lines.join('\n');
}

// ── Main Handler ───────────────────────────────────────────────────────

export async function handleAnalysisRequest(jiraClient: JiraClient, request: any) {
  const args = normalizeArgs(request.params?.arguments || {});

  const jql = args.jql as string;
  if (!jql || typeof jql !== 'string' || jql.trim() === '') {
    throw new McpError(ErrorCode.InvalidParams, 'jql parameter is required.');
  }

  // Parse requested metrics
  const requested = (args.metrics && Array.isArray(args.metrics))
    ? args.metrics as string[]
    : [];
  const hasSummary = requested.includes('summary');
  const fetchMetrics = requested.length > 0
    ? requested.filter(m => ALL_METRICS.includes(m as MetricGroup)) as MetricGroup[]
    : ALL_METRICS;

  // Parse groupBy
  const groupBy = (typeof args.groupBy === 'string' && VALID_GROUP_BY.includes(args.groupBy as GroupByField))
    ? args.groupBy as GroupByField
    : undefined;

  // If only summary requested, skip issue fetching entirely
  if (hasSummary && fetchMetrics.length === 0) {
    const summaryText = await handleSummary(jiraClient, jql, groupBy);
    const nextSteps = analysisNextSteps(jql, []);
    return {
      content: [{
        type: 'text',
        text: summaryText + '\n' + nextSteps,
      }],
    };
  }

  const DEFAULT_MAX = 100;
  const maxResults = Math.min(Number(args.maxResults) || DEFAULT_MAX, MAX_ISSUES);

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

  // Summary first if requested alongside other metrics
  if (hasSummary) {
    const summaryText = await handleSummary(jiraClient, jql, groupBy);
    lines.push(summaryText);
  }

  // Header for fetch-based metrics
  if (fetchMetrics.length > 0 && allIssues.length > 0) {
    if (hasSummary) lines.push('');
    lines.push(`# Detail: ${jql}`);
    lines.push(`Analyzed ${allIssues.length} issues (as of ${formatDateShort(now)})`);
    if (truncated) {
      lines.push(`*Results capped at ${maxResults} issues — query may match more.*`);
    }

    // Render requested metrics
    const renderers: Record<string, () => string> = {
      points: () => renderPoints(allIssues),
      time: () => renderTime(allIssues),
      schedule: () => renderSchedule(allIssues, now),
      cycle: () => renderCycle(allIssues, now),
      distribution: () => renderDistribution(allIssues),
    };

    for (const metric of fetchMetrics) {
      lines.push('');
      lines.push(renderers[metric]());
    }
  }

  // Next steps
  const nextSteps = analysisNextSteps(jql, allIssues.slice(0, 3).map(i => i.key));
  lines.push(nextSteps);

  return {
    content: [{
      type: 'text',
      text: lines.join('\n'),
    }],
  };
}
