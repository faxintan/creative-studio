#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const barrierDir = process.env.AI_CONTRIBUTION_TEST_LOCK_BARRIER_DIR;
const deadlineMs = Number(process.env.AI_CONTRIBUTION_TEST_LOCK_BARRIER_TIMEOUT_MS || '5000');
const originalMkdirSync = fs.mkdirSync.bind(fs);
let barrierUsed = false;

/** Block one hook immediately before its first turn-state transition-gate acquisition. */
function waitBeforeStateLock(lockPath) {
  if (barrierUsed || !barrierDir) {
    return;
  }
  const normalizedPath = String(lockPath || '').replace(/\\/g, '/');
  if (!normalizedPath.endsWith('/.storage.lock.transition')) {
    return;
  }
  barrierUsed = true;
  originalMkdirSync(barrierDir, { recursive: true });
  fs.writeFileSync(path.join(barrierDir, 'arrived'), String(process.pid));
  fs.writeFileSync(path.join(barrierDir, `arrived-${process.pid}`), '');
  const releasePath = path.join(barrierDir, 'release');
  const deadline = Date.now() + deadlineMs;
  while (!fs.existsSync(releasePath) && Date.now() < deadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
  }
  if (!fs.existsSync(releasePath)) {
    throw new Error('timed out waiting for turn-state lock barrier release');
  }
}

/** Intercept the first transition-gate mkdir and release it through the deterministic test barrier. */
fs.mkdirSync = function mkdirSyncWithStateLockBarrier(directoryPath, ...args) {
  waitBeforeStateLock(directoryPath);
  return originalMkdirSync(directoryPath, ...args);
};
