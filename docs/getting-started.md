# Getting Started

## Installation

### Prerequisites
- Node.js 18 or higher
- npm 8 or higher
- Docker (optional, for container deployment)

### Local Installation

1. Clone the repository:
```bash
git clone https://github.com/aaronsb/jira-cloud.git
cd jira-cloud
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

### Docker Installation

Pull the container:
```bash
docker pull ghcr.io/aaronsb/jira-cloud:latest
```

## Configuration

### Environment Variables

Required variables:
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

2. Note your Jira email:
   - Use the email associated with your Atlassian account
   - This is typically your login email

3. Identify your Jira host:
   - Format: your-instance.atlassian.net
   - Found in your Jira URL

## Usage

### Local Development

1. Set environment variables:
```bash
export JIRA_API_TOKEN=your-api-token
export JIRA_EMAIL=your-email
export JIRA_HOST=your-instance.atlassian.net
```

2. Run in development mode:
```bash
npm run dev
```

### Docker Usage

Run with environment variables:
```bash
docker run -i \
  -e JIRA_API_TOKEN=your_api_token \
  -e JIRA_EMAIL=your_email \
  -e JIRA_HOST=your-instance.atlassian.net \
  -v /path/to/config:/app/config \
  -v /path/to/logs:/app/logs \
  ghcr.io/aaronsb/jira-cloud:latest
```

## Examples

### Basic MCP Usage

1. List Projects:
```typescript
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "list_projects",
  arguments: {}
});
```

2. Create Issue:
```typescript
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
```

3. Search Issues:
```typescript
await use_mcp_tool({
  server_name: "jira-cloud",
  tool_name: "search_issues",
  arguments: {
    jql: "project = PROJ AND status = 'In Progress'"
  }
});
```

## Troubleshooting

### Common Issues

1. Authentication Errors
```
Error: Could not authenticate with Jira
```
- Verify API token is correct
- Check email matches Atlassian account
- Ensure host URL is correct

2. Permission Issues
```
Error: User does not have permission to perform this action
```
- Check Jira permissions for your account
- Verify project access rights
- Review role assignments

3. Rate Limiting
```
Error: Too many requests
```
- Implement request batching
- Add delays between requests
- Consider caching responses

### Logs

Local development logs:
```bash
tail -f logs/jira-cloud-mcp.log
```

Docker container logs:
```bash
docker logs <container_id>
```

## Next Steps

1. Review [Features](./features.md) for available functionality
2. Explore [Architecture](./architecture.md) for technical details
3. See [Deployment](./deployment.md) for production setup
4. Check [Contributing](./contributing.md) to get involved

## Support

- File issues on GitHub
- Review documentation
- Join community discussions
- Check release notes for updates
