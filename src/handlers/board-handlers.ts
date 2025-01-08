import { JiraClient } from '../client/jira-client.js';
import { BoardResponse } from '../types/index.js';

export async function handleListBoards(client: JiraClient): Promise<BoardResponse[]> {
  return client.listBoards();
}
