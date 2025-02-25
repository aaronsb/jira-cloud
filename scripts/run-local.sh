#!/bin/bash
set -e

# Check if environment variables are provided
if [ -z "$JIRA_API_TOKEN" ]; then
    echo "Error: JIRA_API_TOKEN environment variable is required"
    echo "Usage: JIRA_API_TOKEN=your_token JIRA_EMAIL=your_email ./scripts/run-local.sh"
    exit 1
fi

if [ -z "$JIRA_EMAIL" ]; then
    echo "Error: JIRA_EMAIL environment variable is required"
    echo "Usage: JIRA_API_TOKEN=your_token JIRA_EMAIL=your_email ./scripts/run-local.sh"
    exit 1
fi

# Optional JIRA_HOST environment variable
JIRA_HOST_ARG=""
if [ -n "$JIRA_HOST" ]; then
    JIRA_HOST_ARG="-e JIRA_HOST=$JIRA_HOST"
fi

# Run local development image with provided credentials
echo "Starting jira-cloud MCP server..."
docker run --rm -i \
  -e JIRA_API_TOKEN=$JIRA_API_TOKEN \
  -e JIRA_EMAIL=$JIRA_EMAIL \
  $JIRA_HOST_ARG \
  jira-cloud:local
