/**
 * Builds PromptMessage arrays for each prompt, substituting user-provided arguments.
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { promptDefinitions } from './prompt-definitions.js';

interface PromptMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string };
}

interface GetPromptResult {
  description: string;
  messages: PromptMessage[];
  [key: string]: unknown;
}

function msg(text: string): PromptMessage {
  return { role: 'user', content: { type: 'text', text } };
}

const builders: Record<string, (args: Record<string, string>) => GetPromptResult> = {
  backlog_health({ project }) {
    return {
      description: `Backlog health check for ${project}`,
      messages: [msg(
`Analyze backlog health for project ${project}. Use the analyze_jira_issues and manage_jira_filter tools.

Step 1 — Summary with data quality signals:
{"jql":"project = ${project} AND resolution = Unresolved","metrics":["summary"],"groupBy":"priority","compute":["rot_pct = backlog_rot / open * 100","stale_pct = stale / open * 100","gap_pct = no_estimate / open * 100"]}

Step 2 — Cycle metrics for staleness distribution and status age:
{"jql":"project = ${project} AND resolution = Unresolved","metrics":["cycle"],"maxResults":100}

Step 3 — Summarize findings:
- What percentage of the backlog is rotting (no owner, no dates, untouched)?
- What's stuck in the same status for 30+ days?
- What's missing estimates or start dates?
- Flag the worst offenders by issue key.
- Recommend specific triage actions.`
      )],
    };
  },

  contributor_workload({ project }) {
    return {
      description: `Contributor workload for ${project}`,
      messages: [msg(
`Analyze contributor workload for project ${project}. Use the analyze_jira_issues tool.

Step 1 — Assignee distribution with quality signals:
{"jql":"project = ${project} AND resolution = Unresolved","metrics":["summary"],"groupBy":"assignee","compute":["stale_pct = stale / open * 100","blocked_pct = blocked / open * 100"]}

Step 2 — For the top 3 assignees by open issue count, run scoped detail metrics:
{"jql":"project = ${project} AND resolution = Unresolved AND assignee = '{name}'","metrics":["cycle","schedule"]}

This pattern keeps each detail query within the sample cap for precise results.

Step 3 — Summarize:
- Who has the most open work?
- Who has the most stale or at-risk issues?
- Are there load imbalances?
- What needs reassignment or triage?`
      )],
    };
  },

  sprint_review({ board_id }) {
    return {
      description: `Sprint review prep for board ${board_id}`,
      messages: [msg(
`Prepare a sprint review for board ${board_id}. Use manage_jira_sprint and analyze_jira_issues tools.

Step 1 — Find the active sprint:
{"operation":"list","boardId":${board_id},"state":"active"}

Step 2 — Analyze sprint issues (use the sprint ID from step 1):
{"jql":"sprint = {sprintId}","metrics":["summary","points","schedule"],"compute":["done_pct = resolved_7d / total * 100"]}

Step 3 — Summarize:
- Current velocity vs planned
- Scope changes (items added/removed mid-sprint)
- At-risk items (overdue, blocked, stale)
- Completion forecast — will the sprint goal be met?`
      )],
    };
  },

  narrow_analysis({ jql }) {
    return {
      description: 'Refine a capped analysis query',
      messages: [msg(
`The previous analysis was sampled — detail metrics didn't cover all matching issues.

Original query: ${jql}

To get precise results, help me narrow the query. Here are useful approaches:

By assignee (each person's list usually fits within the cap):
{"jql":"${jql} AND assignee = currentUser()","metrics":["cycle","schedule"]}

By priority (focus on what matters):
{"jql":"${jql} AND priority in (High, Highest)","metrics":["cycle","schedule"]}

By issue type:
{"jql":"${jql} AND issuetype = Bug","metrics":["cycle"]}

By recency:
{"jql":"${jql} AND created >= -30d","metrics":["cycle"]}

Or use summary metrics for the full population (count API, no cap):
{"jql":"${jql}","metrics":["summary"],"groupBy":"assignee","compute":["stale_pct = stale / open * 100"]}

Ask me which dimension I'd like to drill into, or suggest the most useful one based on the original query.`
      )],
    };
  },
};

export function getPrompt(name: string, args?: Record<string, string>): GetPromptResult {
  const def = promptDefinitions.find(p => p.name === name);
  if (!def) {
    throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${name}`);
  }

  const resolvedArgs = args ?? {};
  for (const arg of def.arguments) {
    if (arg.required && !resolvedArgs[arg.name]) {
      throw new McpError(ErrorCode.InvalidParams, `Missing required argument: ${arg.name}`);
    }
  }

  const builder = builders[name];
  if (!builder) {
    throw new Error(`No message builder for prompt: ${name}`);
  }

  return builder(resolvedArgs);
}
