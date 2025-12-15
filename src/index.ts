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
import { setupFilterHandlers } from './handlers/filter-handlers.js';
import { setupIssueHandlers } from './handlers/issue-handlers.js';
import { setupProjectHandlers } from './handlers/project-handlers.js';
import { setupResourceHandlers } from './handlers/resource-handlers.js';
import { setupSprintHandlers } from './handlers/sprint-handlers.js';
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
    // Use environment-provided name or default to 'jira-cloud'
    const serverName = process.env.MCP_SERVER_NAME || 'jira-cloud';
    console.error(`Initializing Jira MCP server: ${serverName}`);

    this.server = new Server(
      {
        name: serverName,
        version: '0.1.0',
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
        // Filter out the deprecated search_jira_issues tool
        .filter(([key]) => key !== 'search_jira_issues')
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
        let response;
        
        // Issue-related tools
        if (['manage_jira_issue'].includes(name)) {
          response = await setupIssueHandlers(this.server, this.jiraClient, request);
        }
        
        // Project-related tools
        else if (['manage_jira_project'].includes(name)) {
          response = await setupProjectHandlers(this.server, this.jiraClient, request);
        }

        // Board-related tools
        else if (['manage_jira_board'].includes(name)) {
          response = await setupBoardHandlers(this.server, this.jiraClient, request);
        }

        // Sprint-related tools
        else if (['manage_jira_sprint'].includes(name)) {
          response = await setupSprintHandlers(this.server, this.jiraClient, request);
        }
        
        // Filter-related tools
        else if (['manage_jira_filter'].includes(name)) {
          response = await setupFilterHandlers(this.server, this.jiraClient, request);
        }
        
        // Legacy search tool - redirect to filter handler with execute_jql operation
        else if (name === 'search_jira_issues') {
          console.error('Redirecting deprecated search_jira_issues to manage_jira_filter with execute_jql operation');
          
          // Transform the request to use manage_jira_filter with execute_jql operation
          const transformedRequest = {
            ...request,
            params: {
              ...request.params,
              name: 'manage_jira_filter',
              arguments: {
                ...request.params.arguments,
                operation: 'execute_jql'
              }
            }
          };
          
          response = await setupFilterHandlers(this.server, this.jiraClient, transformedRequest);
        }
        
        else {
          console.error(`Unknown tool requested: ${name}`);
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
        
        // Ensure we always return a valid response
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
