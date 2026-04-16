import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { fieldDiscovery } from '../client/field-discovery.js';
import { categoryLabel } from '../client/field-type-map.js';
import { JiraClient } from '../client/jira-client.js';
import { MarkdownRenderer } from '../mcp/markdown-renderer.js';
import type { HierarchyNode, HierarchyResult } from '../types/index.js';
import { bulkOperationGuard } from '../utils/bulk-operation-guard.js';
import { issueNextSteps } from '../utils/next-steps.js';
import { normalizeArgs } from '../utils/normalize-args.js';

type ManageJiraIssueArgs = {
  operation: 'create' | 'get' | 'update' | 'delete' | 'move' | 'transition' | 'comment' | 'link' | 'hierarchy' | 'worklog';
  issueKey?: string;
  projectKey?: string;
  summary?: string;
  description?: string;
  issueType?: string;
  priority?: string;
  assignee?: string;
  labels?: string[];
  dueDate?: string | null;
  originalEstimate?: string;
  remainingEstimate?: string;
  customFields?: Record<string, any>;
  transitionId?: string;
  comment?: string;
  timeSpent?: string;
  worklogComment?: string;
  started?: string;
  adjustEstimate?: 'auto' | 'leave' | 'new' | 'manual';
  newEstimate?: string;
  reduceBy?: string;
  linkType?: string;
  linkedIssueKey?: string;
  targetProjectKey?: string;
  targetIssueType?: string;
  expand?: string[];
  parent?: string | null;
  up?: number;
  down?: number;
};

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
      !['create', 'get', 'update', 'delete', 'move', 'transition', 'comment', 'link', 'hierarchy', 'worklog'].includes(normalizedArgs.operation as string)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid operation parameter. Valid values are: create, get, update, delete, move, transition, comment, link, hierarchy, worklog'
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
      
    case 'delete':
      if (typeof normalizedArgs.issueKey !== 'string' || normalizedArgs.issueKey.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid issueKey parameter. Please provide a valid issue key for the delete operation.'
        );
      }
      break;

    case 'move':
      if (typeof normalizedArgs.issueKey !== 'string' || normalizedArgs.issueKey.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid issueKey parameter. Please provide a valid issue key for the move operation.'
        );
      }
      if (typeof normalizedArgs.targetProjectKey !== 'string' || normalizedArgs.targetProjectKey.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid targetProjectKey parameter. Please provide the target project key for the move operation.'
        );
      }
      if (typeof normalizedArgs.targetIssueType !== 'string' || normalizedArgs.targetIssueType.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid targetIssueType parameter. Please provide the target issue type for the move operation.'
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
        normalizedArgs.dueDate === undefined &&
        normalizedArgs.originalEstimate === undefined &&
        normalizedArgs.remainingEstimate === undefined &&
        normalizedArgs.customFields === undefined
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'At least one update field (summary, description, parent, assignee, priority, labels, dueDate, originalEstimate, remainingEstimate, or customFields) must be provided for the update operation.'
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

    case 'worklog':
      if (typeof normalizedArgs.issueKey !== 'string' || normalizedArgs.issueKey.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid issueKey parameter. Please provide a valid issue key for the worklog operation.'
        );
      }
      if (typeof normalizedArgs.timeSpent !== 'string' || normalizedArgs.timeSpent.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid timeSpent parameter. Provide time in Jira format (e.g., "3h 30m", "1d", "2w").'
        );
      }
      if (normalizedArgs.adjustEstimate === 'new' && !normalizedArgs.newEstimate) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'newEstimate is required when adjustEstimate is "new" (e.g., "2d").'
        );
      }
      if (normalizedArgs.adjustEstimate === 'manual' && !normalizedArgs.reduceBy) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'reduceBy is required when adjustEstimate is "manual" (e.g., "1h").'
        );
      }
      break;

    case 'hierarchy':
      if (typeof normalizedArgs.issueKey !== 'string' || normalizedArgs.issueKey.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid issueKey parameter. Please provide a valid issue key for the hierarchy operation.'
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

/** Build catalog field metadata for passing to getIssue */
function getCatalogFieldMeta() {
  if (!fieldDiscovery.isReady()) return undefined;
  const catalog = fieldDiscovery.getCatalog();
  if (catalog.length === 0) return undefined;
  return catalog.map(f => ({
    id: f.id,
    name: f.name,
    type: categoryLabel(f.category),
    description: f.description,
  }));
}

/** Resolve field names to IDs in customFields, returns resolved object */
export function resolveCustomFieldNames(customFields: Record<string, any>): Record<string, any> {
  if (!fieldDiscovery.isReady()) return customFields;

  const resolved: Record<string, any> = {};
  for (const [key, value] of Object.entries(customFields)) {
    // If the key is already a field ID (customfield_XXXXX), pass through
    if (key.startsWith('customfield_')) {
      resolved[key] = value;
      continue;
    }
    // Try to resolve the name to an ID
    const fieldId = fieldDiscovery.resolveNameToId(key);
    if (fieldId) {
      resolved[fieldId] = value;
    } else {
      // Unknown field name — pass through as-is (may be a raw ID or system field)
      resolved[key] = value;
    }
  }
  return resolved;
}

const UNDESCRIBED_NAG_THRESHOLD = 0.5; // 50% or more

/** Generate a nag message if too many custom fields lack descriptions */
function getUndescribedFieldNag(): string {
  if (!fieldDiscovery.isReady()) return '';
  const stats = fieldDiscovery.getStats();
  if (!stats || stats.undescribedRatio < UNDESCRIBED_NAG_THRESHOLD) return '';
  if (stats.totalCustomFields === 0) return '';

  const pct = Math.round(stats.undescribedRatio * 100);
  const described = stats.catalogSize;
  const total = stats.totalCustomFields - stats.excludedLocked;

  return [
    '',
    '---',
    `**Custom field coverage:** ${described} of ${total} custom fields have descriptions (${pct}% undescribed).`,
    'AI tools can only discover and use custom fields that have descriptions in Jira.',
    'Ask your Jira admin to add descriptions to important custom fields for better AI support.',
  ].join('\n');
}

/** Combine next-steps guidance with the undescribed field nag */
function issueGuidance(operation: string, issueKey?: string): string {
  return issueNextSteps(operation, issueKey) + getUndescribedFieldNag();
}

// Handler functions for each operation
async function handleGetIssue(jiraClient: JiraClient, args: ManageJiraIssueArgs) {
  // Parse expansion options
  const expansionOptions: Record<string, boolean> = {};
  if (args.expand) {
    for (const expansion of args.expand) {
      expansionOptions[expansion] = true;
    }
  }

  // Get issue with requested expansions and catalog custom fields
  const includeComments = expansionOptions.comments || false;
  const includeAttachments = expansionOptions.attachments || false;
  const includeHistory = expansionOptions.history || false;
  const issue = await jiraClient.getIssue(
    args.issueKey!,
    includeComments,
    includeAttachments,
    getCatalogFieldMeta(),
    includeHistory,
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
        text: markdown + issueGuidance('get', args.issueKey),
      },
    ],
  };
}

async function handleMoveIssue(jiraClient: JiraClient, args: ManageJiraIssueArgs) {
  const issueKey = args.issueKey!;

  // Check bulk-destructive guard
  const deflection = bulkOperationGuard.check('move', issueKey, process.env.JIRA_HOST);
  if (deflection) {
    return { content: [{ type: 'text', text: deflection }], isError: true };
  }

  await jiraClient.moveIssue(issueKey, args.targetProjectKey!, args.targetIssueType!);
  bulkOperationGuard.record('move', issueKey);

  // Get the moved issue (it now has a new key in the target project)
  const movedIssue = await jiraClient.getIssue(issueKey, false, false);
  const markdown = MarkdownRenderer.renderIssue(movedIssue);

  return {
    content: [
      {
        type: 'text',
        text: `# Issue Moved\n\n${markdown}${issueGuidance('move', movedIssue.key)}`,
      },
    ],
  };
}

async function handleDeleteIssue(jiraClient: JiraClient, args: ManageJiraIssueArgs) {
  const issueKey = args.issueKey!;

  // Check bulk-destructive guard
  const deflection = bulkOperationGuard.check('delete', issueKey, process.env.JIRA_HOST);
  if (deflection) {
    return { content: [{ type: 'text', text: deflection }], isError: true };
  }

  // Get the issue details before deleting for a final snapshot
  const issue = await jiraClient.getIssue(issueKey, false, false);
  const markdown = MarkdownRenderer.renderIssue(issue);

  await jiraClient.deleteIssue(issueKey);
  bulkOperationGuard.record('delete', issueKey);

  return {
    content: [
      {
        type: 'text',
        text: `# Issue Deleted\n\nThe following issue has been permanently deleted:\n\n${markdown}${issueGuidance('delete', issueKey)}`,
      },
    ],
  };
}

async function handleCreateIssue(jiraClient: JiraClient, args: ManageJiraIssueArgs) {
  const customFields = args.customFields ? resolveCustomFieldNames(args.customFields) : undefined;

  const result = await jiraClient.createIssue({
    projectKey: args.projectKey!,
    summary: args.summary!,
    issueType: args.issueType!,
    description: args.description,
    priority: args.priority,
    assignee: args.assignee,
    labels: args.labels,
    dueDate: args.dueDate ?? undefined,
    originalEstimate: args.originalEstimate,
    customFields,
  });
  
  // Get the created issue and render to markdown
  const createdIssue = await jiraClient.getIssue(result.key, false, false);
  const markdown = MarkdownRenderer.renderIssue(createdIssue);

  return {
    content: [
      {
        type: 'text',
        text: `# Issue Created\n\n${markdown}${issueGuidance('create', result.key)}`,
      },
    ],
  };
}

async function handleUpdateIssue(jiraClient: JiraClient, args: ManageJiraIssueArgs) {
  const customFields = args.customFields ? resolveCustomFieldNames(args.customFields) : undefined;

  await jiraClient.updateIssue({
    issueKey: args.issueKey!,
    summary: args.summary,
    description: args.description,
    parentKey: args.parent,
    assignee: args.assignee,
    priority: args.priority,
    labels: args.labels,
    dueDate: args.dueDate,
    originalEstimate: args.originalEstimate,
    remainingEstimate: args.remainingEstimate,
    customFields,
  });

  // Get the updated issue and render to markdown
  const updatedIssue = await jiraClient.getIssue(args.issueKey!, false, false);
  const markdown = MarkdownRenderer.renderIssue(updatedIssue);

  return {
    content: [
      {
        type: 'text',
        text: `# Issue Updated\n\n${markdown}${issueGuidance('update', args.issueKey)}`,
      },
    ],
  };
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
        text: `# Issue Transitioned\n\n${markdown}${issueGuidance('transition', args.issueKey)}`,
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
        text: `# Comment Added\n\n${markdown}${issueGuidance('comment', args.issueKey)}`,
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
        text: `# Issue Linked\n\n${markdown}${issueGuidance('link', args.issueKey)}`,
      },
    ],
  };
}

async function handleWorklogIssue(jiraClient: JiraClient, args: ManageJiraIssueArgs) {
  await jiraClient.addWorklog({
    issueKey: args.issueKey!,
    timeSpent: args.timeSpent!,
    comment: args.worklogComment,
    started: args.started,
    adjustEstimate: args.adjustEstimate,
    newEstimate: args.newEstimate,
    reduceBy: args.reduceBy,
  });

  // Get the updated issue and render to markdown
  const updatedIssue = await jiraClient.getIssue(args.issueKey!, false, false);
  const markdown = MarkdownRenderer.renderIssue(updatedIssue);

  return {
    content: [
      {
        type: 'text',
        text: `# Worklog Added\n\nLogged ${args.timeSpent} on ${args.issueKey}\n\n${markdown}${issueGuidance('worklog', args.issueKey)}`,
      },
    ],
  };
}

function renderHierarchyTree(node: HierarchyNode, focusKey: string, prefix = '', isLast = true, isRoot = true): string {
  const connector = isRoot ? '' : (isLast ? '└─ ' : '├─ ');
  const marker = node.key === focusKey ? '  ← you are here' : '';
  const line = `${prefix}${connector}**${node.key}** ${node.issueType}: ${node.summary} [${node.status}]${marker}`;

  const childPrefix = isRoot ? '' : (prefix + (isLast ? '   ' : '│  '));
  const childLines = node.children.map((child, i) =>
    renderHierarchyTree(child, focusKey, childPrefix, i === node.children.length - 1, false)
  );

  return [line, ...childLines].join('\n');
}

async function handleHierarchy(jiraClient: JiraClient, args: ManageJiraIssueArgs) {
  const up = Math.min(Math.max(args.up ?? 4, 0), 8);
  const down = Math.min(Math.max(args.down ?? 4, 0), 8);

  console.error(`Fetching hierarchy for ${args.issueKey}: up=${up}, down=${down}`);

  const result: HierarchyResult = await jiraClient.getHierarchy(args.issueKey!, up, down);
  const tree = renderHierarchyTree(result.root, result.focusKey);

  const lines = [
    `# Issue Hierarchy: ${result.focusKey}`,
    '',
    `Traversed ${result.upDepth} level${result.upDepth !== 1 ? 's' : ''} up, ${result.downDepth} level${result.downDepth !== 1 ? 's' : ''} down`,
  ];
  if (result.truncated) {
    lines.push('', '⚠️ Results were truncated — some children may not be shown. Narrow the scope with smaller `up`/`down` values or focus on a specific subtree.');
  }
  lines.push('', tree);
  const summary = lines.join('\n');

  return {
    content: [{ type: 'text', text: summary + issueGuidance('hierarchy', args.issueKey) }],
  };
}

// Main handler function
export async function handleIssueRequest(
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

      case 'delete': {
        console.error('Processing delete issue operation');
        return await handleDeleteIssue(jiraClient, normalizedArgs as ManageJiraIssueArgs);
      }

      case 'move': {
        console.error('Processing move issue operation');
        return await handleMoveIssue(jiraClient, normalizedArgs as ManageJiraIssueArgs);
      }
      
      case 'update': {
        console.error('Processing update issue operation');
        return await handleUpdateIssue(jiraClient, normalizedArgs as ManageJiraIssueArgs);
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

      case 'worklog': {
        console.error('Processing worklog operation');
        return await handleWorklogIssue(jiraClient, normalizedArgs as ManageJiraIssueArgs);
      }

      case 'hierarchy': {
        console.error('Processing hierarchy operation');
        return await handleHierarchy(jiraClient, normalizedArgs as ManageJiraIssueArgs);
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
