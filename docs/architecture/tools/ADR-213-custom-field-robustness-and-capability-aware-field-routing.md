---
status: Draft
date: 2026-05-11
deciders:
  - aaronsb
related:
  - ADR-200
  - ADR-201
  - ADR-202
  - ADR-206
  - ADR-208
  - ADR-212
---

# ADR-213: Custom field robustness and capability-aware field routing

## Context

Several issues filed from real agent and user sessions — #43, #44, #48, #49, #52 — show the custom-field surface is fragile in two distinct ways.

### 1. Discovery breaks for non-admin users

The master custom-field catalog (ADR-201) is built via `GET /rest/api/3/field/search` (jira.js `issueFields.getFieldsPaginated()`), which requires the **Administer Jira** global permission. A regular project member gets a `403`, the catalog never becomes ready, and every feature that depends on it silently degrades:

- `jira://custom-fields` returns `{status:"loading", fields:[], error:"...403"}` — and never resolves.
- `jira://custom-fields/{project}/{type}` returns `catalogReady:false`.
- `manage_jira_issue get` returns zero custom field values — `getCatalogFieldMeta()` short-circuits on `!isReady()`.
- The `customFields` write path can't resolve human-readable names to IDs — `resolveNameToId()` returns `null`, the name is passed through verbatim, and Jira rejects it.
- Agents conclude the instance "has no custom fields."

This is the **common case** for a server that authenticates with a user API token — most users are not site admins.

### 2. Write failures are opaque, and a class of writable fields is unreachable

When Jira rejects a `customFields` write, the error — `Field 'X' cannot be set. It is not on the appropriate screen, or unknown.` — is propagated verbatim. It conflates at least four failure modes, each needing a different recovery:

1. Field doesn't exist on the instance.
2. Field exists but isn't on the Edit screen for this project/issue type.
3. Field exists and is on the screen but needs a dedicated API (Sprint, Epic Link, Rank).
4. Field exists but is hidden by a field-configuration scheme.

And app-vendor fields that are inline-editable in the Jira UI but absent from the Edit screen — **Tempo Account / Tempo Team** being the canonical case — can't be set at all through the standard issue-edit endpoint. The override query parameters Jira offers (`overrideScreenSecurity`, `overrideEditableFlag`) require the Administer-Jira permission *and* an app / Connect / Forge auth context — neither available to this server's user-API-token model. So #52(a) and #52(b)'s override paths are simply unreachable here.

### The deeper pattern, and the boundary on it

Sprint, Epic Link, Parent Link, Rank are already "fields that need a different code path," and `manage_jira_sprint` already exists as Sprint's dedicated path. Tempo Account is the same shape — just owned by a third-party app — and it backs a *common user flow*: log time, then classify it CapEx/OpEx. Right now an agent can do everything in that flow except the last step.

The temptation is to build a general plugin/extension SDK that anticipates BigPicture, Structure, Xray, ScriptRunner, and the rest of the Marketplace. **That is explicitly not the goal.** This server is a thin, structural, opinionated toolkit for common Jira *user* flows — a person logging time, looking at goals, tagging items for a team, raising a service request. It is not a Jira-universe adapter. So the mechanism here is deliberately small: a curated routing table, not a pluggable framework. Adding a new app field to it is an opinionated decision ("does this unblock a common user flow?"), made one at a time — not "drop a module in the directory."

Volatility note: Tempo Cloud is mid-migration to Forge certification; its REST endpoints (`/rest/tempo-accounts/...`, `/rest/tempo-core/...`) are likely to be folded into a GraphQL surface. The one app integration we *do* build must keep its transport swappable.

## Decision

Two coordinated changes. **Part A** hardens the existing custom-field surface for the common (non-admin) case. **Part B** adds a small, curated, capability-aware field-routing layer so a handful of special fields — Atlassian's own (Sprint, Epic Link, Parent, Rank) and one app field (Tempo Account) — are handled correctly behind the existing tools. Part A's "this field needs a different path / set it in the UI" messages are the no-handler case of Part B's routing table — one design, two implementation stages.

### Part A — Custom-field robustness

**A1. Catalog fallback for non-admin users (#43).**
When `getFieldsPaginated()` returns `403`, fall back to `GET /rest/api/3/field` (jira.js `issueFields.getFields()`), which requires only "access Jira." This returns every field's `id`, `name`, `schema`/type, and `custom` flag — but **not** `lastUsed`, `screensCount`, or `isLocked`. Build the catalog from that with degraded metadata:

- Name→ID resolution (the critical write-path dependency) works the same — it needs only id + name.
- Scoring (`screensCount × 10` + recency decay) and the curated top-N cutoff are unavailable. In this mode the catalog keeps **all** custom fields rather than guessing a top-30.
- The "undescribed fields" nag still works — description presence is in the basic field payload.
- The resource reports `status: "ready"` with `mode: "scored" | "unscored"` instead of the misleading `"loading"` that never resolves. `unscored` mode includes a `count` and a one-line note that screen/recency ranking is unavailable. When even `getFields()` fails, `status: "unavailable"` with the error and an explanation. The `isReady()` predicate keeps its callers working by meaning "has a usable catalog" (`scored` *or* `unscored`); a new `getState()` exposes the granular mode for the resource.
- **Resolver vs. resource get different representations.** The name→ID resolver (the write-path dependency) holds *every* custom field — it's a Map, size is irrelevant. The `jira://custom-fields` *resource* (the LLM-readable surface) in `unscored` mode returns `{id, name, type}` per field (no `description` — `/rest/api/3/field` doesn't carry it), with a soft cap (~200) past which it truncates with a `count` and steers to `jira://custom-fields/{project}/{type}` — the createmeta-based view, which *does* carry descriptions and allowed values and needs only browse-project + create-issue.
- `jira://custom-fields/{project}/{type}` (the createmeta-based context view) works regardless of admin status; it must not gate on the master catalog being `scored` — it reports `catalogMode` (replacing the old `catalogReady` boolean).
- **Note on the `expand=names` source.** Jira's `expand=names` on an issue returns a `{fieldId: displayName}` map at *issue-read* permission — the same data the issue-view UI shows a non-admin (the codebase already uses it in `getPopulatedFields()`). It's per-issue, not bulk, so it doesn't replace `/field`. If `/field` itself is ever restricted (`status:"unavailable"`), wiring this as a fallback then is worth it — but A1 does *not* build a mutable global merge of it now; that would muddy the catalog's single-source-of-truth model for a rare case.

**A2. `manage_jira_issue get` returns custom field values (#44 Gap 1).**
The wiring already exists (`getCatalogFieldMeta()` → `getIssue()` → `customFieldValues[]`) — it just never fires because the catalog isn't ready. A1 fixes that. Additionally:

- Pass `getCatalogFieldMeta()` to the post-write re-fetch in `handleUpdateIssue`, `handleCreateIssue`, `handleMoveIssue`, and `handleTransitionIssue` so the rendered issue shows custom fields consistently (today only `handleGetIssue` passes it).
- Add `custom_fields` to the `expand` enum as an explicit, discoverable opt-in. In `scored` mode the curated set is small enough to always include. In `unscored` mode, `get` returns **populated** custom fields by default (filtered from the issue's `*navigable` field set — *not* by requesting hundreds of field IDs explicitly) and the full catalog only on `expand:["custom_fields"]`.

**A3. JQL field-name validation (#44 Gap 2).**
`execute_jql` uses the enhanced search endpoint (`searchForIssuesUsingJqlEnhancedSearch` → `/rest/api/3/search/jql`), which is lenient: an unknown field yields zero results, not a `400`. Add a pre-flight validation step using `POST /rest/api/3/jql/parse` with `validation: "strict"` (jira.js `jql.parseJqlQueries`). If the parse returns errors (unknown field, unknown function, syntax), surface them as a tool error with the original messages — *before* running the search. On parse success, run the search as today. Parse is cheap; no caching. (Caveat to verify in implementation: `/jql/parse` behaviour with `currentUser()` / `openSprints()` and saved-filter references — if strict validation rejects valid constructs, fall back to `validation: "warn"` and hard-fail only on `errors`, not `warnings`.)

**A4. Echo applied fields on write (#48).**
`handleUpdateIssue` / `handleCreateIssue` already re-fetch the issue post-write. Augment the response with an explicit **Applied** section: each field the caller asked to set, plus its resolved post-write value read from the re-fetched issue. For `customFields`, use the resolved (catalog) field name. Flag a drop *only* when the caller asked to set a non-empty value and the re-fetched issue shows that field null / empty / absent (`requested X — Jira stored nothing`) — that's the real silent-drop case (an off-screen field that accepts then discards the write). Do **not** do general value-equality checks: `5` vs `"5"`, a user's display name vs the stored accountId, an ISO date vs a timezone-normalized one all differ harmlessly and would false-flag. Render-only; no extra round-trip (the re-fetch already happens). Previous values are *not* included (would need a pre-fetch; not worth it).

**A5. Field-rejection error classification (#49, #52c).**
Before propagating a raw field-rejection error, classify it (extract a named `classifyFieldError(error, fieldDiscovery, fieldRouting)` helper out of the `src/index.ts` catch block, which is already overloaded). This requires the routing table — so **`src/client/field-routing.ts` lands here, in Part A**, seeded with the four Atlassian special-field entries (Sprint, Epic Link, Parent Link / Parent, Rank), all `unhandled` (recovery text only). Part B then adds the Tempo `Account` entry, the `requires` capability gate, and the capability probe — no churn to what Part A built.

- **Routed field with a handler** — should not reach here; the write was already routed (see B). If it does (handler failed), report the handler's error.
- **Routed field, no handler we can implement** (Sprint, Epic Link, Parent Link, Parent, Rank): the routing-table entry carries the recovery text — e.g. "`Sprint` is set via `manage_jira_sprint` (`manage_issues`), not `customFields`."
- **Field present in catalog but rejected** (off-screen / uneditable / config-hidden): "`Account` exists on this instance but isn't on the Edit screen for this issue type. It may still be editable inline in the Jira UI, or via the owning app's interface — the MCP can't reach it through the standard edit endpoint."
- **Field not in catalog at all**: "`Foo` isn't a field this instance exposes (checked the custom-field catalog). See `jira://custom-fields` for available names." — meaningfully useful now that the catalog works (A1).
- **Catalog unavailable** (`status:"unavailable"`): "Couldn't verify field names — the custom-field catalog is unavailable (admin-only API returned 403 and the fallback also failed). The name may be correct but unverifiable."

### Part B — Capability-aware field routing (small and curated, not a plugin framework)

**B1. The routing table.** A single internal registry — `src/client/field-routing.ts` (or similar) — listing the small, curated set of fields the MCP knows need special handling. Each entry:

```ts
interface FieldRoute {
  match: { names: string[]; idPatterns?: RegExp[] };   // "Sprint"; "Account" / "Tempo Account"; ...
  requires?: CapabilityId;                              // optional gate, e.g. "tempo" — absent ⇒ no handler
  write?(ctx: RouteContext, issueKey: string, value: unknown): Promise<RouteResult>;
  read?(ctx: RouteContext, issue: IssueData): Promise<unknown>;
  // When there is no `write` we can implement (Atlassian special fields, or `requires` not met):
  unhandled: { message: string; suggestedTool?: string };
}
```

Initial contents: `Sprint` → unhandled, points at `manage_jira_sprint`. `Epic Link` / `Parent Link` / `Parent` → unhandled, points at the `parent` param / `hierarchy`. `Rank` → unhandled, "not exposed; reorder in a board." (These four arrive in Part A with A5.) `Account` (aka "Tempo Account") → `requires: "tempo"`, with a `write` handler when Tempo is present, and `unhandled` ("inline-edit in the Jira UI, or in Tempo") when it isn't. (This one — plus the `requires` machinery — arrives in Part B.) That's the whole table for now — and growing it is a deliberate, reviewed act, not an extension point.

**B2. Capability detection.** One small startup probe — `src/client/tenant-capabilities.ts` — that establishes a handful of facts about *this* connection: is Tempo installed (a cheap read-only `GET` on a known Tempo endpoint, ~3s timeout, fail-open ⇒ "not present"); the custom-field catalog posture (`scored` / `unscored` / `unavailable` — already known from A1); whether the agile and JSM-portal surfaces are reachable (already probed elsewhere — just collect it). Run once, cache for the process. The `customFields` write loop in `manage_jira_issue` consults the routing table: if a field matches a route whose `requires` capability is present and has a `write` handler → route there; else fall through to standard edit (and, on rejection, A5). `get` enrichment calls `read` handlers the same way.

**B3. `jira://capabilities` resource.** A new static resource summarising what this connection can do: detected facts from B2 (Tempo present? version? catalog posture? agile/JSM reachable?), and the routing table's current entries with which are active vs. unhandled-here. Lets agents — and humans debugging a connection — see the limits up front instead of by trial.

**B4. Tempo Account write — the one concrete app handler.** Implemented under `src/client/tempo-client.ts` (transport isolated so the eventual REST→GraphQL migration is a one-file change): set an issue's Tempo Account via Tempo's account-link endpoint; resolve the current Account for display in `get`. Motivated specifically by the CapEx/OpEx classification flow — not "Tempo integration." Tempo Team can follow later by adding a route entry; nothing else changes.

### Non-goals

- **A generic extension / plugin SDK.** No `ExtensionModule` interface that arbitrary app integrations implement and self-register. The routing table is curated by hand; each entry is justified by a common user flow.
- **Comprehensive Marketplace-app support** (BigPicture, Structure, Xray, ScriptRunner, …). Out of scope. If one of them ever earns an entry, it will be because it unblocks a concrete common flow, decided then.
- **`overrideScreenSecurity` / `overrideEditableFlag`** — needs an app/Connect/Forge auth model the server doesn't have.
- **Custom fields as `analyze_jira_issues` `cube_setup` / `groupBy` dimensions (#44 Gap 3)** — needs a usage-ranking strategy and dimension-validation changes; a follow-up extending ADR-206, tracked separately, not in this PR.

## Consequences

### Positive

- Non-admin users get a working custom-field catalog — the common case stops silently failing.
- Write failures become actionable: agents know whether to retry with a different name, switch tools, or tell the user to use the UI.
- `manage_jira_issue get` and post-write responses consistently surface custom-field state, including silent-drop detection.
- The CapEx/OpEx (and similar) user flow becomes completable end-to-end without leaving the toolkit — without adding a tool or a generic plugin layer.
- `jira://capabilities` gives agents an honest picture of what the connection supports.
- App-API volatility (Tempo's Forge migration) is contained to one transport file.

### Negative

- One extra startup probe (Tempo presence) — bounded by a short timeout and fail-open, adds ~one round-trip to init on the worst path.
- A small new internal surface (routing table + capabilities probe + `jira://capabilities`) to maintain and document.
- `unscored` catalog mode is a degraded experience (no curated top-N); the resource can get large on instances with hundreds of custom fields.
- A `customFields` write to `Account` now has two possible paths (Tempo handler vs. standard edit) depending on detection — debuggable via logging and `jira://capabilities`, but it's an indirection that wasn't there before.

### Neutral

- Sprint / Epic Link / Rank routing (currently ad hoc, scattered) gets consolidated into the routing table — Atlassian's own special fields and the one app field use one model.
- `src/client/field-routing.ts` exists as a documented place to add a future special-field route, *if* one is ever warranted — but it is not advertised as an extension point.

## Alternatives Considered

- **A generic extension / plugin SDK** (`ExtensionModule` interface, `src/extensions/<app>/`, self-registration, factory injection) — rejected as scope creep. This is a thin opinionated toolkit for common user flows, not a Jira-universe adapter; a plugin framework invites exactly the unbounded growth it should avoid.
- **A tool per app** (`manage_tempo`, …) — rejected: blows the ADR-200 ≤10-tool budget, fragments the surface, and makes the agent pick a tool for what is conceptually "set a field on an issue."
- **Special-case each app inline in the issue handlers** — rejected: the handlers already creak; even a few `if (field === …)` branches scattered through create/update/get is worse than one routing table, and there's no detection layer so it would attempt Tempo calls on tenants without Tempo.
- **Don't fall back for #43; just document the admin requirement** — rejected: the non-admin case *is* the common case for a user-token MCP; "works only for site admins" is a much weaker tool.
- **Propagate the raw `/search/jql` leniency for #44 Gap 2** — rejected: silent zero-results for a typo'd field name is the bug being reported.
- **Use GraphQL for discovery instead of REST** (the codebase already has a `GraphQLClient` for the AGG and tenanted endpoints, used by `manage_jira_plan` and the hierarchy/flow analysis metrics) — considered for each discovery gap and rejected as the *primary* path:
  - *Master field catalog (#43)* — the AGG/tenanted Jira GraphQL exposes the issue-view field metadata at issue-read permission (same as `expand=names` above), but there is no non-admin **bulk** field-enumeration query that beats REST `GET /rest/api/3/field`. GraphQL would only win if we needed richer per-field schema (allowed values, etc.) — which `createmeta` (already used for the context view) supplies anyway. So: REST `/field` primary, `expand=names` complementary, GraphQL not needed.
  - *JQL validation (#44 Gap 2)* — there is a GraphQL JQL builder/validator (the UI's autocomplete engine), but it's OAuth-scoped and heavier than `POST /rest/api/3/jql/parse` with no upside.
  - *Custom-field cube dimensions (#44 Gap 3, deferred)* — neither REST nor GraphQL offers server-side aggregation over arbitrary fields; the cube is client-side by design (GraphQL is used there only for tree-walking rollups, which is a different operation). GraphQL changes nothing here.
  - *Tempo (Part B)* — GraphQL **is** the likely future transport once Tempo completes Forge certification (via the AGG gateway or Forge's GraphQL). Today Tempo is its own REST API; the design isolates that transport in `tempo-client.ts` precisely so the swap is contained. Anticipated, not usable yet.
  - *Capability detection (Part B)* — AGG `jira { ... }` app-presence queries could answer "is Tempo installed," but a cheap read-only probe of a known Tempo endpoint (200 vs. 404) is simpler and needs no extra scopes; GraphQL noted as an alternative if the probe proves unreliable.
- **Two separate ADRs (Part A, Part B)** — considered; folded into one because Part A's #49 messaging and #52(c) fallback are the no-handler case of Part B's routing table — splitting them would mean designing the same thing twice. Implementation still lands in two stages: Part A first, then Part B.
