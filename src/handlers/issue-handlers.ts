import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from '../client/jira-client.js';
import { IssueExpansionOptions, IssueFormatter } from '../utils/formatters/index.js';

type GetIssueArgs = {
  issueKey: string;
  expand?: string[];
};

type UpdateIssueArgs = {
  issueKey: string;
  summary?: string;
  description?: string;
  parent?: string | null;
  assignee?: string;
  priority?: string;
  labels?: string[];
  customFields?: Record<string, any>;
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
    } else if (key === 'project_key') {
      normalized['projectKey'] = value;
    } else if (key === 'transition_id') {
      normalized['transitionId'] = value;
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
  
  // Validate expand parameter if present
  const typedArgs = args as GetIssueArgs;
  if (typedArgs.expand !== undefined) {
    if (!Array.isArray(typedArgs.expand)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid expand parameter. Expected an array of strings.'
      );
    }
    
    const validExpansions = ['comments', 'transitions', 'attachments', 'related_issues', 'history'];
    for (const expansion of typedArgs.expand) {
      if (typeof expansion !== 'string' || !validExpansions.includes(expansion)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid expansion: ${expansion}. Valid expansions are: ${validExpansions.join(', ')}`
        );
      }
    }
  }
  
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

        // Parse expansion options
        const expansionOptions: IssueExpansionOptions = {};
        if (normalizedArgs.expand) {
          for (const expansion of normalizedArgs.expand as string[]) {
            expansionOptions[expansion as keyof IssueExpansionOptions] = true;
          }
        }

        // Get issue with requested expansions
        const includeComments = expansionOptions.comments || false;
        const includeAttachments = expansionOptions.attachments || false;
        const issue = await jiraClient.getIssue(
          normalizedArgs.issueKey as string, 
          includeComments, 
          includeAttachments
        );
        
        // Get transitions if requested
        let transitions = undefined;
        if (expansionOptions.transitions) {
          transitions = await jiraClient.getTransitions(normalizedArgs.issueKey as string);
        }
        
        // Format the response using the IssueFormatter
        const formattedResponse = IssueFormatter.formatIssue(issue, expansionOptions, transitions);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(formattedResponse, null, 2),
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

        // Get the updated issue to return
        const updatedIssue = await jiraClient.getIssue(normalizedArgs.issueKey as string, false, false);
        const formattedResponse = IssueFormatter.formatIssue(updatedIssue);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(formattedResponse, null, 2),
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

        // Get the updated issue with comments to return
        const updatedIssue = await jiraClient.getIssue(normalizedArgs.issueKey as string, true, false);
        const formattedResponse = IssueFormatter.formatIssue(updatedIssue, { comments: true });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(formattedResponse, null, 2),
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

        // Get the updated issue to return
        const updatedIssue = await jiraClient.getIssue(normalizedArgs.issueKey as string, false, false);
        const formattedResponse = IssueFormatter.formatIssue(updatedIssue);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(formattedResponse, null, 2),
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
        
        // Get the created issue to return
        const createdIssue = await jiraClient.getIssue(result.key, false, false);
        const formattedResponse = IssueFormatter.formatIssue(createdIssue);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(formattedResponse, null, 2),
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
