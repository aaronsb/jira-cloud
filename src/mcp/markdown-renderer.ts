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
import { FormattedResponse, ResponseMetadata, ResponseSummary } from '../utils/formatters/base-formatter.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a date string to a more readable format
 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Not set';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
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
 * Render a single issue as markdown
 */
export function renderIssue(issue: JiraIssueDetails, transitions?: TransitionDetails[]): string {
  const lines: string[] = [];

  lines.push(`# ${issue.key}: ${issue.summary}`);
  lines.push('');

  // Core fields
  lines.push(`**Status:** ${formatStatus(issue.status)}`);
  if (issue.assignee) {
    lines.push(`**Assignee:** ${issue.assignee}`);
  } else {
    lines.push(`**Assignee:** Unassigned`);
  }
  lines.push(`**Reporter:** ${issue.reporter}`);

  if (issue.parent) {
    lines.push(`**Parent:** ${issue.parent}`);
  }

  if (issue.dueDate) {
    lines.push(`**Due:** ${formatDate(issue.dueDate)}`);
  }

  if (issue.storyPoints) {
    lines.push(`**Points:** ${issue.storyPoints}`);
  }

  if (issue.resolution) {
    lines.push(`**Resolution:** ${issue.resolution}`);
  }

  // Description (truncated for token efficiency)
  if (issue.description) {
    lines.push('');
    lines.push('## Description');
    const desc = stripHtml(issue.description);
    lines.push(truncate(desc, 300));
  }

  // Issue links
  if (issue.issueLinks && issue.issueLinks.length > 0) {
    lines.push('');
    lines.push('## Links');
    for (const link of issue.issueLinks) {
      if (link.outward) {
        lines.push(`- ${link.type} -> ${link.outward}`);
      }
      if (link.inward) {
        lines.push(`- ${link.type} <- ${link.inward}`);
      }
    }
  }

  // Comments (if present)
  if (issue.comments && issue.comments.length > 0) {
    lines.push('');
    lines.push(`## Comments (${issue.comments.length})`);
    // Show last 3 comments
    const recentComments = issue.comments.slice(-3);
    for (const comment of recentComments) {
      lines.push(`- **${comment.author}** (${formatDate(comment.created)}): ${truncate(stripHtml(comment.body), 100)}`);
    }
    if (issue.comments.length > 3) {
      lines.push(`  ... and ${issue.comments.length - 3} more comments`);
    }
  }

  // Available transitions
  if (transitions && transitions.length > 0) {
    lines.push('');
    lines.push('## Available Actions');
    for (const t of transitions) {
      lines.push(`- **${t.name}** -> ${t.to.name} (id: ${t.id})`);
    }
  }

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
    const num = pagination.startAt + i + 1;
    lines.push(`## ${num}. ${issue.key}: ${issue.summary}`);
    lines.push(`${formatStatus(issue.status)} | ${issue.assignee || 'Unassigned'}`);
    if (issue.dueDate) {
      lines.push(`Due: ${formatDate(issue.dueDate)}`);
    }
    if (issue.description) {
      const desc = stripHtml(issue.description);
      if (desc.length > 0) {
        lines.push(`> ${truncate(desc, 120)}`);
      }
    }
    lines.push('');
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
    lines.push(`## ${project.key}: ${project.name}`);
    if (project.lead) {
      lines.push(`Lead: ${project.lead}`);
    }
    if (project.description) {
      lines.push(`> ${truncate(stripHtml(project.description), 100)}`);
    }
    if (project.statusCounts) {
      const total = Object.values(project.statusCounts).reduce((a, b) => a + b, 0);
      lines.push(`Issues: ${total}`);
    }
    lines.push('');
  }

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
    lines.push(`## ${type.charAt(0).toUpperCase() + type.slice(1)} Boards`);
    for (const board of typeBoards) {
      lines.push(`- **${board.name}** (id: ${board.id})${board.projectKey ? ` - ${board.projectKey}` : ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Sprint Rendering
// ============================================================================

export interface SprintData {
  id: number;
  name: string;
  state: string;
  boardId: number;
  goal?: string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  issues?: JiraIssueDetails[];
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
    lines.push(`## Issues (${sprint.issues.length})`);

    // Group by status
    const byStatus: Record<string, JiraIssueDetails[]> = {};
    for (const issue of sprint.issues) {
      const status = issue.status || 'Unknown';
      if (!byStatus[status]) byStatus[status] = [];
      byStatus[status].push(issue);
    }

    for (const [status, statusIssues] of Object.entries(byStatus)) {
      lines.push(`### ${status} (${statusIssues.length})`);
      for (const issue of statusIssues) {
        lines.push(`- ${issue.key}: ${issue.summary}${issue.assignee ? ` [${issue.assignee}]` : ''}`);
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
    lines.push('## Favorites');
    for (const filter of favorites) {
      lines.push(`- **${filter.name}** (id: ${filter.id}) - ${filter.owner}`);
    }
    lines.push('');
  }

  if (others.length > 0) {
    lines.push('## Other Filters');
    for (const filter of others) {
      lines.push(`- ${filter.name} (id: ${filter.id}) - ${filter.owner}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Generic Response Renderer
// ============================================================================

/**
 * Render any FormattedResponse to markdown
 * This is a fallback for responses that don't have a specific renderer
 */
export function renderGenericResponse<T>(response: FormattedResponse<T>): string {
  const lines: string[] = [];

  lines.push('# Response');
  lines.push('');

  // Render data as formatted JSON (but more compact)
  lines.push('```json');
  lines.push(JSON.stringify(response.data, null, 2));
  lines.push('```');

  // Metadata
  if (response._metadata) {
    if (response._metadata.pagination) {
      const p = response._metadata.pagination;
      lines.push('');
      lines.push(`**Pagination:** ${p.startAt + 1}-${p.startAt + p.maxResults} of ${p.total}${p.hasMore ? ' (more available)' : ''}`);
    }
    if (response._metadata.expansions && response._metadata.expansions.length > 0) {
      lines.push(`**Available expansions:** ${response._metadata.expansions.join(', ')}`);
    }
  }

  // Summary
  if (response._summary) {
    if (response._summary.suggested_actions && response._summary.suggested_actions.length > 0) {
      lines.push('');
      lines.push('## Suggested Actions');
      for (const action of response._summary.suggested_actions) {
        lines.push(`- ${action.text}`);
      }
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

  // Generic
  renderGenericResponse,

  // Helpers (exposed for custom use)
  helpers: {
    formatDate,
    formatStatus,
    truncate,
    stripHtml,
  }
};
