import type { ContentResponse, FileNode, OpenDocument } from '@creative-studio/contracts';

export interface DocumentRecord extends OpenDocument {
  node: FileNode;
  content?: ContentResponse;
}

export function documentIdFor(workspaceId: string, path: string) {
  return `${workspaceId}:${path}`;
}
