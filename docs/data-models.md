# Jira Cloud MCP Server Data Models

This document provides detailed diagrams and descriptions of the data models used in the Jira Cloud MCP Server.

> **Note**: The data model diagrams for this project are automatically generated from the TypeScript source code using typescript-graph, which produces Mermaid diagrams showing the relationships between files and classes. To update these diagrams, run `./scripts/build-diagrams.sh`.

## Table of Contents

1. [Introduction](#introduction)
2. [Core Data Models](#core-data-models)
3. [Response Models](#response-models)
4. [Pagination Models](#pagination-models)

## Introduction

The Jira Cloud MCP Server uses a set of well-defined data models to represent the various entities and responses from the Jira API. This document provides a detailed overview of these data models and their relationships.

For detailed data model diagrams, see the generated Mermaid file in `docs/generated/class-diagram.md`.

## Core Data Models

### JiraConfig

The `JiraConfig` interface defines the configuration needed to connect to a Jira Cloud instance:

- **host**: The URL of the Jira Cloud instance
- **email**: The email address used for authentication
- **apiToken**: The API token used for authentication
- **customFields**: A mapping of custom field names to their IDs

### JiraIssueDetails

The `JiraIssueDetails` interface represents a Jira issue with all its details:

- **key**: The issue key (e.g., PROJ-123)
- **summary**: The issue summary/title
- **description**: The issue description (in Atlassian Document Format)
- **status**: The current status of the issue
- **assignee**: The user assigned to the issue
- **reporter**: The user who reported the issue
- **comments**: Comments on the issue
- **attachments**: Files attached to the issue

### JiraAttachment

The `JiraAttachment` interface represents a file attached to a Jira issue:

- **id**: The attachment ID
- **filename**: The name of the file
- **mimeType**: The MIME type of the file
- **size**: The size of the file in bytes
- **created**: The creation date of the attachment
- **author**: The user who added the attachment
- **url**: The URL to download the attachment

## Response Models

### SearchResponse

The `SearchResponse` interface represents the response from a JQL search:

- **issues**: An array of `JiraIssueDetails` objects
- **pagination**: A `SearchPagination` object with pagination information

### FilterResponse

The `FilterResponse` interface represents a saved Jira filter:

- **id**: The filter ID
- **name**: The filter name
- **owner**: The user who owns the filter
- **jql**: The JQL query for the filter
- **viewUrl**: The URL to view the filter in Jira
- **sharePermissions**: The sharing permissions for the filter

### BoardResponse

The `BoardResponse` interface represents a Jira board:

- **id**: The board ID
- **name**: The board name
- **type**: The board type (e.g., scrum, kanban)
- **location**: The project or filter the board is associated with

### SprintResponse

The `SprintResponse` interface represents a sprint in a Jira board:

- **id**: The sprint ID
- **name**: The sprint name
- **state**: The sprint state (e.g., active, closed)
- **startDate**: The start date of the sprint
- **endDate**: The end date of the sprint
- **goal**: The sprint goal

## Pagination Models

### SearchPagination

The `SearchPagination` interface provides pagination information for search results:

- **startAt**: The index of the first result
- **maxResults**: The maximum number of results per page
- **total**: The total number of results
- **hasMore**: Whether there are more results available


Last updated: 2025-03-07 at 11:17:45
