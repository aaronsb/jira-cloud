# Sprint Management Implementation Plan

## Overview

This document outlines the implementation plan for adding Sprint Management capabilities to the Jira Cloud MCP. Sprint Management is a critical feature for Agile teams using Jira, allowing them to plan, track, and report on work in fixed time periods.

## Features to Implement

1. Creating new sprints
2. Moving issues to/from sprints
3. Starting and completing sprints
4. Retrieving sprint reports

## Implementation Details

### 1. Schema Definitions

We'll add the following schemas to `src/schemas/request-schemas.ts`:

```typescript
// Create Sprint Schema
export const CreateJiraSprintSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('create_jira_sprint'),
    arguments: z.object({
      boardId: z.number(),
      name: z.string(),
      startDate: z.string().optional(), // ISO date string
      endDate: z.string().optional(),   // ISO date string
      goal: z.string().optional(),
    }),
  }),
});

// Get Sprint Schema
export const GetJiraSprintSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('get_jira_sprint'),
    arguments: z.object({
      sprintId: z.number(),
      expand: z.array(z.string()).optional(),
    }),
  }),
});

// List Sprints Schema
export const ListJiraSprintsSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('list_jira_sprints'),
    arguments: z.object({
      boardId: z.number(),
      state: z.enum(['future', 'active', 'closed']).optional(),
      expand: z.array(z.string()).optional(),
    }),
  }),
});

// Update Sprint Issues Schema
export const UpdateSprintIssuesSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('update_sprint_issues'),
    arguments: z.object({
      sprintId: z.number(),
      add: z.array(z.string()).optional(),     // Array of issue keys to add
      remove: z.array(z.string()).optional(),  // Array of issue keys to remove
    }),
  }),
});

// Manage Sprint Schema (for start/complete operations)
export const ManageSprintSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('manage_sprint'),
    arguments: z.object({
      sprintId: z.number(),
      action: z.enum(['start', 'complete']),
      completeDate: z.string().optional(),     // Required for 'complete' action
    }),
  }),
});

// Get Sprint Report Schema
export const GetSprintReportSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.literal('get_sprint_report'),
    arguments: z.object({
      boardId: z.number(),
      sprintId: z.number(),
    }),
  }),
});
```

### 2. Sprint Formatter

We'll create a new formatter in `src/utils/formatters/sprint-formatter.ts`:

```typescript
import { BaseFormatter, FormattedResponse, ResponseMetadata, ResponseSummary } from './base-formatter';

interface SprintData {
  id: number;
  name: string;
  state: 'future' | 'active' | 'closed';
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  goal?: string;
  boardId: number;
  // Other sprint fields
}

interface SprintReportData {
  sprint: SprintData;
  completedIssues: any[];
  incompletedIssues: any[];
  puntedIssues: any[];
  issuesAddedDuringSprint: any[];
  metrics: {
    completedIssuesCount: number;
    completedIssuesEstimateSum: number;
    completedIssuesInitialEstimateSum: number;
    // Other metrics
  };
}

export class SprintFormatter extends BaseFormatter {
  /**
   * Format a sprint entity
   */
  static formatSprint(
    sprint: SprintData,
    options: {
      expand?: string[];
      issues?: any[];
    } = {}
  ): FormattedResponse<SprintData> {
    // Create metadata
    const metadata: ResponseMetadata = this.createMetadata({
      expansions: ['issues', 'report'],
      related: {
        board: sprint.boardId.toString(),
      },
    });

    // Create summary
    const summary: ResponseSummary = this.createSummary({
      suggested_actions: this.getSuggestedActions(sprint),
    });

    return this.formatResponse(sprint, metadata, summary);
  }

  /**
   * Format a sprint report
   */
  static formatSprintReport(
    report: SprintReportData
  ): FormattedResponse<SprintReportData> {
    // Create metadata
    const metadata: ResponseMetadata = this.createMetadata({
      related: {
        sprint: report.sprint.id.toString(),
        board: report.sprint.boardId.toString(),
      },
    });

    // Create summary with key metrics
    const summary: ResponseSummary = this.createSummary({
      status_counts: {
        completed: report.completedIssues.length,
        incompleted: report.incompletedIssues.length,
        punted: report.puntedIssues.length,
        added: report.issuesAddedDuringSprint.length,
      },
    });

    return this.formatResponse(report, metadata, summary);
  }

  /**
   * Get suggested actions based on sprint state
   */
  private static getSuggestedActions(sprint: SprintData): Array<{ text: string; action_id?: string }> {
    const actions = [];

    switch (sprint.state) {
      case 'future':
        actions.push({ text: 'Start Sprint', action_id: 'start' });
        actions.push({ text: 'Add Issues to Sprint', action_id: 'add_issues' });
        break;
      case 'active':
        actions.push({ text: 'Complete Sprint', action_id: 'complete' });
        actions.push({ text: 'Add Issues to Sprint', action_id: 'add_issues' });
        actions.push({ text: 'Remove Issues from Sprint', action_id: 'remove_issues' });
        break;
      case 'closed':
        actions.push({ text: 'View Sprint Report', action_id: 'view_report' });
        actions.push({ text: 'Create New Sprint', action_id: 'create_sprint' });
        break;
    }

    return actions;
  }
}
```

### 3. Sprint Handlers

We'll create a new handler file in `src/handlers/sprint-handlers.ts`:

```typescript
import { JiraClient } from '../client/jira-client';
import { SprintFormatter } from '../utils/formatters/sprint-formatter';

export async function createJiraSprint(client: JiraClient, params: any) {
  const { boardId, name, startDate, endDate, goal } = params;

  const response = await client.post(`/rest/agile/1.0/sprint`, {
    originBoardId: boardId,
    name,
    startDate,
    endDate,
    goal,
  });

  return SprintFormatter.formatSprint(response);
}

export async function getJiraSprint(client: JiraClient, params: any) {
  const { sprintId, expand } = params;

  const response = await client.get(`/rest/agile/1.0/sprint/${sprintId}`);

  // If issues are requested in expand, fetch them
  let issues = [];
  if (expand && expand.includes('issues')) {
    const issuesResponse = await client.get(`/rest/agile/1.0/sprint/${sprintId}/issue`);
    issues = issuesResponse.issues || [];
  }

  return SprintFormatter.formatSprint(response, { expand, issues });
}

export async function listJiraSprints(client: JiraClient, params: any) {
  const { boardId, state, expand } = params;

  let url = `/rest/agile/1.0/board/${boardId}/sprint`;
  if (state) {
    url += `?state=${state}`;
  }

  const response = await client.get(url);

  // Format each sprint
  const formattedSprints = response.values.map((sprint: any) => 
    SprintFormatter.formatSprint(sprint, { expand })
  );

  return {
    data: formattedSprints,
    _metadata: {
      pagination: {
        startAt: response.startAt,
        maxResults: response.maxResults,
        total: response.total,
        hasMore: response.isLast === false,
      },
    },
  };
}

export async function updateSprintIssues(client: JiraClient, params: any) {
  const { sprintId, add, remove } = params;

  // Add issues to sprint
  if (add && add.length > 0) {
    await client.post(`/rest/agile/1.0/sprint/${sprintId}/issue`, {
      issues: add,
    });
  }

  // Remove issues from sprint
  if (remove && remove.length > 0) {
    for (const issueKey of remove) {
      await client.post(`/rest/agile/1.0/sprint/${sprintId}/issue`, {
        issues: [issueKey],
        sprint: null,
      });
    }
  }

  // Return the updated sprint
  return getJiraSprint(client, { sprintId, expand: ['issues'] });
}

export async function manageSprint(client: JiraClient, params: any) {
  const { sprintId, action, completeDate } = params;

  if (action === 'start') {
    await client.post(`/rest/agile/1.0/sprint/${sprintId}/issue`, {
      state: 'active',
    });
  } else if (action === 'complete') {
    if (!completeDate) {
      throw new Error('completeDate is required when completing a sprint');
    }
    
    await client.post(`/rest/agile/1.0/sprint/${sprintId}/issue`, {
      state: 'closed',
      completeDate,
    });
  }

  // Return the updated sprint
  return getJiraSprint(client, { sprintId });
}

export async function getSprintReport(client: JiraClient, params: any) {
  const { boardId, sprintId } = params;

  const response = await client.get(
    `/rest/greenhopper/1.0/rapid/charts/sprintreport?rapidViewId=${boardId}&sprintId=${sprintId}`
  );

  return SprintFormatter.formatSprintReport(response);
}
```

### 4. Update Index File

We'll update `src/index.ts` to register the new handlers:

```typescript
// Import the new sprint handlers
import {
  createJiraSprint,
  getJiraSprint,
  listJiraSprints,
  updateSprintIssues,
  manageSprint,
  getSprintReport,
} from './handlers/sprint-handlers';

// Register the new handlers
server.setRequestHandler(CreateJiraSprintSchema, async (request) => {
  return createJiraSprint(jiraClient, request.params.arguments);
});

server.setRequestHandler(GetJiraSprintSchema, async (request) => {
  return getJiraSprint(jiraClient, request.params.arguments);
});

server.setRequestHandler(ListJiraSprintsSchema, async (request) => {
  return listJiraSprints(jiraClient, request.params.arguments);
});

server.setRequestHandler(UpdateSprintIssuesSchema, async (request) => {
  return updateSprintIssues(jiraClient, request.params.arguments);
});

server.setRequestHandler(ManageSprintSchema, async (request) => {
  return manageSprint(jiraClient, request.params.arguments);
});

server.setRequestHandler(GetSprintReportSchema, async (request) => {
  return getSprintReport(jiraClient, request.params.arguments);
});
```

### 5. Update Formatters Index

We'll update `src/utils/formatters/index.ts` to export the new formatter:

```typescript
export * from './base-formatter';
export * from './issue-formatter';
export * from './project-formatter';
export * from './board-formatter';
export * from './search-formatter';
export * from './sprint-formatter'; // Add this line
```

## Testing Plan

1. Create a new sprint on a board
2. Add issues to the sprint
3. Start the sprint
4. Move issues in and out of the sprint
5. Complete the sprint
6. Retrieve the sprint report

## Documentation Updates

We'll need to update the following documentation:
- API reference to include the new endpoints
- Usage examples for sprint management
- Update the main README.md to mention the new capabilities

## Timeline

- Schema definitions: 1 day
- Formatter implementation: 1 day
- Handler implementation: 2 days
- Testing: 1 day
- Documentation: 1 day

Total: 6 days
