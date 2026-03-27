import type { GraphQLClient } from './graphql-client.js';

// --- Types ---

export interface TownsquareGoal {
  id: string;
  name: string;
  key: string;
  url: string;
  state: { value: string; label: string };
  owner: { name: string } | null;
  parentGoal: { name: string; key: string } | null;
  description: string | null;
}

export interface TownsquareGoalDetail extends TownsquareGoal {
  subGoals: TownsquareGoal[];
  projects: Array<{ name: string; state: { value: string } }>;
  workItems: Array<{
    key: string;
    summary: string;
    status: { name: string };
    issueType: { name: string };
  }>;
}

interface GoalSearchResponse {
  goals_search: {
    edges: Array<{ node: GoalSearchNode }>;
    pageInfo?: { hasNextPage: boolean; endCursor: string };
  };
}

interface GoalSearchNode {
  id: string;
  name: string;
  key: string;
  url: string;
  state: { value: string; label: string };
  owner: { name: string } | null;
  parentGoal: { name: string; key: string } | null;
  subGoals: { edges: Array<{ node: { name: string; key: string; state: { value: string } } }> };
  workItems: { edges: Array<{ node: { key?: string } }> };
}

interface GoalByKeyResponse {
  goals_byKey: GoalDetailNode | null;
}

interface GoalDetailNode {
  id: string;
  name: string;
  key: string;
  url: string;
  state: { value: string; label: string };
  owner: { name: string } | null;
  parentGoal: { name: string; key: string } | null;
  description: string | null;
  subGoals: { edges: Array<{ node: { id: string; name: string; key: string; url: string; state: { value: string; label: string }; owner: { name: string } | null; parentGoal: { name: string; key: string } | null; description: string | null } }> };
  projects: { edges: Array<{ node: { name: string; state: { value: string } } }> };
  workItems: { edges: Array<{ node: { key?: string; summary?: string; status?: { name: string }; issueType?: { name: string } } }> };
}

// --- Queries ---

const GOALS_SEARCH_QUERY = `
  query GoalsSearch($containerId: ID!, $searchString: String!, $sort: [TownsquareGoalSortEnum], $first: Int, $after: String) {
    goals_search(containerId: $containerId, searchString: $searchString, sort: $sort, first: $first, after: $after) {
      edges {
        node {
          id
          name
          key
          url
          state { value label }
          owner { name }
          parentGoal { name key }
          subGoals(first: 50) {
            edges { node { name key state { value } } }
          }
          workItems(first: 50) @optIn(to: "GraphStoreJiraEpicContributesToAtlasGoal") {
            edges { node { ... on JiraIssue { key } } }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const GOAL_BY_KEY_QUERY = `
  query GoalByKey($containerId: ID!, $goalKey: String!) {
    goals_byKey(containerId: $containerId, goalKey: $goalKey) {
      id
      name
      key
      url
      state { value label }
      owner { name }
      parentGoal { name key }
      description
      subGoals(first: 50) {
        edges {
          node {
            id name key url
            state { value label }
            owner { name }
            parentGoal { name key }
            description
          }
        }
      }
      projects(first: 20) {
        edges { node { name state { value } } }
      }
      workItems(first: 100) @optIn(to: "GraphStoreJiraEpicContributesToAtlasGoal") {
        edges {
          node {
            ... on JiraIssue {
              key
              summary
              status { name }
              issueType { name }
            }
          }
        }
      }
    }
  }
`;

// --- Helpers ---

/** Extract plain text from an ADF JSON string or return as-is if not ADF */
function extractAdfText(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const doc = JSON.parse(raw);
    if (doc?.type !== 'doc' || !Array.isArray(doc.content)) return raw;
    return extractTextFromNodes(doc.content).trim() || null;
  } catch {
    return raw;
  }
}

function extractTextFromNodes(nodes: Array<{ type: string; text?: string; content?: unknown[] }>): string {
  let text = '';
  for (const node of nodes) {
    if (node.text) text += node.text;
    if (Array.isArray(node.content)) text += extractTextFromNodes(node.content as typeof nodes);
    if (node.type === 'paragraph' || node.type === 'heading') text += '\n';
    if (node.type === 'hardBreak') text += '\n';
    if (node.type === 'listItem') text += '- ';
  }
  return text;
}

/** Wrap plain text in ADF document format (required for Townsquare description/summary fields) */
function toAdf(text: string): string {
  return JSON.stringify({
    version: 1, type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
}

// --- Functions ---

export async function searchGoals(
  client: GraphQLClient,
  searchString: string,
  sort: string = 'HIERARCHY_ASC',
  first: number = 50,
): Promise<{ success: boolean; goals?: TownsquareGoal[]; workItemCounts?: Map<string, number>; error?: string }> {
  const result = await client.queryTenanted<GoalSearchResponse>(GOALS_SEARCH_QUERY, {
    containerId: client.getSiteAri(),
    searchString,
    sort: [sort],
    first,
  });

  if (!result.success || !result.data) {
    return { success: false, error: result.error ?? 'No data returned' };
  }

  const edges = result.data.goals_search.edges;
  const goals: TownsquareGoal[] = edges.map(e => ({
    id: e.node.id,
    name: e.node.name,
    key: e.node.key,
    url: e.node.url,
    state: e.node.state,
    owner: e.node.owner,
    parentGoal: e.node.parentGoal,
    description: null,
  }));

  const workItemCounts = new Map<string, number>();
  for (const e of edges) {
    const count = e.node.workItems?.edges?.filter(w => w.node.key).length ?? 0;
    workItemCounts.set(e.node.key, count);
  }

  return { success: true, goals, workItemCounts };
}

export async function getGoalByKey(
  client: GraphQLClient,
  goalKey: string,
): Promise<{ success: boolean; goal?: TownsquareGoalDetail; error?: string }> {
  const result = await client.queryTenanted<GoalByKeyResponse>(GOAL_BY_KEY_QUERY, {
    containerId: client.getSiteAri(),
    goalKey,
  });

  if (!result.success || !result.data) {
    return { success: false, error: result.error ?? 'No data returned' };
  }

  const node = result.data.goals_byKey;
  if (!node) {
    return { success: false, error: `Goal ${goalKey} not found` };
  }

  const goal: TownsquareGoalDetail = {
    id: node.id,
    name: node.name,
    key: node.key,
    url: node.url,
    state: node.state,
    owner: node.owner,
    parentGoal: node.parentGoal,
    description: extractAdfText(node.description),
    subGoals: (node.subGoals?.edges ?? []).map(e => ({
      id: e.node.id,
      name: e.node.name,
      key: e.node.key,
      url: e.node.url,
      state: e.node.state,
      owner: e.node.owner,
      parentGoal: e.node.parentGoal,
      description: extractAdfText(e.node.description),
    })),
    projects: (node.projects?.edges ?? []).map(e => e.node),
    workItems: (node.workItems?.edges ?? [])
      .filter(e => e.node.key)
      .map(e => ({
        key: e.node.key!,
        summary: e.node.summary ?? '',
        status: e.node.status ?? { name: 'Unknown' },
        issueType: e.node.issueType ?? { name: 'Unknown' },
      })),
  };

  return { success: true, goal };
}

/**
 * Resolve all Jira issue keys linked to a goal and optionally its sub-goals.
 * Returns keys suitable for a `key in (...)` JQL query.
 */
export async function resolveGoalWorkItems(
  client: GraphQLClient,
  goalKey: string,
  includeSubGoals: boolean = true,
): Promise<{ success: boolean; issueKeys?: string[]; goal?: TownsquareGoalDetail; error?: string }> {
  const result = await getGoalByKey(client, goalKey);
  if (!result.success || !result.goal) {
    return { success: false, error: result.error };
  }

  const goal = result.goal;
  const issueKeys = new Set(goal.workItems.map(w => w.key));

  if (includeSubGoals && goal.subGoals.length > 0) {
    // Fetch each sub-goal's work items
    const subResults = await Promise.all(
      goal.subGoals.map(sg => getGoalByKey(client, sg.key)),
    );
    for (const sub of subResults) {
      if (sub.success && sub.goal) {
        for (const w of sub.goal.workItems) {
          issueKeys.add(w.key);
        }
      }
    }
  }

  return { success: true, issueKeys: [...issueKeys], goal };
}

// --- Mutations ---

const GOAL_TYPES_QUERY = `
  query GoalTypes($containerId: ID!) {
    goals_goalTypes(containerId: $containerId) {
      edges { node { id } }
    }
  }
`;

// Session-level cache for goal type ARIs
let cachedGoalTypeIds: string[] | null = null;

async function resolveGoalTypes(client: GraphQLClient): Promise<string[]> {
  if (cachedGoalTypeIds) return cachedGoalTypeIds;

  const result = await client.queryTenanted<{ goals_goalTypes: { edges: Array<{ node: { id: string } }> } }>(
    GOAL_TYPES_QUERY, { containerId: client.getSiteAri() },
  );

  if (!result.success || !result.data) return [];

  cachedGoalTypeIds = result.data.goals_goalTypes.edges.map(e => e.node.id);
  return cachedGoalTypeIds;
}

/** Resolve goal type: first type for top-level goals, last type for sub-goals */
async function resolveGoalType(client: GraphQLClient, hasParent: boolean): Promise<string | null> {
  const types = await resolveGoalTypes(client);
  if (types.length === 0) return null;
  return hasParent ? types[types.length - 1] : types[0];
}

const GOAL_CREATE_MUTATION = `
  mutation CreateGoal($input: TownsquareGoalsCreateInput!) {
    goals_create(input: $input) {
      success
      errors { message }
      goal { id name key url state { value label } }
    }
  }
`;

const GOAL_EDIT_MUTATION = `
  mutation EditGoal($input: TownsquareGoalsEditInput!) {
    goals_edit(input: $input) {
      goal { id name key url state { value label } isArchived }
    }
  }
`;

const GOAL_CREATE_UPDATE_MUTATION = `
  mutation CreateGoalUpdate($input: TownsquareGoalsCreateUpdateInput!) {
    goals_createUpdate(input: $input) {
      success
      errors { message }
      update { id url creationDate }
    }
  }
`;

const GOAL_LINK_WORK_ITEM_MUTATION = `
  mutation LinkWorkItem($input: TownsquareGoalsLinkWorkItemInput!) {
    goals_linkWorkItem(input: $input) {
      goal { id name key }
    }
  }
`;

const GOAL_UNLINK_WORK_ITEM_MUTATION = `
  mutation UnlinkWorkItem($input: TownsquareGoalsUnlinkWorkItemInput!) {
    goals_unlinkWorkItem(input: $input) {
      goal { id name key }
    }
  }
`;

/** Resolve a goal key to its ARI (needed for mutations) */
async function resolveGoalId(
  client: GraphQLClient,
  goalKey: string,
): Promise<{ success: boolean; goalId?: string; error?: string }> {
  const result = await getGoalByKey(client, goalKey);
  if (!result.success || !result.goal) {
    return { success: false, error: result.error ?? `Goal ${goalKey} not found` };
  }
  return { success: true, goalId: result.goal.id };
}

export async function createGoal(
  client: GraphQLClient,
  opts: { name: string; description?: string; parentGoalKey?: string; targetDate?: string },
): Promise<{ success: boolean; goal?: { name: string; key: string; url: string }; error?: string }> {
  const hasParent = !!opts.parentGoalKey;
  const goalTypeId = await resolveGoalType(client, hasParent);
  if (!goalTypeId) {
    return { success: false, error: 'Could not discover goal types for this instance. Goals may not be enabled.' };
  }

  const input: Record<string, unknown> = {
    containerId: client.getSiteAri(),
    name: opts.name,
    goalTypeId,
  };

  if (opts.parentGoalKey) {
    const parent = await resolveGoalId(client, opts.parentGoalKey);
    if (!parent.success) return { success: false, error: `Parent goal: ${parent.error}` };
    input.parentGoalId = parent.goalId;
  }

  if (opts.targetDate) {
    input.targetDate = { date: opts.targetDate, confidence: 'QUARTER' };
  }

  if (opts.description) {
    input.description = toAdf(opts.description);
  }

  const result = await client.queryTenanted<{ goals_create: { success: boolean; errors?: Array<{ message: string }>; goal: { id: string; name: string; key: string; url: string } | null } }>(
    GOAL_CREATE_MUTATION, { input },
  );

  if (!result.success || !result.data) {
    return { success: false, error: result.error ?? 'Create failed' };
  }

  const mutation = result.data.goals_create;
  if (!mutation.success || !mutation.goal) {
    const msg = mutation.errors?.map(e => e.message).join('; ') ?? 'Unknown error';
    return { success: false, error: msg };
  }

  return { success: true, goal: { name: mutation.goal.name, key: mutation.goal.key, url: mutation.goal.url } };
}

export async function editGoal(
  client: GraphQLClient,
  goalKey: string,
  opts: { name?: string; description?: string; targetDate?: string; startDate?: string; archived?: boolean },
): Promise<{ success: boolean; error?: string }> {
  const resolved = await resolveGoalId(client, goalKey);
  if (!resolved.success) return { success: false, error: resolved.error };

  const input: Record<string, unknown> = { goalId: resolved.goalId };

  if (opts.name !== undefined) input.name = opts.name;
  if (opts.description !== undefined) {
    input.description = toAdf(opts.description);
  }
  if (opts.targetDate !== undefined) {
    input.targetDate = { date: opts.targetDate, confidence: 'QUARTER' };
  }
  if (opts.startDate !== undefined) input.startDate = opts.startDate;
  if (opts.archived !== undefined) input.archived = opts.archived;

  const result = await client.queryTenanted(GOAL_EDIT_MUTATION, { input });
  if (!result.success) return { success: false, error: result.error };
  return { success: true };
}

export async function createGoalStatusUpdate(
  client: GraphQLClient,
  goalKey: string,
  status: string,
  summary?: string,
): Promise<{ success: boolean; error?: string }> {
  const resolved = await resolveGoalId(client, goalKey);
  if (!resolved.success) return { success: false, error: resolved.error };

  const input: Record<string, unknown> = {
    goalId: resolved.goalId,
    status,
  };

  if (summary) {
    input.summary = toAdf(summary);
  }

  const result = await client.queryTenanted<{ goals_createUpdate: { success: boolean; errors?: Array<{ message: string }> } }>(
    GOAL_CREATE_UPDATE_MUTATION, { input },
  );

  if (!result.success || !result.data) {
    return { success: false, error: result.error ?? 'Status update failed' };
  }

  const mutation = result.data.goals_createUpdate;
  if (!mutation.success) {
    const msg = mutation.errors?.map(e => e.message).join('; ') ?? 'Status update failed (no error details)';
    return { success: false, error: msg };
  }

  return { success: true };
}

const ISSUE_BY_KEY_QUERY = `
  query IssueByKey($cloudId: ID!, $key: String!) {
    jira { issueByKey(key: $key, cloudId: $cloudId) { id } }
  }
`;

/** Resolve a Jira issue key to its ARI (needed for goal work item linking) */
async function resolveIssueAri(
  client: GraphQLClient,
  issueKey: string,
): Promise<{ success: boolean; issueAri?: string; error?: string }> {
  const result = await client.queryTenanted<{ jira: { issueByKey: { id: string } | null } }>(
    ISSUE_BY_KEY_QUERY, { key: issueKey },
  );
  if (!result.success || !result.data?.jira?.issueByKey) {
    return { success: false, error: `Issue ${issueKey} not found` };
  }
  return { success: true, issueAri: result.data.jira.issueByKey.id };
}

export async function linkWorkItem(
  client: GraphQLClient,
  goalKey: string,
  issueKey: string,
): Promise<{ success: boolean; error?: string }> {
  const [resolved, issue] = await Promise.all([
    resolveGoalId(client, goalKey),
    resolveIssueAri(client, issueKey),
  ]);
  if (!resolved.success) return { success: false, error: resolved.error };
  if (!issue.success) return { success: false, error: issue.error };

  const result = await client.queryTenanted(GOAL_LINK_WORK_ITEM_MUTATION, {
    input: { goalId: resolved.goalId, workItemId: issue.issueAri },
  });

  if (!result.success) return { success: false, error: result.error };
  return { success: true };
}

export async function unlinkWorkItem(
  client: GraphQLClient,
  goalKey: string,
  issueKey: string,
): Promise<{ success: boolean; error?: string }> {
  const [resolved, issue] = await Promise.all([
    resolveGoalId(client, goalKey),
    resolveIssueAri(client, issueKey),
  ]);
  if (!resolved.success) return { success: false, error: resolved.error };
  if (!issue.success) return { success: false, error: issue.error };

  const result = await client.queryTenanted(GOAL_UNLINK_WORK_ITEM_MUTATION, {
    input: { goalId: resolved.goalId, workItemId: issue.issueAri },
  });

  if (!result.success) return { success: false, error: result.error };
  return { success: true };
}
