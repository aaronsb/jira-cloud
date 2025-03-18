import { BaseFormatter, FormattedResponse, ResponseMetadata, ResponseSummary } from './base-formatter.js';

export interface ProjectData {
  id: string;
  key: string;
  name: string;
  description: string | null;
  lead: string | null;
  url: string;
  status_counts?: Record<string, number>;
  boards?: any[];
  recent_issues?: any[];
}

export interface ProjectExpansionOptions {
  boards?: boolean;
  components?: boolean;
  versions?: boolean;
  recent_issues?: boolean;
}

export class ProjectFormatter {
  /**
   * Format a project response with the standard structure and optional expansions
   * @param project The project data
   * @param options Expansion options
   * @returns A formatted project response
   */
  static formatProject(
    project: ProjectData,
    options: ProjectExpansionOptions = {}
  ): FormattedResponse<ProjectData> {
    // Create metadata with available expansions
    const metadata = this.createProjectMetadata(project, options);
    
    // Create summary with status counts
    const summary = this.createProjectSummary(project);

    return BaseFormatter.formatResponse(project, metadata, summary);
  }

  /**
   * Create metadata for a project response
   */
  private static createProjectMetadata(
    project: ProjectData,
    options: ProjectExpansionOptions
  ): ResponseMetadata {
    // Determine which expansions are available but not included
    const availableExpansions: string[] = [];
    
    if (!options.boards) {
      availableExpansions.push('boards');
    }
    
    if (!options.components) {
      availableExpansions.push('components');
    }
    
    if (!options.versions) {
      availableExpansions.push('versions');
    }
    
    if (!options.recent_issues) {
      availableExpansions.push('recent_issues');
    }

    return BaseFormatter.createMetadata({
      expansions: availableExpansions
    });
  }

  /**
   * Create a summary for a project response
   */
  private static createProjectSummary(project: ProjectData): ResponseSummary {
    const suggestedActions = [
      {
        text: `View all issues in ${project.key}`
      },
      {
        text: `Create issue in ${project.key}`
      }
    ];

    return BaseFormatter.createSummary({
      status_counts: project.status_counts,
      suggested_actions: suggestedActions
    });
  }
}
