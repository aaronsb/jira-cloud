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
`Analyze backlog health for project ${project}. Use the queue_jira_operations tool to run this as a pipeline.

Use queue_jira_operations with this pipeline:
Operation 0 — Save the query as a reusable filter:
{"tool":"manage_jira_filter","args":{"operation":"create","name":"${project} backlog health","jql":"project = ${project} AND resolution = Unresolved"}}

Operation 1 — Summary with data quality signals (uses $0.filterId):
{"tool":"analyze_jira_issues","args":{"filterId":"$0.filterId","metrics":["summary"],"groupBy":"priority","compute":["rot_pct = backlog_rot / open * 100","stale_pct = stale / open * 100","gap_pct = no_estimate / open * 100"]}}

Operation 2 — Flow analysis for transition patterns and bottlenecks:
{"tool":"analyze_jira_issues","args":{"filterId":"$0.filterId","metrics":["flow"],"maxResults":100}}

After the pipeline completes, summarize findings:
- What percentage of the backlog is rotting (no owner, no dates, untouched)?
- What's stuck in the same status for 30+ days?
- What's missing estimates or start dates?
- Flag the worst offenders by issue key.
- Recommend specific triage actions.
- The saved filter can be reused for follow-up analysis or shared with the team.`
      )],
    };
  },

  contributor_workload({ project }) {
    return {
      description: `Contributor workload for ${project}`,
      messages: [msg(
`Analyze contributor workload for project ${project}. Use queue_jira_operations to run the analysis pipeline in a single call.

Use queue_jira_operations with this pipeline:
Operation 0 — Save the base query as a filter:
{"tool":"manage_jira_filter","args":{"operation":"create","name":"${project} workload","jql":"project = ${project} AND resolution = Unresolved"}}

Operation 1 — Assignee distribution with quality signals (uses $0.filterId):
{"tool":"analyze_jira_issues","args":{"filterId":"$0.filterId","metrics":["summary"],"groupBy":"assignee","compute":["stale_pct = stale / open * 100","blocked_pct = blocked / open * 100"]}}

After the pipeline, for the top 3 assignees by open count, run scoped detail:
{"jql":"project = ${project} AND resolution = Unresolved AND assignee = '{name}'","metrics":["cycle","schedule"]}

This keeps each detail query within the sample cap for precise results.

Summarize:
- Who has the most open work?
- Who has the most stale or at-risk issues?
- Are there load imbalances?
- What needs reassignment or triage?
- The saved filter can be reused for follow-up workload checks.`
      )],
    };
  },

  sprint_review({ board_id }) {
    return {
      description: `Sprint review prep for board ${board_id}`,
      messages: [msg(
`Prepare a sprint review for board ${board_id}. Use manage_jira_sprint and analyze_jira_issues tools.

Step 1 — Find the active sprint:
Use manage_jira_sprint: {"operation":"list","boardId":${board_id},"state":"active"}

Step 2 — Use queue_jira_operations to run the analysis pipeline (use the sprint ID from step 1):
Operation 0 — Save the sprint query as a filter:
{"tool":"manage_jira_filter","args":{"operation":"create","name":"Sprint review board ${board_id}","jql":"sprint = {sprintId}"}}

Operation 1 — Summary + velocity metrics:
{"tool":"analyze_jira_issues","args":{"filterId":"$0.filterId","metrics":["summary","points","schedule"],"compute":["done_pct = resolved_7d / total * 100"]}}

Step 3 — Summarize:
- Current velocity vs planned
- Scope changes (items added/removed mid-sprint)
- At-risk items (overdue, blocked, stale)
- Completion forecast — will the sprint goal be met?
- The saved filter persists for daily standups or end-of-sprint reporting.`
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
