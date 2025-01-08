import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { JiraClient } from '../client/jira-client.js';

type GetIssueArgs = {
  issueKey: string;
  includeComments?: boolean;
};

type UpdateIssueArgs = {
  issueKey: string;
  summary?: string;
  description?: string;
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

  // Add server selection guidance based on issue key prefix
  const issueKeyPrefix = (normalizedArgs.issueKey as string).split('-')[0];
  const expectedServer = issueKeyPrefix === 'DEAL' ? 'prima' : 'jvl';
  const currentServer = process.env.JIRA_HOST?.includes('cprimeglobalsolutions') ? 'prima' : 'jvl';
  
  if (expectedServer !== currentServer) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Issue key "${normalizedArgs.issueKey}" should be used with the "${expectedServer}" server, but you're currently using "${currentServer}". DEAL issues use the prima server, other issues use the jvl server.`
    );
  }
}

function isGetIssueArgs(args: unknown): args is GetIssueArgs {
  validateIssueKey(args, 'get_issue');
  return true;
}

function isUpdateIssueArgs(args: unknown): args is UpdateIssueArgs {
  validateIssueKey(args, 'update_issue');
  return true;
}

function isAddCommentArgs(args: unknown): args is AddCommentArgs {
  validateIssueKey(args, 'add_comment');
  const normalizedArgs = normalizeArgs(args as Record<string, unknown>);
  if (typeof normalizedArgs.body !== 'string') {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Missing or invalid body parameter. Please provide a comment body as a string.'
    );
  }
  return true;
}

function isTransitionIssueArgs(args: unknown): args is TransitionIssueArgs {
  validateIssueKey(args, 'transition_issue');
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
  validateIssueKey(args, 'get_populated_fields');
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
      case 'get_issue': {
        console.error('Processing get_issue request');
        if (!isGetIssueArgs(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid get_issue arguments');
        }

        const issue = await jiraClient.getIssue(
          normalizedArgs.issueKey as string,
          normalizedArgs.includeComments as boolean || false
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(issue, null, 2),
            },
          ],
        };
      }

      case 'get_populated_fields': {
        console.error('Processing get_populated_fields request');
        if (!hasIssueKey(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid get_populated_fields arguments');
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

      case 'get_transitions': {
        console.error('Processing get_transitions request');
        if (!hasIssueKey(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid get_transitions arguments');
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

      case 'update_issue': {
        console.error('Processing update_issue request');
        if (!isUpdateIssueArgs(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid update_issue arguments');
        }

        if (!normalizedArgs.summary && !normalizedArgs.description) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Must provide at least one of summary or description'
          );
        }

        await jiraClient.updateIssue(
          normalizedArgs.issueKey as string,
          normalizedArgs.summary as string | undefined,
          normalizedArgs.description as string | undefined
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

      case 'add_comment': {
        console.error('Processing add_comment request');
        if (!isAddCommentArgs(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid add_comment arguments');
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

      case 'transition_issue': {
        console.error('Processing transition_issue request');
        if (!isTransitionIssueArgs(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid transition_issue arguments');
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

      default: {
        console.error(`Unknown tool requested: ${name}`);
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    }
}
