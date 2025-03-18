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

| Tool | Description | Required Parameters |
|------|-------------|---------------------|
| `list_jira_boards` | List all boards | None |
| `list_jira_sprints` | List sprints for a board | `boardId` |
| `list_jira_projects` | List all projects | None |
| `list_jira_filters` | List saved filters | None |

### Issue Operations

| Tool | Description | Required Parameters |
|------|-------------|---------------------|
| `create_jira_issue` | Create a new issue | `projectKey`, `summary`, `issueType` |
| `get_jira_issue` | Get basic issue info | `issueKey` |
| `get_jira_issue_details` | Get comprehensive issue info | `issueKey` |
| `get_jira_issue_attachments` | Get issue attachments | `issueKey` |
| `update_jira_issue` | Update an issue | `issueKey` |

### Issue Transitions and Comments

| Tool | Description | Required Parameters |
|------|-------------|---------------------|
| `get_jira_transitions` | Get available transitions | `issueKey` |
| `transition_jira_issue` | Change issue status | `issueKey`, `transitionId` |
| `add_jira_comment` | Add a comment | `issueKey`, `body` |

### Search and Filtering

| Tool | Description | Required Parameters |
|------|-------------|---------------------|
| `search_jira_issues` | Search using JQL | `jql` |
| `get_jira_filter_issues` | Get issues from saved filter | `filterId` |
| `get_jira_fields` | Get populated fields | `issueKey` |

## Common Parameters

- `issueKey`: The Jira issue key (e.g., "PROJ-123")
- `boardId`: The ID of the board
- `jql`: JQL query string
- `filterId`: The saved filter ID

## Example Usage

### List Projects

```typescript
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "list_jira_projects",
  arguments: {}
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

### Search Issues

```typescript
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "search_jira_issues",
  arguments: {
    jql: "project = PROJ AND status = 'In Progress'"
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
