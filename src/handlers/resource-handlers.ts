import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from '../client/jira-client.js';

/**
 * Sets up resource handlers for the Jira MCP server
 * @param jiraClient The Jira client instance
 * @returns Object containing resource handlers
 */
export function setupResourceHandlers(jiraClient: JiraClient) {
  return {
    /**
     * Lists available static resources
     */
    async listResources() {
      return {
        resources: [
          {
            uri: 'jira://instance/summary',
            name: 'Jira Instance Summary',
            mimeType: 'application/json',
            description: 'High-level statistics about the Jira instance'
          },
          {
            uri: 'jira://projects/distribution',
            name: 'Project Distribution',
            mimeType: 'application/json',
            description: 'Distribution of projects by type and status'
          },
          {
            uri: 'jira://issue-link-types',
            name: 'Issue Link Types',
            mimeType: 'application/json',
            description: 'List of all available issue link types in the Jira instance'
          }
        ]
      };
    },

    /**
     * Lists available resource templates
     */
    async listResourceTemplates() {
      return {
        resourceTemplates: [
          {
            uriTemplate: 'jira://projects/{projectKey}/overview',
            name: 'Project Overview',
            mimeType: 'application/json',
            description: 'Overview of a specific project including metadata and statistics'
          },
          {
            uriTemplate: 'jira://boards/{boardId}/overview',
            name: 'Board Overview',
            mimeType: 'application/json',
            description: 'Overview of a specific board including sprints and statistics'
          }
        ]
      };
    },

    /**
     * Handles resource read requests
     */
    async readResource(uri: string) {
      console.error(`Reading resource: ${uri}`);
      
      try {
        // Handle static resources
        if (uri === 'jira://instance/summary') {
          return await getInstanceSummary(jiraClient);
        }
        
        if (uri === 'jira://projects/distribution') {
          return await getProjectDistribution(jiraClient);
        }
        
        if (uri === 'jira://issue-link-types') {
          return await getIssueLinkTypes(jiraClient);
        }
        
        // Handle resource templates
        const projectMatch = uri.match(/^jira:\/\/projects\/([^/]+)\/overview$/);
        if (projectMatch) {
          const projectKey = projectMatch[1];
          return await getProjectOverview(jiraClient, projectKey);
        }
        
        const boardMatch = uri.match(/^jira:\/\/boards\/(\d+)\/overview$/);
        if (boardMatch) {
          const boardId = parseInt(boardMatch[1], 10);
          return await getBoardOverview(jiraClient, boardId);
        }
        
        throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
      } catch (error) {
        console.error(`Error reading resource ${uri}:`, error);
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Error reading resource: ${(error as Error).message}`
        );
      }
    }
  };
}

/**
 * Gets a summary of the Jira instance
 */
async function getInstanceSummary(jiraClient: JiraClient) {
  try {
    // Get projects
    const projects = await jiraClient.listProjects();
    
    // Get boards
    const boards = await jiraClient.listBoards();
    
    // Get active sprints for each board (limited to first 5 boards for performance)
    const sprints = (await Promise.all(
      boards.slice(0, 5).map(board => 
        jiraClient.listBoardSprints(board.id)
          .catch(() => []) // Ignore errors for individual boards
      )
    )).flat();
    
    // Get project types distribution
    const projectTypes: Record<string, number> = {};
    projects.forEach(project => {
      const projectType = project.key.includes('SD') ? 'service_desk' : 'software';
      projectTypes[projectType] = (projectTypes[projectType] || 0) + 1;
    });
    
    // Format the response
    const summary = {
      totalProjects: projects.length,
      totalBoards: boards.length,
      activeSprintsCount: sprints.filter(s => s.state === 'active').length,
      projectTypes,
      recentActivity: {
        timestamp: new Date().toISOString()
      }
    };
    
    return {
      contents: [
        {
          uri: 'jira://instance/summary',
          mimeType: 'application/json',
          text: JSON.stringify(summary, null, 2)
        }
      ]
    };
  } catch (error) {
    console.error('Error getting instance summary:', error);
    throw error;
  }
}

/**
 * Gets the distribution of projects
 */
async function getProjectDistribution(jiraClient: JiraClient) {
  try {
    // Get projects
    const projects = await jiraClient.listProjects();
    
    // Calculate distributions
    const distribution = {
      byType: {} as Record<string, number>,
      byLead: {} as Record<string, number>,
      total: projects.length
    };
    
    // Calculate type distribution
    projects.forEach(project => {
      const projectType = project.key.includes('SD') ? 'service_desk' : 'software';
      distribution.byType[projectType] = (distribution.byType[projectType] || 0) + 1;
    });
    
    // Calculate lead distribution
    projects.forEach(project => {
      if (project.lead) {
        distribution.byLead[project.lead] = (distribution.byLead[project.lead] || 0) + 1;
      }
    });
    
    return {
      contents: [
        {
          uri: 'jira://projects/distribution',
          mimeType: 'application/json',
          text: JSON.stringify(distribution, null, 2)
        }
      ]
    };
  } catch (error) {
    console.error('Error getting project distribution:', error);
    throw error;
  }
}

/**
 * Gets an overview of a specific project
 */
async function getProjectOverview(jiraClient: JiraClient, projectKey: string) {
  try {
    // Get projects to find the one we want
    const projects = await jiraClient.listProjects();
    const project = projects.find(p => p.key === projectKey);
    
    if (!project) {
      throw new McpError(ErrorCode.InvalidRequest, `Project not found: ${projectKey}`);
    }
    
    // Get issues for this project (limited to 10 for performance)
    const searchResponse = await jiraClient.searchIssues(`project = ${projectKey}`, 0, 10);
    
    // Get status distribution
    const statusDistribution: Record<string, number> = {};
    searchResponse.issues.forEach(issue => {
      if (issue.status) {
        statusDistribution[issue.status] = (statusDistribution[issue.status] || 0) + 1;
      }
    });
    
    // Format the response
    const overview = {
      key: project.key,
      name: project.name,
      description: project.description,
      lead: project.lead,
      url: project.url,
      issueCount: searchResponse.pagination.total,
      statusDistribution,
      recentIssues: searchResponse.issues.map(issue => ({
        key: issue.key,
        summary: issue.summary,
        status: issue.status
      }))
    };
    
    return {
      contents: [
        {
          uri: `jira://projects/${projectKey}/overview`,
          mimeType: 'application/json',
          text: JSON.stringify(overview, null, 2)
        }
      ]
    };
  } catch (error) {
    console.error(`Error getting project overview for ${projectKey}:`, error);
    throw error;
  }
}

/**
 * Gets an overview of a specific board
 */
async function getBoardOverview(jiraClient: JiraClient, boardId: number) {
  try {
    // Get boards to find the one we want
    const boards = await jiraClient.listBoards();
    const board = boards.find(b => b.id === boardId);
    
    if (!board) {
      throw new McpError(ErrorCode.InvalidRequest, `Board not found: ${boardId}`);
    }
    
    // Get sprints for this board
    const sprints = await jiraClient.listBoardSprints(boardId);
    
    // Format the response
    const overview = {
      id: board.id,
      name: board.name,
      type: board.type,
      location: board.location,
      sprints: sprints.map(sprint => ({
        id: sprint.id,
        name: sprint.name,
        state: sprint.state,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        goal: sprint.goal
      }))
    };
    
    return {
      contents: [
        {
          uri: `jira://boards/${boardId}/overview`,
          mimeType: 'application/json',
          text: JSON.stringify(overview, null, 2)
        }
      ]
    };
  } catch (error) {
    console.error(`Error getting board overview for ${boardId}:`, error);
    throw error;
  }
}

/**
 * Gets all available issue link types
 */
async function getIssueLinkTypes(jiraClient: JiraClient) {
  try {
    // Get all issue link types
    const linkTypes = await jiraClient.getIssueLinkTypes();
    
    // Format the response with usage examples
    const formattedLinkTypes = linkTypes.map(linkType => ({
      id: linkType.id,
      name: linkType.name,
      inward: linkType.inward,
      outward: linkType.outward,
      usage: {
        description: `Use this link type to establish a "${linkType.outward}" relationship from one issue to another.`,
        example: `When issue A ${linkType.outward} issue B, then issue B ${linkType.inward} issue A.`
      }
    }));
    
    return {
      contents: [
        {
          uri: 'jira://issue-link-types',
          mimeType: 'application/json',
          text: JSON.stringify({
            linkTypes: formattedLinkTypes,
            count: formattedLinkTypes.length,
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    console.error('Error getting issue link types:', error);
    throw error;
  }
}
