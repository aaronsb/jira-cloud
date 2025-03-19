# Tool Consolidation Refactoring TODO List

This document tracks the remaining work for the Jira Cloud MCP tool consolidation refactoring.

## Completed

- [x] Create base response formatter
- [x] Create entity-specific formatters (Issue, Project, Board, Search)
- [x] Update tool schemas with new consolidated API
- [x] Implement enhanced Issue API
- [x] Implement enhanced Project API
- [x] Implement enhanced Board API
- [x] Implement enhanced Search API
- [x] Update main server routing
- [x] Create documentation for the new API
- [x] Clean up old tool references from routing logic

## Remaining Work

### Testing

- [x] Test all new consolidated tools with real Jira instances
- [x] Verify that all expansions work correctly
- [ ] Test error handling and edge cases

### Enhancements

  - [x] Consolidate Issue API into a single `manage_jira_issue` tool
  - [x] Consolidate Sprint API into a single `manage_jira_sprint` tool
  - [x] Consolidate Project API into a single `manage_jira_project` tool
  - [x] Consolidate Board API into a single `manage_jira_board` tool
- [ ] Implement and consolidate Filter API into a `manage_jira_filter` tool
- [ ] Add caching for frequently accessed data
- [ ] Optimize batch requests for related data
- [ ] Implement more advanced contextual insights
- [x] Add more suggested actions based on entity state

### Documentation

- [x] Update API reference documentation
- [ ] Create more examples for common use cases
- [ ] Add diagrams to illustrate the new architecture

## Future Considerations

- Consider adding GraphQL-like query capabilities to allow clients to specify exactly what fields they want
- Investigate adding more advanced analytics and metrics
