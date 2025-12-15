# Troubleshooting Guide

This guide provides solutions for common issues when using the Jira Cloud MCP Server.

## Authentication Issues

**Symptoms:**
- "Could not authenticate with Jira" error
- 401 Unauthorized responses

**Solutions:**
1. Verify your API token is correct and not expired
2. Regenerate a new token from [Atlassian Account Settings](https://id.atlassian.com/manage/api-tokens)
3. Confirm the email matches your Atlassian account exactly
4. Verify the Jira host URL (e.g., "your-instance.atlassian.net")

## Permission Errors

**Symptoms:**
- 403 Forbidden responses
- "User does not have permission" errors

**Solutions:**
1. Verify your Jira account has appropriate permissions
2. Check project-specific role assignments
3. Verify project key is correct (case-sensitive)

## Rate Limiting

**Symptoms:**
- 429 Too Many Requests responses

**Solutions:**
1. Add delays between requests
2. Batch related operations when possible
3. Use pagination efficiently for large result sets

## MCP Integration Problems

**Symptoms:**
- Tools not appearing in MCP tool list
- "Tool not found" errors

**Solutions:**
1. Verify server configuration in MCP settings
2. Ensure tool names match exactly in requests

## Common Error Codes

| Error Code | Description | Possible Solutions |
|------------|-------------|-------------------|
| 400 | Bad Request | Check request parameters |
| 401 | Unauthorized | Verify API token |
| 403 | Forbidden | Check permissions |
| 404 | Not Found | Verify resource exists |
| 429 | Too Many Requests | Add delays between requests |
| 500 | Server Error | Try again later |

## Logging and Debugging

Enable debug logs with:
```bash
export LOG_LEVEL=debug
```

## Getting Help

If issues persist:
1. Check [GitHub Issues](https://github.com/aaronsb/jira-cloud/issues)
2. File a new issue with error details and reproduction steps
