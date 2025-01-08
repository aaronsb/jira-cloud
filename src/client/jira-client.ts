import { Version3Client } from 'jira.js';
import type { Project } from 'jira.js/out/version3/models';
import { JiraConfig, JiraIssueDetails, FilterResponse, TransitionDetails, SearchResponse } from '../types/index.js';
import { TextProcessor } from '../utils/text-processing.js';

export class JiraClient {
  private client: Version3Client;

  constructor(config: JiraConfig) {
    this.client = new Version3Client({
      host: config.host,
      authentication: {
        basic: {
          email: config.email,
          apiToken: config.apiToken,
        },
      },
    });
  }

  async getIssue(issueKey: string, includeComments = false): Promise<JiraIssueDetails> {
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
      issueIdOrKey: issueKey,
      fields,
    };

    if (includeComments) {
      params.expand = 'renderedFields,comments';
    }

    const issue = await this.client.issues.getIssue(params);

    const issueDetails: JiraIssueDetails = {
      key: issue.key,
      summary: issue.fields.summary,
      description: issue.fields.description ? TextProcessor.extractTextFromAdf(issue.fields.description) : '',
      assignee: issue.fields.assignee?.displayName || null,
      reporter: issue.fields.reporter?.displayName || '',
      status: issue.fields.status?.name || '',
      resolution: issue.fields.resolution?.name || null,
      dueDate: issue.fields.duedate || null,
      startDate: issue.fields.customfield_10015 || null,
      storyPoints: issue.fields.customfield_10016 || null,
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

    return issueDetails;
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
        'customfield_10015',
        'customfield_10016',
        'timeestimate',
        'issuelinks',
      ],
    });

    return (searchResults.issues || []).map(issue => ({
      key: issue.key,
      summary: issue.fields.summary,
      description: issue.fields.description ? TextProcessor.extractTextFromAdf(issue.fields.description) : '',
      assignee: issue.fields.assignee?.displayName || null,
      reporter: issue.fields.reporter?.displayName || '',
      status: issue.fields.status?.name || '',
      resolution: issue.fields.resolution?.name || null,
      dueDate: issue.fields.duedate || null,
      startDate: issue.fields.customfield_10015 || null,
      storyPoints: issue.fields.customfield_10016 || null,
      timeEstimate: issue.fields.timeestimate || null,
      issueLinks: (issue.fields.issuelinks || []).map(link => ({
        type: link.type?.name || '',
        outward: link.outwardIssue?.key || null,
        inward: link.inwardIssue?.key || null,
      })),
    }));
  }

  async updateIssue(issueKey: string, summary?: string, description?: string): Promise<void> {
    const fields: any = {};
    if (summary) fields.summary = summary;
    if (description) {
      fields.description = {
        version: 1,
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: description
              }
            ]
          }
        ]
      };
    }

    await this.client.issues.editIssue({
      issueIdOrKey: issueKey,
      fields,
    });
  }

  async addComment(issueKey: string, commentBody: string): Promise<void> {
    await this.client.issueComments.addComment({
      issueIdOrKey: issueKey,
      comment: {
        version: 1,
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: commentBody
              }
            ]
          }
        ]
      }
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
        'customfield_10015',
        'customfield_10016',
        'timeestimate',
        'issuelinks',
      ],
    });

    const issues = (searchResults.issues || []).map(issue => ({
      key: issue.key,
      summary: issue.fields.summary,
      description: issue.fields.description ? TextProcessor.extractTextFromAdf(issue.fields.description) : '',
      assignee: issue.fields.assignee?.displayName || null,
      reporter: issue.fields.reporter?.displayName || '',
      status: issue.fields.status?.name || '',
      resolution: issue.fields.resolution?.name || null,
      dueDate: issue.fields.duedate || null,
      startDate: issue.fields.customfield_10015 || null,
      storyPoints: issue.fields.customfield_10016 || null,
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
            body: {
              version: 1,
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: comment
                    }
                  ]
                }
              ]
            }
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
