import { BaseFormatter, FormattedResponse, ResponseMetadata, ResponseSummary } from './base-formatter.js';
import { JiraIssueDetails, SearchPagination } from '../../types/index.js';

export interface SearchResultData {
  issues: JiraIssueDetails[];
  pagination: SearchPagination;
}

export interface SearchExpansionOptions {
  issue_details?: boolean;
  transitions?: boolean;
  comments_preview?: boolean;
}

export class SearchFormatter {
  /**
   * Format a search response with the standard structure and optional expansions
   * @param searchResult The search result data
   * @param options Expansion options
   * @returns A formatted search response
   */
  static formatSearchResult(
    searchResult: SearchResultData,
    options: SearchExpansionOptions = {}
  ): FormattedResponse<SearchResultData> {
    // Create metadata with available expansions and pagination
    const metadata = this.createSearchMetadata(searchResult, options);
    
    // Create summary with status counts
    const summary = this.createSearchSummary(searchResult);

    return BaseFormatter.formatResponse(searchResult, metadata, summary);
  }

  /**
   * Create metadata for a search response
   */
  private static createSearchMetadata(
    searchResult: SearchResultData,
    options: SearchExpansionOptions
  ): ResponseMetadata {
    // Determine which expansions are available but not included
    const availableExpansions: string[] = [];
    
    if (!options.issue_details) {
      availableExpansions.push('issue_details');
    }
    
    if (!options.transitions) {
      availableExpansions.push('transitions');
    }
    
    if (!options.comments_preview) {
      availableExpansions.push('comments_preview');
    }

    return BaseFormatter.createMetadata({
      expansions: availableExpansions,
      pagination: {
        startAt: searchResult.pagination.startAt,
        maxResults: searchResult.pagination.maxResults,
        total: searchResult.pagination.total
      }
    });
  }

  /**
   * Create a summary for a search response
   */
  private static createSearchSummary(searchResult: SearchResultData): ResponseSummary {
    // Count issues by status
    const statusCounts: Record<string, number> = {};
    
    for (const issue of searchResult.issues) {
      const status = issue.status;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }

    const suggestedActions = [];
    
    // Add pagination actions if there are more results
    if (searchResult.pagination.hasMore) {
      suggestedActions.push({
        text: 'Load more results'
      });
    }

    return BaseFormatter.createSummary({
      status_counts: statusCounts,
      suggested_actions: suggestedActions
    });
  }
}
