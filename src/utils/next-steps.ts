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
        { description: 'Read jira://custom-fields to discover available custom fields for this instance' },
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
        { description: 'Read jira://custom-fields to discover available custom fields for this instance' },
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
    case 'worklog':
      steps.push(
        { description: 'View the updated issue', tool: 'manage_jira_issue', example: { operation: 'get', issueKey } },
        { description: 'Log more time', tool: 'manage_jira_issue', example: { operation: 'worklog', issueKey, timeSpent: '<duration>' } },
        { description: 'Adjust the remaining estimate', tool: 'manage_jira_issue', example: { operation: 'update', issueKey, remainingEstimate: '<duration>' } },
      );
      break;
    case 'hierarchy':
      steps.push(
        { description: 'View a specific issue from the tree', tool: 'manage_jira_issue', example: { operation: 'get', issueKey } },
        { description: 'Analyze plan rollups (requires Jira Plans)', tool: 'manage_jira_plan', example: { issueKey } },
        { description: 'Search for issues in this project', tool: 'manage_jira_filter', example: { operation: 'execute_jql', jql: `project = "${issueKey?.split('-')[0]}"` } },
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
        { description: 'Run analysis against this filter', tool: 'analyze_jira_issues', example: { filterId, metrics: ['summary'], groupBy: 'assignee' } },
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
        { description: 'Create an issue in this project (use issue types shown above)', tool: 'manage_jira_issue', example: { operation: 'create', projectKey, summary: '<title>', issueType: '<type from list above>' } },
        { description: 'Search issues in this project', tool: 'manage_jira_filter', example: { operation: 'execute_jql', jql: `project = ${projectKey}` } },
        { description: 'View project boards', tool: 'manage_jira_board', example: { operation: 'list' } },
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

export function planNextSteps(issueKey: string, mode?: string, conflicts?: import('../types/index.js').RollupConflict[], rollup?: import('../types/index.js').RollupResult): string {
  const steps: NextStep[] = [];
  steps.push(
    { description: 'View the issue details', tool: 'manage_jira_issue', example: { operation: 'get', issueKey } },
    { description: 'Explore the hierarchy tree', tool: 'manage_jira_issue', example: { operation: 'hierarchy', issueKey } },
  );
  if (mode !== 'gaps') {
    steps.push({ description: 'Check for data gaps and conflicts', tool: 'manage_jira_plan', example: { issueKey, mode: 'gaps' } });
  }
  if (mode !== 'timeline') {
    steps.push({ description: 'View the timeline', tool: 'manage_jira_plan', example: { issueKey, mode: 'timeline' } });
  }
  steps.push(
    { description: 'Run flat metrics on children', tool: 'analyze_jira_issues', example: { jql: `parent = ${issueKey}`, metrics: ['summary'], groupBy: 'assignee' } },
  );

  let result = formatSteps(steps);

  // Append conflict fix operations if conflicts exist
  if (conflicts && conflicts.length > 0 && rollup) {
    result += conflictFixSteps(conflicts, rollup);
  }

  return result;
}

export function conflictFixSteps(conflicts: import('../types/index.js').RollupConflict[], rollup: import('../types/index.js').RollupResult): string {
  const fixOps: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const lines: string[] = ['\n\n**Conflict fixes:**'];

  for (const conflict of conflicts) {
    switch (conflict.type) {
      case 'due_date':
        if (rollup.rolledUpEnd) {
          lines.push(`- Update ${conflict.issueKey} due date to ${rollup.rolledUpEnd} — \`manage_jira_issue\` \`{ operation: "update", issueKey: "${conflict.issueKey}", dueDate: "${rollup.rolledUpEnd}" }\``);
          fixOps.push({ tool: 'manage_jira_issue', args: { operation: 'update', issueKey: conflict.issueKey, dueDate: rollup.rolledUpEnd } });
        }
        break;
      case 'start_date':
        if (rollup.rolledUpStart) {
          lines.push(`- Update ${conflict.issueKey} start date to ${rollup.rolledUpStart} — read \`jira://custom-fields\` to find the start date field ID, then use \`manage_jira_issue update\``);
          // Don't auto-generate queue op for start date — field ID is instance-specific
        }
        break;
      case 'resolved_with_open_children':
        lines.push(`- ${conflict.issueKey}: ${conflict.message} — reopen parent or resolve open children (use \`manage_jira_issue get\` with \`expand: ["transitions"]\` to find transition IDs)`);
        break;
    }
  }

  if (fixOps.length > 0) {
    lines.push('');
    lines.push('**Fix all date conflicts in one call:**');
    lines.push(`\`queue_jira_operations\` — \`${JSON.stringify({ operations: fixOps.map(op => ({ ...op, onError: 'continue' })) })}\``);
  }

  return lines.join('\n');
}

export function goalNextSteps(operation: string, goalKey?: string, workItemCount?: number): string {
  const steps: NextStep[] = [];
  switch (operation) {
    case 'list_goals':
      steps.push(
        { description: 'Get detail on a specific goal', tool: 'manage_jira_plan', example: { operation: 'get_goal', goalKey: 'GOAL-KEY' } },
        { description: 'Analyze a goal\'s linked issues', tool: 'manage_jira_plan', example: { operation: 'analyze', goalKey: 'GOAL-KEY' } },
      );
      break;
    case 'get_goal':
      if (goalKey && workItemCount && workItemCount > 0) {
        steps.push(
          { description: 'Analyze this goal\'s linked issues', tool: 'manage_jira_plan', example: { operation: 'analyze', goalKey } },
        );
      }
      steps.push(
        { description: 'Search for more goals', tool: 'manage_jira_plan', example: { operation: 'list_goals', searchString: '' } },
      );
      break;
    case 'analyze':
      if (goalKey) {
        steps.push(
          { description: 'View goal detail', tool: 'manage_jira_plan', example: { operation: 'get_goal', goalKey } },
          { description: 'Update goal status', tool: 'manage_jira_plan', example: { operation: 'update_goal_status', goalKey, status: 'on_track', summary: 'Progress update' } },
        );
      }
      break;
    case 'create_goal':
    case 'update_goal':
    case 'update_goal_status':
      if (goalKey) {
        steps.push(
          { description: 'View updated goal', tool: 'manage_jira_plan', example: { operation: 'get_goal', goalKey } },
        );
      }
      break;
    case 'link_work_item':
    case 'unlink_work_item':
      if (goalKey) {
        steps.push(
          { description: 'View goal with updated links', tool: 'manage_jira_plan', example: { operation: 'get_goal', goalKey } },
          { description: 'Analyze goal progress', tool: 'manage_jira_plan', example: { operation: 'analyze', goalKey } },
        );
      }
      break;
  }
  return steps.length > 0 ? formatSteps(steps) : '';
}

export function analysisNextSteps(jql: string, issueKeys: string[], truncated = false, groupBy?: string, filterSource?: string): string {
  const steps: NextStep[] = [];
  if (issueKeys.length > 0) {
    steps.push(
      { description: 'Get details on a specific issue', tool: 'manage_jira_issue', example: { operation: 'get', issueKey: issueKeys[0] } },
    );
  }

  // Contextual cross-dimension suggestions based on groupBy
  if (groupBy === 'assignee') {
    steps.push(
      { description: 'Break down a person\'s workload by status (active vs backlog vs review)', tool: 'analyze_jira_issues', example: { jql: `${jql} AND assignee = "<name>"`, metrics: ['summary'], groupBy: 'issuetype' } },
      { description: 'Compare workload health with computed metrics', tool: 'analyze_jira_issues', example: { jql, metrics: ['summary'], groupBy: 'assignee', compute: ['overdue_pct = overdue / open * 100', 'stale_pct = stale / open * 100'] } },
    );
  } else if (groupBy === 'issuetype' || groupBy === 'priority') {
    steps.push(
      { description: 'See who owns these issues', tool: 'analyze_jira_issues', example: { jql, metrics: ['summary'], groupBy: 'assignee' } },
    );
  } else if (groupBy === 'project') {
    steps.push(
      { description: 'Drill into a project by assignee', tool: 'analyze_jira_issues', example: { jql: `${jql} AND project = <KEY>`, metrics: ['summary'], groupBy: 'assignee' } },
    );
  }

  steps.push(
    { description: 'Discover dimensions for cube analysis', tool: 'analyze_jira_issues', example: { jql, metrics: ['cube_setup'] } },
    { description: 'Add computed columns', tool: 'analyze_jira_issues', example: { jql, metrics: ['summary'], groupBy: 'project', compute: ['bug_pct = bugs / total * 100'] } },
    { description: 'Narrow the analysis with refined JQL', tool: 'analyze_jira_issues', example: { jql: `${jql} AND priority = High` } },
    { description: 'View the full issue list', tool: 'manage_jira_filter', example: { operation: 'execute_jql', jql } },
  );
  if (truncated) {
    steps.push(
      { description: 'Distribution counts above are approximate (issue cap hit). For exact breakdowns use summary + groupBy', tool: 'analyze_jira_issues', example: { jql, metrics: ['summary'], groupBy: 'assignee' } },
      { description: 'Or narrow JQL for precise detail metrics', tool: 'analyze_jira_issues', example: { jql: `${jql} AND assignee = currentUser()`, metrics: ['cycle'] } },
    );
  }
  // Suggest plan analysis when issue keys suggest hierarchical structure
  if (issueKeys.length > 0) {
    steps.push(
      { description: 'Analyze plan rollups for a parent issue (requires Jira Plans)', tool: 'manage_jira_plan', example: { issueKey: issueKeys[0] } },
    );
  }
  // Suggest saving as filter if not already using one
  if (!filterSource) {
    steps.push(
      { description: 'Save this query as a filter for reuse across analyses', tool: 'manage_jira_filter', example: { operation: 'create', name: '<descriptive name>', jql } },
    );
  }
  return formatSteps(steps) + '\n- Read `jira://analysis/recipes` for data cube patterns and compute DSL examples';
}
