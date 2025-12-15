# Development Guide

This guide provides essential information for developers working with the Jira Cloud MCP Server.

## Setup

### Prerequisites
- Node.js 20 or higher
- npm 8 or higher
- Git

### Development Environment

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

4. Run in development mode:
```bash
npm run dev
```

## Project Structure

```
src/
├── client/       # Core Jira API client
├── handlers/     # MCP tool handlers
├── schemas/      # JSON schemas for tools
├── types/        # TypeScript definitions
├── utils/        # Utility functions
└── index.ts      # Server entry point
```

## Testing

Run the test suite:
```bash
npm test
```

Run tests with coverage:
```bash
npm run test:coverage
```

## Adding Tools

### Tool Implementation Flow

1. Define the tool schema in `src/schemas/tool-schemas.ts`
2. Implement the handler in the appropriate file in `src/handlers/`
3. Add any necessary methods to the Jira client in `src/client/jira-client.ts`
4. Register the tool in `src/index.ts`

### Example: Adding a New Tool

Here's an example of adding a new tool called `get_jira_issue_links`:

1. Define the tool schema:

```typescript
// src/schemas/tool-schemas.ts
export const GetJiraIssueLinksSchema = {
  name: 'get_jira_issue_links',
  description: 'Get links between Jira issues',
  inputSchema: {
    type: 'object',
    properties: {
      issueKey: {
        type: 'string',
        description: 'The Jira issue key (e.g., PROJ-123)'
      }
    },
    required: ['issueKey']
  }
};
```

2. Implement the handler:

```typescript
// src/handlers/issue-handlers.ts
export async function handleGetJiraIssueLinks(
  request: CallToolRequest,
  jiraClient: JiraClient
): Promise<CallToolResponse> {
  const { issueKey } = request.params.arguments;
  
  if (!issueKey) {
    throw new McpError(ErrorCode.InvalidParams, 'issueKey is required');
  }
  
  try {
    const issueLinks = await jiraClient.getIssueLinks(issueKey);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(issueLinks, null, 2)
        }
      ]
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Error getting issue links: ${error.message}`
    );
  }
}
```

3. Add to JiraClient:

```typescript
// src/client/jira-client.ts
async getIssueLinks(issueKey: string): Promise<any> {
  const endpoint = `/rest/api/3/issue/${issueKey}`;
  const params = { fields: 'issuelinks' };
  
  const response = await this.makeRequest('GET', endpoint, params);
  return response.data.fields.issuelinks;
}
```

4. Register the tool:

```typescript
// src/index.ts
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // Existing tools...
    GetJiraIssueLinksSchema
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Existing tool handling...
  if (request.params.name === 'get_jira_issue_links') {
    return handleGetJiraIssueLinks(request, jiraClient);
  }
  // Error handling for unknown tools...
});
```

## Best Practices

### Code Style

- Follow TypeScript best practices
- Use async/await for asynchronous code
- Add proper error handling
- Include JSDoc comments for public APIs

### Error Handling

- Use McpError for all errors returned to clients
- Include meaningful error messages
- Categorize errors with appropriate error codes
- Log detailed error information for debugging

### Testing

- Write unit tests for all new functionality
- Test both success and error cases
- Mock external dependencies
- Aim for high test coverage

