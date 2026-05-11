import { describe, it, expect } from 'vitest';
import { routeForField, allFieldRoutes } from './field-routing.js';

describe('routeForField', () => {
  it('matches Sprint (case-insensitive) to the agile-api route', () => {
    const r = routeForField('sprint');
    expect(r).toBeDefined();
    expect(r!.unhandled.reason).toBe('sprint_requires_agile_api');
    expect(r!.unhandled.suggestedTool).toBe('manage_jira_sprint');
    expect(routeForField('SPRINT')).toBe(r);
  });

  it('matches Epic Link / Parent Link / Parent to the parent-param route', () => {
    expect(routeForField('Epic Link')!.unhandled.reason).toBe('parent_via_parent_param');
    expect(routeForField('parent link')!.unhandled.reason).toBe('parent_via_parent_param');
    expect(routeForField('Parent')!.unhandled.reason).toBe('parent_via_parent_param');
  });

  it('matches Rank', () => {
    expect(routeForField('Rank')!.unhandled.reason).toBe('rank_not_exposed');
  });

  it('matches the Tempo Account field by name and by the Connect field key', () => {
    const r = routeForField('Account');
    expect(r).toBeDefined();
    expect(r!.unhandled.reason).toBe('tempo_account_needs_numeric_id');
    expect(r!.requires).toBe('tempo');
    expect(routeForField('tempo account')).toBe(r);
    expect(routeForField('io.tempo.jira__account')).toBe(r);
  });

  it('returns undefined for an ordinary field', () => {
    expect(routeForField('Story Points')).toBeUndefined();
    expect(routeForField('customfield_10001')).toBeUndefined();
  });

  it('only capability-gated routes carry a `requires`', () => {
    for (const r of allFieldRoutes()) {
      if (r.requires !== undefined) {
        // Today the only gated capability is "tempo" (handler not yet wired).
        expect(r.requires).toBe('tempo');
      }
    }
  });
});
