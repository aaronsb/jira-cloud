import { JiraClient } from '../client/jira-client.js';
import { BoardResponse, SprintResponse } from '../types/index.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

type ListBoardSprintsArgs = {
  boardId?: number;
  board_id?: number;
};

function isListBoardSprintsArgs(args: unknown): args is ListBoardSprintsArgs {
  const typedArgs = args as ListBoardSprintsArgs;
  return (
    typeof args === 'object' && 
    args !== null && 
    (typeof typedArgs.boardId === 'number' || typeof typedArgs.board_id === 'number')
  );
}

export async function handleListBoards(client: JiraClient): Promise<BoardResponse[]> {
  return client.listBoards();
}

export async function handleListBoardSprints(client: JiraClient, args: unknown): Promise<SprintResponse[]> {
  if (!isListBoardSprintsArgs(args)) {
    throw new McpError(ErrorCode.InvalidParams, 'Invalid board sprint arguments. Board ID must be a number.');
  }
  
  const boardId = args.boardId || args.board_id;
  if (boardId === undefined) {
    throw new McpError(ErrorCode.InvalidParams, 'Board ID is required');
  }
  return client.listBoardSprints(boardId);
}
