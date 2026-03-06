/**
 * Generates contextual next-step suggestions for LLM callers.
 * Appended to handler responses to guide multi-step workflows.
 */

type NextStep = { tool?: string; description: string; example?: Record<string, unknown> };

function formatSteps(steps: NextStep[]): string {
  const lines = ['\n---\n**Next steps:**'];
  for (const step of steps) {
    const tool = step.tool ? `\`${step.tool}\`` : '';
    const example = step.example ? ` — \`${JSON.stringify(step.example)}\`` : '';
    lines.push(`- ${step.description}${tool ? ` using ${tool}` : ''}${example}`);
  }
  return lines.join('\n');
}

export function issueNextSteps(operation: string, issueKey?: string): string {
  const steps: NextStep[] = [];
  switch (operation) {
    case 'create':
      steps.push(
        { description: 'Transition to a new status', tool: 'manage_jira_issue', example: { operation: 'transition', issueKey, expand: ['transitions'] } },
        { description: 'Add to a sprint', tool: 'manage_jira_sprint', example: { operation: 'manage_issues', sprintId: '<id>', add: [issueKey] } },
        { description: 'Link to a related issue', tool: 'manage_jira_issue', example: { operation: 'link', issueKey, linkedIssueKey: '<key>', linkType: 'relates to' } },
      );
      break;
    case 'get':
      steps.push(
        { description: 'Update fields', tool: 'manage_jira_issue', example: { operation: 'update', issueKey } },
        { description: 'Add a comment', tool: 'manage_jira_issue', example: { operation: 'comment', issueKey, comment: '<text>' } },
        { description: 'View available transitions', tool: 'manage_jira_issue', example: { operation: 'get', issueKey, expand: ['transitions'] } },
      );
      break;
    case 'update':
      steps.push(
        { description: 'View the updated issue', tool: 'manage_jira_issue', example: { operation: 'get', issueKey } },
        { description: 'Transition to a new status', tool: 'manage_jira_issue', example: { operation: 'get', issueKey, expand: ['transitions'] } },
      );
      break;
    case 'transition':
      steps.push(
        { description: 'Add a comment about the status change', tool: 'manage_jira_issue', example: { operation: 'comment', issueKey, comment: '<text>' } },
        { description: 'View available transitions', tool: 'manage_jira_issue', example: { operation: 'get', issueKey, expand: ['transitions'] } },
      );
      break;
    case 'comment':
      steps.push(
        { description: 'Transition the issue', tool: 'manage_jira_issue', example: { operation: 'get', issueKey, expand: ['transitions'] } },
        { description: 'Update issue fields', tool: 'manage_jira_issue', example: { operation: 'update', issueKey } },
      );
      break;
    case 'delete':
      steps.push(
        { description: 'Search for related issues', tool: 'manage_jira_filter', example: { operation: 'execute_jql', jql: `issue in linkedIssues("${issueKey}")` } },
      );
      break;
    case 'move':
      steps.push(
        { description: 'View the moved issue', tool: 'manage_jira_issue', example: { operation: 'get', issueKey } },
        { description: 'Update fields for the new project context', tool: 'manage_jira_issue', example: { operation: 'update', issueKey } },
      );
      break;
    case 'link':
      steps.push(
        { description: 'View the linked issue', tool: 'manage_jira_issue', example: { operation: 'get', issueKey } },
        { description: 'Read available link types from jira://issue-link-types resource' },
      );
      break;
  }
  return steps.length > 0 ? formatSteps(steps) : '';
}

export function filterNextSteps(operation: string, filterId?: string, jql?: string): string {
  const steps: NextStep[] = [];
  switch (operation) {
    case 'execute_jql':
    case 'execute_filter':
      steps.push(
        { description: 'Get details on a specific issue', tool: 'manage_jira_issue', example: { operation: 'get', issueKey: '<key>', expand: ['transitions'] } },
        { description: 'Refine the search with additional JQL clauses', tool: 'manage_jira_filter', example: { operation: 'execute_jql', jql: '<refined query>' } },
      );
      if (operation === 'execute_jql' && jql) {
        steps.push(
          { description: 'Save this query as a filter', tool: 'manage_jira_filter', example: { operation: 'create', name: '<name>', jql } },
        );
      }
      break;
    case 'get':
      steps.push(
        { description: 'Run this filter', tool: 'manage_jira_filter', example: { operation: 'execute_filter', filterId } },
        { description: 'Update the filter', tool: 'manage_jira_filter', example: { operation: 'update', filterId } },
      );
      break;
    case 'list':
      steps.push(
        { description: 'Run a filter', tool: 'manage_jira_filter', example: { operation: 'execute_filter', filterId: '<id>' } },
        { description: 'Search with JQL directly', tool: 'manage_jira_filter', example: { operation: 'execute_jql', jql: '<query>' } },
      );
      break;
    case 'create':
      steps.push(
        { description: 'Execute the new filter', tool: 'manage_jira_filter', example: { operation: 'execute_filter', filterId } },
      );
      break;
  }
  return steps.length > 0 ? formatSteps(steps) : '';
}

export function sprintNextSteps(operation: string, sprintId?: number, boardId?: number, state?: string): string {
  const steps: NextStep[] = [];
  switch (operation) {
    case 'create':
      steps.push(
        { description: 'Add issues to the sprint', tool: 'manage_jira_sprint', example: { operation: 'manage_issues', sprintId, add: ['<issueKey>'] } },
        { description: 'Start the sprint', tool: 'manage_jira_sprint', example: { operation: 'update', sprintId, state: 'active' } },
      );
      break;
    case 'list':
      steps.push(
        { description: 'Get sprint details', tool: 'manage_jira_sprint', example: { operation: 'get', sprintId: '<id>', expand: ['issues'] } },
        { description: 'Create a new sprint', tool: 'manage_jira_sprint', example: { operation: 'create', boardId, name: '<name>' } },
      );
      break;
    case 'get':
      steps.push(
        { description: 'Add or remove issues', tool: 'manage_jira_sprint', example: { operation: 'manage_issues', sprintId, add: ['<issueKey>'] } },
      );
      if (state === 'future') {
        steps.push({ description: 'Start the sprint', tool: 'manage_jira_sprint', example: { operation: 'update', sprintId, state: 'active' } });
      } else if (state === 'active') {
        steps.push({ description: 'Close the sprint', tool: 'manage_jira_sprint', example: { operation: 'update', sprintId, state: 'closed' } });
      }
      break;
    case 'manage_issues':
      steps.push(
        { description: 'View sprint issues', tool: 'manage_jira_sprint', example: { operation: 'get', sprintId, expand: ['issues'] } },
      );
      if (state === 'future') {
        steps.push({ description: 'Start the sprint', tool: 'manage_jira_sprint', example: { operation: 'update', sprintId, state: 'active' } });
      }
      break;
    case 'update':
      if (state === 'active') {
        steps.push(
          { description: 'View sprint issues', tool: 'manage_jira_sprint', example: { operation: 'get', sprintId, expand: ['issues'] } },
          { description: 'Close the sprint when done', tool: 'manage_jira_sprint', example: { operation: 'update', sprintId, state: 'closed' } },
        );
      } else if (state === 'closed') {
        steps.push(
          { description: 'Create the next sprint', tool: 'manage_jira_sprint', example: { operation: 'create', boardId, name: '<name>' } },
        );
      }
      break;
  }
  return steps.length > 0 ? formatSteps(steps) : '';
}

export function projectNextSteps(operation: string, projectKey?: string): string {
  const steps: NextStep[] = [];
  switch (operation) {
    case 'list':
      steps.push(
        { description: 'Get project details', tool: 'manage_jira_project', example: { operation: 'get', projectKey: '<key>' } },
        { description: 'Search issues in a project', tool: 'manage_jira_filter', example: { operation: 'execute_jql', jql: `project = <key>` } },
      );
      break;
    case 'get':
      steps.push(
        { description: 'Search issues in this project', tool: 'manage_jira_filter', example: { operation: 'execute_jql', jql: `project = ${projectKey}` } },
        { description: 'View project boards', tool: 'manage_jira_board', example: { operation: 'list' } },
        { description: `Read jira://projects/${projectKey}/overview for additional context` },
      );
      break;
  }
  return steps.length > 0 ? formatSteps(steps) : '';
}

export function boardNextSteps(operation: string, boardId?: number): string {
  const steps: NextStep[] = [];
  switch (operation) {
    case 'list':
      steps.push(
        { description: 'Get board details', tool: 'manage_jira_board', example: { operation: 'get', boardId: '<id>', expand: ['sprints'] } },
      );
      break;
    case 'get':
      steps.push(
        { description: 'View board sprints', tool: 'manage_jira_sprint', example: { operation: 'list', boardId } },
        { description: `Read board overview resource at jira://boards/${boardId}/overview` },
      );
      break;
  }
  return steps.length > 0 ? formatSteps(steps) : '';
}
