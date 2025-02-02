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
      case 'search_jira_issues': {
        console.error('Processing search_jira_issues request');
        if (!isSearchIssuesArgs(args)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid search_jira_issues arguments');
        }

        try {
          console.error(`Executing search with args:`, JSON.stringify(args, null, 2));
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
        } catch (error) {
          console.error('Error in search_jira_issues:', error);
          if (error instanceof Error) {
            throw new McpError(ErrorCode.InvalidRequest, `Jira API error: ${error.message}`);
          }
          throw new McpError(ErrorCode.InvalidRequest, 'Failed to execute Jira search');
        }
      }

      case 'get_jira_filter_issues': {
        console.error('Processing get_jira_filter_issues request');
        if (!isGetFilterIssuesArgs(args)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid get_jira_filter_issues arguments');
        }

        try {
          console.error(`Executing filter issues with args:`, JSON.stringify(args, null, 2));
          const issues = await jiraClient.getFilterIssues(args.filterId);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(issues, null, 2),
              },
            ],
          };
        } catch (error) {
          console.error('Error in get_jira_filter_issues:', error);
          if (error instanceof Error) {
            throw new McpError(ErrorCode.InvalidRequest, `Jira API error: ${error.message}`);
          }
          throw new McpError(ErrorCode.InvalidRequest, 'Failed to get filter issues');
        }
      }

      case 'list_jira_filters': {
        console.error('Processing list_jira_filters request');
        if (!isListMyFiltersArgs(args)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid list_jira_filters arguments');
        }

        try {
          console.error(`Executing list filters with args:`, JSON.stringify(args, null, 2));
          const filters = await jiraClient.listMyFilters(args.expand || false);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(filters, null, 2),
              },
            ],
          };
        } catch (error) {
          console.error('Error in list_jira_filters:', error);
          if (error instanceof Error) {
            throw new McpError(ErrorCode.InvalidRequest, `Jira API error: ${error.message}`);
          }
          throw new McpError(ErrorCode.InvalidRequest, 'Failed to list filters');
        }
      }

      default: {
        console.error(`Unknown tool requested: ${name}`);
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    }
}
