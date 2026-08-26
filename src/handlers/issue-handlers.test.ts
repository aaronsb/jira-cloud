import { describe, it, expect } from 'vitest';
import { projectKeyFromIssueKey } from './issue-handlers.js';

// Locks the casing contract (#56): the breadcrumb URI in markdown-renderer.ts
// and the issueTypesCache key in field-discovery.ts both assume this helper
// always uppercases, so dropping .toUpperCase() must fail the suite.
describe('projectKeyFromIssueKey', () => {
  it('passes an already-uppercase key through', () => {
    expect(projectKeyFromIssueKey('PAID-192')).toBe('PAID');
  });

  it('uppercases a lowercase key', () => {
    expect(projectKeyFromIssueKey('paid-192')).toBe('PAID');
  });

  it('uppercases a mixed-case key', () => {
    expect(projectKeyFromIssueKey('Mixed-1')).toBe('MIXED');
  });

  it('uppercases the whole string when there is no dash (documented fallback)', () => {
    expect(projectKeyFromIssueKey('noprefix')).toBe('NOPREFIX');
  });
});
