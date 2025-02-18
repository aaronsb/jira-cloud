# Deployment Guide

## Docker Deployment

### Prerequisites
- Docker installed on your system
- Access to GitHub Container Registry (ghcr.io)
- Jira Cloud API token and email

### Container Configuration

The Jira Cloud MCP server is available as a Docker container from GitHub Container Registry:

```bash
ghcr.io/aaronsb/jira-cloud:latest
```

### Environment Variables

Required environment variables:
- `JIRA_API_TOKEN`: Your Jira API token
- `JIRA_EMAIL`: Your Jira account email
- `JIRA_HOST`: Your Jira instance (e.g., your-instance.atlassian.net)

Optional environment variables:
- `LOG_FILE`: Custom log file path (default: /app/logs/jira-cloud-mcp.log)
- `MCP_MODE`: Set to 'true' for MCP server mode (default: true)

### Volume Mounts

The container expects two volume mounts:
- `/app/config`: Configuration directory
- `/app/logs`: Log directory

### Running the Container

Basic usage:
```bash
docker run -i \
  -e JIRA_API_TOKEN=your_api_token \
  -e JIRA_EMAIL=your_email \
  -e JIRA_HOST=your-instance.atlassian.net \
  -v /path/to/config:/app/config \
  -v /path/to/logs:/app/logs \
  ghcr.io/aaronsb/jira-cloud:latest
```

### Docker Compose

Example docker-compose.yml:
```yaml
version: '3.8'
services:
  jira-mcp:
    image: ghcr.io/aaronsb/jira-cloud:latest
    environment:
      - JIRA_API_TOKEN=${JIRA_API_TOKEN}
      - JIRA_EMAIL=${JIRA_EMAIL}
      - JIRA_HOST=${JIRA_HOST}
    volumes:
      - ./config:/app/config
      - ./logs:/app/logs
    stdin_open: true
```

### Health Checks

The container implements health checks to monitor the service status. The health check verifies:
- MCP server is running
- Jira API is accessible
- Required volumes are mounted
- Permissions are correct

### Logging

Logs are written to `/app/logs/jira-cloud-mcp.log` by default. The log directory is created automatically if it doesn't exist.

### Security Considerations

1. API Token Security
   - Store API tokens securely (e.g., using Docker secrets)
   - Never commit tokens to version control
   - Rotate tokens regularly

2. File Permissions
   - Container runs as non-root user (UID 1000)
   - Config and log directories are restricted (750)
   - Sensitive files are restricted (640)

3. Network Security
   - Container only requires outbound HTTPS access
   - No inbound ports are exposed
   - Communication via stdin/stdout only

### Troubleshooting

Common issues and solutions:

1. Permission Errors
   ```
   Error: EACCES: permission denied, open '/app/logs/jira-cloud-mcp.log'
   ```
   Solution: Ensure host directory permissions match container user (UID 1000)

2. Missing Environment Variables
   ```
   Error: JIRA_API_TOKEN environment variable is required
   ```
   Solution: Verify all required environment variables are set

3. Volume Mount Issues
   ```
   Error: Failed to create directory: /app/config
   ```
   Solution: Ensure host directories exist and have correct permissions

### Building from Source

To build the container locally:

```bash
git clone https://github.com/aaronsb/jira-cloud.git
cd jira-cloud
docker build -t ghcr.io/aaronsb/jira-cloud:latest .
```

### Updates and Maintenance

1. Version Updates
   - Container tags follow semantic versioning
   - Latest tag always points to most recent stable release
   - Specific versions available via tags (e.g., v1.0.0)

2. Updating the Container
   ```bash
   docker pull ghcr.io/aaronsb/jira-cloud:latest
   ```

3. Backup and Restore
   - Backup config directory before updates
   - Container is stateless; configuration in mounted volumes
   - Log rotation handled automatically
