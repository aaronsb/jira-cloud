import { FilterResponse } from '../../types/index.js';
import { BaseFormatter, FormattedResponse, ResponseMetadata, ResponseSummary } from './base-formatter.js';

export interface FilterData extends FilterResponse {
  issueCount?: number;
}

export interface FilterExpansionOptions {
  jql?: boolean;
  description?: boolean;
  permissions?: boolean;
  issue_count?: boolean;
}

export class FilterFormatter {
  /**
   * Format a filter response with the standard structure and optional expansions
   * @param filter The filter data
   * @param options Expansion options
   * @returns A formatted filter response
   */
  static formatFilter(
    filter: FilterData,
    options: FilterExpansionOptions = {}
  ): FormattedResponse<FilterData> {
    // Create metadata with available expansions
    const metadata = this.createFilterMetadata(filter, options);
    
    // Create summary
    const summary = this.createFilterSummary(filter);

    return BaseFormatter.formatResponse(filter, metadata, summary);
  }

  /**
   * Create metadata for a filter response
   */
  private static createFilterMetadata(
    filter: FilterData,
    options: FilterExpansionOptions
  ): ResponseMetadata {
    // Determine which expansions are available but not included
    const availableExpansions: string[] = [];
    
    if (!options.jql && !filter.jql) {
      availableExpansions.push('jql');
    }
    
    if (!options.description && !filter.description) {
      availableExpansions.push('description');
    }
    
    if (!options.permissions && !filter.sharePermissions) {
      availableExpansions.push('permissions');
    }
    
    if (!options.issue_count && filter.issueCount === undefined) {
      availableExpansions.push('issue_count');
    }

    // Create related entities map
    const related: Record<string, string | string[]> = {
      owner: filter.owner
    };

    return BaseFormatter.createMetadata({
      expansions: availableExpansions,
      related
    });
  }

  /**
   * Create a summary for a filter response
   */
  private static createFilterSummary(filter: FilterData): ResponseSummary {
    const suggestedActions = [
      {
        text: `View filter results: ${filter.name}`
      }
    ];

    if (filter.jql) {
      suggestedActions.push({
        text: `Edit JQL: ${filter.name}`
      });
    }

    if (!filter.favourite) {
      suggestedActions.push({
        text: `Add to favorites`
      });
    }

    return BaseFormatter.createSummary({
      suggested_actions: suggestedActions
    });
  }
}
