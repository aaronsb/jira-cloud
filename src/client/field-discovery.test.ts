import { describe, it, expect, beforeEach } from 'vitest';
import { FieldDiscovery } from './field-discovery.js';

/** Helper to create a discovery instance and exercise its internal logic via discover() with a mock client */
function createMockClient(fields: any[]) {
  return {
    issueFields: {
      getFieldsPaginated: async () => ({
        values: fields,
        isLast: true,
      }),
    },
  } as any;
}

function makeField(overrides: Partial<{
  id: string;
  name: string;
  description: string;
  isLocked: boolean;
  screensCount: number;
  lastUsed: { type: string; value: string } | undefined;
  schema: { type: string; custom?: string; items?: string };
}> = {}) {
  return {
    id: overrides.id ?? 'customfield_10001',
    name: overrides.name ?? 'Test Field',
    description: overrides.description ?? 'A test field',
    isLocked: overrides.isLocked ?? false,
    screensCount: overrides.screensCount ?? 3,
    lastUsed: overrides.lastUsed,
    schema: overrides.schema ?? {
      type: 'number',
      custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float',
    },
  };
}

describe('FieldDiscovery', () => {
  let discovery: FieldDiscovery;

  beforeEach(() => {
    discovery = new FieldDiscovery();
  });

  it('starts as not ready', () => {
    expect(discovery.isReady()).toBe(false);
    expect(discovery.getCatalog()).toEqual([]);
  });

  it('builds catalog from qualifying fields', async () => {
    const client = createMockClient([
      makeField({ id: 'cf_1', name: 'Story Points', description: 'Complexity', screensCount: 5 }),
      makeField({ id: 'cf_2', name: 'Team', description: 'Team name', screensCount: 3, schema: { type: 'string', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:textfield' } }),
    ]);

    await discovery.discover(client);

    expect(discovery.isReady()).toBe(true);
    expect(discovery.getCatalog()).toHaveLength(2);
    expect(discovery.getCatalog()[0].name).toBe('Story Points'); // Higher score (more screens)
  });

  it('excludes fields without descriptions', async () => {
    const client = createMockClient([
      makeField({ id: 'cf_1', name: 'Described', description: 'Has a description', screensCount: 3 }),
      makeField({ id: 'cf_2', name: 'Undescribed', description: '', screensCount: 5 }),
    ]);

    await discovery.discover(client);

    expect(discovery.getCatalog()).toHaveLength(1);
    expect(discovery.getCatalog()[0].name).toBe('Described');
  });

  it('excludes fields on zero screens', async () => {
    const client = createMockClient([
      makeField({ id: 'cf_1', name: 'Visible', description: 'On screens', screensCount: 2 }),
      makeField({ id: 'cf_2', name: 'Invisible', description: 'No screens', screensCount: 0 }),
    ]);

    await discovery.discover(client);

    expect(discovery.getCatalog()).toHaveLength(1);
    expect(discovery.getCatalog()[0].name).toBe('Visible');
  });

  it('excludes locked fields', async () => {
    const client = createMockClient([
      makeField({ id: 'cf_1', name: 'Unlocked', description: 'Free', screensCount: 2 }),
      makeField({ id: 'cf_2', name: 'Locked', description: 'System', screensCount: 5, isLocked: true }),
    ]);

    await discovery.discover(client);

    expect(discovery.getCatalog()).toHaveLength(1);
    expect(discovery.getCatalog()[0].name).toBe('Unlocked');
  });

  it('excludes unsupported types (cascading select)', async () => {
    const client = createMockClient([
      makeField({ id: 'cf_1', name: 'Good', description: 'Number field', screensCount: 2 }),
      makeField({
        id: 'cf_2', name: 'Cascading', description: 'Complex', screensCount: 5,
        schema: { type: 'option', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:cascadingselect' },
      }),
    ]);

    await discovery.discover(client);

    expect(discovery.getCatalog()).toHaveLength(1);
    expect(discovery.getCatalog()[0].name).toBe('Good');
  });

  it('resolves field names to IDs (case-insensitive)', async () => {
    const client = createMockClient([
      makeField({ id: 'customfield_10035', name: 'Story Points', description: 'Complexity', screensCount: 3 }),
    ]);

    await discovery.discover(client);

    expect(discovery.resolveNameToId('Story Points')).toBe('customfield_10035');
    expect(discovery.resolveNameToId('story points')).toBe('customfield_10035');
    expect(discovery.resolveNameToId('STORY POINTS')).toBe('customfield_10035');
    expect(discovery.resolveNameToId('Unknown')).toBeNull();
  });

  it('looks up fields by ID', async () => {
    const client = createMockClient([
      makeField({ id: 'customfield_10035', name: 'Story Points', description: 'Complexity', screensCount: 3 }),
    ]);

    await discovery.discover(client);

    const field = discovery.getFieldById('customfield_10035');
    expect(field).toBeDefined();
    expect(field!.name).toBe('Story Points');
    expect(field!.category).toBe('number');
  });

  it('tracks undescribed field ratio in stats', async () => {
    const client = createMockClient([
      makeField({ id: 'cf_1', name: 'Described', description: 'Has desc', screensCount: 2 }),
      makeField({ id: 'cf_2', name: 'Undescribed1', description: '', screensCount: 3 }),
      makeField({ id: 'cf_3', name: 'Undescribed2', description: '', screensCount: 1 }),
    ]);

    await discovery.discover(client);

    const stats = discovery.getStats();
    expect(stats).not.toBeNull();
    // 3 on-screen fields, 2 without descriptions = 2/3 ≈ 0.667
    expect(stats!.undescribedRatio).toBeCloseTo(2 / 3, 2);
    expect(stats!.excludedNoDescription).toBe(2);
  });

  it('applies hard cap of 30 fields', async () => {
    const fields = Array.from({ length: 40 }, (_, i) =>
      makeField({
        id: `cf_${i}`,
        name: `Field ${i}`,
        description: `Description ${i}`,
        screensCount: 40 - i, // Descending importance
      })
    );

    const client = createMockClient(fields);
    await discovery.discover(client);

    expect(discovery.getCatalog().length).toBeLessThanOrEqual(30);
  });

  it('keeps all fields in flat distribution', async () => {
    // All fields have similar screen counts — flat distribution
    const fields = Array.from({ length: 8 }, (_, i) =>
      makeField({
        id: `cf_${i}`,
        name: `Field ${i}`,
        description: `Description ${i}`,
        screensCount: 3, // Same for all
      })
    );

    const client = createMockClient(fields);
    await discovery.discover(client);

    expect(discovery.getCatalog()).toHaveLength(8);
  });

  it('cuts tail in steep distribution', async () => {
    // Need spread ratio ≥ 10× between max and median to trigger steep mode.
    // Scores are screensCount × 10 (SCREEN_WEIGHT), so we need max/median ≥ 10.
    // 5 fields: sorted scores will be [5000, 4000, 3000, 10, 10], median (index 2) = 3000.
    // 5000/3000 = 1.67 — not steep enough. Use extreme values instead.
    const fields = [
      makeField({ id: 'cf_top1', name: 'Top 1', description: 'Desc', screensCount: 500 }),
      makeField({ id: 'cf_top2', name: 'Top 2', description: 'Desc', screensCount: 400 }),
      // Median field (index 2 of 5) — must be ≤ 1/10 of max for steep trigger
      makeField({ id: 'cf_mid', name: 'Mid', description: 'Desc', screensCount: 3 }),
      makeField({ id: 'cf_tail1', name: 'Tail 1', description: 'Desc', screensCount: 1 }),
      makeField({ id: 'cf_tail2', name: 'Tail 2', description: 'Desc', screensCount: 1 }),
    ];

    const client = createMockClient(fields);
    await discovery.discover(client);

    // Steep distribution should cut the tail — top 2 have scores ~5000/4000,
    // then a huge drop to ~30. The knee should be at index 1.
    const catalog = discovery.getCatalog();
    expect(catalog.length).toBeLessThan(5);
    expect(catalog[0].name).toBe('Top 1');
  });

  it('handles discovery failure gracefully', async () => {
    const client = {
      issueFields: {
        getFieldsPaginated: async () => { throw new Error('API down'); },
      },
    } as any;

    await discovery.discover(client);

    expect(discovery.isReady()).toBe(false);
    expect(discovery.getError()).toBe('API down');
    expect(discovery.getCatalog()).toEqual([]);
  });

  it('handles empty field list', async () => {
    const client = createMockClient([]);
    await discovery.discover(client);

    expect(discovery.isReady()).toBe(true);
    expect(discovery.getCatalog()).toEqual([]);
  });
});
