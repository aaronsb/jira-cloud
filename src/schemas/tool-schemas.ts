export const toolSchemas = {
  // Filter Management API
  manage_jira_filter: {
    name: 'manage_jira_filter',
    description: 'Filter management with CRUD operations and issue retrieval',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['get', 'create', 'update', 'delete', 'list', 'execute_filter', 'execute_jql'],
          description: 'Operation to perform on the filter',
        },
        // Parameters for get, update, delete, execute_filter operations
        filterId: {
          type: 'string',
          description: 'The ID of the filter. Required for get, update, delete, and execute_filter operations. Can also use snake_case "filter_id".',
        },
        // Parameters for create and update operations
        name: {
          type: 'string',
          description: 'Name of the filter. Required for create operation, optional for update.',
        },
        jql: {
          type: 'string',
          description: 'JQL query string for the filter. Required for create operation, optional for update.',
        },
        description: {
          type: 'string',
          description: 'Description of the filter. Optional for create/update.',
        },
        favourite: {
          type: 'boolean',
          description: 'Whether to mark the filter as a favorite. Optional for create/update.',
        },
        // Parameters for list operation
        startAt: {
          type: 'integer',
          description: 'Index of the first filter to return (0-based). Used for list operation. Can also use snake_case "start_at".',
          default: 0,
        },
        maxResults: {
          type: 'integer',
          description: 'Maximum number of filters to return. Used for list operation. Can also use snake_case "max_results".',
          default: 50,
        },
        // Parameters for sharing
        sharePermissions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['group', 'project', 'global'],
                description: 'Type of share permission',
              },
              group: {
                type: 'string',
                description: 'Group name (required when type is "group")',
              },
              project: {
                type: 'string',
                description: 'Project key (required when type is "project")',
              },
            },
            required: ['type'],
          },
          description: 'Share permissions for the filter. Optional for create/update. Can also use snake_case "share_permissions".',
        },
        // Common expansion options
        expand: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['jql', 'description', 'permissions', 'issue_count'],
          },
          description: 'Optional fields to include in the response',
        },
      },
      required: ['operation'],
    },
  },

  // Sprint Management API
  manage_jira_sprint: {
    name: 'manage_jira_sprint',
    description: 'Sprint management with CRUD operations and issue management',
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

  // Issue Management API
  manage_jira_issue: {
    name: 'manage_jira_issue',
    description: 'Issue management with CRUD operations, transitions, comments, and linking',
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

  // Project Management API
  manage_jira_project: {
    name: 'manage_jira_project',
    description: 'Project management with CRUD operations and related data',
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


  // Board Management API
  manage_jira_board: {
    name: 'manage_jira_board',
    description: 'Board management with CRUD operations and related data',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['get', 'list', 'create', 'update', 'delete', 'get_configuration'],
          description: 'Operation to perform on the board',
        },
        // Parameters for get, update, delete, get_configuration operations
        boardId: {
          type: 'integer',
          description: 'The ID of the board. Required for get, update, delete, and get_configuration operations. Can also use snake_case "board_id".',
        },
        // Parameters for create operation
        name: {
          type: 'string',
          description: 'Name of the board. Required for create operation, optional for update.',
        },
        type: {
          type: 'string',
          enum: ['scrum', 'kanban'],
          description: 'Type of board. Required for create operation.',
        },
        projectKey: {
          type: 'string',
          description: 'Project key for the board. Required for create operation. Can also use snake_case "project_key".',
        },
        // Parameters for list operation
        startAt: {
          type: 'integer',
          description: 'Index of the first board to return (0-based). Used for list operation. Can also use snake_case "start_at".',
          default: 0,
        },
        maxResults: {
          type: 'integer',
          description: 'Maximum number of boards to return. Used for list operation. Can also use snake_case "max_results".',
          default: 50,
        },
        // Common expansion options
        expand: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['sprints', 'issues', 'configuration'],
          },
          description: 'Optional fields to include in the response',
        },
        include_sprints: {
          type: 'boolean',
          description: 'Whether to include active sprints for each board (shorthand for expand: ["sprints"])',
          default: false,
        },
      },
      required: ['operation'],
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



};
