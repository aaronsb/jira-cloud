#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { Version3Client, Version3Models } from 'jira.js';

// Jira credentials from environment variables
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_HOST = process.env.JIRA_HOST;

if (!JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_HOST) {
  throw new Error('Missing required Jira credentials in environment variables');
}

interface JiraIssueDetails {
  key: string;
  summary: string;
  description: string;
  assignee: string | null;
  reporter: string;
  status: string;
  resolution: string | null;
  dueDate: string | null;
  startDate: string | null;
  storyPoints: number | null;
  timeEstimate: number | null;
  issueLinks: Array<{
    type: string;
    outward: string | null;
    inward: string | null;
  }>;
  comments?: Array<{
    id: string;
    author: string;
    body: string;
    created: string;
  }>;
}

interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
  attrs?: Record<string, any>;
}

class JiraServer {
  private server: Server;
  private jiraClient: Version3Client;

  constructor() {
    this.server = new Server(
      {
        name: 'jira-cloud',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.jiraClient = new Version3Client({
      host: JIRA_HOST!,
      authentication: {
        basic: {
          email: JIRA_EMAIL!,
          apiToken: JIRA_API_TOKEN!,
        },
      },
    });

    this.setupToolHandlers();
    
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private extractTextFromAdf(node: AdfNode): string {
    if (!node) return '';

    if (node.type === 'text') {
      return node.text || '';
    }

    if (node.type === 'mention') {
      return `@${node.attrs?.text?.replace('@', '') || ''}`;
    }

    if (node.type === 'hardBreak' || node.type === 'paragraph') {
      return '\n';
    }

    if (node.content) {
      return node.content
        .map(child => this.extractTextFromAdf(child))
        .join('')
        .replace(/\n{3,}/g, '\n\n'); // Normalize multiple newlines
    }

    return '';
  }

  private isFieldPopulated(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    if (typeof value === 'object' && Object.keys(value).length === 0) return false;
    return true;
  }

  private shouldExcludeField(fieldId: string, fieldValue: any): boolean {
    // Exclude system metadata and UI-specific fields
    const excludePatterns = [
      'avatar',
      'icon',
      'self',
      'thumbnail',
      'timetracking',
      'worklog',
      'watches',
      'subtasks',
      'attachment',
      'aggregateprogress',
      'progress',
      'votes',
      '_links',
      'accountId',
      'emailAddress',
      'active',
      'timeZone',
      'accountType',
      '_expands',
      'groupIds',
      'portalId',
      'serviceDeskId',
      'issueTypeId',
      'renderedFields',
      'names',
      'id',
      'expand',
      'schema',
      'operations',
      'editmeta',
      'changelog',
      'versionedRepresentations',
      'fieldsToInclude',
      'properties',
      'updateAuthor',
      'jsdPublic',
      'mediaType',
      'maxResults',
      'total',
      'startAt',
      'iconUrls',
      'issuerestrictions',
      'shouldDisplay',
      'nonEditableReason',
      'hasEpicLinkFieldDependency',
      'showField',
      'statusDate',
      'statusCategory',
      'collection',
      'localId',
      'attrs',
      'marks',
      'layout',
      'version',
      'type',
      'content',
      'table',
      'tableRow',
      'tableCell',
      'mediaSingle',
      'media',
      'heading',
      'paragraph',
      'bulletList',
      'listItem',
      'orderedList',
      'rule',
      'inlineCard',
      'hardBreak',
      'workRatio',
      'parentLink',
      'restrictTo',
      'timeToResolution',
      'timeToFirstResponse',
      'slaForInitialResponse'
    ];

    // Also exclude email signature related fields and meaningless values
    if (typeof fieldValue === 'string') {
      // Email signature patterns
      const emailPatterns = [
        'CAUTION:',
        'From:',
        'Sent:',
        'To:',
        'Subject:',
        'Book time to meet with me',
        'Best-',
        'Best regards',
        'Kind regards',
        'Regards,',
        'Mobile',
        'Phone',
        'Tel:',
        'www.',
        'http://',
        'https://',
        '@.*\.com$', // Email addresses
        '^M:', // Mobile prefix
        'LLC',
        'Inc.',
        'Ltd.',
        'ForefrontDermatology.com',
        'Mobile:',
        'Office:',
        'Direct:'
      ];

      // Check for email patterns
      if (emailPatterns.some(pattern => 
        pattern.startsWith('^') || pattern.endsWith('$') 
          ? new RegExp(pattern).test(fieldValue)
          : fieldValue.includes(pattern)
      )) {
        return true;
      }

      // Exclude meaningless values
      if (fieldValue === '-1' || 
          fieldValue === 'false false' ||
          fieldValue === '0' ||
          fieldValue === 'true, ' ||
          fieldValue === '.' ||
          /^\s*$/.test(fieldValue)) { // Empty or whitespace only
        return true;
      }
    }

    // Exclude fields that are just punctuation or very short text
    if (typeof fieldValue === 'string' && 
        (fieldValue.trim().length <= 1 || 
         fieldValue.trim() === '.' || 
         fieldValue.trim() === '-' ||
         fieldValue.trim() === '_')) {
      return true;
    }

    return excludePatterns.some(pattern => fieldId.toLowerCase().includes(pattern.toLowerCase()));
  }

  private formatFieldValue(value: any, fieldName?: string): string {
    if (value === null || value === undefined) return '';
    
    // Handle arrays
    if (Array.isArray(value)) {
      // Special handling for comments
      if (fieldName === 'Comment' || fieldName === 'comments') {
        return value
          .map(comment => {
            const author = comment.author?.displayName || 'Unknown';
            let body = '';
            
            // Handle rich text content
            if (comment.body?.content) {
              body = this.extractTextFromAdf(comment.body);
            } else {
              body = String(comment.body || '');
            }

            // Clean up email signatures and formatting from body
            body = body
              .replace(/^[\s\S]*?From:[\s\S]*?Sent:[\s\S]*?To:[\s\S]*?Subject:[\s\S]*?\n/gm, '') // Remove email headers
              .replace(/^>.*$/gm, '') // Remove quoted text
              .replace(/_{3,}|-{3,}|={3,}/g, '') // Remove horizontal rules
              .replace(/(?:(?:https?|ftp):\/\/|\b(?:[a-z\d]+\.))(?:(?:[^\s()<>]+|\((?:[^\s()<>]+|(?:\([^\s()<>]+\)))?\))+(?:\((?:[^\s()<>]+|(?:\(?:[^\s()<>]+\)))?\)|[^\s`!()\[\]{};:'".,<>?«»""'']))?/g, '') // Remove URLs
              .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '') // Remove email addresses
              .replace(/(?:^|\s)(?:Best regards|Kind regards|Regards|Best|Thanks|Thank you|Cheers),.*/gs, '') // Remove signatures
              .replace(/(?:Mobile|Tel|Phone|Office|Direct):\s*[\d\s.+-]+/g, '') // Remove phone numbers
              .replace(/\n{3,}/g, '\n\n') // Normalize multiple newlines
              .trim();

            if (!body) return ''; // Skip empty comments after cleanup

            const created = new Date(comment.created).toLocaleString();
            return `${author} (${created}):\n${body}`;
          })
          .filter(comment => comment) // Remove empty comments
          .join('\n\n');
      }
      
      return value
        .map(item => this.formatFieldValue(item))
        .filter(item => item)
        .join(', ');
    }

    // Handle objects
    if (typeof value === 'object') {
      // Handle user objects
      if (value.displayName) {
        return value.displayName;
      }
      
      // Handle request type
      if (value.requestType?.name) {
        const desc = value.requestType.description ? 
          ': ' + value.requestType.description.split('.')[0] + '.' : // Just first sentence
          '';
        return `${value.requestType.name}${desc}`;
      }

      // Handle status objects
      if (value.status && value.statusCategory) {
        return `${value.status} (${value.statusCategory})`;
      }

      // Handle rich text content
      if (value.content) {
        return this.extractTextFromAdf(value);
      }

      // Handle simple name/value objects
      if (value.name) {
        return value.name;
      }
      if (value.value) {
        return value.value;
      }

      // For other objects, try to extract meaningful values
      const meaningful = Object.entries(value)
        .filter(([k, v]) => 
          !this.shouldExcludeField(k, v) && 
          v !== null && 
          v !== undefined && 
          !k.startsWith('_'))
        .map(([k, v]) => this.formatFieldValue(v))
        .filter(v => v)
        .join(' ');
      
      return meaningful || '';
    }

    // Format dates
    if (fieldName && (fieldName.toLowerCase().includes('date') || fieldName.toLowerCase().includes('created') || fieldName.toLowerCase().includes('updated'))) {
      try {
        return new Date(value).toLocaleString();
      } catch {
        return String(value);
      }
    }

    // Handle primitive values
    return String(value);
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
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
        {
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
        {
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
        {
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
        {
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
        {
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
        {
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
        {
          name: 'list_my_filters',
          description: 'List all Jira filters owned by the authenticated user',
          inputSchema: {
            type: 'object',
            properties: {
              expand: {
                type: 'boolean',
                description: 'Whether to include additional filter details like description and JQL',
                default: false
              }
            }
          }
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'get_issue':
            return await this.handleGetIssue(request.params.arguments);
          case 'get_filter_issues':
            return await this.handleGetFilterIssues(request.params.arguments);
          case 'update_issue':
            return await this.handleUpdateIssue(request.params.arguments);
          case 'add_comment':
            return await this.handleAddComment(request.params.arguments);
          case 'search_issues':
            return await this.handleSearchIssues(request.params.arguments);
          case 'get_transitions':
            return await this.handleGetTransitions(request.params.arguments);
          case 'get_populated_fields':
            return await this.handleGetPopulatedFields(request.params.arguments);
          case 'list_my_filters':
            return await this.handleListMyFilters(request.params.arguments);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error: any) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Jira API error: ${error.message}`
        );
      }
    });
  }

  private async handleListMyFilters(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
    const expand = args.expand === true;
    
    // Get filters owned by the authenticated user
    const filters = await this.jiraClient.filters.getMyFilters();
    
    // Map the filters to a more concise format
    const formattedFilters = await Promise.all(filters.map(async filter => {
      const basic = {
        id: filter.id,
        name: filter.name,
        owner: filter.owner?.displayName || 'Unknown',
        favourite: filter.favourite || false,
        viewUrl: filter.viewUrl
      };
      
      if (expand) {
        return {
          ...basic,
          description: filter.description || '',
          jql: filter.jql || '',
          sharePermissions: filter.sharePermissions?.map(perm => ({
            type: perm.type,
            group: perm.group?.name,
            project: perm.project?.name
          })) || []
        };
      }
      
      return basic;
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(formattedFilters, null, 2)
        }
      ]
    };
  }

  private async handleGetPopulatedFields(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (typeof args.issueKey !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid issue key');
    }

    // Get issue with all fields
    const issue = await this.jiraClient.issues.getIssue({
      issueIdOrKey: args.issueKey,
      expand: 'renderedFields,names',
    });

    const fieldNames = issue.names || {};
    const fields = issue.fields as Record<string, any>;
    
    // Build a text summary of populated fields
    const lines: string[] = [];
    
    // Add issue key and summary at the top
    lines.push(`Issue: ${issue.key}`);
    if (fields.summary) {
      lines.push(`Summary: ${fields.summary}`);
    }
    lines.push('');

    // Process priority fields first
    const priorityFields = [
      'Description',
      'Status',
      'Assignee',
      'Reporter',
      'Priority',
      'Created',
      'Updated'
    ];

    lines.push('=== Key Details ===');
    // Add priority fields first
    for (const priorityField of priorityFields) {
      for (const [fieldId, value] of Object.entries(fields)) {
        const fieldName = fieldNames[fieldId as keyof typeof fieldNames] || fieldId;
        if (fieldName === priorityField) {
          if (this.isFieldPopulated(value) && !this.shouldExcludeField(fieldId, value)) {
            const formattedValue = this.formatFieldValue(value, fieldName);
            if (formattedValue) {
              lines.push(`${fieldName}: ${formattedValue}`);
            }
          }
          break;
        }
      }
    }

    interface Categories {
      'Project Info': string[];
      'Links': string[];
      'Dates & Times': string[];
      'Request Details': string[];
      'Other Fields': string[];
      [key: string]: string[]; // Index signature for dynamic access
    }

    // Group remaining fields by category
    const categories: Categories = {
      'Project Info': ['Project', 'Issue Type', 'Request Type', 'Rank'],
      'Links': ['Gong Link', 'SalesForce Link'],
      'Dates & Times': ['Last Viewed', 'Status Category Changed', '[CHART] Date of First Response'],
      'Request Details': ['Request participants', 'Request language', 'Escalated', 'Next Steps'],
      'Other Fields': [] // For fields that don't match other categories
    };

    // Track all processed field names to prevent duplicates
    const processedFieldNames = new Set<string>(priorityFields);

    // Process remaining fields by category
    for (const [fieldId, value] of Object.entries(fields)) {
      const fieldName = fieldNames[fieldId as keyof typeof fieldNames] || fieldId;
      if (!processedFieldNames.has(fieldName)) {
        if (this.isFieldPopulated(value) && !this.shouldExcludeField(fieldId, value)) {
          const formattedValue = this.formatFieldValue(value, fieldName);
          if (formattedValue) {
            let categoryFound = false;
            for (const [category, categoryFields] of Object.entries(categories)) {
              if (category !== 'Other Fields') {
                const patterns = categoryFields as Array<string>;
                if (patterns.some(pattern => (fieldName as string).toLowerCase().includes(pattern.toLowerCase()))) {
                  if (!processedFieldNames.has(fieldName)) {
                    categories[category].push(fieldName);
                    processedFieldNames.add(fieldName);
                    categoryFound = true;
                    break;
                  }
                }
              }
            }
            if (!categoryFound && !processedFieldNames.has(fieldName)) {
              categories['Other Fields'].push(fieldName);
              processedFieldNames.add(fieldName);
            }
          }
        }
      }
    }

    // Add each category's fields
    for (const [category, categoryFields] of Object.entries(categories)) {
      if (categoryFields.length > 0) {
        lines.push('');
        lines.push(`=== ${category} ===`);
        for (const fieldName of categoryFields) {
          for (const [fieldId, value] of Object.entries(fields)) {
            const currentFieldName = fieldNames[fieldId as keyof typeof fieldNames] || fieldId;
            if (currentFieldName === fieldName) {
              const formattedValue = this.formatFieldValue(value, fieldName);
              if (formattedValue) {
                lines.push(`${fieldName}: ${formattedValue}`);
              }
              break;
            }
          }
        }
      }
    }

    // Add comments section if present
    if (fields.comment?.comments?.length > 0) {
      lines.push('');
      lines.push('=== Comments ===');
      const comments = this.formatFieldValue(fields.comment.comments, 'comments');
      if (comments.trim()) { // Only add if there are non-empty comments after cleanup
        lines.push(comments);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: lines.join('\n'),
        },
      ],
    };
  }

  private async handleGetIssue(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (typeof args.issueKey !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid issue key');
    }

    const fields = [
      'summary',
      'description',
      'assignee',
      'reporter',
      'status',
      'resolution',
      'duedate',
      'customfield_10015', // Start date
      'customfield_10016', // Story points
      'timeestimate',
      'issuelinks',
    ];

    const params: any = {
      issueIdOrKey: args.issueKey,
      fields,
    };

    if (args.includeComments) {
      params.expand = 'renderedFields,comments';
    }

    const issue = await this.jiraClient.issues.getIssue(params);

    const issueDetails: JiraIssueDetails = {
      key: issue.key,
      summary: issue.fields.summary,
      description: issue.fields.description ? this.extractTextFromAdf(issue.fields.description) : '',
      assignee: issue.fields.assignee?.displayName || null,
      reporter: issue.fields.reporter?.displayName || '',
      status: issue.fields.status?.name || '',
      resolution: issue.fields.resolution?.name || null,
      dueDate: issue.fields.duedate || null,
      startDate: issue.fields.customfield_10015 || null,
      storyPoints: issue.fields.customfield_10016 || null,
      timeEstimate: issue.fields.timeestimate,
      issueLinks: (issue.fields.issuelinks || []).map(link => ({
        type: link.type?.name || '',
        outward: link.outwardIssue?.key || null,
        inward: link.inwardIssue?.key || null,
      })),
    };

    if (args.includeComments && issue.fields.comment?.comments) {
      issueDetails.comments = issue.fields.comment.comments
        .filter(comment => 
          comment.id && 
          comment.author?.displayName &&
          comment.body &&
          comment.created
        )
        .map(comment => ({
          id: comment.id!,
          author: comment.author!.displayName!,
          body: comment.body?.content ? this.extractTextFromAdf(comment.body) : String(comment.body),
          created: comment.created!,
        }));
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(issueDetails, null, 2),
        },
      ],
    };
  }

  private async handleGetFilterIssues(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (typeof args.filterId !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid filter ID');
    }

    const filter = await this.jiraClient.filters.getFilter({
      id: args.filterId,
    });

    const searchResults = await this.jiraClient.issueSearch.searchForIssuesUsingJql({
      jql: filter.jql,
      fields: [
        'summary',
        'description',
        'assignee',
        'reporter',
        'status',
        'resolution',
        'duedate',
        'customfield_10015', // Start date
        'customfield_10016', // Story points
        'timeestimate',
        'issuelinks',
      ],
    });

    const issues: JiraIssueDetails[] = (searchResults.issues || []).map(issue => ({
      key: issue.key,
      summary: issue.fields.summary,
      description: issue.fields.description ? this.extractTextFromAdf(issue.fields.description) : '',
      assignee: issue.fields.assignee?.displayName || null,
      reporter: issue.fields.reporter?.displayName || '',
      status: issue.fields.status?.name || '',
      resolution: issue.fields.resolution?.name || null,
      dueDate: issue.fields.duedate || null,
      startDate: issue.fields.customfield_10015 || null,
      storyPoints: issue.fields.customfield_10016 || null,
      timeEstimate: issue.fields.timeestimate,
      issueLinks: (issue.fields.issuelinks || []).map(link => ({
        type: link.type?.name || '',
        outward: link.outwardIssue?.key || null,
        inward: link.inwardIssue?.key || null,
      })),
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(issues, null, 2),
        },
      ],
    };
  }

  private async handleUpdateIssue(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (typeof args.issueKey !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid issue key');
    }

    if (!args.summary && !args.description) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Must provide at least one of summary or description'
      );
    }

    const fields: any = {};
    if (args.summary) fields.summary = args.summary;
    if (args.description) {
      fields.description = {
        version: 1,
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: args.description
              }
            ]
          }
        ]
      };
    }

    await this.jiraClient.issues.editIssue({
      issueIdOrKey: args.issueKey,
      fields,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ message: 'Issue updated successfully' }, null, 2),
        },
      ],
    };
  }

  private async handleAddComment(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (typeof args.issueKey !== 'string' || typeof args.body !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid parameters');
    }

    const commentData = {
      issueIdOrKey: args.issueKey,
    } as any;
    commentData.body = args.body;

    await this.jiraClient.issueComments.addComment(commentData);

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

  private async handleSearchIssues(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (typeof args.jql !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid JQL query');
    }

    const startAt = typeof args.startAt === 'number' ? args.startAt : 0;
    const maxResults = typeof args.maxResults === 'number' ? 
      Math.min(args.maxResults, 100) : 25;

    const searchResults = await this.jiraClient.issueSearch.searchForIssuesUsingJql({
      jql: args.jql,
      startAt,
      maxResults,
      fields: [
        'summary',
        'description',
        'assignee',
        'reporter',
        'status',
        'resolution',
        'duedate',
        'customfield_10015', // Start date
        'customfield_10016', // Story points
        'timeestimate',
        'issuelinks',
      ],
    });

    const issues: JiraIssueDetails[] = (searchResults.issues || []).map(issue => ({
      key: issue.key,
      summary: issue.fields.summary,
      description: issue.fields.description ? this.extractTextFromAdf(issue.fields.description) : '',
      assignee: issue.fields.assignee?.displayName || null,
      reporter: issue.fields.reporter?.displayName || '',
      status: issue.fields.status?.name || '',
      resolution: issue.fields.resolution?.name || null,
      dueDate: issue.fields.duedate || null,
      startDate: issue.fields.customfield_10015 || null,
      storyPoints: issue.fields.customfield_10016 || null,
      timeEstimate: issue.fields.timeestimate,
      issueLinks: (issue.fields.issuelinks || []).map(link => ({
        type: link.type?.name || '',
        outward: link.outwardIssue?.key || null,
        inward: link.inwardIssue?.key || null,
      })),
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            issues,
            pagination: {
              startAt,
              maxResults,
              total: searchResults.total || 0,
              hasMore: (startAt + issues.length) < (searchResults.total || 0)
            }
          }, null, 2),
        },
      ],
    };
  }

  private async handleGetTransitions(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (typeof args.issueKey !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid issue key');
    }

    const transitions = await this.jiraClient.issues.getTransitions({
      issueIdOrKey: args.issueKey,
    });

    const allowedTransitions = transitions.transitions?.map(transition => ({
      id: transition.id,
      name: transition.name,
      to: {
        id: transition.to?.id,
        name: transition.to?.name,
        description: transition.to?.description,
      },
    })) || [];

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(allowedTransitions, null, 2),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Jira MCP server running on stdio');
  }
}

const server = new JiraServer();
server.run().catch(console.error);
