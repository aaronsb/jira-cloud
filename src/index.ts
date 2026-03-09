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
import { JiraClient } from './client/jira-client.js';
import { handleAnalysisRequest } from './handlers/analysis-handler.js';
import { handleBoardRequest } from './handlers/board-handlers.js';
import { handleFilterRequest } from './handlers/filter-handlers.js';
import { handleIssueRequest } from './handlers/issue-handlers.js';
import { handleProjectRequest } from './handlers/project-handlers.js';
import { createQueueHandler } from './handlers/queue-handler.js';
import { setupResourceHandlers } from './handlers/resource-handlers.js';
import { handleSprintRequest } from './handlers/sprint-handlers.js';
import { promptDefinitions } from './prompts/prompt-definitions.js';
import { getPrompt } from './prompts/prompt-messages.js';
import { toolSchemas } from './schemas/tool-schemas.js';

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

class JiraServer {
  private server: Server;
  private jiraClient: JiraClient;

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
    fieldDiscovery.startAsync(this.jiraClient.v3Client);

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

      const { name } = request.params;
      console.error(`Handling tool request: ${name}`);

      try {
        const toolHandlers: Record<string, (client: JiraClient, req: typeof request) => Promise<any>> = {
          manage_jira_issue: handleIssueRequest,
          manage_jira_project: handleProjectRequest,
          manage_jira_board: handleBoardRequest,
          manage_jira_sprint: handleSprintRequest,
          manage_jira_filter: handleFilterRequest,
          analyze_jira_issues: handleAnalysisRequest,
        };

        const handlers: Record<string, (client: JiraClient, req: typeof request) => Promise<any>> = {
          ...toolHandlers,
          queue_jira_operations: createQueueHandler(toolHandlers, JIRA_HOST),
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
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Jira MCP server running on stdio');
  }
}

const server = new JiraServer();
server.run().catch(console.error);
