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
  /** Field names this route claims (matched case-insensitively, against the field name, the
   *  catalog name resolved from a `customfield_*` id, and — for app-managed fields — the
   *  Connect/Forge field key, e.g. `io.tempo.jira__account`). */
  names: string[];
  /** Capability id this route's (future) write handler needs — surfaced by jira://capabilities.
   *  No handler is wired yet, so today this is a declarative marker only. */
  requires?: string;
  /** Why this field can't be set through `customFields` here, and what to do instead. */
  unhandled: {
    reason: string;
    message: string;
    suggestedTool?: string;
  };
  // A `write` handler (and the create/update wiring that consults it) lands with the first real
  // capability-gated handler — e.g. a Tempo client that resolves an account key → numeric id.
  // See ADR-213 §B.
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
  {
    // The Tempo "Account" field. The standard issue-edit endpoint *does* accept it, but expects
    // the numeric Tempo account id — not the account key/name (e.g. 12345, not "PRAEAI-OPEX").
    // Jira reports errors for it keyed by the Connect field key `io.tempo.jira__account`.
    names: ['account', 'tempo account', 'io.tempo.jira__account'],
    requires: 'tempo',
    unhandled: {
      reason: 'tempo_account_needs_numeric_id',
      message:
        'The Account field is provided by the Tempo app. It can be set through customFields, but ' +
        'expects the numeric Tempo account id — not the account key/name. If you know the id: ' +
        'customFields: {"Account": 12345}. To find the id, look it up in the Tempo UI (Settings → ' +
        'Accounts) or in Tempo\'s API. Programmatic key→id resolution needs a Tempo API token ' +
        '(separate from the Jira token) and isn\'t wired here yet — see ADR-213. Setting the field ' +
        'inline in the Jira UI also works.',
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
