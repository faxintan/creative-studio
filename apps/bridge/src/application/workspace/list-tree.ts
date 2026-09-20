import { listDirectory } from '../../infrastructure/filesystem/list-directory.js';
import { getWorkspace } from '../../domain/workspace/path-guard.js';

export function listTree(workspaceId: string, path = '', cursor = 0) {
  return listDirectory(getWorkspace(workspaceId), path, cursor);
}
