# TODO List

## Next Development Phase (feature/jira-api-extensions)

### Priority 1: Sprint Management
- [x] Create schema for sprint operations (create, update, get, list)
- [x] Implement formatter for sprint entities
- [x] Add endpoint for creating new sprints
- [x] Add endpoint for moving issues to/from sprints
- [x] Implement sprint start/complete functionality
- [x] Add sprint report retrieval capability

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

### Issue Operations
- [ ] Implement bulk operations support
- [ ] Add worklog management capabilities
- [ ] Optimize for rate limiting constraints

### Sprint Management
- [x] Create/update sprints functionality
- [x] Move issues between sprints
- [x] Implement sprint reports
- [ ] Add sprint velocity tracking

### Performance Improvements
- [ ] Implement request caching system
- [ ] Add batch operations support
- [ ] Configure connection pooling
- [ ] Add performance monitoring
