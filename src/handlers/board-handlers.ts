import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from '../client/jira-client.js';
import { BoardData, BoardExpansionOptions, BoardFormatter } from '../utils/formatters/index.js';
import { BoardResponse, SprintResponse } from '../types/index.js';

type GetBoardArgs = {
  boardId: number;
  expand?: string[];
};

type ListBoardsArgs = {
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
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

function isGetBoardArgs(args: unknown): args is GetBoardArgs {
  if (typeof args !== 'object' || args === null) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid get_jira_board arguments: Expected an object with a boardId parameter. Example: { "boardId": 123 } or { "board_id": 123 }`
    );
  }

  const normalizedArgs = normalizeArgs(args as Record<string, unknown>);
  
  if (typeof normalizedArgs.boardId !== 'number') {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Missing or invalid boardId parameter. Please provide a valid board ID as a number using either "boardId" or "board_id". Example: { "boardId": 123 }`
    );
  }
  
  // Validate expand parameter if present
  const typedArgs = normalizedArgs as GetBoardArgs;
  if (typedArgs.expand !== undefined) {
    if (!Array.isArray(typedArgs.expand)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid expand parameter. Expected an array of strings.'
      );
    }
    
    const validExpansions = ['sprints', 'issues', 'configuration'];
    for (const expansion of typedArgs.expand) {
      if (typeof expansion !== 'string' || !validExpansions.includes(expansion)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid expansion: ${expansion}. Valid expansions are: ${validExpansions.join(', ')}`
        );
      }
    }
  }
  
  return true;
}

function isListBoardsArgs(args: unknown): args is ListBoardsArgs {
  if (typeof args !== 'object' || args === null) {
    return false;
  }
  
  const normalizedArgs = normalizeArgs(args as Record<string, unknown>);
  
  if (normalizedArgs.includeSprints !== undefined && 
      typeof normalizedArgs.includeSprints !== 'boolean') {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid include_sprints parameter. Expected a boolean value.'
    );
  }
  
  return true;
}

export async function handleListBoards(client: JiraClient): Promise<BoardResponse[]> {
  return client.listBoards();
}

export async function handleListJiraSprints(client: JiraClient, args: unknown): Promise<SprintResponse[]> {
  const normalizedArgs = normalizeArgs(args as Record<string, unknown>);
  const boardId = normalizedArgs.boardId as number;
  
  if (typeof boardId !== 'number') {
    throw new McpError(ErrorCode.InvalidParams, 'Invalid sprint arguments. Board ID must be a number.');
  }
  
  return client.listBoardSprints(boardId);
}

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

  // Normalize arguments to support both snake_case and camelCase
  const normalizedArgs = normalizeArgs(args);

  switch (name) {
    case 'list_jira_boards': {
      console.error('Processing list_jira_boards request');
      try {
        if (!isListBoardsArgs(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid list_jira_boards arguments');
        }
        
        const includeSprints = normalizedArgs.include_sprints === true;
        
        // Get all boards
        const boards = await jiraClient.listBoards();
        
        // Convert to BoardData format
        const boardDataList: BoardData[] = boards.map(board => ({
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
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(formattedBoards, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error('Error in list_jira_boards:', error);
        if (error instanceof Error) {
          throw new McpError(ErrorCode.InvalidRequest, `Jira API error: ${error.message}`);
        }
        throw new McpError(ErrorCode.InvalidRequest, 'Failed to list boards');
      }
    }
    
    case 'get_jira_board': {
      console.error('Processing get_jira_board request');
      try {
        if (!isGetBoardArgs(normalizedArgs)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid get_jira_board arguments');
        }
        
        const boardId = normalizedArgs.boardId as number;
        
        // Parse expansion options
        const expansionOptions: BoardExpansionOptions = {};
        if (normalizedArgs.expand) {
          for (const expansion of normalizedArgs.expand as string[]) {
            expansionOptions[expansion as keyof BoardExpansionOptions] = true;
          }
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
      } catch (error) {
        console.error('Error in get_jira_board:', error);
        if (error instanceof Error) {
          throw new McpError(ErrorCode.InvalidRequest, `Jira API error: ${error.message}`);
        }
        throw new McpError(ErrorCode.InvalidRequest, 'Failed to get board');
      }
    }

    case 'list_jira_sprints': {
      console.error('Processing list_jira_sprints request');
      try {
        const sprints = await handleListJiraSprints(jiraClient, normalizedArgs);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(sprints, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error('Error in list_jira_sprints:', error);
        if (error instanceof Error) {
          throw new McpError(ErrorCode.InvalidRequest, `Jira API error: ${error.message}`);
        }
        throw new McpError(ErrorCode.InvalidRequest, 'Failed to list sprints');
      }
    }

    default: {
      console.error(`Unknown tool requested: ${name}`);
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  }
}
