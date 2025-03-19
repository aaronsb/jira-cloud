import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from '../client/jira-client.js';
import { FilterData, FilterExpansionOptions, FilterFormatter } from '../utils/formatters/index.js';
import { FilterResponse } from '../types/index.js';

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

  // Validate pagination parameters for list operation
  if (normalizedArgs.operation === 'list') {
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
    
    const validExpansions = ['jql', 'description', 'permissions', 'issue_count'];
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
  const expansionOptions: FilterExpansionOptions = {};
  if (args.expand) {
    for (const expansion of args.expand) {
      expansionOptions[expansion as keyof FilterExpansionOptions] = true;
    }
  }
  
  try {
    // Get the filter by first getting its issues
    // This is a workaround since we don't have direct access to the filter API
    // The getFilterIssues method internally calls the filter API
    const issues = await jiraClient.getFilterIssues(filterId);
    
    // Now get the filter details from the list of all filters
    const allFilters = await jiraClient.listMyFilters(true);
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
      viewUrl: filter.viewUrl || '',
      description: filter.description || '',
      jql: filter.jql || '',
      sharePermissions: filter.sharePermissions?.map(perm => ({
        type: perm.type,
        group: perm.group,
        project: perm.project
      })) || []
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
    
    // Format the response
    const formattedResponse = FilterFormatter.formatFilter(filterData, expansionOptions);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(formattedResponse, null, 2),
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
  const expansionOptions: FilterExpansionOptions = {};
  if (args.expand) {
    for (const expansion of args.expand) {
      expansionOptions[expansion as keyof FilterExpansionOptions] = true;
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
  
  // Format the response
  const formattedFilters = filterDataList.map(filter => 
    FilterFormatter.formatFilter(filter, expansionOptions)
  );
  
  // Create a response with pagination metadata
  const response = {
    data: formattedFilters,
    _metadata: {
      pagination: {
        startAt,
        maxResults,
        total: filters.length,
        hasMore: startAt + maxResults < filters.length,
      },
    },
  };
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}

async function handleCreateFilter(jiraClient: JiraClient, args: ManageJiraFilterArgs) {
  // Note: This is a placeholder. The current JiraClient doesn't have a createFilter method.
  // You would need to implement this in the JiraClient class.
  throw new McpError(
    ErrorCode.InternalError,
    'Create filter operation is not yet implemented'
  );

  // When implemented, it would look something like this:
  /*
  const result = await jiraClient.createFilter({
    name: args.name!,
    jql: args.jql!,
    description: args.description,
    favourite: args.favourite,
    sharePermissions: args.sharePermissions
  });
  
  // Get the created filter to return
  const createdFilter = await jiraClient.getFilter(result.id);
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

async function handleUpdateFilter(jiraClient: JiraClient, args: ManageJiraFilterArgs) {
  // Note: This is a placeholder. The current JiraClient doesn't have an updateFilter method.
  // You would need to implement this in the JiraClient class.
  throw new McpError(
    ErrorCode.InternalError,
    'Update filter operation is not yet implemented'
  );

  // When implemented, it would look something like this:
  /*
  await jiraClient.updateFilter(
    args.filterId!,
    {
      name: args.name,
      jql: args.jql,
      description: args.description,
      favourite: args.favourite,
      sharePermissions: args.sharePermissions
    }
  );

  // Get the updated filter to return
  const updatedFilter = await jiraClient.getFilter(args.filterId!);
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

async function handleDeleteFilter(jiraClient: JiraClient, args: ManageJiraFilterArgs) {
  // Note: This is a placeholder. The current JiraClient doesn't have a deleteFilter method.
  // You would need to implement this in the JiraClient class.
  throw new McpError(
    ErrorCode.InternalError,
    'Delete filter operation is not yet implemented'
  );

  // When implemented, it would look something like this:
  /*
  await jiraClient.deleteFilter(args.filterId!);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: `Filter ${args.filterId} has been deleted successfully.`,
        }, null, 2),
      },
    ],
  };
  */
}

async function handleExecuteFilter(jiraClient: JiraClient, args: ManageJiraFilterArgs) {
  const filterId = args.filterId!;
  
  // Get issues for the filter
  const issues = await jiraClient.getFilterIssues(filterId);
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          data: issues,
          _metadata: {
            filter_id: filterId,
            issue_count: issues.length
          }
        }, null, 2),
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
  
  // Execute the JQL query
  const searchResults = await jiraClient.searchIssues(args.jql, startAt, maxResults);
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          data: searchResults.issues,
          _metadata: {
            jql: args.jql,
            pagination: searchResults.pagination
          }
        }, null, 2),
      },
    ],
  };
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
