/**
 * Field-rejection error classification (ADR-213 §A5, issues #49 and #52c).
 *
 * Jira rejects a `customFields` write with one opaque message —
 *   "Field 'X' cannot be set. It is not on the appropriate screen, or unknown."
 * — that conflates several failure modes, each needing a different recovery. Given Jira's
 * field-error map (keyed by field id or name), this returns extra guidance lines that pull
 * those modes apart:
 *
 *   - field has a dedicated path (Sprint, Epic Link, Parent, Rank) → point at the right tool/param
 *   - field exists in the catalog but isn't writable here → "editable inline in the UI, or via the
 *     owning app — not reachable through the standard edit endpoint"
 *   - field isn't in the catalog → "not a field this instance exposes — see jira://custom-fields"
 *   - catalog unavailable → say so; the name may be right but can't be verified here
 */

import { fieldDiscovery } from '../client/field-discovery.js';
import { routeForField } from '../client/field-routing.js';

/** Looks like a Connect/Forge app field key (e.g. `io.tempo.jira__account`) rather than a
 *  `customfield_NNNNN` id or a plain field name — Jira sometimes reports field errors this way. */
function looksLikeAppFieldKey(key: string): boolean {
  return !key.startsWith('customfield_') && (key.includes('__') || /^[a-z][\w-]*(\.[\w-]+){2,}/i.test(key));
}

export function classifyFieldErrors(fieldErrors: Record<string, unknown>): string[] {
  const out: string[] = [];
  const catalogState = fieldDiscovery.getState();

  for (const fieldKey of Object.keys(fieldErrors)) {
    const catalogEntry = fieldKey.startsWith('customfield_')
      ? fieldDiscovery.getFieldById(fieldKey)
      : undefined;
    const humanName = catalogEntry?.name ?? fieldKey;
    const resolvedId = fieldKey.startsWith('customfield_')
      ? fieldKey
      : fieldDiscovery.resolveNameToId(fieldKey);
    const isKnownField = !!catalogEntry || !!resolvedId;

    const route = routeForField(fieldKey) ?? routeForField(humanName);
    if (route) {
      out.push(`  → \`${humanName}\`: ${route.unhandled.message}`);
      continue;
    }
    if (isKnownField) {
      out.push(
        `  → \`${humanName}\` exists on this instance but the write was rejected — it may be off ` +
        `the Edit screen for this issue type, hidden by a field configuration, or an app-managed ` +
        `field that wants a different value format (e.g. a numeric id rather than a name). It may ` +
        `still be editable inline in the Jira UI.`,
      );
      continue;
    }
    if (looksLikeAppFieldKey(fieldKey)) {
      out.push(
        `  → \`${fieldKey}\` is a field registered by a Connect/Forge app — the write was rejected ` +
        `(see the message above). App-managed fields often expect a specific value format ` +
        `(e.g. a numeric account/option id rather than a name) or must be set through the app's own ` +
        `interface; setting it inline in the Jira UI usually works.`,
      );
      continue;
    }
    if (catalogState === 'unavailable') {
      out.push(
        `  → \`${fieldKey}\`: couldn't verify this field name — the custom-field catalog is ` +
        `unavailable (the admin field API returned 403 and the basic fallback also failed). The ` +
        `name may be correct but can't be checked here.`,
      );
      continue;
    }
    out.push(
      `  → \`${fieldKey}\` isn't a custom field this instance exposes (checked the ${catalogState} ` +
      `catalog). Read jira://custom-fields for available names, or ` +
      `jira://custom-fields/{projectKey}/{issueType} for the fields on a specific issue type.`,
    );
  }

  return out;
}
