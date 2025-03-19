import { BaseFormatter, FormattedResponse, ResponseMetadata, ResponseSummary } from './base-formatter.js';
import { JiraIssueDetails, TransitionDetails } from '../../types/index.js';

export interface IssueExpansionOptions {
  comments?: boolean;
  transitions?: boolean;
  attachments?: boolean;
  related_issues?: boolean;
  history?: boolean;
}

export class IssueFormatter {
  /**
   * Format an issue response with the standard structure and optional expansions
   * @param issue The issue data
   * @param options Expansion options
   * @param transitions Optional transitions data (if requested)
   * @returns A formatted issue response
   */
  static formatIssue(
    issue: JiraIssueDetails,
    options: IssueExpansionOptions = {},
    transitions?: TransitionDetails[]
  ): FormattedResponse<JiraIssueDetails> {
    // Create metadata with available expansions
    const metadata = this.createIssueMetadata(issue, options, transitions);
    
    // Create summary with status and suggested actions
    const summary = this.createIssueSummary(issue, transitions);

    return BaseFormatter.formatResponse(issue, metadata, summary);
  }

  /**
   * Create metadata for an issue response
   */
  private static createIssueMetadata(
    issue: JiraIssueDetails,
    options: IssueExpansionOptions,
    transitions?: TransitionDetails[]
  ): ResponseMetadata {
    // Determine which expansions are available but not included
    const availableExpansions: string[] = [];
    
    if (!options.comments && issue.comments === undefined) {
      availableExpansions.push('comments');
    }
    
    if (!options.transitions && transitions === undefined) {
      availableExpansions.push('transitions');
    }
    
    if (!options.attachments && issue.attachments === undefined) {
      availableExpansions.push('attachments');
    }
    
    if (!options.related_issues) {
      availableExpansions.push('related_issues');
    }
    
    if (!options.history) {
      availableExpansions.push('history');
    }

    // Create related entities map
    const related: Record<string, string | string[]> = {};
    
    if (issue.parent) {
      related.parent = issue.parent;
    }
    
    // Extract related issues from issue links
    const relatedIssues = issue.issueLinks
      .map(link => link.outward || link.inward)
      .filter((key): key is string => key !== null);
    
    if (relatedIssues.length > 0) {
      related.linked_issues = relatedIssues;
    }

    return BaseFormatter.createMetadata({
      expansions: availableExpansions,
      related
    });
  }

  /**
   * Create a summary for an issue response
   */
  private static createIssueSummary(
    issue: JiraIssueDetails,
    transitions?: TransitionDetails[]
  ): ResponseSummary {
    const suggestedActions = [];
    
    // Add suggested actions based on available transitions
    if (transitions && transitions.length > 0) {
      // Common transitions to suggest
      const commonTransitions = ['Done', 'In Progress', 'To Do', 'Closed', 'Resolved'];
      
      for (const transitionName of commonTransitions) {
        const transition = transitions.find(t => t.name === transitionName);
        if (transition) {
          suggestedActions.push({
            text: `Move to ${transitionName}`,
            action_id: transition.id
          });
        }
      }
    }
    
    // Add assignment suggestion if not assigned
    if (!issue.assignee) {
      suggestedActions.push({
        text: 'Assign to team member'
      });
    }

    return BaseFormatter.createSummary({
      suggested_actions: suggestedActions
    });
  }
}
