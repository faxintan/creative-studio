'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const budget = require('./hook-budget.cjs');
function duration(name, fallback) { const n = Number(process.env[name]); return Number.isFinite(n) && n > 0 ? Math.min(n, 30000) : fallback; }
const TURN_STATE_LOCK_TIMEOUT_MS = duration('AI_CONTRIBUTION_TURN_STATE_LOCK_TIMEOUT_MS', 5000);
const TURN_STATE_STALE_LOCK_MS = duration('AI_CONTRIBUTION_TURN_STATE_STALE_LOCK_MS', 60000);
/** Return a monotonic timestamp suitable for bounded lock acquisition. */
function monotonicMilliseconds() {
  return Number(process.hrtime.bigint() / 1000000n);
}

/** Pause the current synchronous adapter briefly while another process owns the state lock. */
function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/** Check whether a recorded lock owner process is still observable on this host. */
function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && error.code === 'EPERM');
  }
}

/** Return a best-effort OS process-generation identity that changes when a PID is reused. */
function processGenerationIdentity(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return '';
  }
  if (process.platform === 'linux') {
    try {
      const statText = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const commandEnd = statText.lastIndexOf(')');
      const fieldsFromState = statText.slice(commandEnd + 2).trim().split(/\s+/);
      const startTicks = fieldsFromState[19];
      const bootId = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
      if (startTicks) {
        return `linux:${bootId}:${startTicks}`;
      }
    } catch {}
  }
  try {
    const startedAt = execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: budget.timeout(50),
    }).trim().replace(/\s+/g, ' ');
    return startedAt ? `ps:${startedAt}` : '';
  } catch {
    return '';
  }
}

// A process cannot change its own generation while this adapter instance is alive; cache the costly macOS ps lookup.
const SELF_PROCESS_GENERATION_IDENTITY = processGenerationIdentity(process.pid);

/** Check both PID liveness and an available process-generation identity. */
function recordedProcessOwnerIsAlive(pid, recordedIdentity) {
  if (!processIsAlive(pid)) {
    return false;
  }
  if (!recordedIdentity) {
    return true;
  }
  const liveIdentity = processGenerationIdentity(pid);
  return !liveIdentity || liveIdentity === recordedIdentity;
}

/** Read lock ownership metadata, treating only a confirmed missing file as ownerless. */
function readStateLockOwner(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(lockPath, 'owner.json'), 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/** Return whether two observations identify the same lock-directory generation. */
function sameStateLockGeneration(leftStat, leftOwner, rightStat, rightOwner) {
  if (!leftStat || !rightStat || leftStat.dev !== rightStat.dev || leftStat.ino !== rightStat.ino) {
    return false;
  }
  if (leftOwner || rightOwner) {
    return Boolean(
      leftOwner &&
      rightOwner &&
      leftOwner.token === rightOwner.token &&
      Number(leftOwner.pid) === Number(rightOwner.pid) &&
      (leftOwner.processIdentity || '') === (rightOwner.processIdentity || ''),
    );
  }
  return true;
}

/** Return whether an unresolved quarantined state-lock generation still requires fail-closed handling. */
function stateLockHasRetiredGeneration(lockPath) {
  const parent = path.dirname(lockPath);
  const prefix = `${path.basename(lockPath)}.retired-`;
  return fs.readdirSync(parent).some((entry) => entry.startsWith(prefix));
}

/** Read explicit transition poison metadata, failing closed on malformed or unreadable records. */
function readStateLockTransitionPoison(transitionPath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(transitionPath, 'poison.json'), 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/** Only unpublished owner files are recoverable; even an unpublished poison record is a fence. */
function recoverableTransitionOwnerTemps(transitionPath, oldEnough) {
  const entries = fs.readdirSync(transitionPath, { withFileTypes: true });
  if (entries.length > 64) return null;
  const temps = [];
  for (const entry of entries) {
    if (entry.name === '.reclaim' && entry.isDirectory()) continue;
    if (entry.name === 'owner.json' && entry.isFile()) continue;
    const match = /^\.owner-([a-f0-9]{32})\.tmp$/.exec(entry.name);
    if (!match || !entry.isFile()) return null;
    const file = path.join(transitionPath, entry.name);
    const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
    let pendingOwner;
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.size > 16384) return null;
      const bytes = Buffer.alloc(stat.size);
      const size = fs.readSync(fd, bytes, 0, bytes.length, 0);
      try { pendingOwner = JSON.parse(bytes.subarray(0, size).toString('utf8')); } catch {}
    } finally { fs.closeSync(fd); }
    if (pendingOwner) {
      if (pendingOwner.token !== match[1] || !Number.isInteger(pendingOwner.pid) || pendingOwner.pid <= 0) return null;
      if (recordedProcessOwnerIsAlive(pendingOwner.pid, pendingOwner.processIdentity)) return null;
    } else if (!oldEnough) {
      // A partial owner publication follows the same grace period as an ownerless directory.
      return null;
    }
    temps.push(file);
  }
  return temps;
}

/** A recovery claim is published as a NONEMPTY directory in one rename. Thus
 * there is no public mkdir -> owner publication gap. Token-specific filenames
 * let concurrent scavengers remove a dead claim without unlinking a new owner.
 * An empty legacy .reclaim is eligible only after the existing stale grace. */
function reclaimOwner(dir) {
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return { blocked: true };
  const names = fs.readdirSync(dir);
  if (!names.length) return { stat, empty: true };
  if (names.length !== 1 || !/^owner-[a-f0-9]{32}\.json$/.test(names[0])) return { blocked: true };
  const file = path.join(dir, names[0]), item = fs.lstatSync(file);
  if (!item.isFile() || item.isSymbolicLink() || item.size > 16384) return { blocked: true };
  let owner;
  try { owner = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { blocked: true }; }
  if (!owner || typeof owner !== 'object') return { blocked: true };
  if (names[0] !== `owner-${owner.token}.json` || !Number.isInteger(owner.pid) || owner.pid <= 0) return { blocked: true };
  return { stat, owner, file };
}

function releaseReclaim(dir, claim) {
  try {
    // Never unlink owner.json at a reusable path. Only OUR unique token can be removed.
    const stat = fs.lstatSync(dir);
    if (stat.dev !== claim.stat.dev || stat.ino !== claim.stat.ino) return;
    fs.unlinkSync(path.join(dir, `owner-${claim.token}.json`));
    try { fs.rmdirSync(dir); } catch {} // A replacement nonempty claim is not ours.
  } catch {}
}

function acquireReclaim(transitionPath) {
  const dir = path.join(transitionPath, '.reclaim');
  try {
    const old = reclaimOwner(dir);
    if (old.blocked) return null;
    if (old.empty) {
      if (Date.now() - old.stat.mtimeMs < TURN_STATE_STALE_LOCK_MS) return null;
      // rename below atomically replaces this empty legacy directory.
    } else {
      if (recordedProcessOwnerIsAlive(old.owner.pid, old.owner.processIdentity)) return null;
      try { fs.unlinkSync(old.file); } catch (e) { if (e.code !== 'ENOENT') return null; }
      // Do not remove the reusable directory here: a new owner may already have
      // published a nonempty claim. rename cannot overwrite that claim.
    }
  } catch (e) { if (e.code !== 'ENOENT') return null; }
  const token = crypto.randomBytes(16).toString('hex');
  const staging = `${transitionPath}.candidate-${process.pid}-${token}`;
  const record = { token, pid: process.pid, processIdentity: SELF_PROCESS_GENERATION_IDENTITY };
  let stat;
  try {
    fs.mkdirSync(staging, { mode: 0o700 });
    fs.writeFileSync(path.join(staging, `owner-${token}.json`), JSON.stringify(record), { flag: 'wx', mode: 0o600 });
    stat = fs.lstatSync(staging);
    fs.renameSync(staging, dir);
    return { token, stat };
  } catch { return null; }
  finally {
    try { fs.unlinkSync(path.join(staging, `owner-${token}.json`)); fs.rmdirSync(staging); } catch {}
  }
}

/** Clean only bounded, dead staging directories with unambiguous owner records.
 * They are not public locks, and can never be reused by a cooperating process. */
function collectReclaimStaging(transitionPath) {
  const parent = path.dirname(transitionPath), prefix = path.basename(transitionPath) + '.candidate-';
  let removed = 0;
  for (const name of fs.readdirSync(parent)) {
    if (!name.startsWith(prefix) || removed >= 8) continue;
    const identity = /^(\d+)-([a-f0-9]{32})$/.exec(name.slice(prefix.length));
    if (!identity || recordedProcessOwnerIsAlive(Number(identity[1]), '')) continue;
    const dir = path.join(parent, name);
    try {
      const dirStat = fs.lstatSync(dir);
      if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) continue;
      let item = reclaimOwner(dir);
      if (item.blocked && fs.readdirSync(dir).join() === '.reclaim') {
        item = reclaimOwner(path.join(dir, '.reclaim'));
        if (!item.blocked && ((item.empty && Date.now() - item.stat.mtimeMs >= TURN_STATE_STALE_LOCK_MS) ||
            (item.owner && !recordedProcessOwnerIsAlive(item.owner.pid, item.owner.processIdentity)))) {
          if (item.file) fs.unlinkSync(item.file);
          fs.rmdirSync(path.join(dir, '.reclaim')); fs.rmdirSync(dir); removed++;
        }
        continue;
      }
      if (item.blocked) {
        // A killed staging writer may have left partial JSON. Only its unique,
        // exact token file in an old non-symlink directory is eligible.
        const stat = fs.lstatSync(dir), names = fs.readdirSync(dir);
        if (!stat.isDirectory() || stat.isSymbolicLink() || Date.now() - stat.mtimeMs < TURN_STATE_STALE_LOCK_MS ||
            names.length !== 1 || names[0] !== `owner-${identity[2]}.json`) continue;
        const file = path.join(dir, names[0]), ownerStat = fs.lstatSync(file);
        if (!ownerStat.isFile() || ownerStat.isSymbolicLink()) continue;
        fs.unlinkSync(file); fs.rmdirSync(dir); removed++; continue;
      }
      if (item.empty) { if (Date.now() - item.stat.mtimeMs >= TURN_STATE_STALE_LOCK_MS) fs.rmdirSync(dir); }
      else if (!recordedProcessOwnerIsAlive(item.owner.pid, item.owner.processIdentity)) {
        fs.unlinkSync(item.file); fs.rmdirSync(dir);
      }
      removed++;
    } catch {}
  }
}

/** Remove one confirmed-dead transition generation, fencing simultaneous recoverers. */
function removeStaleStateLockTransition(lockPath, transitionPath) {
  if (stateLockHasRetiredGeneration(lockPath) || readStateLockTransitionPoison(transitionPath)) return false;
  let stat;
  try {
    stat = fs.lstatSync(transitionPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
  } catch { return false; }
  const owner = readStateLockOwner(transitionPath);
  const oldEnough = Date.now() - stat.mtimeMs >= TURN_STATE_STALE_LOCK_MS;
  if (owner && recordedProcessOwnerIsAlive(Number(owner.pid), owner.processIdentity)) return false;
  if (!owner && !oldEnough) return false;
  collectReclaimStaging(transitionPath);
  const claim = acquireReclaim(transitionPath);
  if (!claim) return false;
  const reclaimPath = path.join(transitionPath, '.reclaim');
  try {
    const currentStat = fs.lstatSync(transitionPath), currentOwner = readStateLockOwner(transitionPath);
    if (stateLockHasRetiredGeneration(lockPath) || readStateLockTransitionPoison(transitionPath) ||
        !sameStateLockGeneration(stat, owner, currentStat, currentOwner) ||
        (currentOwner && recordedProcessOwnerIsAlive(Number(currentOwner.pid), currentOwner.processIdentity))) return false;
    const temps = recoverableTransitionOwnerTemps(transitionPath, oldEnough);
    if (!temps || stateLockHasRetiredGeneration(lockPath) || readStateLockTransitionPoison(transitionPath) ||
        !sameStateLockGeneration(stat, owner, fs.lstatSync(transitionPath), readStateLockOwner(transitionPath))) return false;
    for (const file of temps) fs.unlinkSync(file);
    if (currentOwner) fs.unlinkSync(path.join(transitionPath, 'owner.json'));
    // Keep our nonempty claim until the whole old gate is off the public path.
    // Otherwise a late rmdir could remove a newly published ownerless gate.
    const retired = `${transitionPath}.candidate-${process.pid}-${claim.token}`;
    fs.renameSync(transitionPath, retired);
    try {
      releaseReclaim(path.join(retired, '.reclaim'), claim);
      fs.rmdirSync(retired);
    } catch {} // A dead unpublished candidate is recoverable; never touches a new gate.
    return true;
  } catch { return false; }
  finally { releaseReclaim(reclaimPath, claim); }
}

/** Remove only the transition generation created by this acquisition before it was published. */
function cleanupUnpublishedStateLockTransition(transition, createdStat) {
  const currentStat = fs.statSync(transition.transitionPath);
  const currentOwner = readStateLockOwner(transition.transitionPath);
  if (
    currentStat.dev !== createdStat.dev ||
    currentStat.ino !== createdStat.ino ||
    (currentOwner && currentOwner.token !== transition.token) ||
    fs.existsSync(path.join(transition.transitionPath, '.reclaim'))
  ) {
    const cleanupError = new Error('turn-state transition generation changed during owner publication');
    cleanupError.code = 'TURN_STATE_TRANSITION_OWNER_MISMATCH';
    throw cleanupError;
  }
  try {
    fs.unlinkSync(path.join(transition.transitionPath, `.owner-${transition.token}.tmp`));
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }
  if (currentOwner) {
    fs.unlinkSync(path.join(transition.transitionPath, 'owner.json'));
  }
  fs.rmdirSync(transition.transitionPath);
}

/** Acquire the short gate that serializes public lock-path generation changes. */
function acquireStateLockTransition(lockPath, deadline = budget.now() + TURN_STATE_LOCK_TIMEOUT_MS) {
  const transitionPath = `${lockPath}.transition`;
  collectReclaimStaging(transitionPath);
  deadline = Math.min(deadline, budget.deadline);
  const token = crypto.randomBytes(16).toString('hex');
  const owner = {
    pid: process.pid,
    processIdentity: SELF_PROCESS_GENERATION_IDENTITY,
    token,
    acquiredAt: new Date().toISOString(),
  };
  while (true) {
    let createdStat = null;
    const transition = { transitionPath, token };
    try {
      fs.mkdirSync(transitionPath, { mode: 0o700 });
      createdStat = fs.statSync(transitionPath);
      const ownerTempPath = path.join(transitionPath, `.owner-${token}.tmp`);
      fs.writeFileSync(ownerTempPath, `${JSON.stringify(owner)}\n`, { mode: 0o600, flag: 'wx' });
      fs.renameSync(ownerTempPath, path.join(transitionPath, 'owner.json'));
      return transition;
    } catch (error) {
      if (createdStat) {
        cleanupUnpublishedStateLockTransition(transition, createdStat);
        throw error;
      }
      if (!error || error.code !== 'EEXIST') {
        throw error;
      }
      if (removeStaleStateLockTransition(lockPath, transitionPath)) {
        continue;
      }
      if (monotonicMilliseconds() >= deadline) {
        const timeoutError = new Error(`timed out acquiring turn-state transition for ${path.basename(lockPath)}`);
        timeoutError.code = 'TURN_STATE_TRANSITION_TIMEOUT';
        throw timeoutError;
      }
      sleepSync(5);
    }
  }
}

/** Persist why this owned transition must remain as an explicit fail-closed sentinel. */
function poisonStateLockTransition(transition, error) {
  const poisonTempPath = path.join(transition.transitionPath, `.poison-${transition.token}.tmp`);
  fs.writeFileSync(poisonTempPath, `${JSON.stringify({
    pid: process.pid,
    processIdentity: SELF_PROCESS_GENERATION_IDENTITY,
    token: transition.token,
    reason: error && error.code ? error.code : 'unknown_transition_failure',
    message: error && error.message ? error.message : String(error),
    poisonedAt: new Date().toISOString(),
  })}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(poisonTempPath, path.join(transition.transitionPath, 'poison.json'));
}

/** Preserve fail-closed state even if recording its diagnostic metadata also encounters an I/O failure. */
function preserveStateLockTransition(transition, error) {
  try {
    poisonStateLockTransition(transition, error);
  } catch (poisonError) {
    error.transitionPoisonError = poisonError && poisonError.message ? poisonError.message : String(poisonError);
  }
}

/** Release only the transition generation owned by this adapter process. */
function releaseStateLockTransition(transition) {
  const stat = fs.statSync(transition.transitionPath);
  const owner = readStateLockOwner(transition.transitionPath);
  if (
    !owner ||
    owner.token !== transition.token ||
    Number(owner.pid) !== process.pid ||
    (owner.processIdentity && owner.processIdentity !== SELF_PROCESS_GENERATION_IDENTITY) ||
    readStateLockTransitionPoison(transition.transitionPath)
  ) {
    const mismatchError = new Error('turn-state transition ownership changed before release');
    mismatchError.code = 'TURN_STATE_TRANSITION_OWNER_MISMATCH';
    throw mismatchError;
  }
  const currentStat = fs.statSync(transition.transitionPath);
  if (currentStat.dev !== stat.dev || currentStat.ino !== stat.ino) {
    const mismatchError = new Error('turn-state transition generation changed during release');
    mismatchError.code = 'TURN_STATE_TRANSITION_OWNER_MISMATCH';
    throw mismatchError;
  }
  fs.unlinkSync(path.join(transition.transitionPath, 'owner.json'));
  fs.rmdirSync(transition.transitionPath);
}

/** Restore a moved unexpected generation without overwriting a newer public-path owner. */
function restoreUnexpectedStateLockGeneration(retiredPath, lockPath) {
  try {
    fs.renameSync(retiredPath, lockPath);
    return true;
  } catch (error) {
    const restoreError = new Error(`turn-state lock generation changed during retirement: ${error.message}`);
    restoreError.code = 'TURN_STATE_LOCK_RETIREMENT_RESTORE_FAILED';
    restoreError.preserveStateLockTransition = true;
    throw restoreError;
  }
}

/** Return whether releasing the transition gate could expose an unverified vacant public lock path. */
function stateLockTransitionMustRemain(error) {
  return Boolean(error && error.preserveStateLockTransition);
}

/** Atomically move one expected generation off the public path before deleting its unique quarantine. */
function retireStateLockGeneration(lockPath, expectedStat, expectedOwner) {
  const retiredPath = `${lockPath}.retired-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
  try {
    fs.renameSync(lockPath, retiredPath);
  } catch {
    return false;
  }
  let retiredStat;
  let retiredOwner;
  try {
    retiredStat = fs.statSync(retiredPath);
    retiredOwner = readStateLockOwner(retiredPath);
  } catch {
    restoreUnexpectedStateLockGeneration(retiredPath, lockPath);
    throw new Error('failed to verify quarantined turn-state lock generation');
  }
  if (!sameStateLockGeneration(expectedStat, expectedOwner, retiredStat, retiredOwner)) {
    restoreUnexpectedStateLockGeneration(retiredPath, lockPath);
    return false;
  }
  try {
    fs.rmSync(retiredPath, { recursive: true, force: true });
  } catch (error) {
    const retirementError = new Error(`failed to remove quarantined turn-state lock generation: ${error.message}`);
    retirementError.code = 'TURN_STATE_LOCK_RETIREMENT_INCOMPLETE';
    retirementError.preserveStateLockTransition = true;
    throw retirementError;
  }
  return true;
}

/** Remove one stale generation while serializing every cooperating public-path replacement. */
function removeStaleStateLock(lockPath, deadline) {
  let transition;
  let releaseTransition = true;
  try {
    transition = acquireStateLockTransition(lockPath, deadline);
  } catch {
    return false;
  }
  try {
    let stat;
    try {
      stat = fs.statSync(lockPath);
    } catch {
      return false;
    }
    const owner = readStateLockOwner(lockPath);
    const oldEnough = Date.now() - stat.mtimeMs >= TURN_STATE_STALE_LOCK_MS;
    if (owner && recordedProcessOwnerIsAlive(Number(owner.pid), owner.processIdentity)) {
      return false;
    }
    if (!owner && !oldEnough) {
      return false;
    }
    try {
      const currentStat = fs.statSync(lockPath), currentOwner = readStateLockOwner(lockPath);
      if (!sameStateLockGeneration(stat, owner, currentStat, currentOwner)) return false;
      return retireStateLockGeneration(lockPath, stat, owner);
    } catch (error) {
      if (stateLockTransitionMustRemain(error)) {
        preserveStateLockTransition(transition, error); releaseTransition = false; throw error;
      }
      return false;
    }
  } finally {
    if (releaseTransition) {
      releaseStateLockTransition(transition);
    }
  }
}

/** Remove an unpublished lock only after atomically quarantining the same ownerless generation. */
function removeUnpublishedStateLockGeneration(lockPath, createdStat) {
  return retireStateLockGeneration(lockPath, createdStat, null);
}

/** Acquire the cross-process lock that serializes one turn state's complete read-modify-write cycle. */
function acquireStateLock(filePath, options = {}) {
  for (const candidate of [filePath + '.lock', filePath + '.lock.transition']) {
    try { if (fs.lstatSync(candidate).isSymbolicLink()) throw new Error('SYMLINK_LOCK_PATH'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lockPath = `${filePath}.lock`;
  const token = crypto.randomBytes(16).toString('hex');
  const processIdentity = SELF_PROCESS_GENERATION_IDENTITY;
  const deadline = Math.min(budget.deadline, monotonicMilliseconds() + (options.timeoutMs ?? TURN_STATE_LOCK_TIMEOUT_MS));
  while (true) {
    let createdStat = null;
    let ownerTempPath = null;
    let transition = null;
    let releaseTransition = true;
    try {
      transition = acquireStateLockTransition(lockPath, deadline);
      fs.mkdirSync(lockPath, { mode: 0o700 });
      createdStat = fs.statSync(lockPath);
      ownerTempPath = path.join(lockPath, `.owner-${token}.tmp`);
      fs.writeFileSync(
        ownerTempPath,
        `${JSON.stringify({
          pid: process.pid,
          processIdentity,
          token,
          acquiredAt: new Date().toISOString(),
        })}\n`,
        { mode: 0o600, flag: 'wx' },
      );
      fs.renameSync(ownerTempPath, path.join(lockPath, 'owner.json'));
      return { lockPath, token };
    } catch (error) {
      if (createdStat) {
        try {
          removeUnpublishedStateLockGeneration(lockPath, createdStat);
        } catch (cleanupError) {
          if (stateLockTransitionMustRemain(cleanupError)) {
            preserveStateLockTransition(transition, cleanupError);
            releaseTransition = false;
          }
          throw cleanupError;
        }
        throw error;
      }
      if (!error || error.code !== 'EEXIST') {
        throw error;
      }
      const existingLockObserved = Boolean(transition);
      if (transition) {
        releaseStateLockTransition(transition);
        transition = null;
      }
      if (existingLockObserved && removeStaleStateLock(lockPath, deadline)) {
        continue;
      }
      if (monotonicMilliseconds() >= deadline) {
        const timeoutError = new Error(`timed out acquiring turn-state lock for ${path.basename(filePath)}`);
        timeoutError.code = 'TURN_STATE_LOCK_TIMEOUT';
        throw timeoutError;
      }
      sleepSync(5);
    } finally {
      if (transition && releaseTransition) {
        releaseStateLockTransition(transition);
      }
    }
  }
}

/** Release only the lock generation owned by this adapter process. */
function releaseStateLock(lock) {
  const transition = acquireStateLockTransition(lock.lockPath);
  let releaseTransition = true;
  try {
    const stat = fs.statSync(lock.lockPath);
    const owner = readStateLockOwner(lock.lockPath);
    if (
      !owner ||
      owner.token !== lock.token ||
      Number(owner.pid) !== process.pid ||
      (owner.processIdentity && owner.processIdentity !== SELF_PROCESS_GENERATION_IDENTITY)
    ) {
      const mismatchError = new Error('turn-state lock ownership changed before release');
      mismatchError.code = 'TURN_STATE_LOCK_OWNER_MISMATCH';
      throw mismatchError;
    }
    if (!retireStateLockGeneration(lock.lockPath, stat, owner)) {
      const mismatchError = new Error('turn-state lock ownership changed during release');
      mismatchError.code = 'TURN_STATE_LOCK_OWNER_MISMATCH';
      throw mismatchError;
    }
  } catch (error) {
    if (stateLockTransitionMustRemain(error)) {
      preserveStateLockTransition(transition, error);
      releaseTransition = false;
    }
    throw error;
  } finally {
    if (releaseTransition) {
      releaseStateLockTransition(transition);
    }
  }
}


module.exports = { acquireStateLock, releaseStateLock, recordedProcessOwnerIsAlive, processGenerationIdentity, SELF_PROCESS_GENERATION_IDENTITY };
