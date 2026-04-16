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
    description: 'Manage iterations: boards, sprints, and sprint issues. Use list_boards/get_board to find boards, then sprint operations for iteration management.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['get', 'create', 'update', 'delete', 'list', 'manage_issues', 'get_board', 'list_boards'],
          description: 'Operation to perform. list_boards: all boards. get_board: board detail with optional sprints. get/create/update/delete/list: sprint operations. manage_issues: add/remove issues from sprint.',
        },
        sprintId: {
          type: 'integer',
          description: 'Sprint ID. Required for get, update, delete, manage_issues.',
        },
        boardId: {
          type: 'integer',
          description: 'Board ID. Required for create, list, get_board.',
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
            enum: ['issues', 'report', 'board', 'sprints', 'configuration'],
          },
          description: 'Additional fields to include in the response. sprints/configuration for get_board.',
        },
        includeSprints: {
          type: 'boolean',
          description: 'Include sprints in board responses (shorthand for expand: ["sprints"]).',
          default: false,
        },
      },
      required: ['operation'],
    },
  },

  manage_jira_issue: {
    name: 'manage_jira_issue',
    description: 'Get, create, update, delete, move, transition, comment on, link, log work on, or explore hierarchy of Jira issues',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['create', 'get', 'update', 'delete', 'move', 'transition', 'comment', 'link', 'hierarchy', 'worklog'],
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
          description: 'Issue type name — must match project configuration (e.g., Story, Bug, Task, Feature). Use manage_jira_project get to discover valid types. Required for create.',
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
        originalEstimate: {
          type: 'string',
          description: 'Original time estimate in Jira format (e.g., "3d", "2h 30m", "1w"). For create and update.',
        },
        remainingEstimate: {
          type: 'string',
          description: 'Remaining time estimate in Jira format (e.g., "1d", "4h"). For update only.',
        },
        timeSpent: {
          type: 'string',
          description: 'Time spent in Jira format (e.g., "3h 30m", "1d", "2w"). Required for worklog.',
        },
        worklogComment: {
          type: 'string',
          description: 'Description of work performed. For worklog.',
        },
        started: {
          type: 'string',
          description: 'When the work started, ISO datetime (e.g., "2025-04-09T09:00:00.000+0000"). Defaults to now. For worklog.',
        },
        adjustEstimate: {
          type: 'string',
          enum: ['auto', 'leave', 'new', 'manual'],
          description: 'How to adjust the remaining estimate: auto (reduce by timeSpent), leave (unchanged), new (set to newEstimate), manual (reduce by reduceBy). Default: auto. For worklog.',
        },
        newEstimate: {
          type: 'string',
          description: 'New remaining estimate when adjustEstimate is "new" (e.g., "2d"). For worklog.',
        },
        reduceBy: {
          type: 'string',
          description: 'Amount to reduce remaining estimate when adjustEstimate is "manual" (e.g., "1h"). For worklog.',
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



  analyze_jira_issues: {
    name: 'analyze_jira_issues',
    description: 'Compute project metrics over issues selected by JQL or a saved filter. For counting and breakdown questions ("how many by status/assignee/priority"), use metrics: ["summary"] with groupBy — this gives exact counts with no issue cap. Use detail metrics (points, time, schedule, cycle, distribution) for per-issue analysis (capped at maxResults). Use flow for status transition patterns — how issues move through statuses, where they bounce, and how long they stay. Tip: save complex JQL as a filter with manage_jira_filter, then reuse the filterId here for repeated analysis. Read jira://analysis/recipes for composition patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        jql: {
          type: 'string',
          description: 'JQL query selecting the issues to analyze. Either jql, filterId, or dataRef is required (dataRef > filterId > jql precedence). Examples: "project in (AA, GC, LGS)", "sprint in openSprints()", "assignee = currentUser() AND resolution = Unresolved".',
        },
        filterId: {
          type: 'string',
          description: 'ID of a saved Jira filter to use as the query source. The filter\'s JQL is resolved automatically. Use this to run different analyses against a saved query without repeating the JQL. Create filters with manage_jira_filter.',
        },
        dataRef: {
          type: 'string',
          description: 'Root issue key of a cached hierarchy walk. Analyzes cached plan data without re-fetching from Jira. Start a walk with manage_jira_plan first. Supports all metrics except flow. Takes precedence over jql/filterId.',
        },
        metrics: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['summary', 'points', 'time', 'schedule', 'cycle', 'distribution', 'flow', 'hierarchy', 'cube_setup'],
          },
          description: 'Which metric groups to compute. summary = exact counts via count API (no issue cap, fastest) — use with groupBy for "how many by assignee/status/priority" questions. distribution = approximate counts from fetched issues (capped by maxResults — use summary + groupBy instead when you need exact counts). flow = status transition analysis from bulk changelogs — entries per status, avg time in each, bounce rates, top bouncers. hierarchy = tree visualization with rollups for parent-child structures (requires GraphQL — opt-in like flow). cube_setup = discover dimensions before cube queries. points = earned value/SPI. time = effort estimates. schedule = overdue/risk. cycle = lead time/throughput. Default: all detail metrics (excluding flow and hierarchy — request explicitly). For counting/breakdown questions, always prefer summary + groupBy over distribution.',
        },
        groupBy: {
          type: 'string',
          enum: ['project', 'assignee', 'priority', 'issuetype', 'parent', 'sprint'],
          description: 'Split counts by this dimension — produces a breakdown table. Use with metrics: ["summary"] for exact counts. This is the correct approach for "how many issues per assignee/priority/type" questions. "project" produces a per-project comparison. "parent" groups by parent issue. "sprint" groups by sprint name.',
        },
        compute: {
          type: 'array',
          items: { type: 'string' },
          description: 'Computed columns for cube execute. Each entry: "name = expr". Arithmetic (+,-,*,/), comparisons (>,<,>=,<=,==,!=). Column refs: total, open, overdue, high, created_7d, resolved_7d. Implicit measures resolved lazily: bugs, unassigned, no_due_date, no_estimate, no_start_date, no_labels, blocked, stale (untouched 60d+), stale_status (stuck in status 30d+), backlog_rot (undated+unassigned+untouched 60d+). Max 5 expressions. Example: ["bug_pct = bugs / total * 100", "rot_pct = backlog_rot / open * 100"].',
          maxItems: 5,
        },
        groupLimit: {
          type: 'integer',
          description: 'Max groups/dimension values to show (default 20). Applies to summary groupBy rows and distribution breakdowns. No hard cap for summary metrics — increase freely for full visibility. For detail metrics the issue fetch is separately capped by maxResults.',
          default: 20,
        },
        maxResults: {
          type: 'integer',
          description: 'Max issues to fetch for detail metrics (default 100, max 500). Does not apply to summary (which uses count API).',
          default: 100,
        },
      },
      required: [],
    },
  },

  manage_jira_plan: {
    name: 'manage_jira_plan',
    description: 'Navigate and manage the strategic-to-execution hierarchy. Walks issue trees and Atlassian Goals via GraphQL. Read: analyze rollups (dates, points, progress, conflicts), discover goals (list_goals), get goal detail (get_goal). Write: create/update goals, post status updates, link/unlink Jira issues to goals. Results cached server-side. For flat-set metrics use analyze_jira_issues; for structure without rollups use manage_jira_issue hierarchy.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['analyze', 'release', 'list_goals', 'get_goal', 'create_goal', 'update_goal', 'update_goal_status', 'link_work_item', 'unlink_work_item'],
          description: 'Operation to perform. analyze: walk hierarchy and compute rollups. release: free cached walk. list_goals: search goals. get_goal: goal detail. create_goal: create a goal. update_goal: edit goal name/description/dates/archive. update_goal_status: post a status update (on_track/off_track/done). link_work_item: link a Jira issue to a goal. unlink_work_item: unlink a Jira issue from a goal.',
        },
        issueKey: {
          type: 'string',
          description: 'Issue key at the root of the plan tree (e.g., PROJ-100). Required for analyze/release unless goalKey is provided. Also used with link_work_item/unlink_work_item to specify the Jira issue.',
        },
        goalKey: {
          type: 'string',
          description: 'Atlassian Goal key (e.g., PRAEC-25). Used for get_goal, analyze, update_goal, update_goal_status, link_work_item, unlink_work_item.',
        },
        name: {
          type: 'string',
          description: 'Goal name. Required for create_goal. Optional for update_goal (renames the goal).',
        },
        description: {
          type: 'string',
          description: 'Goal description text. For create_goal and update_goal.',
        },
        status: {
          type: 'string',
          enum: ['on_track', 'off_track', 'at_risk', 'done', 'pending', 'paused'],
          description: 'Goal status for update_goal_status.',
        },
        summary: {
          type: 'string',
          description: 'Status update summary text for update_goal_status. Describes what changed and why.',
        },
        parentGoalKey: {
          type: 'string',
          description: 'Parent goal key for create_goal. Makes the new goal a sub-goal of this parent.',
        },
        targetDate: {
          type: 'string',
          description: 'Target date in ISO format (YYYY-MM-DD) for create_goal and update_goal.',
        },
        startDate: {
          type: 'string',
          description: 'Start date in ISO format (YYYY-MM-DD) for update_goal.',
        },
        archived: {
          type: 'boolean',
          description: 'Set to true to archive a goal, false to unarchive. For update_goal.',
        },
        searchString: {
          type: 'string',
          description: 'TQL search string for list_goals. Examples: \'name LIKE "Health"\', \'status = on_track\'. Empty string returns all goals.',
        },
        sort: {
          type: 'string',
          enum: ['HIERARCHY_ASC', 'HIERARCHY_DESC', 'NAME_ASC', 'NAME_DESC', 'TARGET_DATE_ASC', 'TARGET_DATE_DESC', 'LATEST_UPDATE_DATE_ASC', 'LATEST_UPDATE_DATE_DESC'],
          description: 'Sort order for list_goals. Default: HIERARCHY_ASC (groups parents with children).',
        },
        rollups: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['dates', 'points', 'progress', 'assignees'],
          },
          description: 'Which rollup dimensions to include. Default: all.',
        },
        focus: {
          type: 'string',
          description: 'Issue key to focus on within the cached plan. Windowed view for navigating large plans.',
        },
        mode: {
          type: 'string',
          enum: ['rollup', 'gaps'],
          description: 'Output mode. rollup (default): summary + entry points. gaps: conflicts and missing data only.',
        },
      },
      required: [],
    },
  },

  manage_jira_request: {
    name: 'manage_jira_request',
    description: 'Customer-side Jira Service Management (JSM). Full customer flow: discover portals and request types, see what fields are required per type, raise requests, check status/SLA/comments/transitions in one call, comment, and perform customer-side transitions (reopen, resolve, cancel). Registers only when /rest/servicedeskapi/ is reachable. For agent/admin workflows, use manage_jira_issue instead.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['list_portals', 'list_request_types', 'get_request_type', 'create', 'get', 'comment', 'transition', 'list'],
          description: 'Operation to perform. list_portals: service desks. list_request_types: request types on a portal (use expand:["fields"] to also fetch field schemas). get_request_type: detail + field schema for one type — shows what to fill out. create: raise request. get: rich view (status, SLA, comments, transitions, attachments) in one call. comment: public-only customer comment. transition: self-service transition on a request (discover IDs via get — often empty because the workflow/permissions don\'t expose any to the customer). list: my requests.',
        },
        serviceDeskId: {
          type: 'string',
          description: 'Service desk ID (not the project key — use list_portals to find). Required for list_request_types, get_request_type, create; optional for list.',
        },
        requestTypeId: {
          type: 'string',
          description: 'Request type ID from list_request_types. Required for get_request_type and create.',
        },
        issueKey: {
          type: 'string',
          description: 'Request/issue key (e.g., INVS-42). Required for get, comment, transition.',
        },
        summary: {
          type: 'string',
          description: 'Short title for the request. Required for create.',
        },
        description: {
          type: 'string',
          description: 'Request body / details. Optional for create.',
        },
        comment: {
          type: 'string',
          description: 'Comment text. Required for comment. Optional for transition (attaches a comment to the transition).',
        },
        transitionId: {
          type: 'string',
          description: 'Transition ID (from the "Available transitions" section of `get`). Required for transition. Customer-facing transitions depend on the project workflow/permission scheme — many JSM projects expose none, which is normal.',
        },
        isPublic: {
          type: 'boolean',
          description: 'Must be true (or omitted). Atlassian only permits customers to post public comments; isPublic:false is rejected with a clear error. Internal comments require agent-side tooling.',
          default: true,
        },
        requestFieldValues: {
          type: 'object',
          description: 'Additional field values for create. Merged with summary/description. Accepts either human-readable names ("Quote ID") or raw Jira field IDs ("customfield_17375"). Names are resolved via the dynamic custom-field catalog (ADR-201). Use get_request_type or list_request_types with expand:["fields"] to see both forms per request type.',
        },
        requestStatus: {
          type: 'string',
          enum: ['OPEN_REQUESTS', 'CLOSED_REQUESTS', 'ALL_REQUESTS'],
          description: 'Which requests to show in list. Default: OPEN_REQUESTS.',
          default: 'OPEN_REQUESTS',
        },
        expand: {
          type: 'array',
          items: { type: 'string' },
          description: 'Expansion hints. list_request_types: ["fields"] to include field schemas inline. get: ["status","requestType","sla","attachment","comment","participant","action"] (all included by default — override to trim).',
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
      },
      required: ['operation'],
    },
  },

  manage_jira_media: {
    name: 'manage_jira_media',
    description: 'Manage file attachments on Jira issues (remote). Operations here affect Jira — delete permanently removes an attachment from the issue for all users. Use manage_local_workspace for local file staging. Downloads copy from Jira to workspace; uploads copy from workspace to Jira.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['list', 'upload', 'download', 'view', 'get_info', 'delete'],
          description: 'Operation to perform. list: attachments on an issue. upload: copy file from workspace to Jira issue. download: copy attachment from Jira to local workspace. view: display image inline. get_info: attachment metadata. delete: permanently remove attachment from Jira (affects all users).',
        },
        issueKey: {
          type: 'string',
          description: 'Issue key (e.g., PROJ-123). Required for list and upload.',
        },
        attachmentId: {
          type: 'string',
          description: 'Attachment ID. Required for download, view, get_info, delete.',
        },
        filename: {
          type: 'string',
          description: 'Filename for upload (required) or download (optional override).',
        },
        content: {
          type: 'string',
          description: 'Base64-encoded file content for upload. Alternative to workspaceFile.',
        },
        mediaType: {
          type: 'string',
          description: 'MIME type (e.g., "image/png", "application/pdf"). Required for upload.',
        },
        workspaceFile: {
          type: 'string',
          description: 'Filename in workspace to upload. Alternative to content. Use manage_local_workspace list to see staged files.',
        },
      },
      required: ['operation'],
    },
  },

  manage_local_workspace: {
    name: 'manage_local_workspace',
    description: 'Manage files in the local workspace staging area (local only — no Jira impact). Files downloaded via manage_jira_media land here. Delete only removes the local copy. Use manage_jira_media to affect attachments on Jira issues.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['list', 'read', 'write', 'delete', 'mkdir', 'move'],
          description: 'Operation to perform. list: show staged files. read: display file content. write: stage base64 content. delete: remove local file only (does not affect Jira). mkdir: create directory. move: rename/relocate file.',
        },
        filename: {
          type: 'string',
          description: 'Filename or path within workspace. Supports nesting with / separators.',
        },
        destination: {
          type: 'string',
          description: 'Destination path for move operation.',
        },
        content: {
          type: 'string',
          description: 'Base64-encoded content for write operation.',
        },
      },
      required: ['operation'],
    },
  },

  queue_jira_operations: {
    name: 'queue_jira_operations',
    description: 'Execute multiple Jira operations in a single call. Operations run sequentially with result references ($0.key) and per-operation error strategies (bail/continue). Powerful for analysis pipelines: create a filter, then run multiple analyze_jira_issues calls against $0.filterId with different groupBy/compute — all in one call.',
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
                enum: ['manage_jira_issue', 'manage_jira_filter', 'manage_jira_sprint', 'manage_jira_project', 'analyze_jira_issues', 'manage_jira_media', 'manage_jira_request', 'manage_local_workspace'],
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
