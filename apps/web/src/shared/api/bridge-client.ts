import type {
  ContentResponse,
  FileNode,
  SearchRequest,
  SearchResponse,
  Workspace,
} from '@creative-studio/contracts';
import { parseApiResponse } from './api-error';

const api = '/api/v1';

export interface TreeResponse {
  workspaceId: string;
  path: string;
  entries: FileNode[];
  nextCursor: string | null;
}

export async function pickWorkspace(): Promise<Workspace> {
  const response = await fetch(`${api}/workspaces/pick`, { method: 'POST' });
  const payload = await parseApiResponse<{ workspace: Workspace }>(response);
  return payload.workspace;
}

export async function getTree(workspaceId: string, path = '') {
  const params = new URLSearchParams({ path });
  const response = await fetch(`${api}/workspaces/${workspaceId}/tree?${params}`);
  return parseApiResponse<TreeResponse>(response);
}

export async function getFileContent(workspaceId: string, path: string) {
  const params = new URLSearchParams({ path });
  const response = await fetch(`${api}/workspaces/${workspaceId}/files/content?${params}`);
  return parseApiResponse<ContentResponse>(response);
}

export async function searchWorkspace(workspaceId: string, input: SearchRequest) {
  const response = await fetch(`${api}/workspaces/${workspaceId}/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseApiResponse<SearchResponse>(response);
}
