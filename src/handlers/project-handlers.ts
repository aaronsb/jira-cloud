import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from '../client/jira-client.js';
import { ProjectData, ProjectExpansionOptions, ProjectFormatter } from '../utils/formatters/index.js';

type GetProjectArgs = {
  projectKey: string;
  expand?: string[];
  include_status_counts?: boolean;
};

type ListProjectsArgs = {
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
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

function isGetProjectArgs(args: unknown): args is GetProjectArgs {
  if (typeof args !== 'object' || args === null) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid get_jira_project arguments: Expected an object with a projectKey parameter. Example: { "projectKey": "PROJ" } or { "project_key": "PROJ" }`
    );
  }

  const normalizedArgs = normalizeArgs(args as Record<string, unknown>);
  
  if (typeof normalizedArgs.projectKey !== 'string') {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Missing or invalid projectKey parameter. Please provide a valid project key using either "projectKey" or "project_key". Example: { "projectKey": "PROJ" }`
    );
  }

  // Validate project key format (e.g., PROJ)
  if (!/^[A-Z][A-Z0-9_]+$/.test(normalizedArgs.projectKey as string)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid project key format. Expected format: PROJ`
    );
  }
  
  // Validate expand parameter if present
  const typedArgs = normalizedArgs as GetProjectArgs;
  if (typedArgs.expand !== undefined) {
    if (!Array.isArray(typedArgs.expand)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid expand parameter. Expected an array of strings.'
      );
    }
    
    const validExpansions = ['boards', 'components', 'versions', 'recent_issues'];
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

function isListProjectsArgs(args: unknown): args is ListProjectsArgs {
  if (typeof args !== 'object' || args === null) {
    return false;
  }
  
  const normalizedArgs = normalizeArgs(args as Record<string, unknown>);
  
  if (normalizedArgs.includeStatusCounts !== undefined && 
      typeof normalizedArgs.includeStatusCounts !== 'boolean') {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid include_status_counts parameter. Expected a boolean value.'
    );
  }
  
  return true;
}

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

  // Normalize arguments to support both snake_case and camelCase
  const normalizedArgs = normalizeArgs(args);

  switch (name) {
    case 'list_jira_projects': {
      console.error('Processing list_jira_projects request');
      try {
        if (!isListProjectsArgs(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid list_jira_projects arguments');
        }
        
        const includeStatusCounts = normalizedArgs.include_status_counts === true;
        
        // Get all projects
        const projects = await jiraClient.listProjects();
        
        // Convert to ProjectData format
        const projectDataList: ProjectData[] = projects.map(project => ({
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
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(formattedProjects, null, 2),
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
    
    case 'get_jira_project': {
      console.error('Processing get_jira_project request');
      try {
        if (!isGetProjectArgs(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid get_jira_project arguments');
        }
        
        const projectKey = normalizedArgs.projectKey as string;
        const includeStatusCounts = normalizedArgs.include_status_counts !== false; // Default to true
        
        // Parse expansion options
        const expansionOptions: ProjectExpansionOptions = {};
        if (normalizedArgs.expand) {
          for (const expansion of normalizedArgs.expand as string[]) {
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
      } catch (error) {
        console.error('Error in get_jira_project:', error);
        if (error instanceof Error) {
          throw new McpError(ErrorCode.InvalidRequest, `Jira API error: ${error.message}`);
        }
        throw new McpError(ErrorCode.InvalidRequest, 'Failed to get project');
      }
    }

    default: {
      console.error(`Unknown tool requested: ${name}`);
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  }
}
