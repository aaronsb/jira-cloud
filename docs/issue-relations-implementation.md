# Issue Relations Implementation Plan

## Overview

This document outlines the implementation plan for adding Issue Relations capabilities to the Jira Cloud MCP. Issue Relations are essential for tracking dependencies, hierarchies, and connections between issues, enabling better project management and visibility.

## Features to Implement

1. Creating parent-child relationships (epics/stories)
2. Adding issue links (blocks, is blocked by, relates to)
3. Managing dependencies between issues
4. Retrieving issue link types

## Implementation Details

### 1. Schema Definitions

We'll add the following schemas to `src/schemas/request-schemas.ts`:

```typescript
// Get Issue Link Types Schema
export const GetIssueLinkTypesSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('get_issue_link_types'),
    arguments: z.object({}),
  }),
});

// Manage Issue Link Schema
export const ManageIssueLinkSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('manage_issue_link'),
    arguments: z.object({
      operation: z.enum(['create', 'delete']),
      inwardIssueKey: z.string(),
      outwardIssueKey: z.string(),
      linkType: z.string(),
      comment: z.string().optional(),
    }),
  }),
});

// Manage Epic Link Schema
export const ManageEpicLinkSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('manage_epic_link'),
    arguments: z.object({
      operation: z.enum(['add', 'remove']),
      epicKey: z.string(),
      issueKey: z.string(),
    }),
  }),
});

// Get Issue Relations Schema
export const GetIssueRelationsSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('get_issue_relations'),
    arguments: z.object({
      issueKey: z.string(),
      relationTypes: z.array(z.string()).optional(),
    }),
  }),
});
```

### 2. Issue Relations Formatter

We'll enhance the existing issue formatter in `src/utils/formatters/issue-formatter.ts` to include relation information:

```typescript
// Add to existing issue formatter
interface IssueRelation {
  type: string;
  direction: 'inward' | 'outward';
  relatedIssue: {
    key: string;
    summary: string;
    status: string;
    issueType: string;
  };
}

// Add to the formatIssue method
static formatIssue(
  issue: IssueData,
  options: {
    expand?: string[];
    transitions?: any[];
    comments?: any[];
    relations?: IssueRelation[];
  } = {}
): FormattedResponse<IssueData> {
  // Existing code...

  // Add relations to metadata if available
  if (options.relations && options.relations.length > 0) {
    const relationsByType: Record<string, string[]> = {};
    
    options.relations.forEach(relation => {
      if (!relationsByType[relation.type]) {
        relationsByType[relation.type] = [];
      }
      relationsByType[relation.type].push(relation.relatedIssue.key);
    });
    
    metadata.related = {
      ...metadata.related,
      ...relationsByType,
    };
  }

  // Add epic relation if available
  if (issue.epic) {
    metadata.related = {
      ...metadata.related,
      epic: issue.epic.key,
    };
  }

  // Add subtasks if available
  if (issue.subtasks && issue.subtasks.length > 0) {
    metadata.related = {
      ...metadata.related,
      subtasks: issue.subtasks.map(subtask => subtask.key),
    };
  }

  // Existing code...
  return this.formatResponse(issue, metadata, summary);
}

// Add a new method to format link types
static formatLinkTypes(linkTypes: any[]): FormattedResponse<any[]> {
  const metadata: ResponseMetadata = this.createMetadata({});
  
  const summary: ResponseSummary = this.createSummary({
    suggested_actions: [
      { text: 'Create issue link', action_id: 'create_link' },
    ],
  });
  
  return this.formatResponse(linkTypes, metadata, summary);
}
```

### 3. Issue Relations Handlers

We'll create new handlers in `src/handlers/issue-relation-handlers.ts`:

```typescript
import { JiraClient } from '../client/jira-client';
import { IssueFormatter } from '../utils/formatters/issue-formatter';

export async function getIssueLinkTypes(client: JiraClient) {
  const response = await client.get('/rest/api/3/issueLinkType');
  
  return IssueFormatter.formatLinkTypes(response.issueLinkTypes);
}

export async function manageIssueLink(client: JiraClient, params: any) {
  const { operation, inwardIssueKey, outwardIssueKey, linkType, comment } = params;
  
  if (operation === 'create') {
    await client.post('/rest/api/3/issueLink', {
      type: {
        name: linkType,
      },
      inwardIssue: {
        key: inwardIssueKey,
      },
      outwardIssue: {
        key: outwardIssueKey,
      },
      comment: comment ? {
        body: comment,
      } : undefined,
    });
    
    // Return the updated issue with relations
    return getIssueRelations(client, { issueKey: inwardIssueKey });
  } else if (operation === 'delete') {
    // First, we need to find the link ID
    const relations = await getIssueRelationsRaw(client, inwardIssueKey);
    
    const link = relations.find(
      (link: any) => 
        (link.inwardIssue.key === inwardIssueKey && 
         link.outwardIssue.key === outwardIssueKey && 
         link.type.name === linkType) ||
        (link.inwardIssue.key === outwardIssueKey && 
         link.outwardIssue.key === inwardIssueKey && 
         link.type.name === linkType)
    );
    
    if (!link) {
      throw new Error(`Link not found between ${inwardIssueKey} and ${outwardIssueKey} with type ${linkType}`);
    }
    
    await client.delete(`/rest/api/3/issueLink/${link.id}`);
    
    // Return the updated issue with relations
    return getIssueRelations(client, { issueKey: inwardIssueKey });
  }
  
  throw new Error(`Invalid operation: ${operation}`);
}

export async function manageEpicLink(client: JiraClient, params: any) {
  const { operation, epicKey, issueKey } = params;
  
  if (operation === 'add') {
    // Add issue to epic
    await client.post(`/rest/agile/1.0/epic/${epicKey}/issue`, {
      issues: [issueKey],
    });
  } else if (operation === 'remove') {
    // Remove issue from epic
    await client.post(`/rest/agile/1.0/epic/none/issue`, {
      issues: [issueKey],
    });
  } else {
    throw new Error(`Invalid operation: ${operation}`);
  }
  
  // Return the updated issue with relations
  return getIssueRelations(client, { issueKey });
}

// Helper function to get raw relations data
async function getIssueRelationsRaw(client: JiraClient, issueKey: string) {
  const response = await client.get(`/rest/api/3/issue/${issueKey}?fields=issuelinks`);
  return response.fields.issuelinks || [];
}

export async function getIssueRelations(client: JiraClient, params: any) {
  const { issueKey, relationTypes } = params;
  
  // Get the issue with links
  const response = await client.get(`/rest/api/3/issue/${issueKey}?fields=issuelinks,parent,subtasks,epic`);
  
  // Format the links
  const links = response.fields.issuelinks || [];
  const formattedRelations: any[] = [];
  
  // Process issue links
  for (const link of links) {
    const linkType = link.type.name;
    
    // Skip if relationTypes is specified and this type is not included
    if (relationTypes && !relationTypes.includes(linkType)) {
      continue;
    }
    
    if (link.inwardIssue && link.inwardIssue.key !== issueKey) {
      formattedRelations.push({
        type: linkType,
        direction: 'inward',
        relatedIssue: {
          key: link.inwardIssue.key,
          summary: link.inwardIssue.fields.summary,
          status: link.inwardIssue.fields.status.name,
          issueType: link.inwardIssue.fields.issuetype.name,
        },
      });
    } else if (link.outwardIssue && link.outwardIssue.key !== issueKey) {
      formattedRelations.push({
        type: linkType,
        direction: 'outward',
        relatedIssue: {
          key: link.outwardIssue.key,
          summary: link.outwardIssue.fields.summary,
          status: link.outwardIssue.fields.status.name,
          issueType: link.outwardIssue.fields.issuetype.name,
        },
      });
    }
  }
  
  // Process parent relationship
  if (response.fields.parent) {
    formattedRelations.push({
      type: 'parent',
      direction: 'inward',
      relatedIssue: {
        key: response.fields.parent.key,
        summary: response.fields.parent.fields.summary,
        status: response.fields.parent.fields.status.name,
        issueType: response.fields.parent.fields.issuetype.name,
      },
    });
  }
  
  // Process epic relationship
  if (response.fields.epic) {
    formattedRelations.push({
      type: 'epic',
      direction: 'inward',
      relatedIssue: {
        key: response.fields.epic.key,
        summary: response.fields.epic.fields.summary,
        status: response.fields.epic.fields.status.name,
        issueType: 'Epic',
      },
    });
  }
  
  // Process subtasks
  if (response.fields.subtasks && response.fields.subtasks.length > 0) {
    for (const subtask of response.fields.subtasks) {
      formattedRelations.push({
        type: 'subtask',
        direction: 'outward',
        relatedIssue: {
          key: subtask.key,
          summary: subtask.fields.summary,
          status: subtask.fields.status.name,
          issueType: subtask.fields.issuetype.name,
        },
      });
    }
  }
  
  // Get the basic issue data
  const issueData = {
    key: response.key,
    summary: response.fields.summary,
    status: response.fields.status.name,
    issueType: response.fields.issuetype.name,
  };
  
  // Format the response
  return IssueFormatter.formatIssue(issueData, { relations: formattedRelations });
}
```

### 4. Update Index File

We'll update `src/index.ts` to register the new handlers:

```typescript
// Import the new issue relation handlers
import {
  getIssueLinkTypes,
  manageIssueLink,
  manageEpicLink,
  getIssueRelations,
} from './handlers/issue-relation-handlers';

// Register the new handlers
server.setRequestHandler(GetIssueLinkTypesSchema, async (request) => {
  return getIssueLinkTypes(jiraClient);
});

server.setRequestHandler(ManageIssueLinkSchema, async (request) => {
  return manageIssueLink(jiraClient, request.params.arguments);
});

server.setRequestHandler(ManageEpicLinkSchema, async (request) => {
  return manageEpicLink(jiraClient, request.params.arguments);
});

server.setRequestHandler(GetIssueRelationsSchema, async (request) => {
  return getIssueRelations(jiraClient, request.params.arguments);
});
```

### 5. Enhance Existing Issue Handlers

We'll update the existing issue handlers to include relation information:

```typescript
// In src/handlers/issue-handlers.ts

// Update getJiraIssue to include relations
export async function getJiraIssue(client: JiraClient, params: any) {
  const { issueKey, expand } = params;
  
  // Existing code...
  
  // If relations are requested in expand, fetch them
  let relations = [];
  if (expand && expand.includes('relations')) {
    const relationsResponse = await getIssueRelations(client, { issueKey });
    relations = relationsResponse.data.relations || [];
  }
  
  return IssueFormatter.formatIssue(issueData, { 
    expand, 
    transitions, 
    comments,
    relations,
  });
}
```

## Testing Plan

1. Retrieve available issue link types
2. Create links between issues with different link types
3. Add issues to epics
4. Remove issues from epics
5. Delete links between issues
6. Retrieve all relations for an issue

## Documentation Updates

We'll need to update the following documentation:
- API reference to include the new endpoints
- Usage examples for issue relations
- Update the main README.md to mention the new capabilities

## Timeline

- Schema definitions: 1 day
- Formatter enhancements: 1 day
- Handler implementation: 2 days
- Testing: 1 day
- Documentation: 1 day

Total: 6 days
