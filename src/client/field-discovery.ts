/**
 * Dynamic custom field discovery (ADR-201).
 *
 * Builds a master catalog of interesting custom fields at startup.
 * Runs asynchronously — before the catalog is ready, custom fields
 * pass through unfiltered (no regression from pre-discovery behavior).
 */

import { Version3Client } from 'jira.js';

import { classifyFieldType, type FieldCategory, type FieldTypeInfo } from './field-type-map.js';
import { routeForField } from '../extensions/index.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface CatalogField {
  id: string;          // e.g. "customfield_10035"
  name: string;        // e.g. "Story Points"
  description: string;
  category: FieldCategory;
  writable: boolean;
  jsonSchema: Record<string, unknown>;
  /** Schema "custom" type, e.g. "com.pyxis.greenhopper.jira:gh-sprint" or a Connect app key —
   *  used by extension modules to recognise app-managed fields. May be "" when unknown. */
  schemaCustom: string;
  screensCount: number;
  lastUsed: string | null;  // ISO date or null
  score: number;
}

export interface IssueTypeInfo {
  id: string;
  name: string;
  subtask: boolean;
}

export interface RequiredFieldInfo {
  fieldId: string;
  name: string;
  schemaType: string;
  allowedValues?: string[];
}

/** An enumerable option for a field, as returned by createmeta — `{id, value}`. */
export interface FieldAllowedValue {
  id: string | number;
  value: string;
}

export interface DiscoveryStats {
  totalCustomFields: number;
  excludedNoDescription: number;
  excludedNoScreens: number;
  excludedUnsupportedType: number;
  excludedLocked: number;
  catalogSize: number;
  undescribedRatio: number;  // 0..1 — ratio of on-screen custom fields without descriptions
}

/**
 * Catalog readiness state (ADR-213 §A1).
 *
 * - `loading` — discovery hasn't finished yet
 * - `scored` — built from the admin field-search API; ranked by screen usage + recency, cut to the curated top-N
 * - `unscored` — admin field-search API returned 403; built from the basic field list (any authenticated user).
 *   No screen/recency metadata, so no ranking and no cutoff — every custom field is kept. Name→ID resolution
 *   (the write-path dependency) works the same; the `jira://custom-fields` resource is larger and unranked.
 * - `unavailable` — even the basic field list failed; no catalog at all
 */
export type CatalogMode = 'loading' | 'scored' | 'unscored' | 'unavailable';

// ── Constants ──────────────────────────────────────────────────────────

const HARD_CAP = 30;
const SPREAD_RATIO_THRESHOLD = 10;

// Scoring weights
const SCREEN_WEIGHT = 10;
const RECENCY_WEIGHT = 5;
const RECENCY_HALF_LIFE_DAYS = 30;

// ── Field Discovery ────────────────────────────────────────────────────

/**
 * True if an extension route owns a value-resolving write handler for this field (ADR-213 §B).
 * Used to mark `writable: true` on a field whose Jira type our classifier can't map — e.g. Tempo
 * Account reports an opaque schema (→ `unsupported` category) but `resolveTempoAccountWrite` turns
 * a name into the numeric id the standard issue-edit endpoint accepts. Matches the route by field
 * name first, then by schema-custom key. (#45 follow-up: keeps the catalog `writable` flag in
 * step with what the write path actually does.)
 */
function extensionCanWrite(fieldName: string, schemaCustom: string): boolean {
  const route = routeForField(fieldName) ?? (schemaCustom ? routeForField(schemaCustom) : undefined);
  return route?.resolveWrite != null;
}

/** Well-known locked fields identified by schema custom type */
const WELL_KNOWN_FIELDS: Record<string, string> = {
  'com.pyxis.greenhopper.jira:gh-sprint': 'sprint',
  'com.pyxis.greenhopper.jira:jsw-story-points': 'storyPoints',
  'com.atlassian.jpo:jpo-custom-field-baseline-start': 'startDate',
  'com.atlassian.jpo:jpo-custom-field-baseline-end': 'targetDate',
};

export class FieldDiscovery {
  private catalog: CatalogField[] = [];
  private nameToId: Map<string, string> = new Map();
  private idToField: Map<string, CatalogField> = new Map();
  private wellKnown: Map<string, string> = new Map(); // logical name → field ID
  private stats: DiscoveryStats | null = null;
  private mode: CatalogMode = 'loading';
  private error: string | null = null;

  /** Whether a usable catalog exists (scored or unscored). */
  isReady(): boolean {
    return this.mode === 'scored' || this.mode === 'unscored';
  }

  /** Granular catalog state — see {@link CatalogMode}. */
  getState(): CatalogMode {
    return this.mode;
  }

  /** Error message if discovery failed (or degraded). */
  getError(): string | null {
    return this.error;
  }

  /** The master catalog of discovered fields */
  getCatalog(): CatalogField[] {
    return this.catalog;
  }

  /** Discovery stats (available after catalog build) */
  getStats(): DiscoveryStats | null {
    return this.stats;
  }

  /** Get a well-known field ID by logical name (e.g., 'sprint', 'storyPoints') */
  getWellKnownFieldId(logicalName: string): string | null {
    return this.wellKnown.get(logicalName) ?? null;
  }

  /** All discovered well-known field mappings */
  getWellKnownFields(): Record<string, string> {
    return Object.fromEntries(this.wellKnown);
  }

  /** Resolve a human-readable field name to its Jira field ID */
  resolveNameToId(name: string): string | null {
    return this.nameToId.get(name.toLowerCase()) ?? null;
  }

  /** Look up a catalog field by ID */
  getFieldById(id: string): CatalogField | undefined {
    return this.idToField.get(id);
  }

  /**
   * Get fields valid for a specific project + issue type, intersected with the master catalog.
   * Returns only writable catalog fields that are also valid for this context.
   * Falls back to the full writable catalog if the createmeta call fails.
   */
  async getContextFields(
    client: Version3Client,
    projectKey: string,
    issueTypeName: string,
  ): Promise<CatalogField[]> {
    if (!this.isReady() || this.catalog.length === 0) {
      return [];
    }

    try {
      // Step 1: Get issue types (uses shared cache)
      const issueTypes = await this.getIssueTypes(client, projectKey);
      const matchingType = issueTypes.find(t => t.name.toLowerCase() === issueTypeName.toLowerCase());

      if (!matchingType?.id) {
        console.error(`[field-discovery] Issue type "${issueTypeName}" not found in project ${projectKey}`);
        return this.catalog.filter(f => f.writable);
      }

      // Step 2: Get fields for this project + issue type (paginated)
      const contextFieldIds = new Set<string>();
      let startAt = 0;
      const maxResults = 50;
      let hasMore = true;

      while (hasMore) {
        const fieldMeta = await client.issues.getCreateIssueMetaIssueTypeId({
          projectIdOrKey: projectKey,
          issueTypeId: matchingType.id,
          startAt,
          maxResults,
        });
        const fields = fieldMeta.fields || fieldMeta.results || [];
        for (const f of fields) {
          if (f.fieldId) contextFieldIds.add(f.fieldId);
        }
        if (fields.length < maxResults) {
          hasMore = false;
        }
        startAt += fields.length;
      }

      // Step 3: Intersect with master catalog (writable fields only)
      return this.catalog.filter(f => f.writable && contextFieldIds.has(f.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[field-discovery] Context field fetch failed for ${projectKey}/${issueTypeName}: ${msg}`);
      // Fall back to all writable catalog fields
      return this.catalog.filter(f => f.writable);
    }
  }

  // ── Required Fields Cache ────────────────────────────────────────────

  private requiredFieldsCache = new Map<string, RequiredFieldInfo[]>();
  private issueTypesCache = new Map<string, IssueTypeInfo[]>();

  /** Get issue types available for a project (lazy cached). */
  async getIssueTypes(client: Version3Client, projectKey: string): Promise<IssueTypeInfo[]> {
    const cacheKey = projectKey.toUpperCase();
    const cached = this.issueTypesCache.get(cacheKey);
    if (cached) return cached;

    try {
      const result = await client.issues.getCreateIssueMetaIssueTypes({
        projectIdOrKey: projectKey,
      });
      const types = (result.issueTypes || result.createMetaIssueType || [])
        .filter((t: any) => t.id && t.name)
        .map((t: any) => ({
          id: t.id as string,
          name: t.name as string,
          subtask: t.subtask ?? false,
        }));
      this.issueTypesCache.set(cacheKey, types);
      return types;
    } catch (err) {
      console.error(`[field-discovery] Issue type fetch failed for ${projectKey}: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }

  /** Get required fields for a project + issue type combination (lazy cached). */
  async getRequiredFields(
    client: Version3Client,
    projectKey: string,
    issueTypeName: string,
  ): Promise<RequiredFieldInfo[]> {
    const cacheKey = `${projectKey}:${issueTypeName}`.toLowerCase();
    const cached = this.requiredFieldsCache.get(cacheKey);
    if (cached) return cached;

    try {
      const issueTypes = await this.getIssueTypes(client, projectKey);
      const matchingType = issueTypes.find(t => t.name.toLowerCase() === issueTypeName.toLowerCase());
      if (!matchingType) return [];

      const required: RequiredFieldInfo[] = [];
      let startAt = 0;
      const maxResults = 50;
      let hasMore = true;

      while (hasMore) {
        const fieldMeta = await client.issues.getCreateIssueMetaIssueTypeId({
          projectIdOrKey: projectKey,
          issueTypeId: matchingType.id,
          startAt,
          maxResults,
        });
        const fields = (fieldMeta.fields || fieldMeta.results || []) as any[];
        for (const f of fields) {
          if (f.required && !f.hasDefaultValue) {
            const info: RequiredFieldInfo = {
              fieldId: f.fieldId,
              name: f.name,
              schemaType: f.schema?.type ?? 'unknown',
            };
            if (f.allowedValues && Array.isArray(f.allowedValues)) {
              info.allowedValues = f.allowedValues
                .slice(0, 20)
                .map((v: any) => v.name ?? v.value ?? String(v));
            }
            required.push(info);
          }
        }
        if (fields.length < maxResults) hasMore = false;
        startAt += fields.length;
      }

      this.requiredFieldsCache.set(cacheKey, required);
      return required;
    } catch (err) {
      console.error(`[field-discovery] Required fields fetch failed for ${projectKey}/${issueTypeName}: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }

  /** Clear required fields cache for a project (on 400 errors, cache may be stale). */
  invalidateRequiredFields(projectKey: string): void {
    const prefix = projectKey.toLowerCase() + ':';
    for (const key of this.requiredFieldsCache.keys()) {
      if (key.startsWith(prefix)) this.requiredFieldsCache.delete(key);
    }
    for (const key of this.fieldOptionsCache.keys()) {
      if (key.startsWith(prefix)) this.fieldOptionsCache.delete(key);
    }
  }

  // ── Field Options (createmeta allowedValues) ─────────────────────────

  private fieldOptionsCache = new Map<string, Map<string, FieldAllowedValue[]>>();

  /**
   * Enumerable allowed values (`{id, value}`) for a field on a project + issue type, read from
   * createmeta. Returns `[]` if the field isn't on that issue type's create screen or has no
   * enumerable options. Cached per project/issue-type — one createmeta walk covers every field.
   * Used to resolve a human-friendly option name to the id the issue-edit endpoint expects
   * (e.g. the Tempo Account field — see ADR-213 §B / field-routing.ts).
   */
  async getFieldAllowedValues(
    client: Version3Client,
    projectKey: string,
    issueTypeName: string,
    fieldId: string,
  ): Promise<FieldAllowedValue[]> {
    const cacheKey = `${projectKey}:${issueTypeName}`.toLowerCase();
    let perField = this.fieldOptionsCache.get(cacheKey);
    if (!perField) {
      perField = new Map<string, FieldAllowedValue[]>();
      try {
        const issueTypes = await this.getIssueTypes(client, projectKey);
        const matchingType = issueTypes.find(t => t.name.toLowerCase() === issueTypeName.toLowerCase());
        if (matchingType) {
          let startAt = 0;
          const maxResults = 50;
          let hasMore = true;
          while (hasMore) {
            const fieldMeta = await client.issues.getCreateIssueMetaIssueTypeId({
              projectIdOrKey: projectKey,
              issueTypeId: matchingType.id,
              startAt,
              maxResults,
            });
            const fields = (fieldMeta.fields || fieldMeta.results || []) as any[];
            for (const f of fields) {
              if (!f.fieldId || !Array.isArray(f.allowedValues) || f.allowedValues.length === 0) continue;
              const opts: FieldAllowedValue[] = [];
              for (const v of f.allowedValues) {
                const id = v?.id ?? v?.value;
                const value = v?.value ?? v?.name ?? (typeof v === 'string' ? v : undefined);
                if (id !== undefined && value !== undefined) opts.push({ id, value: String(value) });
              }
              if (opts.length > 0) perField.set(f.fieldId, opts);
            }
            if (fields.length < maxResults) hasMore = false;
            startAt += fields.length;
          }
        }
      } catch (err) {
        console.error(`[field-discovery] Field options fetch failed for ${projectKey}/${issueTypeName}: ${err instanceof Error ? err.message : err}`);
      }
      this.fieldOptionsCache.set(cacheKey, perField);
    }
    return perField.get(fieldId) ?? [];
  }

  /**
   * Start discovery in the background. Does not block.
   * Returns a promise that resolves when done (for testing).
   */
  startAsync(client: Version3Client): Promise<void> {
    const promise = this.discover(client);
    // Fire-and-forget for the server — errors are logged and stored
    promise.catch(() => {});
    return promise;
  }

  /**
   * Build the master catalog from Jira's field metadata.
   *
   * Tries the admin-only paginated field-search API first (full metadata → `scored` mode).
   * On any failure (typically a 403 for non-admin users — see issue #43) falls back to the
   * basic field list, which any authenticated user can read, and builds an `unscored` catalog.
   * If even that fails, the catalog stays empty (`unavailable`) and custom fields pass through
   * unfiltered, as before.
   */
  async discover(client: Version3Client): Promise<void> {
    console.error('[field-discovery] Starting custom field discovery...');

    let rawFields: RawField[];
    let degraded = false;
    try {
      rawFields = await this.fetchAllCustomFields(client);
      console.error(`[field-discovery] Fetched ${rawFields.length} custom fields (full metadata)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Keep the underlying cause around — it explains the degraded mode in the resource.
      this.error = `The admin field-search API is unavailable (${msg}) — likely because this user lacks the Administer Jira global permission. Running custom-field discovery in unscored mode.`;
      console.error(`[field-discovery] Admin field-search API unavailable (${msg}); falling back to the basic field list`);
      try {
        rawFields = await this.fetchCustomFieldsBasic(client);
        degraded = true;
        console.error(`[field-discovery] Fetched ${rawFields.length} custom fields (basic list — no screen/recency metadata)`);
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2);
        this.error = `Custom field discovery failed. Admin field-search API: ${msg}. Basic field list: ${msg2}.`;
        this.mode = 'unavailable';
        console.error(`[field-discovery] ${this.error}`);
        return;
      }
    }

    try {
      // Detect well-known locked fields by schema custom type (works in both modes)
      for (const field of rawFields) {
        const logicalName = WELL_KNOWN_FIELDS[field.schemaCustom];
        if (logicalName) {
          this.wellKnown.set(logicalName, field.id);
          console.error(`[field-discovery] Well-known: ${logicalName} → ${field.id} (${field.name})`);
        }
      }

      if (degraded) {
        this.catalog = this.buildUnscoredCatalog(rawFields);
        this.stats = {
          totalCustomFields: rawFields.length,
          excludedNoDescription: 0,
          excludedNoScreens: 0,
          excludedUnsupportedType: 0,
          excludedLocked: 0,
          catalogSize: this.catalog.length,
          undescribedRatio: 0,
        };
        this.buildIndexes();
        this.mode = 'unscored';
        console.error(`[field-discovery] Catalog ready (unscored): ${this.catalog.length} fields`);
      } else {
        const { qualified, stats } = this.filterAndClassify(rawFields);
        console.error(`[field-discovery] ${qualified.length} fields passed filters`);

        const scored = this.scoreFields(qualified);
        const finalCatalog = this.applyCutoff(scored);

        this.catalog = finalCatalog;
        this.stats = { ...stats, catalogSize: finalCatalog.length };
        this.buildIndexes();
        this.mode = 'scored';

        console.error(`[field-discovery] Catalog ready (scored): ${finalCatalog.length} fields`);
        if (stats.undescribedRatio > 0.5) {
          console.error(
            `[field-discovery] WARNING: ${Math.round(stats.undescribedRatio * 100)}% of on-screen custom fields lack descriptions. ` +
            `Encourage your Jira admin to add descriptions for better AI support.`
          );
        }
        this.logExclusions(rawFields, finalCatalog);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error = msg;
      this.mode = 'unavailable';
      console.error(`[field-discovery] Catalog build failed: ${msg}`);
    }
  }

  /**
   * Fetch all custom fields with full metadata via the admin paginated field-search API.
   * Requires the Administer Jira global permission — throws (typically 403) otherwise.
   */
  private async fetchAllCustomFields(client: Version3Client): Promise<RawField[]> {
    const allFields: RawField[] = [];
    let startAt = 0;
    const maxResults = 50;

    let hasMore = true;
    while (hasMore) {
      const page = await client.issueFields.getFieldsPaginated({
        type: ['custom'],
        expand: ['lastUsed', 'screensCount', 'isLocked'],
        startAt,
        maxResults,
      });

      const values = page.values || [];
      for (const f of values) {
        allFields.push({
          id: f.id,
          name: f.name,
          description: f.description || '',
          isLocked: f.isLocked || false,
          screensCount: f.screensCount || 0,
          lastUsed: f.lastUsed?.value || null,
          lastUsedType: f.lastUsed?.type || 'NO_INFORMATION',
          schemaType: f.schema?.type || '',
          schemaCustom: f.schema?.custom || '',
          schemaItems: f.schema?.items || '',
        });
      }

      if (page.isLast || values.length < maxResults) {
        hasMore = false;
      }
      startAt += values.length;
    }

    return allFields;
  }

  /**
   * Fetch custom fields via the basic field list (`GET /rest/api/3/field`), which any
   * authenticated user can read. Carries id / name / schema / `custom` flag but **not**
   * `description`, `screensCount`, `lastUsed`, or `isLocked` — so the resulting catalog is
   * `unscored` (no ranking, no cutoff). Used as the non-admin fallback for issue #43.
   */
  private async fetchCustomFieldsBasic(client: Version3Client): Promise<RawField[]> {
    const all = await client.issueFields.getFields();
    return (all || [])
      .filter(f => f?.id && (f.custom === true || f.id.startsWith('customfield_')))
      .map(f => ({
        id: f.id!,
        name: f.name || f.id!,
        description: '',
        isLocked: false,
        screensCount: 0,
        lastUsed: null,
        lastUsedType: 'NO_INFORMATION',
        schemaType: f.schema?.type || '',
        schemaCustom: f.schema?.custom || '',
        schemaItems: (f.schema?.items as string) || '',
      }));
  }

  /**
   * Build an unscored catalog: every custom field, no exclusions, no ranking, sorted by name.
   * Type classification still runs (drives the `writable` flag and `category`), but unsupported
   * types are kept rather than dropped — name→ID resolution should cover every field.
   */
  private buildUnscoredCatalog(rawFields: RawField[]): CatalogField[] {
    return rawFields
      .map(f => {
        const typeInfo = classifyFieldType(f.schemaType, f.schemaCustom || undefined, f.schemaItems || undefined);
        return {
          id: f.id,
          name: f.name,
          description: f.description,
          category: typeInfo.category,
          writable: typeInfo.writable || extensionCanWrite(f.name, f.schemaCustom),
          jsonSchema: typeInfo.jsonSchema,
          schemaCustom: f.schemaCustom,
          screensCount: 0,
          lastUsed: null,
          score: 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Apply qualification filters (ADR-201 §Qualification Criteria).
   */
  private filterAndClassify(rawFields: RawField[]): { qualified: QualifiedField[]; stats: Omit<DiscoveryStats, 'catalogSize'> } {
    const qualified: QualifiedField[] = [];
    let excludedNoDescription = 0;
    let excludedNoScreens = 0;
    let excludedUnsupportedType = 0;
    let excludedLocked = 0;

    // Count on-screen custom fields without descriptions for the nag ratio
    let onScreenTotal = 0;
    let onScreenNoDescription = 0;

    for (const field of rawFields) {
      // Track nag ratio across all on-screen fields
      if (field.screensCount > 0) {
        onScreenTotal++;
        if (!field.description.trim()) {
          onScreenNoDescription++;
        }
      }

      // Filter: not locked
      if (field.isLocked) {
        excludedLocked++;
        continue;
      }

      // Filter: has description (hard gate)
      if (!field.description.trim()) {
        excludedNoDescription++;
        continue;
      }

      // Filter: on at least 1 screen
      if (field.screensCount < 1) {
        excludedNoScreens++;
        continue;
      }

      // Filter: supported type
      // NOTE: this also drops extension-handled fields whose Jira type our classifier can't map
      // (e.g. Tempo Account on an admin tenant) — the unscored fallback keeps them and flags them
      // writable via `extensionCanWrite`, but the scored path doesn't. Retaining them here is a
      // larger change (it shifts what's in the curated catalog, not just a flag). See #45 / #57.
      const typeInfo = classifyFieldType(field.schemaType, field.schemaCustom || undefined, field.schemaItems || undefined);
      if (typeInfo.category === 'unsupported') {
        excludedUnsupportedType++;
        continue;
      }

      qualified.push({ ...field, typeInfo });
    }

    const undescribedRatio = onScreenTotal > 0 ? onScreenNoDescription / onScreenTotal : 0;

    return {
      qualified,
      stats: {
        totalCustomFields: rawFields.length,
        excludedNoDescription,
        excludedNoScreens,
        excludedUnsupportedType,
        excludedLocked,
        undescribedRatio,
      },
    };
  }

  /**
   * Score fields by composite score (screens × weight + recency × weight).
   */
  private scoreFields(fields: QualifiedField[]): ScoredField[] {
    const now = Date.now();

    return fields.map(field => {
      const screenScore = field.screensCount * SCREEN_WEIGHT;

      let recencyScore = 0;
      if (field.lastUsed && field.lastUsedType === 'TRACKED') {
        const lastUsedMs = new Date(field.lastUsed).getTime();
        const daysSinceUse = Math.max(0, (now - lastUsedMs) / (1000 * 60 * 60 * 24));
        // Exponential decay: recently used fields score higher
        recencyScore = Math.exp(-daysSinceUse / RECENCY_HALF_LIFE_DAYS) * RECENCY_WEIGHT;
      }

      const score = screenScore + recencyScore;

      return { ...field, score };
    });
  }

  /**
   * Apply tail-curve cutoff (ADR-201 §Ranking and Tail-Curve Cutoff).
   */
  private applyCutoff(fields: ScoredField[]): CatalogField[] {
    if (fields.length === 0) return [];

    // Sort descending by score
    const sorted = [...fields].sort((a, b) => b.score - a.score);

    // Check spread ratio
    const maxScore = sorted[0].score;
    const medianIndex = Math.floor(sorted.length / 2);
    const medianScore = sorted[medianIndex].score;

    let cutFields: ScoredField[];

    if (medianScore === 0 || maxScore / medianScore < SPREAD_RATIO_THRESHOLD) {
      // Flat distribution — include all
      cutFields = sorted;
    } else {
      // Steep distribution — find the knee
      const kneeIndex = this.findKnee(sorted);
      cutFields = sorted.slice(0, kneeIndex + 1);
    }

    // Apply hard cap
    const capped = cutFields.slice(0, HARD_CAP);

    return capped.map(f => ({
      id: f.id,
      name: f.name,
      description: f.description,
      category: f.typeInfo.category,
      writable: f.typeInfo.writable,
      jsonSchema: f.typeInfo.jsonSchema,
      schemaCustom: f.schemaCustom,
      screensCount: f.screensCount,
      lastUsed: f.lastUsed,
      score: Math.round(f.score * 100) / 100,
    }));
  }

  /**
   * Find the knee in a descending-sorted score list.
   * The knee is where the largest relative drop between adjacent scores occurs.
   */
  private findKnee(sorted: ScoredField[]): number {
    if (sorted.length <= 2) return sorted.length - 1;

    let maxRatio = 0;
    let kneeIndex = sorted.length - 1;

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i].score;
      const next = sorted[i + 1].score;
      if (next === 0) {
        kneeIndex = i;
        break;
      }
      const ratio = current / next;
      if (ratio > maxRatio) {
        maxRatio = ratio;
        kneeIndex = i;
      }
    }

    return kneeIndex;
  }

  private buildIndexes(): void {
    this.nameToId.clear();
    this.idToField.clear();
    for (const field of this.catalog) {
      // First wins — catalog is sorted by score descending, so higher-scored field takes precedence
      // when multiple Jira custom fields share the same name
      if (!this.nameToId.has(field.name.toLowerCase())) {
        this.nameToId.set(field.name.toLowerCase(), field.id);
      }
      this.idToField.set(field.id, field);
    }
  }

  private logExclusions(rawFields: RawField[], catalog: CatalogField[]): void {
    const catalogIds = new Set(catalog.map(f => f.id));
    const excluded = rawFields.filter(f => !catalogIds.has(f.id));

    for (const field of excluded) {
      const reasons: string[] = [];
      if (field.isLocked) reasons.push('locked');
      if (!field.description.trim()) reasons.push('no description');
      if (field.screensCount < 1) reasons.push('not on any screen');
      const typeInfo = classifyFieldType(field.schemaType, field.schemaCustom || undefined, field.schemaItems || undefined);
      if (typeInfo.category === 'unsupported') reasons.push(`unsupported type (${field.schemaCustom || field.schemaType})`);
      if (reasons.length === 0) reasons.push('below cutoff');

      console.error(`[field-discovery] Excluded: ${field.name} (${field.id}) — ${reasons.join(', ')}`);
    }
  }
}

// ── Internal Types ─────────────────────────────────────────────────────

interface RawField {
  id: string;
  name: string;
  description: string;
  isLocked: boolean;
  screensCount: number;
  lastUsed: string | null;
  lastUsedType: string;
  schemaType: string;
  schemaCustom: string;
  schemaItems: string;
}

interface QualifiedField extends RawField {
  typeInfo: FieldTypeInfo;
}

interface ScoredField extends QualifiedField {
  score: number;
}

// ── Singleton ──────────────────────────────────────────────────────────

/** Singleton instance — lives for the MCP server process lifetime */
export const fieldDiscovery = new FieldDiscovery();
