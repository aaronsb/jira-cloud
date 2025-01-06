# Jira Cloud MCP Server

A Model Context Protocol server for interacting with Jira Cloud instances.

This TypeScript-based MCP server provides a robust interface to Jira Cloud, enabling seamless integration with Jira's issue tracking and project management capabilities through the MCP protocol.

## Architecture

The server is built with a modular architecture that separates concerns and promotes maintainability:

```
src/
├── client/
│   └── jira-client.ts     # Core Jira API client implementation
├── handlers/
│   ├── issue-handlers.ts  # MCP tool handlers for issue operations
│   └── search-handlers.ts # MCP tool handlers for search operations
├── schemas/
│   ├── tool-schemas.ts    # JSON schemas defining tool interfaces
│   └── request-schemas.ts # Request validation schemas
├── types/
│   └── index.ts          # TypeScript type definitions
├── utils/
│   └── text-processing.ts # Utility functions
└── index.ts              # Server entry point and configuration
```

### Key Components

- **JiraClient**: A TypeScript class that encapsulates all Jira API interactions, providing type-safe methods for each API operation.
- **Handlers**: Bridge between MCP tools and the JiraClient, handling request validation and response formatting.
- **Schemas**: JSON Schema definitions for each tool's input parameters, enabling strict validation and clear documentation.
- **Types**: TypeScript interfaces and types ensuring type safety across the codebase.
- **Utils**: Shared utility functions for common operations.

## Features

### Tools

The server provides several powerful tools for Jira interaction:

- `get_issue` - Retrieve detailed information about a Jira issue
  - Parameters:
    - `issueKey` (required): The Jira issue key (e.g., "PROJ-123")
    - `includeComments` (optional): Boolean to include issue comments
  - Returns comprehensive issue data including summary, description, assignee, status, and more

- `search_issues` - Search for issues using JQL (Jira Query Language)
  - Parameters:
    - `jql` (required): JQL query string
    - `startAt` (optional): Pagination start index
    - `maxResults` (optional): Maximum results to return (default: 25, max: 100)
  - Returns paginated search results with issue details

- `update_issue` - Update issue fields
  - Parameters:
    - `issueKey` (required): The Jira issue key
    - `summary` (optional): New issue summary
    - `description` (optional): New issue description
  - Updates the specified fields of the issue

- `add_comment` - Add a comment to an issue
  - Parameters:
    - `issueKey` (required): The Jira issue key
    - `body` (required): The comment text
  - Adds the comment to the specified issue

- `get_transitions` - Get available status transitions for an issue
  - Parameters:
    - `issueKey` (required): The Jira issue key
  - Returns list of available status transitions

- `get_populated_fields` - Get all populated fields for an issue
  - Parameters:
    - `issueKey` (required): The Jira issue key
  - Returns all non-empty fields and their values

- `get_filter_issues` - Get issues from a saved Jira filter
  - Parameters:
    - `filterId` (required): The ID of the saved filter
  - Returns issues matching the filter criteria

- `list_my_filters` - List all Jira filters owned by the authenticated user
  - Parameters:
    - `expand` (optional): Boolean to include additional filter details like description and JQL
  - Returns list of filters with basic info (ID, name, owner, favorite status) and optionally expanded details

- `transition_issue` - Transition a Jira issue to a new status
  - Parameters:
    - `issueKey` (required): The Jira issue key
    - `transitionId` (required): The ID of the transition to perform
    - `comment` (optional): Comment to add with the transition
  - Transitions the issue to a new status and optionally adds a comment

## Extending the Server

To add new capabilities to the server:

1. **Add Types**: Define new interfaces in `src/types/index.ts`
2. **Define Schema**: Add tool schema in `src/schemas/tool-schemas.ts`
3. **Implement Client Method**: Add new method to `JiraClient` in `src/client/jira-client.ts`
4. **Create Handler**: Add handler function in appropriate handler file or create new one
5. **Register Tool**: Connect handler in `src/index.ts`

## Development

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

## Installation

To use this MCP server, add the server configuration to your MCP settings:

For VSCode:
```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["/path/to/jira-cloud/build/index.js"],
      "env": {
        "JIRA_API_TOKEN": "your-api-token",
        "JIRA_EMAIL": "your-email",
        "JIRA_HOST": "your-instance.atlassian.net"
      }
    }
  }
}
```

### Environment Variables

The server requires the following environment variables:

- `JIRA_API_TOKEN`: Your Jira API token
- `JIRA_EMAIL`: The email associated with your Jira account
- `JIRA_HOST`: Your Jira instance hostname (e.g., "your-instance.atlassian.net")

### Security Note

Never commit your Jira credentials to version control. Use environment variables or a secure configuration management system to handle sensitive credentials.

## Error Handling

The server implements robust error handling for common scenarios:
- Invalid credentials
- Network connectivity issues
- Rate limiting
- Invalid issue keys or JQL queries
- Permission errors

Each error response includes detailed information to help diagnose and resolve the issue.

### API Behavior Notes

The server interacts with Jira's REST API which has some important behavioral characteristics:
- Updates may not be immediately visible due to Jira's eventual consistency model
- Successful operations (like updating fields or adding comments) will return success responses immediately
- The actual changes may take a few moments to be reflected in subsequent API calls
- Rate limiting may affect the speed of consecutive operations

These behaviors are normal and don't indicate errors as long as success responses are received from the API.
