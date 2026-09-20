import fs from 'node:fs/promises';
import path from 'node:path';
import type { SearchResult } from '@creative-studio/contracts';
import { config } from '../../config.js';
import { resolveRelativePath, type WorkspaceSession } from '../../domain/workspace/path-guard.js';
import { isPotentialText, visibilityFor } from '../filesystem/visibility-policy.js';

export interface SearchOptions {
  query: string;
  scope: 'document' | 'workspace';
  path?: string | null;
  caseSensitive?: boolean;
  includeHidden?: boolean;
  limit?: number;
}

function resultFor(
  relativePath: string,
  line: string,
  lineNumber: number,
  query: string,
  offset: number,
): SearchResult {
  return {
    resultId: `${relativePath}:${lineNumber}:${offset}`,
    relativePath,
    line: lineNumber,
    column: offset + 1,
    preview: line.slice(0, config.limits.previewChars),
    matchStart: Math.min(offset, config.limits.previewChars),
    matchLength: query.length,
  };
}

async function walkTextFiles(
  workspace: WorkspaceSession,
  directory: string,
  relativeDirectory: string,
  includeHidden: boolean,
  output: string[],
) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!includeHidden && visibilityFor(entry.name) === 'hidden') continue;
    const absolute = path.join(directory, entry.name);
    const relative = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      await walkTextFiles(workspace, absolute, relative, includeHidden, output);
    } else if (entry.isFile() && isPotentialText(absolute)) {
      output.push(relative);
    }
  }
}

export async function searchFiles(
  workspace: WorkspaceSession,
  options: SearchOptions,
): Promise<{ results: SearchResult[]; truncated: boolean }> {
  const query = options.query;
  const needle = options.caseSensitive ? query : query.toLocaleLowerCase();
  const limit = Math.min(options.limit ?? config.limits.searchResults, config.limits.searchResults);
  const includeHidden = options.includeHidden ?? true;
  const paths: string[] = [];

  if (options.scope === 'document') {
    if (!options.path) return { results: [], truncated: false };
    paths.push(options.path);
  } else {
    const root = await resolveRelativePath(workspace, '');
    await walkTextFiles(workspace, root, '', includeHidden, paths);
  }

  const results: SearchResult[] = [];
  for (const relativePath of paths) {
    if (results.length >= limit) break;
    const absolutePath = await resolveRelativePath(workspace, relativePath);
    const content = await fs.readFile(absolutePath, 'utf8').catch(() => '');
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length && results.length < limit; index += 1) {
      const line = lines[index] ?? '';
      const haystack = options.caseSensitive ? line : line.toLocaleLowerCase();
      let cursor = haystack.indexOf(needle);
      while (cursor >= 0 && results.length < limit) {
        results.push(resultFor(relativePath, line, index + 1, query, cursor));
        cursor = haystack.indexOf(needle, cursor + Math.max(needle.length, 1));
      }
    }
  }
  return { results, truncated: results.length >= limit };
}
