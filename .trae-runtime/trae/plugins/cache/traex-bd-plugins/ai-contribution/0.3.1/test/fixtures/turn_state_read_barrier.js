#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const barrierDir = process.env.AI_CONTRIBUTION_TEST_STATE_READ_BARRIER_DIR;
const participantCount = Number(process.env.AI_CONTRIBUTION_TEST_STATE_READ_BARRIER_COUNT || '0');
const deadlineMs = Number(process.env.AI_CONTRIBUTION_TEST_STATE_READ_BARRIER_TIMEOUT_MS || '5000');
const originalReadFileSync = fs.readFileSync.bind(fs);
let barrierUsed = false;

/** Block the current process briefly without introducing asynchronous work into the adapter's state read. */
function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/** Align the first turn-state read in each adapter process so stale writers commit concurrently. */
function waitAtTurnStateReadBarrier(filePath) {
  if (barrierUsed || !barrierDir || participantCount <= 0) {
    return;
  }
  const normalizedPath = String(filePath || '').replace(/\\/g, '/');
  if (!normalizedPath.includes('/turn-snapshots/') || !normalizedPath.endsWith('.json')) {
    return;
  }
  if (normalizedPath.includes('.json.lock')) {
    return;
  }
  if (fs.existsSync(path.join(path.dirname(path.dirname(filePath)), '.storage.lock')) || fs.existsSync(`${filePath}.lock`)) {
    return;
  }
  barrierUsed = true;
  fs.mkdirSync(barrierDir, { recursive: true });
  fs.writeFileSync(path.join(barrierDir, `arrived-${process.pid}`), '');
  const releasePath = path.join(barrierDir, 'release');
  const deadline = Date.now() + deadlineMs;
  while (!fs.existsSync(releasePath)) {
    const arrivals = fs.readdirSync(barrierDir).filter((entry) => entry.startsWith('arrived-')).length;
    if (arrivals >= participantCount || Date.now() >= deadline) {
      try {
        fs.writeFileSync(releasePath, '');
      } catch {}
      break;
    }
    sleepSync(10);
  }
}

/** Intercept the first unlocked turn-state read and align all concurrent test participants. */
fs.readFileSync = function readFileSyncWithTurnStateBarrier(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  waitAtTurnStateReadBarrier(filePath);
  return result;
};
