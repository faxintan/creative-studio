import { getWorkspace } from '../../domain/workspace/path-guard.js';
import { readTextFile } from '../../infrastructure/filesystem/read-text-file.js';

export function readFile(workspaceId: string, relativePath: string) {
  return readTextFile(getWorkspace(workspaceId), relativePath);
}
