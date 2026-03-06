import { describe, it, expect, beforeEach } from 'vitest';
import { bulkOperationGuard } from './bulk-operation-guard.js';

describe('bulkOperationGuard', () => {
  beforeEach(() => {
    bulkOperationGuard.reset();
  });

  it('allows operations below the limit', () => {
    const limit = bulkOperationGuard.getLimit();
    for (let i = 0; i < limit; i++) {
      expect(bulkOperationGuard.check('delete', `PROJ-${i}`)).toBeNull();
      bulkOperationGuard.record('delete', `PROJ-${i}`);
    }
  });

  it('refuses operations at the limit', () => {
    const limit = bulkOperationGuard.getLimit();
    for (let i = 0; i < limit; i++) {
      bulkOperationGuard.record('delete', `PROJ-${i}`);
    }
    const result = bulkOperationGuard.check('delete', 'PROJ-99');
    expect(result).not.toBeNull();
    expect(result).toContain('Bulk delete');
    expect(result).toContain('bulk operations');
  });

  it('includes JQL with all affected issue keys', () => {
    const limit = bulkOperationGuard.getLimit();
    for (let i = 0; i < limit; i++) {
      bulkOperationGuard.record('delete', `PROJ-${i}`);
    }
    const result = bulkOperationGuard.check('delete', 'PROJ-99');
    expect(result).toContain('PROJ-0');
    expect(result).toContain('PROJ-99');
    expect(result).toContain('key in (');
  });

  it('includes Jira URL when host is provided', () => {
    const limit = bulkOperationGuard.getLimit();
    for (let i = 0; i < limit; i++) {
      bulkOperationGuard.record('delete', `PROJ-${i}`);
    }
    const result = bulkOperationGuard.check('delete', 'PROJ-99', 'myinstance.atlassian.net');
    expect(result).toContain('https://myinstance.atlassian.net/issues/?jql=');
  });

  it('omits Jira URL when host is not provided', () => {
    const limit = bulkOperationGuard.getLimit();
    for (let i = 0; i < limit; i++) {
      bulkOperationGuard.record('delete', `PROJ-${i}`);
    }
    const result = bulkOperationGuard.check('delete', 'PROJ-99');
    expect(result).not.toContain('https://');
  });

  it('counts move and delete together', () => {
    const limit = bulkOperationGuard.getLimit();
    // Mix delete and move
    bulkOperationGuard.record('delete', 'PROJ-1');
    for (let i = 1; i < limit; i++) {
      bulkOperationGuard.record('move', `PROJ-${i + 1}`);
    }
    const result = bulkOperationGuard.check('move', 'PROJ-99');
    expect(result).not.toBeNull();
    expect(result).toContain('Bulk move');
  });

  it('resets clears the tracker', () => {
    const limit = bulkOperationGuard.getLimit();
    for (let i = 0; i < limit; i++) {
      bulkOperationGuard.record('delete', `PROJ-${i}`);
    }
    bulkOperationGuard.reset();
    expect(bulkOperationGuard.check('delete', 'PROJ-99')).toBeNull();
  });
});
