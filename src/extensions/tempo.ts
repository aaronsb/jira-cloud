/**
 * Tempo extension module (ADR-213 §B).
 *
 * Bounds: the Tempo **Account** field. The standard Jira issue-edit endpoint accepts it, but
 * expects the numeric Tempo account id — not the account name. `resolveWrite` turns a name string
 * into that id using the field's allowed values from createmeta (project-scoped) — so no Tempo API
 * token is needed. `detect()` reports whether a Tempo-managed field is present in the field catalog.
 *
 * (Tempo Team and worklog attributes are deliberately out of scope for now — see the ADR. The
 * modern Tempo Cloud API at api.tempo.io has its own token; if a future handler needs it, that's
 * when a `TEMPO_API_TOKEN` mechanism gets added — the `requires` hook on a route is for that case.)
 */

import type { ExtensionModule, FieldRoute, FieldRouteContext } from './types.js';
import { matchAllowedValue } from './types.js';
import { fieldDiscovery } from '../client/field-discovery.js';

/** Tempo's Connect/Forge field-key marker — appears in schema `custom` types and in Jira's
 *  field-error keys for Tempo-managed fields (e.g. `io.tempo.jira__account`). */
const TEMPO_FIELD_MARKER = /io\.tempo\./i;

/** Resolve the Account field's `customFields` value to the numeric id Jira expects. */
async function resolveTempoAccountWrite(ctx: FieldRouteContext, fieldId: string, value: unknown): Promise<unknown> {
  if (typeof value === 'number') return value;
  if (value !== null && typeof value === 'object') return value;  // already `{id: ...}` or similar
  if (typeof value !== 'string') return value;                    // unknown shape — let Jira reject it
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);              // bare numeric string → the id

  const options = await fieldDiscovery.getFieldAllowedValues(ctx.client, ctx.projectKey, ctx.issueTypeName, fieldId);
  if (options.length === 0) {
    throw new Error(
      `Couldn't resolve the Account value "${value}" — the Account field exposes no enumerable ` +
      `options on ${ctx.projectKey}/${ctx.issueTypeName} (it may not be on that issue type's screen, ` +
      `or no Tempo accounts are linked to this project). Pass the numeric Tempo account id directly ` +
      `(customFields: {"Account": <id>}), or set it in the Jira UI.`,
    );
  }
  return matchAllowedValue(value, options, 'Account', ctx.projectKey);
}

const accountRoute: FieldRoute = {
  names: ['account', 'tempo account', 'io.tempo.jira__account'],
  resolveWrite: resolveTempoAccountWrite,
  unhandled: {
    reason: 'tempo_account_value_format',
    message:
      'The Account field is provided by the Tempo app. Pass the account *name* (e.g. ' +
      '"OpEx - Praecipio AI Dev") or its numeric id — this server resolves a name to the id via the ' +
      'project\'s field options. If it still fails, the account may not be linked to this project, ' +
      'or the field may not be on this issue type\'s screen; setting it inline in the Jira UI works.',
  },
};

export const tempo: ExtensionModule = {
  id: 'tempo',
  displayName: 'Tempo (Account field)',
  routes: [accountRoute],
  async detect() {
    try {
      const hits = fieldDiscovery.getCatalog().filter(f => TEMPO_FIELD_MARKER.test(f.schemaCustom));
      if (hits.length === 0) return { present: false };
      return { present: true, notes: `Tempo-managed field(s): ${hits.map(f => `${f.name} (${f.id})`).join(', ')}` };
    } catch {
      return { present: false, notes: 'detection skipped (field catalog unavailable)' };
    }
  },
};
