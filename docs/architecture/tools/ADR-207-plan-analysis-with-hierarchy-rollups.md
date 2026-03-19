---
status: Draft
date: 2026-03-18
deciders:
  - aaronsb
related:
  - ADR-200
  - ADR-204
---

# ADR-207: Plan analysis via Atlassian GraphQL rollups

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
| **Input** | JQL query (flat set) | Root issue key |
| **Data shape** | Statistical tables | Tree with aggregated values |
| **Data source** | REST search API | GraphQL `roadmaps` queries |
| **Core question** | "What patterns exist in these issues?" | "What does this plan actually imply?" |
| **Output** | Metrics, distributions, counts | Tree with own vs rolled-up values + conflicts |

### Why GraphQL, Not REST

Atlassian exposes a unified GraphQL API at `https://api.atlassian.com/graphql` (Atlassian Gateway Graph / AGG) that spans all cloud products. The `roadmaps` root query provides direct access to plan/rollup data:

| Query | Purpose |
|-------|---------|
| `roadmapForSource` | Get a roadmap by its backing source (project, board) |
| `roadmapItemByIds` | Fetch specific roadmap items with their fields |
| `roadmapFilterItems` | Filtered views of roadmap items |
| `roadmapDeriveFields` | **Computed/derived fields** — Atlassian's own rollup engine |
| `roadmapSubtasksByIds` | Subtask hierarchy with status categories |

The `roadmapDeriveFields` query returns the same rolled-up values that the Plans UI displays. Atlassian has already solved the rollup problem; we query the answer rather than recomputing it.

**Why not recompute rollups from REST data?** Two code paths doubles implementation and testing cost. Worse, our computed rollups would diverge from what users see in Plans — Atlassian handles edge cases around partial estimation, cross-project plans, and custom hierarchy levels that we'd need to reverse-engineer. And if Plans isn't configured, there are no rollups to compute — the existing `getHierarchy()` already covers the "show me structure" case.

### Connection Requirements

The GraphQL endpoint uses the same basic auth credentials (`email:apiToken`) we already have. The one additional requirement is **cloudId discovery** — the GraphQL API is multi-tenant and requires a cloud identifier to route queries:

```graphql
query GetTenantContexts($hostNames: [String!]!) {
  tenantContexts(hostNames: $hostNames) {
    cloudId
  }
}
```

The hostname comes from our existing `JIRA_HOST` environment variable. CloudId is resolved once and cached for the session. No new environment variables required.

### Reference Implementation

The `atlassian-graph` MCP server demonstrates the full pattern:
- `src/site-config.js` — cloudId discovery via `tenantContexts` query
- `src/graphql-client.js` — GraphQL client with auth and automatic cloudId injection
- 200+ roadmap/plan/hierarchy-related types in the AGG schema

We borrow the patterns, not the dependency.

## Decision

Add a new tool `analyze_jira_plan` that queries Atlassian's GraphQL API for plan-level rollup data. The tool requires Jira Plans (Advanced Roadmaps) to be configured for the target issues. No REST fallback — if an issue isn't in a plan, the tool says so clearly and steers to the right alternative.

### Interface

```typescript
{
  tool: "analyze_jira_plan",
  args: {
    issueKey: string,       // Required — root of the plan tree
    rollups?: string[],     // Which rollups to compute
                            // Default: all. Values: "dates", "points", "time", "progress", "assignees"
    mode?: string           // Output focus: "rollup" (default), "gaps", "timeline"
  }
}
```

Note: no `depth` parameter. The GraphQL API returns the full plan hierarchy as configured in Plans — depth is a plan configuration concern, not a query parameter.

### Architecture: GraphQL Only

```
┌─────────────────────────────────┐
│      analyze_jira_plan          │
│  (tool interface)               │
├─────────────────────────────────┤
│        GraphQL Client           │
│  cloudId discovery at startup   │
│  Basic auth (existing creds)    │
├─────────────────────────────────┤
│   api.atlassian.com/graphql     │
│   roadmaps.* queries            │
└─────────────────────────────────┘
```

**Availability:**
- CloudId discovery fails at startup → tool is not registered (log warning)
- Issue not in any plan → clear error: "PROJ-123 is not in a Jira Plan. Use `manage_jira_issue hierarchy` for structure or `analyze_jira_issues` for flat metrics."

### GraphQL Client

A lightweight client (~50 lines, no framework dependency):

```typescript
// src/client/graphql-client.ts
class GraphQLClient {
  constructor(email: string, apiToken: string, cloudId: string);
  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
}
```

- POST to `https://api.atlassian.com/graphql`
- Basic auth with existing credentials
- Injects `cloudId` into query variables automatically
- Returns typed responses

### Key Queries

#### 1. Resolve Roadmap from Issue

```graphql
query RoadmapForSource($cloudId: ID!, $sourceAri: ID!) {
  roadmaps {
    roadmapForSource(cloudId: $cloudId, sourceAri: $sourceAri) {
      id
      configuration { hierarchyConfiguration { levels } }
    }
  }
}
```

#### 2. Get Derived Fields (Rollups)

The core query — Atlassian computes the values:

```graphql
query DeriveFields($cloudId: ID!, $roadmapId: ID!, $itemIds: [ID!]!) {
  roadmaps {
    roadmapDeriveFields(
      cloudId: $cloudId
      roadmapId: $roadmapId
      itemIds: $itemIds
    ) {
      itemId
      derivedStartDate
      derivedDueDate
      derivedProgress
    }
  }
}
```

#### 3. Get Roadmap Items with Hierarchy

```graphql
query RoadmapItems($cloudId: ID!, $roadmapId: ID!, $itemIds: [ID!]!) {
  roadmaps {
    roadmapItemByIds(
      cloudId: $cloudId
      roadmapId: $roadmapId
      itemIds: $itemIds
    ) {
      id
      title
      status { statusCategory }
      childItems { id }
      schedule { startDate, dueDate }
      storyPoints
      assignee { displayName }
    }
  }
}
```

### Rollup Dimensions

#### `dates` — Schedule Window Rollup

For each node with children:
- **Rolled-up start**: Earliest `startDate` among descendants
- **Rolled-up end**: Latest `dueDate` among descendants
- **Own vs derived**: Show both the node's own dates and what Atlassian derives
- **Conflicts**: Flag when own due date < derived due date, or own start > derived start

#### `points` — Story Point Rollup

- **Sum**: Total story points across descendants
- **By status category**: To Do / In Progress / Done point subtotals
- **Unestimated**: Count of descendants missing story points (estimation coverage)

#### `time` — Time Estimate Rollup

- **Sum**: Total `timeEstimate` across descendants
- **By status category**: Remaining vs completed effort

#### `progress` — Completion Rollup

- **By count**: Resolved descendants / total descendants
- **By points**: Resolved points / total points (weighted progress)
- **By status category**: Distribution of children across To Do / In Progress / Done

#### `assignees` — Team Rollup

- **Team**: Distinct assignees across descendants
- **Unassigned**: Count of unassigned descendants
- **Workload**: Issue count per assignee under this subtree

### Output Modes

#### `rollup` (default) — Full Tree View

```markdown
# Plan: PROJ-100 — Q1 Platform Initiative
Depth: 3 levels, 47 issues
Source: Atlassian Plans (derived fields)

## PROJ-100: Q1 Platform Initiative [Epic]
Status: In Progress
Dates: own Jan 1 – Mar 31 | derived Jan 3 – Apr 15 ⚠️ CONFLICT (children end 15d late)
Points: own — | derived 234 pts (89 earned)
Progress: 18/47 resolved (38%) | by points 38%
Team: alice, bob, carol, dave | 3 unassigned

├── PROJ-110: Auth Redesign [Story]
│   Dates: own Jan 3 – Feb 15 | derived Jan 5 – Feb 20 ⚠️
│   Points: own — | derived 55 pts (40 earned)
│   Progress: 8/12 resolved (67%)
│   ├── PROJ-111: OAuth provider [Sub-task] ✓ 8pts
│   ├── PROJ-112: Session migration [Sub-task] ● 13pts due Feb 20
│   └── ... (10 more)
│
├── PROJ-120: API v2 [Story]
│   Dates: own Feb 1 – Mar 15 | derived Feb 3 – Apr 15 ⚠️
│   Points: own — | derived 89 pts (21 earned)
│   Progress: 4/20 resolved (20%)
│   └── ...
```

#### `gaps` — What's Missing or Inconsistent

Focuses on actionable problems:
- Date conflicts between own values and derived values
- Unestimated issues in otherwise-estimated subtrees
- Open children under resolved parents
- Assignee gaps in active subtrees

#### `timeline` — Date-Focused View

Chronological view of the plan's date windows, showing how child windows compose into parent windows. Highlights the critical path — the chain of children that determines the parent's derived end date.

### ARI Mapping

The GraphQL API uses Atlassian Resource Identifiers (ARIs) not issue keys. We need to map between them:

- Issue key `PROJ-123` → ARI `ari:cloud:jira:${cloudId}:issue/${issueId}`
- The numeric `issueId` comes from a REST lookup (we already fetch this when getting issue details)
- Roadmap items reference issues by ARI, so responses need reverse mapping back to human-readable keys

### What This Does NOT Do

- **Replace Jira Plans UI** — no Gantt charts, no drag-and-drop scheduling
- **Write back rolled-up values** — read-only analysis (consistent with all our tools)
- **Work without Plans** — requires Advanced Roadmaps; steers to hierarchy/analyze for instances without it
- **Cross-plan comparison** — single root scope; user can run multiple analyses
- **Dependency chain analysis** — issue links are a separate concern
- **Historical rollups** — shows current state, not how the plan evolved over time

### Schema Discovery (Future)

The AGG schema is vast (388+ types, 200+ roadmap-related). For v1, we hardcode the specific queries we need. Future iterations could introspect the schema to discover available rollup fields dynamically — similar to how ADR-201 discovers custom fields via the REST API.

## Consequences

### Positive

- Rollup values match what users see in the Jira Plans UI — no discrepancies from recomputing
- `roadmapDeriveFields` handles edge cases we'd otherwise need to code: partial estimation, cross-project plans, custom hierarchy levels
- "What does this plan actually imply?" becomes a single tool call
- No new credentials required — existing env vars are sufficient
- Single code path — no dual-source complexity
- Opens the door to other AGG capabilities: goals, cross-product search, DevOps metrics

### Negative

- 8th tool in the catalog — increases tool selection surface
- Requires Jira Plans (Advanced Roadmaps) — not available on all instances/tiers
- New API surface to maintain — GraphQL queries need updating if Atlassian changes the schema
- CloudId discovery adds a startup step (one extra HTTP call, cached for session)
- Schema is large and beta-flagged — some queries may change without notice
- ARIs add a mapping layer between issue keys and GraphQL identifiers

### Neutral

- Tool is conditionally registered — only appears when GraphQL/cloudId is available
- The GraphQL client is deliberately minimal — not a general-purpose AGG integration
- `atlassian-graph` project serves as reference but is not a dependency
- CloudId is a session-level concern, not per-request — discovered once at startup
- Tool description must clearly differentiate from `analyze_jira_issues` and `manage_jira_issue hierarchy`
- Bidirectional steering: hierarchy can suggest plan analysis for rollups; plan analysis steers to hierarchy/analyze when Plans isn't available
- The `filterId` pattern from analyze doesn't apply here — plan analysis is rooted in a specific issue, not a query

## Alternatives Considered

### A. REST-Only Rollups (Compute from Issue Fields)

Traverse hierarchy via REST, fetch rich fields at each level, aggregate bottom-up. Works on any instance without Plans. **Rejected** — reinvents Atlassian's rollup logic, results diverge from Plans UI, doubles code paths. If Plans isn't configured, there are no rollups to compute; the existing hierarchy view covers the "show me structure" case. Not worth building a second rollup engine that will always be a worse approximation.

### B. Dual-Source with REST Fallback

Try GraphQL first, fall back to REST-computed rollups when Plans isn't available. **Rejected** — the fallback creates false confidence. REST-computed rollups for instances without Plans would invent semantics that the user never configured. Two code paths double maintenance and testing cost. Clear steering to the right tool is better than a degraded approximation.

### C. Add Rollup Mode to `analyze_jira_issues`

Would require overloading the interface: sometimes it takes JQL (flat), sometimes an issue key (hierarchy). The input model, data source, and output shape are different enough that combining them creates a confusing "god tool." Rejected for the same reasons we split analysis from filter/issue tools.

### D. Add Rollup Fields to `manage_jira_issue hierarchy`

The hierarchy operation is intentionally lightweight — it shows structure for orientation. Adding computation there conflates "show me the tree" with "analyze the tree." Rejected to preserve the simplicity of hierarchy traversal.

### E. Let the LLM Compose Hierarchy + Analyze Calls

The LLM could fetch children via hierarchy, then run analyze on each subtree. But this requires multiple round-trips, the LLM must coordinate results across calls, and it still can't do bottom-up aggregation without arithmetic. This is exactly the "LLM doing math" problem ADR-204 identified. Rejected.

### F. Depend on atlassian-graph MCP Server

Require users to run both MCP servers and let them compose. Rejected — forces users to configure a second server, agent must coordinate across servers. We borrow the patterns, not the dependency.

### G. Jira Plans REST API (`/rest/align/...`)

The Plans feature has its own REST API separate from both standard Jira REST and AGG. Poorly documented, opaque data structures, not part of the public API contract. Rejected for stability and documentation concerns — AGG's `roadmaps` queries expose the same data through a supported interface.
