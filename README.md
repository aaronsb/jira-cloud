# Jira Cloud MCP Server

A Model Context Protocol server for interacting with Jira Cloud instances.

This TypeScript-based MCP server provides a robust interface to Jira Cloud, enabling seamless integration with Jira's issue tracking and project management capabilities through the MCP protocol.

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
