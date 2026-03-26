---
status: Draft
date: 2026-03-26
deciders:
  - aaronsb
  - claude
related:
  - ADR-204
  - ADR-206
  - ADR-207
---

# ADR-210: Townsquare Goals and Projects Integration

## Context

The analysis tools (`analyze_jira_issues`, `analyze_jira_plan`) operate on Jira issues — the execution layer. But issues don't exist in a vacuum. Organizations use Atlassian Goals (Townsquare) and Atlas Projects to capture strategic intent: *why* work exists, what outcome it drives, and how it connects to broader themes.

Today there's no way to ask "how is Goal X progressing?" through the MCP server. An LLM can analyze issues in a project, but it can't connect that analysis to the strategic layer above. The story from idea to execution is split across two unconnected API surfaces.

The MCP server already has 8 tools. Adding more increases the tool selection burden on the LLM and dilutes selection accuracy. This integration must fit into the existing tool surface, not grow it.

### What Townsquare Exposes

PoC validation against a live instance (Praecipio) confirmed the full graph is traversable via AGG (Atlassian GraphQL Gateway) using the same Basic Auth credentials as existing Jira tools. Three API surfaces are relevant:

**Goals (`goals_*` queries — GA)**

| Query | Purpose |
|-------|---------|
| `goals_search` | Search with TQL + sort, paginated |
| `goals_byId` / `goals_byIds` | Direct lookup by ARI |
| `goals_byKey` | Lookup by key (e.g., `PRAEC-25`) |
| `goals_goalTypes` | Goal type hierarchy |
| `goals_metricSearch` | Metric definitions |

**Projects (`projects_*` queries — GA, some fields need `@optIn(to: "Townsquare")`)**

| Query | Purpose |
|-------|---------|
| `projects_search` | Search with TQL |
| `projects_byId` / `projects_byIds` | Direct lookup |
| `projects_byKey` | Lookup by key |

**Focus Areas (`mercury` — experimental, `@optIn(to: "Mercury")`)**

Hierarchical strategic planning (Company → Strategy → Priority → Big Rock). Not activated on all instances. Deferred.

### The Traversable Hierarchy

A single GraphQL query can walk from a goal down to linked Jira issues:

```
Goal (state, owner, key, targetDate)
├── subGoals (recursive)
├── projects (Atlas projects, with state + risks)
└── workItems @optIn(to: "GraphStoreJiraEpicContributesToAtlasGoal")
    └── JiraIssue (key, summary, status, issueType, assignee, priority)
```

The `workItems` field resolves to a `JiraIssue` union type with full issue fields — including `key`, which bridges directly into the existing analysis pipeline.

### TQL (Townsquare Query Language)

`goals_search` accepts a `searchString` parameter with a SQL-like syntax:

| Pattern | Example | Status |
|---------|---------|--------|
| `name LIKE "<text>"` | `name LIKE "Health"` | Works |
| `status = <value>` | `status = on_track` | Works for `on_track`, `done` |
| `AND` combinator | `status = on_track AND name LIKE "partner"` | Works |
| Free text | `"Health"` | Works (less precise) |
| Empty string | `""` | Returns all |

**Known limitations:** `status = pending` returns empty despite pending goals existing (silent failure, no error). `!=` and `IN()` operators untested. Status filtering appears unreliable for some values.

**Sort enum values:** `HIERARCHY_ASC/DESC`, `NAME_ASC/DESC`, `CREATION_DATE_ASC/DESC`, `LATEST_UPDATE_DATE_ASC/DESC`, `TARGET_DATE_ASC/DESC`, `SCORE_ASC/DESC`, `PROJECT_COUNT_ASC/DESC`

`HIERARCHY_ASC` is particularly useful — it returns goals grouped by parent/child structure.

## Decision

Extend `analyze_jira_plan` with a `goalKey` parameter as an alternative entry point to `issueKey`. No new tools. The tool already walks hierarchies via GraphQL; goals are a higher node in the same graph.

### Schema Changes

Current `analyze_jira_plan` requires `issueKey`. The revised schema accepts either:

```typescript
// One of these is required, not both
issueKey?: string;  // Existing: walk Jira issue hierarchy
goalKey?: string;   // New: walk from a Townsquare goal
```

When `goalKey` is provided, the tool resolves the goal and its linked work items before entering the existing analysis pipeline. When neither is provided and no operation is specified, the tool lists available goals (discovery mode).

### Operations

| Operation | Parameter | Purpose |
|-----------|-----------|---------|
| `analyze` (existing) | `issueKey` | Walk issue hierarchy, compute metrics |
| `analyze` (extended) | `goalKey` | Resolve goal → work items → compute same metrics |
| `list_goals` | `searchString`, `sort` | Search goals with TQL, returns goal tree with state and linked work item counts |
| `get_goal` | `goalKey` | Get goal detail: sub-goals, projects, linked Jira issue keys |

`list_goals` and `get_goal` are discovery operations. They live on this tool rather than a separate `manage_goals` tool because (a) goals are read-only from this integration's perspective, (b) the value is in the pipeline from discovery to analysis in one tool, and (c) adding a ninth tool hurts LLM tool selection accuracy more than adding operations to an existing tool.

### Goal → Issue Resolution

When `analyze` is called with a `goalKey`:

1. Fetch goal by key via `goals_byKey`
2. Resolve `workItems` to get linked Jira issue keys (epics/initiatives)
3. Optionally walk `subGoals` to collect their `workItems` too
4. Pass collected keys into the analysis pipeline as `key in (KEY-1, KEY-2, ...)`
5. Render with the same metrics, prefixed with goal context (state, owner, progress)

**Resolution depth:** By default, stop at linked work items (epics/initiatives). These are the issues directly linked to goals in the Atlassian UI. The analysis pipeline receives these keys and computes metrics at that level. An optional `includeChildren: true` parameter can walk the children of those epics, but this is opt-in because it expands the issue set significantly.

**JQL IN clause limit:** Jira Cloud rejects queries with more than ~1000 keys. A top-level goal with 10 sub-goals averaging 20 linked epics yields ~200 keys — within limits. If `includeChildren` pushes past the ceiling, batch into multiple `key in (...)` queries and merge results. Document the practical limit in the tool response when it's hit.

### GraphQL Client Extension

The existing `GraphQLClient` (from ADR-207) handles cloudId discovery and AGG queries. Extend with:

- Goal search queries (TQL + sort + pagination)
- Goal detail queries (with `workItems` opt-in)
- Response mapping to normalize Townsquare types into the analysis pipeline

Same auth, same endpoint (`/gateway/api/graphql`), same client.

### TQL Mitigation Strategy

TQL status filtering is unreliable for some values (`pending` silently returns empty). The tool handles this by:

1. Pass TQL through to the API as-is
2. If the response is empty and the query contained a `status =` filter, append a note: "Status filtering may be incomplete for some values. Try without the status filter, or use `list_goals` with an empty search to see all goals."
3. Do not silently fetch-all and client-filter — that changes the semantics and hides the API limitation from the user

This is a pragmatic first approach. If status filtering proves problematic in practice, a later revision can add client-side filtering with a flag.

### Degradation Modes

| Failure | Impact | Behavior |
|---------|--------|----------|
| `workItems` opt-in removed | Goals discoverable but not connectable to issues | `list_goals` and `get_goal` still work. `analyze` with `goalKey` returns goal metadata with a message: "Cannot resolve linked Jira issues — the workItems API may have changed." |
| Goals not enabled on instance | No goal operations available | `list_goals` returns empty with a message: "No goals found. Goals may not be enabled on this instance." |
| `goals_search` unavailable | No discovery | Direct lookup via `goals_byKey` may still work. If both fail, surface the GraphQL error. |
| TQL returns unexpected results | Misleading search | Return results as-is with count. The LLM and user can judge relevance. |

### Caching

Goal metadata is **not cached** in the graph object cache. Goals change infrequently and the discovery queries are lightweight (single GraphQL call). Only the resolved Jira issue keys pass into the analysis pipeline, which handles its own caching per ADR-207.

If the graph object cache (future) supports goal-scoped walks, the `goalKey` parameter becomes another entry point for cache population — but that's a future concern, not a design constraint now.

### LLM Presentation

Goal tree rendering follows the hierarchy sort:

```
Theme 2: Increased Velocity [on_track] PRAEC-10
├── PMG production environment deployed [on_track] PRAEC-11
│   └── 3 linked issues: 2 In Progress, 1 Done
├── Complete 1+ live migration using PMG [pending] PRAEC-12
│   └── 4 linked issues: 4 Backlog
└── Establish velocity baselines [pending] PRAEC-14
    └── 2 linked issues: 2 Backlog
```

The signal is immediate: PRAEC-10 says "on track" but most child work hasn't started.

### Next-Step Guidance

- After `list_goals` → suggest `get_goal` for detail, or `analyze` with `goalKey` for metrics
- After `get_goal` → suggest `analyze` with `goalKey`, or `manage_jira_issue` for specific linked issues
- After `analyze` with `goalKey` → suggest drilling into specific issues, or comparing against other goals

Bidirectional steering from `analyze_jira_issues` back to goals is deferred — it would require the analysis pipeline to detect goal linkage, which is non-trivial and not needed for the initial integration.

## Consequences

### Positive

- Connects strategic intent to execution metrics — the full story from one tool
- No new tools — keeps the toolkit at 8, preserves LLM tool selection accuracy
- Reuses the entire existing analysis engine (ADR-204, ADR-206) unchanged
- Reuses the existing GraphQL client (ADR-207) with minor extension
- No new auth configuration — same credentials access Townsquare and Jira
- `HIERARCHY_ASC` sort gives natural tree ordering for free
- Goal keys (e.g., `PRAEC-25`) are human-readable entry points

### Negative

- `analyze_jira_plan` takes on a broader scope (issue hierarchies + goal hierarchies) — the name becomes slightly misleading, but renaming would break existing LLM prompts and user habits
- `workItems` requires experimental `@optIn(to: "GraphStoreJiraEpicContributesToAtlasGoal")` — could break without notice
- TQL status filtering is unreliable for some values — user-facing caveat required
- Goal→issue links are only epics/initiatives, not individual stories — the analysis scope is coarser than project-level JQL
- Not all instances have Goals enabled — must degrade gracefully

### Neutral

- Focus Areas (Mercury) are deferred — not activated on all instances, and the Goals layer covers the most common strategic planning pattern
- Atlas Projects are queryable but sparse in practice — will implement but expect thin data
- `goals_search` pagination uses cursor-based `after` + `first`, same pattern as other AGG queries
- Goal state values: `on_track`, `done`, `pending`, `off_track`, `at_risk`, `paused`
- Data cube integration (ADR-206) is future work — `analyze` with `goalKey` produces the same metric output that the cube consumes, so no special handling needed

## Alternatives Considered

- **Separate `manage_goals` tool** — Rejected. Adds a ninth tool to the toolkit, increasing LLM tool selection burden. Goals are read-only from this integration's perspective. The discovery→analysis pipeline works better as operations on one tool than as a cross-tool workflow.

- **REST API for goals** — No REST API exists for Townsquare goals. GraphQL via AGG is the only supported path.

- **Start with Focus Areas (Mercury)** — Rejected. Mercury is experimental, not activated on all instances, and adds a layer of complexity (hierarchical types, status transitions). Goals are the more universal entry point.

- **Build the link from issues up to goals** — Investigated. `atlasGoalsLinkedToJiraIssue` exists in the schema but is marked "not available for OAuth authenticated requests." The top-down path (goal → workItems → issues) works with Basic Auth and is the natural discovery direction.

- **Rename `analyze_jira_plan` to `analyze_jira_strategy`** — Considered. Better reflects the broader scope, but renaming breaks existing LLM prompts, documentation, and user muscle memory. The cost exceeds the benefit. Revisit if the tool's scope grows further.
