import fs from 'node:fs/promises';
import path from 'node:path';
import type { ContentResponse } from '@creative-studio/contracts';
import { config } from '../../config.js';
import { BridgeError } from '../../domain/errors.js';
import { resolveRelativePath, type WorkspaceSession } from '../../domain/workspace/path-guard.js';
import { isBinaryPath } from './visibility-policy.js';

function detectLineEnding(content: string): ContentResponse['lineEnding'] {
  const hasCrLf = content.includes('\r\n');
  const withoutCrLf = content.replaceAll('\r\n', '');
  const hasCr = withoutCrLf.includes('\r');
  const hasLf = withoutCrLf.includes('\n');
  if (hasCrLf && (hasCr || hasLf)) return 'mixed';
  if (hasCrLf) return 'crlf';
  if (hasCr) return 'cr';
  if (hasLf) return 'lf';
  return 'unknown';
}

function languageFor(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  const languages: Record<string, string> = {
    '.css': 'css',
    '.html': 'html',
    '.js': 'javascript',
    '.json': 'json',
    '.jsx': 'javascript',
    '.md': 'markdown',
    '.sh': 'shell',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.yaml': 'yaml',
    '.yml': 'yaml',
  };
  return languages[extension] ?? 'plain-text';
}

export async function readTextFile(
  workspace: WorkspaceSession,
  relativePath: string,
): Promise<ContentResponse> {
  const filePath = await resolveRelativePath(workspace, relativePath);
  if (isBinaryPath(filePath)) {
    throw new BridgeError('UNSUPPORTED_FILE_TYPE');
  }

  const stats = await fs.stat(filePath).catch(() => null);
  if (!stats?.isFile()) throw new BridgeError('FILE_NOT_FOUND');
  if (stats.size > config.limits.fileBytes) throw new BridgeError('FILE_TOO_LARGE');

  const buffer = await fs.readFile(filePath).catch(() => {
    throw new BridgeError('FILE_NOT_READABLE');
  });
  if (buffer.includes(0)) throw new BridgeError('UNSUPPORTED_FILE_TYPE');
  const content = buffer.toString('utf8');
  const documentId = `${workspace.workspaceId}:${relativePath}`;
  return {
    workspaceId: workspace.workspaceId,
    documentId,
    relativePath,
    contentType: 'text',
    languageId: languageFor(filePath),
    encoding: 'utf-8',
    lineEnding: detectLineEnding(content),
    content,
  };
}
