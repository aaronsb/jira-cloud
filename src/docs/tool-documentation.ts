/**
 * Tool documentation generators.
 * Each function returns a structured documentation object for an MCP tool resource.
 */

export function formatToolName(toolName: string): string {
  return toolName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const documentationGenerators: Record<string, (schema: any) => any> = {
  manage_jira_issue: generateIssueToolDocumentation,
  manage_jira_board: generateBoardToolDocumentation,
  manage_jira_sprint: generateSprintToolDocumentation,
  manage_jira_filter: generateFilterToolDocumentation,
  manage_jira_project: generateProjectToolDocumentation,
};

export function generateToolDocumentation(toolName: string, schema: any): any {
  const generator = documentationGenerators[toolName];
  if (generator) {
    return generator(schema);
  }
  return generateGenericToolDocumentation(toolName, schema);
}

function generateIssueToolDocumentation(schema: any) {
  return {
    name: "Issue Management",
    description: schema.description,
    operations: {
      get: {
        description: "Retrieves issue details",
        required_parameters: ["issueKey"],
        optional_parameters: ["expand"],
        expand_options: ["comments", "transitions", "attachments", "related_issues", "history"],
        examples: [
          {
            description: "Get basic issue details",
            code: { operation: "get", issueKey: "PROJ-123" }
          },
          {
            description: "Get issue with comments and attachments",
            code: { operation: "get", issueKey: "PROJ-123", expand: ["comments", "attachments"] }
          }
        ]
      },
      create: {
        description: "Creates a new issue",
        required_parameters: ["projectKey", "summary", "issueType"],
        optional_parameters: ["description", "assignee", "priority", "labels", "customFields"],
        examples: [
          {
            description: "Create a basic issue",
            code: { operation: "create", projectKey: "PROJ", summary: "New feature request", issueType: "Story" }
          },
          {
            description: "Create a detailed bug report",
            code: {
              operation: "create", projectKey: "PROJ", summary: "Search functionality not working",
              issueType: "Bug", description: "The search function returns no results when using special characters.",
              priority: "High", labels: ["search", "frontend"],
              customFields: { "Story Points": 5, "Team": "Platform" }
            }
          }
        ]
      },
      update: {
        description: "Updates an existing issue",
        required_parameters: ["issueKey"],
        optional_parameters: ["summary", "description", "assignee", "priority", "labels", "customFields"],
        examples: [
          {
            description: "Update issue summary",
            code: { operation: "update", issueKey: "PROJ-123", summary: "Updated feature request" }
          },
          {
            description: "Add worklog to issue",
            code: {
              operation: "update", issueKey: "PROJ-123",
              customFields: { "worklog": { "timeSpent": "3h 30m", "comment": "Implemented feature X", "started": "2025-04-09T09:00:00.000Z" } }
            }
          }
        ]
      },
      transition: {
        description: "Transitions an issue to a new status",
        required_parameters: ["issueKey", "transitionId"],
        optional_parameters: ["comment"],
        examples: [
          { description: "Transition issue to 'In Progress'", code: { operation: "transition", issueKey: "PROJ-123", transitionId: "11" } },
          { description: "Transition issue with comment", code: { operation: "transition", issueKey: "PROJ-123", transitionId: "21", comment: "Closing this issue as it's been completed and tested." } }
        ]
      },
      comment: {
        description: "Adds a comment to an issue",
        required_parameters: ["issueKey", "comment"],
        examples: [{ description: "Add a comment to an issue", code: { operation: "comment", issueKey: "PROJ-123", comment: "This has been reviewed and looks good." } }]
      },
      delete: {
        description: "Permanently deletes an issue",
        required_parameters: ["issueKey"],
        examples: [
          { description: "Delete an issue", code: { operation: "delete", issueKey: "PROJ-123" } }
        ]
      },
      move: {
        description: "Moves an issue to a different project and/or issue type",
        required_parameters: ["issueKey", "targetProjectKey", "targetIssueType"],
        examples: [
          { description: "Move issue to another project", code: { operation: "move", issueKey: "PROJ-123", targetProjectKey: "NEWPROJ", targetIssueType: "Task" } }
        ]
      },
      link: {
        description: "Creates a link between two issues",
        required_parameters: ["issueKey", "linkedIssueKey", "linkType"],
        examples: [
          { description: "Link issue as blocking another", code: { operation: "link", issueKey: "PROJ-123", linkedIssueKey: "PROJ-456", linkType: "blocks" } },
          { description: "Link issue to an epic", code: { operation: "link", issueKey: "PROJ-123", linkedIssueKey: "PROJ-100", linkType: "is part of" } }
        ]
      }
    },
    common_use_cases: [
      {
        title: "Tracking work logs",
        description: "To track time spent on issues:",
        steps: [
          { description: "Add a work log to an issue", code: { operation: "update", issueKey: "PROJ-123", customFields: { "worklog": { "timeSpent": "3h 30m", "comment": "Implemented feature X", "started": "2025-04-09T09:00:00.000Z" } } } },
          { description: "View work logs for an issue", code: { operation: "get", issueKey: "PROJ-123", expand: ["worklog"] } }
        ]
      },
      {
        title: "Working with attachments",
        description: "To manage attachments on issues:",
        steps: [{ description: "View attachments on an issue", code: { operation: "get", issueKey: "PROJ-123", expand: ["attachments"] } }]
      },
      {
        title: "Epic management",
        description: "To manage epics and their issues:",
        steps: [
          { description: "Link an issue to an epic", code: { operation: "link", issueKey: "PROJ-123", linkedIssueKey: "PROJ-100", linkType: "is part of" } },
          { description: "Find all issues in an epic", tool: "manage_jira_filter", code: { operation: "execute_jql", jql: '"Epic Link" = PROJ-100' } }
        ]
      }
    ],
    custom_fields: {
      description: "Custom fields are discovered automatically at startup. Use field names (not IDs) in the customFields parameter.",
      discovery: "Read jira://custom-fields to see the master catalog of discovered fields with types and descriptions.",
      context: "Read jira://custom-fields/{projectKey}/{issueType} to see fields valid for a specific project and issue type.",
      name_resolution: "Field names are resolved to IDs automatically — use human-readable names like 'Story Points', not 'customfield_10035'.",
      requirement: "Only fields with descriptions in Jira are discoverable. Fields without descriptions must use raw field IDs.",
    },
    related_resources: [
      { name: "Project Overview", uri: "jira://projects/{projectKey}/overview", description: "Get detailed information about a project" },
      { name: "Issue Link Types", uri: "jira://issue-link-types", description: "List of all available issue link types" },
      { name: "Custom Fields Catalog", uri: "jira://custom-fields", description: "Discovered custom fields with types, descriptions, and usage scores" },
      { name: "Context Custom Fields", uri: "jira://custom-fields/{projectKey}/{issueType}", description: "Custom fields available for a specific project and issue type" }
    ]
  };
}

function generateBoardToolDocumentation(schema: any) {
  return {
    name: "Board Management (Read-Only)",
    description: schema.description,
    operations: {
      get: {
        description: "Retrieves board details",
        required_parameters: ["boardId"], optional_parameters: ["expand"],
        expand_options: ["sprints", "issues", "configuration"],
        examples: [
          { description: "Get basic board details", code: { operation: "get", boardId: 123 } },
          { description: "Get board with sprints", code: { operation: "get", boardId: 123, expand: ["sprints"] } }
        ]
      },
      list: {
        description: "Lists all available boards",
        required_parameters: [], optional_parameters: ["maxResults", "startAt"],
        examples: [
          { description: "List all boards", code: { operation: "list" } },
          { description: "List boards with pagination", code: { operation: "list", startAt: 10, maxResults: 20 } }
        ]
      }
    },
    common_use_cases: [
      {
        title: "Working with board sprints",
        description: "To manage sprints on a board:",
        steps: [
          { description: "Get board with sprints", code: { operation: "get", boardId: 123, expand: ["sprints"] } },
          { description: "Create a new sprint", tool: "manage_jira_sprint", code: { operation: "create", boardId: 123, name: "Sprint 1", goal: "Complete core features" } }
        ]
      }
    ],
    related_resources: [
      { name: "Board Overview", uri: "jira://boards/{boardId}/overview", description: "Get detailed information about a board" }
    ]
  };
}

function generateSprintToolDocumentation(schema: any) {
  return {
    name: "Sprint Management",
    description: schema.description,
    operations: {
      get: {
        description: "Retrieves sprint details",
        required_parameters: ["sprintId"], optional_parameters: ["expand"],
        expand_options: ["issues", "report", "board"],
        examples: [
          { description: "Get basic sprint details", code: { operation: "get", sprintId: 123 } },
          { description: "Get sprint with issues", code: { operation: "get", sprintId: 123, expand: ["issues"] } }
        ]
      },
      list: {
        description: "Lists sprints for a board",
        required_parameters: ["boardId"], optional_parameters: ["state", "maxResults", "startAt"],
        examples: [
          { description: "List all sprints for a board", code: { operation: "list", boardId: 123 } },
          { description: "List active sprints for a board", code: { operation: "list", boardId: 123, state: "active" } }
        ]
      },
      create: {
        description: "Creates a new sprint",
        required_parameters: ["name", "boardId"], optional_parameters: ["startDate", "endDate", "goal"],
        examples: [
          { description: "Create a basic sprint", code: { operation: "create", name: "Sprint 1", boardId: 123 } },
          { description: "Create a sprint with dates and goal", code: { operation: "create", name: "Sprint 2", boardId: 123, startDate: "2025-04-10T00:00:00.000Z", endDate: "2025-04-24T00:00:00.000Z", goal: "Complete user authentication features" } }
        ]
      },
      update: {
        description: "Updates a sprint",
        required_parameters: ["sprintId"], optional_parameters: ["name", "goal", "state"],
        examples: [
          { description: "Update sprint name and goal", code: { operation: "update", sprintId: 123, name: "Sprint 1 - Revised", goal: "Updated sprint goal" } },
          { description: "Start a sprint", code: { operation: "update", sprintId: 123, state: "active" } },
          { description: "Close a sprint", code: { operation: "update", sprintId: 123, state: "closed" } }
        ]
      },
      delete: {
        description: "Deletes a sprint",
        required_parameters: ["sprintId"],
        examples: [{ description: "Delete a sprint", code: { operation: "delete", sprintId: 123 } }]
      },
      manage_issues: {
        description: "Adds/removes issues from a sprint",
        required_parameters: ["sprintId"], optional_parameters: ["add", "remove"],
        examples: [
          { description: "Add issues to a sprint", code: { operation: "manage_issues", sprintId: 123, add: ["PROJ-123", "PROJ-124", "PROJ-125"] } },
          { description: "Remove issues from a sprint", code: { operation: "manage_issues", sprintId: 123, remove: ["PROJ-126", "PROJ-127"] } },
          { description: "Add and remove issues in one operation", code: { operation: "manage_issues", sprintId: 123, add: ["PROJ-128", "PROJ-129"], remove: ["PROJ-130"] } }
        ]
      }
    },
    common_use_cases: [
      {
        title: "Sprint planning",
        description: "To plan and start a new sprint:",
        steps: [
          { description: "Create a new sprint", code: { operation: "create", name: "Sprint 1", boardId: 123, goal: "Complete core features" } },
          { description: "Add issues to the sprint", code: { operation: "manage_issues", sprintId: 456, add: ["PROJ-123", "PROJ-124", "PROJ-125"] } },
          { description: "Start the sprint", code: { operation: "update", sprintId: 456, state: "active" } }
        ]
      },
      {
        title: "Sprint review and closure",
        description: "To review and close a completed sprint:",
        steps: [
          { description: "Get sprint with issues", code: { operation: "get", sprintId: 456, expand: ["issues"] } },
          { description: "Close the sprint", code: { operation: "update", sprintId: 456, state: "closed" } }
        ]
      }
    ],
    related_resources: [
      { name: "Board Overview", uri: "jira://boards/{boardId}/overview", description: "Get detailed information about a board including its sprints" }
    ]
  };
}

function generateFilterToolDocumentation(schema: any) {
  return {
    name: "Filter Management",
    description: schema.description,
    operations: {
      get: {
        description: "Retrieves filter details",
        required_parameters: ["filterId"], optional_parameters: ["expand"],
        expand_options: ["jql", "description", "permissions", "issue_count"],
        examples: [
          { description: "Get basic filter details", code: { operation: "get", filterId: "12345" } },
          { description: "Get filter with JQL and permissions", code: { operation: "get", filterId: "12345", expand: ["jql", "permissions"] } }
        ]
      },
      create: {
        description: "Creates a new filter",
        required_parameters: ["name", "jql"], optional_parameters: ["description", "favourite", "sharePermissions"],
        examples: [
          { description: "Create a basic filter", code: { operation: "create", name: "My Issues", jql: "assignee = currentUser() AND status != Done" } },
          { description: "Create a shared filter", code: { operation: "create", name: "Team Bugs", jql: "project = PROJ AND issuetype = Bug AND status = Open", description: "All open bugs for our project", favourite: true, sharePermissions: [{ type: "group", group: "developers" }] } }
        ]
      },
      update: {
        description: "Updates a filter",
        required_parameters: ["filterId"], optional_parameters: ["name", "jql", "description", "favourite", "sharePermissions"],
        examples: [
          { description: "Update filter name and JQL", code: { operation: "update", filterId: "12345", name: "Updated Filter Name", jql: "project = PROJ AND status = 'In Progress'" } },
          { description: "Update filter sharing", code: { operation: "update", filterId: "12345", sharePermissions: [{ type: "global" }] } }
        ]
      },
      delete: {
        description: "Deletes a filter",
        required_parameters: ["filterId"],
        examples: [{ description: "Delete a filter", code: { operation: "delete", filterId: "12345" } }]
      },
      list: {
        description: "Lists all filters",
        required_parameters: [], optional_parameters: ["maxResults", "startAt"],
        examples: [
          { description: "List all filters", code: { operation: "list" } },
          { description: "List filters with pagination", code: { operation: "list", startAt: 10, maxResults: 20 } }
        ]
      },
      execute_filter: {
        description: "Runs a saved filter",
        required_parameters: ["filterId"], optional_parameters: ["maxResults", "startAt", "expand"],
        examples: [
          { description: "Execute a filter", code: { operation: "execute_filter", filterId: "12345" } },
          { description: "Execute a filter with expanded issue details", code: { operation: "execute_filter", filterId: "12345", maxResults: 100, expand: ["issue_details"] } }
        ]
      },
      execute_jql: {
        description: "Runs a JQL query",
        required_parameters: ["jql"], optional_parameters: ["maxResults", "startAt", "expand"],
        examples: [
          { description: "Execute a simple JQL query", code: { operation: "execute_jql", jql: "project = PROJ AND status = 'In Progress'" } },
          { description: "Execute a complex JQL query with expanded issue details", code: { operation: "execute_jql", jql: "project = PROJ AND issuetype = Bug AND priority in (High, Highest) ORDER BY created DESC", maxResults: 50, expand: ["issue_details", "transitions"] } }
        ]
      }
    },
    common_use_cases: [
      {
        title: "Creating and sharing team filters",
        description: "To create and share filters for team use:",
        steps: [
          { description: "Create a team filter", code: { operation: "create", name: "Team Backlog", jql: "project = PROJ AND status = 'To Do' ORDER BY priority DESC", description: "All backlog items for our team", sharePermissions: [{ type: "group", group: "developers" }] } },
          { description: "Execute the filter to verify results", code: { operation: "execute_filter", filterId: "12345" } }
        ]
      },
      {
        title: "Advanced JQL queries",
        description: "Examples of advanced JQL queries for specific use cases:",
        steps: [
          { description: "Find recently updated issues", code: { operation: "execute_jql", jql: "project = PROJ AND updated >= -7d ORDER BY updated DESC" } },
          { description: "Find issues with status changes", code: { operation: "execute_jql", jql: "project = PROJ AND status CHANGED DURING (startOfWeek(), endOfWeek())" } },
          { description: "Find issues assigned to a team", code: { operation: "execute_jql", jql: "project = PROJ AND assignee IN membersOf('developers')" } }
        ]
      }
    ],
    related_resources: [
      { name: "Issue Link Types", uri: "jira://issue-link-types", description: "List of all available issue link types for use in JQL queries" }
    ]
  };
}

function generateProjectToolDocumentation(schema: any) {
  return {
    name: "Project Management (Read-Only)",
    description: schema.description,
    operations: {
      get: {
        description: "Retrieves project details",
        required_parameters: ["projectKey"], optional_parameters: ["expand"],
        expand_options: ["boards", "components", "versions", "recent_issues"],
        examples: [
          { description: "Get basic project details", code: { operation: "get", projectKey: "PROJ" } },
          { description: "Get project with boards and components", code: { operation: "get", projectKey: "PROJ", expand: ["boards", "components"] } }
        ]
      },
      list: {
        description: "Lists all projects",
        required_parameters: [], optional_parameters: ["maxResults", "startAt"],
        examples: [
          { description: "List all projects", code: { operation: "list" } },
          { description: "List projects with pagination", code: { operation: "list", startAt: 10, maxResults: 20 } }
        ]
      }
    },
    common_use_cases: [
      {
        title: "Project reporting",
        description: "To get project statistics and reports:",
        steps: [
          { description: "Get project details with status counts", code: { operation: "get", projectKey: "PROJ", include_status_counts: true } },
          { description: "Get all issues in a project", tool: "manage_jira_filter", code: { operation: "execute_jql", jql: "project = PROJ ORDER BY created DESC" } }
        ]
      }
    ],
    related_resources: [
      { name: "Project Overview", uri: "jira://projects/{projectKey}/overview", description: "Get detailed information about a project" }
    ]
  };
}

function generateGenericToolDocumentation(toolName: string, schema: any) {
  const operations: Record<string, any> = {};

  if (schema.inputSchema?.properties?.operation?.enum) {
    for (const op of schema.inputSchema.properties.operation.enum) {
      operations[op] = {
        description: `Performs the ${op} operation`,
        required_parameters: ["operation"],
        examples: [{ description: `Example ${op} operation`, code: { operation: op } }]
      };
    }
  }

  return {
    name: formatToolName(toolName),
    description: schema.description,
    operations,
    common_use_cases: [],
    related_resources: []
  };
}
