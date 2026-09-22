import { describe, it, expect, vi } from 'vitest';

import type { JiraClient } from '../client/jira-client.js';

import { resolveViaRequestTypeFields } from './request-handlers.js';

function mockClient(requestTypeFields: Array<{ fieldId?: string; name?: string }>): JiraClient {
  return {
    serviceDeskClient: {
      serviceDesk: {
        getRequestTypeFields: vi.fn().mockResolvedValue({ requestTypeFields }),
      },
    },
  } as unknown as JiraClient;
}

describe('resolveViaRequestTypeFields', () => {
  it('resolves human-readable names to customfield IDs via the per-type schema', async () => {
    const client = mockClient([
      { fieldId: 'customfield_17375', name: 'Quote ID' },
      { fieldId: 'customfield_11203', name: 'Opportunity Name' },
    ]);

    const resolved = await resolveViaRequestTypeFields(client, '5177', '5497', {
      'Quote ID': 'TEST-0001',
      'Opportunity Name': 'MCP Test',
    });

    expect(resolved).toEqual({
      customfield_17375: 'TEST-0001',
      customfield_11203: 'MCP Test',
    });
  });

  it('passes raw customfield_XXX IDs through without consulting the API', async () => {
    const getRequestTypeFields = vi.fn();
    const client = {
      serviceDeskClient: { serviceDesk: { getRequestTypeFields } },
    } as unknown as JiraClient;

    const resolved = await resolveViaRequestTypeFields(client, '5177', '5497', {
      customfield_17375: 'TEST-0001',
      customfield_11203: 'MCP Test',
    });

    expect(resolved).toEqual({
      customfield_17375: 'TEST-0001',
      customfield_11203: 'MCP Test',
    });
    expect(getRequestTypeFields).not.toHaveBeenCalled();
  });

  it('passes system fields (summary, description) through unchanged', async () => {
    const getRequestTypeFields = vi.fn();
    const client = {
      serviceDeskClient: { serviceDesk: { getRequestTypeFields } },
    } as unknown as JiraClient;

    const resolved = await resolveViaRequestTypeFields(client, '5177', '5497', {
      summary: 'Test',
      description: 'Body',
      priority: 'High',
    });

    expect(resolved).toEqual({
      summary: 'Test',
      description: 'Body',
      priority: 'High',
    });
    expect(getRequestTypeFields).not.toHaveBeenCalled();
  });

  it('leaves unresolved names alone so the create call surfaces the real error', async () => {
    // Per-type schema doesn't contain "Totally Made Up Field"
    const client = mockClient([
      { fieldId: 'customfield_17375', name: 'Quote ID' },
    ]);

    const resolved = await resolveViaRequestTypeFields(client, '5177', '5497', {
      'Totally Made Up Field': 'x',
    });

    // Passthrough — the real Jira error will say what's wrong
    expect(resolved).toEqual({ 'Totally Made Up Field': 'x' });
  });

  it('case-insensitive name matching', async () => {
    const client = mockClient([{ fieldId: 'customfield_17375', name: 'Quote ID' }]);

    const resolved = await resolveViaRequestTypeFields(client, '5177', '5497', {
      'quote id': 'lowercase works',
    });

    expect(resolved).toEqual({ customfield_17375: 'lowercase works' });
  });

  it('swallows getRequestTypeFields errors and passes fields through', async () => {
    const client = {
      serviceDeskClient: {
        serviceDesk: {
          getRequestTypeFields: vi.fn().mockRejectedValue(new Error('403')),
        },
      },
    } as unknown as JiraClient;

    const resolved = await resolveViaRequestTypeFields(client, '5177', '5497', {
      'Quote ID': 'x',
    });

    // Real Jira error is more informative than a synthetic one from us
    expect(resolved).toEqual({ 'Quote ID': 'x' });
  });
});
