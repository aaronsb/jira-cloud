#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { JiraClient } from './client/jira-client.js';
import { setupIssueHandlers } from './handlers/issue-handlers.js';
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

    // Use the same name as in MCP settings
    const serverName = process.env.JIRA_HOST?.includes('cprimeglobalsolutions') ? 'prima' : 'jvl';
    console.error(`Using server name: ${serverName}`);

    this.server = new Server(
      {
        name: serverName,
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {
            schemas: tools,
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
    // Set up a single CallToolRequestSchema handler that routes to the appropriate handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      console.error('Received request:', JSON.stringify(request, null, 2));

      const { name } = request.params;
      console.error(`Handling tool request: ${name}`);

      try {
        // Issue-related tools
        if (['get_issue', 'update_issue', 'add_comment', 'get_transitions', 'get_populated_fields', 'transition_issue'].includes(name)) {
          return await setupIssueHandlers(this.server, this.jiraClient, request);
        }
        
        // Search-related tools
        if (['search_issues', 'get_filter_issues', 'list_my_filters'].includes(name)) {
          return await setupSearchHandlers(this.server, this.jiraClient, request);
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
