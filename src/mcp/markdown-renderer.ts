/**
 * Markdown renderer for MCP tool responses
 *
 * Converts structured JSON responses to token-efficient markdown
 * that's optimized for AI assistant consumption.
 *
 * Design principles:
 * - Minimal tokens, maximum clarity
 * - Embedded navigation hints (suggested next actions)
 * - Human-readable pagination guidance
 * - Plain text structure over decorative formatting
 */

import { JiraIssueDetails, TransitionDetails, SearchPagination } from '../types/index.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a date string to a more readable format
 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Not set';
  // Date-only strings (YYYY-MM-DD) are parsed as UTC midnight by Date constructor,
  // then toLocaleDateString shifts them by local TZ offset — causing off-by-one.
  // Parse date-only values directly to avoid timezone shifting.
  const dateOnly = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  // Full datetime strings include timezone info, so they render correctly.
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Format seconds into human-readable duration (e.g. 1d 2h, 3h 30m) */
export function formatDuration(seconds: number): string {
  if (seconds === 0) return '0m';
  const days = Math.floor(seconds / 28800); // 8h workday
  const hours = Math.floor((seconds % 28800) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.length > 0 ? parts.join(' ') : '0m';
}

/**
 * Format status with visual indicator
 */
function formatStatus(status: string): string {
  const statusIcons: Record<string, string> = {
    'Done': '[x]',
    'Closed': '[x]',
    'Resolved': '[x]',
    'In Progress': '[>]',
    'In Review': '[>]',
    'To Do': '[ ]',
    'Open': '[ ]',
    'Backlog': '[-]',
  };
  const icon = statusIcons[status] || '[?]';
  return `${icon} ${status}`;
}

/**
 * Truncate text to a maximum length with ellipsis
 */
function truncate(text: string, maxLength: number = 150): string {
  if (!text) return '';
  const cleaned = text.replace(/\n+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength).trim() + '...';
}

/**
 * Strip HTML tags for plain text display
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// Issue Rendering
// ============================================================================

/**
 * How to render the populated-custom-fields section on an issue (ADR-214).
 * - `dump`: print the full `Custom Fields:` block (the pre-ADR-214 behaviour).
 * - `breadcrumb` (default for `get`): one-line hint pointing at `expand: ["custom_fields"]`
 *   and the scoped `jira://custom-fields/{proj}/{type}` resource. Silent if zero are populated.
 * - `none`: render nothing — used after writes where the `Applied:` section is the read-out.
 */
export interface RenderIssueOptions {
  customFields?: 'breadcrumb' | 'dump' | 'none';
  projectKey?: string;
  issueTypeName?: string;
}

/**
 * Render a single issue as markdown
 */
export function renderIssue(
  issue: JiraIssueDetails,
  transitions?: TransitionDetails[],
  opts: RenderIssueOptions = {},
): string {
  const lines: string[] = [];

  lines.push(`# ${issue.key}: ${issue.summary}`);
  lines.push('');

  // Core fields — pipe-delimited
  const core = [issue.issueType, formatStatus(issue.status)];
  if (issue.priority) core.push(issue.priority);
  core.push(issue.assignee || 'Unassigned');
  lines.push(core.join(' | '));
  lines.push(`Reporter: ${issue.reporter}`);

  if (issue.parent) lines.push(`Parent: ${issue.parent}`);
  if (issue.labels && issue.labels.length > 0) lines.push(`Labels: ${issue.labels.join(', ')}`);

  // Dates — single line
  const dates: string[] = [];
  if (issue.created) dates.push(`Created ${formatDate(issue.created)}`);
  if (issue.updated) dates.push(`Updated ${formatDate(issue.updated)}`);
  if (issue.startDate) dates.push(`Start ${formatDate(issue.startDate)}`);
  if (issue.dueDate) dates.push(`Due ${formatDate(issue.dueDate)}`);
  if (issue.resolutionDate) dates.push(`Resolved ${formatDate(issue.resolutionDate)}`);
  if (dates.length > 0) lines.push(dates.join(' | '));

  if (issue.storyPoints) lines.push(`Points: ${issue.storyPoints}`);

  // Time tracking — consolidated line
  const timeParts: string[] = [];
  if (issue.originalEstimate != null) timeParts.push(`Estimate: ${formatDuration(issue.originalEstimate)}`);
  if (issue.timeEstimate != null) timeParts.push(`Remaining: ${formatDuration(issue.timeEstimate)}`);
  if (issue.timeSpent != null) timeParts.push(`Logged: ${formatDuration(issue.timeSpent)}`);
  if (timeParts.length > 0) lines.push(timeParts.join(' | '));
  if (issue.resolution) lines.push(`Resolution: ${issue.resolution}`);

  // Description — already markdown from ADF conversion
  if (issue.description) {
    lines.push('');
    lines.push('Description:');
    lines.push(issue.description);
  }

  // Issue links
  if (issue.issueLinks && issue.issueLinks.length > 0) {
    lines.push('');
    lines.push('Links:');
    for (const link of issue.issueLinks) {
      if (link.outward) lines.push(`${link.type} -> ${link.outward}`);
      if (link.inward) lines.push(`${link.type} <- ${link.inward}`);
    }
  }

  // Comments (if present)
  if (issue.comments && issue.comments.length > 0) {
    lines.push('');
    lines.push(`Comments (${issue.comments.length}):`);
    const recentComments = issue.comments.slice(-5);
    const startIdx = issue.comments.length - recentComments.length + 1;
    if (issue.comments.length > 5) {
      lines.push(`  +${issue.comments.length - 5} older comments`);
    }
    for (let i = 0; i < recentComments.length; i++) {
      const comment = recentComments[i];
      const preview = comment.body.split('\n').filter((l: string) => l.trim()).slice(0, 2).join(' | ');
      lines.push(`[${startIdx + i}/${issue.comments.length}] ${comment.author} (${formatDate(comment.created)}): ${truncate(preview, 200)}`);
    }
  }

  // Custom fields — progressive reveal (ADR-214). Default is a breadcrumb pointing at the
  // opt-in expand and the scoped resource; the full dump is gated behind `customFields: 'dump'`.
  // Zero populated → silent in every mode.
  const customFieldsMode = opts.customFields ?? 'breadcrumb';
  const populatedCount = issue.customFieldValues?.length ?? 0;
  if (customFieldsMode === 'dump' && populatedCount > 0) {
    lines.push('');
    lines.push('Custom Fields:');
    for (const cf of issue.customFieldValues!) {
      const displayValue = Array.isArray(cf.value)
        ? (cf.value as unknown[]).join(', ')
        : String(cf.value);
      lines.push(`${cf.name} (${cf.type}): ${displayValue}`);
    }
  } else if (customFieldsMode === 'breadcrumb' && populatedCount > 0) {
    lines.push('');
    // Issue-type names can contain spaces ("User Story", "Service Request") — the catalog
    // resource emitter encodes the type and the resolver decodes it (resource-handlers.ts:148, 533),
    // so the breadcrumb URI has to encode too or the link round-trips wrong.
    const uri = opts.projectKey && opts.issueTypeName
      ? ` For what's settable on this issue type: read \`jira://custom-fields/${opts.projectKey}/${encodeURIComponent(opts.issueTypeName)}\`.`
      : '';
    lines.push(
      `📋 ${populatedCount} populated custom field${populatedCount === 1 ? '' : 's'} not shown. ` +
      `To view: \`expand: ["custom_fields"]\`.${uri}`,
    );
  }

  // Status history (if requested via expand: ["history"])
  if (issue.statusHistory && issue.statusHistory.length > 0) {
    lines.push('');
    lines.push('Status History:');
    for (const h of issue.statusHistory) {
      lines.push(`${formatDate(h.date)}: ${h.from} → ${h.to} (by ${h.author})`);
    }
    // Show time in current status
    const last = issue.statusHistory[issue.statusHistory.length - 1];
    const daysSince = Math.floor((Date.now() - new Date(last.date).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince > 0) {
      lines.push(`*In "${last.to}" for ${daysSince} days*`);
    }
  }

  // Available transitions
  if (transitions && transitions.length > 0) {
    lines.push('');
    lines.push('Actions:');
    for (const t of transitions) {
      lines.push(`${t.name} -> ${t.to.name} (id: ${t.id})`);
    }
  }

  // People — accountIds for @mentions and assignee operations
  if (issue.people && issue.people.length > 0) {
    lines.push('');
    lines.push('People:');
    for (const person of issue.people) {
      lines.push(`${person.displayName} | ${person.role} | accountId: ${person.accountId}`);
    }
    lines.push('Use accountId to assign issues or @mention in comments');
  }

  // Formatting hint — remind the agent that descriptions/comments accept markdown
  lines.push('');
  lines.push('Formatting: write markdown for descriptions and comments (headings, **bold**, *italic*, ~~strikethrough~~, `code`, lists)');

  return lines.join('\n');
}

/**
 * Render issue search results as markdown
 */
export function renderIssueSearchResults(
  issues: JiraIssueDetails[],
  pagination: SearchPagination,
  jql?: string
): string {
  const lines: string[] = [];

  // Header
  if (jql) {
    lines.push(`# Search Results`);
    lines.push(`**JQL:** \`${jql}\``);
  } else {
    lines.push('# Issues');
  }
  lines.push(`Found ${pagination.total} issue${pagination.total !== 1 ? 's' : ''}`);
  lines.push('');

  // Status summary
  const statusCounts: Record<string, number> = {};
  for (const issue of issues) {
    statusCounts[issue.status] = (statusCounts[issue.status] || 0) + 1;
  }
  if (Object.keys(statusCounts).length > 1) {
    lines.push('**By Status:** ' + Object.entries(statusCounts)
      .map(([status, count]) => `${status}: ${count}`)
      .join(', '));
    lines.push('');
  }

  // Issues list
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const meta = [issue.key, issue.summary, formatStatus(issue.status), issue.assignee || 'Unassigned'];
    if (issue.priority) meta.push(issue.priority);
    if (issue.dueDate) meta.push(`due ${formatDate(issue.dueDate)}`);
    lines.push(meta.join(' | '));
    if (issue.description) {
      const desc = issue.description.split('\n').filter((l: string) => l.trim()).slice(0, 2).join(' | ');
      if (desc.length > 0) {
        lines.push(`  ${truncate(desc, 120)}`);
      }
    }
  }

  // Pagination guidance
  lines.push('---');
  if (pagination.hasMore) {
    const nextOffset = pagination.startAt + pagination.maxResults;
    lines.push(`Showing ${pagination.startAt + 1}-${pagination.startAt + issues.length} of ${pagination.total}`);
    lines.push(`**Next page:** Use startAt=${nextOffset}`);
  } else if (pagination.startAt > 0) {
    lines.push(`Showing ${pagination.startAt + 1}-${pagination.startAt + issues.length} of ${pagination.total} (last page)`);
  } else {
    lines.push(`Showing all ${issues.length} result${issues.length !== 1 ? 's' : ''}`);
  }

  return lines.join('\n');
}

// ============================================================================
// Project Rendering
// ============================================================================

export interface ProjectData {
  key: string;
  name: string;
  description?: string;
  lead?: string;
  projectTypeKey?: string;
  issueTypes?: Array<{ name: string; subtask: boolean }>;
  statusCounts?: Record<string, number>;
  boards?: Array<{ id: number; name: string; type: string }>;
  components?: Array<{ id: string; name: string }>;
  versions?: Array<{ id: string; name: string; released: boolean }>;
  recentIssues?: Array<{ key: string; summary: string; status: string }>;
}

export function renderProject(project: ProjectData): string {
  const lines: string[] = [];

  lines.push(`# ${project.key}: ${project.name}`);
  lines.push('');

  if (project.lead) {
    lines.push(`**Lead:** ${project.lead}`);
  }
  if (project.projectTypeKey) {
    lines.push(`**Type:** ${project.projectTypeKey}`);
  }

  if (project.description) {
    lines.push('');
    lines.push(truncate(stripHtml(project.description), 200));
  }

  // Issue types
  if (project.issueTypes && project.issueTypes.length > 0) {
    const regular = project.issueTypes.filter(t => !t.subtask).map(t => t.name);
    const subtasks = project.issueTypes.filter(t => t.subtask).map(t => t.name);
    const parts = [...regular];
    if (subtasks.length > 0) {
      parts.push(...subtasks.map(n => `${n} (subtask)`));
    }
    lines.push('');
    lines.push(`**Issue Types:** ${parts.join(', ')}`);
  }

  // Status counts
  if (project.statusCounts && Object.keys(project.statusCounts).length > 0) {
    lines.push('');
    lines.push('## Issue Summary');
    const total = Object.values(project.statusCounts).reduce((a, b) => a + b, 0);
    lines.push(`Total: ${total} issues`);
    for (const [status, count] of Object.entries(project.statusCounts)) {
      lines.push(`- ${status}: ${count}`);
    }
  }

  // Boards
  if (project.boards && project.boards.length > 0) {
    lines.push('');
    lines.push('## Boards');
    for (const board of project.boards) {
      lines.push(`- ${board.name} (${board.type}, id: ${board.id})`);
    }
  }

  // Recent issues
  if (project.recentIssues && project.recentIssues.length > 0) {
    lines.push('');
    lines.push('## Recent Issues');
    for (const issue of project.recentIssues) {
      lines.push(`- ${issue.key}: ${issue.summary} [${issue.status}]`);
    }
  }

  return lines.join('\n');
}

export function renderProjectList(projects: ProjectData[]): string {
  const lines: string[] = [];

  lines.push(`# Projects (${projects.length})`);
  lines.push('');

  for (const project of projects) {
    const parts = [project.key, project.name];
    if (project.lead) parts.push(project.lead);
    if (project.statusCounts) {
      const total = Object.values(project.statusCounts).reduce((a, b) => a + b, 0);
      parts.push(`${total} issues`);
    }
    lines.push(parts.join(' | '));
  }
  lines.push('');

  lines.push('---');
  lines.push(`Tip: Use manage_jira_project with operation="get" and projectKey="KEY" for details`);

  return lines.join('\n');
}

// ============================================================================
// Board Rendering
// ============================================================================

export interface BoardData {
  id: number;
  name: string;
  type: string;
  projectKey?: string;
  projectName?: string;
  sprints?: Array<{
    id: number;
    name: string;
    state: string;
    goal?: string;
  }>;
}

export function renderBoard(board: BoardData): string {
  const lines: string[] = [];

  lines.push(`# Board: ${board.name}`);
  lines.push(`**ID:** ${board.id}`);
  lines.push(`**Type:** ${board.type}`);
  if (board.projectKey) {
    lines.push(`**Project:** ${board.projectKey} (${board.projectName || ''})`);
  }

  if (board.sprints && board.sprints.length > 0) {
    lines.push('');
    lines.push('## Sprints');
    for (const sprint of board.sprints) {
      const stateIcon = sprint.state === 'active' ? '[>]' : sprint.state === 'closed' ? '[x]' : '[ ]';
      lines.push(`- ${stateIcon} ${sprint.name} (id: ${sprint.id})`);
      if (sprint.goal) {
        lines.push(`  Goal: ${truncate(sprint.goal, 80)}`);
      }
    }
  }

  return lines.join('\n');
}

export function renderBoardList(boards: BoardData[]): string {
  const lines: string[] = [];

  lines.push(`# Boards (${boards.length})`);
  lines.push('');

  // Group by type
  const byType: Record<string, BoardData[]> = {};
  for (const board of boards) {
    const type = board.type || 'other';
    if (!byType[type]) byType[type] = [];
    byType[type].push(board);
  }

  for (const [type, typeBoards] of Object.entries(byType)) {
    lines.push(`${type.charAt(0).toUpperCase() + type.slice(1)} Boards:`);
    for (const board of typeBoards) {
      lines.push(`${board.name} | id: ${board.id}${board.projectKey ? ` | ${board.projectKey}` : ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Sprint Rendering
// ============================================================================

// Simple issue type for sprint display (compatible with SprintIssue)
export interface SprintIssueData {
  key: string;
  summary: string;
  status: string;
  assignee?: string | null;
}

export interface SprintData {
  id: number;
  name: string;
  state: string;
  boardId: number;
  goal?: string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  issues?: SprintIssueData[];
}

export function renderSprint(sprint: SprintData): string {
  const lines: string[] = [];

  const stateIcon = sprint.state === 'active' ? '[ACTIVE]' : sprint.state === 'closed' ? '[CLOSED]' : '[FUTURE]';
  lines.push(`# Sprint: ${sprint.name} ${stateIcon}`);
  lines.push(`**ID:** ${sprint.id}`);
  lines.push(`**Board:** ${sprint.boardId}`);

  if (sprint.startDate) {
    lines.push(`**Started:** ${formatDate(sprint.startDate)}`);
  }
  if (sprint.endDate) {
    lines.push(`**Ends:** ${formatDate(sprint.endDate)}`);
  }
  if (sprint.completeDate) {
    lines.push(`**Completed:** ${formatDate(sprint.completeDate)}`);
  }

  if (sprint.goal) {
    lines.push('');
    lines.push('## Goal');
    lines.push(sprint.goal);
  }

  if (sprint.issues && sprint.issues.length > 0) {
    lines.push('');
    lines.push(`Issues (${sprint.issues.length}):`);

    // Group by status
    const byStatus: Record<string, SprintIssueData[]> = {};
    for (const issue of sprint.issues) {
      const status = issue.status || 'Unknown';
      if (!byStatus[status]) byStatus[status] = [];
      byStatus[status].push(issue);
    }

    for (const [status, statusIssues] of Object.entries(byStatus)) {
      lines.push(`${status} (${statusIssues.length}):`);
      for (const issue of statusIssues) {
        lines.push(`${issue.key} | ${issue.summary}${issue.assignee ? ` | ${issue.assignee}` : ''}`);
      }
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Filter Rendering
// ============================================================================

export interface FilterData {
  id: string;
  name: string;
  owner: string;
  favourite: boolean;
  jql?: string;
  description?: string;
  viewUrl?: string;
  issueCount?: number;
}

export function renderFilter(filter: FilterData): string {
  const lines: string[] = [];

  lines.push(`# Filter: ${filter.name}`);
  lines.push(`**ID:** ${filter.id}`);
  lines.push(`**Owner:** ${filter.owner}`);
  lines.push(`**Favorite:** ${filter.favourite ? 'Yes' : 'No'}`);

  if (filter.jql) {
    lines.push('');
    lines.push('## JQL');
    lines.push('```');
    lines.push(filter.jql);
    lines.push('```');
  }

  if (filter.description) {
    lines.push('');
    lines.push('## Description');
    lines.push(filter.description);
  }

  if (filter.issueCount !== undefined) {
    lines.push('');
    lines.push(`**Matches:** ${filter.issueCount} issues`);
  }

  lines.push('');
  lines.push('---');
  lines.push(`Tip: Use manage_jira_filter with operation="execute_filter" and filterId="${filter.id}" to run this filter`);

  return lines.join('\n');
}

export function renderFilterList(filters: FilterData[]): string {
  const lines: string[] = [];

  lines.push(`# Filters (${filters.length})`);
  lines.push('');

  // Separate favorites
  const favorites = filters.filter(f => f.favourite);
  const others = filters.filter(f => !f.favourite);

  if (favorites.length > 0) {
    lines.push('Favorites:');
    for (const filter of favorites) {
      lines.push(`${filter.name} | id: ${filter.id} | ${filter.owner}`);
    }
    lines.push('');
  }

  if (others.length > 0) {
    lines.push('Other Filters:');
    for (const filter of others) {
      lines.push(`${filter.name} | id: ${filter.id} | ${filter.owner}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Export convenience object
// ============================================================================

export const MarkdownRenderer = {
  // Issues
  renderIssue,
  renderIssueSearchResults,

  // Projects
  renderProject,
  renderProjectList,

  // Boards
  renderBoard,
  renderBoardList,

  // Sprints
  renderSprint,

  // Filters
  renderFilter,
  renderFilterList,

  // Helpers (exposed for custom use)
  helpers: {
    formatDate,
    formatStatus,
    truncate,
    stripHtml,
  }
};
