# Jira Cloud MCP Server

A Model Context Protocol server for interacting with Jira Cloud instances.

## Quick Start

Add to your MCP settings:

```json
{
  "mcpServers": {
    "jira-cloud": {
      "command": "npx",
      "args": ["-y", "@aaronsb/jira-cloud-mcp"],
      "env": {
        "JIRA_API_TOKEN": "your-api-token",
        "JIRA_EMAIL": "your-email",
        "JIRA_HOST": "https://your-team.atlassian.net"
      }
    }
  }
}
```

Or install globally:

```bash
npm install -g @aaronsb/jira-cloud-mcp
```

### Credentials

Generate an API token at [Atlassian Account Settings](https://id.atlassian.com/manage/api-tokens).

## Tools

| Tool | Description |
|------|-------------|
| `manage_jira_issue` | Get, create, update, transition, comment on, or link Jira issues |
| `manage_jira_filter` | Search for issues using JQL queries, or manage saved filters |
| `manage_jira_project` | List projects or get project details including status counts |
| `manage_jira_board` | List boards or get board details and configuration |
| `manage_jira_sprint` | Manage sprints: create, start, close, and assign issues to sprints |

Each tool accepts an `operation` parameter. Detailed documentation is available as MCP resources at `jira://tools/{tool_name}/documentation`.

## MCP Resources

| Resource | Description |
|----------|-------------|
| `jira://instance/summary` | Instance-level statistics |
| `jira://projects/{key}/overview` | Project overview with status counts |
| `jira://boards/{id}/overview` | Board overview with sprint info |
| `jira://issue-link-types` | Available issue link types |
| `jira://tools/{name}/documentation` | Tool documentation |

## License

[MIT License](LICENSE)
