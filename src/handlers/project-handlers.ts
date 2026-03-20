import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { fieldDiscovery } from '../client/field-discovery.js';
import { JiraClient } from '../client/jira-client.js';
import { MarkdownRenderer, ProjectData } from '../mcp/markdown-renderer.js';
import { projectNextSteps } from '../utils/next-steps.js';
import { normalizeArgs } from '../utils/normalize-args.js';

type ManageJiraProjectArgs = {
  operation: 'get' | 'list';
  projectKey?: string;
  startAt?: number;
  maxResults?: number;
  expand?: string[];
  includeStatusCounts?: boolean;
};


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
      !['get', 'list'].includes(normalizedArgs.operation as string)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid operation parameter. Valid values are: get, list'
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
  const includeStatusCounts = args.includeStatusCounts !== false; // Default to true
  
  // Parse expansion options
  const expansionOptions: Record<string, boolean> = {};
  if (args.expand) {
    for (const expansion of args.expand) {
      expansionOptions[expansion] = true;
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
    key: project.key,
    name: project.name,
    description: project.description || undefined,
    lead: project.lead || undefined,
  };

  // Fetch issue types (always — essential context for creating issues)
  try {
    const issueTypes = await fieldDiscovery.getIssueTypes(jiraClient.v3Client, projectKey);
    if (issueTypes.length > 0) {
      projectData.issueTypes = issueTypes.map(t => ({ name: t.name, subtask: t.subtask }));
    }
  } catch {
    // Non-fatal — continue without issue types
  }

  // If status counts are requested, get them
  if (includeStatusCounts) {
    try {
      // Get issue counts by status for this project
      const searchResult = await jiraClient.searchIssues(`project = ${projectKey}`, 0, 100);

      // Count issues by status
      const statusCounts: Record<string, number> = {};
      for (const issue of searchResult.issues) {
        const status = issue.status;
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }

      projectData.statusCounts = statusCounts;
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
      projectData.recentIssues = searchResult.issues.map(issue => ({
        key: issue.key,
        summary: issue.summary,
        status: issue.status
      }));
    } catch (error) {
      console.error(`Error getting recent issues for project ${projectKey}:`, error);
      // Continue even if recent issues fail
    }
  }

  // Render to markdown
  const markdown = MarkdownRenderer.renderProject({
    key: projectData.key,
    name: projectData.name,
    description: projectData.description,
    lead: projectData.lead,
    issueTypes: projectData.issueTypes,
    statusCounts: projectData.statusCounts,
    boards: projectData.boards,
    recentIssues: projectData.recentIssues,
  });

  return {
    content: [
      {
        type: 'text',
        text: markdown + projectNextSteps('get', projectKey),
      },
    ],
  };
}


async function handleListProjects(jiraClient: JiraClient, args: ManageJiraProjectArgs) {
  // Set default pagination values
  const startAt = args.startAt !== undefined ? args.startAt : 0;
  const maxResults = args.maxResults !== undefined ? args.maxResults : 50;
  const includeStatusCounts = args.includeStatusCounts === true;
  
  // Get all projects
  const projects = await jiraClient.listProjects();
  
  // Apply pagination
  const paginatedProjects = projects.slice(startAt, startAt + maxResults);
  
  // Convert to ProjectData format
  const projectDataList: ProjectData[] = paginatedProjects.map(project => ({
    key: project.key,
    name: project.name,
    description: project.description || undefined,
    lead: project.lead || undefined,
  }));

  // If status counts are requested, get them for each project
  if (includeStatusCounts) {
    // This would be more efficient with a batch API call, but for now we'll do it sequentially
    for (const project of projectDataList) {
      try {
        // Get issue counts by status for this project
        const searchResult = await jiraClient.searchIssues(`project = ${project.key}`, 0, 100);

        // Count issues by status
        const statusCounts: Record<string, number> = {};
        for (const issue of searchResult.issues) {
          const status = issue.status;
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        }

        project.statusCounts = statusCounts;
      } catch (error) {
        console.error(`Error getting status counts for project ${project.key}:`, error);
        // Continue with other projects even if one fails
      }
    }
  }

  // Render to markdown with pagination
  const rendererProjects = projectDataList.map(project => ({
    key: project.key,
    name: project.name,
    description: project.description,
    lead: project.lead,
    statusCounts: project.statusCounts,
  }));

  // Render to markdown with pagination
  let markdown = MarkdownRenderer.renderProjectList(rendererProjects);

  // Add pagination guidance
  markdown += '\n\n---\n';
  if (startAt + maxResults < projects.length) {
    markdown += `Showing ${startAt + 1}-${startAt + projectDataList.length} of ${projects.length}\n`;
    markdown += `**Next page:** Use startAt=${startAt + maxResults}`;
  } else {
    markdown += `Showing all ${projectDataList.length} project${projectDataList.length !== 1 ? 's' : ''}`;
  }

  markdown += projectNextSteps('list');

  return {
    content: [
      {
        type: 'text',
        text: markdown,
      },
    ],
  };
}


// Main handler function
export async function handleProjectRequest(
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
