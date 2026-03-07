import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

import { setupToolResourceHandlers } from './tool-resource-handlers.js';
import { fieldDiscovery } from '../client/field-discovery.js';
import { categoryLabel } from '../client/field-type-map.js';
import { JiraClient } from '../client/jira-client.js';

/**
 * Sets up resource handlers for the Jira MCP server
 * @param jiraClient The Jira client instance
 * @returns Object containing resource handlers
 */
export function setupResourceHandlers(jiraClient: JiraClient) {
  const toolResourceHandler = setupToolResourceHandlers();

  return {
    /**
     * Lists available static resources
     */
    async listResources() {
      const toolResources = await toolResourceHandler.listToolResources();
      
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
          },
          {
            uri: 'jira://custom-fields',
            name: 'Custom Fields Catalog',
            mimeType: 'application/json',
            description: 'Discovered custom fields ranked by usage — names, types, descriptions, writability'
          },
          {
            uri: 'jira://analysis/recipes',
            name: 'Analysis Query Recipes',
            mimeType: 'text/markdown',
            description: 'Composition patterns for analyze_jira_issues — how to combine summary counts, groupBy, and JQL for PM dashboards'
          },
          // Add tool resources
          ...toolResources.resources
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
          },
          {
            uriTemplate: 'jira://custom-fields/{projectKey}/{issueType}',
            name: 'Context-Specific Custom Fields',
            mimeType: 'application/json',
            description: 'Custom fields available for a specific project and issue type combination'
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

        if (uri === 'jira://custom-fields') {
          return getCustomFieldsCatalog();
        }

        if (uri === 'jira://analysis/recipes') {
          return getAnalysisRecipes();
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
        
        // Handle context-specific custom fields
        const customFieldsMatch = uri.match(/^jira:\/\/custom-fields\/([^/]+)\/(.+)$/);
        if (customFieldsMatch) {
          const projectKey = customFieldsMatch[1];
          const issueType = decodeURIComponent(customFieldsMatch[2]);
          return await getContextCustomFields(jiraClient, projectKey, issueType);
        }

        // Handle tool resources
        const toolMatch = uri.match(/^jira:\/\/tools\/([^/]+)\/documentation$/);
        if (toolMatch) {
          return await toolResourceHandler.readToolResource(uri);
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
    
    const summary = {
      totalProjects: projects.length,
      totalBoards: boards.length,
      activeSprintsCount: sprints.filter(s => s.state === 'active').length,
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
    
    const distribution = {
      byLead: {} as Record<string, number>,
      total: projects.length
    };

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
 * Gets the master custom fields catalog
 */
function getCustomFieldsCatalog() {
  const catalog = fieldDiscovery.getCatalog();
  const stats = fieldDiscovery.getStats();

  const fields = catalog.map(f => ({
    id: f.id,
    name: f.name,
    description: f.description,
    type: categoryLabel(f.category),
    writable: f.writable,
    screensCount: f.screensCount,
    lastUsed: f.lastUsed,
    score: f.score,
  }));

  const response: Record<string, unknown> = {
    status: fieldDiscovery.isReady() ? 'ready' : 'loading',
    fields,
    count: fields.length,
  };

  if (stats) {
    response.stats = {
      totalCustomFields: stats.totalCustomFields,
      catalogSize: stats.catalogSize,
      excludedNoDescription: stats.excludedNoDescription,
      excludedNoScreens: stats.excludedNoScreens,
      excludedUnsupportedType: stats.excludedUnsupportedType,
      excludedLocked: stats.excludedLocked,
      undescribedRatio: Math.round(stats.undescribedRatio * 100),
    };
  }

  if (fieldDiscovery.getError()) {
    response.error = fieldDiscovery.getError();
  }

  return {
    contents: [{
      uri: 'jira://custom-fields',
      mimeType: 'application/json',
      text: JSON.stringify(response, null, 2),
    }],
  };
}

/**
 * Gets custom fields available for a specific project + issue type (context intersection)
 */
async function getContextCustomFields(jiraClient: JiraClient, projectKey: string, issueType: string) {
  const fields = await fieldDiscovery.getContextFields(
    jiraClient.v3Client,
    projectKey,
    issueType,
  );

  const result = fields.map(f => ({
    id: f.id,
    name: f.name,
    description: f.description,
    type: categoryLabel(f.category),
    jsonSchema: f.jsonSchema,
  }));

  return {
    contents: [{
      uri: `jira://custom-fields/${projectKey}/${encodeURIComponent(issueType)}`,
      mimeType: 'application/json',
      text: JSON.stringify({
        projectKey,
        issueType,
        fields: result,
        count: result.length,
        catalogReady: fieldDiscovery.isReady(),
      }, null, 2),
    }],
  };
}

/**
 * Returns analysis query recipes — composition patterns for the analyze_jira_issues tool
 */
function getAnalysisRecipes() {
  const markdown = `# Analysis Query Recipes

## Two Layers

Stack these for magnitude + detail:

1. **Count layer** — \`analyze_jira_issues\` with \`metrics: ["summary"]\` + \`groupBy: "project"\` → exact counts, no cap
2. **Detail layer** — \`analyze_jira_issues\` with other metrics, or \`manage_jira_filter\` execute_jql → individual issues

## Recipes

### Project Health Snapshot
**Question:** Which projects are busiest / most at-risk?
\`\`\`json
{ "jql": "project in (AA, LGS, GD, GC) AND resolution = Unresolved", "metrics": ["summary"], "groupBy": "project" }
\`\`\`

### Net Flow / Velocity
**Question:** Are we resolving faster than creating?
Run two summary queries and subtract:
- \`created >= -7d\` with \`groupBy: "project"\` → created this week
- \`resolved >= -7d\` with \`groupBy: "project"\` → resolved this week
Net = created - resolved. Positive = growing backlog. Negative = clearing.

### Bug Ratio
**Question:** How much open work is bugs vs planned?
\`\`\`json
{ "jql": "issuetype = Bug AND resolution = Unresolved", "metrics": ["summary"], "groupBy": "project" }
\`\`\`

### Overdue Breakdown
**Question:** Where are we most behind?
\`\`\`json
{ "jql": "resolution = Unresolved AND dueDate < now()", "metrics": ["summary"], "groupBy": "project" }
\`\`\`

### Deadline Pressure Window
**Question:** What's due in the next 2 weeks?
\`\`\`json
{ "jql": "resolution = Unresolved AND dueDate >= now() AND dueDate <= 14d", "metrics": ["summary"], "groupBy": "project" }
\`\`\`

### Stale Backlog
**Question:** How much backlog needs grooming?
\`\`\`json
{ "jql": "status = Backlog AND created <= -90d", "metrics": ["summary"], "groupBy": "project" }
\`\`\`

### Ownership Gaps
**Question:** What has no owner?
\`\`\`json
{ "jql": "resolution = Unresolved AND assignee is EMPTY", "metrics": ["summary"], "groupBy": "project" }
\`\`\`

### Planning Coverage
**Question:** How much work has no due date?
\`\`\`json
{ "jql": "resolution = Unresolved AND dueDate is EMPTY", "metrics": ["summary"], "groupBy": "project" }
\`\`\`

## Key Patterns

- \`groupBy: "project"\` turns any query into a cross-project comparison table with exact counts
- Two summary queries = velocity (created vs resolved over same window)
- \`dueDate is EMPTY\` surfaces planning gaps that overdue queries miss
- \`assignee is EMPTY AND priority in (High, Highest)\` = high-priority work with no owner (most actionable)
- Use \`summary\` for cross-project scope, then \`distribution\`/\`schedule\` per-project for detail
`;

  return {
    contents: [{
      uri: 'jira://analysis/recipes',
      mimeType: 'text/markdown',
      text: markdown,
    }],
  };
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
