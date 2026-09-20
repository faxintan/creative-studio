import { createWorkspace } from '../../domain/workspace/path-guard.js';

export async function openWorkspace(directoryReference: string) {
  const workspace = await createWorkspace(directoryReference);
  return {
    workspaceId: workspace.workspaceId,
    displayName: workspace.displayName,
    status: 'ready' as const,
  };
}
