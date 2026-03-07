# Tool Reference

This document explains each tool's purpose, design patterns, and how they compose together. For installation and quick start, see the [README](../README.md).

## Tool Overview

| Tool | Purpose | Pattern |
|------|---------|---------|
| `manage_jira_issue` | CRUD, transitions, comments, links, hierarchy traversal | Operation dispatch |
| `manage_jira_filter` | JQL search, saved filter management | Search + pagination |
| `manage_jira_project` | Project listing and metadata | Metadata only |
| `manage_jira_board` | Board listing and configuration | Metadata only |
| `manage_jira_sprint` | Sprint lifecycle and issue assignment | State machine |
| `queue_jira_operations` | Batch multiple operations with result references | Orchestration |
| `analyze_jira_issues` | Counts, metrics, data cube analysis | Analytical workspace |

## Core Tools

### manage_jira_issue

The primary tool for working with individual issues. Supports `get`, `create`, `update`, `delete`, `move`, `transition`, `comment`, `link`, and `hierarchy` operations.

**Progressive disclosure via `expand`:** The default `get` response is compact — core fields only. Use `expand` to pull in additional data on demand:

- `comments` — full comment thread with `[N/total]` enumeration
- `transitions` — available workflow transitions with IDs
- `attachments` — file attachments
- `related_issues` — linked issues
- `history` — field change history

**Hierarchy traversal:** `operation: "hierarchy"` walks up/down the parent-child tree from any issue. Control depth with `up` (default 4, max 8) and `down` (default 4, max 8).

### manage_jira_filter

Handles JQL search (`execute_jql`) and saved filter management (`get`, `create`, `update`, `delete`, `list`, `execute_filter`).

**Cursor-based pagination:** Search results use Jira's enhanced search API with cursor pagination (not offset-based). Results include pagination guidance:

```
Showing 1-50 of 238
Next page: Use startAt=50
```

The server translates `startAt` into the appropriate cursor token internally.

### manage_jira_project

Lists projects or gets project configuration. Returns metadata — not issue counts.

For quantitative questions about projects (issue counts, workload comparisons, overdue rates), use `analyze_jira_issues` with `metrics: ["summary"]` instead. The analysis tool uses the count API which is faster and has no cap.

### manage_jira_board / manage_jira_sprint

Board and sprint management tools. Boards are read-only (list, get with optional sprint expansion). Sprints support full lifecycle: create, start (set state to `active`), close (set state to `closed`), and issue assignment via `manage_issues`.

## Workspace Tools

These tools handle multi-step analytical workflows rather than single CRUD operations.

### queue_jira_operations

Executes multiple operations in a single call. Operations run sequentially and can reference results from earlier operations.

**Result references:** Use `$N.field` to pass output from operation N into later operations:

```json
{
  "operations": [
    { "tool": "manage_jira_issue", "arguments": { "operation": "create", "projectKey": "AA", "issueType": "Story", "summary": "Parent" } },
    { "tool": "manage_jira_issue", "arguments": { "operation": "create", "projectKey": "AA", "issueType": "Task", "summary": "Child", "parent": "$0.key" } }
  ]
}
```

**Error strategies:** Each operation can set `errorStrategy: "continue"` to skip failures, or use the default `"bail"` to stop the queue on error.

**Detail levels:** `detail: "summary"` (default) returns one-line status per operation. `detail: "full"` returns complete output matching individual tool calls.

### analyze_jira_issues

The analytical workspace for quantitative questions. Uses the count API for exact numbers with no sampling cap, and lean search for metric computation.

**Metric groups:**

| Metric | Method | What it measures |
|--------|--------|-----------------|
| `summary` | Count API | Exact issue counts — total, open, overdue, high+, created/resolved 7d |
| `cube_setup` | Lean search (sample) | Discover dimensions and measures for cube queries |
| `points` | Lean search | Earned value, SPI, story point distribution |
| `time` | Lean search | Effort estimates by status bucket |
| `schedule` | Lean search | Overdue, due-soon, concentration risk |
| `cycle` | Lean search | Lead time, throughput, open issue age |
| `distribution` | Lean search | Counts by status, assignee, priority, type |

**Data cube pattern — two phases:**

1. **Discover** — `metrics: ["cube_setup"]` samples issues across all projects in scope, extracts dimension values, and shows cost estimates with a 150-query budget.

2. **Execute** — `metrics: ["summary"]` + `groupBy` + `compute` produces a cross-tabulated summary table with computed columns.

**groupBy dimensions:** `project`, `assignee`, `priority`, `issuetype`

**Standard measures** (always available): `total`, `open`, `overdue`, `high`, `created_7d`, `resolved_7d`

**Implicit measures** (resolved lazily via count API only when referenced in `compute`): `bugs`, `unassigned`, `no_due_date`, `no_estimate`, `no_start_date`, `no_labels`, `blocked`, `stale` (untouched 60d+), `stale_status` (stuck in status 30d+), `backlog_rot` (undated + unassigned + untouched 60d+)

**Compute DSL:** Arithmetic expressions evaluated per row.

```
bug_pct = bugs / total * 100
planning_gap = no_estimate / open * 100
clearing = resolved_7d > created_7d
```

- Operators: `+`, `-`, `*`, `/` (division by zero = 0), `>`, `<`, `>=`, `<=`, `==`, `!=`
- Comparisons produce Yes/No (stored as 1/0 internally)
- Max 5 expressions; later expressions can reference earlier ones
- 150-query budget per execution, dynamically partitioned across groups and measures

## MCP Resources

Static and dynamic resources available via `resource://` protocol.

| Resource | Content |
|----------|---------|
| `jira://instance/summary` | Instance-level statistics |
| `jira://projects/distribution` | Project distribution overview |
| `jira://projects/{key}/overview` | Project overview with status counts |
| `jira://boards/{id}/overview` | Board overview with sprint info |
| `jira://issue-link-types` | Available issue link types for `manage_jira_issue` link operations |
| `jira://custom-fields` | Custom field catalog (auto-discovered at startup) |
| `jira://custom-fields/{project}/{issueType}` | Context-specific custom fields for a project and issue type |
| `jira://analysis/recipes` | Battle-tested analysis query patterns and compute DSL reference |
| `jira://tools/{name}/documentation` | Per-tool documentation (one per tool) |

**Custom field discovery** runs automatically at startup, scanning the Jira instance for custom fields that are described, on at least one screen, unlocked, and a supported type. Results are cached and available via the resource URIs above.

## Design Patterns

### Token-Aware Rendering

All tool output is optimized for LLM consumption — minimal tokens, maximum signal.

- Plain text labels instead of markdown headings (`Status:` not `## Status`)
- Pipe-delimited fields on single lines (`KEY | Summary | Status | Assignee`)
- No bold, blockquotes, or decorative formatting in list views
- Full content in single-item views (no description truncation)
- Descriptions truncated only in search result lists

### Progressive Disclosure

Tools return compact defaults and expand on request, reducing context window pressure.

- **Issue get:** Core fields by default; `expand: ["comments", "transitions"]` for more
- **Comment enumeration:** `[8/12] Alice (Mar 1, 2026): comment text` — the `[N/total]` prefix signals there are more comments without fetching them all (last 5 shown)
- **Search results:** Summary lines with truncated descriptions; drill into individual issues for full content
- **Cube setup then execute:** `cube_setup` discovers what's available before committing to expensive count queries

### Elicitation via Next Steps

Every tool response includes contextual next-step suggestions — tool name, description, and example arguments. This guides multi-step workflows without requiring the caller to know the full API surface.

### Cursor-Based Pagination

Search and list operations use cursor-based pagination (Jira's enhanced search API). Results include:

- Count of total results and current page range
- Explicit next-page guidance when more results exist
- The server translates offset parameters to cursor tokens internally

### Adaptive Sampling

The analysis tool uses adaptive sampling for dimension discovery: count the total (instant via count API), sample 20% clamped to [50, 500], distribute the sample across all projects in scope. This ensures representative dimension values without fetching the full dataset.

### Rate-Limit-Aware Batching

Count queries are batched in groups of 3 rows at a time (each row fires 6-11 parallel count queries internally). This keeps concurrent API calls under ~33, avoiding Jira's search endpoint rate limits while maintaining fast execution.
