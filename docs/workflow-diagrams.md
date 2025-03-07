# MCP Workflow Diagrams

This document provides visual workflow diagrams that illustrate the key processes in the Jira Cloud MCP Server, with a focus on how to extend the server with new tools.

## Table of Contents

1. [Introduction](#introduction)
2. [MCP Request Processing Workflow](#mcp-request-processing-workflow)
3. [Tool Development Workflow](#tool-development-workflow)
4. [Error Handling Workflow](#error-handling-workflow)
5. [Testing Workflow](#testing-workflow)

## Introduction

These workflow diagrams are designed to help developers understand the flow of data and control in the Jira Cloud MCP Server. They complement the written documentation by providing visual representations of key processes.

## MCP Request Processing Workflow

This diagram illustrates how a request flows through the MCP server:

```mermaid
sequenceDiagram
    participant Client as MCP Client
    participant Server as MCP Server
    participant Handler as Tool Handler
    participant JiraClient as Jira Client
    participant JiraAPI as Jira Cloud API
    
    Client->>Server: Call Tool Request
    Note over Server: Validate request format
    Server->>Handler: Route to appropriate handler
    Note over Handler: Extract and validate parameters
    Handler->>JiraClient: Call appropriate method
    JiraClient->>JiraAPI: Make API request
    JiraAPI-->>JiraClient: Return API response
    Note over JiraClient: Process API response
    JiraClient-->>Handler: Return processed data
    Note over Handler: Format response for MCP
    Handler-->>Server: Return formatted response
    Server-->>Client: Return tool response
```

## Tool Development Workflow

This diagram illustrates the process of developing a new tool for the MCP server:

```mermaid
flowchart TD
    A[Identify Tool Requirements] --> B[Define Tool Schema]
    B --> C[Create Request Schema]
    B --> D[Create Response Schema]
    C --> E[Implement Handler]
    D --> E
    E --> F[Add Jira Client Method]
    F --> G[Register Tool in Server]
    G --> H[Test Tool]
    H --> I[Document Tool]
    I --> J[Add to Features List]
    
    classDef planning fill:#f9f,stroke:#333,stroke-width:2px
    classDef schema fill:#bbf,stroke:#333,stroke-width:2px
    classDef implementation fill:#bfb,stroke:#333,stroke-width:2px
    classDef testing fill:#fbb,stroke:#333,stroke-width:2px
    classDef documentation fill:#bff,stroke:#333,stroke-width:2px
    
    A:::planning
    B:::planning
    C:::schema
    D:::schema
    E:::implementation
    F:::implementation
    G:::implementation
    H:::testing
    I:::documentation
    J:::documentation
```

## Error Handling Workflow

This diagram illustrates how errors are handled in the MCP server:

```mermaid
flowchart TD
    A[Client Request] --> B{Valid Request Format?}
    B -- Yes --> C[Route to Handler]
    B -- No --> D[Return Format Error]
    C --> E{Valid Parameters?}
    E -- Yes --> F[Call Jira Client]
    E -- No --> G[Return Parameter Error]
    F --> H{API Call Successful?}
    H -- Yes --> I[Process Response]
    H -- No --> J[Handle API Error]
    J --> K[Return Error Response]
    G --> K
    D --> K
    I --> L[Return Success Response]
    
    classDef request fill:#f9f,stroke:#333,stroke-width:2px
    classDef validation fill:#bbf,stroke:#333,stroke-width:2px
    classDef processing fill:#bfb,stroke:#333,stroke-width:2px
    classDef error fill:#fbb,stroke:#333,stroke-width:2px
    classDef response fill:#bff,stroke:#333,stroke-width:2px
    
    A:::request
    B:::validation
    C:::processing
    D:::error
    E:::validation
    F:::processing
    G:::error
    H:::validation
    I:::processing
    J:::error
    K:::response
    L:::response
```

## Testing Workflow

This diagram illustrates the testing workflow for the MCP server:

```mermaid
flowchart TD
    A[Write Unit Tests] --> B[Test Handler in Isolation]
    B --> C{Tests Pass?}
    C -- Yes --> D[Write Integration Tests]
    C -- No --> E[Fix Handler]
    E --> B
    D --> F[Test End-to-End Flow]
    F --> G{Tests Pass?}
    G -- Yes --> H[Document Test Cases]
    G -- No --> I[Fix Integration Issues]
    I --> F
    
    classDef unit fill:#f9f,stroke:#333,stroke-width:2px
    classDef integration fill:#bbf,stroke:#333,stroke-width:2px
    classDef decision fill:#bfb,stroke:#333,stroke-width:2px
    classDef fix fill:#fbb,stroke:#333,stroke-width:2px
    classDef documentation fill:#bff,stroke:#333,stroke-width:2px
    
    A:::unit
    B:::unit
    C:::decision
    D:::integration
    E:::fix
    F:::integration
    G:::decision
    H:::documentation
    I:::fix
```

## Tool Extension Pattern

This diagram illustrates the pattern for extending the MCP server with new tools:

```mermaid
classDiagram
    class Server {
        -jiraClient: JiraClient
        +setRequestHandler()
        +connect()
    }
    
    class ToolSchema {
        +name: string
        +description: string
        +inputSchema: object
    }
    
    class Handler {
        +handleRequest(request, jiraClient)
    }
    
    class JiraClient {
        +makeRequest()
        +processResponse()
    }
    
    Server --> ToolSchema : registers
    Server --> Handler : routes to
    Handler ..> JiraClient : uses
```

## MCP Tool Architecture

This diagram illustrates the layered architecture of the MCP server:

```mermaid
flowchart TD
    A[MCP Server Layer] --> B[Handler Layer]
    B --> C[Jira Client Layer]
    C --> D[Jira Cloud API]
    
    classDef server fill:#f9f,stroke:#333,stroke-width:2px
    classDef handler fill:#bbf,stroke:#333,stroke-width:2px
    classDef client fill:#bfb,stroke:#333,stroke-width:2px
    classDef api fill:#fbb,stroke:#333,stroke-width:2px
    
    A:::server
    B:::handler
    C:::client
    D:::api
```

Last updated: 2025-03-07 at 13:12:19
