# LLM Installation Guide for Jira Cloud MCP Server

This guide is specifically designed for Large Language Models (LLMs) like Cline to help with automated installation and configuration of the Jira Cloud MCP server.

## Quick Installation

### Recommended Installation Method

The recommended way to install this MCP server is using the Docker container from GitHub Container Registry:

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
        "JIRA_API_TOKEN": "<user-jira-api-token>",
        "JIRA_EMAIL": "<user-jira-email>",
        "JIRA_HOST": "<user-jira-host>"
      },
      "autoApprove": [],
      "disabled": false
    }
  }
}
```

### Required Environment Variables

This MCP server requires the following environment variables:

1. `JIRA_API_TOKEN`: The user's Jira API token
   - Can be generated at https://id.atlassian.com/manage/api-tokens
   - Ask the user: "Please provide your Jira API token. You can generate one at https://id.atlassian.com/manage/api-tokens"

2. `JIRA_EMAIL`: The email associated with the user's Jira account
   - Ask the user: "Please provide the email address associated with your Jira account"

3. `JIRA_HOST`: The Jira instance hostname
   - Format: "your-instance.atlassian.net" (without https://)
   - Ask the user: "Please provide your Jira instance hostname (e.g., 'your-instance.atlassian.net' without the 'https://' prefix)"

## Docker Image Tags

The following Docker image tags are available:

- `ghcr.io/aaronsb/jira-cloud:latest`: Most recent stable build from main branch (recommended)
- `ghcr.io/aaronsb/jira-cloud:main`: Same as latest
- `ghcr.io/aaronsb/jira-cloud:sha-[commit-hash]`: Specific commit version
- `ghcr.io/aaronsb/jira-cloud:v[version]`: Specific semantic version release

For most users, the `:latest` tag is recommended.

## Configuration Locations

The MCP settings file location depends on the user's environment:

### VSCode
- Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
- macOS: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Linux: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

### Claude Desktop App
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

## Multiple Jira Instances

If the user needs to connect to multiple Jira instances, use a configuration like this:

```json
{
  "mcpServers": {
    "jira-instance1": {
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
        "JIRA_API_TOKEN": "<user-jira-api-token-1>",
        "JIRA_EMAIL": "<user-jira-email-1>",
        "JIRA_HOST": "<user-jira-host-1>"
      },
      "autoApprove": [],
      "disabled": false
    },
    "jira-instance2": {
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
        "JIRA_API_TOKEN": "<user-jira-api-token-2>",
        "JIRA_EMAIL": "<user-jira-email-2>",
        "JIRA_HOST": "<user-jira-host-2>"
      },
      "autoApprove": [],
      "disabled": false
    }
  }
}
```

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify the API token is correct
   - Check that the email matches the Atlassian account
   - Ensure the host URL is correct (should not include 'https://')

2. **Docker Image Not Found**
   - Ensure Docker is installed and running
   - Try pulling the image manually: `docker pull ghcr.io/aaronsb/jira-cloud:latest`

3. **Permission Issues**
   - Check Jira permissions for the user account
   - Verify project access rights

## Verification

To verify the installation is working correctly, suggest the user try a simple command like listing Jira projects:

```
Use the jira-cloud MCP server to list all projects in your Jira instance.
```

This should return a list of projects if the configuration is correct.
