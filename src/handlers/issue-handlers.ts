import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from '../client/jira-client.js';

type GetIssueArgs = {
  issueKey: string;
};

type GetIssueDetailsArgs = {
  issueKey: string;
};

type GetIssueAttachmentsArgs = {
  issueKey: string;
};

// Basic issue response type for get_issue
type BasicIssueResponse = {
  key: string;
  summary: string;
  status: string;
  assignee: string | null;
};

type UpdateIssueArgs = {
  issueKey: string;
  summary?: string;
  description?: string;
  parent?: string | null;
};

type AddCommentArgs = {
  issueKey: string;
  body: string;
};

type TransitionIssueArgs = {
  issueKey: string;
  transitionId: string;
  comment?: string;
};

type CreateIssueArgs = {
  projectKey: string;
  summary: string;
  description?: string;
  issueType: string;
  priority?: string;
  assignee?: string;
  labels?: string[];
  customFields?: Record<string, any>;
};

// Helper function to normalize parameter names (support both snake_case and camelCase)
function normalizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    // Convert snake_case to camelCase
    if (key === 'issue_key') {
      normalized['issueKey'] = value;
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

// Enhanced parameter validation with helpful error messages
function validateIssueKey(args: unknown, toolName: string): void {
  if (typeof args !== 'object' || args === null) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid ${toolName} arguments: Expected an object with an issueKey parameter. Example: { "issueKey": "WORK-123" } or { "issue_key": "WORK-123" }`
    );
  }

  const normalizedArgs = normalizeArgs(args as Record<string, unknown>);
  
  if (typeof normalizedArgs.issueKey !== 'string') {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Missing or invalid issueKey parameter. Please provide a valid issue key using either "issueKey" or "issue_key". Example: { "issueKey": "WORK-123" }`
    );
  }

  // Validate issue key format (e.g., PROJ-123)
  if (!/^[A-Z][A-Z0-9_]+(-\d+)?$/.test(normalizedArgs.issueKey as string)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid issue key format. Expected format: PROJ-123`
    );
  }
}

function isGetIssueArgs(args: unknown): args is GetIssueArgs {
  validateIssueKey(args, 'get_jira_issue');
  return true;
}

function isGetIssueDetailsArgs(args: unknown): args is GetIssueDetailsArgs {
  validateIssueKey(args, 'get_jira_issue_details');
  return true;
}

function isGetIssueAttachmentsArgs(args: unknown): args is GetIssueAttachmentsArgs {
  validateIssueKey(args, 'get_jira_issue_attachments');
  return true;
}

function isUpdateIssueArgs(args: unknown): args is UpdateIssueArgs {
  validateIssueKey(args, 'update_jira_issue');
  return true;
}

function isAddCommentArgs(args: unknown): args is AddCommentArgs {
  validateIssueKey(args, 'add_jira_comment');
  const normalizedArgs = normalizeArgs(args as Record<string, unknown>);
  if (typeof normalizedArgs.body !== 'string') {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Missing or invalid body parameter. Please provide a comment body as a string.'
    );
  }
  return true;
}

function isCreateIssueArgs(args: unknown): args is CreateIssueArgs {
  const typedArgs = args as CreateIssueArgs;
  return (
    typeof args === 'object' &&
    args !== null &&
    typeof typedArgs.projectKey === 'string' &&
    typeof typedArgs.summary === 'string' &&
    typeof typedArgs.issueType === 'string' &&
    (typedArgs.description === undefined || typeof typedArgs.description === 'string') &&
    (typedArgs.priority === undefined || typeof typedArgs.priority === 'string') &&
    (typedArgs.assignee === undefined || typeof typedArgs.assignee === 'string') &&
    (typedArgs.labels === undefined || Array.isArray(typedArgs.labels)) &&
    (typedArgs.customFields === undefined || typeof typedArgs.customFields === 'object')
  );
}

function isTransitionIssueArgs(args: unknown): args is TransitionIssueArgs {
  validateIssueKey(args, 'transition_jira_issue');
  const normalizedArgs = normalizeArgs(args as Record<string, unknown>);
  if (typeof normalizedArgs.transitionId !== 'string') {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Missing or invalid transitionId parameter. Please provide a valid transition ID as a string.'
    );
  }
  return true;
}

function hasIssueKey(args: unknown): args is { issueKey: string } {
  validateIssueKey(args, 'get_jira_populated_fields');
  return true;
}

export async function setupIssueHandlers(
  server: Server,
  jiraClient: JiraClient,
  request: {
    params: {
      name: string;
      arguments?: Record<string, unknown>;
    };
  }
) {
  console.error('Handling issue request...');
  const { name } = request.params;
  const args = request.params.arguments;

  if (!args) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Missing arguments. Please provide the required parameters for this operation.'
    );
  }

  // Normalize arguments to support both snake_case and camelCase
  const normalizedArgs = normalizeArgs(args);

  switch (name) {
      case 'get_jira_issue': {
        console.error('Processing get_jira_issue request');
        if (!isGetIssueArgs(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid get_issue arguments');
        }

        const issue = await jiraClient.getIssue(normalizedArgs.issueKey as string, false);
        
        // Return only basic information
        const basicResponse: BasicIssueResponse = {
          key: issue.key,
          summary: issue.summary,
          status: issue.status,
          assignee: issue.assignee,
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(basicResponse, null, 2),
            },
          ],
        };
      }

      case 'get_jira_issue_details': {
        console.error('Processing get_jira_issue_details request');
        if (!isGetIssueDetailsArgs(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid get_issue_details arguments');
        }

        // Get full issue details including comments but not attachments
        const issue = await jiraClient.getIssue(normalizedArgs.issueKey as string, true, false);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(issue, null, 2),
            },
          ],
        };
      }

      case 'get_jira_issue_attachments': {
        console.error('Processing get_jira_issue_attachments request');
        if (!isGetIssueAttachmentsArgs(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid get_issue_attachments arguments');
        }

        const attachments = await jiraClient.getIssueAttachments(normalizedArgs.issueKey as string);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(attachments, null, 2),
            },
          ],
        };
      }

      case 'get_jira_fields': {
        console.error('Processing get_jira_fields request');
        if (!hasIssueKey(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid get_jira_fields arguments');
        }

        const fields = await jiraClient.getPopulatedFields(normalizedArgs.issueKey as string);

        return {
          content: [
            {
              type: 'text',
              text: fields,
            },
          ],
        };
      }

      case 'get_jira_transitions': {
        console.error('Processing get_jira_transitions request');
        if (!hasIssueKey(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid get_jira_transitions arguments');
        }

        const transitions = await jiraClient.getTransitions(normalizedArgs.issueKey as string);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(transitions, null, 2),
            },
          ],
        };
      }

      case 'update_jira_issue': {
        console.error('Processing update_jira_issue request');
        if (!isUpdateIssueArgs(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid update_jira_issue arguments');
        }

        if (!normalizedArgs.summary && !normalizedArgs.description && normalizedArgs.parent === undefined) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Must provide at least one of summary, description, or parent'
          );
        }

        await jiraClient.updateIssue(
          normalizedArgs.issueKey as string,
          normalizedArgs.summary as string | undefined,
          normalizedArgs.description as string | undefined,
          normalizedArgs.parent as string | null | undefined
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ message: 'Issue updated successfully' }, null, 2),
            },
          ],
        };
      }

      case 'add_jira_comment': {
        console.error('Processing add_jira_comment request');
        if (!isAddCommentArgs(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid add_jira_comment arguments');
        }

        await jiraClient.addComment(normalizedArgs.issueKey as string, normalizedArgs.body as string);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: 'Comment added successfully',
                  body: normalizedArgs.body,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'transition_jira_issue': {
        console.error('Processing transition_jira_issue request');
        if (!isTransitionIssueArgs(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid transition_jira_issue arguments');
        }

        await jiraClient.transitionIssue(
          normalizedArgs.issueKey as string,
          normalizedArgs.transitionId as string,
          normalizedArgs.comment as string | undefined
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: 'Issue transitioned successfully',
                  transitionId: normalizedArgs.transitionId,
                  comment: normalizedArgs.comment || 'No comment provided',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'create_jira_issue': {
        console.error('Processing create_jira_issue request');
        if (!isCreateIssueArgs(normalizedArgs)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Invalid create_jira_issue arguments. Required: projectKey (string), summary (string), issueType (string)'
          );
        }

        const result = await jiraClient.createIssue(normalizedArgs);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: 'Issue created successfully',
                  key: result.key
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default: {
        console.error(`Unknown tool requested: ${name}`);
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    }
}
