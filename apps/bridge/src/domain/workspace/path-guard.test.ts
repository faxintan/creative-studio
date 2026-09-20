import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BridgeError } from '../errors.js';
import { createWorkspace, resolveRelativePath } from './path-guard.js';

describe('workspace path guard', () => {
  it('resolves paths inside the selected workspace', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'creative-studio-'));
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'app.ts'), 'export const app = true;');
    const workspace = await createWorkspace(root);

    await expect(resolveRelativePath(workspace, 'src/app.ts')).resolves.toBe(
      path.join(root, 'src', 'app.ts'),
    );
  });

  it('rejects traversal outside the selected workspace', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'creative-studio-'));
    const workspace = await createWorkspace(root);

    await expect(resolveRelativePath(workspace, '../secret.txt')).rejects.toMatchObject({
      code: 'INVALID_RELATIVE_PATH',
    } satisfies Partial<BridgeError>);
  });
});
