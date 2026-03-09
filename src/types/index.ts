export interface JiraAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  created: string;
  author: string;
  url: string;
}

export interface JiraPerson {
  displayName: string;
  accountId: string;
  role: 'assignee' | 'reporter' | 'commenter';
}

export interface JiraIssueDetails {
  key: string;
  summary: string;
  description: string;
  issueType: string;
  priority: string | null;
  parent: string | null;
  assignee: string | null;
  reporter: string;
  status: string;
  statusCategory: 'new' | 'indeterminate' | 'done' | 'unknown';
  resolution: string | null;
  labels: string[];
  created: string;
  updated: string;
  resolutionDate: string | null;
  statusCategoryChanged: string | null;
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
  customFieldValues?: Array<{
    name: string;
    value: unknown;
    type: string;
    description: string;
  }>;
  people?: JiraPerson[];
  statusHistory?: Array<{
    date: string;
    from: string;
    to: string;
    author: string;
  }>;
}

export interface HierarchyNode {
  key: string;
  summary: string;
  issueType: string;
  status: string;
  children: HierarchyNode[];
}

export interface HierarchyResult {
  root: HierarchyNode;
  focusKey: string;
  upDepth: number;
  downDepth: number;
  truncated: boolean;
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
  nextPageToken?: string;
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
