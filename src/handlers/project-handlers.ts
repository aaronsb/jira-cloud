import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from '../client/jira-client.js';

export async function setupProjectHandlers(
  server: Server,
  jiraClient: JiraClient,
  request: {
    params: {
      name: string;
      arguments?: Record<string, unknown>;
    };
  }
) {
  console.error('Handling project request...');
  const { name } = request.params;

  switch (name) {
    case 'list_jira_projects': {
      console.error('Processing list_jira_projects request');
      try {
        const projects = await jiraClient.listProjects();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(projects, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error('Error in list_jira_projects:', error);
        if (error instanceof Error) {
          throw new McpError(ErrorCode.InvalidRequest, `Jira API error: ${error.message}`);
        }
        throw new McpError(ErrorCode.InvalidRequest, 'Failed to list projects');
      }
    }

    default: {
      console.error(`Unknown tool requested: ${name}`);
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  }
}
