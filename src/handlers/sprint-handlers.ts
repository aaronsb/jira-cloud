import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from '../client/jira-client.js';
import { MarkdownRenderer } from '../mcp/markdown-renderer.js';

/**
 * Sprint Handlers
 * 
 * This file implements handlers for the manage_jira_sprint tool.
 * 
 * Dependency Injection Pattern:
 * - All handler functions receive the jiraClient as their first parameter for consistency
 * - When a parameter is intentionally unused, it is prefixed with an underscore (_jiraClient)
 * - This pattern ensures consistent function signatures and satisfies ESLint rules for unused variables
 * - It also makes the code more maintainable by preserving the dependency injection pattern throughout
 */

// Type definition for the consolidated sprint management tool
type ManageJiraSprintArgs = {
  operation: 'get' | 'create' | 'update' | 'delete' | 'list' | 'manage_issues';
  sprintId?: number;
  boardId?: number;
  name?: string;
  startDate?: string;
  endDate?: string;
  goal?: string;
  state?: 'future' | 'active' | 'closed';
  startAt?: number;
  maxResults?: number;
  add?: string[];
  remove?: string[];
  expand?: string[];
};

// Helper function to normalize parameter names (support both snake_case and camelCase)
function normalizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    // Convert snake_case to camelCase
    if (key === 'sprint_id') {
      normalized['sprintId'] = value;
    } else if (key === 'board_id') {
      normalized['boardId'] = value;
    } else if (key === 'start_date') {
      normalized['startDate'] = value;
    } else if (key === 'end_date') {
      normalized['endDate'] = value;
    } else if (key === 'max_results') {
      normalized['maxResults'] = value;
    } else if (key === 'start_at') {
      normalized['startAt'] = value;
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

// Validate the consolidated sprint management arguments
function validateManageJiraSprintArgs(args: unknown): args is ManageJiraSprintArgs {
  if (typeof args !== 'object' || args === null) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid manage_jira_sprint arguments: Expected an object with an operation parameter'
    );
  }

  const normalizedArgs = normalizeArgs(args as Record<string, unknown>);
  
  // Validate operation parameter
  if (typeof normalizedArgs.operation !== 'string' || 
      !['get', 'create', 'update', 'delete', 'list', 'manage_issues'].includes(normalizedArgs.operation as string)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid operation parameter. Valid values are: get, create, update, delete, list, manage_issues'
    );
  }

  // Validate parameters based on operation
  switch (normalizedArgs.operation) {
    case 'get':
      if (typeof normalizedArgs.sprintId !== 'number') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid sprintId parameter. Please provide a valid sprint ID as a number for the get operation.'
        );
      }
      break;
      
    case 'create':
      if (typeof normalizedArgs.boardId !== 'number') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid boardId parameter. Please provide a valid board ID as a number for the create operation.'
        );
      }
      if (typeof normalizedArgs.name !== 'string' || normalizedArgs.name.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid name parameter. Please provide a valid sprint name as a string for the create operation.'
        );
      }
      break;
      
    case 'update':
      if (typeof normalizedArgs.sprintId !== 'number') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid sprintId parameter. Please provide a valid sprint ID as a number for the update operation.'
        );
      }
      // Ensure at least one update field is provided
      if (
        normalizedArgs.name === undefined &&
        normalizedArgs.goal === undefined &&
        normalizedArgs.startDate === undefined &&
        normalizedArgs.endDate === undefined &&
        normalizedArgs.state === undefined
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'At least one update field (name, goal, startDate, endDate, or state) must be provided for the update operation.'
        );
      }
      break;
      
    case 'delete':
      if (typeof normalizedArgs.sprintId !== 'number') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid sprintId parameter. Please provide a valid sprint ID as a number for the delete operation.'
        );
      }
      break;
      
    case 'list':
      if (typeof normalizedArgs.boardId !== 'number') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid boardId parameter. Please provide a valid board ID as a number for the list operation.'
        );
      }
      break;
      
    case 'manage_issues':
      if (typeof normalizedArgs.sprintId !== 'number') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid sprintId parameter. Please provide a valid sprint ID as a number for the manage_issues operation.'
        );
      }
      // Ensure at least one of add or remove is provided
      if (!normalizedArgs.add && !normalizedArgs.remove) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'At least one of add or remove must be provided for the manage_issues operation.'
        );
      }
      break;
  }

  // Validate common optional parameters
  if (normalizedArgs.startDate !== undefined && typeof normalizedArgs.startDate !== 'string') {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid startDate parameter. Please provide a valid date string in ISO format.'
    );
  }

  if (normalizedArgs.endDate !== undefined && typeof normalizedArgs.endDate !== 'string') {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid endDate parameter. Please provide a valid date string in ISO format.'
    );
  }

  if (normalizedArgs.goal !== undefined && typeof normalizedArgs.goal !== 'string') {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid goal parameter. Please provide a valid goal as a string.'
    );
  }

  if (normalizedArgs.state !== undefined) {
    if (typeof normalizedArgs.state !== 'string' || 
        !['future', 'active', 'closed'].includes(normalizedArgs.state as string)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid state parameter. Valid values are: future, active, closed'
      );
    }
  }

  // Validate pagination parameters
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

  // Validate expand parameter
  if (normalizedArgs.expand !== undefined) {
    if (!Array.isArray(normalizedArgs.expand)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid expand parameter. Expected an array of strings.'
      );
    }
    
    const validExpansions = ['issues', 'report', 'board'];
    for (const expansion of normalizedArgs.expand) {
      if (typeof expansion !== 'string' || !validExpansions.includes(expansion)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid expansion: ${expansion}. Valid expansions are: ${validExpansions.join(', ')}`
        );
      }
    }
  }

  // Validate add and remove parameters for manage_issues operation
  if (normalizedArgs.add !== undefined) {
    if (!Array.isArray(normalizedArgs.add)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid add parameter. Expected an array of issue keys.'
      );
    }
    
    for (const issueKey of normalizedArgs.add) {
      if (typeof issueKey !== 'string') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid issue key in add parameter. All issue keys must be strings.'
        );
      }
    }
  }

  if (normalizedArgs.remove !== undefined) {
    if (!Array.isArray(normalizedArgs.remove)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid remove parameter. Expected an array of issue keys.'
      );
    }
    
    for (const issueKey of normalizedArgs.remove) {
      if (typeof issueKey !== 'string') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid issue key in remove parameter. All issue keys must be strings.'
        );
      }
    }
  }

  return true;
}

// Handler functions for each operation
async function handleGetSprint(jiraClient: JiraClient, args: ManageJiraSprintArgs) {
  // Parse expansion options
  const expansionOptions: Record<string, boolean> = {};
  if (args.expand) {
    for (const expansion of args.expand) {
      if (expansion === 'issues' || expansion === 'report') {
        expansionOptions[expansion] = true;
      }
    }
  }

  // Get the sprint
  const sprint = await jiraClient.getSprint(args.sprintId!);
  
  // Get issues if requested
  let issues = undefined;
  if (expansionOptions.issues) {
    issues = await jiraClient.getSprintIssues(args.sprintId!);
  }

  // Note: Sprint report expansion not yet supported in markdown renderer

  // Render to markdown
  const markdown = MarkdownRenderer.renderSprint({
    id: sprint.id,
    name: sprint.name,
    state: sprint.state,
    boardId: sprint.boardId,
    goal: sprint.goal,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    completeDate: sprint.completeDate,
    issues: issues,
  });

  return {
    content: [
      {
        type: 'text',
        text: markdown,
      },
    ],
  };
}

async function handleCreateSprint(jiraClient: JiraClient, args: ManageJiraSprintArgs) {
  // Create the sprint
  const response = await jiraClient.createSprint(
    args.boardId!,
    args.name!,
    args.startDate,
    args.endDate,
    args.goal
  );

  // Render to markdown
  const markdown = MarkdownRenderer.renderSprint({
    id: response.id,
    name: response.name,
    state: response.state,
    boardId: response.boardId,
    goal: response.goal,
    startDate: response.startDate,
    endDate: response.endDate,
  });

  return {
    content: [
      {
        type: 'text',
        text: `# Sprint Created\n\n${markdown}`,
      },
    ],
  };
}

async function handleUpdateSprint(jiraClient: JiraClient, args: ManageJiraSprintArgs) {
  try {
    // Validate sprint state before updating
    const currentSprint = await jiraClient.getSprint(args.sprintId!);
    
    // Check if trying to update a closed sprint
    if (currentSprint.state === 'closed' && args.state !== 'closed') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Cannot update a closed sprint. Closed sprints are read-only.'
      );
    }

    // Update the sprint
    await jiraClient.updateSprint(
      args.sprintId!,
      args.name,
      args.goal,
      args.startDate,
      args.endDate,
      args.state
    );

    // Get the updated sprint
    const updatedSprint = await jiraClient.getSprint(args.sprintId!);

    // Render to markdown
    const markdown = MarkdownRenderer.renderSprint({
      id: updatedSprint.id,
      name: updatedSprint.name,
      state: updatedSprint.state,
      boardId: updatedSprint.boardId,
      goal: updatedSprint.goal,
      startDate: updatedSprint.startDate,
      endDate: updatedSprint.endDate,
    });

    return {
      content: [
        {
          type: 'text',
          text: `# Sprint Updated\n\n${markdown}`,
        },
      ],
    };
  } catch (error) {
    console.error('Error updating sprint:', error);
    
    // Provide more specific error messages based on the error type
    if (error instanceof McpError) {
      throw error; // Re-throw MCP errors
    } else if (error instanceof Error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to update sprint: ${error.message}`
      );
    } else {
      throw new McpError(
        ErrorCode.InternalError,
        'An unknown error occurred while updating the sprint'
      );
    }
  }
}

async function handleDeleteSprint(jiraClient: JiraClient, args: ManageJiraSprintArgs) {
  // Delete the sprint
  await jiraClient.deleteSprint(args.sprintId!);

  return {
    content: [
      {
        type: 'text',
        text: `# Sprint Deleted\n\nSprint ${args.sprintId} has been deleted successfully.`,
      },
    ],
  };
}

async function handleListSprints(jiraClient: JiraClient, args: ManageJiraSprintArgs) {
  // Set default pagination values
  const startAt = args.startAt !== undefined ? args.startAt : 0;
  const maxResults = args.maxResults !== undefined ? args.maxResults : 50;

  // Get sprints
  const response = await jiraClient.listSprints(
    args.boardId!,
    args.state,
    startAt,
    maxResults
  );

  // Render sprints to markdown
  const lines: string[] = [];
  lines.push(`# Sprints (${response.total})`);
  if (args.state) {
    lines.push(`**Filter:** ${args.state}`);
  }
  lines.push('');

  // Group by state
  const byState: Record<string, typeof response.sprints> = {};
  for (const sprint of response.sprints) {
    const state = sprint.state || 'unknown';
    if (!byState[state]) byState[state] = [];
    byState[state].push(sprint);
  }

  for (const [state, sprints] of Object.entries(byState)) {
    const stateIcon = state === 'active' ? '[>]' : state === 'closed' ? '[x]' : '[ ]';
    lines.push(`## ${state.charAt(0).toUpperCase() + state.slice(1)} ${stateIcon}`);
    for (const sprint of sprints) {
      lines.push(`- **${sprint.name}** (id: ${sprint.id})`);
      if (sprint.goal) {
        lines.push(`  Goal: ${sprint.goal.substring(0, 80)}${sprint.goal.length > 80 ? '...' : ''}`);
      }
    }
    lines.push('');
  }

  // Pagination
  lines.push('---');
  if (startAt + maxResults < response.total) {
    lines.push(`Showing ${startAt + 1}-${startAt + response.sprints.length} of ${response.total}`);
    lines.push(`**Next page:** Use startAt=${startAt + maxResults}`);
  } else {
    lines.push(`Showing all ${response.sprints.length} sprint${response.sprints.length !== 1 ? 's' : ''}`);
  }

  return {
    content: [
      {
        type: 'text',
        text: lines.join('\n'),
      },
    ],
  };
}

async function handleManageIssues(jiraClient: JiraClient, args: ManageJiraSprintArgs) {
  try {
    // Validate sprint state before managing issues
    const currentSprint = await jiraClient.getSprint(args.sprintId!);
    
    // Check if trying to modify a closed sprint
    if (currentSprint.state === 'closed') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Cannot add or remove issues from a closed sprint. Closed sprints are read-only.'
      );
    }

    // Validate that the issues exist before trying to add them
    if (args.add && args.add.length > 0) {
      // We could add validation here to check if issues exist
      console.error(`Attempting to add ${args.add.length} issues to sprint ${args.sprintId}`);
    }

    // Update sprint issues
    await jiraClient.updateSprintIssues(
      args.sprintId!,
      args.add,
      args.remove
    );

    // Get the updated sprint with issues
    const sprint = await jiraClient.getSprint(args.sprintId!);
    const issues = await jiraClient.getSprintIssues(args.sprintId!);

    // Render to markdown
    const markdown = MarkdownRenderer.renderSprint({
      id: sprint.id,
      name: sprint.name,
      state: sprint.state,
      boardId: sprint.boardId,
      goal: sprint.goal,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      issues: issues,
    });

    return {
      content: [
        {
          type: 'text',
          text: `# Sprint Issues Updated\n\n${markdown}`,
        },
      ],
    };
  } catch (error) {
    console.error('Error managing sprint issues:', error);
    
    // Provide more specific error messages based on the error type
    if (error instanceof McpError) {
      throw error; // Re-throw MCP errors
    } else if (error instanceof Error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to manage sprint issues: ${error.message}`
      );
    } else {
      throw new McpError(
        ErrorCode.InternalError,
        'An unknown error occurred while managing sprint issues'
      );
    }
  }
}

// Legacy handler function for backward compatibility
async function handleLegacySprintTools(name: string, args: Record<string, unknown>, jiraClient: JiraClient) {
  console.error(`Handling legacy sprint tool: ${name}`);
  const normalizedArgs = normalizeArgs(args);

  // Map legacy tool to consolidated tool operation
  let operation: ManageJiraSprintArgs['operation'];
  
  if (name === 'create_jira_sprint') {
    operation = 'create';
  } else if (name === 'get_jira_sprint') {
    operation = 'get';
  } else if (name === 'list_jira_sprints') {
    operation = 'list';
  } else if (name === 'update_jira_sprint') {
    operation = 'update';
  } else if (name === 'delete_jira_sprint') {
    operation = 'delete';
  } else if (name === 'update_sprint_issues') {
    operation = 'manage_issues';
  } else {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }

  // Create consolidated args
  const consolidatedArgs: ManageJiraSprintArgs = {
    operation,
    ...normalizedArgs as any
  };

  // Process the operation
  switch (operation) {
    case 'get':
      return await handleGetSprint(jiraClient, consolidatedArgs);
    case 'create':
      return await handleCreateSprint(jiraClient, consolidatedArgs);
    case 'update':
      return await handleUpdateSprint(jiraClient, consolidatedArgs);
    case 'delete':
      return await handleDeleteSprint(jiraClient, consolidatedArgs);
    case 'list':
      return await handleListSprints(jiraClient, consolidatedArgs);
    case 'manage_issues':
      return await handleManageIssues(jiraClient, consolidatedArgs);
    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown operation: ${operation}`);
  }
}

// Main handler function
export async function setupSprintHandlers(
  server: Server,
  jiraClient: JiraClient,
  request: {
    params: {
      name: string;
      arguments?: Record<string, unknown>;
    };
  }
) {
  console.error('Handling sprint request...');
  const { name } = request.params;
  const args = request.params.arguments;

  if (!args) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Missing arguments. Please provide the required parameters for this operation.'
    );
  }

  // Handle legacy sprint tools for backward compatibility
  if (name === 'create_jira_sprint' || 
      name === 'get_jira_sprint' || 
      name === 'list_jira_sprints' || 
      name === 'update_jira_sprint' || 
      name === 'delete_jira_sprint' || 
      name === 'update_sprint_issues') {
    return await handleLegacySprintTools(name, args, jiraClient);
  }

  // Handle the consolidated sprint management tool
  if (name === 'manage_jira_sprint') {
    // Normalize arguments to support both snake_case and camelCase
    const normalizedArgs = normalizeArgs(args);
    
    // Validate arguments
    if (!validateManageJiraSprintArgs(normalizedArgs)) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid manage_jira_sprint arguments');
    }

    // Process the operation
    switch (normalizedArgs.operation) {
      case 'get': {
        console.error('Processing get sprint operation');
        return await handleGetSprint(jiraClient, normalizedArgs as ManageJiraSprintArgs);
      }
      
      case 'create': {
        console.error('Processing create sprint operation');
        return await handleCreateSprint(jiraClient, normalizedArgs as ManageJiraSprintArgs);
      }
      
      case 'update': {
        console.error('Processing update sprint operation');
        return await handleUpdateSprint(jiraClient, normalizedArgs as ManageJiraSprintArgs);
      }
      
      case 'delete': {
        console.error('Processing delete sprint operation');
        return await handleDeleteSprint(jiraClient, normalizedArgs as ManageJiraSprintArgs);
      }
      
      case 'list': {
        console.error('Processing list sprints operation');
        return await handleListSprints(jiraClient, normalizedArgs as ManageJiraSprintArgs);
      }
      
      case 'manage_issues': {
        console.error('Processing manage issues operation');
        return await handleManageIssues(jiraClient, normalizedArgs as ManageJiraSprintArgs);
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
