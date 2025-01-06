import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { JiraClient } from '../client/jira-client.js';

type SearchIssuesArgs = {
  jql: string;
  startAt?: number;
  maxResults?: number;
};

type GetFilterIssuesArgs = {
  filterId: string;
};

type ListMyFiltersArgs = {
  expand?: boolean;
};

function isSearchIssuesArgs(args: unknown): args is SearchIssuesArgs {
  return typeof args === 'object' && args !== null && 
    typeof (args as SearchIssuesArgs).jql === 'string';
}

function isGetFilterIssuesArgs(args: unknown): args is GetFilterIssuesArgs {
  return typeof args === 'object' && args !== null && 
    typeof (args as GetFilterIssuesArgs).filterId === 'string';
}

function isListMyFiltersArgs(args: unknown): args is ListMyFiltersArgs {
  return typeof args === 'object' && args !== null;
}

export async function setupSearchHandlers(
  server: Server,
  jiraClient: JiraClient,
  request: {
    params: {
      name: string;
      arguments?: Record<string, unknown>;
    };
  }
) {
  console.error('Handling search request...');
  const { name } = request.params;
  const args = request.params.arguments;

  if (!args) {
    throw new McpError(ErrorCode.InvalidParams, 'Missing arguments');
  }

  switch (name) {
      case 'search_issues': {
        console.error('Processing search_issues request');
        if (!isSearchIssuesArgs(args)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid search_issues arguments');
        }

        const results = await jiraClient.searchIssues(
          args.jql,
          args.startAt,
          args.maxResults
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'get_filter_issues': {
        console.error('Processing get_filter_issues request');
        if (!isGetFilterIssuesArgs(args)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid get_filter_issues arguments');
        }

        const issues = await jiraClient.getFilterIssues(args.filterId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(issues, null, 2),
            },
          ],
        };
      }

      case 'list_my_filters': {
        console.error('Processing list_my_filters request');
        if (!isListMyFiltersArgs(args)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid list_my_filters arguments');
        }

        const filters = await jiraClient.listMyFilters(args.expand || false);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(filters, null, 2),
            },
          ],
        };
      }

      default: {
        console.error(`Unknown tool requested: ${name}`);
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    }
}
