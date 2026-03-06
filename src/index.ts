#!/usr/bin/env node
import { createRequire } from 'module';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ErrorCode, 
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from './client/jira-client.js';
import { handleBoardRequest } from './handlers/board-handlers.js';
import { handleFilterRequest } from './handlers/filter-handlers.js';
import { handleIssueRequest } from './handlers/issue-handlers.js';
import { handleProjectRequest } from './handlers/project-handlers.js';
import { setupResourceHandlers } from './handlers/resource-handlers.js';
import { handleSprintRequest } from './handlers/sprint-handlers.js';
import { toolSchemas } from './schemas/tool-schemas.js';

// Jira credentials from environment variables
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_HOST = process.env.JIRA_HOST;

if (!JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_HOST) {
  throw new Error('Missing required Jira credentials in environment variables');
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
        },
      }
    );

    this.jiraClient = new JiraClient({
      host: JIRA_HOST!,
      email: JIRA_EMAIL!,
      apiToken: JIRA_API_TOKEN!,
    });

    this.setupHandlers();
    
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

    // Set up tool handlers
    this.server.setRequestHandler(CallToolRequestSchema, async (request, _extra) => {
      console.error('Received request:', JSON.stringify(request, null, 2));

      const { name } = request.params;
      console.error(`Handling tool request: ${name}`);

      try {
        const handlers: Record<string, (client: JiraClient, req: typeof request) => Promise<any>> = {
          manage_jira_issue: handleIssueRequest,
          manage_jira_project: handleProjectRequest,
          manage_jira_board: handleBoardRequest,
          manage_jira_sprint: handleSprintRequest,
          manage_jira_filter: handleFilterRequest,
        };

        const handler = handlers[name];
        if (!handler) {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }

        const response = await handler(this.jiraClient, request);
        if (!response) {
          throw new McpError(ErrorCode.InternalError, `No response from handler for tool: ${name}`);
        }

        return response;
      } catch (error) {
        console.error('Error handling request:', error);
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(ErrorCode.InternalError, 'Internal server error');
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
