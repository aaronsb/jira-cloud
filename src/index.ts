#!/usr/bin/env node
import { createRequire } from 'module';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { fieldDiscovery } from './client/field-discovery.js';
import { GraphObjectCache } from './client/graph-object-cache.js';
import { discoverCloudId, GraphQLClient } from './client/graphql-client.js';
import { JiraClient } from './client/jira-client.js';
import { handleAnalysisRequest } from './handlers/analysis-handler.js';
import { handleBoardRequest } from './handlers/board-handlers.js';
import { handleFilterRequest } from './handlers/filter-handlers.js';
import { handleIssueRequest } from './handlers/issue-handlers.js';
import { handlePlanRequest } from './handlers/plan-handler.js';
import { handleProjectRequest } from './handlers/project-handlers.js';
import { createQueueHandler } from './handlers/queue-handler.js';
import { setupResourceHandlers } from './handlers/resource-handlers.js';
import { handleSprintRequest } from './handlers/sprint-handlers.js';
import { promptDefinitions } from './prompts/prompt-definitions.js';
import { getPrompt } from './prompts/prompt-messages.js';
import { toolSchemas } from './schemas/tool-schemas.js';
import type { GraphIssue } from './types/index.js';

// Jira credentials from environment variables
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_HOST = process.env.JIRA_HOST;

if (!JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_HOST) {
  const missing = [
    !JIRA_API_TOKEN && 'JIRA_API_TOKEN',
    !JIRA_EMAIL && 'JIRA_EMAIL',
    !JIRA_HOST && 'JIRA_HOST',
  ].filter(Boolean).join(', ');
  console.error(`[jira-cloud] Missing required environment variables: ${missing}`);
  console.error('[jira-cloud] Set these in your MCP configuration or MCPB extension settings.');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

/** Map manage_jira_issue update args to GraphIssue field patches */
function extractChangedFields(args: Record<string, unknown>): Partial<GraphIssue> {
  const fields: Partial<GraphIssue> = {};
  if ('dueDate' in args) fields.dueDate = args.dueDate as string | null;
  if ('summary' in args) fields.summary = args.summary as string;
  if ('assignee' in args) fields.assignee = args.assignee as string | null;
  if ('storyPoints' in args) fields.storyPoints = args.storyPoints as number | null;
  // startDate may come via customFields — check both
  if ('startDate' in args) fields.startDate = args.startDate as string | null;
  const customFields = args.customFields as Record<string, unknown> | undefined;
  if (customFields) {
    for (const [key, val] of Object.entries(customFields)) {
      if (key.toLowerCase().includes('start')) fields.startDate = val as string | null;
    }
  }
  return fields;
}

class JiraServer {
  private server: Server;
  private jiraClient: JiraClient;
  private graphqlClient: GraphQLClient | null = null;
  private cache = new GraphObjectCache();

  constructor() {
    const serverName = process.env.MCP_SERVER_NAME || 'jira-cloud';
    console.error(`Initializing Jira MCP server: ${serverName}`);

    this.server = new Server(
      {
        name: serverName,
        version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.jiraClient = new JiraClient({
      host: JIRA_HOST!,
      email: JIRA_EMAIL!,
      apiToken: JIRA_API_TOKEN!,
    });

    this.setupHandlers();

    // Start async field discovery (non-blocking)
    fieldDiscovery.startAsync(this.jiraClient.v3Client).then(() => {
      const wirable = ['sprint', 'storyPoints', 'startDate'] as const;
      for (const name of wirable) {
        const fieldId = fieldDiscovery.getWellKnownFieldId(name);
        if (fieldId) {
          this.jiraClient.setCustomFieldId(name, fieldId);
          console.error(`[jira-cloud] ${name} field: ${fieldId}`);
        }
      }
    }).catch(() => {});

    // CloudId discovery happens in run() before server connects — must complete
    // before ListTools so analyze_jira_plan is registered if available.

    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers() {
    // Set up required MCP protocol handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: Object.entries(toolSchemas)
        .filter(([key]) => key !== 'analyze_jira_plan' || this.graphqlClient !== null)
        .map(([key, schema]) => ({
          name: key,
          description: schema.description,
          inputSchema: {
            type: 'object',
            properties: schema.inputSchema.properties,
            ...(('required' in schema.inputSchema) ? { required: schema.inputSchema.required } : {}),
          },
        })),
    }));

    // Set up resource handlers
    const resourceHandlers = setupResourceHandlers(this.jiraClient);
    this.server.setRequestHandler(ListResourcesRequestSchema, resourceHandlers.listResources);
    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, resourceHandlers.listResourceTemplates);
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      return resourceHandlers.readResource(request.params.uri);
    });

    // Set up prompt handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: promptDefinitions.map(p => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments,
      })),
    }));

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return getPrompt(name, args);
    });

    // Track consecutive single-issue calls to suggest queue tool
    const QUEUE_HINT_THRESHOLD = 3;
    let consecutiveIssueCalls = 0;

    // Set up tool handlers
    this.server.setRequestHandler(CallToolRequestSchema, async (request, _extra) => {
      console.error('Received request:', JSON.stringify(request, null, 2));
      this.cache.tick();

      const { name } = request.params;
      console.error(`Handling tool request: ${name}`);

      try {
        const toolHandlers: Record<string, (client: JiraClient, req: typeof request) => Promise<any>> = {
          manage_jira_issue: handleIssueRequest,
          manage_jira_project: handleProjectRequest,
          manage_jira_board: handleBoardRequest,
          manage_jira_sprint: handleSprintRequest,
          manage_jira_filter: handleFilterRequest,
          analyze_jira_issues: (client, req) => handleAnalysisRequest(client, req, this.graphqlClient, this.cache),
        };

        const handlers: Record<string, (client: JiraClient, req: typeof request) => Promise<any>> = {
          ...toolHandlers,
          queue_jira_operations: createQueueHandler(toolHandlers, JIRA_HOST),
          ...(this.graphqlClient ? {
            analyze_jira_plan: (_client, req) => handlePlanRequest(this.jiraClient, this.graphqlClient!, req, this.cache),
          } : {}),
        };

        const handler = handlers[name];
        if (!handler) {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }

        const response = await handler(this.jiraClient, request);
        if (!response) {
          throw new McpError(ErrorCode.InternalError, `No response from handler for tool: ${name}`);
        }

        // Track consecutive manage_jira_issue calls and suggest queue tool
        if (name === 'manage_jira_issue') {
          consecutiveIssueCalls++;
          if (consecutiveIssueCalls >= QUEUE_HINT_THRESHOLD && response.content?.[0]?.text) {
            response.content[0].text += `\n\n---\n**💡 Efficiency tip:** You've made ${consecutiveIssueCalls} consecutive \`manage_jira_issue\` calls. Consider using \`queue_jira_operations\` to batch multiple issue operations into a single call — it's faster and uses less context.`;
            consecutiveIssueCalls = 0;
          }

          // Surgical cache patching — update cached issues on mutations
          const reqArgs = request.params.arguments as Record<string, unknown> | undefined;
          const op = reqArgs?.operation as string | undefined;
          if ((op === 'update' || op === 'transition') && this.cache.walks.size > 0) {
            const issueKey = reqArgs?.issueKey as string | undefined;
            if (issueKey) {
              const changedFields = extractChangedFields(reqArgs!);
              if (Object.keys(changedFields).length > 0) {
                const patched = this.cache.patch(issueKey, changedFields);
                if (patched) {
                  console.error(`[graph-cache] Patched ${issueKey} in cache`);
                }
              }
            }
          }
        } else {
          consecutiveIssueCalls = 0;
        }

        return response;
      } catch (error) {
        console.error('Error handling request:', error);
        if (error instanceof McpError) {
          throw error;
        }

        // Surface Jira permission errors with actionable guidance
        const status = (error as any)?.response?.status
          ?? (error as any)?.status;
        const jiraMessage = (error as any)?.response?.data?.errorMessages?.[0]
          ?? (error as any)?.response?.data?.message
          ?? (error as any)?.message
          ?? '';

        if (status === 403) {
          return {
            content: [{
              type: 'text',
              text: [
                `**Jira denied this operation:** ${jiraMessage || 'Insufficient permissions.'}`,
                '',
                'This is controlled by your Jira project\'s permission scheme.',
                'Contact your Jira admin to request the necessary permission,',
                'or ask them to perform the operation for you.',
              ].join('\n'),
            }],
            isError: true,
          };
        }

        if (status === 400) {
          const fieldErrors = (error as any)?.response?.data?.errors;
          const errorMessages = (error as any)?.response?.data?.errorMessages;

          const lines = ['**Jira rejected this request:**'];
          if (errorMessages?.length > 0) {
            lines.push(...errorMessages.map((m: string) => `- ${m}`));
          }
          if (fieldErrors && Object.keys(fieldErrors).length > 0) {
            lines.push('', '**Field errors:**');
            for (const [field, msg] of Object.entries(fieldErrors)) {
              lines.push(`- \`${field}\`: ${msg}`);
            }
          }

          // On create failures, invalidate cache and append required fields guidance
          const reqArgs = request.params.arguments as Record<string, unknown> | undefined;
          if (reqArgs?.operation === 'create' && reqArgs?.projectKey) {
            const pKey = reqArgs.projectKey as string;
            fieldDiscovery.invalidateRequiredFields(pKey);
            const iType = reqArgs.issueType as string | undefined;
            try {
              // Show valid issue types
              const issueTypes = await fieldDiscovery.getIssueTypes(this.jiraClient.v3Client, pKey);
              if (issueTypes.length > 0) {
                lines.push('', `**Valid issue types for ${pKey}:** ${issueTypes.map(t => t.name).join(', ')}`);
              }
              // Show required fields for the requested type
              if (iType) {
                const required = await fieldDiscovery.getRequiredFields(this.jiraClient.v3Client, pKey, iType);
                if (required.length > 0) {
                  lines.push(`**Required fields for ${pKey}/${iType}:** ${required.map(f => {
                    const vals = f.allowedValues ? ` (${f.schemaType}: ${f.allowedValues.slice(0, 5).join(', ')}${f.allowedValues.length > 5 ? '...' : ''})` : '';
                    return f.name + vals;
                  }).join(', ')}`);
                }
              }
            } catch { /* best-effort */ }
            lines.push('', '*Tip: Use `manage_jira_project get` to see valid issue types before creating.*');
          }

          return {
            content: [{ type: 'text', text: lines.join('\n') }],
            isError: true,
          };
        }

        if (status === 404) {
          return {
            content: [{
              type: 'text',
              text: `**Not found:** ${jiraMessage || 'The requested resource does not exist or you do not have permission to view it.'}`,
            }],
            isError: true,
          };
        }

        throw new McpError(ErrorCode.InternalError, jiraMessage || 'Internal server error');
      }
    });
  }

  async run() {
    // Discover cloudId before connecting — must complete before ListTools
    try {
      const cloudId = await discoverCloudId(JIRA_HOST!, JIRA_EMAIL!, JIRA_API_TOKEN!);
      if (cloudId) {
        this.graphqlClient = new GraphQLClient(JIRA_EMAIL!, JIRA_API_TOKEN!, cloudId);
        console.error(`[jira-cloud] GraphQL client ready (cloudId: ${cloudId.slice(0, 8)}...)`);
      } else {
        console.error('[jira-cloud] GraphQL/Plans unavailable — analyze_jira_plan disabled');
      }
    } catch {
      console.error('[jira-cloud] GraphQL discovery failed — analyze_jira_plan disabled');
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Jira MCP server running on stdio');
  }
}

const server = new JiraServer();
server.run().catch(console.error);
