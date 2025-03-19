import { SprintResponse } from '../../types/index.js';
import { BaseFormatter, FormattedResponse, ResponseMetadata, ResponseSummary } from './base-formatter.js';

export interface SprintData extends SprintResponse {
  issues?: Array<{
    key: string;
    summary: string;
    status: string;
    assignee?: string;
  }>;
  report?: {
    completedIssues: number;
    incompletedIssues: number;
    puntedIssues: number;
    addedIssues: number;
    velocityPoints?: number;
  };
}

export interface SprintExpansionOptions {
  issues?: boolean;
  report?: boolean;
}

export class SprintFormatter {
  /**
   * Format a sprint response with the standard structure and optional expansions
   * @param sprint The sprint data
   * @param options Expansion options
   * @returns A formatted sprint response
   */
  static formatSprint(
    sprint: SprintData,
    options: SprintExpansionOptions = {}
  ): FormattedResponse<SprintData> {
    // Create metadata with available expansions
    const metadata = this.createSprintMetadata(sprint, options);
    
    // Create summary
    const summary = this.createSprintSummary(sprint);

    return BaseFormatter.formatResponse(sprint, metadata, summary);
  }

  /**
   * Format a list of sprints
   * @param sprints Array of sprint data
   * @param pagination Pagination information
   * @returns A formatted response with sprints array
   */
  static formatSprintList(
    sprints: SprintData[],
    pagination?: {
      startAt: number;
      maxResults: number;
      total: number;
    }
  ): FormattedResponse<SprintData[]> {
    // Create metadata
    const metadata: ResponseMetadata = {};
    
    if (pagination) {
      metadata.pagination = {
        startAt: pagination.startAt,
        maxResults: pagination.maxResults,
        total: pagination.total,
        hasMore: pagination.startAt + pagination.maxResults < pagination.total,
      };
    }

    // Create summary with status counts
    const statusCounts: Record<string, number> = {
      future: 0,
      active: 0,
      closed: 0,
    };

    sprints.forEach(sprint => {
      if (sprint.state && statusCounts[sprint.state as keyof typeof statusCounts] !== undefined) {
        statusCounts[sprint.state as keyof typeof statusCounts]++;
      }
    });

    const summary: ResponseSummary = {
      status_counts: statusCounts,
      suggested_actions: [
        { text: 'Create new sprint', action_id: 'create_sprint' },
      ],
    };

    return BaseFormatter.formatResponse(sprints, metadata, summary);
  }

  /**
   * Create metadata for a sprint response
   */
  private static createSprintMetadata(
    sprint: SprintData,
    options: SprintExpansionOptions
  ): ResponseMetadata {
    // Determine which expansions are available but not included
    const availableExpansions: string[] = [];
    
    if (!options.issues && !sprint.issues) {
      availableExpansions.push('issues');
    }
    
    if (!options.report && !sprint.report) {
      availableExpansions.push('report');
    }

    // Create related entities map
    const related: Record<string, string | string[]> = {
      board: sprint.boardId.toString(),
    };

    return BaseFormatter.createMetadata({
      expansions: availableExpansions,
      related
    });
  }

  /**
   * Create a summary for a sprint response
   */
  private static createSprintSummary(sprint: SprintData): ResponseSummary {
    const suggestedActions: Array<{ text: string; action_id?: string }> = [];

    // Add suggested actions based on sprint state
    switch (sprint.state) {
      case 'future':
        suggestedActions.push({ text: 'Start Sprint', action_id: 'start_sprint' });
        suggestedActions.push({ text: 'Add Issues to Sprint', action_id: 'add_issues' });
        suggestedActions.push({ text: 'Edit Sprint', action_id: 'update_sprint' });
        break;
      case 'active':
        suggestedActions.push({ text: 'Complete Sprint', action_id: 'complete_sprint' });
        suggestedActions.push({ text: 'Add Issues to Sprint', action_id: 'add_issues' });
        suggestedActions.push({ text: 'Remove Issues from Sprint', action_id: 'remove_issues' });
        suggestedActions.push({ text: 'Edit Sprint', action_id: 'update_sprint' });
        break;
      case 'closed':
        suggestedActions.push({ text: 'View Sprint Report', action_id: 'view_report' });
        suggestedActions.push({ text: 'Create New Sprint', action_id: 'create_sprint' });
        break;
    }

    // Add status counts if issues are available
    const statusCounts: Record<string, number> = {};
    
    if (sprint.issues && sprint.issues.length > 0) {
      sprint.issues.forEach(issue => {
        if (!statusCounts[issue.status]) {
          statusCounts[issue.status] = 0;
        }
        statusCounts[issue.status]++;
      });
    }

    return BaseFormatter.createSummary({
      status_counts: Object.keys(statusCounts).length > 0 ? statusCounts : undefined,
      suggested_actions: suggestedActions
    });
  }
}
