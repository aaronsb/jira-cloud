import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from '../client/jira-client.js';
import { SearchExpansionOptions, SearchFormatter, SearchResultData } from '../utils/formatters/index.js';

/**
 * Search Handlers
 * 
 * This file implements handlers for the search_jira_issues tool.
 * 
 * Dependency Injection Pattern:
 * - All handler functions receive the jiraClient as their first parameter for consistency
 * - When a parameter is intentionally unused, it is prefixed with an underscore (_jiraClient)
 * - This pattern ensures consistent function signatures and satisfies ESLint rules for unused variables
 * - It also makes the code more maintainable by preserving the dependency injection pattern throughout
 */

type SearchIssuesArgs = {
  jql: string;
  startAt?: number;
  maxResults?: number;
  expand?: string[];
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


      default: {
        console.error(`Unknown tool requested: ${name}`);
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    }
}
