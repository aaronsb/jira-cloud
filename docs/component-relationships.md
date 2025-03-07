# MCP Component Relationships

This document provides comprehensive diagrams that illustrate the relationships between the different components of the Jira Cloud MCP Server. These diagrams help visualize how the components interact and how to extend the server with new functionality.

## Table of Contents

1. [Introduction](#introduction)
2. [Component Overview](#component-overview)
3. [Request Flow Diagram](#request-flow-diagram)
4. [Component Interaction Diagram](#component-interaction-diagram)
5. [Extension Points Diagram](#extension-points-diagram)
6. [Tool Registration Diagram](#tool-registration-diagram)

## Introduction

Understanding the relationships between components is essential for extending the Jira Cloud MCP Server. This document provides visual representations of these relationships to complement the written documentation.

## Component Overview

This diagram provides an overview of the main components of the Jira Cloud MCP Server:

```mermaid
classDiagram
    class Server {
        -jiraClient: JiraClient
        +setRequestHandler()
        +connect()
        +handleRequest()
    }
    
    class JiraClient {
        -host: string
        -email: string
        -apiToken: string
        +makeRequest()
        +processResponse()
        +getIssue()
        +searchIssues()
        +getBoards()
        +getProjects()
    }
    
    class IssueHandlers {
        +handleGetJiraIssue()
        +handleGetJiraIssueDetails()
        +handleUpdateJiraIssue()
        +handleAddJiraComment()
    }
    
    class SearchHandlers {
        +handleSearchJiraIssues()
        +handleGetJiraFilterIssues()
        +handleListJiraFilters()
    }
    
    class BoardHandlers {
        +handleListJiraBoards()
        +handleListJiraSprints()
    }
    
    class ProjectHandlers {
        +handleListJiraProjects()
    }
    
    class ToolSchemas {
        +GetJiraIssueSchema
        +SearchJiraIssuesSchema
        +ListJiraBoardsSchema
        +ListJiraProjectsSchema
    }
    
    class RequestSchemas {
        +ListToolsRequestSchema
        +CallToolRequestSchema
    }
    
    Server --> JiraClient : creates
    Server --> IssueHandlers : routes to
    Server --> SearchHandlers : routes to
    Server --> BoardHandlers : routes to
    Server --> ProjectHandlers : routes to
    Server --> ToolSchemas : registers
    Server --> RequestSchemas : validates
    IssueHandlers --> JiraClient : uses
    SearchHandlers --> JiraClient : uses
    BoardHandlers --> JiraClient : uses
    ProjectHandlers --> JiraClient : uses
```

## Request Flow Diagram

This diagram illustrates the flow of a request through the MCP server:

```mermaid
sequenceDiagram
    participant Client as MCP Client
    participant Server as MCP Server
    participant Schema as Schema Validation
    participant Handler as Tool Handler
    participant JiraClient as Jira Client
    participant JiraAPI as Jira Cloud API
    
    Client->>Server: Call Tool Request
    Server->>Schema: Validate Request Format
    Schema-->>Server: Validation Result
    alt Valid Request
        Server->>Handler: Route to Handler
        Handler->>Handler: Validate Parameters
        alt Valid Parameters
            Handler->>JiraClient: Call Jira Client Method
            JiraClient->>JiraAPI: Make API Request
            JiraAPI-->>JiraClient: Return API Response
            JiraClient-->>Handler: Return Processed Response
            Handler-->>Server: Return Formatted Response
            Server-->>Client: Return Success Response
        else Invalid Parameters
            Handler-->>Server: Throw Parameter Error
            Server-->>Client: Return Error Response
        end
    else Invalid Request
        Server-->>Client: Return Format Error
    end
```

## Component Interaction Diagram

This diagram illustrates how the different components interact during a request:

```mermaid
flowchart TD
    A[MCP Client] --> B[MCP Server]
    B --> C{Request Type}
    C -- List Tools --> D[List Tools Handler]
    C -- Call Tool --> E{Tool Name}
    E -- get_jira_issue --> F[Issue Handlers]
    E -- search_jira_issues --> G[Search Handlers]
    E -- list_jira_boards --> H[Board Handlers]
    E -- list_jira_projects --> I[Project Handlers]
    F --> J[Jira Client]
    G --> J
    H --> J
    I --> J
    J --> K[Jira Cloud API]
    
    classDef client fill:#f9f,stroke:#333,stroke-width:2px
    classDef server fill:#bbf,stroke:#333,stroke-width:2px
    classDef router fill:#bfb,stroke:#333,stroke-width:2px
    classDef handler fill:#fbb,stroke:#333,stroke-width:2px
    classDef jiraClient fill:#bff,stroke:#333,stroke-width:2px
    classDef jiraAPI fill:#ffb,stroke:#333,stroke-width:2px
    
    A:::client
    B:::server
    C:::router
    D:::server
    E:::router
    F:::handler
    G:::handler
    H:::handler
    I:::handler
    J:::jiraClient
    K:::jiraAPI
```

## Extension Points Diagram

This diagram illustrates the extension points for adding new functionality to the MCP server:

```mermaid
flowchart TD
    A[Extension Points] --> B[Tool Schemas]
    A --> C[Request Handlers]
    A --> D[Jira Client Methods]
    A --> E[Tool Registration]
    
    B --> F[src/schemas/tool-schemas.ts]
    C --> G[src/handlers/]
    D --> H[src/client/jira-client.ts]
    E --> I[src/index.ts]
    
    F --> J[Define new tool schema]
    G --> K[Implement new handler]
    H --> L[Add new client method]
    I --> M[Register new tool]
    
    classDef extension fill:#f9f,stroke:#333,stroke-width:2px
    classDef file fill:#bbf,stroke:#333,stroke-width:2px
    classDef implementation fill:#bfb,stroke:#333,stroke-width:2px
    
    A:::extension
    B:::extension
    C:::extension
    D:::extension
    E:::extension
    F:::file
    G:::file
    H:::file
    I:::file
    J:::implementation
    K:::implementation
    L:::implementation
    M:::implementation
```

## Tool Registration Diagram

This diagram illustrates how tools are registered with the MCP server:

```mermaid
sequenceDiagram
    participant Server as MCP Server
    participant Schema as Tool Schema
    participant Handler as Tool Handler
    participant Client as Jira Client
    
    Note over Server: Server Initialization
    Server->>Server: Create Jira Client
    Server->>Schema: Register Tool Schemas
    Note over Server: Tool Registration
    Server->>Server: Set List Tools Handler
    Server->>Server: Set Call Tool Handler
    Note over Server: Request Handling
    Server->>Server: Receive Request
    Server->>Server: Validate Request
    Server->>Handler: Route to Handler
    Handler->>Client: Call Jira Client
    Client-->>Handler: Return Response
    Handler-->>Server: Return Formatted Response
```

## Adding a New Tool

This diagram illustrates the process of adding a new tool to the MCP server:

```mermaid
flowchart TD
    A[Start] --> B[Define Tool Schema]
    B --> C[Implement Handler]
    C --> D[Add Jira Client Method]
    D --> E[Register Tool]
    E --> F[Test Tool]
    F --> G[Document Tool]
    G --> H[End]
    
    classDef start fill:#f9f,stroke:#333,stroke-width:2px
    classDef schema fill:#bbf,stroke:#333,stroke-width:2px
    classDef handler fill:#bfb,stroke:#333,stroke-width:2px
    classDef client fill:#fbb,stroke:#333,stroke-width:2px
    classDef register fill:#bff,stroke:#333,stroke-width:2px
    classDef test fill:#ffb,stroke:#333,stroke-width:2px
    classDef document fill:#fbf,stroke:#333,stroke-width:2px
    classDef end fill:#f9f,stroke:#333,stroke-width:2px
    
    A:::start
    B:::schema
    C:::handler
    D:::client
    E:::register
    F:::test
    G:::document
    H:::end
```

Last updated: 2025-03-07 at 13:13:06
