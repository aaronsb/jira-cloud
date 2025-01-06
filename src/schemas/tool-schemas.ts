export const toolSchemas = {
  get_issue: {
    name: 'get_issue',
    description: 'Get detailed information about a Jira issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., PROJ-123)',
        },
        includeComments: {
          type: 'boolean',
          description: 'Whether to include comments in the response',
          default: false,
        },
      },
      required: ['issueKey'],
    },
  },
  get_filter_issues: {
    name: 'get_filter_issues',
    description: 'Get all issues from a saved Jira filter',
    inputSchema: {
      type: 'object',
      properties: {
        filterId: {
          type: 'string',
          description: 'The ID of the saved Jira filter',
        },
      },
      required: ['filterId'],
    },
  },
  update_issue: {
    name: 'update_issue',
    description: 'Update the summary and/or description of a Jira issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., PROJ-123)',
        },
        summary: {
          type: 'string',
          description: 'The new summary for the issue',
        },
        description: {
          type: 'string',
          description: 'The new description for the issue',
        },
      },
      required: ['issueKey'],
    },
  },
  add_comment: {
    name: 'add_comment',
    description: 'Add a comment to a Jira issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., PROJ-123)',
        },
        body: {
          type: 'string',
          description: 'The comment text',
        },
      },
      required: ['issueKey', 'body'],
    },
  },
  search_issues: {
    name: 'search_issues',
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
          description: 'Index of the first issue to return (0-based)',
          default: 0,
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of issues to return (default: 25, max: 100)',
          default: 25,
          maximum: 100,
        },
      },
      required: ['jql'],
    },
  },
  get_transitions: {
    name: 'get_transitions',
    description: 'Get all allowed transitions for a Jira issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., PROJ-123)',
        },
      },
      required: ['issueKey'],
    },
  },
  get_populated_fields: {
    name: 'get_populated_fields',
    description: 'Get all populated fields for a Jira issue, excluding empty fields and system metadata',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., PROJ-123)',
        },
      },
      required: ['issueKey'],
    },
  },
  list_my_filters: {
    name: 'list_my_filters',
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
};
