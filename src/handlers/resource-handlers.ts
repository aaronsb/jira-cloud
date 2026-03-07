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

## Foundation Rules

- **Always start with cube_setup** on unfamiliar JQL before committing to a query. It tells you what dimensions exist, how many distinct values each has, and estimates query cost. Think of it as DESCRIBE TABLE before a SQL query.
- **\`metrics: ["summary"] + groupBy: "project"\` is your default opening move.** It's exact (no sampling cap), fast, and gives you a cross-project comparison in one call. Use everything else to drill down after.
- **The \`distribution\` metric is rich but capped at 500 issues.** Only use it scoped to a single project, never cross-project. Mixing it into a broad query will silently undersample.
- **\`manage_jira_project\` issue counts cap at 100** — never use it for actual counts, only for metadata. \`analyze_jira_issues\` with \`metrics: ["summary"]\` is always more accurate.

## Core Recipes

### Org-wide Health Snapshot
**Question:** Which projects are busiest / most at-risk?
\`\`\`json
{ "jql": "project in (...) AND resolution = Unresolved", "metrics": ["summary"], "groupBy": "project", "compute": ["overdue_pct = overdue / open * 100", "high_pct = high / open * 100", "clearing = resolved_7d > created_7d", "planning_gap = no_due_date / open * 100"] }
\`\`\`
One query, full picture. The \`clearing\` boolean immediately flags which projects are accumulating debt.

### Net Flow / Velocity
**Question:** Are we resolving faster than creating?
\`\`\`json
{ "jql": "project in (...) AND (created >= -7d OR resolved >= -7d)", "metrics": ["summary"], "groupBy": "project", "compute": ["net_flow = resolved_7d - created_7d", "clearing = resolved_7d > created_7d"] }
\`\`\`
Positive net_flow = clearing, negative = accumulating. The OR condition in JQL ensures you capture both sides of the ledger.

### Team Workload Scorecard
**Question:** Who is overloaded or under-tracked?
\`\`\`json
{ "jql": "project in (...) AND resolution = Unresolved AND assignee is not EMPTY", "metrics": ["summary"], "groupBy": "assignee", "compute": ["overdue_pct = overdue / open * 100", "high_pct = high / open * 100", "no_dates = no_due_date / open * 100"] }
\`\`\`
The \`no_dates\` column is the secret ingredient — it distinguishes "this person is behind" from "this person has no dates set so overdue looks artificially low." Scope to 2-3 projects max.

### Planning Gap Detector
**Question:** Where is risk invisible?
\`\`\`json
{ "jql": "resolution = Unresolved AND dueDate is EMPTY", "metrics": ["summary"], "groupBy": "project" }
\`\`\`
Projects with high-priority open issues and no due dates aren't "on time" — they're untracked. Don't trust overdue numbers in projects with high planning gap.

### Stale Backlog Grooming Target
**Question:** What needs a decision?
\`\`\`json
{ "jql": "status = Backlog AND created <= -90d", "metrics": ["summary"], "groupBy": "project" }
\`\`\`
Anything sitting in Backlog 90+ days with no movement is a decision waiting to happen. Pair with \`manage_jira_filter\` execute_jql to get the actual list for a grooming session.

### Unowned + Urgent (Danger Combo)
**Question:** What's high priority with no owner?
\`\`\`json
{ "jql": "resolution = Unresolved AND assignee is EMPTY AND priority in (High, Highest)", "metrics": ["summary"], "groupBy": "project" }
\`\`\`
This should always return zero. When it doesn't, it's the most actionable finding in the entire system.

### Blocked Issue Sweep
**Question:** What's stuck?
Use \`manage_jira_filter\` with \`execute_jql\` for this one:
\`\`\`json
{ "operation": "execute_jql", "jql": "status = Blocked ORDER BY created ASC" }
\`\`\`
Blocked lists tend to be small but each one is a potential cascade. Oldest first surfaces the longest-stuck items for escalation.

## Data Cube

For multi-dimensional analysis, use the two-phase cube pattern:

### Phase 1: Discover dimensions
\`\`\`json
{ "jql": "project in (...) AND resolution = Unresolved", "metrics": ["cube_setup"] }
\`\`\`
Returns available dimensions, their values, cost estimates, and query budget.

### Phase 2: Execute with computed columns
\`\`\`json
{ "jql": "project in (...) AND resolution = Unresolved", "metrics": ["summary"], "groupBy": "project", "compute": ["bug_pct = bugs / total * 100", "net_flow = created_7d - resolved_7d", "clearing = resolved_7d > created_7d"] }
\`\`\`

### Compute DSL Reference
- Arithmetic: \`+\`, \`-\`, \`*\`, \`/\` (division by zero = 0)
- Comparisons: \`>\`, \`<\`, \`>=\`, \`<=\`, \`==\`, \`!=\` (produce Yes/No — cannot be summed or averaged)
- Standard columns: total, open, overdue, high, created_7d, resolved_7d
- Implicit measures (lazily resolved via count API): bugs, unassigned, no_due_date, no_estimate, no_start_date, no_labels, blocked
- Max 5 expressions per query, 150-query budget per execution
- Expressions evaluate linearly — later expressions can reference earlier ones

## Gotchas

- **\`groupBy: "assignee"\` on large JQL will error.** Scope to 2-3 projects at a time.
- **Don't trust overdue in projects with high planning_gap.** If 100% of issues have no due date, overdue = 0 is meaningless, not good news.
- **Boolean computed columns (Yes/No) can't be summed or averaged.** Don't try to build a ratio on top of one.
- **\`resolved >= -7d\` is the reliable resolution window.** The Resolved 7d column in summary derives from this same window.
- **Use \`cube_setup\` first** to discover dimensions, then \`summary\` + \`groupBy\` + \`compute\` to execute.
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
