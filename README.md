# Jira Cloud MCP Server

A Model Context Protocol server for interacting with Jira Cloud instances.

## Install

### Claude Desktop (one-click)

Download [`jira-cloud-mcp.mcpb`](https://github.com/aaronsb/jira-cloud/releases/latest) and open it — Claude Desktop will prompt for your Jira credentials.

### Claude Code

```bash
claude mcp add jira-cloud -e JIRA_API_TOKEN=your-token -e JIRA_EMAIL=your-email -e JIRA_HOST=https://your-team.atlassian.net -- npx -y @aaronsb/jira-cloud-mcp
```

### Manual (any MCP client)

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

### Credentials

Generate an API token at [Atlassian Account Settings](https://id.atlassian.com/manage/api-tokens).

## Tools

| Tool | Description |
|------|-------------|
| `manage_jira_issue` | Get, create, update, delete, move, transition, comment on, link, or traverse hierarchy of issues |
| `manage_jira_filter` | Search for issues using JQL queries, or manage saved filters |
| `manage_jira_project` | List projects or get project configuration and metadata |
| `manage_jira_board` | List boards or get board details and configuration |
| `manage_jira_sprint` | Manage sprints: create, start, close, and assign issues to sprints |
| `queue_jira_operations` | Batch multiple operations with result references (`$0.key`) and error strategies |
| `analyze_jira_issues` | Compute metrics, exact counts, and data cube analysis over issues selected by JQL |

Each tool accepts an `operation` parameter (except `queue_jira_operations` which takes an `operations` array, and `analyze_jira_issues` which takes `jql` + `metrics`). Per-tool documentation is available as MCP resources at `jira://tools/{tool_name}/documentation`.

See [docs/tools.md](docs/tools.md) for detailed tool descriptions, workspace patterns, and design principles.

## MCP Resources

| Resource | Description |
|----------|-------------|
| `jira://instance/summary` | Instance-level statistics |
| `jira://projects/distribution` | Project distribution overview |
| `jira://projects/{key}/overview` | Project overview with status counts |
| `jira://boards/{id}/overview` | Board overview with sprint info |
| `jira://issue-link-types` | Available issue link types |
| `jira://custom-fields` | Custom field catalog (auto-discovered at startup) |
| `jira://custom-fields/{project}/{issueType}` | Context-specific custom fields |
| `jira://analysis/recipes` | Analysis query patterns and compute DSL reference |
| `jira://tools/{name}/documentation` | Per-tool documentation |

## License

[MIT License](LICENSE)
