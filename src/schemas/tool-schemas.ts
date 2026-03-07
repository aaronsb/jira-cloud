export const toolSchemas = {
  manage_jira_filter: {
    name: 'manage_jira_filter',
    description: 'Search for issues using JQL queries, or manage saved filters. Returns issue details (title, status, description). For quantitative questions (counts, totals, overdue, workload), use analyze_jira_issues instead.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['get', 'create', 'update', 'delete', 'list', 'execute_filter', 'execute_jql'],
          description: 'Operation to perform',
        },
        filterId: {
          type: 'string',
          description: 'Filter ID. Required for get, update, delete, execute_filter.',
        },
        name: {
          type: 'string',
          description: 'Filter name. Required for create.',
        },
        jql: {
          type: 'string',
          description: 'JQL query string. Required for create and execute_jql. Read jira://tools/manage_jira_filter/documentation for syntax examples.',
        },
        description: {
          type: 'string',
          description: 'Filter description.',
        },
        favourite: {
          type: 'boolean',
          description: 'Mark as favorite.',
        },
        startAt: {
          type: 'integer',
          description: 'Pagination offset (0-based).',
          default: 0,
        },
        maxResults: {
          type: 'integer',
          description: 'Max items to return.',
          default: 50,
        },
        sharePermissions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['group', 'project', 'global'],
              },
              group: { type: 'string' },
              project: { type: 'string' },
            },
            required: ['type'],
          },
          description: 'Share permissions for the filter.',
        },
        expand: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['jql', 'description', 'permissions', 'issue_count', 'issue_details', 'transitions', 'comments_preview'],
          },
          description: 'Additional fields to include in the response.',
        },
      },
      required: ['operation'],
    },
  },

  manage_jira_sprint: {
    name: 'manage_jira_sprint',
    description: 'Manage sprints: create, start, close, and assign issues to sprints',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['get', 'create', 'update', 'delete', 'list', 'manage_issues'],
          description: 'Operation to perform',
        },
        sprintId: {
          type: 'integer',
          description: 'Sprint ID. Required for get, update, delete, manage_issues.',
        },
        boardId: {
          type: 'integer',
          description: 'Board ID. Required for create and list.',
        },
        name: {
          type: 'string',
          description: 'Sprint name. Required for create.',
        },
        startDate: {
          type: 'string',
          description: 'Start date in ISO format (e.g., "2025-03-20T00:00:00.000Z").',
        },
        endDate: {
          type: 'string',
          description: 'End date in ISO format.',
        },
        goal: {
          type: 'string',
          description: 'Sprint goal.',
        },
        state: {
          type: 'string',
          enum: ['future', 'active', 'closed'],
          description: 'Sprint state. Filter for list, or set via update.',
        },
        startAt: {
          type: 'integer',
          description: 'Pagination offset (0-based).',
          default: 0,
        },
        maxResults: {
          type: 'integer',
          description: 'Max items to return.',
          default: 50,
        },
        add: {
          type: 'array',
          items: { type: 'string' },
          description: 'Issue keys to add to sprint (manage_issues).',
        },
        remove: {
          type: 'array',
          items: { type: 'string' },
          description: 'Issue keys to remove from sprint (manage_issues).',
        },
        expand: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['issues', 'report', 'board'],
          },
          description: 'Additional fields to include in the response.',
        },
      },
      required: ['operation'],
    },
  },

  manage_jira_issue: {
    name: 'manage_jira_issue',
    description: 'Get, create, update, delete, move, transition, comment on, link, or explore hierarchy of Jira issues',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['create', 'get', 'update', 'delete', 'move', 'transition', 'comment', 'link', 'hierarchy'],
          description: 'Operation to perform',
        },
        issueKey: {
          type: 'string',
          description: 'Issue key (e.g., PROJ-123). Required for all operations except create.',
        },
        projectKey: {
          type: 'string',
          description: 'Project key (e.g., PROJ). Required for create.',
        },
        summary: {
          type: 'string',
          description: 'Issue title. Required for create.',
        },
        description: {
          type: 'string',
          description: 'Issue description.',
        },
        issueType: {
          type: 'string',
          description: 'Issue type (e.g., Story, Bug, Task). Required for create.',
        },
        priority: {
          type: 'string',
          description: 'Priority (e.g., High, Medium, Low).',
        },
        assignee: {
          type: 'string',
          description: 'Atlassian accountId of the assignee.',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to apply.',
        },
        customFields: {
          type: 'object',
          description: 'Custom field values as key-value pairs.',
        },
        dueDate: {
          type: ['string', 'null'],
          description: 'Due date in ISO format (e.g., "2025-06-15") or null to clear. For create and update.',
        },
        parent: {
          type: ['string', 'null'],
          description: 'Parent issue key (e.g., PROJ-100) or null to remove.',
        },
        transitionId: {
          type: 'string',
          description: 'Transition ID. Required for transition. Use expand: ["transitions"] on get to discover IDs.',
        },
        comment: {
          type: 'string',
          description: 'Comment text. Required for comment, optional for transition.',
        },
        linkType: {
          type: 'string',
          description: 'Link type (e.g., "blocks", "relates to"). Required for link. Read jira://issue-link-types for valid types.',
        },
        linkedIssueKey: {
          type: 'string',
          description: 'Issue key to link to. Required for link.',
        },
        targetProjectKey: {
          type: 'string',
          description: 'Target project key for move (e.g., NEWPROJ). Required for move.',
        },
        targetIssueType: {
          type: 'string',
          description: 'Target issue type for move (e.g., Story, Bug). Required for move.',
        },
        up: {
          type: 'number',
          description: 'Hierarchy: how many levels up to traverse (default 4, max 8).',
        },
        down: {
          type: 'number',
          description: 'Hierarchy: how many levels down to traverse (default 4, max 8).',
        },
        expand: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['comments', 'transitions', 'attachments', 'related_issues', 'history'],
          },
          description: 'Additional fields to include in the response.',
        },
      },
      required: ['operation'],
    },
  },

  manage_jira_project: {
    name: 'manage_jira_project',
    description: 'List projects or get project configuration and metadata. For issue counts, workload, or cross-project comparison, use analyze_jira_issues with metrics: ["summary"] instead.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['get', 'list'],
          description: 'Operation to perform',
        },
        projectKey: {
          type: 'string',
          description: 'Project key (e.g., PROJ). Required for get.',
        },
        startAt: {
          type: 'integer',
          description: 'Pagination offset (0-based).',
          default: 0,
        },
        maxResults: {
          type: 'integer',
          description: 'Max items to return.',
          default: 50,
        },
        expand: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['boards', 'components', 'versions', 'recent_issues'],
          },
          description: 'Additional fields to include in the response.',
        },
        include_status_counts: {
          type: 'boolean',
          description: 'Include issue counts by status.',
          default: true,
        },
      },
      required: ['operation'],
    },
  },

  manage_jira_board: {
    name: 'manage_jira_board',
    description: 'List boards or get board details and configuration',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['get', 'list'],
          description: 'Operation to perform',
        },
        boardId: {
          type: 'integer',
          description: 'Board ID. Required for get.',
        },
        startAt: {
          type: 'integer',
          description: 'Pagination offset (0-based).',
          default: 0,
        },
        maxResults: {
          type: 'integer',
          description: 'Max items to return.',
          default: 50,
        },
        expand: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['sprints', 'issues', 'configuration'],
          },
          description: 'Additional fields to include in the response.',
        },
        include_sprints: {
          type: 'boolean',
          description: 'Include active sprints (shorthand for expand: ["sprints"]).',
          default: false,
        },
      },
      required: ['operation'],
    },
  },


  analyze_jira_issues: {
    name: 'analyze_jira_issues',
    description: 'Compute project metrics over issues selected by JQL. Use "summary" for exact counts across projects (no sampling cap). Use other metrics for detailed analysis of individual issue data. Always prefer this tool over manage_jira_filter or manage_jira_project for quantitative questions (counts, totals, overdue, workload). Read jira://analysis/recipes for composition patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        jql: {
          type: 'string',
          description: 'JQL query selecting the issues to analyze. Examples: "project in (AA, GC, LGS)", "sprint in openSprints()", "assignee = currentUser() AND resolution = Unresolved".',
        },
        metrics: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['summary', 'points', 'time', 'schedule', 'cycle', 'distribution', 'cube_setup'],
          },
          description: 'Which metric groups to compute. summary = exact issue counts via count API (no cap, fastest). cube_setup = sample issues and discover available dimensions/measures for cube queries. points = earned value/SPI. time = effort estimates. schedule = overdue/risk. cycle = lead time/throughput. distribution = counts by status/assignee/priority/type. Default: all except summary and cube_setup.',
        },
        groupBy: {
          type: 'string',
          enum: ['project', 'assignee', 'priority', 'issuetype'],
          description: 'Split summary counts by this dimension. Use with metrics: ["summary"]. "project" produces a per-project comparison table.',
        },
        maxResults: {
          type: 'integer',
          description: 'Max issues to fetch for detail metrics (default 100, max 500). Does not apply to summary (which uses count API).',
          default: 100,
        },
      },
      required: ['jql'],
    },
  },

  queue_jira_operations: {
    name: 'queue_jira_operations',
    description: 'Execute multiple Jira operations in a single call. Operations run sequentially with result references ($0.key) and per-operation error strategies (bail/continue).',
    inputSchema: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tool: {
                type: 'string',
                enum: ['manage_jira_issue', 'manage_jira_filter', 'manage_jira_sprint', 'manage_jira_project', 'manage_jira_board', 'analyze_jira_issues'],
                description: 'Which tool to call.',
              },
              args: {
                type: 'object',
                description: 'Arguments for the tool call. Use $N.field to reference results from earlier operations (e.g., $0.key for the issue key from operation 0).',
              },
              onError: {
                type: 'string',
                enum: ['bail', 'continue'],
                description: 'Error strategy. bail (default): stop queue. continue: log error, proceed to next.',
                default: 'bail',
              },
            },
            required: ['tool', 'args'],
          },
          description: 'Ordered list of operations to execute (max 16).',
          maxItems: 16,
        },
        detail: {
          type: 'string',
          enum: ['full', 'summary'],
          description: 'Result detail level. summary (default): one-line status per operation. full: complete output matching individual tool calls. Use full when summary lacks needed detail.',
          default: 'summary',
        },
      },
      required: ['operations'],
    },
  },

};
