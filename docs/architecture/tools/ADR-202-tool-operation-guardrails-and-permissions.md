---
status: Accepted
date: 2026-03-05
deciders:
  - aaronsb
related:
  - ADR-200
---

# ADR-202: Tool Operation Guardrails and Permissions

## Context

This MCP server is a full Jira client — it can create, read, update, transition, comment on, link, delete, and move issues. It manages sprints, filters, projects, and boards. The server operates with whatever permissions the configured Jira API token grants, which typically means the authenticated user's full permission set.

LLM agents calling these tools need clear boundaries:

1. **What operations are fully supported** — the server does them directly, no restrictions beyond Jira's own permissions
2. **What operations are refused** — the server actively prevents them regardless of Jira permissions, because the blast radius is too high for an automated agent
3. **What operations are deflected** — the server won't do them but helps the user do them manually

The principle: the server should be a capable, willing tool for normal Jira work, but refuse to be a weapon for bulk-destructive operations that are hard to reverse.

## Decision

### Scope — What This Server Is For

This server covers **work that people do in Jira day-to-day**, across roles:

| Role | Daily work surface |
|------|-------------------|
| **Developer** | Issues, sprints, comments, transitions, time logging |
| **Team lead** | Sprint management, components, versions/releases, workload |
| **Product owner** | Roadmaps, goals, epics, prioritization, release planning |
| **Project manager** | Cross-project views, goals, progress tracking, reporting |

The server targets all of these personas. It is **not** a Jira administration tool.

### In Scope

| Area | Status | Notes |
|------|--------|-------|
| Issues (full lifecycle) | **Supported today** | Create, read, update, transition, comment, link, delete, move |
| Sprints | **Supported today** | Full CRUD + issue assignment |
| Filters / JQL | **Supported today** | Full CRUD + execution |
| Boards | **Supported today** | Read-only (get, list) |
| Projects | **Supported today** | Read-only (get, list) |
| Labels | **Supported today** | Via issue update |
| Components | **Planned** | List per project, assign to issues; create/manage components within a project |
| Versions / Releases | **Planned** | List per project, assign fix/affects version to issues; create/manage versions within a project |
| Watchers | **Planned** | Add/remove watchers on issues |
| Worklogs | **Planned** | Log time against issues |
| Attachments | **Partial** | Read on get; upload planned |
| Roadmaps (Jira Plans) | **Planned** | View/manage plans, cross-project timeline, dependency mapping |
| Goals / OKRs | **Planned** | View/manage goals, link issues to goals, track progress |
| Epics | **Supported today** | Just issues with an epic type — no special handling needed |

### Out of Scope — Admin Operations

These are instance/project administration tasks. A separate admin-focused MCP server could cover them:

| Area | Why out of scope |
|------|-----------------|
| Project create/update/delete | Structural changes to the Jira instance |
| Board create/update/delete | Board configuration is admin territory |
| Workflow design/modification | Scheme management, not daily work |
| Permission schemes | Instance security configuration |
| Field configuration | Custom field creation/modification (discovery is in scope per ADR-201, creation is not) |
| User management | Account administration |
| Automation rules | Admin-level workflow automation |
| JSM / Assets | Different product surface (service management) |
| Jira Marketplace apps | Third-party plugin administration |

### Fully Supported Operations

The server supports all standard Jira operations within the authenticated user's permissions. If Jira allows it for that user, the server does it:

| Domain | Operations |
|--------|-----------|
| **Issues** | Get, create, update, transition, comment, link, delete (single), move (single — change project/issue type) |
| **Sprints** | Get, create, update (including start/close), delete, list, manage issues (add/remove) |
| **Filters** | Get, create, update, delete, list, execute (JQL and saved) |
| **Projects** | Get, list |
| **Boards** | Get, list |

**Single-issue delete is allowed.** Deleting one issue is a normal Jira operation — users do it regularly, and Jira's own permission scheme controls who can. The server passes the request through and Jira enforces the permissions.

**Single-issue move is allowed.** Moving an issue to a different project or changing its issue type is a standard operation. The server handles the field mapping implications (required fields may differ in the target context).

### Refused Operations — Bulk Destructive

The server **refuses** operations that combine bulk scope with destructive or irreversible effect, regardless of the user's Jira permissions:

| Refused | Why | Deflection |
|---------|-----|------------|
| Bulk delete (multiple issues) | Irreversible, high blast radius, easy to specify wrong | Provide JQL query and Jira bulk-operations URL |
| Bulk move (multiple issues across projects) | Can break field configurations, workflows, and links at scale | Provide JQL query and Jira bulk-operations URL |
| Bulk transition to terminal state with > N issues | Closing 50 issues silently is likely a mistake | Suggest smaller batches or provide bulk-operations URL |
| Project create/update/delete | Admin operations — creating, modifying, or destroying projects is out of scope for a work-focused tool | Direct the user to Jira's project settings UI or suggest a dedicated admin MCP server |

When refusing, the server:
1. Explains why the operation is refused
2. Provides the JQL query that selects the target issues
3. Provides a direct URL to Jira's bulk operations UI: `https://{host}/issues/?jql={encoded_jql}` — where the user can review and execute the bulk action themselves with Jira's own confirmation flow
4. Suggests a single-issue alternative if applicable

Example refusal response:
```
Bulk delete is not supported through this tool — deleting 23 issues is
irreversible and best done with manual review.

**Your JQL query:** `project = PROJ AND status = "Won't Do"`
**Review and delete in Jira:** https://yourinstance.atlassian.net/issues/?jql=project%20%3D%20PROJ%20AND%20status%20%3D%20%22Won%27t%20Do%22

From Jira's issue list, select the issues and use the bulk operations
menu to delete them.

To delete a single issue: { "operation": "delete", "issueKey": "PROJ-123" }
```

### Detection of Bulk Operations

A bulk-destructive operation is detected when:

- A destructive operation (delete, move, terminal transition) is called repeatedly targeting multiple issues from a prior search result
- A hypothetical future batch/sequencer tool (ADR-200 principle 6) includes multiple destructive operations in a single sequence

The server tracks operation context within a session:
- If a destructive operation is called for more than **N issues within a sliding window** (e.g., 5 deletes in 60 seconds), the server refuses further calls and deflects to the bulk-operations URL
- The threshold N is configurable via environment variable (`JIRA_BULK_DESTRUCTIVE_LIMIT`, default: 3)

### Permission Passthrough

For all non-refused operations, the server does **not** layer its own permission model on top of Jira's. If the Jira API token has permission to do something, the server does it. If Jira denies it, the server surfaces Jira's error with context.

This means:
- A read-only token naturally prevents writes — the server doesn't need to check
- An admin token can do admin things — the server doesn't restrict
- The server's guardrails are solely about blast radius, not about reimplementing Jira's permission model

### Error Surfacing

When Jira returns a permission error, the server translates it into actionable guidance:

```
Jira denied this operation: "You do not have permission to delete issues
in project PROJ."

This is controlled by your Jira project's permission scheme. Contact your
Jira admin to request delete permission, or ask them to delete the issue
for you.
```

## Consequences

### Positive

- LLMs can do real work — create, update, transition, move, delete single issues without artificial restrictions
- Bulk-destructive operations are caught before damage occurs
- The deflection pattern (JQL + URL) keeps the user productive rather than just saying "no"
- Permission errors are surfaced with context rather than opaque Jira error codes
- No redundant permission layer — Jira is the source of truth

### Negative

- The sliding-window detection for bulk operations adds session state tracking
- A determined user can work around the bulk limit by spreading operations across sessions — but the goal is preventing accidents, not enforcing policy
- The bulk threshold is a heuristic — 3 might be too low for some workflows, too high for others

### Neutral

- Single-issue delete and move are explicitly supported — this may surprise users who expect the server to be conservative
- The deflection URLs depend on Jira's URL structure remaining stable (it has been for years)
- Future batch/sequencer tooling (ADR-200 principle 6) will need to integrate with these guardrails — destructive operations in a sequence count toward the sliding window

## Alternatives Considered

- **Refuse all deletes and moves**: Too restrictive. These are normal Jira operations and the server should support them. Refusing forces users out of their workflow for routine work.
- **No guardrails, trust Jira permissions entirely**: Jira permissions don't distinguish between "delete one issue" and "delete 500 issues" — both are allowed if the user has delete permission. The bulk-destructive guardrail adds a layer Jira doesn't have.
- **Configurable allow/deny list per operation**: Over-engineered for the current need. The distinction is simple: single operations pass through, bulk destructive operations are refused. If more granularity is needed later, it can be added.
- **Require confirmation for all destructive operations**: The MCP protocol doesn't have a native confirmation flow. The server can't pause and ask "are you sure?" — it can only return a response. Refusing with a helpful deflection is the closest equivalent.
