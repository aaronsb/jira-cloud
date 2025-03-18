import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from '../client/jira-client.js';
import { SearchExpansionOptions, SearchFormatter, SearchResultData } from '../utils/formatters/index.js';

type SearchIssuesArgs = {
  jql: string;
  startAt?: number;
  maxResults?: number;
  expand?: string[];
};

type GetFilterIssuesArgs = {
  filterId: string;
};

type ListMyFiltersArgs = {
  expand?: boolean;
};

// Helper function to normalize parameter names (support both snake_case and camelCase)
function normalizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    // Convert snake_case to camelCase
    if (key === 'start_at') {
      normalized['startAt'] = value;
    } else if (key === 'max_results') {
      normalized['maxResults'] = value;
    } else if (key === 'filter_id') {
      normalized['filterId'] = value;
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

function isSearchIssuesArgs(args: unknown): args is SearchIssuesArgs {
  if (typeof args !== 'object' || args === null) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid search_jira_issues arguments: Expected an object with a jql parameter. Example: { "jql": "project = PROJ" }`
    );
  }

  const typedArgs = args as SearchIssuesArgs;
  
  if (typeof typedArgs.jql !== 'string') {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Missing or invalid jql parameter. Please provide a valid JQL query string. Example: { "jql": "project = PROJ" }`
    );
  }
  
  // Validate startAt if present
  if (typedArgs.startAt !== undefined && typeof typedArgs.startAt !== 'number') {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid startAt parameter. Expected a number.'
    );
  }
  
  // Validate maxResults if present
  if (typedArgs.maxResults !== undefined && typeof typedArgs.maxResults !== 'number') {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid maxResults parameter. Expected a number.'
    );
  }
  
  // Validate expand parameter if present
  if (typedArgs.expand !== undefined) {
    if (!Array.isArray(typedArgs.expand)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid expand parameter. Expected an array of strings.'
      );
    }
    
    const validExpansions = ['issue_details', 'transitions', 'comments_preview'];
    for (const expansion of typedArgs.expand) {
      if (typeof expansion !== 'string' || !validExpansions.includes(expansion)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid expansion: ${expansion}. Valid expansions are: ${validExpansions.join(', ')}`
        );
      }
    }
  }
  
  return true;
}

function isGetFilterIssuesArgs(args: unknown): args is GetFilterIssuesArgs {
  if (typeof args !== 'object' || args === null) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid get_jira_filter_issues arguments: Expected an object with a filterId parameter. Example: { "filterId": "12345" } or { "filter_id": "12345" }`
    );
  }

  const normalizedArgs = normalizeArgs(args as Record<string, unknown>);
  
  if (typeof normalizedArgs.filterId !== 'string') {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Missing or invalid filterId parameter. Please provide a valid filter ID using either "filterId" or "filter_id". Example: { "filterId": "12345" }`
    );
  }
  
  return true;
}

function isListMyFiltersArgs(args: unknown): args is ListMyFiltersArgs {
  if (typeof args !== 'object' || args === null) {
    return false;
  }
  
  const typedArgs = args as ListMyFiltersArgs;
  
  if (typedArgs.expand !== undefined && typeof typedArgs.expand !== 'boolean') {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid expand parameter. Expected a boolean value.'
    );
  }
  
  return true;
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

  // Normalize arguments to support both snake_case and camelCase
  const normalizedArgs = normalizeArgs(args);

  switch (name) {
      case 'search_jira_issues': {
        console.error('Processing search_jira_issues request');
        if (!isSearchIssuesArgs(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid search_jira_issues arguments');
        }

        try {
          console.error(`Executing search with args:`, JSON.stringify(normalizedArgs, null, 2));
          
          // Parse expansion options
          const expansionOptions: SearchExpansionOptions = {};
          if (normalizedArgs.expand) {
            for (const expansion of normalizedArgs.expand as string[]) {
              expansionOptions[expansion as keyof SearchExpansionOptions] = true;
            }
          }
          
          // Execute the search
          const searchResult = await jiraClient.searchIssues(
            normalizedArgs.jql as string,
            normalizedArgs.startAt as number | undefined,
            normalizedArgs.maxResults as number | undefined
          );
          
          // Format the response using the SearchFormatter
          const formattedResponse = SearchFormatter.formatSearchResult(searchResult, expansionOptions);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formattedResponse, null, 2),
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
        if (!isGetFilterIssuesArgs(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid get_jira_filter_issues arguments');
        }

        try {
          console.error(`Executing filter issues with args:`, JSON.stringify(normalizedArgs, null, 2));
          const issues = await jiraClient.getFilterIssues(normalizedArgs.filterId as string);
          
          // Create a search result data structure
          const searchResultData: SearchResultData = {
            issues,
            pagination: {
              startAt: 0,
              maxResults: issues.length,
              total: issues.length,
              hasMore: false
            }
          };
          
          // Format the response using the SearchFormatter
          const formattedResponse = SearchFormatter.formatSearchResult(searchResultData);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formattedResponse, null, 2),
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
        if (!isListMyFiltersArgs(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid list_jira_filters arguments');
        }

        try {
          console.error(`Executing list filters with args:`, JSON.stringify(normalizedArgs, null, 2));
          const filters = await jiraClient.listMyFilters(normalizedArgs.expand || false);

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
