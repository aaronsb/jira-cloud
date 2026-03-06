---
status: Draft
date: 2026-03-05
deciders:
  - aaronsb
related:
  - ADR-200
---

# ADR-201: Dynamic Custom Field Discovery

## Context

Every Jira instance has different custom fields — story points, sprint, team, regulatory classification, etc. The current server handles custom fields as an opaque `customFields: object` parameter, requiring the caller to already know field IDs and types. This is hostile to LLMs, which have no way to discover what custom fields exist, what they're called, or what values they accept.

Well-managed Jira instances have descriptions on their custom fields. Jira also exposes field usage statistics, screen counts, and last-used dates — giving us multiple signals for which fields actually matter.

Additionally, not all custom fields apply to all issues. Jira's field configuration is per project + issue type — a "Story" in project A may have completely different custom fields than a "Bug" in project B. Any solution must account for this context-dependency.

### Real-World Data

A production instance with 85 custom fields breaks down as:
- 70 system-managed/locked — excluded immediately
- 15 user-managed — ranging from "Story Points" (8 screens, used this week) to "Game Framework" (1 screen, last used 7 months ago)
- 69 fields were recently deleted in cleanup waves — without filtering, we'd suggest dead fields

Key observations from this data:
- **Screen count** is a strong signal: fields on 0 screens are invisible to users; fields on 5+ screens are clearly important
- **Last-used date** distinguishes active from stale fields better than raw count
- **Read-only fields** exist (e.g., "Reviewed by Producer") — useful on `get`, must not be suggested for `create`/`update`
- **Fields without descriptions** can still be important if they're on multiple screens
- **Exotic types** exist (cascading selects, asset objects, checkboxes) — not all map cleanly to JSON schema

## Decision

### Phase 1: Startup — Build the Master Catalog

At server startup, the MCP server discovers custom fields:

1. **Fetch all fields** via `GET /rest/api/3/field` — returns id, name, description, schema type, clauseNames, and whether the field is custom
2. **Fetch field metadata** — screen count and last-used date for each custom field
3. **Classify** each field by writability: writable, read-only, or unsupported type
4. **Filter** to qualifying fields using multiple signals (see Qualification Criteria below)
5. **Rank** qualifying fields by a composite score and apply a tail-curve cutoff
6. **Cache** the resulting master catalog in memory

This is the universe of *interesting* fields for this instance.

### Qualification Criteria

A custom field qualifies for the master catalog if it passes **all** of these filters:

| Filter | Rule | Rationale |
|--------|------|-----------|
| Not system-managed | `custom: true` and not locked | System fields are already handled as first-class params |
| **Has a description** | `description` is non-empty | Hard requirement. Fields without descriptions are excluded — no exceptions. This is documented as a prerequisite for Jira admins: "Want your custom fields to work with AI tools? Describe them." |
| On at least 1 screen | `screens >= 1` | Fields on 0 screens are invisible to users |
| Has a supported type | See Schema Type Mapping | Exotic types we can't represent are excluded from write suggestions |

The description requirement is intentionally strict. It incentivizes good Jira hygiene, produces higher-quality catalog entries, and gives admins a clear, actionable path to enable AI support for their fields.

### Ranking and Tail-Curve Cutoff

Qualifying fields are ranked by a composite score:

```
score = (screen_count × screen_weight) + (recency × recency_weight)
```

Where recency decays over time (recently used = higher score). The exact weights are tunable.

The cutoff operates in two regimes:

**Flat distribution** — all qualifying fields have similar scores. This is the common case for small or lightly-used instances: 10 custom fields, each used a handful of times. No field is clearly more important than another, so **all qualifying fields are included**.

**Steep distribution** — clear winners with a long tail. Story Points at 10,000 uses, some field at 3 uses. The tail is real and should be cut.

The regime is determined by the **spread ratio**: `max_score / median_score`.

- **Spread ratio < 10×**: Flat distribution. No cutoff applied — all qualifying fields enter the catalog.
- **Spread ratio ≥ 10×**: Steep distribution. Apply knee detection: walk the sorted scores and find where the steepest drop occurs (largest ratio between adjacent fields). Fields below the knee are excluded.

This ensures:
- A zero/low-usage instance with 10 described fields → all 10 included
- A busy instance with 50 described fields where 15 are heavily used → the 15 rise above the knee, the rest are excluded
- The cutoff is self-adjusting and never requires manual tuning

**Hard cap**: 30 fields regardless of cutoff, as a safety valve against pathological distributions.

### Phase 2: Per-Operation — Context-Aware Intersection

When working with a specific issue, the server intersects the master catalog with what's actually valid:

- **On `get`**: Return populated custom field values using their real names (not `customfield_10016`). Include both writable and read-only fields from the master catalog. Note which are read-only.
- **On `create`/`update`**: Fetch the field configuration for the target project + issue type (`GET /rest/api/3/issue/createmeta`). Intersect with the master catalog. Only suggest writable fields valid for this context.
- **In next-step guidance**: After any issue operation, list available custom fields for that context with types and descriptions: "Available custom fields: Story Points (number — Measurement of complexity), Cabinet Type (multi-select: [values])" — but only fields from the intersection.

### Schema Type Mapping

Custom fields are mapped from Jira schema types for validation and description:

| Jira Type | JSON Schema | Writable | Notes |
|-----------|-------------|----------|-------|
| `string` (single line) | `{ type: "string" }` | Yes | Free text |
| `string` (paragraph) | `{ type: "string" }` | Yes | May contain ADF — accept markdown, convert internally |
| `number` | `{ type: "number" }` | Yes | |
| `date` | `{ type: "string", format: "date" }` | Yes | ISO date |
| `datetime` | `{ type: "string", format: "date-time" }` | Yes | ISO datetime |
| `option` (single select) | `{ type: "string", enum: [...] }` | Yes | Values fetched from field config |
| `array[option]` (multi-select) | `{ type: "array", items: { enum: [...] } }` | Yes | Includes checkboxes |
| `option` (cascading) | `{ type: "object", properties: { parent: ..., child: ... } }` | Yes | Nested select — parent value required |
| `user` (single) | `{ type: "string" }` | Yes | accountId |
| `array[user]` (multi-user) | `{ type: "array", items: { type: "string" } }` | Yes | Array of accountIds |
| `labels` | `{ type: "array", items: { type: "string" } }` | Yes | Free-text tags |
| Read-only text | N/A | No | Surface on `get`, never suggest for `create`/`update` |
| Assets/objects | N/A | No | Complex Jira types — exclude from write, show on `get` if populated |

### How Fields Are Surfaced

The tool schema at ListTools time stays stable — `customFields` remains `type: object` with a description pointing to the catalog resource. The actual field intelligence is delivered through:

1. **`jira://custom-fields`** — MCP resource: master catalog ranked by score. Names, types, descriptions, field IDs, writability. The LLM reads this to learn what the instance has.
2. **`jira://custom-fields/{projectKey}/{issueType}`** — MCP resource: context-specific fields available for that combination, intersected with the master catalog. Only shows fields that are both interesting and valid for this context. Includes allowed values for select fields.
3. **Next-step guidance** — after `get`, `create`, `update` operations, the response includes available custom fields for that issue's context.
4. **On `get` responses** — populated custom field values appear with real names and descriptions inline, clearly labeled as custom fields.

### Name-to-ID Resolution

Callers use human-readable field names (e.g., `"Story Points"`, `"Cabinet Type"`). The handler resolves names to field IDs (`customfield_10035`, `customfield_10142`) internally using the master catalog. This keeps the LLM-facing interface clean while the Jira API gets what it needs.

### Refresh Strategy

- Master catalog built once at startup
- Optionally re-run on a TTL (e.g., 1 hour) for long-running servers
- Per-operation intersection is not cached — field configurations can change and the call is cheap
- Select field allowed values can be cached with a shorter TTL (values change less often than field configs)
- No persistence needed; server rediscovers on restart

## Consequences

### Positive

- LLMs can work with custom fields without prior knowledge of the instance
- Field descriptions from Jira flow directly into guidance — the instance documents itself
- Multi-signal ranking (screens + recency + description) gives a robust quality score
- Read-only vs writable classification prevents invalid write attempts
- Context-aware intersection means the LLM only sees fields that actually apply to the current project+issue type
- Follows ADR-200 principles: progressive disclosure (catalog → context → guidance), clean parameters, next-step suggestions

### Negative

- Adds startup latency (field list + metadata = 2-3 API calls before server is ready)
- Select/multi-select fields need an additional API call per field to fetch allowed values (can be lazy-loaded)
- Per-operation `createmeta` calls add latency to create/update (can be mitigated with short-lived caching)
- Cascading selects are complex — child values depend on parent selection, requiring multi-step interaction
- If the Jira instance has no field descriptions, the catalog will be empty — by design. The server logs which fields were excluded and why, giving admins a clear path to enable them

### Neutral

- The `customFields` object parameter on `manage_jira_issue` remains as the escape hatch for any field by raw ID, including ones not in the catalog
- The context-specific resource pattern (`jira://custom-fields/{projectKey}/{issueType}`) could extend to other instance metadata (issue types per project, available priorities, resolutions)
- Field name → field ID mapping is internal; callers never see `customfield_NNNNN`

## Alternatives Considered

- **Static configuration**: User lists custom field IDs in env vars or config file. Rejected — shifts the burden to the user, doesn't scale, doesn't self-describe.
- **Always include all custom fields**: Rejected — schema explosion on instances with hundreds of custom fields. The real-world instance had 85 fields; even after cleanup, surfacing all 15 remaining would dilute signal.
- **Promote top fields into the tool schema**: Attractive but impractical — the valid set depends on project + issue type, which isn't known at schema declaration time. Would either promote fields that aren't valid in some contexts or require dynamic schema changes per call.
- **Relax description requirement for high-usage fields**: Considered allowing fields without descriptions if they're on 3+ screens or recently used. Rejected — the description requirement is the quality gate. It's simple to explain to admins, produces better catalog entries, and avoids surfacing fields the LLM can't meaningfully describe to the user.
- **Sample recent issues to detect usage**: More complex, less reliable than Jira's built-in metadata (screen count, last-used date), and requires reading actual issue data with permission implications.
