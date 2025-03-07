# Jira Cloud MCP Server Transaction Models

This document provides detailed diagrams illustrating the transaction models for various request types in the Jira Cloud MCP Server.

> **Note**: The transaction model diagrams for this project are automatically generated from the TypeScript source code using typescript-graph, which produces Mermaid diagrams showing the relationships between files and classes. To update these diagrams, run `./scripts/build-diagrams.sh`.

## Table of Contents

1. [Introduction](#introduction)
2. [General Transaction Model](#general-transaction-model)
3. [Issue Operation Transactions](#issue-operation-transactions)
4. [Search Operation Transactions](#search-operation-transactions)
5. [Board Operation Transactions](#board-operation-transactions)
6. [Error Handling Model](#error-handling-model)

## Introduction

The transaction models describe how different types of requests flow through the Jira Cloud MCP Server, from the initial request to the final response. These models help developers understand the processing path for each type of request and the components involved.

For detailed transaction model diagrams, see the generated Mermaid file in `docs/generated/class-diagram.md`.

## General Transaction Model

The general transaction model illustrates the common flow that applies to all request types:

1. The client sends a request to the MCP Server
2. The MCP Server validates the request format
3. The request is routed to the appropriate handler
4. The handler validates the request parameters
5. The handler calls the appropriate JiraClient method
6. The JiraClient makes a request to the Jira Cloud API
7. The Jira Cloud API returns a response
8. The JiraClient processes the response
9. The handler formats the response
10. The MCP Server returns the formatted response to the client

## Issue Operation Transactions

Issue operations include:

- `get_jira_issue`: Get basic information about a Jira issue
- `get_jira_issue_details`: Get comprehensive information about a Jira issue
- `get_jira_issue_attachments`: Get attachments for a Jira issue
- `update_jira_issue`: Update a Jira issue
- `add_jira_comment`: Add a comment to a Jira issue
- `get_jira_transitions`: Get available transitions for a Jira issue
- `transition_jira_issue`: Transition a Jira issue to a new status
- `create_jira_issue`: Create a new Jira issue

## Search Operation Transactions

Search operations include:

- `search_jira_issues`: Search for Jira issues using JQL
- `get_jira_filter_issues`: Get issues from a saved Jira filter
- `list_jira_filters`: List saved Jira filters

## Board Operation Transactions

Board operations include:

- `list_jira_boards`: List Jira boards
- `list_jira_sprints`: List sprints in a Jira board

## Error Handling Model

The error handling model illustrates how errors are handled at different stages of the request processing:

### Validation Errors

1. The client sends a request with invalid format
2. The MCP Server validates the request format
3. The MCP Server returns an error response to the client

### Parameter Validation Errors

1. The client sends a request with valid format but invalid parameters
2. The MCP Server routes the request to the appropriate handler
3. The handler validates the parameters
4. The handler returns an error to the MCP Server
5. The MCP Server returns an error response to the client

### Jira API Errors

1. The client sends a valid request
2. The MCP Server routes the request to the appropriate handler
3. The handler validates the parameters
4. The handler calls the appropriate JiraClient method
5. The JiraClient makes a request to the Jira Cloud API
6. The Jira Cloud API returns an error response
7. The JiraClient throws an McpError
8. The handler forwards the McpError to the MCP Server
9. The MCP Server returns an error response to the client


Last updated: 2025-03-07 at 11:17:45
