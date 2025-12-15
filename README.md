# Jira Cloud MCP Server

A Model Context Protocol server for interacting with Jira Cloud instances.

## Quick Start

### Installation

```bash
git clone https://github.com/aaronsb/jira-cloud.git
cd jira-cloud
npm install
npm run build
```

To use this MCP server, add the server configuration to your MCP settings:

```json
{
  "mcpServers": {
    "jira-cloud": {
      "command": "node",
      "args": ["/path/to/jira-cloud/build/index.js"],
      "env": {
        "JIRA_API_TOKEN": "your-api-token",
        "JIRA_EMAIL": "your-email",
        "JIRA_HOST": "your-team.atlassian.net"
      }
    }
  }
}
```

For detailed installation instructions, see the [Getting Started Guide](./docs/getting-started.md).

## Key Features

- **Issue Management**: Create, retrieve, update, and comment on Jira issues
- **Search Capabilities**: JQL search with filtering
- **Project & Board Management**: List and manage projects, boards, and sprints
- **MCP Resources**: Access Jira data as context through MCP resources
- **Tool Documentation**: Comprehensive documentation for each tool available as MCP resources
- **Customization**: Support for custom fields and workflows

## Architecture

The server is built with a modular architecture:

```
src/
├── client/       # Core Jira API client
├── handlers/     # MCP tool handlers
├── schemas/      # JSON schemas for tools
├── types/        # TypeScript definitions
├── utils/        # Utility functions
└── index.ts      # Server entry point
```

## Documentation

Essential documentation is available in the `docs/` directory:

- [Getting Started](./docs/getting-started.md) - Setup and installation
- [API Reference](./docs/api-reference.md) - Available tools and usage
- [Resources](./docs/resources.md) - Available MCP resources
- [Troubleshooting](./docs/troubleshooting.md) - Common issues and solutions
- [Development](./docs/development.md) - Development guide

## License

[MIT License](LICENSE)
