import { describe, it, expect } from 'vitest';

import { allFieldRoutes, routeForField, moduleStatuses, allModules } from './index.js';
import { tempo } from './tempo.js';
import { matchAllowedValue } from './types.js';

describe('routeForField', () => {
  it('matches Sprint, Epic Link/Parent, Rank to the Atlassian special-field routes', () => {
    expect(routeForField('sprint')!.unhandled.reason).toBe('sprint_requires_agile_api');
    expect(routeForField('SPRINT')!.unhandled.suggestedTool).toBe('manage_jira_sprint');
    expect(routeForField('Epic Link')!.unhandled.reason).toBe('parent_via_parent_param');
    expect(routeForField('parent')!.unhandled.reason).toBe('parent_via_parent_param');
    expect(routeForField('Rank')!.unhandled.reason).toBe('rank_not_exposed');
  });

  it('matches the Tempo Account field by name and by the Connect field key', () => {
    const r = routeForField('Account');
    expect(r).toBeDefined();
    expect(r!.resolveWrite).toBeTypeOf('function');
    expect(routeForField('tempo account')).toBe(r);
    expect(routeForField('io.tempo.jira__account')).toBe(r);
  });

  it('returns undefined for an ordinary field', () => {
    expect(routeForField('Story Points')).toBeUndefined();
    expect(routeForField('customfield_10001')).toBeUndefined();
  });
});

describe('allFieldRoutes / modules', () => {
  it('exposes the routes from both modules; only the Tempo Account route resolves values', () => {
    const routes = allFieldRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(4);
    const withResolver = routes.filter(r => r.resolveWrite);
    expect(withResolver).toHaveLength(1);
    expect(withResolver[0].names).toContain('account');
  });

  it('lists the curated modules with their bounds', () => {
    const ids = allModules().map(m => m.id);
    expect(ids).toEqual(['atlassian-special-fields', 'tempo']);
  });
});

describe('moduleStatuses', () => {
  it('reports each module, its claimed fields, and detection state', async () => {
    const statuses = await moduleStatuses();
    const byId = Object.fromEntries(statuses.map(s => [s.id, s]));
    // Atlassian special fields are intrinsic — no detection probe.
    expect(byId['atlassian-special-fields'].present).toBeUndefined();
    expect(byId['atlassian-special-fields'].fields).toContain('sprint');
    // Tempo has a probe; with an empty field catalog (test env) it's absent.
    expect(byId['tempo'].present).toBe(false);
    expect(byId['tempo'].fields).toContain('account');
  });
});

describe('matchAllowedValue', () => {
  const opts = [
    { id: 2043, value: 'CapEx - Praecipio AI Dev' },
    { id: 2044, value: 'OpEx - Praecipio AI Dev' },
  ];
  it('matches exactly (case-insensitive)', () => {
    expect(matchAllowedValue('opex - praecipio ai dev', opts, 'Account', 'PAID')).toBe(2044);
  });
  it('matches a unique substring', () => {
    expect(matchAllowedValue('CapEx', opts, 'Account', 'PAID')).toBe(2043);
  });
  it('throws on no match, listing the options', () => {
    expect(() => matchAllowedValue('Nope', opts, 'Account', 'PAID')).toThrow(/CapEx - Praecipio AI Dev \(2043\)/);
  });
  it('throws on an ambiguous substring', () => {
    expect(() => matchAllowedValue('Praecipio', opts, 'Account', 'PAID')).toThrow(/ambiguous/);
  });
});

describe('tempo.resolveWrite (value pass-through)', () => {
  const ctx = { client: {} as any, projectKey: 'PAID', issueTypeName: 'Task' };
  const resolve = tempo.routes[0].resolveWrite!;
  it('passes a number through unchanged', async () => {
    expect(await resolve(ctx, 'customfield_11266', 2044)).toBe(2044);
  });
  it('passes an {id} object through unchanged', async () => {
    expect(await resolve(ctx, 'customfield_11266', { id: '2044' })).toEqual({ id: '2044' });
  });
  it('converts a bare numeric string to a number', async () => {
    expect(await resolve(ctx, 'customfield_11266', '2044')).toBe(2044);
  });
});
