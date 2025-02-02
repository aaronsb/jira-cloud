# Technical Context

## Technologies Used

1. Core Technologies
   - TypeScript 5.x
   - Node.js
   - MCP SDK (@modelcontextprotocol/sdk)

2. Dependencies
   - axios: HTTP client for API requests
   - JSON Schema: Input validation
   - StdioServerTransport: MCP communication

3. Development Tools
   - npm: Package management
   - tsc: TypeScript compilation
   - VSCode: Recommended IDE

## Development Setup

1. Environment Requirements
   - Node.js 18+ installed
   - npm 8+ installed
   - TypeScript 5.x installed

2. Configuration
   Required environment variables:
   ```
   JIRA_API_TOKEN=your-api-token
   JIRA_EMAIL=your-email
   JIRA_HOST=your-instance.atlassian.net
   ```

3. Build Process
   ```bash
   npm install    # Install dependencies
   npm run build  # Build TypeScript
   npm run watch  # Development mode
   ```

## Technical Constraints

1. API Limitations
   - Jira Cloud API rate limits
   - Authentication token requirements
   - Eventual consistency model

2. MCP Protocol Requirements
   - Strict schema validation
   - Synchronous tool execution
   - UTF-8 text encoding

3. Runtime Constraints
   - Node.js single-threaded execution
   - Memory usage considerations
   - Network dependency

4. Security Considerations
   - Secure credential handling
   - API token management
   - No sensitive data in logs

## Integration Points

1. Jira Cloud API
   - REST API v3
   - Agile API
   - Authentication API

2. MCP Protocol
   - Tool definitions
   - Resource handling
   - Error propagation

3. Development Environment
   - VSCode integration
   - Claude Desktop support
   - Cross-platform compatibility
