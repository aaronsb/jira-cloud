---
status: Proposed
date: 2026-03-19
deciders:
  - aaronsb
related:
  - ADR-201
  - ADR-200
---

# ADR-209: Required field discovery per project and issue type

## Context

LLMs frequently fail when creating Jira issues because they lack context about what fields are required. The failure modes:

1. **Wrong issue type** — project uses `Feature` not `Story`, or has custom types like `Test Execution`, `ISO`. No way to discover valid types without calling `manage_jira_project get` first (and even that doesn't show issue types today).

2. **Missing required fields** — some projects require custom fields (e.g., `Gaming Sector`, `Cabinet Type`) that aren't in the standard create payload. The create call returns a 400 with cryptic field IDs.

3. **Wrong field format** — a required field might be a select list, multi-select, or user picker. Without knowing the type and allowed values, the LLM guesses.

This is distinct from ADR-201 (global custom field catalog). ADR-201 answers "what custom fields exist on this instance?" This ADR answers "what fields are required to create a Bug in project LGS?"

The required field set varies by **project x issue type** combination. Jira's `createmeta` API provides this, but it's expensive and the data is relatively stable — it changes when admins modify screens, not when users create issues.

## Decision

### 1. Create metadata cache

Build a cached map of `(projectKey, issueTypeName) -> RequiredFieldSet` populated lazily on first create attempt or proactively on project get.

**Data source:** `GET /rest/api/3/issue/createmeta/{projectIdOrKey}/issuetypes/{issueTypeId}` returns fields with `required: true`, their schema, and allowed values for select fields.

**Cache lifecycle:** populated lazily, no epoch invalidation (screen configs rarely change). Invalidate on 400 errors from create — the cache may be stale.

### 2. Surface issue types in project get

`manage_jira_project { operation: "get" }` response includes available issue types with their required fields summary. This is the natural discovery point — LLMs check a project before creating issues.

### 3. Create failure recovery

When `manage_jira_issue create` fails with a 400:
- Parse the error for missing required fields
- Fetch create metadata if not cached
- Return an actionable error with field names, types, and allowed values

### 4. Deduplicated cross-project field map

Many projects share the same required fields (company-wide custom fields on all screens). Store field definitions once, reference by ID per project/type combination. Expose as a resource for LLMs that use resource-aware patterns.

### 5. Steering on create

The tool description and next-steps guidance should steer LLMs to discover issue types before creating. When required custom fields are missing, include them in the error with allowed values.

## Consequences

### Positive

- Issue creation success rate increases dramatically
- Error recovery is actionable — specific fields, types, and allowed values
- Cross-project deduplication reduces cognitive load
- Cache is lazy — no startup cost

### Negative

- `createmeta` API calls are relatively expensive (one per project x issue type)
- Cache can go stale if admin changes screens (mitigated by invalidation on 400)
- Project get response becomes longer

### Neutral

- Builds on ADR-201's field catalog for descriptions and type info
- Well-known field discovery is complementary — global fields vs contextual requirements
- The existing `getContextFields()` in FieldDiscovery already does per-project/issue-type intersection — this extends it to include `required` status and allowed values

## Alternatives Considered

- **Always fetch createmeta before create** — rejected because it adds latency to every create. Lazy caching is better.
- **Hardcode common required fields** — rejected because requirements vary per instance.
- **Resource-only approach** — rejected as insufficient alone. LLMs need push-based hints in error messages, not just pull-based resources.
