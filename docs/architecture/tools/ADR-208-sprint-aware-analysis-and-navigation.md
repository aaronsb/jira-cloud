---
status: Proposed
date: 2026-03-19
deciders:
  - aaronsb
related:
  - ADR-204
  - ADR-206
  - ADR-207
---

# ADR-208: Sprint-aware analysis and navigation

## Context

Sprint management is split across multiple tools: `manage_jira_sprint` has the CRUD primitives, `analyze_jira_issues` now has `groupBy: "sprint"`, and the graph object cache holds hierarchy data that may include sprint-bearing issues. The primitives work, but common sprint workflows require 3-4 tool calls because of discovery friction — you need a board ID to list sprints, a sprint ID to manage one, and neither is surfaced naturally in analysis output.

Meanwhile, the sprint field returns a rich object from Jira (id, name, state, boardId, dates) but we currently extract only the name string. The IDs needed for action are discarded.

The question: how should sprint awareness flow through the tool surface so that analysis naturally leads to action?

## Decision

Compose sprint awareness across three layers rather than adding new tools:

### 1. Preserve full sprint objects in issue data

The Jira sprint field (`customfield_10020`) returns an array of sprint objects:
```json
{ "id": 42, "name": "2026 CT 5", "state": "active", "boardId": 7 }
```

Currently `extractSprintName()` reduces this to a string. Instead, preserve the full object as structured data on `JiraIssueDetails`:

- `sprint: string | null` — display name (existing, for rendering)
- `sprintId: number | null` — sprint ID (for management actions)
- `sprintBoardId: number | null` — board ID (for navigation)
- `sprintState: string | null` — state (active/future/closed)

This makes every issue a navigation handle to its sprint and board.

### 2. Sprint-aware steering in analysis output

When `groupBy: "sprint"` or distribution shows sprint data, next-step suggestions should include actionable sprint operations with real IDs:

- `manage_jira_sprint { operation: "get", sprintId: 42 }` — sprint details
- `manage_jira_sprint { operation: "list", boardId: 7 }` — sibling sprints
- `analyze_jira_issues { jql: "sprint = 42", metrics: ["cycle"] }` — sprint metrics

The sprint IDs come from the issue data already in scope — no extra API calls.

### 3. Sprint discovery through plan cache

When the graph object cache enriches issues with REST data (the sparse enrichment pattern), sprint objects are included. This means:

- `analyze_jira_plan { issueKey: "IP-89" }` walks the hierarchy
- `analyze_jira_issues { dataRef: "IP-89", metrics: ["distribution"] }` shows sprint breakdown
- The cached sprint IDs enable immediate management actions

The plan cache becomes a natural sprint discovery mechanism — you don't need to know your board ID upfront, you discover sprints by analyzing work.

### Board tool enhancement

Add sprint summary to `manage_jira_board { operation: "get" }` — include active and next future sprint with issue counts. This is a rendering enhancement, not a new operation. One call shows the board's sprint state instead of requiring a separate `manage_jira_sprint list`.

## Consequences

### Positive

- Sprint workflows go from 3-4 calls to 1-2: analyze → act
- No new tools — existing surface composes naturally
- Sprint IDs flow through analysis output, enabling LLMs to chain actions without manual discovery
- Plan cache serves as sprint discovery mechanism for hierarchy-oriented work

### Negative

- `JiraIssueDetails` grows by 3 fields (sprintId, sprintBoardId, sprintState)
- Sprint object extraction is slightly more complex than name-only
- Board get response becomes longer with sprint summary

### Neutral

- Sprint field discovery (well-known schema type) is already implemented
- Sparse enrichment pattern (future) will carry sprint data into the graph cache
- Existing `sprint_review` prompt template can be updated to use sprint IDs directly

## Alternatives Considered

- **New `sprint_dashboard` tool** — rejected because it would duplicate analysis + sprint tool capabilities. The workflow is analysis → action, not a separate dashboard concept.
- **Sprint-centric tool redesign** — rejected because the current tool boundaries (manage vs analyze) are well-understood. Sprint awareness is a cross-cutting concern, not a tool boundary.
- **Sprint as a first-class cache dimension** — considered for future. The graph cache could index by sprint for fast sprint-scoped queries. Not needed now since JQL handles this efficiently.
