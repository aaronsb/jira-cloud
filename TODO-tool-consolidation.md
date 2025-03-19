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

- [ ] Add caching for frequently accessed data
- [ ] Optimize batch requests for related data
- [ ] Implement more advanced contextual insights
- [x] Add more suggested actions based on entity state

### Documentation

- [ ] Update API reference documentation
- [ ] Create more examples for common use cases
- [ ] Add diagrams to illustrate the new architecture

## Future Considerations

- Consider adding GraphQL-like query capabilities to allow clients to specify exactly what fields they want
- Explore adding webhooks for real-time updates
- Investigate adding more advanced analytics and metrics
