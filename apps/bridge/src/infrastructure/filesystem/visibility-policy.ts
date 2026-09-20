import path from 'node:path';
import type { FileVisibility } from '@creative-studio/contracts';

const binaryExtensions = new Set([
  '.7z',
  '.avif',
  '.bmp',
  '.class',
  '.dll',
  '.dmg',
  '.exe',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.mov',
  '.mp3',
  '.mp4',
  '.otf',
  '.pdf',
  '.png',
  '.so',
  '.ttf',
  '.wav',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
]);

export function visibilityFor(name: string): FileVisibility {
  return name.startsWith('.') ? 'hidden' : 'visible';
}

export function isBinaryPath(filePath: string) {
  return binaryExtensions.has(path.extname(filePath).toLowerCase());
}

export function isPotentialText(filePath: string) {
  return !isBinaryPath(filePath);
}
