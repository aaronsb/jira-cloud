# Jira Cloud MCP Server Class Structure

This document provides detailed diagrams and descriptions of the class structure of the Jira Cloud MCP Server.

> **Note**: The class diagrams for this project are automatically generated from the TypeScript source code using TsUML2. To update these diagrams, run `./scripts/build-diagrams.sh`.

## Table of Contents

1. [Introduction](#introduction)
2. [Core Classes](#core-classes)
3. [Handler Classes](#handler-classes)
4. [Model Classes](#model-classes)
5. [Utility Classes](#utility-classes)

## Introduction

The Jira Cloud MCP Server is built using a modular architecture with clearly defined classes and responsibilities. This document provides a detailed overview of these classes and their relationships.

## Core Classes

The core classes form the foundation of the Jira Cloud MCP Server. These classes handle server initialization, request processing, and communication with the Jira API.

For detailed class diagrams, see the generated SVG file in `docs/generated/class-diagram.svg`.

### Core Class Responsibilities

1. **JiraServer**:
   - Initializes the MCP server with the appropriate configuration
   - Creates and configures the JiraClient
   - Sets up request handlers for all supported operations
   - Manages the server lifecycle (startup, shutdown)

2. **Server** (from MCP SDK):
   - Handles the Model Context Protocol communication
   - Registers tools and resources
   - Routes requests to the appropriate handlers
   - Manages connections to transports

3. **JiraClient**:
   - Encapsulates all interaction with the Jira Cloud API
   - Handles authentication and credentials
   - Provides methods for all supported Jira operations
   - Processes API responses into appropriate formats

## Handler Classes

The handler classes are responsible for processing specific types of requests. Each handler class specializes in a particular domain of Jira functionality.

### Handler Class Responsibilities

1. **IssueHandlers**:
   - Validates parameters for issue-related requests
   - Processes requests for getting issue details
   - Handles issue updates, comments, and transitions
   - Returns formatted responses for issue operations

2. **SearchHandlers**:
   - Validates parameters for search-related requests
   - Processes JQL search queries
   - Handles filter-based searches
   - Returns formatted search results

3. **BoardHandlers**:
   - Processes requests for listing boards
   - Handles sprint-related operations
   - Returns formatted board and sprint data

4. **ProjectHandlers**:
   - Processes requests for listing projects
   - Returns formatted project data

## Model Classes

The model classes represent the data structures used by the Jira Cloud MCP Server. These classes define the shape of the data that flows through the system.

### Model Class Descriptions

1. **JiraConfig**: Configuration for connecting to the Jira Cloud API, including host, credentials, and custom field mappings.
2. **JiraIssueDetails**: Comprehensive details of a Jira issue, including metadata, fields, and relationships.
3. **JiraAttachment**: Represents an attachment on a Jira issue, with file metadata and download URL.
4. **SearchPagination**: Pagination information for search results, including total count and navigation data.
5. **SearchResponse**: Response containing search results and pagination info for JQL queries.
6. **FilterResponse**: Details of a saved Jira filter, including sharing permissions and JQL.
7. **TransitionDetails**: Information about a workflow transition, including target status.
8. **BoardResponse**: Details of a Jira board, including type and project association.
9. **SprintResponse**: Information about a sprint in a board, including timeline and goals.

## Utility Classes

The utility classes provide helper functionality used throughout the Jira Cloud MCP Server.

### Utility Class Responsibilities

1. **TextProcessor**:
   - Converts Markdown to Atlassian Document Format (ADF)
   - Extracts plain text from ADF nodes
   - Validates field values
   - Formats field values for display

2. **ErrorHandler**:
   - Converts different types of errors to McpError
   - Ensures consistent error reporting
