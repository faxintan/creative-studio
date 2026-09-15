#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const barrierDir = process.env.AI_CONTRIBUTION_TEST_RECLAIM_BARRIER_DIR;
const barrierTimeoutMs = Number(process.env.AI_CONTRIBUTION_TEST_RECLAIM_BARRIER_TIMEOUT_MS || '5000');
const ownerPublishFault = process.env.AI_CONTRIBUTION_TEST_OWNER_PUBLISH_FAULT || '';
const ownerReadFault = process.env.AI_CONTRIBUTION_TEST_OWNER_READ_FAULT || '';
const retireFault = process.env.AI_CONTRIBUTION_TEST_RETIRE_FAULT || '';
const restoreFault = process.env.AI_CONTRIBUTION_TEST_RESTORE_FAULT || '';
const replacementOwnerJson = process.env.AI_CONTRIBUTION_TEST_REPLACEMENT_OWNER_JSON || '';
const originalMkdirSync = fs.mkdirSync.bind(fs);
const originalReadFileSync = fs.readFileSync.bind(fs);
const originalRenameSync = fs.renameSync.bind(fs);
const originalRmSync = fs.rmSync.bind(fs);
const originalWriteFileSync = fs.writeFileSync.bind(fs);
let reclaimBarrierUsed = false;
let ownerPublishFaultInjected = false;
let retireFaultInjected = false;
let restoreFaultInjected = false;

/** Block synchronously for deterministic cross-process race construction. */
function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/** Pause an old observer after its stale read and before it elects a reclaimer. */
function waitBeforeReclaimMarker(reclaimPath) {
  if (reclaimBarrierUsed || !barrierDir) {
    return;
  }
  const normalizedPath = String(reclaimPath || '').replace(/\\/g, '/');
  if (!normalizedPath.includes('/turn-snapshots/') || !normalizedPath.endsWith('.json.lock')) {
    return;
  }
  reclaimBarrierUsed = true;
  originalMkdirSync(barrierDir, { recursive: true });
  originalWriteFileSync(path.join(barrierDir, `arrived-${process.pid}`), '');
  const releasePath = path.join(barrierDir, 'release');
  const deadline = Date.now() + barrierTimeoutMs;
  while (!fs.existsSync(releasePath) && Date.now() < deadline) {
    sleepSync(5);
  }
  if (!fs.existsSync(releasePath)) {
    throw new Error('timed out waiting for stale-lock reclaim barrier release');
  }
}

/** Pause before stale-generation revalidation, now serialized by the transition gate. */
const originalStatSync = fs.statSync.bind(fs);
let lockStatReads = 0;
fs.statSync = function statWithStaleObservationBarrier(candidatePath, ...args) {
  const name = String(candidatePath).replace(/\\/g, '/');
  if (name.includes('/turn-snapshots/') && name.endsWith('.json.lock') && ++lockStatReads === 2) {
    waitBeforeReclaimMarker(candidatePath);
  }
  return originalStatSync(candidatePath, ...args);
};

/** Replace the public lock immediately before its final retirement rename. */
fs.renameSync = function renameSyncWithReplacementGeneration(sourcePath, destinationPath, ...args) {
  const normalizedSource = String(sourcePath || '').replace(/\\/g, '/');
  const normalizedDestination = String(destinationPath || '').replace(/\\/g, '/');
  if (
    !restoreFaultInjected &&
    restoreFault === 'throw' &&
    normalizedSource.includes('/turn-snapshots/') &&
    normalizedSource.includes('.json.lock.retired-') &&
    normalizedDestination.endsWith('.json.lock')
  ) {
    restoreFaultInjected = true;
    const error = new Error('injected quarantine restore failure');
    error.code = 'EIO';
    throw error;
  }
  if (
    !retireFaultInjected &&
    retireFault === 'replace_before_retire' &&
    normalizedSource.includes('/turn-snapshots/') &&
    normalizedSource.endsWith('.json.lock') &&
    normalizedDestination.includes('.json.lock.retired-')
  ) {
    retireFaultInjected = true;
    originalRmSync(sourcePath, { recursive: true, force: true });
    originalMkdirSync(sourcePath, { mode: 0o700 });
    if (replacementOwnerJson) {
      originalWriteFileSync(path.join(sourcePath, 'owner.json'), `${replacementOwnerJson}\n`, { mode: 0o600 });
    }
  }
  return originalRenameSync(sourcePath, destinationPath, ...args);
};

/** Make owner metadata unreadable so stale reclamation must fail closed. */
fs.readFileSync = function readFileSyncWithOwnerFault(filePath, ...args) {
  const normalizedPath = String(filePath || '').replace(/\\/g, '/');
  if (
    ownerReadFault === 'throw' &&
    normalizedPath.includes('/turn-snapshots/') &&
    normalizedPath.includes('.json.lock/') &&
    !normalizedPath.includes('.json.lock.transition/') &&
    normalizedPath.endsWith('/owner.json')
  ) {
    const error = new Error('injected owner metadata read failure');
    error.code = 'EIO';
    throw error;
  }
  return originalReadFileSync(filePath, ...args);
};

/** Inject an owner publication failure, optionally replacing the just-created lock generation first. */
fs.writeFileSync = function writeFileSyncWithOwnerPublishFault(filePath, data, ...args) {
  const normalizedPath = String(filePath || '').replace(/\\/g, '/');
  const ownerFileName = path.basename(normalizedPath);
  const isOwnerPublication = (
    ownerFileName === 'owner.json' ||
    (ownerFileName.startsWith('.owner-') && ownerFileName.endsWith('.tmp'))
  );
  if (
    !ownerPublishFaultInjected &&
    ownerPublishFault &&
    normalizedPath.includes('/turn-snapshots/') &&
    normalizedPath.includes('.json.lock/') &&
    !normalizedPath.includes('.json.lock.transition/') &&
    isOwnerPublication
  ) {
    ownerPublishFaultInjected = true;
    if (ownerPublishFault === 'replace_generation_then_throw') {
      const lockPath = path.dirname(filePath);
      originalRmSync(lockPath, { recursive: true, force: true });
      originalMkdirSync(lockPath, { mode: 0o700 });
      originalWriteFileSync(path.join(lockPath, 'owner.json'), `${replacementOwnerJson}\n`, { mode: 0o600 });
    } else if (ownerPublishFault === 'partial_then_throw') {
      originalWriteFileSync(filePath, '{"pid":', { mode: 0o600 });
    }
    const error = new Error(`injected owner publish failure: ${ownerPublishFault}`);
    error.code = 'EIO';
    throw error;
  }
  return originalWriteFileSync(filePath, data, ...args);
};
