/**
 * Extension modules (ADR-213 §B).
 *
 * An *extension module* bundles the handling for one thing that needs treatment beyond a plain
 * `customFields` write — Atlassian's own special fields (Sprint, Epic Link, Rank), the Tempo
 * Account field, and so on. A module declares its **bounds** (the field routes it owns — it touches
 * those fields and nothing else) and, optionally, a cheap read-only `detect()` so jira://capabilities
 * can report whether the extension's target is present on this tenant.
 *
 * This is deliberately *not* a generic plugin SDK: modules are composed by an explicit, hand-curated
 * list in `index.ts` — no auto-discovery, no glob. Adding one is a reviewed edit, justified by a
 * common user flow.
 */

import type { Version3Client } from 'jira.js';

import type { FieldAllowedValue } from '../client/field-discovery.js';

export interface FieldRouteContext {
  client: Version3Client;
  projectKey: string;
  issueTypeName: string;
}

export interface FieldRoute {
  /** Field names this route claims (matched case-insensitively against the field name, the catalog
   *  name resolved from a `customfield_*` id, and — for app-managed fields — the Connect/Forge field
   *  key, e.g. `io.tempo.jira__account`). */
  names: string[];
  /** Transforms a `customFields` value for this field before the standard issue-edit write — e.g.
   *  resolve a human-friendly option name to the numeric id Jira expects. `fieldId` is the resolved
   *  `customfield_*` id (or the raw key the caller passed, if it couldn't be resolved). Returns the
   *  value to send, or throws an `Error` with actionable text. */
  resolveWrite?(ctx: FieldRouteContext, fieldId: string, value: unknown): Promise<unknown>;
  /** Recovery guidance shown when this field can't be set through `customFields` here. */
  unhandled: {
    reason: string;
    message: string;
    suggestedTool?: string;
  };
}

export interface ExtensionDetectResult {
  present: boolean;
  notes?: string;
}

export interface ExtensionModule {
  /** Stable id, e.g. "tempo". */
  id: string;
  displayName: string;
  /** The field routes this module owns — its bounds. */
  routes: FieldRoute[];
  /** Optional, read-only, cheap: is this extension's target present on the tenant? Reads from the
   *  field catalog and similar already-fetched state; fail-open (treat errors as "unknown"). */
  detect?(): Promise<ExtensionDetectResult>;
}

/**
 * Match a human-friendly value against a field's allowed options. Exact (case-insensitive) wins;
 * otherwise a single substring match; ambiguity / no match throws with the available options. Shared
 * by modules that resolve a name to an option id.
 */
export function matchAllowedValue(
  value: string,
  options: FieldAllowedValue[],
  fieldLabel: string,
  scope: string,
): string | number {
  const norm = (s: string) => s.trim().toLowerCase();
  const target = norm(value);
  const exact = options.filter(o => norm(o.value) === target);
  const matches = exact.length > 0 ? exact : options.filter(o => norm(o.value).includes(target));
  if (matches.length === 1) return matches[0].id;
  const list = options.map(o => `${o.value} (${o.id})`).join(', ');
  if (matches.length === 0) {
    throw new Error(`"${value}" doesn't match any ${fieldLabel} option on ${scope}. Available: ${list}.`);
  }
  throw new Error(
    `"${value}" is ambiguous on ${scope} — matches: ${matches.map(o => `${o.value} (${o.id})`).join(', ')}. ` +
    `Use the exact name or the numeric id.`,
  );
}
