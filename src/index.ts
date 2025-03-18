#!/usr/bin/env node
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
import { setupBoardHandlers } from './handlers/board-handlers.js';
import { setupIssueHandlers } from './handlers/issue-handlers.js';
import { setupProjectHandlers } from './handlers/project-handlers.js';
import { setupSearchHandlers } from './handlers/search-handlers.js';
import { toolSchemas } from './schemas/tool-schemas.js';

// Jira credentials from environment variables
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_HOST = process.env.JIRA_HOST;

if (!JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_HOST) {
  throw new Error('Missing required Jira credentials in environment variables');
}

class JiraServer {
  private server: Server;
  private jiraClient: JiraClient;

  constructor() {
    console.error('Loading tool schemas...');
    console.error('Available schemas:', Object.keys(toolSchemas));

    // Convert tool schemas to the format expected by the MCP SDK
    const tools = Object.entries(toolSchemas).map(([key, schema]) => {
      console.error(`Registering tool: ${key}`);
      const inputSchema = {
        type: 'object',
        properties: schema.inputSchema.properties,
      } as const;

      // Only add required field if it exists in the schema
      if ('required' in schema.inputSchema) {
        Object.assign(inputSchema, { required: schema.inputSchema.required });
      }

      return {
        name: key,
        description: schema.description,
        inputSchema,
      };
    });

    console.error('Initializing server with tools:', JSON.stringify(tools, null, 2));

    // Use environment-provided name or default to 'jira-cloud'
    const serverName = process.env.MCP_SERVER_NAME || 'jira-cloud';
    console.error(`Using server name: ${serverName}`);

    this.server = new Server(
      {
        name: serverName,
        version: '0.1.0',
        description: 'Jira Cloud MCP Server - Provides tools for interacting with any Jira Cloud instance'
      },
      {
        capabilities: {
          tools: {
            schemas: tools,
          },
          resources: {
            schemas: [], // Explicitly define empty resources
          },
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
      tools: Object.entries(toolSchemas).map(([key, schema]) => ({
        name: key,
        description: schema.description,
        inputSchema: {
          type: 'object',
          properties: schema.inputSchema.properties,
          ...(('required' in schema.inputSchema) ? { required: schema.inputSchema.required } : {}),
        },
      })),
    }));

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [], // No resources provided by this server
    }));

    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
      resourceTemplates: [], // No resource templates provided by this server
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      throw new McpError(ErrorCode.InvalidRequest, `No resources available: ${request.params.uri}`);
    });

    // Set up tool handlers
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      console.error('Received request:', JSON.stringify(request, null, 2));

      const { name } = request.params;
      console.error(`Handling tool request: ${name}`);

      try {
        // Issue-related tools
        if (['get_jira_issue', 'get_jira_issue_details', 'get_jira_issue_attachments', 'update_jira_issue', 'add_jira_comment', 'get_jira_transitions', 'get_jira_fields', 'transition_jira_issue', 'create_jira_issue'].includes(name)) {
          return await setupIssueHandlers(this.server, this.jiraClient, request);
        }
        
        // Search-related tools
        if (['search_jira_issues', 'get_jira_filter_issues', 'list_jira_filters'].includes(name)) {
          return await setupSearchHandlers(this.server, this.jiraClient, request);
        }

        // Project-related tools
        if (['list_jira_projects', 'get_jira_project'].includes(name)) {
          return await setupProjectHandlers(this.server, this.jiraClient, request);
        }

        // Board-related tools
        if (['list_jira_boards', 'get_jira_board', 'list_jira_sprints'].includes(name)) {
          return await setupBoardHandlers(this.server, this.jiraClient, request);
        }

        console.error(`Unknown tool requested: ${name}`);
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
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
