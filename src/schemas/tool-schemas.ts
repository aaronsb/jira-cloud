export const toolSchemas = {
  // Enhanced Issue API
  get_jira_issue: {
    name: 'get_jira_issue',
    description: 'Get comprehensive information about a Jira issue with optional expansions',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., WORK-123). Can also use snake_case "issue_key".',
        },
        expand: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['comments', 'transitions', 'attachments', 'related_issues', 'history'],
          },
          description: 'Optional fields to include in the response',
        },
      },
      required: ['issueKey'],
    },
  },

  // Enhanced Project API
  get_jira_project: {
    name: 'get_jira_project',
    description: 'Get comprehensive information about a Jira project with optional expansions',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: {
          type: 'string',
          description: 'The Jira project key (e.g., PROJ). Can also use snake_case "project_key".',
        },
        expand: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['boards', 'components', 'versions', 'recent_issues'],
          },
          description: 'Optional fields to include in the response',
        },
        include_status_counts: {
          type: 'boolean',
          description: 'Whether to include issue counts by status',
          default: true,
        },
      },
      required: ['projectKey'],
    },
  },

  // Enhanced Board API
  get_jira_board: {
    name: 'get_jira_board',
    description: 'Get comprehensive information about a Jira board with optional expansions',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: {
          type: 'integer',
          description: 'The ID of the board. Can also use snake_case "board_id".',
        },
        expand: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['sprints', 'issues', 'configuration'],
          },
          description: 'Optional fields to include in the response',
        },
      },
      required: ['boardId'],
    },
  },

  // Enhanced Search API
  search_jira_issues: {
    name: 'search_jira_issues',
    description: 'Search for issues using JQL with enhanced results and optional expansions',
    inputSchema: {
      type: 'object',
      properties: {
        jql: {
          type: 'string',
          description: 'JQL query string. Supports a wide range of search patterns:\n\n' +
            '# Portfolio/Plans Queries\n' +
            '- Find child issues: issue in portfolioChildIssuesOf("PROJ-123")\n' +
            '- Combined portfolio search: issue in portfolioChildIssuesOf("PROJ-123") AND status = "In Progress"\n' +
            '- Multiple portfolios: issue in portfolioChildIssuesOf("PROJ-123") OR issue in portfolioChildIssuesOf("PROJ-456")\n\n' +
            '# Common Search Patterns\n' +
            '- Assigned issues: assignee = currentUser()\n' +
            '- Unassigned issues: assignee IS EMPTY\n' +
            '- Recent changes: status CHANGED AFTER -1w\n' +
            '- Multiple statuses: status IN ("In Progress", "Under Review", "Testing")\n' +
            '- Priority tasks: priority = High AND status = Open\n' +
            '- Component search: component = "User Interface" OR component = "API"\n\n' +
            '# Advanced Functions\n' +
            '- Sort results: ORDER BY created DESC\n' +
            '- Track changes: status WAS "Resolved" AND status = "Open"\n' +
            '- Team filters: assignee IN MEMBERSOF("developers")\n\n' +
            'JQL supports complex combinations using AND, OR, NOT operators and parentheses for grouping. ' +
            'All text values are case-sensitive and must be enclosed in quotes when they contain spaces.',
        },
        startAt: {
          type: 'number',
          description: 'Index of the first issue to return (0-based). Can also use snake_case "start_at".',
          default: 0,
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of issues to return (default: 25, max: 100). Can also use snake_case "max_results".',
          default: 25,
          maximum: 100,
        },
        expand: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['issue_details', 'transitions', 'comments_preview'],
          },
          description: 'Optional fields to include in the response',
        },
      },
      required: ['jql'],
    },
  },

  // List Projects (simplified)
  list_jira_projects: {
    name: 'list_jira_projects',
    description: 'Get a list of all projects in Jira',
    inputSchema: {
      type: 'object',
      properties: {
        include_status_counts: {
          type: 'boolean',
          description: 'Whether to include issue counts by status',
          default: false,
        },
      },
    },
  },

  // List Boards (simplified)
  list_jira_boards: {
    name: 'list_jira_boards',
    description: 'Get a list of all boards in Jira',
    inputSchema: {
      type: 'object',
      properties: {
        include_sprints: {
          type: 'boolean',
          description: 'Whether to include active sprints for each board',
          default: false,
        },
      },
    },
  },

  // Retained for compatibility - Create, Update, Transition
  create_jira_issue: {
    name: 'create_jira_issue',
    description: 'Create a new Jira issue',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: {
          type: 'string',
          description: 'Project key (e.g., PROJ)',
        },
        summary: {
          type: 'string',
          description: 'Issue summary/title',
        },
        description: {
          type: 'string',
          description: 'Detailed description of the issue',
        },
        issueType: {
          type: 'string',
          description: 'Type of issue (e.g., Story, Bug, Task)',
        },
        priority: {
          type: 'string',
          description: 'Issue priority (e.g., High, Medium, Low)',
        },
        assignee: {
          type: 'string',
          description: 'Username of the assignee',
        },
        labels: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Array of labels to apply to the issue',
        },
        customFields: {
          type: 'object',
          description: 'Custom field values as key-value pairs',
        },
      },
      required: ['projectKey', 'summary', 'issueType'],
    },
  },

  update_jira_issue: {
    name: 'update_jira_issue',
    description: 'Update a Jira issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., WORK-123). Can also use snake_case "issue_key".',
        },
        summary: {
          type: 'string',
          description: 'The new summary for the issue',
        },
        description: {
          type: 'string',
          description: 'The new description for the issue',
        },
        parent: {
          type: ['string', 'null'],
          description: 'The key of the parent issue (e.g., PROJ-123) or null to remove parent',
        },
        assignee: {
          type: 'string',
          description: 'Username of the assignee',
        },
        priority: {
          type: 'string',
          description: 'Issue priority (e.g., High, Medium, Low)',
        },
        labels: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Array of labels to apply to the issue',
        },
        customFields: {
          type: 'object',
          description: 'Custom field values as key-value pairs',
        },
      },
      required: ['issueKey'],
    },
  },

  transition_jira_issue: {
    name: 'transition_jira_issue',
    description: 'Transition a Jira issue to a new status with an optional comment',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., WORK-123). Can also use snake_case "issue_key".',
        },
        transitionId: {
          type: 'string',
          description: 'The ID of the transition to perform. Can also use snake_case "transition_id".',
        },
        comment: {
          type: 'string',
          description: 'Optional comment to add with the transition',
        },
      },
      required: ['issueKey', 'transitionId'],
    },
  },

  add_jira_comment: {
    name: 'add_jira_comment',
    description: 'Add a comment to a Jira issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., WORK-123). Can also use snake_case "issue_key".',
        },
        body: {
          type: 'string',
          description: 'The comment text',
        },
      },
      required: ['issueKey', 'body'],
    },
  },
};
