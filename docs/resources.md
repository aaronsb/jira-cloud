# Jira Cloud MCP Resources

This document describes the MCP resources provided by the Jira Cloud MCP server.

## Overview

The Jira Cloud MCP server provides resources that allow AI systems to access information about your Jira instance. These resources provide context about projects, boards, tools, and other Jira entities without requiring explicit tool calls.

## Available Resources

### Static Resources

Static resources have fixed URIs and provide specific information:

| Resource URI | Description |
|--------------|-------------|
| `jira://instance/summary` | High-level statistics about the Jira instance |
| `jira://projects/distribution` | Distribution of projects by type and status |
| `jira://issue-link-types` | List of all available issue link types in the Jira instance |
| `jira://tools/{toolName}/documentation` | Comprehensive documentation for a specific Jira tool |

### Resource Templates

Resource templates have variable components in their URIs, allowing you to access information about specific entities:

| Resource Template | Description |
|-------------------|-------------|
| `jira://projects/{projectKey}/overview` | Overview of a specific project including metadata and statistics |
| `jira://boards/{boardId}/overview` | Overview of a specific board including sprints and statistics |

## Using Resources

Resources can be accessed using the MCP `access_mcp_resource` function:

```typescript
await access_mcp_resource({
  server_name: "jira-cloud",
  uri: "jira://instance/summary"
});
```

For resource templates, replace the variable components with actual values:

```typescript
await access_mcp_resource({
  server_name: "jira-cloud",
  uri: "jira://projects/PROJ/overview"
});
```

## Resource Details

### Instance Summary (`jira://instance/summary`)

Provides high-level statistics about the Jira instance:

```json
{
  "totalProjects": 8,
  "totalBoards": 7,
  "activeSprintsCount": 2,
  "projectTypes": {
    "software": 6,
    "service_desk": 2
  },
  "recentActivity": {
    "timestamp": "2025-03-19T18:04:24.000Z"
  }
}
```

### Project Distribution (`jira://projects/distribution`)

Provides distribution statistics about projects:

```json
{
  "byType": {
    "software": 6,
    "service_desk": 2
  },
  "byLead": {
    "John Doe": 3,
    "Jane Smith": 2,
    "Other Users": 3
  },
  "total": 8
}
```

### Project Overview (`jira://projects/{projectKey}/overview`)

Provides detailed information about a specific project:

```json
{
  "key": "PROJ",
  "name": "Sample Project",
  "description": "This is a sample project",
  "lead": "John Doe",
  "url": "https://your-instance.atlassian.net/rest/api/3/project/10001",
  "issueCount": 42,
  "statusDistribution": {
    "To Do": 15,
    "In Progress": 12,
    "Done": 15
  },
  "recentIssues": [
    {
      "key": "PROJ-123",
      "summary": "Fix login bug",
      "status": "In Progress"
    },
    {
      "key": "PROJ-124",
      "summary": "Update documentation",
      "status": "To Do"
    }
  ]
}
```

### Board Overview (`jira://boards/{boardId}/overview`)

Provides detailed information about a specific board:

```json
{
  "id": 1,
  "name": "Sample Board",
  "type": "scrum",
  "location": {
    "projectId": "10001",
    "projectName": "Sample Project"
  },
  "sprints": [
    {
      "id": 1,
      "name": "Sprint 1",
      "state": "active",
      "startDate": "2025-03-10T00:00:00.000Z",
      "endDate": "2025-03-24T00:00:00.000Z",
      "goal": "Complete core features"
    },
    {
      "id": 2,
      "name": "Sprint 2",
      "state": "future",
      "startDate": "2025-03-24T00:00:00.000Z",
      "endDate": "2025-04-07T00:00:00.000Z",
      "goal": "Implement user feedback"
    }
  ]
}
```

### Tool Documentation (`jira://tools/{toolName}/documentation`)

Provides comprehensive documentation for a specific Jira tool, including operations, parameters, examples, and common use cases:

```json
{
  "name": "Issue Management",
  "description": "Issue management with CRUD operations, transitions, comments, and linking",
  "operations": {
    "get": {
      "description": "Retrieves issue details",
      "required_parameters": ["issueKey"],
      "optional_parameters": ["expand"],
      "expand_options": ["comments", "transitions", "attachments", "related_issues", "history"],
      "examples": [
        {
          "description": "Get basic issue details",
          "code": {
            "operation": "get",
            "issueKey": "PROJ-123"
          }
        },
        {
          "description": "Get issue with comments and attachments",
          "code": {
            "operation": "get",
            "issueKey": "PROJ-123",
            "expand": ["comments", "attachments"]
          }
        }
      ]
    },
    "create": {
      "description": "Creates a new issue",
      "required_parameters": ["projectKey", "summary", "issueType"],
      "optional_parameters": ["description", "assignee", "priority", "labels", "customFields"],
      "examples": [
        {
          "description": "Create a basic issue",
          "code": {
            "operation": "create",
            "projectKey": "PROJ",
            "summary": "New feature request",
            "issueType": "Story"
          }
        }
      ]
    }
  },
  "common_use_cases": [
    {
      "title": "Tracking work logs",
      "description": "To track time spent on issues:",
      "steps": [
        {
          "description": "Add a work log to an issue",
          "code": {
            "operation": "update",
            "issueKey": "PROJ-123",
            "customFields": {
              "worklog": {
                "timeSpent": "3h 30m",
                "comment": "Implemented feature X",
                "started": "2025-04-09T09:00:00.000Z"
              }
            }
          }
        }
      ]
    }
  ],
  "related_resources": [
    {
      "name": "Project Overview",
      "uri": "jira://projects/{projectKey}/overview",
      "description": "Get detailed information about a project"
    }
  ]
}
```

Available tool documentation resources:

| Tool Documentation URI | Description |
|------------------------|-------------|
| `jira://tools/manage_jira_issue/documentation` | Documentation for issue management operations |
| `jira://tools/manage_jira_board/documentation` | Documentation for board management operations |
| `jira://tools/manage_jira_sprint/documentation` | Documentation for sprint management operations |
| `jira://tools/manage_jira_filter/documentation` | Documentation for filter management operations |
| `jira://tools/manage_jira_project/documentation` | Documentation for project management operations |

## Error Handling

If a resource is not found or an error occurs, the server will return an appropriate error message. For example, if a project with the specified key does not exist, you'll receive an error like:

```
Error: Project not found: INVALID-KEY
```

## Performance Considerations

Resources are designed to be lightweight and efficient, but some resources may require multiple API calls to Jira. For large Jira instances, consider using more specific resources (like project or board overviews) rather than instance-wide resources when possible.
