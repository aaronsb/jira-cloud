import { Version3Client, AgileClient } from 'jira.js';
import type { Project } from 'jira.js/out/version3/models';
import { JiraConfig, JiraIssueDetails, FilterResponse, TransitionDetails, SearchResponse, BoardResponse, SprintResponse, JiraAttachment } from '../types/index.js';
import { TextProcessor } from '../utils/text-processing.js';

export class JiraClient {
  private client: Version3Client;
  private agileClient: AgileClient;
  private customFields: {
    startDate: string;
    storyPoints: string;
  };

  constructor(config: JiraConfig) {
    const clientConfig = {
      host: config.host,
      authentication: {
        basic: {
          email: config.email,
          apiToken: config.apiToken,
        },
      },
    };
    
    this.client = new Version3Client(clientConfig);
    this.agileClient = new AgileClient(clientConfig);

    // Set custom field mappings with defaults
    this.customFields = {
      startDate: config.customFields?.startDate ?? 'customfield_10015',
      storyPoints: config.customFields?.storyPoints ?? 'customfield_10016',
    };
  }

  async getIssue(issueKey: string, includeComments = false, includeAttachments = false): Promise<JiraIssueDetails> {
    const fields = [
      'summary',
      'description',
      'parent',
      'assignee',
      'reporter',
      'status',
      'resolution',
      'duedate',
      this.customFields.startDate,
      this.customFields.storyPoints,
      'timeestimate',
      'issuelinks',
    ];

    if (includeAttachments) {
      fields.push('attachment');
    }

    const params: any = {
      issueIdOrKey: issueKey,
      fields,
      expand: includeComments ? 'renderedFields,comments' : 'renderedFields'
    };

    const issue = await this.client.issues.getIssue(params);

    const issueDetails: JiraIssueDetails = {
      key: issue.key,
      summary: issue.fields.summary,
      description: (issue as any).renderedFields?.description || '',
      parent: issue.fields.parent?.key || null,
      assignee: issue.fields.assignee?.displayName || null,
      reporter: issue.fields.reporter?.displayName || '',
      status: issue.fields.status?.name || '',
      resolution: issue.fields.resolution?.name || null,
      dueDate: issue.fields.duedate || null,
      startDate: issue.fields[this.customFields.startDate] || null,
      storyPoints: issue.fields[this.customFields.storyPoints] || null,
      timeEstimate: issue.fields.timeestimate || null,
      issueLinks: (issue.fields.issuelinks || []).map(link => ({
        type: link.type?.name || '',
        outward: link.outwardIssue?.key || null,
        inward: link.inwardIssue?.key || null,
      })),
    };

    if (includeComments && issue.fields.comment?.comments) {
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
          body: comment.body?.content ? TextProcessor.extractTextFromAdf(comment.body) : String(comment.body),
          created: comment.created!,
        }));
    }

    if (includeAttachments && issue.fields.attachment) {
      issueDetails.attachments = issue.fields.attachment
        .filter(attachment => 
          attachment.id &&
          attachment.filename &&
          attachment.mimeType &&
          attachment.created &&
          attachment.author?.displayName
        )
        .map(attachment => ({
          id: attachment.id!,
          filename: attachment.filename!,
          mimeType: attachment.mimeType!,
          size: attachment.size || 0,
          created: attachment.created!,
          author: attachment.author!.displayName!,
          url: attachment.content || '',
        }));
    }

    return issueDetails;
  }

  async getIssueAttachments(issueKey: string): Promise<JiraAttachment[]> {
    const issue = await this.client.issues.getIssue({
      issueIdOrKey: issueKey,
      fields: ['attachment'],
    });

    if (!issue.fields.attachment) {
      return [];
    }

    return issue.fields.attachment
      .filter(attachment => 
        attachment.id &&
        attachment.filename &&
        attachment.mimeType &&
        attachment.created &&
        attachment.author?.displayName
      )
      .map(attachment => ({
        id: attachment.id!,
        filename: attachment.filename!,
        mimeType: attachment.mimeType!,
        size: attachment.size || 0,
        created: attachment.created!,
        author: attachment.author!.displayName!,
        url: attachment.content || '',
      }));
  }

  async getFilterIssues(filterId: string): Promise<JiraIssueDetails[]> {
    const filter = await this.client.filters.getFilter({ 
      id: parseInt(filterId, 10) 
    }) as { jql?: string };
    
    if (!filter?.jql) {
      throw new Error('Invalid filter or missing JQL');
    }

    const searchResults = await this.client.issueSearch.searchForIssuesUsingJql({
      jql: filter.jql,
      fields: [
        'summary',
        'description',
        'assignee',
        'reporter',
        'status',
        'resolution',
        'duedate',
        this.customFields.startDate,
        this.customFields.storyPoints,
        'timeestimate',
        'issuelinks',
      ],
      expand: 'renderedFields'
    });

    return (searchResults.issues || []).map(issue => ({
      key: issue.key,
      summary: issue.fields.summary,
      description: (issue as any).renderedFields?.description || '',
      parent: issue.fields.parent?.key || null,
      assignee: issue.fields.assignee?.displayName || null,
      reporter: issue.fields.reporter?.displayName || '',
      status: issue.fields.status?.name || '',
      resolution: issue.fields.resolution?.name || null,
      dueDate: issue.fields.duedate || null,
      startDate: issue.fields[this.customFields.startDate] || null,
      storyPoints: issue.fields[this.customFields.storyPoints] || null,
      timeEstimate: issue.fields.timeestimate || null,
      issueLinks: (issue.fields.issuelinks || []).map(link => ({
        type: link.type?.name || '',
        outward: link.outwardIssue?.key || null,
        inward: link.inwardIssue?.key || null,
      })),
    }));
  }

  async updateIssue(issueKey: string, summary?: string, description?: string, parentKey?: string | null): Promise<void> {
    const fields: any = {};
    if (summary) fields.summary = summary;
    if (description) {
      fields.description = TextProcessor.markdownToAdf(description);
    }
    if (parentKey !== undefined) {
      fields.parent = parentKey ? { key: parentKey } : null;
    }

    await this.client.issues.editIssue({
      issueIdOrKey: issueKey,
      fields,
    });
  }

  async addComment(issueKey: string, commentBody: string): Promise<void> {
    await this.client.issueComments.addComment({
      issueIdOrKey: issueKey,
      comment: TextProcessor.markdownToAdf(commentBody)
    });
  }

  async searchIssues(jql: string, startAt = 0, maxResults = 25): Promise<SearchResponse> {
    try {
      // Remove escaped quotes from JQL
      const cleanJql = jql.replace(/\\"/g, '"');
      console.error(`Executing JQL search with query: ${cleanJql}`);
      
      const searchResults = await this.client.issueSearch.searchForIssuesUsingJql({
        jql: cleanJql,
        startAt,
        maxResults: Math.min(maxResults, 100),
        fields: [
        'summary',
        'description',
        'assignee',
        'reporter',
        'status',
        'resolution',
        'duedate',
        this.customFields.startDate,
        this.customFields.storyPoints,
        'timeestimate',
        'issuelinks',
      ],
      expand: 'renderedFields'
    });

    const issues = (searchResults.issues || []).map(issue => ({
      key: issue.key,
      summary: issue.fields.summary,
      description: (issue as any).renderedFields?.description || '',
      parent: issue.fields.parent?.key || null,
      assignee: issue.fields.assignee?.displayName || null,
      reporter: issue.fields.reporter?.displayName || '',
      status: issue.fields.status?.name || '',
      resolution: issue.fields.resolution?.name || null,
      dueDate: issue.fields.duedate || null,
      startDate: issue.fields[this.customFields.startDate] || null,
      storyPoints: issue.fields[this.customFields.storyPoints] || null,
      timeEstimate: issue.fields.timeestimate || null,
      issueLinks: (issue.fields.issuelinks || []).map(link => ({
        type: link.type?.name || '',
        outward: link.outwardIssue?.key || null,
        inward: link.inwardIssue?.key || null,
      })),
    }));

      return {
        issues,
        pagination: {
          startAt,
          maxResults,
          total: searchResults.total || 0,
          hasMore: (startAt + issues.length) < (searchResults.total || 0)
        }
      };
    } catch (error) {
      console.error('Error executing JQL search:', error);
      throw error;
    }
  }

  async getTransitions(issueKey: string): Promise<TransitionDetails[]> {
    const transitions = await this.client.issues.getTransitions({
      issueIdOrKey: issueKey,
    });

    return (transitions.transitions || [])
      .filter(transition => transition.id && transition.name && transition.to)
      .map(transition => ({
        id: transition.id!,
        name: transition.name!,
        to: {
          id: transition.to!.id || '',
          name: transition.to!.name || '',
          description: transition.to!.description,
        },
      }));
  }

  async transitionIssue(issueKey: string, transitionId: string, comment?: string): Promise<void> {
    const transitionRequest: any = {
      issueIdOrKey: issueKey,
      transition: {
        id: transitionId
      }
    };

    if (comment) {
      transitionRequest.update = {
        comment: [{
          add: {
            body: TextProcessor.markdownToAdf(comment)
          }
        }]
      };
    }

    await this.client.issues.doTransition(transitionRequest);
  }

  async getPopulatedFields(issueKey: string): Promise<string> {
    const issue = await this.client.issues.getIssue({
      issueIdOrKey: issueKey,
      expand: 'renderedFields,names',
    });

    const fieldNames = issue.names || {};
    const fields = issue.fields as Record<string, any>;
    
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
    for (const priorityField of priorityFields) {
      for (const [fieldId, value] of Object.entries(fields)) {
        const fieldName = fieldNames[fieldId as keyof typeof fieldNames] || fieldId;
        if (fieldName === priorityField) {
          if (TextProcessor.isFieldPopulated(value) && !TextProcessor.shouldExcludeField(fieldId, value)) {
            const formattedValue = TextProcessor.formatFieldValue(value, fieldName);
            if (formattedValue) {
              lines.push(`${fieldName}: ${formattedValue}`);
            }
          }
          break;
        }
      }
    }

    // Group remaining fields by category
    const categories: Record<string, string[]> = {
      'Project Info': ['Project', 'Issue Type', 'Request Type', 'Rank'],
      'Links': ['Gong Link', 'SalesForce Link'],
      'Dates & Times': ['Last Viewed', 'Status Category Changed', '[CHART] Date of First Response'],
      'Request Details': ['Request participants', 'Request language', 'Escalated', 'Next Steps'],
      'Other Fields': []
    };

    const processedFieldNames = new Set<string>(priorityFields);

    for (const [fieldId, value] of Object.entries(fields)) {
      const fieldName = fieldNames[fieldId as keyof typeof fieldNames] || fieldId;
      if (!processedFieldNames.has(fieldName)) {
        if (TextProcessor.isFieldPopulated(value) && !TextProcessor.shouldExcludeField(fieldId, value)) {
          const formattedValue = TextProcessor.formatFieldValue(value, fieldName);
          if (formattedValue) {
            let categoryFound = false;
            for (const [category, categoryFields] of Object.entries(categories)) {
              if (category !== 'Other Fields') {
                if (categoryFields.some(pattern => 
                  (fieldName as string).toLowerCase().includes(pattern.toLowerCase())
                )) {
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

    for (const [category, categoryFields] of Object.entries(categories)) {
      if (categoryFields.length > 0) {
        lines.push('');
        lines.push(`=== ${category} ===`);
        for (const fieldName of categoryFields) {
          for (const [fieldId, value] of Object.entries(fields)) {
            const currentFieldName = fieldNames[fieldId as keyof typeof fieldNames] || fieldId;
            if (currentFieldName === fieldName) {
              const formattedValue = TextProcessor.formatFieldValue(value, fieldName);
              if (formattedValue) {
                lines.push(`${fieldName}: ${formattedValue}`);
              }
              break;
            }
          }
        }
      }
    }

    if (fields.comment?.comments?.length > 0) {
      lines.push('');
      lines.push('=== Comments ===');
      const comments = TextProcessor.formatFieldValue(fields.comment.comments, 'comments');
      if (comments.trim()) {
        lines.push(comments);
      }
    }

    return lines.join('\n');
  }

  async listBoards(): Promise<BoardResponse[]> {
    console.error('Fetching all boards...');
    const response = await this.agileClient.board.getAllBoards();
    
    return (response.values || [])
      .filter(board => board.id && board.name)
      .map(board => ({
        id: board.id!,
        name: board.name!,
        type: board.type || 'scrum',
        location: board.location ? {
          projectId: board.location.projectId!,
          projectName: board.location.projectName || ''
        } : undefined,
        self: board.self || ''
      }));
  }

  async listBoardSprints(boardId: number): Promise<SprintResponse[]> {
    console.error(`Fetching sprints for board ${boardId}...`);
    const response = await this.agileClient.board.getAllSprints({
      boardId: boardId,
      state: 'future,active'
    });
    
    return (response.values || [])
      .filter(sprint => sprint.id && sprint.name)
      .map(sprint => ({
        id: sprint.id!,
        name: sprint.name!,
        state: sprint.state || 'unknown',
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        completeDate: sprint.completeDate,
        goal: sprint.goal,
        boardId
      }));
  }

  async listProjects(): Promise<Array<{
    id: string;
    key: string;
    name: string;
    description: string | null;
    lead: string | null;
    url: string;
  }>> {
    const { values: projects } = await this.client.projects.searchProjects();
    
    return projects
      .filter((project): project is Project => 
        Boolean(project?.id && project?.key && project?.name))
      .map(project => ({
        id: project.id!,
        key: project.key!,
        name: project.name!,
        description: project.description || null,
        lead: project.lead?.displayName || null,
        url: project.self || ''
      }));
  }

  async createIssue(params: {
    projectKey: string;
    summary: string;
    description?: string;
    issueType: string;
    priority?: string;
    assignee?: string;
    labels?: string[];
    customFields?: Record<string, any>;
  }): Promise<{ key: string }> {
    const fields: any = {
      project: { key: params.projectKey },
      summary: params.summary,
      issuetype: { name: params.issueType },
    };

    if (params.description) {
      fields.description = TextProcessor.markdownToAdf(params.description);
    }

    if (params.priority) fields.priority = { id: params.priority };
    if (params.assignee) fields.assignee = { name: params.assignee };
    if (params.labels) fields.labels = params.labels;
    if (params.customFields) {
      Object.assign(fields, params.customFields);
    }

    const response = await this.client.issues.createIssue({ fields });
    return { key: response.key };
  }

  async listMyFilters(expand = false): Promise<FilterResponse[]> {
    const filters = await this.client.filters.getMyFilters();
    
    return Promise.all(filters.map(async filter => {
      if (!filter.id || !filter.name) {
        throw new Error('Invalid filter response');
      }

      const basic: FilterResponse = {
        id: filter.id,
        name: filter.name,
        owner: filter.owner?.displayName || 'Unknown',
        favourite: filter.favourite || false,
        viewUrl: filter.viewUrl || ''
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
  }
}
