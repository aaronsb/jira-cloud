---
status: Draft
date: 2026-05-11
deciders:
  - aaronsb
related:
  - ADR-200
  - ADR-201
  - ADR-213
---

# ADR-214: Progressive reveal of custom fields in `manage_jira_issue`

## Context

ADR-213 §A2 made populated custom field values render by default on `manage_jira_issue get` once the field catalog was ready. Live testing of the post-ADR-213 build (against a tenant with 498 custom fields, 35–40 populated per issue) revealed two problems:

1. **The cost is significant.** A routine `get` rendered a 35-line `Custom Fields:` block — roughly 600 tokens of content the caller didn't ask for. Multiply across a session of issue navigation and it dominates the conversation.
2. **It's inconsistent with every other rich section on the same tool.** `comments`, `transitions`, `attachments`, `history` are all explicit `expand` options — opt-in by design. Custom field values were the lone always-on rich section.

The same issue affects the post-write re-fetch rendered by `handleCreateIssue` / `handleUpdateIssue` / `handleMoveIssue` / `handleTransitionIssue`, which already carries a tailored `Applied:` section (ADR-213 §A4) listing what the caller just touched — so the additional Custom Fields dump is pure noise after a write.

## Decision

**Default `get` returns no Custom Fields block.** When the issue has any populated custom fields, the rendered output ends with a one-line **breadcrumb** instead:

> *📋 35 populated custom fields not shown. To view: `expand: ["custom_fields"]`. For what's settable on this issue type: read `jira://custom-fields/PAID/Task`.*

If the issue has zero populated custom fields (or the catalog is `unavailable`), the breadcrumb is omitted entirely.

`expand: ["custom_fields"]` (already in the enum from ADR-213 §A2) becomes the opt-in: when present, render the populated set as before. This restores the rest of `expand`'s opt-in pattern.

**Post-write renders drop the Custom Fields dump unconditionally.** `Applied:` already shows the fields the caller just modified with their post-write values; the broader dump is redundant. The breadcrumb is also omitted there — the caller's attention belongs on what they wrote, not on the rest of the issue's state.

**Discovery surface for "what could I set?" stays where it is:** `jira://custom-fields/{projectKey}/{issueType}` lists every settable field on the issue type's create screen, with descriptions and allowed values. The breadcrumb points at it.

### Implementation sketch

- `MarkdownRenderer.renderIssue(issue, transitions, opts?)` gains an `opts.customFields: 'breadcrumb' | 'dump'` parameter (default `'breadcrumb'`). In breadcrumb mode it emits the one-liner from a count of `issue.customFieldValues`; in dump mode the existing block. Zero-population: no breadcrumb in either mode.
- `handleGetIssue` passes `'dump'` when `expansionOptions.custom_fields` is true; `'breadcrumb'` otherwise. The breadcrumb needs the project key (from the issue key prefix) and the issue type (from `issue.issueType`) to build the scoped-resource URI hint.
- `handleCreateIssue` / `handleUpdateIssue` / `handleMoveIssue` / `handleTransitionIssue` always pass `'breadcrumb'`... actually, pass an explicit `'none'` mode (no dump, no breadcrumb) — the `Applied:` section is the right read-out for a write.
- No schema change needed (`custom_fields` is already a valid `expand` value).

### Deferred (v2 — "depth dial")

If the breadcrumb proves too coarse — agents almost always expand because they need *some* fields and the populated set is still large — escalate to a relevance-ranked reveal. The math is already half there:

```
score_for_reveal(field, issue) =
    catalog.score(field)                    // ADR-201: screensCount × 10 + recency decay
  + α × sessionInterest(field)              // new: touches in this process, decayed
  + β × isPopulated(field, issue)           // per-issue boost
```

`sessionInterest` is a process-local `Map<fieldId, {touches, lastSeen}>` updated whenever a `get`/`update` references a field, decayed on the same half-life shape as the catalog's recency. It exists primarily for the unscored-mode case (ADR-213 §A1), where `catalog.score` is flat across all fields and `sessionInterest` becomes the only depth signal.

`expand: ["custom_fields"]` then takes an optional depth — `expand: ["custom_fields:top"]` for top-N, `expand: ["custom_fields:populated"]` for the current opt-in set, `expand: ["custom_fields:empty"]` for the unset-but-settable set — but only if v1's breadcrumb measurement says the coarse default isn't enough. The simplest viable thing first; data drives the escalation.

## Consequences

### Positive

- Routine `get` calls become token-light again; the cost of a populated dump moves to the call that explicitly asks for it.
- Custom fields finally behave like every other rich section on `manage_jira_issue` — opt-in via `expand`.
- The breadcrumb teaches the next move (the `expand` keyword and the scoped resource) instead of dumping and hoping the agent ignores it.
- Post-write responses get smaller and more focused; `Applied:` is the read-out.

### Negative

- Any consumer that was parsing the Custom Fields block from a default `get` needs to add `expand: ["custom_fields"]`. (No known consumer does this — the populated-by-default behavior shipped in ADR-213 and the repo has had no time to grow dependents.)
- One more concept for new callers to learn ("custom fields are an expand"), partially offset by it now matching the other expand options.

### Neutral

- The opt-in surface stays exactly as ADR-213 left it (`expand: ["custom_fields"]`); only the *default* changes. No schema migration.
- The scoped resource `jira://custom-fields/{proj}/{type}` becomes the canonical "what could I set?" surface. Already exists; the breadcrumb just makes it discoverable.

## Alternatives Considered

- **Keep populated-by-default.** Rejected after live testing — the token cost is real, and the inconsistency with `comments`/`attachments`/`transitions`/`history` is glaring once seen. ADR-213's A2 decision was made before that evidence existed.
- **Jump straight to the depth-dial / multi-mode expand** (`custom_fields_top` / `custom_fields_empty` / etc.) as v1. Rejected as premature: the breadcrumb might be enough, and `jira://custom-fields/{proj}/{type}` already serves the "what could I set?" use case. Build v1, measure, then escalate if needed.
- **Trim the dump by limiting to N most-recent or N highest-scored.** Rejected as a half-measure: it's still always-on, still inconsistent with the other expand options, and the "N" is arbitrary.
- **Render the breadcrumb on post-write too.** Rejected: `Applied:` is the right read-out for a write; the broader issue state isn't what the caller needs to see right after modifying it.
