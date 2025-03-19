export const toolSchemas = {
  // Consolidated Sprint Management API
  manage_jira_sprint: {
    name: 'manage_jira_sprint',
    description: 'Comprehensive sprint management with CRUD operations and issue management',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['get', 'create', 'update', 'delete', 'list', 'manage_issues'],
          description: 'Operation to perform on the sprint',
        },
        // Parameters for get operation
        sprintId: {
          type: 'integer',
          description: 'The ID of the sprint. Required for get, update, delete, and manage_issues operations. Can also use snake_case "sprint_id".',
        },
        // Parameters for create operation
        boardId: {
          type: 'integer',
          description: 'The ID of the board. Required for create and list operations. Can also use snake_case "board_id".',
        },
        name: {
          type: 'string',
          description: 'Name of the sprint. Required for create operation, optional for update.',
        },
        // Common parameters for create and update
        startDate: {
          type: 'string',
          description: 'Start date for the sprint in ISO format (e.g., "2025-03-20T00:00:00.000Z"). Can also use snake_case "start_date".',
        },
        endDate: {
          type: 'string',
          description: 'End date for the sprint in ISO format (e.g., "2025-04-03T00:00:00.000Z"). Can also use snake_case "end_date".',
        },
        goal: {
          type: 'string',
          description: 'Goal or objective for the sprint',
        },
        state: {
          type: 'string',
          enum: ['future', 'active', 'closed'],
          description: 'Sprint state. Used for filtering in list operation or changing state in update operation.',
        },
        // Parameters for list operation
        startAt: {
          type: 'integer',
          description: 'Index of the first sprint to return (0-based). Used for list operation. Can also use snake_case "start_at".',
          default: 0,
        },
        maxResults: {
          type: 'integer',
          description: 'Maximum number of sprints to return. Used for list operation. Can also use snake_case "max_results".',
          default: 50,
        },
        // Parameters for manage_issues operation
        add: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Array of issue keys to add to the sprint. Used for manage_issues operation.',
        },
        remove: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Array of issue keys to remove from the sprint. Used for manage_issues operation.',
        },
        // Common expansion options
        expand: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['issues', 'report', 'board'],
          },
          description: 'Optional fields to include in the response',
        },
      },
      required: ['operation'],
    },
  },

  // Consolidated Issue Management API
  manage_jira_issue: {
    name: 'manage_jira_issue',
    description: 'Comprehensive issue management with CRUD operations, transitions, comments, and linking',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['create', 'get', 'update', 'delete', 'transition', 'comment', 'link'],
          description: 'Operation to perform on the issue',
        },
        // Parameters for get, update, delete, transition, comment, and link operations
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., WORK-123). Required for all operations except create. Can also use snake_case "issue_key".',
        },
        // Parameters for create operation
        projectKey: {
          type: 'string',
          description: 'Project key (e.g., PROJ). Required for create operation. Can also use snake_case "project_key".',
        },
        // Common parameters for create and update
        summary: {
          type: 'string',
          description: 'Issue summary/title. Required for create, optional for update.',
        },
        description: {
          type: 'string',
          description: 'Detailed description of the issue. Optional for create/update.',
        },
        issueType: {
          type: 'string',
          description: 'Type of issue (e.g., Story, Bug, Task). Required for create. Can also use snake_case "issue_type".',
        },
        priority: {
          type: 'string',
          description: 'Issue priority (e.g., High, Medium, Low). Optional for create/update.',
        },
        assignee: {
          type: 'string',
          description: 'Username of the assignee. Optional for create/update.',
        },
        labels: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Array of labels to apply to the issue. Optional for create/update.',
        },
        customFields: {
          type: 'object',
          description: 'Custom field values as key-value pairs. Optional for create/update. Can also use snake_case "custom_fields".',
        },
        // Parameters for update operation
        parent: {
          type: ['string', 'null'],
          description: 'The key of the parent issue (e.g., PROJ-123) or null to remove parent. Optional for update.',
        },
        // Parameters for transition operation
        transitionId: {
          type: 'string',
          description: 'The ID of the transition to perform. Required for transition operation. Can also use snake_case "transition_id".',
        },
        // Parameters for comment and transition operations
        comment: {
          type: 'string',
          description: 'Comment text. Required for comment operation, optional for transition.',
        },
        // Parameters for link operation
        linkType: {
          type: 'string',
          description: 'Type of link between issues (e.g., "relates to", "blocks"). Required for link operation. Can also use snake_case "link_type".',
        },
        linkedIssueKey: {
          type: 'string',
          description: 'The key of the issue to link to. Required for link operation. Can also use snake_case "linked_issue_key".',
        },
        // Common expansion options
        expand: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['comments', 'transitions', 'attachments', 'related_issues', 'history'],
          },
          description: 'Optional fields to include in the response',
        },
      },
      required: ['operation'],
    },
  },

  // Consolidated Project Management API
  manage_jira_project: {
    name: 'manage_jira_project',
    description: 'Comprehensive project management with CRUD operations and related data',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['get', 'create', 'update', 'delete', 'list'],
          description: 'Operation to perform on the project',
        },
        // Parameters for get, update, delete operations
        projectKey: {
          type: 'string',
          description: 'The Jira project key (e.g., PROJ). Required for get, update, and delete operations. Can also use snake_case "project_key".',
        },
        // Parameters for create operation
        name: {
          type: 'string',
          description: 'Name of the project. Required for create operation, optional for update.',
        },
        key: {
          type: 'string',
          description: 'Project key. Required for create operation.',
        },
        // Common parameters for create and update
        description: {
          type: 'string',
          description: 'Description of the project. Optional for create/update.',
        },
        lead: {
          type: 'string',
          description: 'Username of the project lead. Optional for create/update.',
        },
        // Parameters for list operation
        startAt: {
          type: 'integer',
          description: 'Index of the first project to return (0-based). Used for list operation. Can also use snake_case "start_at".',
          default: 0,
        },
        maxResults: {
          type: 'integer',
          description: 'Maximum number of projects to return. Used for list operation. Can also use snake_case "max_results".',
          default: 50,
        },
        // Common expansion options
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
      required: ['operation'],
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

};
