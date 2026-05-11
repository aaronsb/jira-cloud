/**
 * Curated routing table for fields that need special handling beyond the standard issue-edit
 * endpoint (ADR-213 §B1).
 *
 * Part A seeds it with Atlassian's own special fields, all "unhandled" — the MCP can't set them
 * via `customFields`, but it knows which path you should use instead, and `classifyFieldErrors`
 * surfaces that when Jira rejects a write. Part B will add capability-gated entries (e.g. Tempo
 * Account) that carry an actual `write` handler.
 *
 * Growing this table is a deliberate, reviewed act — it is *not* an extension point. New entries
 * earn their place by unblocking a common user flow.
 */

export interface FieldRoute {
  /** Field names this route claims (matched case-insensitively, against both the field name and,
   *  for `customfield_*` ids, the catalog name resolved from that id). */
  names: string[];
  /** Capability that must be present for a write handler to apply (Part B). Absent ⇒ no handler. */
  requires?: string;
  /** Why this field can't be set through `customFields`, and what to do instead. */
  unhandled: {
    reason: string;
    message: string;
    suggestedTool?: string;
  };
  // write?(ctx, issueKey, value): Promise<...> and read?(ctx, issue): Promise<...> land in Part B.
}

const ROUTES: FieldRoute[] = [
  {
    names: ['sprint'],
    unhandled: {
      reason: 'sprint_requires_agile_api',
      message:
        'The Sprint field is managed through the Agile API, not customFields. Use manage_jira_sprint ' +
        'with operation "manage_issues" to add the issue to a sprint (find the sprint id via ' +
        'manage_jira_sprint list / list_boards).',
      suggestedTool: 'manage_jira_sprint',
    },
  },
  {
    names: ['epic link', 'parent link', 'parent'],
    unhandled: {
      reason: 'parent_via_parent_param',
      message:
        'Epic Link / Parent Link / Parent are set via the "parent" parameter on manage_jira_issue ' +
        'update (pass the parent issue key) — not customFields. Use manage_jira_issue hierarchy to ' +
        'see the current parent/child structure.',
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
];

/** Find the route claiming a given field name or catalog name, if any. */
export function routeForField(nameOrCatalogName: string): FieldRoute | undefined {
  const lower = nameOrCatalogName.toLowerCase();
  return ROUTES.find(r => r.names.some(n => n.toLowerCase() === lower));
}

/** All routes — for the jira://capabilities resource (Part B) and diagnostics. */
export function allFieldRoutes(): readonly FieldRoute[] {
  return ROUTES;
}
