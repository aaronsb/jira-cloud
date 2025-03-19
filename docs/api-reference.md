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

### Board and Project Management

| Tool | Description | Required Parameters | Optional Parameters |
|------|-------------|---------------------|---------------------|
| `manage_jira_board` | Comprehensive board management | `operation` | Depends on operation (see below) |
| `manage_jira_project` | Comprehensive project management | `operation` | Depends on operation (see below) |

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

### Issue Operations

| Tool | Description | Required Parameters | Optional Parameters |
|------|-------------|---------------------|---------------------|
| `create_jira_issue` | Create a new issue | `projectKey`, `summary`, `issueType` | `description`, `priority`, `assignee`, `labels`, `customFields` |
| `get_jira_issue` | Get issue with optional expansions | `issueKey` | `expand` |
| `update_jira_issue` | Update an issue | `issueKey` | `summary`, `description`, `parent`, `assignee`, `priority`, `labels`, `customFields` |
| `transition_jira_issue` | Change issue status | `issueKey`, `transitionId` | `comment` |
| `add_jira_comment` | Add a comment | `issueKey`, `body` | None |

### Search

| Tool | Description | Required Parameters | Optional Parameters |
|------|-------------|---------------------|---------------------|
| `search_jira_issues` | Search using JQL with enhanced results | `jql` | `startAt`, `maxResults`, `expand` |

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

#### Search Expansions
- `issue_details`: Include detailed issue information
- `transitions`: Include available transitions
- `comments_preview`: Include comment previews

## Example Usage

### Get Project with Boards

```typescript
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "get_jira_project",
  arguments: {
    projectKey: "PROJ",
    expand: ["boards"],
    include_status_counts: true
  }
});
```

### Get Issue with Comments and Transitions

```typescript
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "get_jira_issue",
  arguments: {
    issueKey: "PROJ-123",
    expand: ["comments", "transitions"]
  }
});
```

### Create Issue

```typescript
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "create_jira_issue",
  arguments: {
    projectKey: "PROJ",
    summary: "Example Issue",
    description: "This is a test issue",
    issueType: "Task"
  }
});
```

### Search Issues with Expanded Details

```typescript
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "search_jira_issues",
  arguments: {
    jql: "project = PROJ AND status = 'In Progress'",
    expand: ["issue_details"],
    maxResults: 50
  }
});
```


### Using Consolidated Board Management

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
