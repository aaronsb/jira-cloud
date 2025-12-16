import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from '../client/jira-client.js';
import { MarkdownRenderer, FilterData } from '../mcp/markdown-renderer.js';

/**
 * Filter Handlers
 * 
 * This file implements handlers for the manage_jira_filter tool.
 * 
 * Dependency Injection Pattern:
 * - All handler functions receive the jiraClient as their first parameter for consistency
 * - When a parameter is intentionally unused, it is prefixed with an underscore (_jiraClient)
 * - This pattern ensures consistent function signatures and satisfies ESLint rules for unused variables
 * - It also makes the code more maintainable by preserving the dependency injection pattern throughout
 */

// Type definition for the consolidated filter management tool
type ManageJiraFilterArgs = {
  operation: 'get' | 'create' | 'update' | 'delete' | 'list' | 'execute_filter' | 'execute_jql';
  filterId?: string;
  name?: string;
  jql?: string;
  description?: string;
  favourite?: boolean;
  startAt?: number;
  maxResults?: number;
  sharePermissions?: Array<{
    type: 'group' | 'project' | 'global';
    group?: string;
    project?: string;
  }>;
  expand?: string[];
};

// Helper function to normalize parameter names (support both snake_case and camelCase)
function normalizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    // Convert snake_case to camelCase
    if (key === 'filter_id') {
      normalized['filterId'] = value;
    } else if (key === 'share_permissions') {
      normalized['sharePermissions'] = value;
    } else if (key === 'start_at') {
      normalized['startAt'] = value;
    } else if (key === 'max_results') {
      normalized['maxResults'] = value;
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

// Validate the consolidated filter management arguments
function validateManageJiraFilterArgs(args: unknown): args is ManageJiraFilterArgs {
  if (typeof args !== 'object' || args === null) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid manage_jira_filter arguments: Expected an object with an operation parameter'
    );
  }

  const normalizedArgs = normalizeArgs(args as Record<string, unknown>);
  
  // Validate operation parameter
  if (typeof normalizedArgs.operation !== 'string' || 
      !['get', 'create', 'update', 'delete', 'list', 'execute_filter', 'execute_jql'].includes(normalizedArgs.operation as string)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid operation parameter. Valid values are: get, create, update, delete, list, execute_filter, execute_jql'
    );
  }

  // Validate parameters based on operation
  switch (normalizedArgs.operation) {
    case 'get':
    case 'update':
    case 'delete':
    case 'execute_filter':
      if (typeof normalizedArgs.filterId !== 'string' || normalizedArgs.filterId.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Missing or invalid filterId parameter. Please provide a valid filter ID for the ${normalizedArgs.operation} operation.`
        );
      }
      break;
      
    case 'create':
      if (typeof normalizedArgs.name !== 'string' || normalizedArgs.name.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid name parameter. Please provide a valid filter name for the create operation.'
        );
      }
      if (typeof normalizedArgs.jql !== 'string' || normalizedArgs.jql.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid jql parameter. Please provide a valid JQL query for the create operation.'
        );
      }
      break;
      
    case 'execute_jql':
      if (typeof normalizedArgs.jql !== 'string' || normalizedArgs.jql.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid jql parameter. Please provide a valid JQL query for the execute_jql operation.'
        );
      }
      break;
  }

  // Validate pagination parameters for list and execute_jql operations
  if (normalizedArgs.operation === 'list' || normalizedArgs.operation === 'execute_jql') {
    if (normalizedArgs.startAt !== undefined && typeof normalizedArgs.startAt !== 'number') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid startAt parameter. Please provide a valid number.'
      );
    }

    if (normalizedArgs.maxResults !== undefined && typeof normalizedArgs.maxResults !== 'number') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid maxResults parameter. Please provide a valid number.'
      );
    }
  }

  // Validate expand parameter
  if (normalizedArgs.expand !== undefined) {
    if (!Array.isArray(normalizedArgs.expand)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid expand parameter. Expected an array of strings.'
      );
    }
    
    // Combined list of valid expansions for both filter and search operations
    const validExpansions = [
      'jql', 'description', 'permissions', 'issue_count',  // Filter expansions
      'issue_details', 'transitions', 'comments_preview'   // Search expansions
    ];
    
    for (const expansion of normalizedArgs.expand) {
      if (typeof expansion !== 'string' || !validExpansions.includes(expansion)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid expansion: ${expansion}. Valid expansions are: ${validExpansions.join(', ')}`
        );
      }
    }
  }

  // Validate sharePermissions parameter
  if (normalizedArgs.sharePermissions !== undefined) {
    if (!Array.isArray(normalizedArgs.sharePermissions)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid sharePermissions parameter. Expected an array of permission objects.'
      );
    }
    
    for (const permission of normalizedArgs.sharePermissions) {
      if (typeof permission !== 'object' || permission === null) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid permission object in sharePermissions. Expected an object with a type property.'
        );
      }
      
      if (typeof permission.type !== 'string' || !['group', 'project', 'global'].includes(permission.type)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid permission type. Valid values are: group, project, global.'
        );
      }
      
      if (permission.type === 'group' && (typeof permission.group !== 'string' || permission.group.trim() === '')) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid group parameter for group permission type.'
        );
      }
      
      if (permission.type === 'project' && (typeof permission.project !== 'string' || permission.project.trim() === '')) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid project parameter for project permission type.'
        );
      }
    }
  }

  return true;
}

// Handler functions for each operation
async function handleGetFilter(jiraClient: JiraClient, args: ManageJiraFilterArgs) {
  const filterId = args.filterId!;
  
  // Parse expansion options
  const expansionOptions: Record<string, boolean> = {};
  if (args.expand) {
    for (const expansion of args.expand) {
      if (['jql', 'description', 'permissions', 'issue_count'].includes(expansion)) {
        expansionOptions[expansion] = true;
      }
    }
  }

  try {
    // Get the filter by first getting its issues
    // This is a workaround since we don't have direct access to the filter API
    // The getFilterIssues method internally calls the filter API
    await jiraClient.getFilterIssues(filterId);

    // Now get the filter details from the list of all filters
    const allFilters = await jiraClient.listMyFilters(expansionOptions.jql || expansionOptions.description || expansionOptions.permissions);
    const filter = allFilters.find(f => f.id === filterId);

    if (!filter) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Filter with ID ${filterId} not found or not accessible`
      );
    }

    // Convert to FilterData format
    const filterData: FilterData = {
      id: filter.id,
      name: filter.name || 'Unnamed Filter',
      owner: filter.owner || 'Unknown',
      favourite: filter.favourite || false,
      viewUrl: filter.viewUrl,
      description: filter.description,
      jql: filter.jql,
    };
    
    // Handle expansions
    if (expansionOptions.issue_count) {
      try {
        // Get issue count for this filter
        const issues = await jiraClient.getFilterIssues(filterId);
        
        // Add issue count to the response
        filterData.issueCount = issues.length;
      } catch (error) {
        console.error(`Error getting issue count for filter ${filterId}:`, error);
        // Continue even if issue count fails
      }
    }
    
    // Render to markdown
    const markdown = MarkdownRenderer.renderFilter(filterData);

    return {
      content: [
        {
          type: 'text',
          text: markdown,
        },
      ],
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }

    console.error(`Error getting filter ${filterId}:`, error);
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to get filter: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function handleListFilters(jiraClient: JiraClient, args: ManageJiraFilterArgs) {
  // Set default pagination values
  const startAt = args.startAt !== undefined ? args.startAt : 0;
  const maxResults = args.maxResults !== undefined ? args.maxResults : 50;
  
  // Parse expansion options
  const expansionOptions: Record<string, boolean> = {};
  if (args.expand) {
    for (const expansion of args.expand) {
      if (['jql', 'description', 'permissions', 'issue_count'].includes(expansion)) {
        expansionOptions[expansion] = true;
      }
    }
  }

  // Get all filters
  const filters = await jiraClient.listMyFilters(expansionOptions.jql || expansionOptions.description || expansionOptions.permissions);
  
  // Apply pagination
  const paginatedFilters = filters.slice(startAt, startAt + maxResults);
  
  // Convert to FilterData format
  const filterDataList: FilterData[] = paginatedFilters.map(filter => ({
    ...filter
  }));
  
  // If issue count is requested, get it for each filter
  if (expansionOptions.issue_count) {
    // This would be more efficient with a batch API call, but for now we'll do it sequentially
    for (const filter of filterDataList) {
      try {
        // Get issues for this filter
        const issues = await jiraClient.getFilterIssues(filter.id);
        
        // Add issue count to the filter data
        filter.issueCount = issues.length;
      } catch (error) {
        console.error(`Error getting issues for filter ${filter.id}:`, error);
        // Continue with other filters even if one fails
      }
    }
  }
  
  // Render to markdown with pagination info
  let markdown = MarkdownRenderer.renderFilterList(filterDataList);

  // Add pagination guidance
  markdown += '\n\n---\n';
  if (startAt + maxResults < filters.length) {
    markdown += `Showing ${startAt + 1}-${startAt + filterDataList.length} of ${filters.length}\n`;
    markdown += `**Next page:** Use startAt=${startAt + maxResults}`;
  } else {
    markdown += `Showing all ${filterDataList.length} filter${filterDataList.length !== 1 ? 's' : ''}`;
  }

  return {
    content: [
      {
        type: 'text',
        text: markdown,
      },
    ],
  };
}

async function handleCreateFilter(_jiraClient: JiraClient, _args: ManageJiraFilterArgs) {
  // Note: This is a placeholder. The current JiraClient doesn't have a createFilter method.
  // You would need to implement this in the JiraClient class.
  throw new McpError(
    ErrorCode.InternalError,
    'Create filter operation is not yet implemented'
  );

  // When implemented, it would look something like this:
  /*
  const result = await _jiraClient.createFilter({
    name: _args.name!,
    jql: _args.jql!,
    description: _args.description,
    favourite: _args.favourite,
    sharePermissions: _args.sharePermissions
  });
  
  // Get the created filter to return
  const createdFilter = await _jiraClient.getFilter(result.id);
  const formattedResponse = FilterFormatter.formatFilter(createdFilter);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(formattedResponse, null, 2),
      },
    ],
  };
  */
}

async function handleUpdateFilter(_jiraClient: JiraClient, _args: ManageJiraFilterArgs) {
  // Note: This is a placeholder. The current JiraClient doesn't have an updateFilter method.
  // You would need to implement this in the JiraClient class.
  throw new McpError(
    ErrorCode.InternalError,
    'Update filter operation is not yet implemented'
  );

  // When implemented, it would look something like this:
  /*
  await _jiraClient.updateFilter(
    _args.filterId!,
    {
      name: _args.name,
      jql: _args.jql,
      description: _args.description,
      favourite: _args.favourite,
      sharePermissions: _args.sharePermissions
    }
  );

  // Get the updated filter to return
  const updatedFilter = await _jiraClient.getFilter(_args.filterId!);
  const formattedResponse = FilterFormatter.formatFilter(updatedFilter);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(formattedResponse, null, 2),
      },
    ],
  };
  */
}

async function handleDeleteFilter(_jiraClient: JiraClient, _args: ManageJiraFilterArgs) {
  // Note: This is a placeholder. The current JiraClient doesn't have a deleteFilter method.
  // You would need to implement this in the JiraClient class.
  throw new McpError(
    ErrorCode.InternalError,
    'Delete filter operation is not yet implemented'
  );

  // When implemented, it would look something like this:
  /*
  await _jiraClient.deleteFilter(_args.filterId!);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: `Filter ${_args.filterId} has been deleted successfully.`,
        }, null, 2),
      },
    ],
  };
  */
}

async function handleExecuteFilter(jiraClient: JiraClient, _args: ManageJiraFilterArgs) {
  const filterId = _args.filterId!;

  // Get issues for the filter
  const issues = await jiraClient.getFilterIssues(filterId);

  // Render to markdown
  const markdown = MarkdownRenderer.renderIssueSearchResults(
    issues,
    {
      startAt: 0,
      maxResults: issues.length,
      total: issues.length,
      hasMore: false,
    },
    `filter = ${filterId}`
  );

  return {
    content: [
      {
        type: 'text',
        text: markdown,
      },
    ],
  };
}

async function handleExecuteJql(jiraClient: JiraClient, args: ManageJiraFilterArgs) {
  if (typeof args.jql !== 'string' || args.jql.trim() === '') {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Missing or invalid jql parameter. Please provide a valid JQL query for the execute_jql operation.'
    );
  }
  
  // Set default pagination values
  const startAt = args.startAt !== undefined ? args.startAt : 0;
  const maxResults = args.maxResults !== undefined ? args.maxResults : 25;
  
  try {
    console.error(`Executing JQL search with args:`, JSON.stringify(args, null, 2));
    
    // Parse search expansion options (not currently used but reserved for future)
    const _searchExpansionOptions: Record<string, boolean> = {};
    if (args.expand) {
      for (const expansion of args.expand) {
        if (['issue_details', 'transitions', 'comments_preview'].includes(expansion)) {
          _searchExpansionOptions[expansion] = true;
        }
      }
    }
    
    // Execute the search
    const searchResult = await jiraClient.searchIssues(
      args.jql,
      startAt,
      maxResults
    );

    // Render directly to markdown for token efficiency
    const markdown = MarkdownRenderer.renderIssueSearchResults(
      searchResult.issues,
      searchResult.pagination,
      args.jql
    );

    return {
      content: [
        {
          type: 'text',
          text: markdown,
        },
      ],
    };
  } catch (error) {
    console.error('Error in execute_jql:', error);
    if (error instanceof Error) {
      throw new McpError(ErrorCode.InvalidRequest, `Jira API error: ${error.message}`);
    }
    throw new McpError(ErrorCode.InvalidRequest, 'Failed to execute Jira search');
  }
}

// Main handler function
export async function setupFilterHandlers(
  server: Server,
  jiraClient: JiraClient,
  request: {
    params: {
      name: string;
      arguments?: Record<string, unknown>;
    };
  }
) {
  console.error('Handling filter request...');
  const { name } = request.params;
  const args = request.params.arguments || {};

  // Handle the consolidated filter management tool
  if (name === 'manage_jira_filter') {
    // Normalize arguments to support both snake_case and camelCase
    const normalizedArgs = normalizeArgs(args);
    
    // Validate arguments
    if (!validateManageJiraFilterArgs(normalizedArgs)) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid manage_jira_filter arguments');
    }

    // Process the operation
    switch (normalizedArgs.operation) {
      case 'get': {
        console.error('Processing get filter operation');
        return await handleGetFilter(jiraClient, normalizedArgs as ManageJiraFilterArgs);
      }
      
      case 'list': {
        console.error('Processing list filters operation');
        return await handleListFilters(jiraClient, normalizedArgs as ManageJiraFilterArgs);
      }
      
      case 'create': {
        console.error('Processing create filter operation');
        return await handleCreateFilter(jiraClient, normalizedArgs as ManageJiraFilterArgs);
      }
      
      case 'update': {
        console.error('Processing update filter operation');
        return await handleUpdateFilter(jiraClient, normalizedArgs as ManageJiraFilterArgs);
      }
      
      case 'delete': {
        console.error('Processing delete filter operation');
        return await handleDeleteFilter(jiraClient, normalizedArgs as ManageJiraFilterArgs);
      }
      
      case 'execute_filter': {
        console.error('Processing execute filter operation');
        return await handleExecuteFilter(jiraClient, normalizedArgs as ManageJiraFilterArgs);
      }
      
      case 'execute_jql': {
        console.error('Processing execute JQL operation');
        return await handleExecuteJql(jiraClient, normalizedArgs as ManageJiraFilterArgs);
      }
      
      default: {
        console.error(`Unknown operation: ${normalizedArgs.operation}`);
        throw new McpError(ErrorCode.MethodNotFound, `Unknown operation: ${normalizedArgs.operation}`);
      }
    }
  }

  console.error(`Unknown tool requested: ${name}`);
  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
}
