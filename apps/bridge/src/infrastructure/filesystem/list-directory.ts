import fs from 'node:fs/promises';
import path from 'node:path';
import type { FileNode } from '@creative-studio/contracts';
import { config } from '../../config.js';
import { BridgeError } from '../../domain/errors.js';
import { resolveRelativePath, type WorkspaceSession } from '../../domain/workspace/path-guard.js';
import { isBinaryPath, visibilityFor } from './visibility-policy.js';

export async function listDirectory(
  workspace: WorkspaceSession,
  relativePath = '',
  cursor = 0,
): Promise<{ entries: FileNode[]; nextCursor: string | null }> {
  const directory = await resolveRelativePath(workspace, relativePath);
  const stats = await fs.stat(directory).catch(() => null);
  if (!stats?.isDirectory()) {
    throw new BridgeError('DIRECTORY_NOT_FOUND');
  }

  const names = (await fs.readdir(directory)).sort((a, b) => a.localeCompare(b));
  const start = Math.max(0, Number.isFinite(cursor) ? cursor : 0);
  const page = names.slice(start, start + config.limits.directoryEntries);
  const entries = await Promise.all(
    page.map(async (name) => {
      const childRelativePath = path.posix.join(relativePath, name);
      const childPath = path.join(directory, name);
      const childStats = await fs.lstat(childPath).catch(() => null);
      const isDirectory = Boolean(childStats?.isDirectory());
      const visibility = visibilityFor(name);
      const contentType = isDirectory ? undefined : isBinaryPath(childPath) ? 'binary' : 'text';
      return {
        nodeId: `${workspace.workspaceId}:${childRelativePath}`,
        parentId: relativePath
          ? `${workspace.workspaceId}:${relativePath}`
          : workspace.workspaceId,
        name,
        relativePath: childRelativePath,
        kind: isDirectory ? 'directory' : 'file',
        contentType,
        visibility,
        availability: childStats ? 'readable' : 'missing',
        hasChildren: isDirectory,
      } satisfies FileNode;
    }),
  );

  const next = start + page.length < names.length ? String(start + page.length) : null;
  return { entries, nextCursor: next };
}
