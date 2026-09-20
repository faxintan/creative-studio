import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { BridgeError } from '../errors.js';

export interface WorkspaceSession {
  workspaceId: string;
  root: string;
  displayName: string;
}

export const sessions = new Map<string, WorkspaceSession>();

export async function createWorkspace(directoryReference: string): Promise<WorkspaceSession> {
  if (!directoryReference || !path.isAbsolute(directoryReference)) {
    throw new BridgeError('INVALID_DIRECTORY_REFERENCE');
  }

  const root = await fs.realpath(directoryReference).catch(() => {
    throw new BridgeError('WORKSPACE_NOT_FOUND');
  });
  const stats = await fs.stat(root).catch(() => null);
  if (!stats?.isDirectory()) {
    throw new BridgeError('WORKSPACE_NOT_READABLE');
  }

  const workspace = {
    workspaceId: `ws_${randomUUID()}`,
    root,
    displayName: path.basename(root),
  };
  sessions.set(workspace.workspaceId, workspace);
  return workspace;
}

export function getWorkspace(workspaceId: string): WorkspaceSession {
  const workspace = sessions.get(workspaceId);
  if (!workspace) {
    throw new BridgeError('WORKSPACE_NOT_FOUND');
  }
  return workspace;
}

export async function resolveRelativePath(workspace: WorkspaceSession, relativePath = '') {
  if (path.isAbsolute(relativePath) || relativePath.includes('\0')) {
    throw new BridgeError('INVALID_RELATIVE_PATH');
  }

  const candidate = path.resolve(workspace.root, relativePath);
  const relative = path.relative(workspace.root, candidate);
  if (relative.startsWith(`..${path.sep}`) || relative === '..') {
    throw new BridgeError('INVALID_RELATIVE_PATH');
  }

  const existing = await fs.realpath(candidate).catch(() => candidate);
  const resolvedRelative = path.relative(workspace.root, existing);
  if (resolvedRelative.startsWith(`..${path.sep}`) || resolvedRelative === '..') {
    throw new BridgeError('INVALID_RELATIVE_PATH');
  }
  return existing;
}
