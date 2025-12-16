import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from '../client/jira-client.js';
import { IssueExpansionOptions, IssueFormatter } from '../utils/formatters/index.js';
import { MarkdownRenderer } from '../mcp/markdown-renderer.js';

/**
 * Issue Handlers
 * 
 * This file implements handlers for the manage_jira_issue tool.
 * 
 * Dependency Injection Pattern:
 * - All handler functions receive the jiraClient as their first parameter for consistency
 * - When a parameter is intentionally unused, it is prefixed with an underscore (_jiraClient)
 * - This pattern ensures consistent function signatures and satisfies ESLint rules for unused variables
 * - It also makes the code more maintainable by preserving the dependency injection pattern throughout
 */

// Type definition for the manage_jira_issue tool
type ManageJiraIssueArgs = {
  operation: 'create' | 'get' | 'update' | 'delete' | 'transition' | 'comment' | 'link';
  issueKey?: string;
  projectKey?: string;
  summary?: string;
  description?: string;
  issueType?: string;
  priority?: string;
  assignee?: string;
  labels?: string[];
  customFields?: Record<string, any>;
  transitionId?: string;
  comment?: string;
  linkType?: string;
  linkedIssueKey?: string;
  expand?: string[];
  parent?: string | null;
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
    } else if (key === 'issue_type') {
      normalized['issueType'] = value;
    } else if (key === 'transition_id') {
      normalized['transitionId'] = value;
    } else if (key === 'linked_issue_key') {
      normalized['linkedIssueKey'] = value;
    } else if (key === 'link_type') {
      normalized['linkType'] = value;
    } else if (key === 'custom_fields') {
      normalized['customFields'] = value;
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

// Validate the manage_jira_issue arguments
function validateManageJiraIssueArgs(args: unknown): args is ManageJiraIssueArgs {
  if (typeof args !== 'object' || args === null) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid manage_jira_issue arguments: Expected an object with an operation parameter'
    );
  }

  const normalizedArgs = normalizeArgs(args as Record<string, unknown>);
  
  // Validate operation parameter
  if (typeof normalizedArgs.operation !== 'string' || 
      !['create', 'get', 'update', 'delete', 'transition', 'comment', 'link'].includes(normalizedArgs.operation as string)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid operation parameter. Valid values are: create, get, update, delete, transition, comment, link'
    );
  }

  // Validate parameters based on operation
  switch (normalizedArgs.operation) {
    case 'get':
      if (typeof normalizedArgs.issueKey !== 'string' || normalizedArgs.issueKey.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid issueKey parameter. Please provide a valid issue key for the get operation.'
        );
      }
      break;
      
    case 'create':
      if (typeof normalizedArgs.projectKey !== 'string' || normalizedArgs.projectKey.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid projectKey parameter. Please provide a valid project key for the create operation.'
        );
      }
      if (typeof normalizedArgs.summary !== 'string' || normalizedArgs.summary.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid summary parameter. Please provide a valid summary for the create operation.'
        );
      }
      if (typeof normalizedArgs.issueType !== 'string' || normalizedArgs.issueType.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid issueType parameter. Please provide a valid issue type for the create operation.'
        );
      }
      break;
      
    case 'update':
      if (typeof normalizedArgs.issueKey !== 'string' || normalizedArgs.issueKey.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid issueKey parameter. Please provide a valid issue key for the update operation.'
        );
      }
      // Ensure at least one update field is provided
      if (
        normalizedArgs.summary === undefined &&
        normalizedArgs.description === undefined &&
        normalizedArgs.parent === undefined &&
        normalizedArgs.assignee === undefined &&
        normalizedArgs.priority === undefined &&
        normalizedArgs.labels === undefined &&
        normalizedArgs.customFields === undefined
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'At least one update field (summary, description, parent, assignee, priority, labels, or customFields) must be provided for the update operation.'
        );
      }
      break;
      
    case 'delete':
      if (typeof normalizedArgs.issueKey !== 'string' || normalizedArgs.issueKey.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid issueKey parameter. Please provide a valid issue key for the delete operation.'
        );
      }
      break;
      
    case 'transition':
      if (typeof normalizedArgs.issueKey !== 'string' || normalizedArgs.issueKey.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid issueKey parameter. Please provide a valid issue key for the transition operation.'
        );
      }
      if (typeof normalizedArgs.transitionId !== 'string' || normalizedArgs.transitionId.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid transitionId parameter. Please provide a valid transition ID for the transition operation.'
        );
      }
      break;
      
    case 'comment':
      if (typeof normalizedArgs.issueKey !== 'string' || normalizedArgs.issueKey.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid issueKey parameter. Please provide a valid issue key for the comment operation.'
        );
      }
      if (typeof normalizedArgs.comment !== 'string' || normalizedArgs.comment.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid comment parameter. Please provide a valid comment for the comment operation.'
        );
      }
      break;
      
    case 'link':
      if (typeof normalizedArgs.issueKey !== 'string' || normalizedArgs.issueKey.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid issueKey parameter. Please provide a valid issue key for the link operation.'
        );
      }
      if (typeof normalizedArgs.linkedIssueKey !== 'string' || normalizedArgs.linkedIssueKey.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid linkedIssueKey parameter. Please provide a valid linked issue key for the link operation.'
        );
      }
      if (typeof normalizedArgs.linkType !== 'string' || normalizedArgs.linkType.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid linkType parameter. Please provide a valid link type for the link operation.'
        );
      }
      break;
  }

  // Validate expand parameter
  if (normalizedArgs.expand !== undefined) {
    if (!Array.isArray(normalizedArgs.expand)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid expand parameter. Expected an array of strings.'
      );
    }
    
    const validExpansions = ['comments', 'transitions', 'attachments', 'related_issues', 'history'];
    for (const expansion of normalizedArgs.expand) {
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

// Handler functions for each operation
async function handleGetIssue(jiraClient: JiraClient, args: ManageJiraIssueArgs) {
  // Parse expansion options
  const expansionOptions: IssueExpansionOptions = {};
  if (args.expand) {
    for (const expansion of args.expand) {
      expansionOptions[expansion as keyof IssueExpansionOptions] = true;
    }
  }

  // Get issue with requested expansions
  const includeComments = expansionOptions.comments || false;
  const includeAttachments = expansionOptions.attachments || false;
  const issue = await jiraClient.getIssue(
    args.issueKey!, 
    includeComments, 
    includeAttachments
  );
  
  // Get transitions if requested
  let transitions = undefined;
  if (expansionOptions.transitions) {
    transitions = await jiraClient.getTransitions(args.issueKey!);
  }
  
  // Render to markdown
  const markdown = MarkdownRenderer.renderIssue(issue, transitions);

  return {
    content: [
      {
        type: 'text',
        text: markdown,
      },
    ],
  };
}

async function handleCreateIssue(jiraClient: JiraClient, args: ManageJiraIssueArgs) {
  const result = await jiraClient.createIssue({
    projectKey: args.projectKey!,
    summary: args.summary!,
    issueType: args.issueType!,
    description: args.description,
    priority: args.priority,
    assignee: args.assignee,
    labels: args.labels,
    customFields: args.customFields
  });
  
  // Get the created issue and render to markdown
  const createdIssue = await jiraClient.getIssue(result.key, false, false);
  const markdown = MarkdownRenderer.renderIssue(createdIssue);

  return {
    content: [
      {
        type: 'text',
        text: `# Issue Created\n\n${markdown}`,
      },
    ],
  };
}

async function handleUpdateIssue(jiraClient: JiraClient, args: ManageJiraIssueArgs) {
  await jiraClient.updateIssue(
    args.issueKey!,
    args.summary,
    args.description,
    args.parent
  );

  // Get the updated issue and render to markdown
  const updatedIssue = await jiraClient.getIssue(args.issueKey!, false, false);
  const markdown = MarkdownRenderer.renderIssue(updatedIssue);

  return {
    content: [
      {
        type: 'text',
        text: `# Issue Updated\n\n${markdown}`,
      },
    ],
  };
}

async function handleDeleteIssue(_jiraClient: JiraClient, _args: ManageJiraIssueArgs) {
  // Note: This is a placeholder. The current JiraClient doesn't have a deleteIssue method.
  // You would need to implement this in the JiraClient class.
  throw new McpError(
    ErrorCode.InternalError,
    'Delete issue operation is not yet implemented'
  );

  // When implemented, it would look something like this:
  /*
  await _jiraClient.deleteIssue(_args.issueKey!);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: `Issue ${_args.issueKey} has been deleted successfully.`,
        }, null, 2),
      },
    ],
  };
  */
}

async function handleTransitionIssue(jiraClient: JiraClient, args: ManageJiraIssueArgs) {
  await jiraClient.transitionIssue(
    args.issueKey!,
    args.transitionId!,
    args.comment
  );

  // Get the updated issue and render to markdown
  const updatedIssue = await jiraClient.getIssue(args.issueKey!, false, false);
  const markdown = MarkdownRenderer.renderIssue(updatedIssue);

  return {
    content: [
      {
        type: 'text',
        text: `# Issue Transitioned\n\n${markdown}`,
      },
    ],
  };
}

async function handleCommentIssue(jiraClient: JiraClient, args: ManageJiraIssueArgs) {
  await jiraClient.addComment(args.issueKey!, args.comment!);

  // Get the updated issue with comments and render to markdown
  const updatedIssue = await jiraClient.getIssue(args.issueKey!, true, false);
  const markdown = MarkdownRenderer.renderIssue(updatedIssue);

  return {
    content: [
      {
        type: 'text',
        text: `# Comment Added\n\n${markdown}`,
      },
    ],
  };
}

async function handleLinkIssue(jiraClient: JiraClient, args: ManageJiraIssueArgs) {
  console.error(`Linking issue ${args.issueKey} to ${args.linkedIssueKey} with type ${args.linkType}`);

  // Link the issues
  await jiraClient.linkIssues(
    args.issueKey!,
    args.linkedIssueKey!,
    args.linkType!,
    args.comment
  );

  // Get the updated issue and render to markdown
  const updatedIssue = await jiraClient.getIssue(args.issueKey!, false, false);
  const markdown = MarkdownRenderer.renderIssue(updatedIssue);

  return {
    content: [
      {
        type: 'text',
        text: `# Issue Linked\n\n${markdown}`,
      },
    ],
  };
}

// Main handler function
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

  // Handle the manage_jira_issue tool
  if (name === 'manage_jira_issue') {
    // Normalize arguments to support both snake_case and camelCase
    const normalizedArgs = normalizeArgs(args);
    
    // Validate arguments
    if (!validateManageJiraIssueArgs(normalizedArgs)) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid manage_jira_issue arguments');
    }

    // Process the operation
    switch (normalizedArgs.operation) {
      case 'get': {
        console.error('Processing get issue operation');
        return await handleGetIssue(jiraClient, normalizedArgs as ManageJiraIssueArgs);
      }
      
      case 'create': {
        console.error('Processing create issue operation');
        return await handleCreateIssue(jiraClient, normalizedArgs as ManageJiraIssueArgs);
      }
      
      case 'update': {
        console.error('Processing update issue operation');
        return await handleUpdateIssue(jiraClient, normalizedArgs as ManageJiraIssueArgs);
      }
      
      case 'delete': {
        console.error('Processing delete issue operation');
        return await handleDeleteIssue(jiraClient, normalizedArgs as ManageJiraIssueArgs);
      }
      
      case 'transition': {
        console.error('Processing transition issue operation');
        return await handleTransitionIssue(jiraClient, normalizedArgs as ManageJiraIssueArgs);
      }
      
      case 'comment': {
        console.error('Processing comment issue operation');
        return await handleCommentIssue(jiraClient, normalizedArgs as ManageJiraIssueArgs);
      }
      
      case 'link': {
        console.error('Processing link issue operation');
        return await handleLinkIssue(jiraClient, normalizedArgs as ManageJiraIssueArgs);
      }
      
      default: {
        console.error(`Unknown operation: ${normalizedArgs.operation}`);
        throw new McpError(ErrorCode.MethodNotFound, `Unknown operation: ${normalizedArgs.operation}`);
      }
    }
  }

  console.error(`Unknown tool requested: ${name}`);
  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
}
