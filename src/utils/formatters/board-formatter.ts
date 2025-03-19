import { BaseFormatter, FormattedResponse, ResponseMetadata, ResponseSummary } from './base-formatter.js';
import { BoardResponse, SprintResponse } from '../../types/index.js';

export interface BoardData extends BoardResponse {
  sprints?: SprintResponse[];
}

export interface BoardExpansionOptions {
  sprints?: boolean;
  issues?: boolean;
  configuration?: boolean;
}

export class BoardFormatter {
  /**
   * Format a board response with the standard structure and optional expansions
   * @param board The board data
   * @param options Expansion options
   * @returns A formatted board response
   */
  static formatBoard(
    board: BoardData,
    options: BoardExpansionOptions = {}
  ): FormattedResponse<BoardData> {
    // Create metadata with available expansions
    const metadata = this.createBoardMetadata(board, options);
    
    // Create summary
    const summary = this.createBoardSummary(board);

    return BaseFormatter.formatResponse(board, metadata, summary);
  }

  /**
   * Create metadata for a board response
   */
  private static createBoardMetadata(
    board: BoardData,
    options: BoardExpansionOptions
  ): ResponseMetadata {
    // Determine which expansions are available but not included
    const availableExpansions: string[] = [];
    
    if (!options.sprints && !board.sprints) {
      availableExpansions.push('sprints');
    }
    
    if (!options.issues) {
      availableExpansions.push('issues');
    }
    
    if (!options.configuration) {
      availableExpansions.push('configuration');
    }

    // Create related entities map
    const related: Record<string, string | string[]> = {};
    
    if (board.location?.projectId) {
      related.project = board.location.projectName || `Project ${board.location.projectId}`;
    }

    return BaseFormatter.createMetadata({
      expansions: availableExpansions,
      related
    });
  }

  /**
   * Create a summary for a board response
   */
  private static createBoardSummary(board: BoardData): ResponseSummary {
    const suggestedActions = [
      {
        text: `View all issues on ${board.name}`
      }
    ];

    // Add sprint-related actions if sprints are available
    if (board.sprints && board.sprints.length > 0) {
      const activeSprints = board.sprints.filter(sprint => sprint.state === 'active');
      if (activeSprints.length > 0) {
        suggestedActions.push({
          text: `View active sprint: ${activeSprints[0].name}`
        });
      }
    }

    return BaseFormatter.createSummary({
      suggested_actions: suggestedActions
    });
  }
}
