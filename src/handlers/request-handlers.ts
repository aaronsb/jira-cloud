/**
 * Handler for manage_jira_request tool (JSM customer persona).
 * See ADR-212: Tool Surface Consolidation and JSM Customer Requests.
 *
 * Customer-facing service desk operations via /rest/servicedeskapi/.
 * Designed around the customer-service flow:
 *   discover (list_portals → list_request_types → get_request_type for fields)
 *   act (create, comment, transition)
 *   observe (get — rich by default, list)
 *
 * GraphQL (AGG) was evaluated for this surface — no create/list/comment mutations exist,
 * and the SLA query is gated behind a disabled feature flag on most tenants. REST is the
 * correct technology choice here. See ADR-212.
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { resolveCustomFieldNames } from './issue-handlers.js';
import type { JiraClient } from '../client/jira-client.js';
import { requestNextSteps } from '../utils/next-steps.js';
import { normalizeArgs } from '../utils/normalize-args.js';
import { TextProcessor } from '../utils/text-processing.js';


interface RequestArgs {
  operation?: string;
  serviceDeskId?: string;
  requestTypeId?: string;
  issueKey?: string;
  summary?: string;
  description?: string;
  comment?: string;
  transitionId?: string;
  requestFieldValues?: Record<string, unknown>;
  requestStatus?: 'OPEN_REQUESTS' | 'CLOSED_REQUESTS' | 'ALL_REQUESTS';
  isPublic?: boolean;
  expand?: string[];
  startAt?: number;
  maxResults?: number;
}

type HandlerResponse = { content: Array<{ type: string; text: string }>; isError?: boolean };

const FIELDS_EXPAND_CAP = 20; // max types to deep-fetch fields for in one list call

// ── Shared field-schema rendering ──────────────────────────────────────

interface FieldSchemaEntry {
  fieldId?: string;
  name?: string;
  required?: boolean;
  jiraSchema?: { type?: string };
  validValues?: Array<{ value?: string; label?: string }>;
  description?: string;
}

function renderFieldSchema(fields: FieldSchemaEntry[]): string {
  if (fields.length === 0) return '_(no fields)_';
  return fields.map(f => {
    const type = f.jiraSchema?.type ?? '?';
    const req = f.required ? ' **required**' : '';
    const vals = f.validValues && f.validValues.length > 0
      ? ` — values: ${f.validValues.slice(0, 8).map(v => v.label ?? v.value).join(', ')}${f.validValues.length > 8 ? '…' : ''}`
      : '';
    const id = f.fieldId ?? '?';
    // Show human label alongside technical ID when they differ (custom fields like "Quote ID" / customfield_17375)
    const label = f.name && f.name !== id ? `**${f.name}** \`${id}\`` : `\`${id}\``;
    return `- ${label} (${type})${req}${vals}${f.description ? ` — ${f.description.slice(0, 80)}` : ''}`;
  }).join('\n');
}

// ── Dispatch ───────────────────────────────────────────────────────────

export async function handleRequestRequest(
  client: JiraClient,
  request: { params: { name: string; arguments?: Record<string, unknown> } },
): Promise<HandlerResponse> {
  const args = normalizeArgs(request.params?.arguments ?? {}) as RequestArgs;
  const op = args.operation;

  switch (op) {
    case 'list_portals': return listPortals(client, args);
    case 'list_request_types': return listRequestTypes(client, args);
    case 'get_request_type': return getRequestType(client, args);
    case 'create': return createRequest(client, args);
    case 'get': return getRequest(client, args);
    case 'comment': return commentRequest(client, args);
    case 'transition': return transitionRequest(client, args);
    case 'list': return listRequests(client, args);
    default:
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown operation: ${op}. Valid: list_portals, list_request_types, get_request_type, create, get, comment, transition, list`,
      );
  }
}

// ── list_portals ───────────────────────────────────────────────────────

async function listPortals(client: JiraClient, args: RequestArgs): Promise<HandlerResponse> {
  const result = await client.serviceDeskClient.serviceDesk.getServiceDesks({
    start: args.startAt ?? 0,
    limit: args.maxResults ?? 50,
  });
  const desks = (result.values ?? []) as Array<{ id: string; projectKey: string; projectName: string }>;

  if (desks.length === 0) {
    return { content: [{ type: 'text', text: 'No service desks available to you.' }] };
  }

  const lines = desks.map(d => `- ${d.projectKey} | ${d.projectName} | id:${d.id}`);
  const text = `Service desks (${desks.length}):\n${lines.join('\n')}${requestNextSteps('list_portals')}`;
  return { content: [{ type: 'text', text }] };
}

// ── list_request_types ─────────────────────────────────────────────────

async function listRequestTypes(client: JiraClient, args: RequestArgs): Promise<HandlerResponse> {
  if (!args.serviceDeskId) {
    throw new McpError(ErrorCode.InvalidParams, 'serviceDeskId is required for list_request_types');
  }
  const wantFields = args.expand?.includes('fields') ?? false;

  const result = await client.serviceDeskClient.serviceDesk.getRequestTypes({
    serviceDeskId: args.serviceDeskId,
    start: args.startAt ?? 0,
    limit: args.maxResults ?? 50,
  });
  const types = (result.values ?? []) as Array<{ id: string; name: string; description?: string; issueTypeId?: string }>;

  if (types.length === 0) {
    return {
      content: [{
        type: 'text',
        text: `No request types on service desk ${args.serviceDeskId} (or none visible to you).`,
      }],
    };
  }

  // Basic list
  if (!wantFields) {
    const lines = types.map(t => `- id:${t.id} | ${t.name}${t.description ? ` — ${t.description}` : ''}`);
    const text = [
      `Request types on service desk ${args.serviceDeskId} (${types.length}):`,
      lines.join('\n'),
      requestNextSteps('list_request_types', { serviceDeskId: args.serviceDeskId }),
    ].join('\n');
    return { content: [{ type: 'text', text }] };
  }

  // Expanded with field schemas — cap to avoid runaway calls
  const expandTypes = types.slice(0, FIELDS_EXPAND_CAP);
  const truncated = types.length > FIELDS_EXPAND_CAP;

  const fieldResults = await Promise.all(expandTypes.map(async t => {
    try {
      const fr = await client.serviceDeskClient.serviceDesk.getRequestTypeFields({
        serviceDeskId: args.serviceDeskId!,
        requestTypeId: Number(t.id),
      }) as { requestTypeFields?: FieldSchemaEntry[] };
      return { type: t, fields: fr.requestTypeFields ?? [] };
    } catch (err) {
      return { type: t, fields: [] as FieldSchemaEntry[], error: (err as Error).message };
    }
  }));

  const sections = fieldResults.map(({ type, fields, error }) => {
    const header = `### ${type.name} (id:${type.id})${type.description ? `\n${type.description}` : ''}`;
    if (error) return `${header}\n_field schema unavailable: ${error}_`;
    return `${header}\n${renderFieldSchema(fields)}`;
  });

  const lines = [
    `Request types on service desk ${args.serviceDeskId} (${types.length} total, ${expandTypes.length} expanded):`,
    '',
    sections.join('\n\n'),
  ];
  if (truncated) {
    lines.push('', `_Truncated — ${types.length - FIELDS_EXPAND_CAP} more types. Use get_request_type for a specific id._`);
  }
  lines.push(requestNextSteps('list_request_types', { serviceDeskId: args.serviceDeskId }));
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// ── get_request_type ───────────────────────────────────────────────────

async function getRequestType(client: JiraClient, args: RequestArgs): Promise<HandlerResponse> {
  if (!args.serviceDeskId || !args.requestTypeId) {
    throw new McpError(ErrorCode.InvalidParams, 'serviceDeskId and requestTypeId are required for get_request_type');
  }

  const [detail, fields] = await Promise.all([
    client.serviceDeskClient.serviceDesk.getRequestTypeById({
      serviceDeskId: args.serviceDeskId,
      requestTypeId: Number(args.requestTypeId),
    }) as unknown as Promise<{ id?: string; name?: string; description?: string; helpText?: string; issueTypeId?: string }>,
    client.serviceDeskClient.serviceDesk.getRequestTypeFields({
      serviceDeskId: args.serviceDeskId,
      requestTypeId: Number(args.requestTypeId),
    }) as unknown as Promise<{ requestTypeFields?: FieldSchemaEntry[]; canRaiseOnBehalfOf?: boolean; canAddRequestParticipants?: boolean }>,
  ]);

  const lines = [
    `# Request type: ${detail.name ?? '?'} (id:${detail.id ?? args.requestTypeId})`,
  ];
  if (detail.description) lines.push(`${detail.description}`);
  if (detail.helpText) lines.push('', `_${detail.helpText}_`);

  lines.push('', '## Fields', renderFieldSchema(fields.requestTypeFields ?? []));

  const flags: string[] = [];
  if (fields.canRaiseOnBehalfOf) flags.push('can raise on behalf of another user');
  if (fields.canAddRequestParticipants) flags.push('can add participants');
  if (flags.length > 0) lines.push('', `**Capabilities:** ${flags.join(', ')}`);

  lines.push(requestNextSteps('get_request_type', { serviceDeskId: args.serviceDeskId, requestTypeId: args.requestTypeId }));
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

/**
 * Per-request-type fallback for field name → ID resolution.
 * Only fetches getRequestTypeFields when unresolved names remain after the global catalog pass.
 * The JSM fields endpoint returns `{fieldId, name}` for both system and custom fields, which
 * covers customer-scoped auth where the global customFields catalog is forbidden (issue #43).
 */
export async function resolveViaRequestTypeFields(
  client: JiraClient,
  serviceDeskId: string,
  requestTypeId: string,
  fields: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const needsFallback = Object.keys(fields).some(k => !/^customfield_\d+$/.test(k) && !SYSTEM_FIELDS.has(k));
  if (!needsFallback) return fields;

  let nameToId: Map<string, string>;
  try {
    const result = await client.serviceDeskClient.serviceDesk.getRequestTypeFields({
      serviceDeskId,
      requestTypeId: Number(requestTypeId),
    }) as { requestTypeFields?: Array<{ fieldId?: string; name?: string }> };
    nameToId = new Map();
    for (const f of result.requestTypeFields ?? []) {
      if (f.name && f.fieldId) nameToId.set(f.name.toLowerCase(), f.fieldId);
    }
  } catch {
    // If even this fails, leave the fields alone — the create call will surface the real error
    return fields;
  }

  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (/^customfield_\d+$/.test(key) || SYSTEM_FIELDS.has(key)) {
      resolved[key] = value;
      continue;
    }
    const mapped = nameToId.get(key.toLowerCase());
    resolved[mapped ?? key] = value;
  }
  return resolved;
}

export const SYSTEM_FIELDS = new Set([
  'summary', 'description', 'priority', 'duedate', 'labels',
  'reporter', 'assignee', 'attachment', 'issuetype',
]);

// ── create ─────────────────────────────────────────────────────────────

async function createRequest(client: JiraClient, args: RequestArgs): Promise<HandlerResponse> {
  if (!args.serviceDeskId || !args.requestTypeId || !args.summary) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'serviceDeskId, requestTypeId, and summary are required for create',
    );
  }

  // Resolve human-readable field names (e.g., "Quote ID") to their Jira IDs (customfield_17375).
  // Two-stage resolution: global field-discovery catalog (ADR-201), then per-request-type fallback
  // via getRequestTypeFields — critical for non-admin customers who get 403 on the global catalog
  // (GitHub issue #43). Raw customfield_XXX IDs always pass through unchanged.
  const globalResolved = resolveCustomFieldNames(args.requestFieldValues ?? {});
  const resolvedFields = await resolveViaRequestTypeFields(
    client,
    args.serviceDeskId,
    args.requestTypeId,
    globalResolved,
  );

  const fieldValues: Record<string, unknown> = {
    summary: args.summary,
    ...(args.description ? { description: args.description } : {}),
    ...resolvedFields,
  };

  const result = await client.serviceDeskClient.request.createCustomerRequest({
    serviceDeskId: args.serviceDeskId,
    requestTypeId: args.requestTypeId,
    requestFieldValues: fieldValues,
  }) as unknown as { issueKey?: string; issueId?: string; requestTypeId?: string };

  const issueKey = result.issueKey ?? '(unknown key)';
  const text = [
    `Created customer request ${issueKey} on service desk ${args.serviceDeskId}.`,
    `Summary: ${args.summary}`,
    requestNextSteps('create', { issueKey }),
  ].join('\n');
  return { content: [{ type: 'text', text }] };
}

// ── get (rich-by-default) ──────────────────────────────────────────────

async function getRequest(client: JiraClient, args: RequestArgs): Promise<HandlerResponse> {
  if (!args.issueKey) {
    throw new McpError(ErrorCode.InvalidParams, 'issueKey is required for get');
  }

  const expand = args.expand ?? ['status', 'requestType', 'sla', 'attachment', 'comment', 'participant', 'action'];

  type CustomerRequestDetail = {
    issueKey?: string;
    requestType?: { name?: string };
    currentStatus?: { status?: string; statusDate?: { friendly?: string } };
    createdDate?: { friendly?: string };
    reporter?: { displayName?: string };
    requestFieldValues?: Array<{ fieldId?: string; label?: string; value?: unknown }>;
    sla?: { values?: Array<{ name?: string; ongoingCycle?: { breachTime?: { friendly?: string }; breached?: boolean; remainingTime?: { friendly?: string } } }> };
    attachments?: { values?: Array<{ filename?: string; mimeType?: string; attachmentId?: string }>; size?: number };
    comments?: { values?: Array<{ id?: string; body?: string; public?: boolean; author?: { displayName?: string }; created?: { friendly?: string } }>; size?: number };
    participants?: { values?: Array<{ displayName?: string; emailAddress?: string }>; size?: number };
  };

  const [req, transitions] = await Promise.all([
    client.serviceDeskClient.request.getCustomerRequestByIdOrKey({
      issueIdOrKey: args.issueKey,
      expand,
    }) as unknown as Promise<CustomerRequestDetail>,
    client.serviceDeskClient.request.getCustomerTransitions({
      issueIdOrKey: args.issueKey,
    }).then((r: unknown) => (r as { values?: Array<{ id?: string; name?: string }> }).values ?? [])
      .catch(() => [] as Array<{ id?: string; name?: string }>),
  ]);

  const lines: string[] = [`# Request ${req.issueKey ?? args.issueKey}`];
  if (req.requestType?.name) lines.push(`**Type:** ${req.requestType.name}`);
  if (req.currentStatus?.status) {
    const date = req.currentStatus.statusDate?.friendly;
    lines.push(`**Status:** ${req.currentStatus.status}${date ? ` (${date})` : ''}`);
  }
  if (req.reporter?.displayName) lines.push(`**Reporter:** ${req.reporter.displayName}`);
  if (req.createdDate?.friendly) lines.push(`**Created:** ${req.createdDate.friendly}`);

  // Field values — use shared facade for consistent rendering across tools
  const fieldLines = (req.requestFieldValues ?? [])
    .map(f => ({ label: f.label ?? f.fieldId, display: TextProcessor.formatFieldValue(f.value) }))
    .filter(f => f.display && f.display.trim() !== '')
    .map(f => `- **${f.label}:** ${f.display}`);
  if (fieldLines.length > 0) {
    lines.push('', '## Fields', fieldLines.join('\n'));
  }

  // SLA
  const slaValues = req.sla?.values ?? [];
  if (slaValues.length > 0) {
    lines.push('', '## SLA');
    for (const sla of slaValues) {
      const cycle = sla.ongoingCycle;
      if (!cycle) continue;
      const state = cycle.breached
        ? '⚠️ BREACHED'
        : cycle.remainingTime?.friendly
          ? `${cycle.remainingTime.friendly} remaining`
          : 'active';
      lines.push(`- **${sla.name ?? 'SLA'}:** ${state}${cycle.breachTime?.friendly ? ` (target: ${cycle.breachTime.friendly})` : ''}`);
    }
  }

  // Participants
  const parts = req.participants?.values ?? [];
  if (parts.length > 0) {
    lines.push('', `**Participants:** ${parts.map(p => p.displayName ?? p.emailAddress ?? '?').join(', ')}`);
  }

  // Attachments (teaser — details via manage_jira_media)
  const atts = req.attachments?.values ?? [];
  if (atts.length > 0) {
    lines.push('', `## Attachments (${req.attachments?.size ?? atts.length})`);
    for (const a of atts.slice(0, 5)) {
      lines.push(`- ${a.filename ?? '?'} | ${a.mimeType ?? '?'}${a.attachmentId ? ` | id:${a.attachmentId}` : ''}`);
    }
    if ((req.attachments?.size ?? atts.length) > 5) lines.push(`_…use manage_jira_media list for full set_`);
  }

  // Comments
  const cmts = req.comments?.values ?? [];
  if (cmts.length > 0) {
    lines.push('', `## Comments (${req.comments?.size ?? cmts.length})`);
    for (const c of cmts.slice(0, 10)) {
      const vis = c.public === false ? ' [internal]' : '';
      const author = c.author?.displayName ?? '?';
      const when = c.created?.friendly ?? '';
      const body = (c.body ?? '').slice(0, 300);
      lines.push(`- **${author}** ${when}${vis}: ${body}${(c.body ?? '').length > 300 ? '…' : ''}`);
    }
    if ((req.comments?.size ?? cmts.length) > 10) lines.push(`_…${(req.comments?.size ?? cmts.length) - 10} more comment(s)_`);
  }

  // Customer transitions. Empty list is common — whether a customer sees transitions here
  // depends on the project's permission scheme and workflow config. Many JSM workflows expose
  // none, which is normal, not a bug.
  if (transitions.length > 0) {
    lines.push('', '## Available transitions');
    for (const t of transitions) {
      lines.push(`- \`${t.id}\` — ${t.name ?? '?'}`);
    }
  }

  lines.push(requestNextSteps('get', { issueKey: req.issueKey ?? args.issueKey, hasTransitions: transitions.length > 0 }));
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// ── comment ────────────────────────────────────────────────────────────

async function commentRequest(client: JiraClient, args: RequestArgs): Promise<HandlerResponse> {
  if (!args.issueKey || !args.comment) {
    throw new McpError(ErrorCode.InvalidParams, 'issueKey and comment are required');
  }
  // Atlassian's JSM customer API rejects non-public comments — only agents can post internal
  // comments via the agent-side endpoint. Fail fast with a clear message instead of a silent 400.
  if (args.isPublic === false) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Customers cannot post internal comments via manage_jira_request. Omit isPublic or set it to true. Internal comments require agent-side tooling.',
    );
  }

  // JSM /request/{key}/comment expects body as a plain string (not ADF like v3 issue comments).
  // Round-trip through markdownToAdf → extractTextFromAdf to strip markdown syntax, preventing
  // literal "**bold**" rendering on the portal. Keeps behavior predictable across tools even
  // though JSM can't render rich text from the customer API.
  const plain = TextProcessor.extractTextFromAdf(TextProcessor.markdownToAdf(args.comment)).trim();

  await client.serviceDeskClient.request.createRequestComment({
    issueIdOrKey: args.issueKey,
    body: plain || args.comment,
    public: true,
  });

  const text = `Added public comment to ${args.issueKey}.${requestNextSteps('comment', { issueKey: args.issueKey })}`;
  return { content: [{ type: 'text', text }] };
}

// ── transition (customer-side) ─────────────────────────────────────────

async function transitionRequest(client: JiraClient, args: RequestArgs): Promise<HandlerResponse> {
  if (!args.issueKey || !args.transitionId) {
    throw new McpError(ErrorCode.InvalidParams, 'issueKey and transitionId are required for transition');
  }

  await client.serviceDeskClient.request.performCustomerTransition({
    issueIdOrKey: args.issueKey,
    id: args.transitionId,
    ...(args.comment ? { additionalComment: { body: args.comment } } : {}),
  });

  const text = `Transitioned ${args.issueKey} (transition ${args.transitionId}).${requestNextSteps('transition', { issueKey: args.issueKey })}`;
  return { content: [{ type: 'text', text }] };
}

// ── list ───────────────────────────────────────────────────────────────

async function listRequests(client: JiraClient, args: RequestArgs): Promise<HandlerResponse> {
  const result = await client.serviceDeskClient.request.getCustomerRequests({
    serviceDeskId: args.serviceDeskId ? Number(args.serviceDeskId) : undefined,
    requestStatus: args.requestStatus ?? 'OPEN_REQUESTS',
    expand: ['requestType', 'status'],
    start: args.startAt ?? 0,
    limit: args.maxResults ?? 50,
  }) as unknown as { values?: Array<{ issueKey?: string; requestType?: { name?: string }; currentStatus?: { status?: string }; createdDate?: { friendly?: string } }> };

  const requests = result.values ?? [];
  if (requests.length === 0) {
    const scope = args.serviceDeskId ? ` on service desk ${args.serviceDeskId}` : '';
    return { content: [{ type: 'text', text: `No ${args.requestStatus ?? 'OPEN_REQUESTS'} requests${scope}.` }] };
  }

  const lines = requests.map(r => {
    const key = r.issueKey ?? '?';
    const status = r.currentStatus?.status ?? '?';
    const type = r.requestType?.name ?? '?';
    const created = r.createdDate?.friendly ? ` | ${r.createdDate.friendly}` : '';
    return `- ${key} | ${status} | ${type}${created}`;
  });
  const text = [
    `Customer requests (${requests.length}, status: ${args.requestStatus ?? 'OPEN_REQUESTS'}):`,
    lines.join('\n'),
    requestNextSteps('list'),
  ].join('\n');
  return { content: [{ type: 'text', text }] };
}
