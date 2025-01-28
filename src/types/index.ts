import { Version3Models } from 'jira.js';

export interface JiraAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  created: string;
  author: string;
  url: string;
}

export interface JiraIssueDetails {
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
  attachments?: JiraAttachment[];
}

export interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
  attrs?: Record<string, any>;
}

export interface JiraConfig {
  host: string;
  email: string;
  apiToken: string;
  customFields?: {
    startDate?: string;  // e.g. 'customfield_10015'
    storyPoints?: string;  // e.g. 'customfield_10016'
  };
}

export interface FilterResponse {
  id: string;
  name: string;
  owner: string;
  favourite: boolean;
  viewUrl: string;
  description?: string;
  jql?: string;
  sharePermissions?: Array<{
    type: string;
    group?: string;
    project?: string;
  }>;
}

export interface SearchPagination {
  startAt: number;
  maxResults: number;
  total: number;
  hasMore: boolean;
}

export interface SearchResponse {
  issues: JiraIssueDetails[];
  pagination: SearchPagination;
}

export interface TransitionDetails {
  id: string;
  name: string;
  to: {
    id: string;
    name: string;
    description?: string;
  };
}

export interface BoardResponse {
  id: number;
  name: string;
  type: string;
  location?: {
    projectId: number;
    projectName: string;
  };
  self: string;
}

export interface SprintResponse {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  goal?: string;
  boardId: number;
}
