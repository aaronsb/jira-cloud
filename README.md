# Jira Cloud MCP Server

A Model Context Protocol server for interacting with Jira Cloud instances.

This TypeScript-based MCP server provides a robust interface to Jira Cloud, enabling seamless integration with Jira's issue tracking and project management capabilities through the MCP protocol.

## Documentation

The project maintains comprehensive documentation in the `cline_docs/` directory:

- `productContext.md`: Project purpose, problems solved, and expected behavior
- `activeContext.md`: Current work status and recent changes
- `systemPatterns.md`: Architecture patterns and technical decisions
- `techContext.md`: Technology stack and development setup
- `progress.md`: Feature completion status and roadmap

## Architecture

The server is built with a modular architecture that separates concerns and promotes maintainability:

```
src/
├── client/
│   └── jira-client.ts     # Core Jira API client implementation
├── handlers/
│   ├── issue-handlers.ts    # MCP tool handlers for issue operations
│   ├── project-handlers.ts  # MCP tool handlers for project operations
│   └── search-handlers.ts   # MCP tool handlers for search operations
├── schemas/
│   ├── tool-schemas.ts    # JSON schemas defining tool interfaces
│   └── request-schemas.ts # Request validation schemas
├── types/
│   └── index.ts          # TypeScript type definitions
├── utils/
│   └── text-processing.ts # Utility functions
└── index.ts              # Server entry point and configuration
```

### Visualizing the Architecture

We use [typescript-graph](https://github.com/ysk8hori/typescript-graph) to generate visual diagrams of the codebase structure and dependencies. These diagrams help developers understand the relationships between different components of the system.

To generate or update the diagrams:

```bash
# Using npm script
npm run generate-diagrams

# Or directly
./scripts/build-diagrams.sh
```

The generated diagrams are saved to:
- `docs/generated/class-diagram.md` - Contains the Mermaid diagram source
- `docs/class-structure.md` - Includes the embedded diagram with explanations

The diagrams show file dependencies and relationships, making it easier to understand the codebase structure and identify potential refactoring opportunities.

### Key Components

- **JiraClient**: A TypeScript class that encapsulates all Jira API interactions, providing type-safe methods for each API operation.
- **Handlers**: Bridge between MCP tools and the JiraClient, handling request validation and response formatting.
- **Schemas**: JSON Schema definitions for each tool's input parameters, enabling strict validation and clear documentation.
- **Types**: TypeScript interfaces and types ensuring type safety across the codebase.
- **Utils**: Shared utility functions for common operations.

## Features

### Tools

The server provides several powerful tools for Jira interaction, following a consistent [verb]_jira_[noun] naming pattern:

1. Board and Project Management
   - `list_jira_boards` - Get all boards
     * Parameters: None
     * Returns list of all boards with their IDs, names, and types

   - `list_jira_sprints` - Get sprints for a board
     * Parameters:
       - `boardId` (required): The ID of the board
     * Returns list of sprints with details

   - `list_jira_projects` - Get all projects
     * Parameters: None
     * Returns list of projects with their IDs, keys, names, descriptions, leads, and URLs

   - `list_jira_filters` - List saved filters
     * Parameters:
       - `expand` (optional): Include additional filter details
     * Returns list of filters with basic info and optionally expanded details

2. Issue Operations
   - `create_jira_issue` - Create a new issue
     * Parameters:
       - `projectKey` (required): Project key (e.g., PROJ)
       - `summary` (required): Issue summary/title
       - `issueType` (required): Type of issue (e.g., Story, Bug, Task)
       - `description` (optional): Detailed description
       - `priority` (optional): Issue priority
       - `assignee` (optional): Username of assignee
       - `labels` (optional): Array of labels
       - `customFields` (optional): Custom field values

   - `get_jira_issue` - Get basic issue info
     * Parameters:
       - `issueKey` (required): The Jira issue key (e.g., "PROJ-123")
     * Returns basic issue data

   - `get_jira_issue_details` - Get comprehensive issue info
     * Parameters:
       - `issueKey` (required): The Jira issue key
     * Returns detailed issue data including comments

   - `get_jira_issue_attachments` - Get issue attachments
     * Parameters:
       - `issueKey` (required): The Jira issue key
     * Returns list of attachments with metadata and URLs

   - `update_jira_issue` - Update issue fields
     * Parameters:
       - `issueKey` (required): The Jira issue key
       - `summary` (optional): New summary
       - `description` (optional): New description
       - `parent` (optional): Parent issue key or null

3. Issue Transitions and Comments
   - `get_jira_transitions` - Get available transitions
     * Parameters:
       - `issueKey` (required): The Jira issue key
     * Returns list of available status transitions

   - `transition_jira_issue` - Change issue status
     * Parameters:
       - `issueKey` (required): The Jira issue key
       - `transitionId` (required): The transition ID
       - `comment` (optional): Transition comment

   - `add_jira_comment` - Add a comment
     * Parameters:
       - `issueKey` (required): The Jira issue key
       - `body` (required): The comment text

4. Search and Filtering
   - `search_jira_issues` - Search using JQL
     * Parameters:
       - `jql` (required): JQL query string
       - `startAt` (optional): Pagination start (default: 0)
       - `maxResults` (optional): Results per page (default: 25, max: 100)
     * Supports advanced JQL patterns:
       - Portfolio/Plans: `issue in portfolioChildIssuesOf("PROJ-123")`
       - Assignments: `assignee = currentUser()` or `assignee IS EMPTY`
       - Recent changes: `status CHANGED AFTER -1w`
       - Multiple values: `status IN ("In Progress", "Review")`
       - Team filters: `assignee IN MEMBERSOF("developers")`
       - Complex logic: Supports AND, OR, NOT operators

   - `get_jira_filter_issues` - Get filter results
     * Parameters:
       - `filterId` (required): The saved filter ID
     * Returns issues matching filter criteria

   - `get_jira_fields` - Get populated fields
     * Parameters:
       - `issueKey` (required): The Jira issue key
     * Returns all non-empty fields and values

## Extending the Server

To add new capabilities to the server:

1. **Add Types**: Define new interfaces in `src/types/index.ts`
2. **Define Schema**: Add tool schema in `src/schemas/tool-schemas.ts`
3. **Implement Client Method**: Add new method to `JiraClient` in `src/client/jira-client.ts`
4. **Create Handler**: Add handler function in appropriate handler file or create new one
5. **Register Tool**: Connect handler in `src/index.ts`

## Development

### Local Development

This project requires Node.js 20 or higher.

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

Run linting:
```bash
npm run lint
```

Run tests:
```bash
npm test
```

For development with auto-rebuild:
```bash
npm run watch
```

### Development Workflow

We follow a test-driven development approach with these key components:

1. **Linting**: ESLint with TypeScript support ensures code quality and consistency
   - Run `npm run lint` to check for issues
   - Run `npm run lint:fix` to automatically fix many common issues
   - The linting configuration is designed to be pragmatic, allowing certain patterns (like non-null assertions and any types) where appropriate

2. **Testing**: Jest with TypeScript support for unit testing
   - Run `npm test` to execute all tests
   - Run `npm run test:watch` for continuous testing during development
   - Tests are located in `__tests__` directories alongside the code they test

3. **Local Build**: The `build-local.sh` script provides a comprehensive local build pipeline
   - Installs dependencies
   - Runs linting
   - Executes tests
   - Builds TypeScript
   - Creates a Docker image

### Docker Build

We provide a dual path build approach for both local development and CI/CD:

#### Local Docker Build

Use the provided scripts to build and run the Docker container locally:

```bash
# Build the Docker image
./scripts/build-local.sh

# Run the Docker container
JIRA_API_TOKEN=your_token JIRA_EMAIL=your_email ./scripts/run-local.sh
```

The `build-local.sh` script provides a lightweight local development build pipeline that mirrors our CI approach but optimized for speed and local iteration. It performs all build steps from installing dependencies through Docker image creation.

#### CI/CD

For CI/CD, we use GitHub Actions to build and publish the Docker image to GitHub Container Registry. The workflow is defined in `.github/workflows/ci-cd.yml`.

Our approach focuses on Continuous Delivery rather than full CI/CD, as we're not running actual tests against the Atlassian API. See `docs/ci-cd-plan.md` for more details on our CI/CD strategy and future plans.

#### Docker Image Tags

We use a consistent tagging strategy for Docker images:

- **jira-cloud:local**: Local development build (not pushed to registry)
- **ghcr.io/aaronsb/jira-cloud:latest**: Most recent stable build from main branch
- **ghcr.io/aaronsb/jira-cloud:main**: Same as latest
- **ghcr.io/aaronsb/jira-cloud:sha-[commit-hash]**: Specific commit version
- **ghcr.io/aaronsb/jira-cloud:v[version]**: Specific semantic version release

For most users, the `:latest` tag is recommended for production use.

## Installation

To use this MCP server, add the server configuration to your MCP settings. The configuration varies slightly based on your operating system and editor:

### VSCode

For VSCode, the configuration goes in:
- Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
- macOS: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Linux: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

Example configurations:

#### Using Local Build
```json
{
  "mcpServers": {
    "jira-cloud": {
      "command": "node",
      "args": ["${userHome}/path/to/jira-cloud/build/index.js"],
      "env": {
        "JIRA_API_TOKEN": "your-api-token",
        "JIRA_EMAIL": "your-email",
        "JIRA_HOST": "your-team.atlassian.net"
      }
    }
  }
}
```

#### Using Docker Container (Recommended)
```json
{
  "mcpServers": {
    "jira-cloud": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e", "JIRA_EMAIL",
        "-e", "JIRA_HOST",
        "-e", "JIRA_API_TOKEN",
        "ghcr.io/aaronsb/jira-cloud:latest"
      ],
      "env": {
        "JIRA_API_TOKEN": "your-api-token",
        "JIRA_EMAIL": "your-email",
        "JIRA_HOST": "your-team.atlassian.net"
      }
    }
  }
}
```

#### Multiple Jira Instances
```json
{
  "mcpServers": {
    "team1-jira": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e", "JIRA_EMAIL",
        "-e", "JIRA_HOST",
        "-e", "JIRA_API_TOKEN",
        "ghcr.io/aaronsb/jira-cloud:latest"
      ],
      "env": {
        "JIRA_API_TOKEN": "your-api-token",
        "JIRA_EMAIL": "your-email",
        "JIRA_HOST": "team1.atlassian.net"
      }
    },
    "team2-jira": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e", "JIRA_EMAIL",
        "-e", "JIRA_HOST",
        "-e", "JIRA_API_TOKEN",
        "ghcr.io/aaronsb/jira-cloud:latest"
      ],
      "env": {
        "JIRA_API_TOKEN": "your-api-token",
        "JIRA_EMAIL": "your-email",
        "JIRA_HOST": "team2.atlassian.net"
      }
    }
  }
}
```

### Claude Desktop App

For the Claude desktop app, the configuration goes in:
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

The configuration format is the same as VSCode.

### Path Variables

The configuration supports the following path variables:
- `${userHome}`: Expands to the user's home directory
- `${workspaceFolder}`: (VSCode only) Expands to the opened workspace folder
- `${extensionPath}`: (VSCode only) Expands to the extension installation directory

Using these variables makes your configuration portable across different machines and operating systems.

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
