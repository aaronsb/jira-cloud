# System Patterns

## Architecture
The system follows a modular architecture with clear separation of concerns:

```
src/
├── client/      # Core API interactions
├── handlers/    # MCP tool implementations
├── schemas/     # Input/output definitions
├── types/       # TypeScript interfaces
└── utils/       # Shared utilities
```

## Key Technical Decisions

1. TypeScript Implementation
   - Strong typing for API interactions
   - Interface-driven development
   - Compile-time error detection

2. Modular Design
   - Separate concerns into distinct modules
   - Clear boundaries between components
   - Easy to extend and maintain

3. Handler Pattern
   - Each MCP tool has a dedicated handler
   - Consistent request validation
   - Standardized error handling
   - Clear separation from API client logic

4. Schema Validation
   - JSON Schema for all tool inputs
   - Runtime parameter validation
   - Clear error messages for invalid inputs

5. Error Management
   - Typed error responses
   - Consistent error format
   - Detailed error information
   - Proper error propagation

6. Tool Naming Convention
   - Follow [verb]_jira_[noun] pattern
   - Examples:
     * list_jira_boards
     * get_jira_issue
     * update_jira_issue
   - Ensures consistency and clarity
   - Makes tool purpose immediately clear

## Design Patterns

1. Singleton Pattern
   - Single JiraClient instance
   - Managed connection pool
   - Shared configuration

2. Factory Pattern
   - Handler creation
   - Response formatting
   - Error object creation

3. Strategy Pattern
   - Different handlers for different operations
   - Pluggable validation strategies
   - Flexible response formatting

4. Observer Pattern
   - Event-based error handling
   - Async operation management
   - Resource cleanup

## Available Tools

1. Board and Project Management
   - list_jira_boards: Get all boards
   - list_jira_sprints: Get sprints for a board (requires boardId)
   - list_jira_projects: Get all projects
   - list_jira_filters: List saved filters with optional details

2. Issue Operations
   - create_jira_issue: Create new issues (requires projectKey, summary, issueType)
   - get_jira_issue: Get basic issue info (requires issueKey)
   - get_jira_issue_details: Get comprehensive issue info with comments (requires issueKey)
   - update_jira_issue: Update issue summary/description/parent (requires issueKey)
   - get_jira_issue_attachments: Get issue attachments (requires issueKey)

3. Issue Transitions and Comments
   - get_jira_transitions: Get allowed transitions (requires issueKey)
   - transition_jira_issue: Change issue status (requires issueKey, transitionId)
   - add_jira_comment: Add issue comment (requires issueKey, body)

4. Search and Filtering
   - search_jira_issues: Advanced JQL search with pagination
     * Supports portfolio queries
     * Common search patterns (assignee, status, priority)
     * Advanced functions (sorting, change tracking)
   - get_jira_filter_issues: Get issues from saved filter
   - get_jira_fields: Get populated issue fields

Each tool enforces strict input validation through JSON schemas, supports snake_case alternatives for parameters, and provides clear error messages for invalid inputs.

## Best Practices

1. Code Organization
   - Clear file structure
   - Consistent naming conventions
   - Logical grouping of related code

2. Error Handling
   - Always use typed errors
   - Provide meaningful messages
   - Include error context
   - Handle edge cases

3. API Interaction
   - Rate limiting awareness
   - Proper authentication
   - Request retries
   - Response validation

4. Testing
   - Unit tests for handlers
   - Integration tests for API client
   - Error case coverage
   - Mock external dependencies
