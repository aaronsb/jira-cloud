---
status: Draft
date: 2026-03-13
deciders:
  - aaronsb
related:
  - ADR-200
  - ADR-204
---

# ADR-207: Plan analysis with hierarchy rollups

## Context

Jira's Advanced Roadmaps (Plans) derives its core value from **rollups** — synthesizing values from child issues up through the hierarchy to give parent issues derived dates, point totals, time estimates, and team assignments. An epic with ten stories inherits its start date from the earliest child and its end date from the latest. Its "progress" is the ratio of resolved children.

Our existing tools don't do this:

- **`manage_jira_issue` hierarchy** traverses the tree but only fetches minimal fields (summary, type, status, parent). It shows structure, not substance.
- **`analyze_jira_issues`** computes rich metrics but operates on **flat sets** from JQL. It has no concept of parent-child relationships between the issues it analyzes.

When a user asks "when will this epic actually finish?" or "how much work is left under this initiative?", the LLM must manually fetch children, extract dates, and do the math — the same arithmetic problem ADR-204 solved for flat sets.

The real question is date and schedule coherence across hierarchy levels: intermediate items (epics, features) often lack direct dates or estimates because they're meant to be derived from their children. Without rollups, these gaps look like missing data rather than intentional delegation.

### What Jira Plans Does

Plans constructs rollups across these dimensions:
- **Dates**: Start date = earliest child start; end date = latest child due
- **Story points**: Sum of children's points
- **Time estimates**: Sum of children's time
- **Progress**: Resolved children / total children (and by points)
- **Assignments/Teams**: Union of children's assignees

It also detects conflicts: a parent with a due date earlier than its latest child, or an epic marked done while children remain open.

### Why a Separate Tool

The input model, traversal pattern, and output shape are fundamentally different from `analyze_jira_issues`:

| Dimension | `analyze_jira_issues` | Plan analysis |
|-----------|----------------------|---------------|
| **Input** | JQL query (flat set) | Root issue + depth |
| **Data shape** | Statistical tables | Tree with aggregated values |
| **Access pattern** | Bulk search | Hierarchy walk + field fetch per level |
| **Core question** | "What patterns exist in these issues?" | "What does this plan actually imply?" |
| **Output** | Metrics, distributions, counts | Tree with own vs rolled-up values + conflicts |

## Decision

Add a new tool `analyze_jira_plan` that takes a root issue, walks its hierarchy, fetches field values at each level, and rolls up aggregated values to produce a plan-coherence view.

### Interface

```typescript
{
  tool: "analyze_jira_plan",
  args: {
    issueKey: string,       // Required — root of the plan tree
    depth?: number,         // How deep to traverse (default 4, max 8)
    rollups?: string[],     // Which rollups to compute
                            // Default: all. Values: "dates", "points", "time", "progress", "assignees"
    mode?: string           // Output focus: "rollup" (default), "gaps", "timeline"
  }
}
```

### Rollup Dimensions

#### `dates` — Schedule Window Rollup

For each node with children:
- **Rolled-up start**: Earliest `startDate` among descendants
- **Rolled-up end**: Latest `dueDate` among descendants
- **Own vs derived**: Show both the node's own dates and what children imply
- **Conflicts**: Flag when own due date < latest child due date, or own start > earliest child start

#### `points` — Story Point Rollup

- **Sum**: Total story points across descendants
- **By status category**: To Do / In Progress / Done point subtotals
- **Unestimated**: Count of descendants missing story points (estimation coverage)
- **Conflict**: Parent has own points that differ from children's sum

#### `time` — Time Estimate Rollup

- **Sum**: Total `timeEstimate` across descendants
- **By status category**: Remaining vs completed effort
- **Unestimated**: Descendants missing time estimates

#### `progress` — Completion Rollup

- **By count**: Resolved descendants / total descendants
- **By points**: Resolved points / total points (weighted progress)
- **By status category**: Distribution of children across To Do / In Progress / Done
- **Stale detection**: Children in "In Progress" with no update for 14+ days

#### `assignees` — Team Rollup

- **Team**: Distinct assignees across descendants
- **Unassigned**: Count of unassigned descendants
- **Workload**: Issue count per assignee under this subtree

### Output Modes

#### `rollup` (default) — Full Tree View

```markdown
# Plan: PROJ-100 — Q1 Platform Initiative
Depth: 3 levels, 47 issues

## PROJ-100: Q1 Platform Initiative [Epic]
Status: In Progress
Dates: own Jan 1 – Mar 31 | rolled-up Jan 3 – Apr 15 ⚠️ CONFLICT (children end 15d late)
Points: own — | rolled-up 234 pts (89 earned, SPI 0.38)
Progress: 18/47 resolved (38%) | by points 38%
Team: alice, bob, carol, dave | 3 unassigned

├── PROJ-110: Auth Redesign [Story]
│   Dates: own Jan 3 – Feb 15 | rolled-up Jan 5 – Feb 20 ⚠️
│   Points: own — | rolled-up 55 pts (40 earned)
│   Progress: 8/12 resolved (67%)
│   ├── PROJ-111: OAuth provider [Sub-task] ✓ 8pts
│   ├── PROJ-112: Session migration [Sub-task] ● 13pts due Feb 20
│   └── ... (10 more)
│
├── PROJ-120: API v2 [Story]
│   Dates: own Feb 1 – Mar 15 | rolled-up Feb 3 – Apr 15 ⚠️
│   Points: own — | rolled-up 89 pts (21 earned)
│   Progress: 4/20 resolved (20%)
│   └── ...
```

#### `gaps` — What's Missing or Inconsistent

Focuses on actionable problems:
- Issues with no dates where siblings have dates
- Date conflicts between parents and children
- Unestimated issues in otherwise-estimated subtrees
- Open children under resolved parents
- Assignee gaps in active subtrees

#### `timeline` — Date-Focused View

Chronological view of the plan's date windows, showing how child windows compose into parent windows. Highlights the critical path — the chain of children that determines the parent's rolled-up end date.

### Data Access Pattern

1. **Reuse existing hierarchy traversal** — `getHierarchy()` already does BFS with parent chain walking. Enhance it (or create a variant) to fetch rollup-relevant fields at each node: `summary, issuetype, status, statusCategory, parent, dueDate, startDate, storyPoints, timeEstimate, assignee, resolution, resolutionDate`.

2. **Single traversal, bottom-up aggregation** — Walk the tree once to collect nodes, then aggregate from leaves upward. No need for separate API calls per rollup dimension.

3. **Field fetch strategy** — The hierarchy code currently fetches 4 fields per node. We need ~12 fields. Two options:
   - **Option A**: Enhance `fetchNodeFields()` to accept a field list parameter (plan analysis requests more fields, basic hierarchy stays minimal)
   - **Option B**: After hierarchy traversal, batch-fetch full fields for all discovered issue keys via `searchIssuesLean()` with `key in (...)` JQL

   Option B is preferred — it separates hierarchy structure from field enrichment, reuses existing lean field mapping, and keeps a single bulk API call instead of per-node fetches.

4. **Cost bounds** — Same as hierarchy: depth clamped to [0, 8], children capped at 100 per parent. For large plans, warn about truncation and suggest narrowing to a subtree.

### What This Does NOT Do

- **Replace Jira Plans UI** — no Gantt charts, no drag-and-drop scheduling
- **Write back rolled-up values** — read-only analysis (consistent with all our tools)
- **Cross-plan comparison** — single root scope; user can run multiple analyses
- **Dependency chain analysis** — issue links are a separate concern (potential future metric on `analyze_jira_issues`)
- **Historical rollups** — shows current state, not how the plan evolved over time

## Consequences

### Positive

- Bridges the gap between hierarchy view (structure) and analysis view (numbers)
- Surfaces date conflicts and estimation gaps that are invisible in flat analysis
- "What does this plan actually imply?" becomes a single tool call
- Reuses existing hierarchy traversal and field mapping infrastructure
- Rollup dimensions are additive — easy to extend later (e.g., labels, components)
- `gaps` mode directly surfaces actionable PM work (fix these dates, estimate these issues)

### Negative

- 8th tool in the catalog — increases tool selection surface
- Hierarchy walks are chatty with the Jira API (one call per parent batch per level)
- Large plans (100+ issues across 4+ levels) may hit rate limits or take several seconds
- Rollup semantics must handle edge cases: mixed estimation (some children have points, some don't), partially resolved subtrees, circular parent references

### Neutral

- Tool description must clearly differentiate from `analyze_jira_issues` — "for flat set metrics use analyze, for hierarchy rollups use plan"
- Bidirectional steering: `manage_jira_issue hierarchy` can suggest `analyze_jira_plan` for rollups; `analyze_jira_issues` can suggest it when results suggest hierarchical structure
- The `filterId` pattern from analyze doesn't apply here — plan analysis is rooted in a specific issue, not a query

## Alternatives Considered

### A. Add rollup mode to `analyze_jira_issues`

Would require overloading the interface: sometimes it takes JQL (flat), sometimes an issue key (hierarchy). The input model, traversal, and output shape are different enough that combining them creates a confusing "god tool." Rejected for the same reasons we split analysis from filter/issue tools.

### B. Add rollup fields to `manage_jira_issue hierarchy`

The hierarchy operation is intentionally lightweight — it shows structure for orientation. Adding computation there conflates "show me the tree" with "analyze the tree." The hierarchy view is fast because it fetches minimal fields; plan analysis needs rich fields and aggregation. Rejected to preserve the simplicity of hierarchy traversal.

### C. Let the LLM compose hierarchy + analyze calls

The LLM could fetch children via hierarchy, then run analyze on each subtree. But this requires multiple round-trips, the LLM must coordinate results across calls, and it still can't do bottom-up aggregation without arithmetic. This is exactly the "LLM doing math" problem ADR-204 identified. Rejected.

### D. Use Jira Plans API directly

Jira's Advanced Roadmaps has its own API (`/rest/align/...`) for plan data. However: it requires Plans to be configured (not all instances have it), the API is poorly documented, and it returns opaque plan-specific data structures. Building rollups from standard issue fields works on any Jira instance and gives us control over the aggregation logic. Rejected for portability, though worth revisiting if Atlassian improves the API.
