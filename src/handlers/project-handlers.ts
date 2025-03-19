import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from '../client/jira-client.js';
import { ProjectData, ProjectExpansionOptions, ProjectFormatter } from '../utils/formatters/index.js';

/**
 * Project Handlers
 * 
 * This file implements handlers for the manage_jira_project tool.
 * 
 * Dependency Injection Pattern:
 * - All handler functions receive the jiraClient as their first parameter for consistency
 * - When a parameter is intentionally unused, it is prefixed with an underscore (_jiraClient)
 * - This pattern ensures consistent function signatures and satisfies ESLint rules for unused variables
 * - It also makes the code more maintainable by preserving the dependency injection pattern throughout
 */

// Type definition for the consolidated project management tool
type ManageJiraProjectArgs = {
  operation: 'get' | 'create' | 'update' | 'delete' | 'list';
  projectKey?: string;
  name?: string;
  key?: string;
  description?: string;
  lead?: string;
  startAt?: number;
  maxResults?: number;
  expand?: string[];
  include_status_counts?: boolean;
};


// Helper function to normalize parameter names (support both snake_case and camelCase)
function normalizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    // Convert snake_case to camelCase
    if (key === 'project_key') {
      normalized['projectKey'] = value;
    } else if (key === 'include_status_counts') {
      normalized['includeStatusCounts'] = value;
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

// Validate the consolidated project management arguments
function validateManageJiraProjectArgs(args: unknown): args is ManageJiraProjectArgs {
  if (typeof args !== 'object' || args === null) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid manage_jira_project arguments: Expected an object with an operation parameter'
    );
  }

  const normalizedArgs = normalizeArgs(args as Record<string, unknown>);
  
  // Validate operation parameter
  if (typeof normalizedArgs.operation !== 'string' || 
      !['get', 'create', 'update', 'delete', 'list'].includes(normalizedArgs.operation as string)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid operation parameter. Valid values are: get, create, update, delete, list'
    );
  }

  // Validate parameters based on operation
  switch (normalizedArgs.operation) {
    case 'get':
      if (typeof normalizedArgs.projectKey !== 'string' || normalizedArgs.projectKey.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid projectKey parameter. Please provide a valid project key for the get operation.'
        );
      }
      
      // Validate project key format (e.g., PROJ)
      if (!/^[A-Z][A-Z0-9_]+$/.test(normalizedArgs.projectKey as string)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid project key format. Expected format: PROJ`
        );
      }
      break;
      
    case 'create':
      if (typeof normalizedArgs.name !== 'string' || normalizedArgs.name.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid name parameter. Please provide a valid project name for the create operation.'
        );
      }
      if (typeof normalizedArgs.key !== 'string' || normalizedArgs.key.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid key parameter. Please provide a valid project key for the create operation.'
        );
      }
      
      // Validate project key format (e.g., PROJ)
      if (!/^[A-Z][A-Z0-9_]+$/.test(normalizedArgs.key as string)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid project key format. Expected format: PROJ`
        );
      }
      break;
      
    case 'update':
      if (typeof normalizedArgs.projectKey !== 'string' || normalizedArgs.projectKey.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid projectKey parameter. Please provide a valid project key for the update operation.'
        );
      }
      
      // Validate project key format (e.g., PROJ)
      if (!/^[A-Z][A-Z0-9_]+$/.test(normalizedArgs.projectKey as string)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid project key format. Expected format: PROJ`
        );
      }
      
      // Ensure at least one update field is provided
      if (
        normalizedArgs.name === undefined &&
        normalizedArgs.description === undefined &&
        normalizedArgs.lead === undefined
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'At least one update field (name, description, or lead) must be provided for the update operation.'
        );
      }
      break;
      
    case 'delete':
      if (typeof normalizedArgs.projectKey !== 'string' || normalizedArgs.projectKey.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid projectKey parameter. Please provide a valid project key for the delete operation.'
        );
      }
      
      // Validate project key format (e.g., PROJ)
      if (!/^[A-Z][A-Z0-9_]+$/.test(normalizedArgs.projectKey as string)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid project key format. Expected format: PROJ`
        );
      }
      break;
  }

  // Validate expand parameter
  if (normalizedArgs.expand !== undefined) {
    if (!Array.isArray(normalizedArgs.expand)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid expand parameter. Expected an array of strings.'
      );
    }
    
    const validExpansions = ['boards', 'components', 'versions', 'recent_issues'];
    for (const expansion of normalizedArgs.expand) {
      if (typeof expansion !== 'string' || !validExpansions.includes(expansion)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid expansion: ${expansion}. Valid expansions are: ${validExpansions.join(', ')}`
        );
      }
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

  return true;
}


// Handler functions for each operation
async function handleGetProject(jiraClient: JiraClient, args: ManageJiraProjectArgs) {
  const projectKey = args.projectKey!;
  const includeStatusCounts = args.include_status_counts !== false; // Default to true
  
  // Parse expansion options
  const expansionOptions: ProjectExpansionOptions = {};
  if (args.expand) {
    for (const expansion of args.expand) {
      expansionOptions[expansion as keyof ProjectExpansionOptions] = true;
    }
  }
  
  // Get all projects and find the requested one
  const projects = await jiraClient.listProjects();
  const project = projects.find(p => p.key === projectKey);
  
  if (!project) {
    throw new McpError(ErrorCode.InvalidRequest, `Project not found: ${projectKey}`);
  }
  
  // Convert to ProjectData format
  const projectData: ProjectData = {
    id: project.id,
    key: project.key,
    name: project.name,
    description: project.description,
    lead: project.lead,
    url: project.url
  };
  
  // If status counts are requested, get them
  if (includeStatusCounts) {
    try {
      // Get issue counts by status for this project
      const searchResult = await jiraClient.searchIssues(`project = ${projectKey}`, 0, 0);
      
      // Count issues by status
      const statusCounts: Record<string, number> = {};
      for (const issue of searchResult.issues) {
        const status = issue.status;
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }
      
      projectData.status_counts = statusCounts;
    } catch (error) {
      console.error(`Error getting status counts for project ${projectKey}:`, error);
      // Continue even if status counts fail
    }
  }
  
  // Handle expansions
  if (expansionOptions.boards) {
    try {
      // Get boards for this project
      const boards = await jiraClient.listBoards();
      const projectBoards = boards.filter(board => 
        board.location?.projectId === Number(project.id) || 
        board.location?.projectName === project.name
      );
      
      // Add boards to the response
      projectData.boards = projectBoards;
    } catch (error) {
      console.error(`Error getting boards for project ${projectKey}:`, error);
      // Continue even if boards fail
    }
  }
  
  if (expansionOptions.recent_issues) {
    try {
      // Get recent issues for this project
      const searchResult = await jiraClient.searchIssues(
        `project = ${projectKey} ORDER BY updated DESC`, 
        0, 
        5
      );
      
      // Add recent issues to the response
      projectData.recent_issues = searchResult.issues;
    } catch (error) {
      console.error(`Error getting recent issues for project ${projectKey}:`, error);
      // Continue even if recent issues fail
    }
  }
  
  // Format the response
  const formattedResponse = ProjectFormatter.formatProject(projectData, expansionOptions);
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(formattedResponse, null, 2),
      },
    ],
  };
}

async function handleCreateProject(_jiraClient: JiraClient, _args: ManageJiraProjectArgs) {
  // Note: This is a placeholder. The current JiraClient doesn't have a createProject method.
  // You would need to implement this in the JiraClient class.
  throw new McpError(
    ErrorCode.InternalError,
    'Create project operation is not yet implemented'
  );

  // When implemented, it would look something like this:
  /*
  const result = await _jiraClient.createProject({
    key: _args.key!,
    name: _args.name!,
    description: _args.description,
    lead: _args.lead
  });
  
  // Get the created project to return
  const createdProject = await _jiraClient.getProject(result.key);
  const formattedResponse = ProjectFormatter.formatProject(createdProject);

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

async function handleUpdateProject(_jiraClient: JiraClient, _args: ManageJiraProjectArgs) {
  // Note: This is a placeholder. The current JiraClient doesn't have an updateProject method.
  // You would need to implement this in the JiraClient class.
  throw new McpError(
    ErrorCode.InternalError,
    'Update project operation is not yet implemented'
  );

  // When implemented, it would look something like this:
  /*
  await _jiraClient.updateProject(
    _args.projectKey!,
    _args.name,
    _args.description,
    _args.lead
  );

  // Get the updated project to return
  const updatedProject = await _jiraClient.getProject(_args.projectKey!);
  const formattedResponse = ProjectFormatter.formatProject(updatedProject);

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

async function handleDeleteProject(_jiraClient: JiraClient, _args: ManageJiraProjectArgs) {
  // Note: This is a placeholder. The current JiraClient doesn't have a deleteProject method.
  // You would need to implement this in the JiraClient class.
  throw new McpError(
    ErrorCode.InternalError,
    'Delete project operation is not yet implemented'
  );

  // When implemented, it would look something like this:
  /*
  await _jiraClient.deleteProject(_args.projectKey!);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: `Project ${_args.projectKey} has been deleted successfully.`,
        }, null, 2),
      },
    ],
  };
  */
}

async function handleListProjects(jiraClient: JiraClient, args: ManageJiraProjectArgs) {
  // Set default pagination values
  const startAt = args.startAt !== undefined ? args.startAt : 0;
  const maxResults = args.maxResults !== undefined ? args.maxResults : 50;
  const includeStatusCounts = args.include_status_counts === true;
  
  // Get all projects
  const projects = await jiraClient.listProjects();
  
  // Apply pagination
  const paginatedProjects = projects.slice(startAt, startAt + maxResults);
  
  // Convert to ProjectData format
  const projectDataList: ProjectData[] = paginatedProjects.map(project => ({
    id: project.id,
    key: project.key,
    name: project.name,
    description: project.description,
    lead: project.lead,
    url: project.url
  }));
  
  // If status counts are requested, get them for each project
  if (includeStatusCounts) {
    // This would be more efficient with a batch API call, but for now we'll do it sequentially
    for (const project of projectDataList) {
      try {
        // Get issue counts by status for this project
        const searchResult = await jiraClient.searchIssues(`project = ${project.key}`, 0, 0);
        
        // Count issues by status
        const statusCounts: Record<string, number> = {};
        for (const issue of searchResult.issues) {
          const status = issue.status;
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        }
        
        project.status_counts = statusCounts;
      } catch (error) {
        console.error(`Error getting status counts for project ${project.key}:`, error);
        // Continue with other projects even if one fails
      }
    }
  }
  
  // Format the response
  const formattedProjects = projectDataList.map(project => 
    ProjectFormatter.formatProject(project)
  );
  
  // Create a response with pagination metadata
  const response = {
    data: formattedProjects,
    _metadata: {
      pagination: {
        startAt,
        maxResults,
        total: projects.length,
        hasMore: startAt + maxResults < projects.length,
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


// Main handler function
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
  const args = request.params.arguments || {};

  // Handle the consolidated project management tool
  if (name === 'manage_jira_project') {
    // Normalize arguments to support both snake_case and camelCase
    const normalizedArgs = normalizeArgs(args);
    
    // Validate arguments
    if (!validateManageJiraProjectArgs(normalizedArgs)) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid manage_jira_project arguments');
    }

    // Process the operation
    switch (normalizedArgs.operation) {
      case 'get': {
        console.error('Processing get project operation');
        return await handleGetProject(jiraClient, normalizedArgs as ManageJiraProjectArgs);
      }
      
      case 'create': {
        console.error('Processing create project operation');
        return await handleCreateProject(jiraClient, normalizedArgs as ManageJiraProjectArgs);
      }
      
      case 'update': {
        console.error('Processing update project operation');
        return await handleUpdateProject(jiraClient, normalizedArgs as ManageJiraProjectArgs);
      }
      
      case 'delete': {
        console.error('Processing delete project operation');
        return await handleDeleteProject(jiraClient, normalizedArgs as ManageJiraProjectArgs);
      }
      
      case 'list': {
        console.error('Processing list projects operation');
        return await handleListProjects(jiraClient, normalizedArgs as ManageJiraProjectArgs);
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
