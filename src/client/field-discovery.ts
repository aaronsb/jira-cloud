/**
 * Dynamic custom field discovery (ADR-201).
 *
 * Builds a master catalog of interesting custom fields at startup.
 * Runs asynchronously — before the catalog is ready, custom fields
 * pass through unfiltered (no regression from pre-discovery behavior).
 */

import { Version3Client } from 'jira.js';

import { classifyFieldType, type FieldCategory, type FieldTypeInfo } from './field-type-map.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface CatalogField {
  id: string;          // e.g. "customfield_10035"
  name: string;        // e.g. "Story Points"
  description: string;
  category: FieldCategory;
  writable: boolean;
  jsonSchema: Record<string, unknown>;
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

export interface DiscoveryStats {
  totalCustomFields: number;
  excludedNoDescription: number;
  excludedNoScreens: number;
  excludedUnsupportedType: number;
  excludedLocked: number;
  catalogSize: number;
  undescribedRatio: number;  // 0..1 — ratio of on-screen custom fields without descriptions
}

// ── Constants ──────────────────────────────────────────────────────────

const HARD_CAP = 30;
const SPREAD_RATIO_THRESHOLD = 10;

// Scoring weights
const SCREEN_WEIGHT = 10;
const RECENCY_WEIGHT = 5;
const RECENCY_HALF_LIFE_DAYS = 30;

// ── Field Discovery ────────────────────────────────────────────────────

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
  private ready = false;
  private error: string | null = null;

  /** Whether the catalog has been built */
  isReady(): boolean {
    return this.ready;
  }

  /** Error message if startup discovery failed */
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
    if (!this.ready || this.catalog.length === 0) {
      return [];
    }

    try {
      // Step 1: Get issue types for this project
      const issueTypes = await client.issues.getCreateIssueMetaIssueTypes({
        projectIdOrKey: projectKey,
      });
      const matchingType = (issueTypes.issueTypes || issueTypes.createMetaIssueType || [])
        .find(t => t.name?.toLowerCase() === issueTypeName.toLowerCase());

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
    for (const key of this.requiredFieldsCache.keys()) {
      if (key.startsWith(projectKey.toLowerCase() + ':')) {
        this.requiredFieldsCache.delete(key);
      }
    }
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
   */
  async discover(client: Version3Client): Promise<void> {
    try {
      console.error('[field-discovery] Starting custom field discovery...');

      const rawFields = await this.fetchAllCustomFields(client);
      console.error(`[field-discovery] Fetched ${rawFields.length} custom fields`);

      // Detect well-known locked fields by schema type (before filtering)
      for (const field of rawFields) {
        const logicalName = WELL_KNOWN_FIELDS[field.schemaCustom];
        if (logicalName) {
          this.wellKnown.set(logicalName, field.id);
          console.error(`[field-discovery] Well-known: ${logicalName} → ${field.id} (${field.name})`);
        }
      }

      const { qualified, stats } = this.filterAndClassify(rawFields);
      console.error(`[field-discovery] ${qualified.length} fields passed filters`);

      const scored = this.scoreFields(qualified);
      const finalCatalog = this.applyCutoff(scored);

      this.catalog = finalCatalog;
      this.stats = { ...stats, catalogSize: finalCatalog.length };
      this.buildIndexes();
      this.ready = true;

      console.error(`[field-discovery] Catalog ready: ${finalCatalog.length} fields`);
      if (stats.undescribedRatio > 0.5) {
        console.error(
          `[field-discovery] WARNING: ${Math.round(stats.undescribedRatio * 100)}% of on-screen custom fields lack descriptions. ` +
          `Encourage your Jira admin to add descriptions for better AI support.`
        );
      }

      // Log excluded fields at debug level
      this.logExclusions(rawFields, finalCatalog);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error = msg;
      console.error(`[field-discovery] Discovery failed: ${msg}`);
      // Don't re-throw — catalog stays empty, fields pass through unfiltered
    }
  }

  /**
   * Fetch all custom fields with metadata via paginated API.
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
