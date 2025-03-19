# Jira Cloud MCP Tool Consolidation

This document provides an overview of the tool consolidation refactoring that has been implemented in the Jira Cloud MCP.

## Overview

The Jira Cloud MCP has been refactored to provide a more streamlined and consistent API for interacting with Jira. The key improvements include:

1. **Consolidated API**: Reduced the number of tools by consolidating related functionality into single, more powerful tools.
2. **Consistent Response Format**: All responses now follow a consistent structure with data, metadata, and summary sections.
3. **Expandable Responses**: Added support for optional expansions to include additional data in responses.
4. **Contextual Information**: Responses now include related entities and suggested actions.

## New API Structure

All responses now follow this consistent structure:

```json
{
  "data": {
    // Primary requested data
  },
  "_metadata": {
    "expansions": ["field1", "field2", ...],
    "related": {
      "parent": "PROJ-123",
      "children": ["CHILD-1", "CHILD-2"]
    },
    "pagination": { ... }
  },
  "_summary": {
    "status_counts": { ... },
    "suggested_actions": [ ... ]
  }
}
```

## Consolidated Tools

### Issues API

#### `get_jira_issue`

Get comprehensive information about a Jira issue with optional expansions.

```json
{
  "issueKey": "PROJ-123",
  "expand": ["comments", "transitions", "attachments"]
}
```

### Projects API

#### `get_jira_project`

Get comprehensive information about a Jira project with optional expansions.

```json
{
  "projectKey": "PROJ",
  "expand": ["boards", "recent_issues"],
  "include_status_counts": true
}
```

#### `list_jira_projects`

Get a list of all projects in Jira with optional status counts.

```json
{
  "include_status_counts": true
}
```

### Boards API

#### `get_jira_board`

Get comprehensive information about a Jira board with optional expansions.

```json
{
  "boardId": 123,
  "expand": ["sprints"]
}
```

#### `list_jira_boards`

Get a list of all boards in Jira with optional sprint information.

```json
{
  "include_sprints": true
}
```

### Search API

#### `search_jira_issues`

Search for issues using JQL with enhanced results and optional expansions.

```json
{
  "jql": "project = PROJ AND status = 'In Progress'",
  "startAt": 0,
  "maxResults": 25,
  "expand": ["issue_details", "transitions"]
}
```

## Examples

### Getting an issue with comments and transitions

```json
{
  "issueKey": "PROJ-123",
  "expand": ["comments", "transitions"]
}
```

Response:

```json
{
  "data": {
    "key": "PROJ-123",
    "summary": "Implement new feature",
    "description": "...",
    "status": "In Progress",
    "assignee": "John Doe",
    "comments": [
      {
        "id": "12345",
        "author": "Jane Smith",
        "body": "This looks good!",
        "created": "2025-03-18T09:00:00.000Z"
      }
    ],
    "transitions": [
      {
        "id": "31",
        "name": "Done",
        "to": {
          "id": "10001",
          "name": "Done",
          "description": "Work has been completed"
        }
      }
    ]
  },
  "_metadata": {
    "expansions": ["attachments", "related_issues", "history"],
    "related": {
      "parent": "PROJ-100",
      "linked_issues": ["PROJ-124", "PROJ-125"]
    }
  },
  "_summary": {
    "suggested_actions": [
      {
        "text": "Move to Done",
        "action_id": "31"
      },
      {
        "text": "Assign to team member"
      }
    ]
  }
}
```

### Getting a project with boards and status counts

```json
{
  "projectKey": "PROJ",
  "expand": ["boards"],
  "include_status_counts": true
}
```

Response:

```json
{
  "data": {
    "id": "10000",
    "key": "PROJ",
    "name": "Sample Project",
    "description": "A sample project",
    "lead": "John Doe",
    "url": "https://jira.example.com/projects/PROJ",
    "status_counts": {
      "To Do": 5,
      "In Progress": 3,
      "Done": 10
    },
    "boards": [
      {
        "id": 1,
        "name": "PROJ Board",
        "type": "scrum",
        "location": {
          "projectId": 10000,
          "projectName": "Sample Project"
        },
        "self": "https://jira.example.com/rest/agile/1.0/board/1"
      }
    ]
  },
  "_metadata": {
    "expansions": ["components", "versions", "recent_issues"]
  },
  "_summary": {
    "status_counts": {
      "To Do": 5,
      "In Progress": 3,
      "Done": 10
    },
    "suggested_actions": [
      {
        "text": "View all issues in PROJ"
      },
      {
        "text": "Create issue in PROJ"
      }
    ]
  }
}
```
