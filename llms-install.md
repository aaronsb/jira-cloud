# LLM Installation Guide for Jira Cloud MCP Server

Installation and configuration guide for `@aaronsb/jira-cloud-mcp`.

## Installation

Add to MCP settings (no install required — uses npx):

```json
{
  "mcpServers": {
    "jira-cloud": {
      "command": "npx",
      "args": ["-y", "@aaronsb/jira-cloud-mcp"],
      "env": {
        "JIRA_API_TOKEN": "<user-jira-api-token>",
        "JIRA_EMAIL": "<user-jira-email>",
        "JIRA_HOST": "https://<instance>.atlassian.net"
      }
    }
  }
}
```

## Required Environment Variables

| Variable | Description | How to get it |
|----------|-------------|---------------|
| `JIRA_API_TOKEN` | Jira API token | https://id.atlassian.com/manage/api-tokens |
| `JIRA_EMAIL` | Atlassian account email | Your login email |
| `JIRA_HOST` | Jira instance URL | `https://your-instance.atlassian.net` (include `https://`) |

## Tools

The server exposes 5 tools, each with an `operation` parameter:

| Tool | Operations |
|------|-----------|
| `manage_jira_issue` | `get`, `create`, `update`, `transition`, `comment`, `link` |
| `manage_jira_filter` | `get`, `list`, `create`, `update`, `delete`, `execute_jql`, `execute_filter` |
| `manage_jira_project` | `get`, `list` |
| `manage_jira_board` | `get`, `list`, `get_configuration` |
| `manage_jira_sprint` | `get`, `list`, `create`, `update`, `delete`, `manage_issues` |

Each tool also has MCP resource documentation at `jira://tools/{tool_name}/documentation`.

## Multiple Instances

```json
{
  "mcpServers": {
    "jira-prod": {
      "command": "npx",
      "args": ["-y", "@aaronsb/jira-cloud-mcp"],
      "env": {
        "JIRA_API_TOKEN": "<token-1>",
        "JIRA_EMAIL": "<email-1>",
        "JIRA_HOST": "https://prod.atlassian.net"
      }
    },
    "jira-dev": {
      "command": "npx",
      "args": ["-y", "@aaronsb/jira-cloud-mcp"],
      "env": {
        "JIRA_API_TOKEN": "<token-2>",
        "JIRA_EMAIL": "<email-2>",
        "JIRA_HOST": "https://dev.atlassian.net"
      }
    }
  }
}
```

## Verification

After setup, try: `manage_jira_project` with `operation: "list"` to confirm connectivity.
