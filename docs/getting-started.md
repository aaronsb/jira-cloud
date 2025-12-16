# Getting Started

## Prerequisites
- Node.js 20 or higher
- npm 8 or higher

## Installation

### Using npx (Recommended)

No installation required - just add to your MCP settings:

```json
{
  "mcpServers": {
    "@aaronsb/jira-cloud-mcp": {
      "command": "npx",
      "args": ["-y", "@aaronsb/jira-cloud-mcp"],
      "env": {
        "JIRA_API_TOKEN": "your-api-token",
        "JIRA_EMAIL": "your-email",
        "JIRA_HOST": "https://your-instance.atlassian.net"
      }
    }
  }
}
```

### Global Installation

```bash
npm install -g @aaronsb/jira-cloud-mcp
```

Then in MCP settings:

```json
{
  "mcpServers": {
    "@aaronsb/jira-cloud-mcp": {
      "command": "jira-cloud-mcp",
      "env": {
        "JIRA_API_TOKEN": "your-api-token",
        "JIRA_EMAIL": "your-email",
        "JIRA_HOST": "https://your-instance.atlassian.net"
      }
    }
  }
}
```

### From Source

```bash
git clone https://github.com/aaronsb/jira-cloud.git
cd jira-cloud
npm install
npm run build
```

## Configuration

### Required Environment Variables

```bash
JIRA_API_TOKEN=your-api-token
JIRA_EMAIL=your-email
JIRA_HOST=https://your-instance.atlassian.net
```

### Getting Jira Credentials

1. Generate an API Token:
   - Go to [Atlassian Account Settings](https://id.atlassian.com/manage/api-tokens)
   - Click "Create API token"
   - Name your token and copy it securely

2. Use your Atlassian account email and Jira host URL (must include `https://`, e.g., `https://your-instance.atlassian.net`)

## Examples

### Basic MCP Usage

```typescript
// List Projects
await use_mcp_tool({
  server_name: "@aaronsb/jira-cloud-mcp",
  tool_name: "list_projects",
  arguments: {}
});

// Create Issue
await use_mcp_tool({
  server_name: "@aaronsb/jira-cloud-mcp",
  tool_name: "create_issue",
  arguments: {
    projectKey: "PROJ",
    summary: "Example Issue",
    description: "This is a test issue",
    issueType: "Task"
  }
});

// Search Issues
await use_mcp_tool({
  server_name: "@aaronsb/jira-cloud-mcp",
  tool_name: "search_issues",
  arguments: {
    jql: "project = PROJ AND status = 'In Progress'"
  }
});
```

## Common Issues

- **Authentication Errors**: Verify API token, email, and host URL
- **Permission Issues**: Check Jira permissions for your account
- **Rate Limiting**: Add delays between requests if needed

For more troubleshooting help, see the [Troubleshooting Guide](./troubleshooting.md).
