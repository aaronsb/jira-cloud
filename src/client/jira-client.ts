import { Version3Client, AgileClient } from 'jira.js';

import { JiraConfig, JiraIssueDetails, FilterResponse, TransitionDetails, SearchResponse, BoardResponse, SprintResponse, JiraAttachment } from '../types/index.js';
import { TextProcessor } from '../utils/text-processing.js';

// Define additional types for sprint operations
interface SprintIssue {
  key: string;
  summary: string;
  status: string;
  assignee?: string;
}

interface SprintListResponse {
  sprints: SprintResponse[];
  total: number;
}

interface SprintReportResponse {
  completedIssues: number;
  incompletedIssues: number;
  puntedIssues: number;
  addedIssues: number;
  velocityPoints?: number;
}

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

  // Sprint CRUD operations

  /**
   * Create a new sprint
   */
  async createSprint(
    boardId: number,
    name: string,
    startDate?: string,
    endDate?: string,
    goal?: string
  ): Promise<SprintResponse> {
    console.error(`Creating sprint "${name}" for board ${boardId}...`);
    
    const response = await this.agileClient.sprint.createSprint({
      originBoardId: boardId,
      name,
      startDate,
      endDate,
      goal
    });

    return {
      id: response.id!,
      name: response.name!,
      state: response.state || 'future',
      startDate: response.startDate,
      endDate: response.endDate,
      completeDate: response.completeDate,
      goal: response.goal,
      boardId
    };
  }

  /**
   * Get a sprint by ID
   */
  async getSprint(sprintId: number): Promise<SprintResponse> {
    console.error(`Fetching sprint ${sprintId}...`);
    
    const response = await this.agileClient.sprint.getSprint({
      sprintId
    });

    return {
      id: response.id!,
      name: response.name!,
      state: response.state || 'unknown',
      startDate: response.startDate,
      endDate: response.endDate,
      completeDate: response.completeDate,
      goal: response.goal,
      boardId: response.originBoardId!
    };
  }

  /**
   * List sprints for a board with pagination and filtering
   */
  async listSprints(
    boardId: number,
    state?: string,
    startAt = 0,
    maxResults = 50
  ): Promise<SprintListResponse> {
    console.error(`Listing sprints for board ${boardId}...`);
    
    const stateParam = state || 'future,active,closed';
    
    const response = await this.agileClient.board.getAllSprints({
      boardId,
      state: stateParam,
      startAt,
      maxResults
    });

    const sprints = (response.values || [])
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

    return {
      sprints,
      total: response.total || sprints.length
    };
  }

  /**
   * Update a sprint
   */
  async updateSprint(
    sprintId: number,
    name?: string,
    goal?: string,
    startDate?: string,
    endDate?: string,
    state?: string
  ): Promise<void> {
    console.error(`Updating sprint ${sprintId}...`);
    
    try {
      // First get the current sprint to get its state
      const currentSprint = await this.getSprint(sprintId);
      
      // Prepare update parameters
      const updateParams: any = {
        // Always include the current state unless a new state is provided
        state: state || currentSprint.state
      };
      
      // Add other parameters if provided
      if (name !== undefined) updateParams.name = name;
      if (goal !== undefined) updateParams.goal = goal;
      if (startDate !== undefined) updateParams.startDate = startDate;
      if (endDate !== undefined) updateParams.endDate = endDate;
      
      // If changing to closed state, add completeDate
      if (state === 'closed') {
        updateParams.completeDate = new Date().toISOString();
      }
      
      // Update the sprint with all parameters in a single call
      await this.agileClient.sprint.updateSprint({
        sprintId,
        ...updateParams
      });
    } catch (error) {
      console.error(`Error updating sprint ${sprintId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a sprint
   */
  async deleteSprint(sprintId: number): Promise<void> {
    console.error(`Deleting sprint ${sprintId}...`);
    
    await this.agileClient.sprint.deleteSprint({
      sprintId
    });
  }

  /**
   * Get issues in a sprint
   */
  async getSprintIssues(sprintId: number): Promise<SprintIssue[]> {
    console.error(`Fetching issues for sprint ${sprintId}...`);
    
    const response = await this.agileClient.sprint.getIssuesForSprint({
      sprintId,
      fields: ['summary', 'status', 'assignee']
    });

    return (response.issues || [])
      .filter(issue => issue.key && issue.fields) // Filter out issues with missing key or fields
      .map(issue => ({
        key: issue.key!, // Non-null assertion since we filtered
        summary: issue.fields!.summary || '',
        status: issue.fields!.status?.name || 'Unknown',
        assignee: issue.fields!.assignee?.displayName
      }));
  }

  /**
   * Update issues in a sprint (add/remove)
   */
  async updateSprintIssues(
    sprintId: number,
    add?: string[],
    remove?: string[]
  ): Promise<void> {
    console.error(`Updating issues for sprint ${sprintId}...`);
    
    try {
      // Add issues to sprint
      if (add && add.length > 0) {
        console.error(`Adding ${add.length} issues to sprint ${sprintId}: ${add.join(', ')}`);
        
        // Use the correct method from jira.js v4.0.5
        await this.agileClient.sprint.moveIssuesToSprintAndRank({
          sprintId,
          issues: add
        });
      }

      // Remove issues from sprint
      if (remove && remove.length > 0) {
        console.error(`Removing ${remove.length} issues from sprint ${sprintId}: ${remove.join(', ')}`);
        
        // To remove issues, we move them to the backlog
        await this.agileClient.backlog.moveIssuesToBacklog({
          issues: remove
        });
      }
    } catch (error) {
      console.error(`Error updating sprint issues for sprint ${sprintId}:`, error);
      throw new Error(`Failed to update sprint issues: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get sprint report
   */
  async getSprintReport(
    boardId: number,
    sprintId: number
  ): Promise<SprintReportResponse> {
    console.error(`Fetching sprint report for sprint ${sprintId} on board ${boardId}...`);
    
    try {
      // Use type assertion since getSprintReport might not be in the type definitions
      const response = await (this.agileClient.board as any).getSprintReport({
        boardId,
        sprintId
      });

      // Safely extract data from the response
      return {
        completedIssues: response?.contents?.completedIssues?.length || 0,
        incompletedIssues: response?.contents?.incompletedIssues?.length || 0,
        puntedIssues: response?.contents?.puntedIssues?.length || 0,
        addedIssues: response?.contents?.issuesAddedDuringSprint?.length || 0,
        velocityPoints: response?.contents?.completedIssuesEstimateSum?.value || 0
      };
    } catch (error) {
      console.error(`Error fetching sprint report for sprint ${sprintId} on board ${boardId}:`, error);
      
      // Return a default response with zeros to avoid breaking the client
      return {
        completedIssues: 0,
        incompletedIssues: 0,
        puntedIssues: 0,
        addedIssues: 0,
        velocityPoints: 0
      };
    }
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
      .filter(project => Boolean(project?.id && project?.key && project?.name))
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
