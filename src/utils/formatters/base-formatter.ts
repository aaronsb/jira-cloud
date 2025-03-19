/**
 * Base formatter for consistent response structure across all entity types
 */

export interface ResponseMetadata {
  expansions?: string[];
  related?: Record<string, string | string[]>;
  pagination?: {
    startAt: number;
    maxResults: number;
    total: number;
    hasMore: boolean;
  };
}

export interface ResponseSummary {
  status_counts?: Record<string, number>;
  suggested_actions?: Array<{
    text: string;
    action_id?: string;
  }>;
}

export interface FormattedResponse<T> {
  data: T;
  _metadata?: ResponseMetadata;
  _summary?: ResponseSummary;
}

export class BaseFormatter {
  /**
   * Format a response with the standard structure
   * @param data The main data for the response
   * @param metadata Optional metadata about the response
   * @param summary Optional summary information
   * @returns A formatted response object
   */
  static formatResponse<T>(
    data: T,
    metadata?: ResponseMetadata,
    summary?: ResponseSummary
  ): FormattedResponse<T> {
    return {
      data,
      ...(metadata && { _metadata: metadata }),
      ...(summary && { _summary: summary }),
    };
  }

  /**
   * Create metadata for a response
   * @param options Metadata options
   * @returns Response metadata
   */
  static createMetadata(options: {
    expansions?: string[];
    related?: Record<string, string | string[]>;
    pagination?: {
      startAt: number;
      maxResults: number;
      total: number;
    };
  }): ResponseMetadata {
    const metadata: ResponseMetadata = {};

    if (options.expansions && options.expansions.length > 0) {
      metadata.expansions = options.expansions;
    }

    if (options.related && Object.keys(options.related).length > 0) {
      metadata.related = options.related;
    }

    if (options.pagination) {
      const { startAt, maxResults, total } = options.pagination;
      metadata.pagination = {
        startAt,
        maxResults,
        total,
        hasMore: startAt + maxResults < total,
      };
    }

    return metadata;
  }

  /**
   * Create a summary for a response
   * @param options Summary options
   * @returns Response summary
   */
  static createSummary(options: {
    status_counts?: Record<string, number>;
    suggested_actions?: Array<{
      text: string;
      action_id?: string;
    }>;
  }): ResponseSummary {
    const summary: ResponseSummary = {};

    if (options.status_counts && Object.keys(options.status_counts).length > 0) {
      summary.status_counts = options.status_counts;
    }

    if (options.suggested_actions && options.suggested_actions.length > 0) {
      summary.suggested_actions = options.suggested_actions;
    }

    return summary;
  }
}
