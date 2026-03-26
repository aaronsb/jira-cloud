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

Hierarchical strategic planning (Company → Strategy → Priority → Big Rock). Not activated on all instances. Lower priority for initial implementation.

### The Traversable Hierarchy

A single GraphQL query can walk from a goal down to linked Jira issues:

```
Goal (state, owner, key, targetDate)
├── subGoals (recursive)
├── projects (Atlas projects, with state + risks)
└── workItems @optIn(to: "GraphStoreJiraEpicContributesToAtlasGoal")
    └── JiraIssue (key, summary, status, issueType, assignee, priority)
```

The `workItems` field resolves to a `JiraIssue` union type with full issue fields — including `key`, which bridges directly into the existing `analyze_jira_issues` pipeline.

### TQL (Townsquare Query Language)

`goals_search` accepts a `searchString` parameter with a SQL-like syntax:

| Pattern | Example | Status |
|---------|---------|--------|
| `name LIKE "<text>"` | `name LIKE "Health"` | Works |
| `status = <value>` | `status = on_track` | Works for `on_track`, `done` |
| `AND` combinator | `status = on_track AND name LIKE "partner"` | Works |
| Free text | `"Health"` | Works (less precise) |
| Empty string | `""` | Returns all |

**Known limitations:** `status = pending` returns empty despite pending goals existing (silent failure, no error). `!=` and `IN()` operators untested. Status filtering appears unreliable for some values — client-side filtering is the safe fallback.

**Sort enum values:** `HIERARCHY_ASC/DESC`, `NAME_ASC/DESC`, `CREATION_DATE_ASC/DESC`, `LATEST_UPDATE_DATE_ASC/DESC`, `TARGET_DATE_ASC/DESC`, `SCORE_ASC/DESC`, `PROJECT_COUNT_ASC/DESC`

`HIERARCHY_ASC` is particularly useful — it returns goals grouped by parent/child structure, which maps naturally to how users think about their goal tree.

## Decision

Extend `analyze_jira_plan` to accept a goal as an entry point, and add goal discovery operations to the MCP server. This connects the strategic layer to the existing analysis engine.

### Entry Points

**Goal discovery** — new operations on `analyze_jira_plan`:

| Operation | Purpose |
|-----------|---------|
| `list_goals` | Search goals with TQL, sorted by hierarchy. Returns goal tree with state, owner, linked work item count |
| `get_goal` | Get a single goal by key (e.g., `PRAEC-25`) with sub-goals, projects, and linked Jira issues |
| `analyze_goal` | Walk goal → workItems → child issues, then run the existing analysis metrics on the resolved issue set |

**Why `analyze_jira_plan` and not a new tool:** The plan tool already walks hierarchies via GraphQL (ADR-207). Goals are a higher node in the same hierarchy — the walk just starts further up. The analysis engine (metrics, rendering) is reused unchanged.

### Goal → Issue Resolution

When `analyze_goal` is called:

1. Fetch goal by key via `goals_byKey`
2. Resolve `workItems` to get linked Jira issue keys
3. Optionally walk `subGoals` to collect their `workItems` too (depth-controlled)
4. Pass the collected issue keys into the existing analysis pipeline as a JQL `key in (...)` query
5. Render with the same metrics and format, but prefixed with goal context (state, owner, progress)

This means every existing metric (status distribution, assignee workload, priority breakdown, cycle time, etc.) automatically works for goal-scoped analysis.

### GraphQL Client Extension

The existing `GraphQLClient` (from ADR-207) already handles cloudId discovery and AGG queries. Extend it with:

- Goal search queries (TQL + sort + pagination)
- Goal detail queries (with `workItems` opt-in)
- Response mapping to normalize Townsquare types into the analysis pipeline

Same auth, same endpoint (`/gateway/api/graphql`), same client.

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

- After `list_goals` → suggest `get_goal` for a specific goal, or `analyze_goal` for metrics
- After `analyze_goal` → suggest drilling into specific issues via `manage_jira_issue`, or comparing against other goals
- Bidirectional: `analyze_jira_issues` results that include issues linked to goals should mention the goal context

## Consequences

### Positive

- Connects strategic intent to execution metrics — the full story in one tool
- Reuses the entire existing analysis engine (ADR-204, ADR-206) unchanged
- Reuses the existing GraphQL client (ADR-207) with minor extension
- No new auth configuration — same credentials access Townsquare and Jira
- `HIERARCHY_ASC` sort gives natural tree ordering for free
- Goal keys (e.g., `PRAEC-25`) are human-readable entry points

### Negative

- TQL status filtering is unreliable (`pending` fails silently) — must client-side filter
- `workItems` requires experimental `@optIn(to: "GraphStoreJiraEpicContributesToAtlasGoal")` — could break
- Not all instances have Goals enabled — need graceful degradation
- Goal→issue links are only epics/initiatives, not individual stories — the analysis scope is coarser than project-level JQL

### Neutral

- Focus Areas (Mercury) are deferred — not activated on all instances, and the Goals layer covers the most common strategic planning pattern
- Atlas Projects are queryable but had no linked goals on the test instance — will implement but may see sparse data
- `goals_search` pagination uses cursor-based `after` + `first`, same pattern as other AGG queries
- Goal state values: `on_track`, `done`, `pending`, `off_track`, `at_risk`, `paused`

## Alternatives Considered

- **Separate `manage_goals` tool** — Rejected. Goals are read-mostly from the analysis perspective, and the value is in connecting goals to issue metrics, not CRUD on goals themselves. A standalone tool would fragment the analysis workflow.

- **REST API for goals** — No REST API exists for Townsquare goals. GraphQL via AGG is the only supported path.

- **Start with Focus Areas (Mercury)** — Rejected. Mercury is experimental, not activated on all instances, and adds a layer of complexity (hierarchical types, status transitions) that goals don't need. Goals are the more universal entry point.

- **Build the link from issues up to goals** — Investigated. `atlasGoalsLinkedToJiraIssue` exists in the schema but is marked "not available for OAuth authenticated requests." The top-down path (goal → workItems → issues) works with Basic Auth and is the natural discovery direction.
