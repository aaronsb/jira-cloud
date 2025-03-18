import { z } from 'zod';

// Sprint Management Schemas
export const CreateJiraSprintSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('create_jira_sprint'),
    arguments: z.object({
      boardId: z.number(),
      name: z.string(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      goal: z.string().optional(),
    }),
  }),
});

export const GetJiraSprintSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('get_jira_sprint'),
    arguments: z.object({
      sprintId: z.number(),
      expand: z.array(z.string()).optional(),
    }),
  }),
});

export const ListJiraSprintsSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('list_jira_sprints'),
    arguments: z.object({
      boardId: z.number(),
      state: z.enum(['future', 'active', 'closed']).optional(),
      startAt: z.number().optional(),
      maxResults: z.number().optional(),
      expand: z.array(z.string()).optional(),
    }),
  }),
});

export const UpdateJiraSprintSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('update_jira_sprint'),
    arguments: z.object({
      sprintId: z.number(),
      name: z.string().optional(),
      goal: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      state: z.enum(['future', 'active', 'closed']).optional(),
    }),
  }),
});

export const DeleteJiraSprintSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('delete_jira_sprint'),
    arguments: z.object({
      sprintId: z.number(),
    }),
  }),
});

export const UpdateSprintIssuesSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('update_sprint_issues'),
    arguments: z.object({
      sprintId: z.number(),
      add: z.array(z.string()).optional(),
      remove: z.array(z.string()).optional(),
    }),
  }),
});

// Consolidated API request schemas
export const GetJiraIssueSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('get_jira_issue'),
    arguments: z.object({
      issueKey: z.string(),
      expand: z.array(z.string()).optional(),
    }),
  }),
});

export const GetJiraProjectSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('get_jira_project'),
    arguments: z.object({
      projectKey: z.string(),
      expand: z.array(z.string()).optional(),
      include_status_counts: z.boolean().optional(),
    }),
  }),
});

export const GetJiraBoardSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('get_jira_board'),
    arguments: z.object({
      boardId: z.number(),
      expand: z.array(z.string()).optional(),
    }),
  }),
});

export const SearchJiraIssuesSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('search_jira_issues'),
    arguments: z.object({
      jql: z.string(),
      startAt: z.number().optional(),
      maxResults: z.number().optional(),
      expand: z.array(z.string()).optional(),
    }),
  }),
});

export const ListJiraProjectsSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('list_jira_projects'),
    arguments: z.object({
      include_status_counts: z.boolean().optional(),
    }),
  }),
});

export const ListJiraBoardsSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('list_jira_boards'),
    arguments: z.object({
      include_sprints: z.boolean().optional(),
    }),
  }),
});

export const CreateJiraIssueSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('create_jira_issue'),
    arguments: z.object({
      projectKey: z.string(),
      summary: z.string(),
      description: z.string().optional(),
      issueType: z.string(),
      priority: z.string().optional(),
      assignee: z.string().optional(),
      labels: z.array(z.string()).optional(),
      customFields: z.record(z.any()).optional(),
    }),
  }),
});

export const UpdateJiraIssueSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('update_jira_issue'),
    arguments: z.object({
      issueKey: z.string(),
      summary: z.string().optional(),
      description: z.string().optional(),
      parent: z.union([z.string(), z.null()]).optional(),
      assignee: z.string().optional(),
      priority: z.string().optional(),
      labels: z.array(z.string()).optional(),
      customFields: z.record(z.any()).optional(),
    }),
  }),
});

export const TransitionJiraIssueSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('transition_jira_issue'),
    arguments: z.object({
      issueKey: z.string(),
      transitionId: z.string(),
      comment: z.string().optional(),
    }),
  }),
});

export const AddJiraCommentSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('add_jira_comment'),
    arguments: z.object({
      issueKey: z.string(),
      body: z.string(),
    }),
  }),
});

// Export types
export type GetJiraIssueRequest = z.infer<typeof GetJiraIssueSchema>;
export type GetJiraProjectRequest = z.infer<typeof GetJiraProjectSchema>;
export type GetJiraBoardRequest = z.infer<typeof GetJiraBoardSchema>;
export type SearchJiraIssuesRequest = z.infer<typeof SearchJiraIssuesSchema>;
export type ListJiraProjectsRequest = z.infer<typeof ListJiraProjectsSchema>;
export type ListJiraBoardsRequest = z.infer<typeof ListJiraBoardsSchema>;
export type CreateJiraIssueRequest = z.infer<typeof CreateJiraIssueSchema>;
export type UpdateJiraIssueRequest = z.infer<typeof UpdateJiraIssueSchema>;
export type TransitionJiraIssueRequest = z.infer<typeof TransitionJiraIssueSchema>;
export type AddJiraCommentRequest = z.infer<typeof AddJiraCommentSchema>;

// Sprint types
export type CreateJiraSprintRequest = z.infer<typeof CreateJiraSprintSchema>;
export type GetJiraSprintRequest = z.infer<typeof GetJiraSprintSchema>;
export type ListJiraSprintsRequest = z.infer<typeof ListJiraSprintsSchema>;
export type UpdateJiraSprintRequest = z.infer<typeof UpdateJiraSprintSchema>;
export type DeleteJiraSprintRequest = z.infer<typeof DeleteJiraSprintSchema>;
export type UpdateSprintIssuesRequest = z.infer<typeof UpdateSprintIssuesSchema>;
