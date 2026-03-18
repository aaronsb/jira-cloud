---
status: Draft
date: 2026-03-17
deciders:
  - aaronsb
related:
  - ADR-207
  - ADR-200
---

# ADR-208: GraphQL data source for plan rollups

## Context

ADR-207 proposes `analyze_jira_plan` — a tool that walks issue hierarchies and rolls up dates, points, time, and progress. The initial design computes rollups from REST API data: traverse the hierarchy, fetch fields at each level, aggregate bottom-up. This works but reinvents logic that Atlassian already provides through their first-class data interfaces.

### Atlassian Gateway Graph (AGG)

Atlassian exposes a unified GraphQL API at `https://api.atlassian.com/graphql` that spans all cloud products. The `roadmaps` root query provides direct access to plan/rollup data:

| Query | Purpose |
|-------|---------|
| `roadmapForSource` | Get a roadmap by its backing source (project, board) |
| `roadmapItemByIds` | Fetch specific roadmap items with their fields |
| `roadmapFilterItems` | Filtered views of roadmap items |
| `roadmapDeriveFields` | **Computed/derived fields** — Atlassian's own rollup engine |
| `roadmapSubtasksByIds` | Subtask hierarchy with status categories |
| `roadmapAriGoals` | Atlas/Rovo goals linked to roadmap items |

The `roadmapDeriveFields` query is particularly significant — it returns the same rolled-up values that the Plans UI displays. Atlassian has already solved the rollup problem; we can query the answer rather than recomputing it.

### Why This Matters for LLM Agents

When an LLM agent asks "when will this epic finish?" or "how much work remains under this initiative?", **it has no idea whether the answer should come from REST field values, computed rollups, or plan-level derived fields**. The agent just wants the answer. Using Atlassian's first-class data interface transparently — where the agent doesn't need to know or care about the data source — is highly effective. The tool should pick the best available source and return the result.

### Connection Requirements

The GraphQL endpoint uses the same basic auth credentials (`email:apiToken`) that we already have. The one additional requirement is **cloudId discovery** — the GraphQL API is multi-tenant and requires a cloud identifier to route queries. This is resolved at startup via:

```graphql
query GetTenantContexts($hostNames: [String!]!) {
  tenantContexts(hostNames: $hostNames) {
    cloudId
  }
}
```

The hostname comes from our existing `JIRA_HOST` environment variable. CloudId is resolved once and cached for the session.

### Reference Implementation

The `atlassian-graph` MCP server (`/home/aaron/Projects/ai/mcp/atlassian-graph`) demonstrates the full pattern:
- `src/site-config.js` — cloudId discovery via `tenantContexts` query
- `src/graphql-client.js` — GraphQL client with auth and automatic cloudId injection
- `.schema-cache/schema.json` — 30MB introspected schema showing all available types
- 200+ roadmap/plan/hierarchy-related types in the schema

## Decision

Add an optional GraphQL data layer to the jira-cloud MCP server that queries Atlassian's AGG endpoint for plan and rollup data. This supplements (not replaces) the existing REST API integration.

### Architecture: Transparent Dual-Source

```
┌─────────────────────────────────┐
│      analyze_jira_plan          │
│  (tool interface - ADR-207)     │
├─────────────────────────────────┤
│        Data Strategy Layer      │
│  ┌───────────┐  ┌────────────┐  │
│  │  GraphQL   │  │   REST     │  │
│  │  (prefer)  │  │ (fallback) │  │
│  └─────┬─────┘  └─────┬──────┘  │
│        │               │        │
│   roadmaps.*      hierarchy +   │
│   deriveFields    searchLean    │
└────────┴───────────────┴────────┘
```

The tool tries GraphQL first. If the GraphQL endpoint is unavailable (network, auth, feature not enabled), it falls back to REST-based rollup computation. The agent never sees this decision — it gets the same output shape either way.

### CloudId Discovery

At server startup (alongside existing health check):

1. Extract hostname from `JIRA_HOST` (strip `https://` if present)
2. Query `tenantContexts(hostNames: [$hostname])` against `api.atlassian.com/graphql`
3. Cache the returned `cloudId` for the session
4. If discovery fails, log a warning and disable GraphQL features — REST still works

No new environment variables required. The existing `JIRA_EMAIL`, `JIRA_API_TOKEN`, and `JIRA_HOST` are sufficient.

### GraphQL Client

A lightweight GraphQL client (not a full framework) that:

- Sends POST requests to `https://api.atlassian.com/graphql`
- Uses Basic auth with existing credentials
- Injects `cloudId` into query variables automatically
- Returns typed responses
- Has no dependency on the `atlassian-graph` project — we borrow the pattern, not the code

```typescript
// src/client/graphql-client.ts
class GraphQLClient {
  constructor(email: string, apiToken: string, cloudId: string);
  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
}
```

### Roadmap Queries for Plan Analysis

The key queries that power `analyze_jira_plan`:

#### 1. Resolve Roadmap from Issue

Find the roadmap that contains a given issue, so we can query its plan data:

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

This is the core rollup query — Atlassian computes the values:

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
      # ... other derived fields
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

### Fallback Strategy

| Scenario | Behavior |
|----------|----------|
| CloudId discovery succeeds, GraphQL queries work | Use GraphQL for derived fields, supplement with REST for fields not in roadmap |
| CloudId discovery succeeds, roadmap query returns null | Issue not in any plan — fall back to REST hierarchy + computed rollups |
| CloudId discovery fails | Disable GraphQL, use REST rollups exclusively, log warning at startup |
| GraphQL available but `roadmapDeriveFields` returns partial data | Merge GraphQL-derived fields with REST-computed fields |

The fallback is **per-request**, not global. An instance might have some projects with Plans configured and others without. The tool adapts per query.

### What the Agent Sees

Identical output regardless of data source. The tool may include a subtle provenance indicator:

```markdown
# Plan: PROJ-100 — Q1 Platform Initiative
Depth: 3 levels, 47 issues
Source: Atlassian Plans (derived fields)  ← or "computed from issue hierarchy"
```

This helps the human understand data quality (Atlassian's rollups reflect plan configuration; computed rollups are best-effort from raw fields) without requiring the agent to reason about data sources.

### Schema Discovery (Future)

The AGG schema is vast (388+ types, 200+ roadmap-related). For v1, we hardcode the specific queries we need. Future iterations could introspect the schema to discover available rollup fields dynamically — similar to how ADR-201 discovers custom fields via the REST API.

## Consequences

### Positive

- Rollup values match what users see in the Jira Plans UI — no discrepancies from recomputing
- `roadmapDeriveFields` handles edge cases we'd otherwise need to code: partial estimation, cross-project plans, custom hierarchy levels
- Agent transparency — the tool picks the best data source without the agent knowing or caring
- No new credentials required — existing env vars are sufficient
- Graceful degradation — REST fallback means the tool works on any Jira instance
- Opens the door to other AGG capabilities: goals, cross-product search, DevOps metrics

### Negative

- New API surface to maintain — GraphQL queries need updating if Atlassian changes the schema
- CloudId discovery adds a startup step (one extra HTTP call, cached for session)
- `roadmaps` queries may require Plans/Premium license — not all instances have it
- Two code paths (GraphQL + REST fallback) increase testing surface
- Schema is large and beta-flagged — some queries may change without notice

### Neutral

- The GraphQL client is deliberately minimal — not a general-purpose AGG integration
- `atlassian-graph` project serves as reference but is not a dependency
- CloudId is a session-level concern, not per-request — discovered once at startup
- The `roadmaps` API uses ARIs (Atlassian Resource Identifiers) not issue keys — we'll need to map between them

## Alternatives Considered

### A. REST-Only Rollups (ADR-207 original design)

Compute all rollups from REST hierarchy traversal + field fetching. Works everywhere, we control the logic. Rejected as the *sole* approach because it reinvents what Atlassian already provides and may diverge from what users see in Plans. Retained as the fallback.

### B. Depend on atlassian-graph MCP Server

Require users to run both MCP servers and let them compose. Rejected — this forces users to configure and manage a second server for a feature that should be built-in. The agent would also need to coordinate across servers, adding complexity. We borrow the patterns, not the dependency.

### C. Full AGG Integration with Schema Introspection

Introspect the entire AGG schema at startup (30MB) and generate queries dynamically. Overkill for v1 — we need ~3 specific queries. Schema introspection adds startup time and complexity. Revisit if we need broader AGG capabilities later.

### D. Jira Plans REST API (`/rest/align/...`)

The Plans feature has its own REST API separate from both the standard Jira REST API and AGG. It's poorly documented, returns opaque plan-specific data structures, and is not part of the public API contract. Rejected for stability and documentation concerns — AGG's `roadmaps` queries expose the same data through a supported interface.
