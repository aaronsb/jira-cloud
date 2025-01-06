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

function isGetIssueArgs(args: unknown): args is GetIssueArgs {
  return typeof args === 'object' && args !== null && 
    typeof (args as GetIssueArgs).issueKey === 'string';
}

function isUpdateIssueArgs(args: unknown): args is UpdateIssueArgs {
  return typeof args === 'object' && args !== null && 
    typeof (args as UpdateIssueArgs).issueKey === 'string';
}

function isAddCommentArgs(args: unknown): args is AddCommentArgs {
  return typeof args === 'object' && args !== null && 
    typeof (args as AddCommentArgs).issueKey === 'string' &&
    typeof (args as AddCommentArgs).body === 'string';
}

function hasIssueKey(args: unknown): args is { issueKey: string } {
  return typeof args === 'object' && args !== null && 
    typeof (args as { issueKey: string }).issueKey === 'string';
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
    throw new McpError(ErrorCode.InvalidParams, 'Missing arguments');
  }

  switch (name) {
      case 'get_issue': {
        console.error('Processing get_issue request');
        if (!isGetIssueArgs(args)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid get_issue arguments');
        }

        const issue = await jiraClient.getIssue(
          args.issueKey,
          args.includeComments || false
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
        if (!hasIssueKey(args)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid get_populated_fields arguments');
        }

        const fields = await jiraClient.getPopulatedFields(args.issueKey);

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
        if (!hasIssueKey(args)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid get_transitions arguments');
        }

        const transitions = await jiraClient.getTransitions(args.issueKey);

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
        if (!isUpdateIssueArgs(args)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid update_issue arguments');
        }

        if (!args.summary && !args.description) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Must provide at least one of summary or description'
          );
        }

        await jiraClient.updateIssue(
          args.issueKey,
          args.summary,
          args.description
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
        if (!isAddCommentArgs(args)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid add_comment arguments');
        }

        await jiraClient.addComment(args.issueKey, args.body);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: 'Comment added successfully',
                  body: args.body,
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
