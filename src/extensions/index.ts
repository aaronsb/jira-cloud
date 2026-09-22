/**
 * Extension-module registry (ADR-213 §B).
 *
 * `MODULES` is the *explicit, hand-curated* list of extension modules — there is no auto-discovery
 * or glob. Adding a module = importing it here and adding it to the list = a reviewed edit, justified
 * by a common user flow. This is the composition point: the rest of the server asks here for the
 * field routes (issue create/update + error classification) and for the per-module status
 * (jira://capabilities).
 */

import { atlassianSpecialFields } from './atlassian-special-fields.js';
import { tempo } from './tempo.js';
import type { ExtensionModule, FieldRoute } from './types.js';

const MODULES: ExtensionModule[] = [atlassianSpecialFields, tempo];

export function allModules(): readonly ExtensionModule[] {
  return MODULES;
}

/** Every field route contributed by every module. */
export function allFieldRoutes(): readonly FieldRoute[] {
  return MODULES.flatMap(m => m.routes);
}

/** Find the route claiming a given field name, catalog name, or Connect field key, if any. */
export function routeForField(nameOrKey: string): FieldRoute | undefined {
  const lower = nameOrKey.toLowerCase();
  for (const m of MODULES) {
    const r = m.routes.find(rt => rt.names.some(n => n.toLowerCase() === lower));
    if (r) return r;
  }
  return undefined;
}

/**
 * Find the route claiming a field, given its catalog metadata: its name first, then its schema
 * `custom` type — both verbatim and with any vendor prefix stripped. Jira reports a Connect app
 * field's type as `com.atlassian.plugins.atlassian-connect-plugin:io.tempo.jira__account`, while
 * routes claim the bare field key (`io.tempo.jira__account`), so the suffix after the last `:` is
 * what matches a renamed app field (#59).
 */
export function routeForFieldMeta(name: string, schemaCustom: string): FieldRoute | undefined {
  const direct = routeForField(name);
  if (direct || !schemaCustom) return direct;
  const key = schemaCustom.slice(schemaCustom.lastIndexOf(':') + 1);
  return routeForField(schemaCustom) ?? (key ? routeForField(key) : undefined);
}

export interface ModuleStatus {
  id: string;
  displayName: string;
  /** `true` / `false` from the module's `detect()`; `undefined` for intrinsic modules with no probe. */
  present?: boolean;
  notes?: string;
  /** The field names/keys this module claims (its bounds). */
  fields: string[];
}

/**
 * Per-module status for jira://capabilities. Runs each module's `detect()` (cheap in-memory checks
 * against the field catalog) fresh each call — fail-open. Not cached: detection only reads state
 * that may still be warming up at startup, and re-running it is microseconds.
 */
export async function moduleStatuses(): Promise<ModuleStatus[]> {
  const out: ModuleStatus[] = [];
  for (const m of MODULES) {
    const fields = m.routes.flatMap(r => r.names);
    if (!m.detect) {
      out.push({ id: m.id, displayName: m.displayName, fields });
      continue;
    }
    try {
      const d = await m.detect();
      out.push({ id: m.id, displayName: m.displayName, present: d.present, notes: d.notes, fields });
    } catch {
      out.push({ id: m.id, displayName: m.displayName, notes: 'detection skipped (error)', fields });
    }
  }
  return out;
}

export type { ExtensionModule, FieldRoute, FieldRouteContext } from './types.js';
