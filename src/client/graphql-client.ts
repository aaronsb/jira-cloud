import type { GraphQLResponse, TenantContext } from '../types/index.js';

const AGG_ENDPOINT = 'https://api.atlassian.com/graphql';

const TENANT_CONTEXT_QUERY = `
  query GetTenantContexts($hostNames: [String!]!) {
    tenantContexts(hostNames: $hostNames) {
      cloudId
    }
  }
`;

function buildAuthHeader(email: string, apiToken: string): string {
  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
}

function extractHostname(host: string): string {
  return host
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

/**
 * Discover the Atlassian cloudId for a given Jira host.
 * Returns null if discovery fails (non-Atlassian host, bad credentials, etc.)
 */
export async function discoverCloudId(
  host: string,
  email: string,
  apiToken: string,
): Promise<string | null> {
  const hostname = extractHostname(host);

  try {
    const response = await fetch(AGG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': buildAuthHeader(email, apiToken),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query: TENANT_CONTEXT_QUERY,
        variables: { hostNames: [hostname] },
      }),
    });

    if (!response.ok) {
      console.error(`[jira-cloud] CloudId discovery failed: HTTP ${response.status}`);
      return null;
    }

    const result = await response.json() as GraphQLResponse<{ tenantContexts: TenantContext[] }>;

    if (result.errors?.length) {
      console.error(`[jira-cloud] CloudId discovery GraphQL error: ${result.errors[0].message}`);
      return null;
    }

    const cloudId = result.data?.tenantContexts?.[0]?.cloudId;
    if (!cloudId) {
      console.error(`[jira-cloud] CloudId discovery: no tenant found for ${hostname}`);
      return null;
    }

    return cloudId;
  } catch (err) {
    console.error(`[jira-cloud] CloudId discovery failed:`, (err as Error).message);
    return null;
  }
}

export class GraphQLClient {
  private authHeader: string;
  private cloudId: string;

  constructor(email: string, apiToken: string, cloudId: string) {
    this.authHeader = buildAuthHeader(email, apiToken);
    this.cloudId = cloudId;
  }

  getCloudId(): string {
    return this.cloudId;
  }

  async query<T>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    try {
      const response = await fetch(AGG_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { cloudId: this.cloudId, ...variables },
        }),
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const result = await response.json() as GraphQLResponse<T>;

      if (result.errors?.length) {
        return { success: false, error: result.errors.map(e => e.message).join('; ') };
      }

      return { success: true, data: result.data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
