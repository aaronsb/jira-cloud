/**
 * Atlassian special-field handling (ADR-213 §B).
 *
 * Sprint, Epic Link / Parent Link / Parent, and Rank are Jira-native fields that can't be set
 * through a plain `customFields` write — each has a dedicated path. This module owns the routes that
 * say so; `classifyFieldErrors` surfaces the guidance when Jira rejects such a write. There's no
 * `detect()` — these fields are intrinsic to Jira, always "present".
 */

import type { ExtensionModule } from './types.js';

export const atlassianSpecialFields: ExtensionModule = {
  id: 'atlassian-special-fields',
  displayName: 'Atlassian special fields (Sprint, Epic Link, Rank)',
  routes: [
    {
      names: ['sprint'],
      unhandled: {
        reason: 'sprint_requires_agile_api',
        message:
          'The Sprint field is managed through the Agile API, not customFields. Use ' +
          'manage_jira_sprint with operation "manage_issues" to add the issue to a sprint (find the ' +
          'sprint id via manage_jira_sprint list / list_boards).',
        suggestedTool: 'manage_jira_sprint',
      },
    },
    {
      names: ['epic link', 'parent link', 'parent'],
      unhandled: {
        reason: 'parent_via_parent_param',
        message:
          'Epic Link / Parent Link / Parent are set via the "parent" parameter on ' +
          'manage_jira_issue update (pass the parent issue key) — not customFields. Use ' +
          'manage_jira_issue hierarchy to see the current parent/child structure.',
        suggestedTool: 'manage_jira_issue',
      },
    },
    {
      names: ['rank'],
      unhandled: {
        reason: 'rank_not_exposed',
        message:
          'Issue Rank (backlog ordering) is not settable through this server — reorder issues on a ' +
          'board in the Jira UI.',
      },
    },
  ],
};
