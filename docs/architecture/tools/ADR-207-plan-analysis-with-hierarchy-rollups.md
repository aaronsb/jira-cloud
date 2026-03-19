---
status: Draft
date: 2026-03-19
deciders:
  - aaronsb
related:
  - ADR-200
  - ADR-204
  - ADR-206
---

# ADR-207: Plan analysis via GraphQL hierarchy traversal

## Context

Jira's Advanced Roadmaps (Plans) derives its core value from **rollups** — synthesizing values from child issues up through the hierarchy to give parent issues derived dates, point totals, time estimates, and team assignments. An epic with ten stories inherits its start date from the earliest child and its end date from the latest. Its "progress" is the ratio of resolved children.

Our existing tools don't do this:

- **`manage_jira_issue` hierarchy** traverses the tree but only fetches minimal fields (summary, type, status, parent). It shows structure, not substance.
- **`analyze_jira_issues`** computes rich metrics but operates on **flat sets** from JQL. It has no concept of parent-child relationships between the issues it analyzes.

When a user asks "when will this epic actually finish?" or "how much work is left under this initiative?", the LLM must manually fetch children, extract dates, and do the math — the same arithmetic problem ADR-204 solved for flat sets.

### Why a Separate Tool

The input model, traversal pattern, and output shape are fundamentally different from `analyze_jira_issues`:

| Dimension | `analyze_jira_issues` | Plan analysis |
|-----------|----------------------|---------------|
| **Input** | JQL query (flat set) | Root issue key |
| **Data shape** | Statistical tables | Tree with aggregated values |
| **Data source** | REST search API | GraphQL hierarchy walk |
| **Core question** | "What patterns exist in these issues?" | "What does this plan actually imply?" |
| **Output** | Metrics, distributions, counts | Tree with own vs rolled-up values + conflicts |

### Why GraphQL (Atlassian Gateway Graph)

Atlassian exposes a unified GraphQL API at `https://api.atlassian.com/graphql` (AGG). Live testing against a real Jira Cloud instance confirmed that the following work with **standard API token authentication**:

| Capability | Query | Opt-in Required |
|---|---|---|
| CloudId discovery | `tenantContexts(hostNames: [...])` | None |
| Plan discovery | `jira.recentPlans` | `@optIn(to: "JiraPlan")` + header |
| Plan metadata | `jira.planById(id: $ari)` | `@optIn(to: "JiraPlan")` + header |
| Issue by ID | `jira.issueById(id: $ari)` | None |
| JQL search | `jira.issueSearch(issueSearchInput: {jql: $jql})` | `@optIn(to: "JiraSpreadsheetComponent-M1")` |
| All issue fields | status, dates, points, assignee, type, hierarchy level | None |
| Plan view fields | `startDateViewField` / `endDateViewField` | `@optIn(to: "JiraPlansSupport")` |
| Has children | `hasChildIssues` boolean | None |
| Is resolved | `isResolved` boolean | None |
| Parent link | `parentIssueField.parentIssue` | None |

**Required HTTP headers:**
- `X-ExperimentalApi: JiraPlan,JiraPlansSupport` for plan-related queries
- Standard Basic auth with existing `JIRA_EMAIL` + `JIRA_API_TOKEN`

**What does NOT work with API tokens:**
- `roadmaps.*` queries — 401 from underlying roadmaps service (requires session auth)
- `planScenarioValues` — returns null (field exists, no error, but data withheld)

These limitations don't matter because we compute rollups ourselves from the raw hierarchy data.

### Why Not REST

The GraphQL path has structural advantages over our existing REST hierarchy walker:

1. **Single-query field richness** — REST `getHierarchy()` fetches 4 fields per node, then needs a separate bulk enrichment call. GraphQL returns all fields in the hierarchy walk query itself.
2. **JQL-based child discovery** — `parent = KEY` via `issueSearch` returns paginated, sortable results. REST requires BFS with per-node child fetches.
3. **`hasChildIssues` flag** — tells us whether to recurse without an extra API call.
4. **Data cube integration** — the same `issueSearch` query powers both flat analysis and hierarchy walks, enabling a future where the data cube understands tree structure (ADR-206).

### ARI Format Discovery

The GraphQL API uses Atlassian Resource Identifiers (ARIs). Live testing revealed:

- **Issue ARI**: `ari:cloud:jira:${cloudId}:issue/${numericIssueId}`
- **Plan ARI**: `ari:cloud:jira:${cloudId}:plan/activation/${activationUUID}/${planId}` — the activation UUID is not guessable; must be discovered via `recentPlans`
- CloudId discovered via `tenantContexts` query at startup

## Decision

Build a **reusable GraphQL hierarchy walker** that traverses issue hierarchies via AGG and computes bottom-up rollups. Expose it through:

1. **`analyze_jira_plan`** — new tool for plan-level rollup views
2. **Integration with `analyze_jira_issues`** — hierarchy-aware analysis for the data cube

The walker is a standalone module (`src/client/graphql-hierarchy.ts`) that can be used by any handler.

### GraphQL Client Updates

The existing `src/client/graphql-client.ts` adds:
- `X-ExperimentalApi: JiraPlan,JiraPlansSupport` header on all queries
- CloudId discovery at startup (already implemented)

### Hierarchy Walker Module

```typescript
// src/client/graphql-hierarchy.ts
class GraphQLHierarchyWalker {
  constructor(graphqlClient: GraphQLClient);

  // Walk down from a root issue, collecting all descendants
  async walkDown(issueKey: string, maxDepth?: number, maxItems?: number): Promise<HierarchyTree>;

  // Compute rollups on a collected tree
  computeRollups(tree: HierarchyTree, dimensions: string[]): RollupResult;
}
```

**Walk algorithm:**
1. Fetch root issue via `issueById` with full fields
2. If `hasChildIssues`, query `issueSearch` with `parent = KEY`
3. Recurse for each child that has children
4. Cap at `maxDepth` (default 4) and `maxItems` (default 200)
5. Return tree with all fields populated at every node

**Rollup computation (bottom-up):**
- **dates**: Earliest `startDate` among leaves → rolled-up start; latest `dueDate` → rolled-up end
- **points**: Sum of leaf story points; by status category
- **progress**: Resolved leaves / total leaves (count and point-weighted)
- **assignees**: Distinct assignees across subtree
- **conflicts**: Own due < rolled-up due, own start > rolled-up start

### Tool Interface

```typescript
{
  tool: "analyze_jira_plan",
  args: {
    issueKey: string,       // Required — root of the plan tree
    rollups?: string[],     // Default: all. Values: "dates", "points", "progress", "assignees"
    mode?: string           // "rollup" (default), "gaps", "timeline"
  }
}
```

### Output

```markdown
# Plan: IP-89 — Game Production
Depth: 3 levels, 47 issues
Source: GraphQL hierarchy (computed rollups)

○ IP-89: Game Production [Value Stream]
  Status: Active Item (To Do)
  Dates: own — | rolled-up 2024-01-15 – 2025-03-31
  Progress: 15/20 resolved (75%)
  Team: alice, bob, carol | 3 unassigned

  ├── ● IP-446: GA COAM Games Production [Initiative]
  │   Progress: 8/20 resolved (40%)
  │   └── ...
  ├── ● IP-459: South Dakota VLT Games Production [Initiative]
  │   Progress: 2/20 resolved (10%)
  │   └── ...
  └── ✓ IP-472: Prototype for Flex C development [Initiative]
```

### What This Does NOT Do

- **Replace Jira Plans UI** — no Gantt charts, no drag-and-drop
- **Write back rolled-up values** — read-only analysis
- **Use Plans-computed rollups** — computes from raw issue data (more portable, works without Plans)
- **Cross-plan comparison** — single root scope; user can run multiple analyses

## Consequences

### Positive

- **Works on any Jira Cloud instance** — doesn't require Plans/Premium license
- **Reusable module** — hierarchy walker serves plan analysis, data cube, and future tools
- **Single code path** — no REST/GraphQL dual-source complexity
- **Computes rollups we control** — can add dimensions Atlassian doesn't offer
- **Graph traversal is efficient** — JQL `parent = KEY` returns paginated children with all fields in one call
- "What does this plan actually imply?" becomes a single tool call

### Negative

- 8th tool in the catalog — increases tool selection surface
- GraphQL API is experimental — requires opt-in headers/directives that may change
- Rollup values may differ from Plans UI (we compute from raw data; Plans has its own logic)
- Hierarchy walks are chatty — one query per parent level
- Large trees (200+ items across 4+ levels) may hit rate limits

### Neutral

- Tool is conditionally registered — only appears when GraphQL/cloudId is available
- The GraphQL client is deliberately minimal — not a general-purpose AGG integration
- `atlassian-graph` project serves as reference for patterns but is not a dependency
- Tool description must clearly differentiate from `analyze_jira_issues` and `manage_jira_issue hierarchy`
- Bidirectional steering: hierarchy suggests plan analysis; plan analysis steers to hierarchy/analyze

## Alternatives Considered

### A. Atlassian roadmaps.* GraphQL queries

Use `roadmapForSource`, `roadmapDeriveFields`, `roadmapItemByIds` for Atlassian-computed rollups. **Rejected** — the `roadmaps` service returns 401 for API token auth. Requires session/cookie auth which is a worse security story and more fragile. The data is also only available for issues in configured Plans.

### B. planScenarioValues on JiraIssue

The `planScenarioValues` field exists on `JiraIssue` and returns plan-derived field values. **Rejected** — returns null with API token auth despite no error. Likely gated behind session auth. Even if it worked, it only returns values for issues explicitly in a Plan.

### C. REST-only rollups via existing getHierarchy()

Enhance the existing REST hierarchy walker to fetch rich fields and compute rollups. **Rejected as primary path** — REST hierarchy fetches 4 fields per node requiring a separate bulk enrichment call. GraphQL returns all fields in the traversal query. REST remains as fallback if GraphQL is unavailable.

### D. JPO REST API

The Plans REST API (`/rest/jpo/1.0/plans/{id}`) returns plan configuration (sources, date fields, hierarchy config) but not plan content or computed values. **Retained for plan discovery** — useful for finding which plan an issue belongs to and what date fields it uses. Not sufficient for rollup data.

### E. Depend on atlassian-graph MCP Server

Require users to run both MCP servers. **Rejected** — forces second server configuration, agent must coordinate across servers. We borrow patterns, not the dependency.

### F. OAuth 2.0 / Atlassian App for session-level access

Create an Atlassian Connect/Forge app to get session-equivalent auth for `roadmaps` and `planScenarioValues`. **Rejected** — disproportionate complexity for the user (app registration, consent flow, token management), and Forge now bills execution time. The whole point of this MCP server is to work outside Atlassian's runtime.
