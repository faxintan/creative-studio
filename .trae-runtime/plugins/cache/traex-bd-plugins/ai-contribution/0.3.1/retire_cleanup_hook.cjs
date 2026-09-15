#!/usr/bin/env node

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const fsp = fs.promises;
const PLUGIN_VERSION = '0.2.2';
const MARKER_NAME = '.ai-contribution-retired-v1.json';
const TARGET_NAMES = Object.freeze([
  'ai-contribution-sdk',
  'ai-contribution',
]);
const QUARANTINE_PATTERN = /^\.ai-contribution(?:-sdk)?\.retired-v1-[0-9]+-[0-9a-f]+$/;

// This retirement hook deliberately ignores all path override environment variables.
// It may only remove the fixed target names directly below ~/.trae/hooks.

function cleanupError(code) {
  const error = new Error(code);
  error.cleanupCode = code;
  return error;
}

function errorCode(error, fallback) {
  if (error && typeof error.cleanupCode === 'string') {
    return error.cleanupCode;
  }
  if (error && typeof error.code === 'string') {
    return `${fallback}_${error.code}`;
  }
  return fallback;
}

function isFilesystemRoot(candidate) {
  return path.parse(candidate).root === candidate;
}

async function lstatOrNull(candidate) {
  try {
    return await fsp.lstat(candidate);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function drainStdin() {
  return new Promise((resolve) => {
    if (process.stdin.destroyed || process.stdin.readableEnded) {
      resolve();
      return;
    }
    process.stdin.on('data', () => {});
    process.stdin.once('end', resolve);
    process.stdin.once('error', resolve);
    process.stdin.resume();
    if (typeof process.stdin.unref === 'function') {
      process.stdin.unref();
    }
  });
}

async function ensurePrivateDirectory(candidate) {
  const existing = await lstatOrNull(candidate);
  if (existing) {
    if (existing.isSymbolicLink()) {
      throw cleanupError('PARENT_SYMLINK');
    }
    if (!existing.isDirectory()) {
      throw cleanupError('PARENT_NOT_DIRECTORY');
    }
    return;
  }

  try {
    await fsp.mkdir(candidate, { mode: 0o700 });
  } catch (error) {
    if (!error || error.code !== 'EEXIST') {
      throw error;
    }
  }

  const created = await fsp.lstat(candidate);
  if (created.isSymbolicLink()) {
    throw cleanupError('PARENT_SYMLINK');
  }
  if (!created.isDirectory()) {
    throw cleanupError('PARENT_NOT_DIRECTORY');
  }
}

async function resolveHooksRoot(homeDirectory) {
  if (typeof homeDirectory !== 'string' || !homeDirectory) {
    throw cleanupError('HOME_UNAVAILABLE');
  }
  if (!path.isAbsolute(homeDirectory)) {
    throw cleanupError('HOME_UNSAFE');
  }

  const normalizedHome = path.resolve(homeDirectory);
  if (isFilesystemRoot(normalizedHome)) {
    throw cleanupError('HOME_UNSAFE');
  }

  // HOME may legitimately be a symlink (for example, on managed workstations).
  // Follow only this entry, then perform all cleanup against its canonical path.
  const homeStat = await fsp.stat(normalizedHome);
  if (!homeStat.isDirectory()) {
    throw cleanupError('HOME_NOT_DIRECTORY');
  }
  const realHome = await fsp.realpath(normalizedHome);
  if (isFilesystemRoot(realHome)) {
    throw cleanupError('HOME_UNSAFE');
  }

  const traeRoot = path.join(realHome, '.trae');
  const hooksRoot = path.join(traeRoot, 'hooks');
  await ensurePrivateDirectory(traeRoot);
  await ensurePrivateDirectory(hooksRoot);

  const realHooksRoot = await fsp.realpath(hooksRoot);
  if (path.relative(realHome, realHooksRoot) !== path.join('.trae', 'hooks')) {
    throw cleanupError('HOOKS_ROOT_UNSAFE');
  }
  return realHooksRoot;
}

function assertOwnedChild(hooksRoot, candidate, allowedName) {
  const normalized = path.resolve(candidate);
  if (path.dirname(normalized) !== hooksRoot || path.basename(normalized) !== allowedName) {
    throw cleanupError('TARGET_PATH_UNSAFE');
  }
}

function quarantineName(targetName) {
  const nonce = crypto.randomBytes(8).toString('hex');
  return `.${targetName}.retired-v1-${process.pid}-${nonce}`;
}

async function renameOwnedTarget(hooksRoot, targetName, errors) {
  const targetPath = path.join(hooksRoot, targetName);
  assertOwnedChild(hooksRoot, targetPath, targetName);

  let targetStat;
  try {
    targetStat = await lstatOrNull(targetPath);
  } catch (error) {
    errors.push(errorCode(error, 'TARGET_STAT'));
    return null;
  }
  if (!targetStat) {
    return null;
  }
  if (targetStat.isSymbolicLink()) {
    errors.push('TARGET_SYMLINK');
    return null;
  }
  if (!targetStat.isDirectory()) {
    errors.push('TARGET_NOT_DIRECTORY');
    return null;
  }

  const name = quarantineName(targetName);
  const quarantinePath = path.join(hooksRoot, name);
  assertOwnedChild(hooksRoot, quarantinePath, name);
  try {
    await fsp.rename(targetPath, quarantinePath);
    return quarantinePath;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    errors.push(errorCode(error, 'TARGET_RENAME'));
    return null;
  }
}

async function findQuarantines(hooksRoot, errors) {
  let entries;
  try {
    entries = await fsp.readdir(hooksRoot, { withFileTypes: true });
  } catch (error) {
    errors.push(errorCode(error, 'QUARANTINE_LIST'));
    return [];
  }

  const quarantines = [];
  for (const entry of entries) {
    if (!QUARANTINE_PATTERN.test(entry.name)) {
      continue;
    }
    const candidate = path.join(hooksRoot, entry.name);
    assertOwnedChild(hooksRoot, candidate, entry.name);
    let stat;
    try {
      stat = await fsp.lstat(candidate);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        errors.push(errorCode(error, 'QUARANTINE_STAT'));
      }
      continue;
    }
    if (stat.isSymbolicLink()) {
      errors.push('QUARANTINE_SYMLINK');
      continue;
    }
    if (!stat.isDirectory()) {
      errors.push('QUARANTINE_NOT_DIRECTORY');
      continue;
    }
    quarantines.push(candidate);
  }
  return quarantines;
}

async function measureTree(root, errors) {
  const result = { bytes: 0, files: 0 };
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        errors.push(errorCode(error, 'MEASURE_READ'));
      }
      continue;
    }
    for (const entry of entries) {
      const candidate = path.join(current, entry.name);
      let stat;
      try {
        stat = await fsp.lstat(candidate);
      } catch (error) {
        if (!error || error.code !== 'ENOENT') {
          errors.push(errorCode(error, 'MEASURE_STAT'));
        }
        continue;
      }
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        pending.push(candidate);
      } else {
        result.files += 1;
        result.bytes += stat.size;
      }
    }
  }
  return result;
}

async function measurePaths(paths, errors) {
  const total = { bytes: 0, files: 0 };
  for (const candidate of paths) {
    const measured = await measureTree(candidate, errors);
    total.bytes += measured.bytes;
    total.files += measured.files;
  }
  return total;
}

async function remainingOwnedPaths(hooksRoot, errors) {
  const paths = await findQuarantines(hooksRoot, errors);
  for (const targetName of TARGET_NAMES) {
    const candidate = path.join(hooksRoot, targetName);
    assertOwnedChild(hooksRoot, candidate, targetName);
    let stat;
    try {
      stat = await lstatOrNull(candidate);
    } catch (error) {
      errors.push(errorCode(error, 'REMAINING_STAT'));
      continue;
    }
    if (!stat) {
      continue;
    }
    if (stat.isSymbolicLink()) {
      errors.push('TARGET_SYMLINK');
    } else if (stat.isDirectory()) {
      paths.push(candidate);
    } else {
      errors.push('TARGET_NOT_DIRECTORY');
    }
  }
  return [...new Set(paths)];
}

async function writeMarker(hooksRoot, summary) {
  const markerPath = path.join(hooksRoot, MARKER_NAME);
  assertOwnedChild(hooksRoot, markerPath, MARKER_NAME);
  const existing = await lstatOrNull(markerPath);
  if (existing && existing.isSymbolicLink()) {
    throw cleanupError('MARKER_SYMLINK');
  }
  if (existing && !existing.isFile()) {
    throw cleanupError('MARKER_NOT_FILE');
  }

  const tempName = `${MARKER_NAME}.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
  const tempPath = path.join(hooksRoot, tempName);
  assertOwnedChild(hooksRoot, tempPath, tempName);
  const body = `${JSON.stringify({
    schemaVersion: 1,
    pluginVersion: PLUGIN_VERSION,
    ...summary,
  }, null, 2)}\n`;
  try {
    await fsp.writeFile(tempPath, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    try {
      await fsp.rename(tempPath, markerPath);
    } catch (error) {
      if (!error || !['EEXIST', 'EPERM'].includes(error.code)) {
        throw error;
      }
      // Windows does not replace an existing destination with rename(). Removing
      // this fixed, plugin-owned marker remains safe even if it was raced to a symlink.
      await fsp.rm(markerPath, { force: true });
      await fsp.rename(tempPath, markerPath);
    }
  } finally {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
  }
}

async function runCleanup(homeDirectory = os.homedir()) {
  const startedAt = Date.now();
  const errors = [];
  let hooksRoot;
  try {
    hooksRoot = await resolveHooksRoot(homeDirectory);
  } catch (error) {
    return {
      completedAt: new Date().toISOString(),
      status: 'partial',
      bytesBefore: 0,
      filesBefore: 0,
      bytesAfter: 0,
      filesAfter: 0,
      durationMs: Date.now() - startedAt,
      errorCodes: [errorCode(error, 'HOOKS_ROOT')],
    };
  }

  const renamed = [];
  for (const targetName of TARGET_NAMES) {
    const quarantine = await renameOwnedTarget(hooksRoot, targetName, errors);
    if (quarantine) {
      renamed.push(quarantine);
    }
  }
  const staleQuarantines = await findQuarantines(hooksRoot, errors);
  const quarantines = [...new Set([...renamed, ...staleQuarantines])];
  const before = await measurePaths(quarantines, errors);

  await Promise.all(quarantines.map(async (candidate) => {
    try {
      await fsp.rm(candidate, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch (error) {
      errors.push(errorCode(error, 'REMOVE'));
    }
  }));

  const remaining = await remainingOwnedPaths(hooksRoot, errors);
  const after = await measurePaths(remaining, errors);
  if (remaining.length > 0) {
    errors.push('OWNED_PATH_REMAINING');
  }
  const summary = {
    completedAt: new Date().toISOString(),
    status: errors.length === 0 && after.files === 0 && after.bytes === 0 ? 'complete' : 'partial',
    bytesBefore: before.bytes,
    filesBefore: before.files,
    bytesAfter: after.bytes,
    filesAfter: after.files,
    durationMs: Date.now() - startedAt,
    errorCodes: [...new Set(errors)],
  };
  try {
    await writeMarker(hooksRoot, summary);
  } catch (error) {
    summary.status = 'partial';
    summary.errorCodes = [...new Set([...summary.errorCodes, errorCode(error, 'MARKER_WRITE')])];
  }
  return summary;
}

if (require.main === module) {
  Promise.allSettled([drainStdin(), runCleanup()]).finally(() => {
    process.exitCode = 0;
  });
}

module.exports = {
  MARKER_NAME,
  PLUGIN_VERSION,
  QUARANTINE_PATTERN,
  TARGET_NAMES,
  resolveHooksRoot,
  runCleanup,
};
