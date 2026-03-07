/**
 * MCP Prompt definitions for Jira analysis workflows.
 * Prompts are user-controlled templates surfaced by clients as slash commands or menu items.
 */

export interface PromptDef {
  name: string;
  description: string;
  arguments: { name: string; description: string; required: boolean }[];
}

export const promptDefinitions: PromptDef[] = [
  {
    name: 'backlog_health',
    description: 'Run a data quality health check on a project backlog — surfaces rot, staleness, and planning gaps',
    arguments: [
      { name: 'project', description: 'Jira project key (e.g. PROJ, ENG)', required: true },
    ],
  },
  {
    name: 'contributor_workload',
    description: 'Per-contributor workload breakdown with staleness and risk — scopes detail queries to fit within sample cap',
    arguments: [
      { name: 'project', description: 'Jira project key (e.g. PROJ, ENG)', required: true },
    ],
  },
  {
    name: 'sprint_review',
    description: 'Sprint review preparation — velocity, scope changes, at-risk items, and completion forecast',
    arguments: [
      { name: 'board_id', description: 'Jira board ID (find via manage_jira_board list)', required: true },
    ],
  },
  {
    name: 'narrow_analysis',
    description: 'Refine a capped analysis query — guides you to narrow JQL for precise detail metrics',
    arguments: [
      { name: 'jql', description: 'The JQL query to refine (from a previous capped analysis)', required: true },
    ],
  },
];
