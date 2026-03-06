import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from '../client/jira-client.js';
import { MarkdownRenderer, BoardData } from '../mcp/markdown-renderer.js';
import { boardNextSteps } from '../utils/next-steps.js';
import { normalizeArgs } from '../utils/normalize-args.js';

type ManageJiraBoardArgs = {
  operation: 'get' | 'list';
  boardId?: number;
  startAt?: number;
  maxResults?: number;
  expand?: string[];
  includeSprints?: boolean;
};

// Validate the consolidated board management arguments
function validateManageJiraBoardArgs(args: unknown): args is ManageJiraBoardArgs {
  if (typeof args !== 'object' || args === null) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid manage_jira_board arguments: Expected an object with an operation parameter'
    );
  }

  const normalizedArgs = normalizeArgs(args as Record<string, unknown>);
  
  // Validate operation parameter
  if (typeof normalizedArgs.operation !== 'string' || 
      !['get', 'list'].includes(normalizedArgs.operation as string)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid operation parameter. Valid values are: get, list'
    );
  }

  // Validate parameters based on operation
  switch (normalizedArgs.operation) {
    case 'get':
      if (typeof normalizedArgs.boardId !== 'number') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid boardId parameter. Please provide a valid board ID as a number for the get operation.'
        );
      }
      break;
  }

  // Validate pagination parameters for list operation
  if (normalizedArgs.operation === 'list') {
    if (normalizedArgs.startAt !== undefined && typeof normalizedArgs.startAt !== 'number') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid startAt parameter. Please provide a valid number.'
      );
    }

    if (normalizedArgs.maxResults !== undefined && typeof normalizedArgs.maxResults !== 'number') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid maxResults parameter. Please provide a valid number.'
      );
    }
  }

  // Validate expand parameter
  if (normalizedArgs.expand !== undefined) {
    if (!Array.isArray(normalizedArgs.expand)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid expand parameter. Expected an array of strings.'
      );
    }
    
    const validExpansions = ['sprints', 'issues', 'configuration'];
    for (const expansion of normalizedArgs.expand) {
      if (typeof expansion !== 'string' || !validExpansions.includes(expansion)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid expansion: ${expansion}. Valid expansions are: ${validExpansions.join(', ')}`
        );
      }
    }
  }

  // Validate include_sprints parameter
  if (normalizedArgs.includeSprints !== undefined && typeof normalizedArgs.includeSprints !== 'boolean') {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid include_sprints parameter. Expected a boolean value.'
    );
  }

  return true;
}

// Handler functions for each operation
async function handleGetBoard(jiraClient: JiraClient, args: ManageJiraBoardArgs) {
  const boardId = args.boardId!;
  
  // Parse expansion options
  const expansionOptions: Record<string, boolean> = {};
  if (args.expand) {
    for (const expansion of args.expand) {
      expansionOptions[expansion] = true;
    }
  }
  
  // If include_sprints is true, add sprints to expansions
  if (args.includeSprints === true) {
    expansionOptions.sprints = true;
  }
  
  // Get all boards and find the requested one
  const boards = await jiraClient.listBoards();
  const board = boards.find((b: { id: number }) => b.id === boardId);
  
  if (!board) {
    throw new McpError(ErrorCode.InvalidRequest, `Board not found: ${boardId}`);
  }
  
  // Convert to BoardData format
  const boardData: BoardData = {
    id: board.id,
    name: board.name,
    type: board.type,
    projectName: board.location?.projectName,
  };

  // Handle expansions
  if (expansionOptions.sprints) {
    try {
      // Get sprints for this board
      const sprints = await jiraClient.listBoardSprints(boardId);

      // Add sprints to the response
      boardData.sprints = sprints;
    } catch (error) {
      console.error(`Error getting sprints for board ${boardId}:`, error);
      // Continue even if sprints fail
    }
  }

  // Render to markdown
  const markdown = MarkdownRenderer.renderBoard({
    id: boardData.id,
    name: boardData.name,
    type: boardData.type,
    projectName: boardData.projectName,
    sprints: boardData.sprints?.map((s: { id: number; name: string; state: string; goal?: string }) => ({
      id: s.id,
      name: s.name,
      state: s.state,
      goal: s.goal,
    })),
  });

  return {
    content: [
      {
        type: 'text',
        text: markdown + boardNextSteps('get', boardId),
      },
    ],
  };
}

async function handleListBoards(jiraClient: JiraClient, args: ManageJiraBoardArgs) {
  // Set default pagination values
  const startAt = args.startAt !== undefined ? args.startAt : 0;
  const maxResults = args.maxResults !== undefined ? args.maxResults : 50;
  const includeSprints = args.includeSprints === true;
  
  // Get all boards
  const boards = await jiraClient.listBoards();
  
  // Apply pagination
  const paginatedBoards = boards.slice(startAt, startAt + maxResults);
  
  // Convert to BoardData format
  const boardDataList: BoardData[] = paginatedBoards.map(board => ({
    id: board.id,
    name: board.name,
    type: board.type,
    projectName: board.location?.projectName,
  }));

  // If sprints are requested, get them for each board
  if (includeSprints) {
    // This would be more efficient with a batch API call, but for now we'll do it sequentially
    for (const board of boardDataList) {
      try {
        // Get active sprints for this board
        const sprints = await jiraClient.listBoardSprints(board.id);

        // Add sprints to the board data
        board.sprints = sprints;
      } catch (error) {
        console.error(`Error getting sprints for board ${board.id}:`, error);
        // Continue with other boards even if one fails
      }
    }
  }

  // Convert to markdown renderer format
  const rendererBoards = boardDataList.map(board => ({
    id: board.id,
    name: board.name,
    type: board.type,
    projectName: board.projectName,
    sprints: board.sprints?.map((s: { id: number; name: string; state: string; goal?: string }) => ({
      id: s.id,
      name: s.name,
      state: s.state,
      goal: s.goal,
    })),
  }));

  // Render to markdown with pagination
  let markdown = MarkdownRenderer.renderBoardList(rendererBoards);

  // Add pagination guidance
  markdown += '\n\n---\n';
  if (startAt + maxResults < boards.length) {
    markdown += `Showing ${startAt + 1}-${startAt + boardDataList.length} of ${boards.length}\n`;
    markdown += `**Next page:** Use startAt=${startAt + maxResults}`;
  } else {
    markdown += `Showing all ${boardDataList.length} board${boardDataList.length !== 1 ? 's' : ''}`;
  }

  markdown += boardNextSteps('list');

  return {
    content: [
      {
        type: 'text',
        text: markdown,
      },
    ],
  };
}


// Main handler function
export async function handleBoardRequest(
  jiraClient: JiraClient,
  request: {
    params: {
      name: string;
      arguments?: Record<string, unknown>;
    };
  }
) {
  console.error('Handling board request...');
  const { name } = request.params;
  const args = request.params.arguments || {};


  // Handle the consolidated board management tool
  if (name === 'manage_jira_board') {
    // Normalize arguments to support both snake_case and camelCase
    const normalizedArgs = normalizeArgs(args);
    
    // Validate arguments
    if (!validateManageJiraBoardArgs(normalizedArgs)) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid manage_jira_board arguments');
    }

    // Process the operation
    switch (normalizedArgs.operation) {
      case 'get': {
        console.error('Processing get board operation');
        return await handleGetBoard(jiraClient, normalizedArgs as ManageJiraBoardArgs);
      }
      
      case 'list': {
        console.error('Processing list boards operation');
        return await handleListBoards(jiraClient, normalizedArgs as ManageJiraBoardArgs);
      }
      
      default: {
        console.error(`Unknown operation: ${normalizedArgs.operation}`);
        throw new McpError(ErrorCode.MethodNotFound, `Unknown operation: ${normalizedArgs.operation}`);
      }
    }
  }

  console.error(`Unknown tool requested: ${name}`);
  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
}
