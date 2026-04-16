---
status: Accepted
date: 2026-04-02
deciders:
  - aaronsb
related:
  - ADR-200
  - ADR-211
---

# ADR-212: Tool Surface Consolidation and JSM Customer Requests

## Context

The server has grown to 10 tools after ADR-211 added `manage_jira_media` and `manage_workspace`. The current surface works but has two issues:

1. **`manage_jira_board` is too thin.** It has 2 read-only operations (get, list). The only reason to look at a board is to work with its sprints. Boards and sprints are the same mental model — iterations. Having separate tools forces an unnecessary hop.

2. **`manage_workspace` is ambiguous.** The name doesn't signal "local-only" and collides with the same tool name in the confluence-cloud server. The local/remote boundary (established in ADR-211) should be visible in the tool name itself.

3. **No customer-side JSM support.** Jira Service Management exposes a customer portal API (`/rest/servicedeskapi/`) for raising and tracking service requests. This is the "I'm a user asking for help" persona — distinct from the agent/admin side, and consistent with this server's role as a Jira user tool.

### Tool count budget

ADR-200 established that tools should be discoverable. The practical ceiling is ~10 tools — beyond that, LLMs struggle with tool selection. The current 10 is at the limit, so adding the request tool requires freeing a slot.

## Decision

Three changes to the tool surface:

### 1. Merge `manage_jira_board` into `manage_jira_sprint`

`manage_jira_sprint` absorbs the board operations. A board is the container you look at to find sprints — they're one workflow.

**Before (2 tools, 8 operations):**

| manage_jira_board | manage_jira_sprint |
|---|---|
| get, list | get, create, update, delete, list, manage_issues |

**After (1 tool, 8 operations):**

| manage_jira_sprint |
|---|
| get_board, list_boards, get, create, update, delete, list, manage_issues |

Board operations become `list_boards` and `get_board` to disambiguate from sprint `list` and `get`. The `boardId` parameter is shared — you already need it to list sprints.

### 2. Rename `manage_workspace` to `manage_local_workspace`

Reinforces the local/remote boundary from ADR-211 at the tool name level. Every `manage_jira_*` tool affects Jira. `manage_local_workspace` is visibly different — it's the only tool that operates purely on the local filesystem.

### 3. Add `manage_jira_request` for customer-side JSM

A new tool for interacting with Jira Service Management as a customer (not an agent or admin). This is the `/rest/servicedeskapi/` surface.

| Operation | Required Args | Effect |
|-----------|---------------|--------|
| `list_portals` | — | Service desks available to me |
| `list_request_types` | `serviceDeskId` | What can I request? Use `expand: ["fields"]` to also fetch field schemas inline (capped at 20 types) |
| `get_request_type` | `serviceDeskId`, `requestTypeId` | One type + dynamic field schema (required, type, valid values) — the "what do I need to fill out" step |
| `create` | `serviceDeskId`, `requestTypeId`, `summary` | Raise a request |
| `get` | `issueKey` | Rich-by-default: status, SLA, fields, comments, transitions, attachments, participants in one call |
| `comment` | `issueKey`, `comment` | Add customer-visible comment |
| `transition` | `issueKey`, `transitionId` | Customer-side transition (reopen, mark resolved, cancel). IDs come from `get` |
| `list` | — | My open/recent requests (includes requestType + status via expand) |

Key design points:

- **Customer persona only.** No queue management, SLA configuration, or agent workflows. Those belong in a separate service-management server.
- **Progressive disclosure.** List ops stay lean; `expand: ["fields"]` and `get_request_type` opt in to the dynamic field schema when needed. `get` is rich-by-default because customer-service flows want the whole picture in one call.
- **Customer-side transitions.** `transition` uses `/rest/servicedeskapi/request/{key}/transition` (customer endpoint), not the agent-side workflow. IDs are discovered via `get` — no separate list operation needed.
- **Requests are issues underneath.** Once a request exists, `manage_jira_issue` can update arbitrary fields. The request tool handles the customer-facing API surface.
- **Attachments via `manage_jira_media`.** JSM requests support attachments through the same Jira attachment API. No duplication needed.
- **SLA visibility.** The `get` operation surfaces SLA status (time to first response, time to resolution) since that's the primary customer concern.

### Resulting tool surface (10 tools)

| Domain | Tool | Operations |
|--------|------|-----------|
| Plan & Track | `manage_jira_issue` | create, get, update, delete, move, transition, comment, link, hierarchy, worklog |
| | `manage_jira_filter` | get, create, update, delete, list, execute_filter, execute_jql |
| | `manage_jira_project` | get, list |
| | `manage_jira_sprint` | list_boards, get_board, get, create, update, delete, list, manage_issues |
| Analyze | `analyze_jira_issues` | summary, points, time, schedule, cycle, distribution, flow, hierarchy, cube_setup |
| | `manage_jira_plan` | analyze, release, list_goals, get_goal, create_goal, update_goal, update_goal_status, link_work_item, unlink_work_item |
| Service | `manage_jira_request` | list_portals, list_request_types, get_request_type, create, get, comment, transition, list |
| Content | `manage_jira_media` | list, upload, download, view, get_info, delete |
| Local | `manage_local_workspace` | list, read, write, delete, mkdir, move |
| Orchestrate | `queue_jira_operations` | (wraps all above) |

### Next-steps wiring

New steering connections for `manage_jira_request`:

- `manage_jira_request get` → suggests `manage_jira_issue` for field updates, `manage_jira_media` for attachments
- `manage_jira_request create` → suggests `manage_jira_request get` to check status, `manage_jira_media upload` to attach files
- `manage_jira_issue get` (on a JSM issue) → suggests `manage_jira_request get` for SLA view
- `manage_jira_sprint get` → existing steering to analysis stays, no change needed

Updated steering for merged sprint tool:

- `manage_jira_sprint list_boards` → suggests `get_board` or `list` (sprints)
- `manage_jira_sprint get_board` → suggests `list` (sprints on this board)

## Consequences

### Positive

- Board+sprint merge removes a thin tool, matches how users think about iterations
- Workspace rename makes local/remote boundary visible in tool selection
- Customer JSM support covers a common user workflow without expanding the admin surface
- Stays at 10 tools — no increase despite adding a new domain

### Negative

- `manage_jira_board` removal is a breaking change for existing users
- `manage_workspace` rename is a breaking change
- `manage_jira_sprint` grows from 6 to 8 operations (acceptable — the board ops are simple)
- JSM customer API requires service desk to be enabled on the Jira instance

### Neutral

- `manage_jira_request` is additive — registers only if the servicedeskapi is reachable (like `manage_jira_plan` with GraphQL)
- Queue tool automatically picks up renamed/new tools via the enum
- The request tool uses Basic Auth (same as all other tools) — JSM customer API supports it

## Alternatives Considered

- **Absorb `manage_jira_project` into `manage_jira_issue`**: Would add `list_projects` and `get_project` operations to the already-largest tool (12 ops). Rejected — keeps the fattest tool from getting fatter.

- **Separate server for JSM**: Clean separation, but overkill for 8 customer-side operations. The agent/admin JSM surface would justify a separate server; the customer surface does not. Revisit if we add agent features.

- **Rename `manage_workspace` to `manage_jira_workspace`**: Misleading — it doesn't affect Jira. The `local` prefix is more honest.

- **GraphQL (AGG) for the customer surface**: Explored via the atlassian-graph explorer against a live Atlassian instance. Rejected. The GraphQL gateway has invested in JSM admin/agent config (Help Center branding, request type categories, search/discovery of portals and articles) but has no `createCustomerRequest` mutation, no "my requests" query, no customer-visible comment mutation, and the `JiraQuery.jiraServiceManagementSlaIssue` field is gated behind a feature flag that is disabled on the Praecipio tenant (returns `jira_graphql_for_sla_resource is disabled` — 404 NOT_IMPLEMENTED). Atlassian kept the customer CRUD lifecycle on `/rest/servicedeskapi/`. Revisit only if Atlassian ships customer-side GraphQL mutations or enables the SLA resource broadly.
