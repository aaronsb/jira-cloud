import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from '../client/jira-client.js';
import { BoardData, BoardExpansionOptions, BoardFormatter } from '../utils/formatters/index.js';
import { BoardResponse, SprintResponse } from '../types/index.js';

// Type definition for the consolidated board management tool
type ManageJiraBoardArgs = {
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'get_configuration';
  boardId?: number;
  name?: string;
  type?: 'scrum' | 'kanban';
  projectKey?: string;
  startAt?: number;
  maxResults?: number;
  expand?: string[];
  include_sprints?: boolean;
};

// Helper function to normalize parameter names (support both snake_case and camelCase)
function normalizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    // Convert snake_case to camelCase
    if (key === 'board_id') {
      normalized['boardId'] = value;
    } else if (key === 'include_sprints') {
      normalized['includeSprints'] = value;
    } else if (key === 'project_key') {
      normalized['projectKey'] = value;
    } else if (key === 'start_at') {
      normalized['startAt'] = value;
    } else if (key === 'max_results') {
      normalized['maxResults'] = value;
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

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
      !['get', 'list', 'create', 'update', 'delete', 'get_configuration'].includes(normalizedArgs.operation as string)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid operation parameter. Valid values are: get, list, create, update, delete, get_configuration'
    );
  }

  // Validate parameters based on operation
  switch (normalizedArgs.operation) {
    case 'get':
    case 'update':
    case 'delete':
    case 'get_configuration':
      if (typeof normalizedArgs.boardId !== 'number') {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Missing or invalid boardId parameter. Please provide a valid board ID as a number for the ${normalizedArgs.operation} operation.`
        );
      }
      break;
      
    case 'create':
      if (typeof normalizedArgs.name !== 'string' || normalizedArgs.name.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid name parameter. Please provide a valid board name for the create operation.'
        );
      }
      if (typeof normalizedArgs.type !== 'string' || !['scrum', 'kanban'].includes(normalizedArgs.type)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid type parameter. Please provide a valid board type (scrum or kanban) for the create operation.'
        );
      }
      if (typeof normalizedArgs.projectKey !== 'string' || normalizedArgs.projectKey.trim() === '') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing or invalid projectKey parameter. Please provide a valid project key for the create operation.'
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
  const expansionOptions: BoardExpansionOptions = {};
  if (args.expand) {
    for (const expansion of args.expand) {
      expansionOptions[expansion as keyof BoardExpansionOptions] = true;
    }
  }
  
  // If include_sprints is true, add sprints to expansions
  if (args.include_sprints === true) {
    expansionOptions.sprints = true;
  }
  
  // Get all boards and find the requested one
  const boards = await jiraClient.listBoards();
  const board = boards.find(b => b.id === boardId);
  
  if (!board) {
    throw new McpError(ErrorCode.InvalidRequest, `Board not found: ${boardId}`);
  }
  
  // Convert to BoardData format
  const boardData: BoardData = {
    ...board
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
  
  // Format the response
  const formattedResponse = BoardFormatter.formatBoard(boardData, expansionOptions);
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(formattedResponse, null, 2),
      },
    ],
  };
}

async function handleListBoards(jiraClient: JiraClient, args: ManageJiraBoardArgs) {
  // Set default pagination values
  const startAt = args.startAt !== undefined ? args.startAt : 0;
  const maxResults = args.maxResults !== undefined ? args.maxResults : 50;
  const includeSprints = args.include_sprints === true;
  
  // Get all boards
  const boards = await jiraClient.listBoards();
  
  // Apply pagination
  const paginatedBoards = boards.slice(startAt, startAt + maxResults);
  
  // Convert to BoardData format
  const boardDataList: BoardData[] = paginatedBoards.map(board => ({
    ...board
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
  
  // Format the response
  const formattedBoards = boardDataList.map(board => 
    BoardFormatter.formatBoard(board, { sprints: includeSprints })
  );
  
  // Create a response with pagination metadata
  const response = {
    data: formattedBoards,
    _metadata: {
      pagination: {
        startAt,
        maxResults,
        total: boards.length,
        hasMore: startAt + maxResults < boards.length,
      },
    },
  };
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}

async function handleCreateBoard(jiraClient: JiraClient, args: ManageJiraBoardArgs) {
  // Note: This is a placeholder. The current JiraClient doesn't have a createBoard method.
  // You would need to implement this in the JiraClient class.
  throw new McpError(
    ErrorCode.InternalError,
    'Create board operation is not yet implemented'
  );

  // When implemented, it would look something like this:
  /*
  const result = await jiraClient.createBoard({
    name: args.name!,
    type: args.type!,
    projectKey: args.projectKey!
  });
  
  // Get the created board to return
  const createdBoard = await jiraClient.getBoard(result.id);
  const formattedResponse = BoardFormatter.formatBoard(createdBoard);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(formattedResponse, null, 2),
      },
    ],
  };
  */
}

async function handleUpdateBoard(jiraClient: JiraClient, args: ManageJiraBoardArgs) {
  // Note: This is a placeholder. The current JiraClient doesn't have an updateBoard method.
  // You would need to implement this in the JiraClient class.
  throw new McpError(
    ErrorCode.InternalError,
    'Update board operation is not yet implemented'
  );

  // When implemented, it would look something like this:
  /*
  await jiraClient.updateBoard(
    args.boardId!,
    args.name
  );

  // Get the updated board to return
  const updatedBoard = await jiraClient.getBoard(args.boardId!);
  const formattedResponse = BoardFormatter.formatBoard(updatedBoard);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(formattedResponse, null, 2),
      },
    ],
  };
  */
}

async function handleDeleteBoard(jiraClient: JiraClient, args: ManageJiraBoardArgs) {
  // Note: This is a placeholder. The current JiraClient doesn't have a deleteBoard method.
  // You would need to implement this in the JiraClient class.
  throw new McpError(
    ErrorCode.InternalError,
    'Delete board operation is not yet implemented'
  );

  // When implemented, it would look something like this:
  /*
  await jiraClient.deleteBoard(args.boardId!);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: `Board ${args.boardId} has been deleted successfully.`,
        }, null, 2),
      },
    ],
  };
  */
}

async function handleGetBoardConfiguration(jiraClient: JiraClient, args: ManageJiraBoardArgs) {
  // Note: This is a placeholder. The current JiraClient doesn't have a getBoardConfiguration method.
  // You would need to implement this in the JiraClient class.
  throw new McpError(
    ErrorCode.InternalError,
    'Get board configuration operation is not yet implemented'
  );

  // When implemented, it would look something like this:
  /*
  const configuration = await jiraClient.getBoardConfiguration(args.boardId!);
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(configuration, null, 2),
      },
    ],
  };
  */
}


// Main handler function
export async function setupBoardHandlers(
  server: Server,
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
      
      case 'create': {
        console.error('Processing create board operation');
        return await handleCreateBoard(jiraClient, normalizedArgs as ManageJiraBoardArgs);
      }
      
      case 'update': {
        console.error('Processing update board operation');
        return await handleUpdateBoard(jiraClient, normalizedArgs as ManageJiraBoardArgs);
      }
      
      case 'delete': {
        console.error('Processing delete board operation');
        return await handleDeleteBoard(jiraClient, normalizedArgs as ManageJiraBoardArgs);
      }
      
      case 'get_configuration': {
        console.error('Processing get board configuration operation');
        return await handleGetBoardConfiguration(jiraClient, normalizedArgs as ManageJiraBoardArgs);
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
