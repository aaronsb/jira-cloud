---
status: Draft
date: 2026-03-06
deciders:
  - aaronsb
related:
  - ADR-204
  - ADR-205
---

# ADR-206: Analysis Data Cube

## Context

ADR-204 introduced issue-level metrics (points, schedule, cycle, distribution) and ADR-205 added count-based summaries with project groupBy. Together they cover two extremes: fetch-and-compute on individual issues (capped, slow) vs. exact counts on predefined dimensions (fast, uncapped).

What's missing is the middle layer — the ability to slice data across arbitrary dimensions with computed measures. Jira's UI provides this through dashboards, gadgets, and roadmap views. These are pre-baked views that answer specific questions. A project manager who wants to ask a new question has to build a new dashboard.

With an LLM as the query interface, we can replace pre-baked views with composable primitives. The LLM formulates the query; the tool provides the data cube. But this requires:

1. **Discovery** — the LLM needs to know what dimensions and values exist before it can query them
2. **Structured execution** — the query must be bounded and safe (no arbitrary code, no unbounded loops)
3. **Computed fields** — derived metrics like ratios, comparisons, and flags that combine raw measures

The key insight is that Jira's count API (`POST /search/count`) is fast enough to serve as the cell-computation engine for a data cube. Each cell is a count query with specific dimension filters. A 4×6 cube (4 projects × 6 measures) is 24 parallel count queries — completes in ~2 seconds.

## Decision

Add two operations to `analyze_jira_issues`: **cube setup** and **cube execute**.

### Phase 1: Cube Setup (Discover)

The LLM sends a JQL scope. The tool samples ~50 issues and returns the available dimensions, their distinct values, and available measures.

```json
{
  "jql": "project in (AA, LGS, GD, GC) AND resolution = Unresolved",
  "metrics": ["cube_setup"]
}
```

Response:

```
# Cube Setup: project in (AA, LGS, GD, GC) AND resolution = Unresolved
Sampled 50 issues to discover dimensions.

## Available Dimensions
| Dimension  | Distinct Values                                    | Count |
|------------|---------------------------------------------------|------:|
| project    | AA, LGS, GD, GC                                   |     4 |
| status     | Backlog, To Do, In Progress, Active Item, Blocked  |     5 |
| assignee   | Vladimir S., Evgeny K., Pavel F., Unassigned +8    |    12 |
| priority   | Medium, High, Lowest                               |     3 |
| issuetype  | Story, Bug, Feature, Test, Task                    |     5 |

## Available Measures
- count: issue count (exact, via count API)
- storyPoints: sum of story points (from sampled data)
- timeEstimate: sum of time estimates (from sampled data)

## Suggested Cubes
- `groupBy: "project"` — 4 groups, 24 count queries (~2s)
- `groupBy: "assignee"` — 12 groups, 72 count queries (~5s)
- `groupBy: "priority"` — 3 groups, 18 count queries (~1s)
```

The LLM now knows what to ask for. The "suggested cubes" section includes cost estimates so the LLM can make informed choices.

### Phase 2: Cube Execute (Compute)

The LLM sends back a structured query specifying dimensions, measures, and optional computed fields.

```json
{
  "jql": "project in (AA, LGS, GD, GC) AND resolution = Unresolved",
  "metrics": ["cube_execute"],
  "groupBy": "project",
  "compute": [
    "bug_pct = bugs / total * 100",
    "on_track = overdue == 0"
  ]
}
```

The tool:
1. Runs count queries per group value (from the JQL or discovered in setup)
2. Builds the standard summary table (total, open, overdue, high+, created 7d, resolved 7d)
3. If extra count dimensions are needed by compute expressions, runs those too (e.g., `bugs` requires `issuetype = Bug AND resolution = Unresolved` per group)
4. Evaluates computed fields using the bounded DSL
5. Returns the table with computed columns appended

### Bounded Compute DSL

The DSL is intentionally minimal — a safety pattern that prevents arbitrary execution.

**Allowed:**
- Arithmetic: `+`, `-`, `*`, `/`
- Comparison: `>`, `<`, `>=`, `<=`, `==`, `!=`
- Column references: any measure name from the table (e.g., `total`, `overdue`, `bugs`)
- Numeric literals: `0`, `100`, `7`
- Boolean result: comparisons produce `Yes`/`No` in the output

**Not allowed:**
- No function calls
- No string operations
- No nested expressions (parentheses for grouping only, no recursion)
- No loops or conditionals
- No variable assignment beyond the `name = expr` definition

**Evaluation:** Linear, left-to-right. Each `compute` expression produces one new column. Expressions can reference columns defined by earlier expressions in the list (sequential, not circular).

**Examples:**
```
bug_pct = bugs / total * 100          → percentage column
net_flow = created_7d - resolved_7d   → intake vs output
clearing = resolved_7d > created_7d   → Yes/No flag
risk = overdue > 10                   → Yes/No flag
velocity = resolved_7d / 7            → daily throughput
```

### Implicit Measures

The tool automatically provides these columns for each group:
- `total` — all issues matching base JQL for this group
- `open` — unresolved
- `overdue` — unresolved + past due
- `high` — high+ priority
- `created_7d` — created last 7 days
- `resolved_7d` — resolved last 7 days

Additional implicit measures are available if referenced in `compute`:
- `bugs` — `issuetype = Bug AND resolution = Unresolved`
- `unassigned` — `assignee is EMPTY AND resolution = Unresolved`
- `no_due_date` — `dueDate is EMPTY AND resolution = Unresolved`
- `blocked` — `status = Blocked`

These are resolved lazily — only queried if a `compute` expression references them.

### Performance Budget

| Scenario | Groups | Queries | Est. Time |
|----------|-------:|--------:|----------:|
| 4 projects, standard measures | 4 | 24 | ~2s |
| 4 projects + 2 computed | 4 | 32 | ~3s |
| 12 assignees, standard | 12 | 72 | ~5s |
| 3 priorities, standard | 3 | 18 | ~1s |

Guard rails:
- Max 20 groups per dimension (top 20 by total count)
- Max 5 compute expressions
- Max 150 count queries per execution (groups × measures)
- 30-second total timeout

## Consequences

### Positive
- LLM can answer arbitrary cross-dimensional questions without pre-built dashboards
- Two-phase design gives the LLM discovery before commitment — no wasted queries
- Bounded DSL prevents arbitrary code execution while enabling derived metrics
- Count API means all measures are exact — no sampling distortion
- Cost transparency (query estimates in setup) lets LLM make informed choices
- Replaces Jira dashboard/gadget workflows with natural language

### Negative
- DSL parser adds code complexity — must be carefully tested for edge cases
- Lazy implicit measures add query complexity (need to detect references in expressions)
- Two-phase flow requires the LLM to make two tool calls — slight latency overhead
- Assignee dimension requires name-to-accountId resolution for JQL (or displayName matching)

### Risks
- Count API rate limits under heavy cube queries (150 calls) — need to monitor
- DSL could be confusing if LLM generates invalid expressions — need clear error messages
- Assignee names in Jira may not be unique — could cause ambiguous grouping

## Alternatives Considered

### A: JQL-only approach (no DSL)
Have the LLM generate multiple JQL queries manually and compute ratios in its reasoning.
**Rejected:** Requires many tool calls, LLMs make JQL syntax errors, and derived metrics are unreliable in natural language math.

### B: Full expression language
Support nested expressions, conditionals, aggregation functions.
**Rejected:** Unbounded execution risk. A simple DSL with linear evaluation covers 90% of PM use cases without the safety concerns.

### C: Pre-defined cube templates
Offer fixed cube configurations (e.g., "project health cube", "team workload cube").
**Rejected:** Too rigid. The whole point is that the LLM formulates the query based on what the user asks. Templates are just recipes — and we already have those as a resource.
