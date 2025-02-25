import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { JiraClient } from '../client/jira-client.js';
import { BoardResponse, SprintResponse } from '../types/index.js';

type ListJiraSprintsArgs = {
  boardId?: number;
  board_id?: number;
};

function isListJiraSprintsArgs(args: unknown): args is ListJiraSprintsArgs {
  const typedArgs = args as ListJiraSprintsArgs;
  return (
    typeof args === 'object' && 
    args !== null && 
    (typeof typedArgs.boardId === 'number' || typeof typedArgs.board_id === 'number')
  );
}

export async function handleListBoards(client: JiraClient): Promise<BoardResponse[]> {
  return client.listBoards();
}

export async function handleListJiraSprints(client: JiraClient, args: unknown): Promise<SprintResponse[]> {
  if (!isListJiraSprintsArgs(args)) {
    throw new McpError(ErrorCode.InvalidParams, 'Invalid sprint arguments. Board ID must be a number.');
  }
  
  const boardId = args.boardId || args.board_id;
  if (boardId === undefined) {
    throw new McpError(ErrorCode.InvalidParams, 'Board ID is required');
  }
  return client.listBoardSprints(boardId);
}
