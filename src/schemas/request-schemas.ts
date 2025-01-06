import { z } from 'zod';

export const GetIssueSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('get_issue'),
    arguments: z.object({
      issueKey: z.string(),
      includeComments: z.boolean().optional(),
    }),
  }),
});

export const GetPopulatedFieldsSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('get_populated_fields'),
    arguments: z.object({
      issueKey: z.string(),
    }),
  }),
});

export const GetTransitionsSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('get_transitions'),
    arguments: z.object({
      issueKey: z.string(),
    }),
  }),
});

export const UpdateIssueSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('update_issue'),
    arguments: z.object({
      issueKey: z.string(),
      summary: z.string().optional(),
      description: z.string().optional(),
    }),
  }),
});

export const AddCommentSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('add_comment'),
    arguments: z.object({
      issueKey: z.string(),
      body: z.string(),
    }),
  }),
});

export const SearchIssuesSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('search_issues'),
    arguments: z.object({
      jql: z.string(),
      startAt: z.number().optional(),
      maxResults: z.number().optional(),
    }),
  }),
});

export const GetFilterIssuesSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('get_filter_issues'),
    arguments: z.object({
      filterId: z.string(),
    }),
  }),
});

export const ListMyFiltersSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('list_my_filters'),
    arguments: z.object({
      expand: z.boolean().optional(),
    }),
  }),
});

export type GetIssueRequest = z.infer<typeof GetIssueSchema>;
export type GetPopulatedFieldsRequest = z.infer<typeof GetPopulatedFieldsSchema>;
export type GetTransitionsRequest = z.infer<typeof GetTransitionsSchema>;
export type UpdateIssueRequest = z.infer<typeof UpdateIssueSchema>;
export type AddCommentRequest = z.infer<typeof AddCommentSchema>;
export type SearchIssuesRequest = z.infer<typeof SearchIssuesSchema>;
export type GetFilterIssuesRequest = z.infer<typeof GetFilterIssuesSchema>;
export type ListMyFiltersRequest = z.infer<typeof ListMyFiltersSchema>;
