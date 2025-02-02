export const toolSchemas = {
  list_jira_boards: {
    name: 'list_jira_boards',
    description: 'Get a list of all boards in Jira',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  list_board_sprints: {
    name: 'list_board_sprints',
    description: 'Get a list of all sprints in a Jira board',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: {
          type: 'integer',
          description: 'The ID of the board to get sprints from. Can also use snake_case "board_id".',
        },
      },
      required: ['boardId'],
    },
  },
  list_jira_projects: {
    name: 'list_jira_projects',
    description: 'Get a list of all projects in Jira',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  get_issue: {
    name: 'get_issue',
    description: 'Get basic information about a Jira issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., WORK-123). Can also use snake_case "issue_key".',
        },
      },
      required: ['issueKey'],
    },
  },
  get_issue_details: {
    name: 'get_issue_details',
    description: 'Get comprehensive information about a Jira issue including comments',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., WORK-123). Can also use snake_case "issue_key".',
        },
      },
      required: ['issueKey'],
    },
  },
  get_issue_attachments: {
    name: 'get_issue_attachments',
    description: 'Get all attachments for a Jira issue with metadata and download URLs',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., WORK-123). Can also use snake_case "issue_key".',
        },
      },
      required: ['issueKey'],
    },
  },
  get_jira_filter_issues: {
    name: 'get_jira_filter_issues',
    description: 'Get all issues from a saved Jira filter',
    inputSchema: {
      type: 'object',
      properties: {
        filterId: {
          type: 'string',
          description: 'The ID of the saved Jira filter. Can also use snake_case "filter_id".',
        },
      },
      required: ['filterId'],
    },
  },
  update_jira_issue: {
    name: 'update_jira_issue',
    description: 'Update the summary, description, and/or parent of a Jira issue',
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
      },
      required: ['issueKey'],
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
  search_jira_issues: {
    name: 'search_jira_issues',
    description: 'Search for issues using JQL with pagination support',
    inputSchema: {
      type: 'object',
      properties: {
        jql: {
          type: 'string',
          description: 'JQL query string',
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
      },
      required: ['jql'],
    },
  },
  get_jira_transitions: {
    name: 'get_jira_transitions',
    description: 'Get all allowed transitions for a Jira issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., WORK-123). Can also use snake_case "issue_key".',
        },
      },
      required: ['issueKey'],
    },
  },
  get_jira_populated_fields: {
    name: 'get_jira_populated_fields',
    description: 'Get all populated fields for a Jira issue, excluding empty fields and system metadata',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., WORK-123). Can also use snake_case "issue_key".',
        },
      },
      required: ['issueKey'],
    },
  },
  list_my_jira_filters: {
    name: 'list_my_jira_filters',
    description: 'List all Jira filters owned by the authenticated user',
    inputSchema: {
      type: 'object',
      properties: {
        expand: {
          type: 'boolean',
          description: 'Whether to include additional filter details like description and JQL',
          default: false,
        },
      },
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
};
