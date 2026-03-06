import { describe, it, expect } from 'vitest';
import { normalizeArgs } from './normalize-args.js';

describe('normalizeArgs', () => {
  it('converts snake_case keys to camelCase', () => {
    expect(normalizeArgs({ issue_key: 'PROJ-1', project_key: 'PROJ' }))
      .toEqual({ issueKey: 'PROJ-1', projectKey: 'PROJ' });
  });

  it('passes camelCase keys through unchanged', () => {
    expect(normalizeArgs({ issueKey: 'PROJ-1', projectKey: 'PROJ' }))
      .toEqual({ issueKey: 'PROJ-1', projectKey: 'PROJ' });
  });

  it('handles single-word keys', () => {
    expect(normalizeArgs({ operation: 'get', name: 'test' }))
      .toEqual({ operation: 'get', name: 'test' });
  });

  it('handles multi-underscore keys', () => {
    expect(normalizeArgs({ include_status_counts: true }))
      .toEqual({ includeStatusCounts: true });
  });

  it('returns empty object for empty input', () => {
    expect(normalizeArgs({})).toEqual({});
  });

  it('preserves values of all types', () => {
    const input = {
      str: 'hello',
      num: 42,
      bool: true,
      arr: [1, 2],
      obj: { nested: true },
      nil: null,
    };
    expect(normalizeArgs(input)).toEqual(input);
  });

  it('does not recurse into nested objects', () => {
    const result = normalizeArgs({ custom_fields: { field_name: 'val' } });
    expect(result).toEqual({ customFields: { field_name: 'val' } });
  });
});
