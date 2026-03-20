import { Version3Client, AgileClient } from 'jira.js';

import { JiraConfig, JiraIssueDetails, JiraPerson, FilterResponse, TransitionDetails, SearchResponse, BoardResponse, SprintResponse, JiraAttachment } from '../types/index.js';
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
    sprint: string | null;
  };

  /** Expose the underlying Version3Client for field discovery and other direct API access */
  get v3Client(): Version3Client {
    return this.client;
  }

  /** Expose custom field IDs for JQL construction outside the client */
  get customFieldIds(): { startDate: string; storyPoints: string; sprint: string | null } {
    return this.customFields;
  }

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
      sprint: config.customFields?.sprint ?? null,  // Discovered at runtime via field-discovery
    };
  }

  /** Update a custom field ID after runtime discovery */
  setCustomFieldId(logicalName: 'startDate' | 'storyPoints' | 'sprint', fieldId: string): void {
    this.customFields[logicalName] = fieldId;
  }

  /** Standard Jira fields that require ADF format in v3 API */
  private static ADF_FIELDS = new Set(['environment']);

  /** Convert any ADF-type fields in customFields from markdown to ADF */
  private convertAdfFields(customFields: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(customFields)) {
      if (JiraClient.ADF_FIELDS.has(key) && typeof value === 'string') {
        result[key] = TextProcessor.markdownToAdf(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /** Format a custom field value for display */
  private formatCustomFieldValue(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    // Jira option fields return { value: "..." } or { name: "..." }
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      if ('value' in obj) return obj.value;
      if ('name' in obj) return obj.name;
      if ('displayName' in obj) return obj.displayName;
      // ADF content — extract text
      if ('content' in obj && obj.type === 'doc') return TextProcessor.extractTextFromAdf(obj as any);
    }
    // Array of options
    if (Array.isArray(value)) {
      return value.map(item => this.formatCustomFieldValue(item));
    }
    return value;
  }

  /** Shared field list for issue queries */
  private get issueFields(): string[] {
    return [
      'summary',
      'description',
      'issuetype',
      'priority',
      'parent',
      'assignee',
      'reporter',
      'status',
      'resolution',
      'labels',
      'created',
      'updated',
      'resolutiondate',
      'statuscategorychangedate',
      'duedate',
      this.customFields.startDate,
      this.customFields.storyPoints,
      'timeestimate',
      ...(this.customFields.sprint ? [this.customFields.sprint] : []),
      'issuelinks',
    ];
  }

  /** Extract the most relevant sprint name from the sprint field array */
  private extractSprintName(sprints: any): string | null {
    if (!Array.isArray(sprints) || sprints.length === 0) return null;
    // Prefer active sprint, then future, then most recent closed
    const active = sprints.find((s: any) => s.state === 'active');
    if (active) return active.name ?? null;
    const future = sprints.find((s: any) => s.state === 'future');
    if (future) return future.name ?? null;
    // Fall back to last sprint in array (most recent)
    return sprints[sprints.length - 1]?.name ?? null;
  }

  /** Maps a raw Jira API issue to our JiraIssueDetails shape */
  private mapIssueFields(issue: any): JiraIssueDetails {
    const fields = issue.fields ?? issue.fields;

    // Extract people with accountIds for @mention support
    const people: JiraPerson[] = [];
    if (fields?.assignee?.accountId && fields?.assignee?.displayName) {
      people.push({ displayName: fields.assignee.displayName, accountId: fields.assignee.accountId, role: 'assignee' });
    }
    if (fields?.reporter?.accountId && fields?.reporter?.displayName) {
      people.push({ displayName: fields.reporter.displayName, accountId: fields.reporter.accountId, role: 'reporter' });
    }

    return {
      id: issue.id,
      key: issue.key,
      summary: fields?.summary,
      description: fields?.description
        ? TextProcessor.adfToMarkdown(fields.description)
        : '',
      issueType: fields?.issuetype?.name || '',
      priority: fields?.priority?.name || null,
      parent: fields?.parent?.key || null,
      assignee: fields?.assignee?.displayName || null,
      reporter: fields?.reporter?.displayName || '',
      status: fields?.status?.name || '',
      statusCategory: fields?.status?.statusCategory?.key || 'unknown',
      resolution: fields?.resolution?.name || null,
      labels: fields?.labels || [],
      created: fields?.created || '',
      updated: fields?.updated || '',
      resolutionDate: fields?.resolutiondate || null,
      statusCategoryChanged: fields?.statuscategorychangedate ?? fields?.statuscategorychangeddate ?? null,
      dueDate: fields?.duedate || null,
      startDate: fields?.[this.customFields.startDate] || null,
      storyPoints: fields?.[this.customFields.storyPoints] ?? null,
      timeEstimate: fields?.timeestimate ?? null,
      sprint: this.customFields.sprint ? this.extractSprintName(fields?.[this.customFields.sprint]) : null,
      issueLinks: (fields?.issuelinks || []).map((link: any) => ({
        type: link.type?.name || '',
        outward: link.outwardIssue?.key || null,
        inward: link.inwardIssue?.key || null,
      })),
      people: people.length > 0 ? people : undefined,
    };
  }

  async getIssue(
    issueKey: string,
    includeComments = false,
    includeAttachments = false,
    customFieldMeta?: Array<{ id: string; name: string; type: string; description: string }>,
    includeHistory = false,
  ): Promise<JiraIssueDetails> {
    const fields = [...this.issueFields];

    if (includeAttachments) {
      fields.push('attachment');
    }

    // Include discovered custom field IDs in the fetch
    if (customFieldMeta) {
      for (const cf of customFieldMeta) {
        if (!fields.includes(cf.id)) {
          fields.push(cf.id);
        }
      }
    }

    const expands: string[] = [];
    if (includeComments) expands.push('comments');
    if (includeHistory) expands.push('changelog');

    const params: any = {
      issueIdOrKey: issueKey,
      fields,
      expand: expands.length > 0 ? expands.join(',') : undefined,
    };

    const issue = await this.client.issues.getIssue(params);
    const issueDetails = this.mapIssueFields(issue);

    // Extract status transitions from changelog
    if (includeHistory && (issue as any).changelog?.histories) {
      const histories = (issue as any).changelog.histories as Array<{
        created: string;
        author?: { displayName?: string };
        items: Array<{ field: string; fromString: string | null; toString: string | null }>;
      }>;
      issueDetails.statusHistory = histories
        .flatMap(h => h.items
          .filter(item => item.field === 'status')
          .map(item => ({
            date: h.created,
            from: item.fromString || '',
            to: item.toString || '',
            author: h.author?.displayName || 'Unknown',
          }))
        )
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    // Extract custom field values using catalog metadata
    if (customFieldMeta) {
      const rawFields = issue.fields as Record<string, any>;
      const customValues: JiraIssueDetails['customFieldValues'] = [];
      for (const cf of customFieldMeta) {
        const value = rawFields[cf.id];
        if (value !== undefined && value !== null) {
          customValues.push({
            name: cf.name,
            value: this.formatCustomFieldValue(value),
            type: cf.type,
            description: cf.description,
          });
        }
      }
      if (customValues.length > 0) {
        issueDetails.customFieldValues = customValues;
      }
    }

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
          body: comment.body?.content ? TextProcessor.adfToMarkdown(comment.body) : String(comment.body),
          created: comment.created!,
        }));

      // Add comment authors to people list (deduplicated, capped at 10 total)
      const existingIds = new Set((issueDetails.people || []).map(p => p.accountId));
      const commentAuthors: JiraPerson[] = [];
      for (const comment of issue.fields.comment.comments) {
        const aid = comment.author?.accountId;
        const name = comment.author?.displayName;
        if (aid && name && !existingIds.has(aid)) {
          existingIds.add(aid);
          commentAuthors.push({ displayName: name, accountId: aid, role: 'commenter' });
        }
      }
      if (commentAuthors.length > 0) {
        const people = [...(issueDetails.people || []), ...commentAuthors];
        issueDetails.people = people.slice(0, 10);
      }
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

  /** Lightweight fetch: key, summary, issuetype, status, parent only */
  private async fetchNodeFields(issueKey: string): Promise<{ key: string; summary: string; issueType: string; status: string; parent: string | null }> {
    const issue = await this.client.issues.getIssue({
      issueIdOrKey: issueKey,
      fields: ['summary', 'issuetype', 'status', 'parent'],
    });
    const f = issue.fields as any;
    return {
      key: issue.key,
      summary: f?.summary || '',
      issueType: f?.issuetype?.name || '',
      status: f?.status?.name || '',
      parent: f?.parent?.key || null,
    };
  }

  /** Fetch children of given keys in one JQL query. Returns truncated flag if results hit the limit. */
  private async fetchChildren(parentKeys: string[]): Promise<{ children: Array<{ key: string; summary: string; issueType: string; status: string; parent: string }>; truncated: boolean }> {
    if (parentKeys.length === 0) return { children: [], truncated: false };
    const maxResults = 100;
    const jql = `parent in (${parentKeys.join(', ')})`;
    const results = await this.client.issueSearch.searchForIssuesUsingJqlEnhancedSearch({
      jql,
      maxResults,
      fields: ['summary', 'issuetype', 'status', 'parent'],
    });
    const issues = results.issues || [];
    return {
      children: issues.map((issue: any) => ({
        key: issue.key,
        summary: issue.fields?.summary || '',
        issueType: issue.fields?.issuetype?.name || '',
        status: issue.fields?.status?.name || '',
        parent: issue.fields?.parent?.key || '',
      })),
      truncated: issues.length >= maxResults,
    };
  }

  /**
   * Traverse the issue hierarchy: walk up `upHops` levels and down `downHops` levels
   * from the focus issue, returning a tree with a "you are here" marker.
   */
  async getHierarchy(issueKey: string, upHops = 4, downHops = 4): Promise<import('../types/index.js').HierarchyResult> {
    // 1. Fetch focus node
    const focus = await this.fetchNodeFields(issueKey);

    // 2. Walk UP the parent chain (with circular reference guard)
    const ancestors: Array<{ key: string; summary: string; issueType: string; status: string }> = [];
    const visited = new Set<string>([focus.key]);
    let current = focus;
    for (let i = 0; i < upHops; i++) {
      if (!current.parent || visited.has(current.parent)) break;
      visited.add(current.parent);
      const parentNode = await this.fetchNodeFields(current.parent);
      ancestors.unshift(parentNode); // prepend — root first
      current = parentNode;
    }

    // 3. Walk DOWN via BFS — level by level, batched
    type NodeWithChildren = import('../types/index.js').HierarchyNode;

    // Build the focus node
    const focusNode: NodeWithChildren = {
      key: focus.key,
      summary: focus.summary,
      issueType: focus.issueType,
      status: focus.status,
      children: [],
    };

    // BFS: expand children level by level
    let truncated = false;
    let actualDownDepth = 0;
    let frontier: NodeWithChildren[] = [focusNode];
    for (let level = 0; level < downHops; level++) {
      const parentKeys = frontier.map(n => n.key);
      const result = await this.fetchChildren(parentKeys);
      if (result.children.length === 0) break;
      if (result.truncated) truncated = true;
      actualDownDepth = level + 1;

      // Group children by parent
      const byParent = new Map<string, typeof result.children>();
      for (const child of result.children) {
        const group = byParent.get(child.parent) || [];
        group.push(child);
        byParent.set(child.parent, group);
      }

      const nextFrontier: NodeWithChildren[] = [];
      for (const parent of frontier) {
        const childNodes = (byParent.get(parent.key) || []).map(c => ({
          key: c.key,
          summary: c.summary,
          issueType: c.issueType,
          status: c.status,
          children: [],
        }));
        parent.children = childNodes;
        nextFrontier.push(...childNodes);
      }
      frontier = nextFrontier;
    }

    // 4. Build the full tree: ancestors → focus → descendants
    let root = focusNode;
    for (const ancestor of [...ancestors].reverse()) {
      root = {
        key: ancestor.key,
        summary: ancestor.summary,
        issueType: ancestor.issueType,
        status: ancestor.status,
        children: [root],
      };
    }

    // 5. Expand sibling children for ancestor nodes (batched single call)
    if (ancestors.length > 0) {
      // Collect all ancestor keys for a single batched fetch
      const ancestorKeys: string[] = [];
      let walkNode = root;
      for (let i = 0; i < ancestors.length; i++) {
        ancestorKeys.push(walkNode.key);
        walkNode = walkNode.children[0];
      }
      const siblingResult = await this.fetchChildren(ancestorKeys);
      if (siblingResult.truncated) truncated = true;

      // Group siblings by parent
      const siblingsByParent = new Map<string, typeof siblingResult.children>();
      for (const child of siblingResult.children) {
        const group = siblingsByParent.get(child.parent) || [];
        group.push(child);
        siblingsByParent.set(child.parent, group);
      }

      // Distribute siblings to each ancestor node
      let node = root;
      for (let i = 0; i < ancestors.length; i++) {
        const existingChildKey = node.children[0]?.key;
        const siblings = (siblingsByParent.get(node.key) || [])
          .filter(c => c.key !== existingChildKey)
          .map(c => ({ key: c.key, summary: c.summary, issueType: c.issueType, status: c.status, children: [] }));
        node.children = [...node.children, ...siblings];
        node = node.children.find(c => c.key === existingChildKey) || node.children[0];
      }
    }

    return {
      root,
      focusKey: focus.key,
      upDepth: ancestors.length,
      downDepth: actualDownDepth,
      truncated,
    };
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

  async getBulkChangelogs(issueKeys: string[], fieldIds: string[] = ['status']): Promise<Map<string, Array<{ date: string; from: string; to: string }>>> {
    const result = new Map<string, Array<{ date: string; from: string; to: string }>>();

    let nextPageToken: string | undefined;
    do {
      const response = await this.client.issues.getBulkChangelogs({
        issueIdsOrKeys: issueKeys,
        fieldIds,
        maxResults: 1000,
        nextPageToken,
      });

      for (const issueLog of response.issueChangeLogs || []) {
        const issueId = issueLog.issueId;
        if (!issueId) continue;

        const transitions = result.get(issueId) || [];
        for (const history of issueLog.changeHistories || []) {
          for (const item of history.items || []) {
            if (item.field === 'status') {
              transitions.push({
                date: history.created || '',
                from: item.fromString || '',
                to: item.toString || '',
              });
            }
          }
        }
        result.set(issueId, transitions);
      }

      nextPageToken = response.nextPageToken ?? undefined;
    } while (nextPageToken);

    return result;
  }

  async getFilter(filterId: string): Promise<{ name?: string; jql?: string }> {
    return await this.client.filters.getFilter({
      id: parseInt(filterId, 10),
    }) as { name?: string; jql?: string };
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
      fields: this.issueFields,
    });

    return (searchResults.issues || []).map(issue => this.mapIssueFields(issue));
  }

  async updateIssue(params: {
    issueKey: string;
    summary?: string;
    description?: string;
    parentKey?: string | null;
    assignee?: string | null;
    priority?: string;
    labels?: string[];
    dueDate?: string | null;
    customFields?: Record<string, any>;
  }): Promise<void> {
    const fields: any = {};
    if (params.summary) fields.summary = params.summary;
    if (params.description) {
      fields.description = TextProcessor.markdownToAdf(params.description);
    }
    if (params.parentKey !== undefined) {
      fields.parent = params.parentKey ? { key: params.parentKey } : null;
    }
    if (params.assignee !== undefined) {
      // null unassigns, string assigns by account ID
      fields.assignee = params.assignee ? { accountId: params.assignee } : null;
    }
    if (params.priority) fields.priority = { id: params.priority };
    if (params.labels) fields.labels = params.labels;
    if (params.dueDate !== undefined) fields.duedate = params.dueDate;
    if (params.customFields) {
      Object.assign(fields, this.convertAdfFields(params.customFields));
    }

    await this.client.issues.editIssue({
      issueIdOrKey: params.issueKey,
      fields,
    });
  }

  async addComment(issueKey: string, commentBody: string): Promise<void> {
    await this.client.issueComments.addComment({
      issueIdOrKey: issueKey,
      comment: TextProcessor.markdownToAdf(commentBody)
    });
  }

  /** Lightweight search returning only fields needed for analysis (no description, links, rendered HTML) */
  async countIssues(jql: string): Promise<number> {
    try {
      const cleanJql = jql.replace(/\\"/g, '"');
      console.error(`Counting issues for JQL: ${cleanJql}`);
      const result = await this.client.issueSearch.countIssues({ jql: cleanJql });
      return result.count ?? 0;
    } catch (error) {
      console.error('Error counting issues:', error);
      throw error;
    }
  }

  async searchIssuesLean(jql: string, maxResults = 50, nextPageToken?: string): Promise<SearchResponse> {
    try {
      const cleanJql = jql.replace(/\\"/g, '"');
      console.error(`Executing lean JQL search with query: ${cleanJql}${nextPageToken ? ' (page token)' : ''}`);

      const leanFields = [
        'summary', 'issuetype', 'priority', 'assignee', 'reporter',
        'status', 'resolution', 'labels', 'created', 'updated',
        'resolutiondate', 'statuscategorychangedate', 'duedate', 'timeestimate',
        this.customFields.startDate, this.customFields.storyPoints,
        ...(this.customFields.sprint ? [this.customFields.sprint] : []),
      ];

      const params: any = {
        jql: cleanJql,
        maxResults: Math.min(maxResults, 50),
        fields: leanFields,
      };
      if (nextPageToken) {
        params.nextPageToken = nextPageToken;
      }

      const timeoutMs = 30_000;
      const searchResults = await Promise.race([
        this.client.issueSearch.searchForIssuesUsingJqlEnhancedSearch(params),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Lean search timed out after ${timeoutMs / 1000}s — try a narrower JQL query or smaller maxResults`)), timeoutMs)
        ),
      ]);

      const issues = (searchResults.issues || []).map(issue => this.mapIssueFields(issue));
      const hasMore = !!searchResults.nextPageToken;

      return {
        issues,
        pagination: {
          startAt: 0,
          maxResults,
          total: hasMore ? issues.length + 1 : issues.length,
          hasMore,
          nextPageToken: searchResults.nextPageToken || undefined,
        }
      };
    } catch (error) {
      console.error('Error executing lean JQL search:', error);
      throw error;
    }
  }

  async searchIssues(jql: string, startAt = 0, maxResults = 25): Promise<SearchResponse> {
    try {
      // Remove escaped quotes from JQL
      const cleanJql = jql.replace(/\\"/g, '"');
      console.error(`Executing JQL search with query: ${cleanJql}`);

      // Use the new enhanced search API (old /rest/api/3/search was deprecated Oct 2025)
      const searchResults = await this.client.issueSearch.searchForIssuesUsingJqlEnhancedSearch({
        jql: cleanJql,
        maxResults: Math.min(maxResults, 100),
        fields: this.issueFields,
      });

      const issues = (searchResults.issues || []).map(issue => this.mapIssueFields(issue));

      // Note: Enhanced search API uses token-based pagination, not offset-based
      // The total count is not available in the new API
      const hasMore = !!searchResults.nextPageToken;

      return {
        issues,
        pagination: {
          startAt,
          maxResults,
          total: hasMore ? issues.length + 1 : issues.length, // Approximate since total not available
          hasMore,
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

  /**
   * Link two issues together with a specified link type
   * @param sourceIssueKey The source issue key
   * @param targetIssueKey The target issue key
   * @param linkType The type of link to create
   * @param comment Optional comment to add with the link
   */
  async linkIssues(
    sourceIssueKey: string, 
    targetIssueKey: string, 
    linkType: string,
    comment?: string
  ): Promise<void> {
    const linkRequest: any = {
      type: {
        name: linkType
      },
      inwardIssue: {
        key: targetIssueKey
      },
      outwardIssue: {
        key: sourceIssueKey
      }
    };

    if (comment) {
      linkRequest.comment = {
        body: TextProcessor.markdownToAdf(comment)
      };
    }

    // Use the correct method from jira.js library
    await this.client.issueLinks.linkIssues(linkRequest);
  }

  /**
   * Get all available issue link types
   * @returns Array of link types with their names and descriptions
   */
  async getIssueLinkTypes(): Promise<Array<{
    id: string;
    name: string;
    inward: string;
    outward: string;
  }>> {
    console.error('Fetching all issue link types...');
    
    const response = await this.client.issueLinkTypes.getIssueLinkTypes();
    
    return (response.issueLinkTypes || [])
      .filter(linkType => linkType.id && linkType.name)
      .map(linkType => ({
        id: linkType.id!,
        name: linkType.name!,
        inward: linkType.inward || '',
        outward: linkType.outward || ''
      }));
  }

  async getPopulatedFields(issueKey: string): Promise<string> {
    const issue = await this.client.issues.getIssue({
      issueIdOrKey: issueKey,
      expand: 'names',
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

  async deleteIssue(issueKey: string): Promise<void> {
    console.error(`Deleting issue ${issueKey}...`);
    await this.client.issues.deleteIssue({ issueIdOrKey: issueKey });
  }

  async moveIssue(issueKey: string, targetProjectKey: string, targetIssueType: string): Promise<void> {
    console.error(`Moving issue ${issueKey} to ${targetProjectKey} as ${targetIssueType}...`);
    await this.client.issues.editIssue({
      issueIdOrKey: issueKey,
      fields: {
        project: { key: targetProjectKey },
        issuetype: { name: targetIssueType },
      },
    });
  }

  async createIssue(params: {
    projectKey: string;
    summary: string;
    description?: string;
    issueType: string;
    priority?: string;
    assignee?: string;
    labels?: string[];
    dueDate?: string;
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
    if (params.assignee) fields.assignee = { accountId: params.assignee };
    if (params.labels) fields.labels = params.labels;
    if (params.dueDate) fields.duedate = params.dueDate;
    if (params.customFields) {
      Object.assign(fields, this.convertAdfFields(params.customFields));
    }

    const response = await this.client.issues.createIssue({ fields });
    return { key: response.key };
  }

  async createFilter(name: string, jql: string, description?: string, favourite?: boolean): Promise<FilterResponse> {
    const result = await this.client.filters.createFilter({
      name,
      jql,
      description: description || '',
      favourite: favourite ?? false,
    });
    if (!result.id || !result.name) {
      throw new Error('Invalid filter response from Jira');
    }
    return {
      id: result.id,
      name: result.name,
      owner: result.owner?.displayName || 'Unknown',
      favourite: result.favourite || false,
      viewUrl: result.viewUrl || '',
      description: result.description || '',
      jql: result.jql || '',
    };
  }

  async updateFilter(filterId: string, updates: { name?: string; jql?: string; description?: string; favourite?: boolean }): Promise<FilterResponse> {
    // Fetch existing filter to merge with updates (API requires name)
    const existing = await this.client.filters.getFilter({ id: parseInt(filterId, 10) });
    const result = await this.client.filters.updateFilter({
      id: parseInt(filterId, 10),
      name: updates.name || existing.name || '',
      jql: updates.jql ?? existing.jql,
      description: updates.description ?? existing.description,
      favourite: updates.favourite ?? existing.favourite,
    });
    if (!result.id || !result.name) {
      throw new Error('Invalid filter response from Jira');
    }
    return {
      id: result.id,
      name: result.name,
      owner: result.owner?.displayName || 'Unknown',
      favourite: result.favourite || false,
      viewUrl: result.viewUrl || '',
      description: result.description || '',
      jql: result.jql || '',
    };
  }

  async deleteFilter(filterId: string): Promise<void> {
    await this.client.filters.deleteFilter(filterId);
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
