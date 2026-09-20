import { getWorkspace } from '../../domain/workspace/path-guard.js';
import { searchFiles, type SearchOptions } from '../../infrastructure/search/search-files.js';

export function runSearch(workspaceId: string, options: SearchOptions) {
  return searchFiles(getWorkspace(workspaceId), options);
}
