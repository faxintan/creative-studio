import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { BridgeError } from '../domain/errors.js';

const execFileAsync = promisify(execFile);

export async function pickDirectory() {
  try {
    if (os.platform() === 'darwin') {
      const result = await execFileAsync('osascript', [
        '-e',
        'POSIX path of (choose folder with prompt "Choose a workspace")',
      ]);
      return result.stdout.trim();
    }
    if (os.platform() === 'win32') {
      const script =
        '$dialog = New-Object -ComObject Shell.Application; ' +
        '$folder = $dialog.BrowseForFolder(0, "Choose a workspace", 0); ' +
        'if ($folder) { $folder.Self.Path }';
      const result = await execFileAsync('powershell', ['-NoProfile', '-Command', script]);
      return result.stdout.trim();
    }
    const result = await execFileAsync('zenity', [
      '--file-selection',
      '--directory',
      '--title=Choose a workspace',
    ]);
    return result.stdout.trim();
  } catch {
    throw new BridgeError('INVALID_DIRECTORY_REFERENCE', false, 'The workspace picker was cancelled or unavailable.');
  }
}
