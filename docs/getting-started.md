# Getting Started

## Prerequisites
- Node.js 20 or higher
- npm 8 or higher
- Docker (optional, for container deployment)

## Installation Options

### Docker Installation (Recommended)

The simplest way to use this MCP server is with Docker:

```bash
# Pull the latest stable version
docker pull ghcr.io/aaronsb/jira-cloud:latest
```

### Local Installation

1. Clone the repository:
```bash
git clone https://github.com/aaronsb/jira-cloud.git
cd jira-cloud
```

2. Install dependencies and build:
```bash
npm install
npm run build
```

## Configuration

### Required Environment Variables

```bash
JIRA_API_TOKEN=your-api-token
JIRA_EMAIL=your-email
JIRA_HOST=your-instance.atlassian.net
```

### Getting Jira Credentials

1. Generate an API Token:
   - Go to [Atlassian Account Settings](https://id.atlassian.com/manage/api-tokens)
   - Click "Create API token"
   - Name your token and copy it securely

2. Use your Atlassian account email and Jira host (your-instance.atlassian.net)

## Usage

### Docker Usage

```bash
docker run -i \
  -e JIRA_API_TOKEN=your_api_token \
  -e JIRA_EMAIL=your_email \
  -e JIRA_HOST=your-instance.atlassian.net \
  ghcr.io/aaronsb/jira-cloud:latest
```

### Local Development

```bash
export JIRA_API_TOKEN=your-api-token
export JIRA_EMAIL=your-email
export JIRA_HOST=your-instance.atlassian.net
npm run dev
```

## Examples

### Basic MCP Usage

```typescript
// List Projects
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "list_projects",
  arguments: {}
});

// Create Issue
await use_mcp_tool({
  server_name: "jira-cloud",
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
  server_name: "jira-cloud",
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
