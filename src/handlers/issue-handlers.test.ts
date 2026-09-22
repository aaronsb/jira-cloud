import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fieldDiscovery } from '../client/field-discovery.js';
import { handleIssueRequest, projectKeyFromIssueKey } from './issue-handlers.js';

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

// #59: the Tempo Account field is `isLocked` on admin tenants, so curation drops it from the scored
// catalog. The `Account` alias (name → id, and name-string → option id) must still produce the same
// payload the raw `customfield_11266` + numeric id path sends.
describe('update: Tempo Account alias resolves to the raw-id payload (#59)', () => {
  const ACCOUNT_SCHEMA = {
    type: 'option2',
    custom: 'com.atlassian.plugins.atlassian-connect-plugin:io.tempo.jira__account',
    customId: 11266,
  };
  const ALLOWED = [
    { id: 2043, value: 'CapEx - Praecipio AI Dev' },
    { id: 2044, value: 'OpEx - Praecipio AI Dev' },
  ];

  beforeEach(async () => {
    // Shape of the admin field-search response on the live tenant (read-only probe).
    await fieldDiscovery.discover({
      issueFields: {
        getFieldsPaginated: async () => ({
          isLast: true,
          values: [{
            id: 'customfield_11266', name: 'Account', description: 'Tempo Account Custom Field',
            isLocked: true, screensCount: 6, lastUsed: { type: 'NOT_TRACKED' }, schema: ACCOUNT_SCHEMA,
          }],
        }),
      },
    } as any);
  });

  function makeClient() {
    const sent: Array<Record<string, unknown> | undefined> = [];
    const client = {
      v3Client: {
        issues: {
          // editmeta shape from GET /rest/api/3/issue/PAID-395/editmeta on the live tenant.
          getEditIssueMeta: vi.fn(async () => ({
            fields: { customfield_11266: { schema: ACCOUNT_SCHEMA, name: 'Account', key: 'io.tempo.jira__account', operations: ['set'], allowedValues: ALLOWED } },
          })),
        },
      },
      getIssue: vi.fn(async () => ({ issueType: 'Story' })),
      updateIssue: vi.fn(async (p: { customFields?: Record<string, unknown> }) => {
        sent.push(p.customFields);
        throw new Error('stop-after-write');
      }),
    } as any;
    return { client, sent };
  }

  async function update(customFields: Record<string, unknown>) {
    const { client, sent } = makeClient();
    await expect(handleIssueRequest(client, {
      params: { name: 'manage_jira_issue', arguments: { operation: 'update', issueKey: 'PAID-395', customFields } },
    })).rejects.toThrow('stop-after-write');
    return sent[0];
  }

  it('drops the locked field from the catalog but still indexes it for routing', () => {
    expect(fieldDiscovery.getFieldById('customfield_11266')).toBeUndefined();
    expect(fieldDiscovery.resolveNameToId('Account')).toBe('customfield_11266');
  });

  it('raw customfield_11266 + numeric id passes straight through (the working path)', async () => {
    expect(await update({ customfield_11266: 2043 })).toEqual({ customfield_11266: 2043 });
  });

  it('Account alias + numeric id sends the same payload as the raw path', async () => {
    expect(await update({ Account: 2043 })).toEqual({ customfield_11266: 2043 });
  });

  it('Account alias + account name resolves to the option id via editmeta', async () => {
    expect(await update({ Account: 'CapEx - Praecipio AI Dev' })).toEqual({ customfield_11266: 2043 });
  });

  it('raw customfield_11266 + account name is resolved too', async () => {
    expect(await update({ customfield_11266: 'OpEx - Praecipio AI Dev' })).toEqual({ customfield_11266: 2044 });
  });
});
