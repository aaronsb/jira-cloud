# ADR-204: Issue Analysis Tool

| Field | Value |
|-------|-------|
| Status | Proposed |
| Domain | tools |
| Created | 2026-03-06 |
| Decides | How to provide deterministic computations over sets of Jira issues |

## Context

LLMs are unreliable at arithmetic. When a project manager asks "what are the total story points for this sprint?" or "which issues are overdue?", the model must fetch issues, extract fields, and compute — often getting it wrong. We need a tool that accepts a JQL query and returns pre-computed metrics so the LLM can report them directly.

This is the "breadth analysis" complement to the existing focus view (`get`/`update` on single issues) and breadth traversal (`hierarchy`). Where hierarchy shows structure, analysis shows the numbers.

### Design Principles (from ADR-200)

- Tools should be action-oriented and composable
- Reduce LLM cognitive load by doing the math server-side
- Keep the interface simple; let JQL handle issue selection
- Ground metrics in established PM methodologies so outputs use recognized terminology

## Decision

Add a new tool `analyze_jira_issues` that accepts a JQL query and returns computed metrics over the matching issue set. Metrics are grounded in Earned Value Management (EVM), Lean/Kanban flow metrics, and standard schedule analysis — using the accepted terminology so PMs recognize what they're looking at.

### Metric Groups (v1)

#### `points` — Earned Value (Story Points as value unit)

From EVM (PMI PMBOK):
- **Planned Value (PV)** — total story points in the set (what was committed)
- **Earned Value (EV)** — story points on resolved issues (what was delivered)
- **Remaining** — PV - EV
- **Schedule Performance Index (SPI)** — EV / PV (1.0 = on track, < 1.0 = behind, > 1.0 = ahead)
- **Breakdown by status category** — To Do / In Progress / Done point totals
- **Unestimated count** — issues missing story points (estimation gap)

#### `time` — Effort Tracking

- **Original Estimate** — sum of `timeEstimate` across all issues
- **By status category** — estimated effort remaining (To Do + In Progress) vs completed (Done)
- **Unestimated count** — issues missing time estimates

#### `schedule` — Date & Risk Analysis

Standard schedule analysis:
- **Date range** — earliest `startDate` to latest `dueDate` (project window)
- **Overdue** — issues past `dueDate` that aren't resolved (count + keys)
- **Slip (aggregate)** — total days past due across overdue issues
- **Due soon** — issues due in next 7 / 14 / 30 days
- **Concentration risk** — dates with unusually many items due (highlights bunching)
- **No due date** — issues missing `dueDate` (schedule blind spots)

#### `cycle` — Flow Metrics (Lean/Kanban)

From Lean methodology:
- **Lead time** — median and mean days from `created` to `resolutionDate` (for resolved issues)
- **Throughput** — resolved issues per week over the set's date range
- **Age** — for open issues: days since `created` (highlights stale work)
- **Oldest open** — the N oldest unresolved issues (WIP risk)

#### `distribution` — Composition

- Issue count by **status**
- Issue count by **assignee** (workload balance)
- Issue count by **priority**
- Issue count by **issue type**

### Interface

```typescript
{
  tool: "analyze_jira_issues",
  args: {
    jql: string,          // Required — selects the issue set
    metrics?: string[],   // Optional — which metric groups to include
                          // Default: all. Values: "points", "time", "schedule", "cycle", "distribution"
    maxResults?: number   // Max issues to analyze (default 200)
  }
}
```

### Output Shape

Markdown report with named sections. Numbers are pre-computed and labeled with their PM methodology origin. The LLM reads and relays — no arithmetic required.

```markdown
# Analysis: sprint = 42
Analyzed 34 issues (as of Mar 6, 2026)

## Points (Earned Value)
| Metric | Value |
|--------|-------|
| Planned Value (PV) | 89 pts |
| Earned Value (EV) | 42 pts |
| Remaining | 47 pts |
| SPI | 0.47 |
| Unestimated | 5 issues |

**By status:** To Do: 21 pts | In Progress: 26 pts | Done: 42 pts

## Schedule
**Window:** Feb 1 - Mar 15, 2026
**Overdue:** 3 issues, 18 days total slip (AA-101, AA-205, AA-310)
**Due next 7 days:** 8 issues
**Due next 14 days:** 12 issues
**Concentration:** Mar 9 has 5 issues due
**No due date:** 4 issues

## Cycle (Flow Metrics)
**Lead time (resolved):** median 4.5 days, mean 6.2 days (12 issues)
**Throughput:** 3.1 issues/week
**Oldest open:** AA-98 (45 days), AA-112 (38 days), AA-150 (22 days)

## Distribution
**By status:** To Do: 14 | In Progress: 8 | Done: 12
**By assignee:** Alice: 12 | Bob: 10 | Unassigned: 12
**By priority:** High: 8 | Medium: 20 | Low: 6
**By type:** Story: 20 | Bug: 8 | Task: 6
```

### Status Category Mapping

Jira issues have a `statusCategory` (one of: `new`, `indeterminate`, `done`) that maps cleanly:
- `new` → **To Do**
- `indeterminate` → **In Progress**
- `done` → **Done**

This is more reliable than mapping status names (which vary per project). We'll need to add `statusCategory` to the fields we fetch.

### What This Does NOT Do

- Velocity prediction or forecasting (requires historical sprint-over-sprint data — future metric group)
- Burndown/burnup visualization (text output only)
- Cross-sprint comparison (single query scope; user can run multiple analyses)
- Modify any issues (read-only tool)

### Extensibility

The `metrics` parameter and sectioned output make it straightforward to add metric groups later:
- `velocity` — historical sprint completion rates
- `links` — dependency graph density, blocking chain analysis
- `labels` — tag-based categorization
- `custom` — aggregation over discovered custom fields (ADR-201)

Each new group is additive — no interface changes needed.

## Alternatives Considered

**A. New operation on `manage_jira_issue`** — Rejected. That tool is already the largest; adding analysis muddies its "operate on issues" purpose.

**B. New operation on `manage_jira_filter`** — Rejected. Semantically close (JQL is there), but "filter" implies search/retrieval, not computation. Would confuse tool selection.

**D. Auto-append summary to `execute_jql`** — Rejected. Always pays the cost, adds noise to simple searches, and can't be parameterized.

## Consequences

- New tool in the catalog (7th tool) — increases tool selection surface slightly
- Reuses existing `issueFields` and `mapIssueFields` from JiraClient — minimal new API surface
- Need to add `statusCategory` to fetched fields (for reliable To Do/In Progress/Done bucketing)
- `maxResults` caps compute cost at 200 issues; warns if query matches more
- Metrics use standard PM terminology (EVM, Lean) — outputs are recognizable to practitioners
- All math is deterministic and server-side — LLM never does arithmetic
