---
status: Draft
date: 2026-03-27
deciders:
  - aaronsb
related:
  - ADR-200
  - ADR-203
---

# ADR-211: Attachment and Workspace Management

## Context

Jira issues support file attachments (screenshots, logs, documents, exports), but the MCP server currently has no way to interact with them. The `manage_jira_issue` tool can expand `attachments` in a `get` response, but there are no operations to upload, download, or manage attachment files.

This is a gap for several workflows:

- **Bug triage**: Viewing screenshots or log files attached to issues
- **Documentation**: Attaching design documents, specs, or exports to issues
- **Cross-issue operations**: Copying attachments between issues (download from one, upload to another)
- **Report generation**: Attaching generated reports or charts to issues for stakeholder consumption

### Multi-step file operations require staging

MCP tool calls are stateless — there is no way to hold binary content between calls. Without a staging area:

- Download returns metadata but there is nowhere to persist the bytes for a subsequent upload
- Upload requires base64 content in the tool call, which means the LLM must hold binary data in context
- Multi-step flows (download → process → upload) are impossible

### Proven pattern: confluence-cloud workspace

The `confluence-cloud` MCP server (ADR-502) solved this with an XDG-compliant workspace directory that sandboxes all file operations:

- Default path: `~/.local/share/{app-name}/workspace/`
- Configurable via `WORKSPACE_DIR` environment variable
- Security sandbox: path traversal prevention, symlink escape detection, forbidden path validation
- Two tools: `manage_confluence_media` (attachment CRUD) + `manage_workspace` (local file staging)

Both servers are Atlassian REST API clients with the same authentication model. The Jira attachment API surface is similar to Confluence's. Patterning closely reduces implementation risk and maintains consistency across the MCP server family.

### Jira attachment API

Jira Cloud v3 REST API provides:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/rest/api/3/issue/{issueKey}?fields=attachment` | GET | List attachments on an issue |
| `/rest/api/3/attachment/{id}` | GET | Get attachment metadata |
| `/rest/api/3/attachment/content/{id}` | GET | Download attachment content |
| `/rest/api/3/issue/{issueKey}/attachments` | POST | Upload attachment (multipart) |
| `/rest/api/3/attachment/{id}` | DELETE | Delete attachment |

The upload endpoint requires the `X-Atlassian-Token: no-check` header to bypass XSRF protection.

## Decision

Add two new tools — `manage_jira_media` and `manage_workspace` — following the confluence-cloud pattern (ADR-502).

### Tool 1: `manage_jira_media`

Attachment CRUD operations on Jira issues.

| Operation | Required Args | Optional Args | Effect |
|-----------|---------------|---------------|--------|
| `list` | `issueKey` | — | List attachments on an issue |
| `upload` | `issueKey`, `filename`, `mediaType` | `content` (base64) OR `workspaceFile` | Upload file to issue |
| `download` | `attachmentId` | `filename` | Download attachment to workspace |
| `view` | `attachmentId` | — | Display image inline (5MB limit) |
| `get_info` | `attachmentId` | — | Fetch attachment metadata |
| `delete` | `attachmentId` | — | Remove attachment |

Key design points:

- **`issueKey` not `pageId`**: Jira attaches files to issues, not pages. This is the only schema difference from confluence-cloud's `manage_confluence_media`.
- **Upload dual-source**: Accepts either `content` (base64-encoded) for direct upload or `workspaceFile` (filename in workspace) for staged uploads. Same pattern as confluence-cloud.
- **Download writes to workspace**: Returns absolute path and suggests next actions (view, upload to another issue, delete).
- **View returns image content**: For image attachments under 5MB, returns inline `image` content block. Non-images or oversized files return metadata with guidance to download instead.

### Tool 2: `manage_workspace`

Local file staging in an XDG-compliant sandbox. Identical interface to confluence-cloud's `manage_workspace`.

| Operation | Required Args | Optional Args | Effect |
|-----------|---------------|---------------|--------|
| `list` | — | — | List staged files with sizes and timestamps |
| `read` | `filename` | — | Return file content (inline for text <100KB or images <5MB, path reference otherwise) |
| `write` | `filename`, `content` | — | Write base64-encoded content to workspace |
| `delete` | `filename` | — | Remove file or directory |
| `mkdir` | `filename` | — | Create directory |
| `move` | `filename`, `destination` | — | Rename or relocate file |

### Workspace directory

```
~/.local/share/jira-cloud-mcp/
  workspace/          <- staging area for file operations
```

- `$XDG_DATA_HOME/jira-cloud-mcp/workspace/` if `XDG_DATA_HOME` is set
- `~/.local/share/jira-cloud-mcp/workspace/` otherwise
- `$WORKSPACE_DIR` overrides everything if set

### Security sandbox

Directly ported from confluence-cloud:

1. **Path traversal prevention**: Filenames sanitized (no `../`, no path separators, no null bytes). Resolved paths must remain within workspace.
2. **Symlink escape detection**: `fs.realpath()` post-resolution verifies actual path is within workspace.
3. **Forbidden paths**: Workspace cannot be home directory, `~/Documents`, `~/Downloads`, `~/Desktop`, cloud sync mounts, or filesystem root.
4. **Lazy creation**: Workspace directory created on first use with `recursive: true` and `0o755`.

### Queue integration

Both new tools are added to the `queue_jira_operations` tool enum, enabling pipelines like:

```
queue_jira_operations:
  1. manage_jira_filter execute_jql "project = PROJ AND attachments IS NOT EMPTY"
  2. manage_jira_media list issueKey: $0.issues[0].key
```

### Next-steps integration

Following existing bidirectional steering patterns:

- `manage_jira_issue get` (with attachments expanded) → suggests `manage_jira_media` for attachment operations
- `manage_jira_media download` → suggests `manage_workspace read` or `manage_jira_media upload`
- `manage_workspace list` → suggests `manage_jira_media upload` for staged files

### Code organization

```
src/
  workspace/
    workspace.ts        <- XDG paths, sandbox, sanitization (port from confluence-cloud)
    index.ts            <- exports
  handlers/
    media-handler.ts    <- manage_jira_media operations
    workspace-handler.ts <- manage_workspace operations
  schemas/
    tool-schemas.ts     <- add manage_jira_media + manage_workspace schemas
```

The `workspace/` module is a near-verbatim port from confluence-cloud with `APP_NAME = 'jira-cloud-mcp'` as the only change. The media handler adapts the confluence-cloud pattern to Jira's attachment API endpoints.

### Client methods

New methods on `JiraClient`:

```typescript
getAttachments(issueKey: string): Promise<Attachment[]>
getAttachmentInfo(id: string): Promise<Attachment>
downloadAttachment(id: string): Promise<Buffer>
uploadAttachment(issueKey: string, filename: string, content: Buffer, mediaType: string): Promise<Attachment>
deleteAttachment(id: string): Promise<void>
```

## Consequences

### Positive

- Enables attachment workflows that are currently impossible (upload, download, cross-issue copy)
- Consistent interface with confluence-cloud — agents working across both servers use the same patterns
- Workspace sandbox prevents accidental filesystem operations outside the jail
- Queue integration enables attachment pipelines
- XDG compliance gives predictable, user-configurable paths

### Negative

- Two new tools increases tool count from 8 to 10 — still within discoverable range per ADR-200
- Server now writes to the local filesystem — must handle permissions, disk space
- Workspace files persist between sessions unless explicitly deleted

### Neutral

- The workspace is optional — base64 upload works without it
- `manage_jira_issue get` with `expand: ["attachments"]` continues to work for read-only attachment listing
- File size limits should match Jira's configured attachment size limits
- The workspace directory persists across MCP server restarts

## Alternatives Considered

- **Add attachment operations to `manage_jira_issue`**: Would keep tool count at 8, but `manage_jira_issue` already has 10 operations and would grow to 16. This violates ADR-200's principle of keeping tools focused. The attachment lifecycle (upload, download, view, stage) is distinct from issue lifecycle (create, update, transition). Rejected.

- **Media tool without workspace**: Upload requires base64 in the tool call, download returns metadata only. Functional for single-step operations but cannot bridge download → upload across tool calls. The LLM would need to hold binary content in context. Rejected — same reasoning as confluence-cloud ADR-502.

- **In-memory file staging**: Store downloaded files in server memory. Simpler, but memory-constrained and lost on restart. Does not work for large files or across sessions. Rejected.

- **Shared workspace package**: Extract workspace module as a shared npm package used by both confluence-cloud and jira-cloud. Good long-term goal, but premature — start with a direct port and extract if a third consumer appears. Deferred.
