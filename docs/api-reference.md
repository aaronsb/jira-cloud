# API Reference

This document provides information about the available tools in the Jira Cloud MCP Server.

## Using MCP Tools

All tools are accessed through the MCP `use_mcp_tool` function:

```typescript
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "tool_name_here",
  arguments: {
    // Tool-specific parameters
  }
});
```

## Available Tools

### Board, Project, and Filter Management

| Tool | Description | Required Parameters | Optional Parameters |
|------|-------------|---------------------|---------------------|
| `manage_jira_board` | Board management with CRUD operations and related data | `operation` | Depends on operation (see below) |
| `manage_jira_project` | Project management with CRUD operations and related data | `operation` | Depends on operation (see below) |
| `manage_jira_filter` | Filter management with CRUD operations and issue retrieval | `operation` | Depends on operation (see below) |

#### Board Operations

| Operation | Description | Required Parameters | Optional Parameters |
|-----------|-------------|---------------------|---------------------|
| `get` | Get board details | `boardId` | `expand`, `include_sprints` |
| `list` | List all boards | None | `startAt`, `maxResults`, `include_sprints` |
| `create` | Create a new board | `name`, `type`, `projectKey` | None |
| `update` | Update a board | `boardId` | `name` |
| `delete` | Delete a board | `boardId` | None |
| `get_configuration` | Get board configuration | `boardId` | None |


#### Project Operations

| Operation | Description | Required Parameters | Optional Parameters |
|-----------|-------------|---------------------|---------------------|
| `get` | Get project details | `projectKey` | `expand`, `include_status_counts` |
| `list` | List all projects | None | `startAt`, `maxResults`, `include_status_counts` |
| `create` | Create a new project | `name`, `key` | `description`, `lead` |
| `update` | Update a project | `projectKey` | `name`, `description`, `lead` |
| `delete` | Delete a project | `projectKey` | None |

#### Filter Operations

| Operation | Description | Required Parameters | Optional Parameters |
|-----------|-------------|---------------------|---------------------|
| `get` | Get filter details | `filterId` | `expand` |
| `list` | List all filters | None | `startAt`, `maxResults`, `expand` |
| `create` | Create a new filter | `name`, `jql` | `description`, `favourite`, `sharePermissions` |
| `update` | Update a filter | `filterId` | `name`, `jql`, `description`, `favourite`, `sharePermissions` |
| `delete` | Delete a filter | `filterId` | None |
| `execute_filter` | Execute a filter to get matching issues | `filterId` | None |
| `execute_jql` | Execute a JQL query directly | `jql` | `startAt`, `maxResults`, `expand` |

### Issue Management

| Tool | Description | Required Parameters | Optional Parameters |
|------|-------------|---------------------|---------------------|
| `manage_jira_issue` | Issue management with CRUD operations, transitions, comments, and linking | `operation` | Depends on operation (see below) |

#### Issue Operations

| Operation | Description | Required Parameters | Optional Parameters |
|-----------|-------------|---------------------|---------------------|
| `create` | Create a new issue | `projectKey`, `summary`, `issueType` | `description`, `priority`, `assignee`, `labels`, `customFields` |
| `get` | Get issue with optional expansions | `issueKey` | `expand` |
| `update` | Update an issue | `issueKey` | `summary`, `description`, `parent`, `assignee`, `priority`, `labels`, `customFields` |
| `delete` | Delete an issue | `issueKey` | None |
| `transition` | Change issue status | `issueKey`, `transitionId` | `comment` |
| `comment` | Add a comment | `issueKey`, `comment` | None |
| `link` | Link issues together | `issueKey`, `linkedIssueKey`, `linkType` | None |

### Sprint Management

| Tool | Description | Required Parameters | Optional Parameters |
|------|-------------|---------------------|---------------------|
| `manage_jira_sprint` | Sprint management with CRUD operations and issue management | `operation` | Depends on operation (see below) |

#### Sprint Operations

| Operation | Description | Required Parameters | Optional Parameters |
|-----------|-------------|---------------------|---------------------|
| `get` | Get sprint details | `sprintId` | `expand` |
| `list` | List all sprints for a board | `boardId` | `startAt`, `maxResults`, `state`, `expand` |
| `create` | Create a new sprint | `boardId`, `name` | `startDate`, `endDate`, `goal` |
| `update` | Update a sprint | `sprintId` | `name`, `startDate`, `endDate`, `goal`, `state` |
| `delete` | Delete a sprint | `sprintId` | None |
| `manage_issues` | Add or remove issues from a sprint | `sprintId` | `add`, `remove` |

## Common Parameters

- `issueKey`: The Jira issue key (e.g., "PROJ-123")
- `boardId`: The ID of the board (numeric)
- `projectKey`: The Jira project key (e.g., "PROJ")
- `jql`: JQL query string
- `expand`: Array of fields to expand in the response

### Expansion Options

#### Issue Expansions
- `comments`: Include issue comments
- `transitions`: Include available transitions
- `attachments`: Include file attachments
- `related_issues`: Include linked issues
- `history`: Include change history

#### Project Expansions
- `boards`: Include project boards
- `components`: Include project components
- `versions`: Include project versions
- `recent_issues`: Include recent issues

#### Board Expansions
- `sprints`: Include board sprints
- `issues`: Include board issues
- `configuration`: Include board configuration

#### Filter Expansions
- `jql`: Include JQL query
- `description`: Include filter description
- `permissions`: Include sharing permissions
- `issue_count`: Include count of matching issues

#### Search/Execute JQL Expansions
- `issue_details`: Include detailed issue information
- `transitions`: Include available transitions
- `comments_preview`: Include comment previews

## Example Usage

### Using Issue Management

```typescript
// Create a new issue
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "manage_jira_issue",
  arguments: {
    operation: "create",
    projectKey: "PROJ",
    summary: "Example Issue",
    description: "This is a test issue",
    issueType: "Task"
  }
});

// Get issue with comments and transitions
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "manage_jira_issue",
  arguments: {
    operation: "get",
    issueKey: "PROJ-123",
    expand: ["comments", "transitions"]
  }
});

// Update an issue
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "manage_jira_issue",
  arguments: {
    operation: "update",
    issueKey: "PROJ-123",
    summary: "Updated Issue Title",
    description: "This issue has been updated"
  }
});

// Add a comment to an issue
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "manage_jira_issue",
  arguments: {
    operation: "comment",
    issueKey: "PROJ-123",
    comment: "This is a new comment"
  }
});
```

### Using Board Management

```typescript
// Get a board with sprints
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "manage_jira_board",
  arguments: {
    operation: "get",
    boardId: 123,
    expand: ["sprints"]
  }
});

// List all boards with pagination
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "manage_jira_board",
  arguments: {
    operation: "list",
    startAt: 0,
    maxResults: 50,
    include_sprints: true
  }
});

// Create a new board
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "manage_jira_board",
  arguments: {
    operation: "create",
    name: "New Development Board",
    type: "scrum",
    projectKey: "PROJ"
  }
});
```

### Using Filter Management

```typescript
// List all filters
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "manage_jira_filter",
  arguments: {
    operation: "list",
    expand: ["jql", "description"]
  }
});

// Execute a filter to get matching issues
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "manage_jira_filter",
  arguments: {
    operation: "execute_filter",
    filterId: "12345"
  }
});

// Execute a JQL query directly with enhanced results
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "manage_jira_filter",
  arguments: {
    operation: "execute_jql",
    jql: "project = PROJ AND status = 'In Progress' ORDER BY created DESC",
    maxResults: 50,
    expand: ["issue_details", "transitions"]
  }
});
```

### Using Sprint Management

```typescript
// Create a new sprint
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "manage_jira_sprint",
  arguments: {
    operation: "create",
    boardId: 123,
    name: "Sprint 1",
    goal: "Complete core features"
  }
});

// Add issues to a sprint
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "manage_jira_sprint",
  arguments: {
    operation: "manage_issues",
    sprintId: 456,
    add: ["PROJ-123", "PROJ-124", "PROJ-125"]
  }
});
```

## Error Handling

All tools return errors in this format:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: Description of what went wrong"
    }
  ],
  "isError": true
}
```

Common error codes:
- 400: Bad Request (invalid parameters)
- 401: Unauthorized (invalid credentials)
- 403: Forbidden (insufficient permissions)
- 404: Not Found (resource doesn't exist)
