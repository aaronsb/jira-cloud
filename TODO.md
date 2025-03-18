# TODO List

## Next Development Phase (feature/jira-api-extensions)

### Priority 1: Sprint Management
- [ ] Create schema for sprint operations (create, update, get, list)
- [ ] Implement formatter for sprint entities
- [ ] Add endpoint for creating new sprints
- [ ] Add endpoint for moving issues to/from sprints
- [ ] Implement sprint start/complete functionality
- [ ] Add sprint report retrieval capability

### Priority 2: Issue Relations
- [ ] Create schema for issue link operations
- [ ] Implement link type discovery endpoint
- [ ] Add functionality for creating parent-child relationships
- [ ] Add support for issue links (blocks, is blocked by, relates to)
- [ ] Enhance issue responses to include relationship data
- [ ] Add endpoint for retrieving issue link types

### Priority 3: Attachments
- [ ] Create schema for attachment operations
- [ ] Implement file upload functionality for issues
- [ ] Add attachment download capability
- [ ] Implement listing attachments on an issue
- [ ] Add attachment removal functionality
- [ ] Enhance issue responses to include attachment metadata

### Priority 4: Worklog & Time Tracking
- [ ] Create schema for worklog operations
- [ ] Implement adding work logs to issues
- [ ] Add support for updating existing work logs
- [ ] Create endpoint for retrieving time tracking information
- [ ] Implement time estimate updates
- [ ] Enhance issue responses to include time tracking data

## Current Branch (feature/docker-containerization)

1. Container Implementation
   - [ ] Add GitHub Actions workflow for container builds
   - [ ] Create container deployment documentation
   - [ ] Add container health checks
   - [ ] Implement graceful shutdown handling
   - [ ] Add container metrics/monitoring

2. Testing & Validation
   - [ ] Add container integration tests
   - [ ] Test with different Jira Cloud instances
   - [ ] Validate environment variable handling
   - [ ] Test volume mounting and permissions

## Planned Features (from progress.md)

### Issue Operations
- [ ] Implement bulk operations support
- [ ] Add worklog management capabilities
- [ ] Optimize for rate limiting constraints

### Sprint Management
- [ ] Create/update sprints functionality
- [ ] Move issues between sprints
- [ ] Implement sprint reports
- [ ] Add sprint velocity tracking

### Performance Improvements
- [ ] Implement request caching system
- [ ] Add batch operations support
- [ ] Configure connection pooling
- [ ] Add performance monitoring

## Technical Debt

### Testing
- [ ] Increase test coverage
- [ ] Add integration test suite
- [ ] Implement performance benchmarks
- [ ] Add load testing

### Optimization
- [ ] Optimize pagination handling
- [ ] Implement request caching
- [ ] Add request batching
- [ ] Optimize memory usage

### Documentation
- [x] Create documentation restructuring plan (see docs/documentation-restructuring-plan.md)
- [x] Update README.md according to restructuring plan
- [ ] Fix all inconsistent references (e.g., "cline_docs/" vs "docs/")
- [ ] Consolidate duplicated content in docs/ folder
- [ ] Add missing documentation (troubleshooting, API reference)
- [ ] Implement consistent formatting across all documentation
- [ ] Integrate documentation maintenance into development workflow
- [ ] Add API documentation
- [ ] Create usage examples
- [ ] Document best practices

## Future Considerations

### Scalability
- [ ] Consider horizontal scaling options
- [ ] Implement rate limit handling
- [ ] Add request queuing
- [ ] Optimize resource usage

### Monitoring
- [ ] Add telemetry
- [ ] Implement logging strategy
- [ ] Add error tracking
- [ ] Create monitoring dashboards
