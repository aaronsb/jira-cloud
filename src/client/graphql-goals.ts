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
