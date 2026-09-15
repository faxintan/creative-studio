#!/usr/bin/env node
/* eslint-disable no-console */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn, spawnSync } = require('child_process');

const ADAPTER_PATH = path.join(__dirname, '..', 'ai_contribution_sdk_adapter.js');
const TRANSITION_FAULT_PATH = path.join(__dirname, 'fixtures', 'turn_state_transition_fault.js');
const LOCK_BARRIER_PATH = path.join(__dirname, 'fixtures', 'turn_state_lock_barrier.js');
const STALE_LOCK_RECLAIM_BARRIER_PATH = path.join(__dirname, 'fixtures', 'stale_lock_reclaim_barrier.js');
const TRANSITION_OWNER_CRASH_PATH = path.join(__dirname, 'fixtures', 'turn_state_transition_owner_crash.js');

/** Run Git with deterministic test identity and return trimmed stdout. */
function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Mirror the adapter's portable process-generation identity for live-owner fixtures. */
function processGenerationIdentity(pid) {
  if (process.platform === 'linux') {
    const statText = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fieldsFromState = statText.slice(statText.lastIndexOf(')') + 2).trim().split(/\s+/);
    const bootId = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    return `linux:${bootId}:${fieldsFromState[19]}`;
  }
  const startedAt = execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' })
    .trim()
    .replace(/\s+/g, ' ');
  return `ps:${startedAt}`;
}

/** Create a minimal repository with one tracked source file. */
function makeRepo(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-repo-`));
  git(['init'], root);
  git(['config', 'user.name', 'AI Contribution Test'], root);
  git(['config', 'user.email', 'ai-contribution-test@example.invalid'], root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'tracked.js'), 'const tracked = true;\n');
  git(['add', '--all'], root);
  git(['commit', '-m', 'initial'], root);
  return root;
}

/** Return the standard isolated hook environment for one scenario. */
function hookEnv(logDir, extra = {}) {
  return {
    ...process.env,
    AI_CONTRIBUTION_LOG_DIR: logDir,
    AI_CONTRIBUTION_SDK_DRY_RUN: '1',
    AI_CONTRIBUTION_USERNAME: 'ai-contribution-test',
    AI_CONTRIBUTION_DEVICE_ID: 'device-ai-contribution-test',
    ...extra,
  };
}

/** Add one preload fixture without discarding caller-provided Node options. */
function withPreload(env, preloadPath) {
  return {
    ...env,
    NODE_OPTIONS: `${env.NODE_OPTIONS || ''} --require ${preloadPath}`.trim(),
  };
}

/** Run one hook and preserve its exit status for crash and timeout assertions. */
function runHookResult(payload, env) {
  return spawnSync(process.execPath, [ADAPTER_PATH], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** Run one hook that is expected to complete successfully. */
function runHook(payload, env) {
  const result = runHookResult(payload, env);
  assert.strictEqual(
    result.status,
    0,
    `hook failed status=${result.status} signal=${result.signal || ''}: ${result.stderr || ''}`,
  );
}

/** Start one hook process so another lifecycle event can overlap it. */
function startHook(payload, env) {
  const child = spawn(process.execPath, [ADAPTER_PATH], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve({ code, signal, stderr }));
  });
  child.stdin.end(JSON.stringify(payload));
  return { child, done };
}

/** Parse one append-only JSONL file, returning an empty list before first write. */
function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** Read the sole persisted turn state from an isolated log directory. */
function readTurnState(logDir) {
  const stateDir = path.join(logDir, 'turn-snapshots');
  const files = fs.readdirSync(stateDir).filter((entry) => entry.endsWith('.json'));
  assert.strictEqual(files.length, 1, 'scenario must produce exactly one turn-state file');
  return JSON.parse(fs.readFileSync(path.join(stateDir, files[0]), 'utf8'));
}

/** Return the persisted span for one explicit tool-use id. */
function spanFor(state, toolUseId) {
  const span = (state.toolSpans || {})[toolUseId];
  assert(span, `missing persisted span ${toolUseId}`);
  return span;
}

/** Return completed SDK report observations from the isolated report log. */
function reportResults(logDir) {
  return readJsonLines(path.join(logDir, 'reports.jsonl'))
    .filter((entry) => entry.phase === 'result' && entry.event === 'ai_contribution_code');
}

/** List immutable snapshot blobs in one isolated hook directory. */
function snapshotBlobNames(logDir) {
  const blobDir = path.join(logDir, 'snapshot-blobs');
  return fs.existsSync(blobDir) ? fs.readdirSync(blobDir).sort() : [];
}

/** Poll a fixture path without using an arbitrary one-shot delay. */
async function waitForPath(filePath, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(filePath)) {
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${filePath}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Create one reportable span and materialize its post-tool file content. */
function prepareReportableSpan(name) {
  const root = makeRepo(`ai-contribution-${name}`);
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), `ai-contribution-${name}-log-`));
  const basePayload = {
    session_id: `${name}-session`,
    turn_id: `${name}-turn`,
    message_id: `${name}-message`,
    cwd: root,
    model: 'test-model',
  };
  const toolPayload = {
    ...basePayload,
    tool_use_id: `${name}-tool`,
    tool_name: 'Bash',
    tool_input: {
      workdir: root,
      command: `printf \"const ${name.replace(/-/g, '_')} = true;\\n\" > src/${name}.js`,
    },
  };
  const env = hookEnv(logDir);
  runHook({ ...basePayload, hook_event_name: 'UserPromptSubmit' }, env);
  runHook({ ...toolPayload, hook_event_name: 'PreToolUse' }, env);
  fs.writeFileSync(path.join(root, 'src', `${name}.js`), `const ${name.replace(/-/g, '_')} = true;\n`);
  return { root, logDir, basePayload, toolPayload, env };
}

/** Remove every isolated filesystem artifact owned by one scenario. */
function cleanupFixture(fixture, extraPaths = []) {
  for (const candidate of [fixture && fixture.root, fixture && fixture.logDir, ...extraPaths]) {
    if (candidate) {
      fs.rmSync(candidate, { recursive: true, force: true, maxRetries: 5, retryDelay: 10 });
    }
  }
}

/** A dead preparing owner must be safely taken over and reported once. */
async function testPreparingOwnerCrashRecovery() {
  const fixture = prepareReportableSpan('preparing-crash');
  try {
    const crash = runHookResult(
      { ...fixture.toolPayload, hook_event_name: 'PostToolUse', tool_response: 'completed' },
      withPreload(hookEnv(fixture.logDir, {
        AI_CONTRIBUTION_TEST_TRANSITION_FAULT: 'crash_preparing',
      }), TRANSITION_FAULT_PATH),
    );
    assert.strictEqual(crash.status, 97, 'fixture must terminate the first owner immediately after preparing is durable');
    const abandonedSpan = spanFor(readTurnState(fixture.logDir), fixture.toolPayload.tool_use_id);
    assert.strictEqual(abandonedSpan.terminalClaimState, 'preparing');
    assert(abandonedSpan.terminalClaimId, 'preparing must record a unique claim id');
    assert(Number.isInteger(abandonedSpan.terminalClaimOwnerPid), 'preparing must record its owner pid');
    assert(abandonedSpan.terminalClaimStartedAt, 'preparing must record its start time');
    assert.strictEqual(abandonedSpan.reportAttemptedAt, undefined);

    runHook({ ...fixture.toolPayload, hook_event_name: 'PostToolUse', tool_response: 'completed' }, fixture.env);
    assert.strictEqual(reportResults(fixture.logDir).length, 1, 'a dead preparing owner must not permanently suppress reporting');
    const span = spanFor(readTurnState(fixture.logDir), fixture.toolPayload.tool_use_id);
    assert(span.completedAt, 'the takeover owner must complete the durable span');
  } finally {
    cleanupFixture(fixture);
  }
}

/** A local preparation exception must release its pre-report claim for a later terminal hook. */
async function testPreparationExceptionRelease() {
  const fixture = prepareReportableSpan('preparation-throw');
  try {
    const failed = runHookResult(
      { ...fixture.toolPayload, hook_event_name: 'PostToolUse', tool_response: 'completed' },
      withPreload(hookEnv(fixture.logDir, {
        AI_CONTRIBUTION_TEST_TRANSITION_FAULT: 'throw_before_report_started',
      }), TRANSITION_FAULT_PATH),
    );
    assert(
      readJsonLines(path.join(fixture.logDir, 'diagnostics.jsonl'))
        .some((entry) => /injected preparation failure before report_started/.test(entry.message || '')),
      `pre-report preparation failure must be diagnosed: ${failed.stderr || ''}`,
    );
    assert.strictEqual(reportResults(fixture.logDir).length, 0, 'the injected failure occurs before any SDK call');
    const releasedSpan = spanFor(readTurnState(fixture.logDir), fixture.toolPayload.tool_use_id);
    assert.strictEqual(releasedSpan.terminalClaimState, undefined, 'the throwing owner must release preparing');
    assert.strictEqual(releasedSpan.reportAttemptedAt, undefined);

    runHook({ ...fixture.toolPayload, hook_event_name: 'PostToolUse', tool_response: 'completed' }, fixture.env);
    assert.strictEqual(reportResults(fixture.logDir).length, 1, 'a later hook must reclaim a released preparing span');
  } finally {
    cleanupFixture(fixture);
  }
}

/** Once report_started is durable, an unknown SDK result must never be replayed. */
async function testReportStartedCrashIsNotReplayed() {
  const fixture = prepareReportableSpan('report-started-crash');
  try {
    const crash = runHookResult(
      { ...fixture.toolPayload, hook_event_name: 'PostToolUse', tool_response: 'completed' },
      withPreload(hookEnv(fixture.logDir, {
        AI_CONTRIBUTION_TEST_TRANSITION_FAULT: 'crash_report_started',
      }), TRANSITION_FAULT_PATH),
    );
    assert.strictEqual(crash.status, 98, 'fixture must terminate immediately after report_started is durable');
    const reportStartedSpan = spanFor(readTurnState(fixture.logDir), fixture.toolPayload.tool_use_id);
    assert.strictEqual(reportStartedSpan.terminalClaimState, 'report_started');
    assert(reportStartedSpan.reportAttemptedAt, 'report_started must carry its external-call boundary timestamp');

    runHook({ ...fixture.basePayload, hook_event_name: 'Stop' }, fixture.env);
    runHook({ ...fixture.toolPayload, hook_event_name: 'PostToolUseFailure' }, fixture.env);
    assert.strictEqual(reportResults(fixture.logDir).length, 0, 'report_started must remain DO_NOT_REPLAY after owner death');
    const completedTurn = readTurnState(fixture.logDir);
    assert.strictEqual(completedTurn.retentionState, 'completed_turn_tombstone');
    assert.strictEqual(completedTurn.retention.toolSpanCount, 1);
    assert.strictEqual(completedTurn.retention.terminalToolSpanCount, 1);
    assert.strictEqual(completedTurn.retention.completedToolSpanCount, 0);
    assert.strictEqual(completedTurn.toolSpans, undefined, 'completed turn must not retain DO_NOT_REPLAY snapshot indexes');
  } finally {
    cleanupFixture(fixture);
  }
}

/** A span with no reportable blocks completes without entering the unknown-result state. */
async function testNoBlocksCompletesWithoutReportStarted() {
  const root = makeRepo('ai-contribution-no-blocks');
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-no-blocks-log-'));
  const env = hookEnv(logDir);
  const payload = {
    session_id: 'no-blocks-session',
    turn_id: 'no-blocks-turn',
    message_id: 'no-blocks-message',
    cwd: root,
    model: 'test-model',
    tool_use_id: 'no-blocks-tool',
    tool_name: 'Bash',
    tool_input: { workdir: root, command: 'printf unchanged > src/future.js' },
  };
  try {
    runHook({ ...payload, hook_event_name: 'UserPromptSubmit' }, env);
    runHook({ ...payload, hook_event_name: 'PreToolUse' }, env);
    runHook({ ...payload, hook_event_name: 'PostToolUse', tool_response: 'completed' }, env);
    const span = spanFor(readTurnState(logDir), payload.tool_use_id);
    assert(span.completedAt, 'non-reportable spans must still terminalize');
    assert.strictEqual(span.reportAttemptedAt, undefined, 'no SDK call means no reportAttemptedAt');
    assert.notStrictEqual(span.terminalClaimState, 'report_started');
  } finally {
    cleanupFixture({ root, logDir });
  }
}

/** Repeated or late prompt submission merges metadata without erasing an earlier Pre span. */
async function testLateAndRepeatedPromptPreservePreSpan() {
  const root = makeRepo('ai-contribution-late-prompt');
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-late-prompt-log-'));
  const env = hookEnv(logDir);
  const payload = {
    session_id: 'late-prompt-session',
    turn_id: 'late-prompt-turn',
    message_id: 'late-prompt-message',
    cwd: root,
    model: 'test-model',
    tool_use_id: 'late-prompt-tool',
    tool_name: 'Bash',
    tool_input: { workdir: root, command: 'printf \"const late = true;\\n\" > src/late.js' },
  };
  try {
    runHook({ ...payload, hook_event_name: 'PreToolUse' }, env);
    const originalSpan = spanFor(readTurnState(logDir), payload.tool_use_id);
    const originalBeforeId = Object.values(originalSpan.roots)[0].before.id;
    runHook({ ...payload, hook_event_name: 'UserPromptSubmit' }, env);
    runHook({ ...payload, hook_event_name: 'UserPromptSubmit' }, env);
    const mergedSpan = spanFor(readTurnState(logDir), payload.tool_use_id);
    assert.strictEqual(Object.values(mergedSpan.roots)[0].before.id, originalBeforeId);

    fs.writeFileSync(path.join(root, 'src', 'late.js'), 'const late = true;\n');
    runHook({ ...payload, hook_event_name: 'PostToolUse', tool_response: 'completed' }, env);
    assert.strictEqual(reportResults(logDir).length, 1, 'the preserved pre snapshot must remain reportable');
    const completedBeforeRepeat = spanFor(readTurnState(logDir), payload.tool_use_id);
    runHook({ ...payload, hook_event_name: 'UserPromptSubmit' }, env);
    const completedAfterRepeat = spanFor(readTurnState(logDir), payload.tool_use_id);
    assert.strictEqual(
      completedAfterRepeat.completedAt,
      completedBeforeRepeat.completedAt,
      'a repeated prompt must preserve an already completed span',
    );
    assert.strictEqual(completedAfterRepeat.reportAttemptedAt, completedBeforeRepeat.reportAttemptedAt);
  } finally {
    cleanupFixture({ root, logDir });
  }
}

/** A duplicate Pre keeps the first immutable before snapshot even after the file changes. */
async function testDuplicatePrePreservesFirstSnapshot() {
  const fixture = prepareReportableSpan('duplicate-pre');
  try {
    const firstSpan = spanFor(readTurnState(fixture.logDir), fixture.toolPayload.tool_use_id);
    const firstBeforeId = Object.values(firstSpan.roots)[0].before.id;
    runHook({ ...fixture.toolPayload, hook_event_name: 'PreToolUse' }, fixture.env);
    const duplicateSpan = spanFor(readTurnState(fixture.logDir), fixture.toolPayload.tool_use_id);
    assert.strictEqual(
      Object.values(duplicateSpan.roots)[0].before.id,
      firstBeforeId,
      'duplicate Pre must not replace the immutable before with post-change content',
    );
    runHook({ ...fixture.toolPayload, hook_event_name: 'PostToolUse', tool_response: 'completed' }, fixture.env);
    assert.strictEqual(reportResults(fixture.logDir).length, 1);
  } finally {
    cleanupFixture(fixture);
  }
}

/** Overlapping direct-report Post and another Pre preserve both durable spans. */
async function testDirectReportAndPreCrossConcurrency() {
  const root = makeRepo('ai-contribution-direct-pre');
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-direct-pre-log-'));
  const barrierDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-direct-pre-barrier-'));
  const env = hookEnv(logDir);
  const basePayload = {
    session_id: 'direct-pre-session',
    turn_id: 'direct-pre-turn',
    message_id: 'direct-pre-message',
    cwd: root,
    model: 'test-model',
  };
  const directPayload = {
    ...basePayload,
    tool_use_id: 'direct-report-tool',
    tool_name: 'apply_patch',
    tool_input: {
      command: [
        '*** Begin Patch',
        '*** Update File: src/tracked.js',
        '@@',
        ' const tracked = true;',
        '+const direct = true;',
        '*** End Patch',
      ].join('\n'),
    },
  };
  const prePayload = {
    ...basePayload,
    tool_use_id: 'cross-pre-tool',
    tool_name: 'Bash',
    tool_input: { workdir: root, command: 'printf \"const later = true;\\n\" > src/later.js' },
  };
  try {
    runHook({ ...basePayload, hook_event_name: 'UserPromptSubmit' }, env);
    runHook({ ...directPayload, hook_event_name: 'PreToolUse' }, env);
    fs.writeFileSync(path.join(root, 'src', 'tracked.js'), 'const tracked = true;\nconst direct = true;\n');

    const blockedPost = startHook(
      { ...directPayload, hook_event_name: 'PostToolUse', tool_response: 'completed' },
      withPreload(hookEnv(logDir, {
        AI_CONTRIBUTION_TEST_LOCK_BARRIER_DIR: barrierDir,
        AI_CONTRIBUTION_TEST_LOCK_BARRIER_TIMEOUT_MS: '5000',
      }), LOCK_BARRIER_PATH),
    );
    await waitForPath(path.join(barrierDir, 'arrived'));
    runHook({ ...prePayload, hook_event_name: 'PreToolUse' }, env);
    fs.writeFileSync(path.join(barrierDir, 'release'), '');
    const postResult = await blockedPost.done;
    assert.strictEqual(postResult.code, 0, postResult.stderr);

    const state = readTurnState(logDir);
    assert(spanFor(state, directPayload.tool_use_id).completedAt);
    assert(spanFor(state, prePayload.tool_use_id), 'the concurrent Pre span must survive direct reporting');
    assert.strictEqual(reportResults(logDir).length, 1, 'direct and snapshot blocks must be deduplicated');
  } finally {
    cleanupFixture({ root, logDir }, [barrierDir]);
  }
}

/** Create a lock directory for one predictable turn-state path. */
function createTurnStateLock(logDir, payload, owner) {
  const stateDir = path.join(logDir, 'turn-snapshots');
  const statePath = path.join(stateDir, `${payload.session_id}-${payload.turn_id}.json`);
  const lockPath = `${statePath}.lock`;
  fs.mkdirSync(lockPath, { recursive: true });
  if (owner) {
    fs.writeFileSync(path.join(lockPath, 'owner.json'), `${JSON.stringify(owner)}\n`);
  }
  return lockPath;
}

/** Assert one state lock left no transition gate or retired quarantine sibling behind. */
function assertNoStateLockTransitionArtifacts(lockPath) {
  const parent = path.dirname(lockPath);
  const lockName = path.basename(lockPath);
  const artifacts = fs.readdirSync(parent).filter((entry) => (
    entry === `${lockName}.transition` || entry.startsWith(`${lockName}.retired-`)
  ));
  assert.deepStrictEqual(artifacts, [], 'lock generation transitions must not leak sidecar artifacts');
}

/** A transition gate whose recorded process generation is dead must not fence future state transactions. */
async function testDeadTransitionOwnerCanBeReclaimed() {
  const root = makeRepo('ai-contribution-dead-transition-owner');
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-dead-transition-owner-log-'));
  const payload = {
    session_id: 'dead-transition-session',
    turn_id: 'dead-transition-turn',
    message_id: 'dead-transition-message',
    cwd: root,
    model: 'test-model',
    hook_event_name: 'UserPromptSubmit',
  };
  try {
    const lockPath = createTurnStateLock(logDir, payload, null);
    fs.rmdirSync(lockPath);
    const transitionPath = `${lockPath}.transition`;
    const crashedOwner = runHookResult(payload, withPreload(hookEnv(logDir, {
      AI_CONTRIBUTION_TEST_CRASH_TRANSITION_OWNER: '1',
    }), TRANSITION_OWNER_CRASH_PATH));
    assert.strictEqual(
      crashedOwner.status,
      99,
      'fixture must terminate the transition holder immediately after owner metadata is durable',
    );
    assert(fs.existsSync(path.join(transitionPath, 'owner.json')));

    runHook(payload, hookEnv(logDir, {
      AI_CONTRIBUTION_TURN_STATE_LOCK_TIMEOUT_MS: '200',
      AI_CONTRIBUTION_TURN_STATE_STALE_LOCK_MS: '60000',
    }));

    assert(!fs.existsSync(transitionPath), 'a confirmed dead transition owner must be reclaimed');
    assertNoStateLockTransitionArtifacts(lockPath);
    assert.strictEqual(readTurnState(logDir).turnId, payload.turn_id);
  } finally {
    cleanupFixture({ root, logDir });
  }
}

/** An observable live transition owner remains authoritative regardless of directory age. */
async function testLiveTransitionOwnerCannotBeReclaimed() {
  const root = makeRepo('ai-contribution-live-transition-owner');
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-live-transition-owner-log-'));
  const payload = {
    session_id: 'live-transition-session',
    turn_id: 'live-transition-turn',
    message_id: 'live-transition-message',
    cwd: root,
    model: 'test-model',
    hook_event_name: 'UserPromptSubmit',
  };
  try {
    const lockPath = createTurnStateLock(logDir, payload, null);
    fs.rmdirSync(lockPath);
    const transitionPath = `${lockPath}.transition`;
    const owner = {
      pid: process.pid,
      processIdentity: processGenerationIdentity(process.pid),
      token: 'live-transition-owner',
      acquiredAt: new Date(0).toISOString(),
    };
    fs.mkdirSync(transitionPath, { mode: 0o700 });
    fs.writeFileSync(path.join(transitionPath, 'owner.json'), `${JSON.stringify(owner)}\n`, { mode: 0o600 });
    fs.utimesSync(transitionPath, new Date(0), new Date(0));

    const result = runHookResult(payload, hookEnv(logDir, {
      AI_CONTRIBUTION_TURN_STATE_LOCK_TIMEOUT_MS: '40',
      AI_CONTRIBUTION_TURN_STATE_STALE_LOCK_MS: '1',
    }));

    assert.notStrictEqual(result.status, 0, 'a live transition owner must not be stolen');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(transitionPath, 'owner.json'), 'utf8')), owner);
  } finally {
    cleanupFixture({ root, logDir });
  }
}

/** Lock recovery steals only provably dead or old uninitialized generations. */
async function testStateLockRecoveryAndTimeoutDiagnostics() {
  const root = makeRepo('ai-contribution-locks');
  const basePayload = {
    session_id: 'lock-session',
    turn_id: 'lock-turn',
    message_id: 'lock-message',
    cwd: root,
    model: 'test-model',
    hook_event_name: 'UserPromptSubmit',
  };
  const logDirs = [];
  try {
    const deadLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-dead-lock-log-'));
    logDirs.push(deadLogDir);
    const deadPid = Number(execFileSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }));
    const deadLock = createTurnStateLock(deadLogDir, basePayload, {
      pid: deadPid, token: 'dead-owner', acquiredAt: new Date(0).toISOString(),
    });
    fs.utimesSync(deadLock, new Date(0), new Date(0));
    runHook(basePayload, hookEnv(deadLogDir, { AI_CONTRIBUTION_TURN_STATE_STALE_LOCK_MS: '10' }));
    assert(!fs.existsSync(deadLock), 'a lock owned by a confirmed dead process must be reclaimed');

    const freshLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-fresh-ownerless-lock-log-'));
    logDirs.push(freshLogDir);
    const freshLock = createTurnStateLock(freshLogDir, basePayload, null);
    const freshResult = runHookResult(basePayload, hookEnv(freshLogDir, {
      AI_CONTRIBUTION_TURN_STATE_LOCK_TIMEOUT_MS: '40',
      AI_CONTRIBUTION_TURN_STATE_STALE_LOCK_MS: '10000',
    }));
    assert.notStrictEqual(freshResult.status, 0, 'a fresh ownerless lock must not be stolen');
    assert(fs.existsSync(freshLock));
    assert(
      /timed out acquiring turn-state lock/.test(freshResult.stderr),
      'lock timeout must emit an explicit diagnostic',
    );

    const oldLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-old-ownerless-lock-log-'));
    logDirs.push(oldLogDir);
    const oldLock = createTurnStateLock(oldLogDir, basePayload, null);
    fs.utimesSync(oldLock, new Date(0), new Date(0));
    runHook(basePayload, hookEnv(oldLogDir, {
      AI_CONTRIBUTION_TURN_STATE_LOCK_TIMEOUT_MS: '200',
      AI_CONTRIBUTION_TURN_STATE_STALE_LOCK_MS: '10',
    }));
    assert(!fs.existsSync(oldLock), 'an ownerless lock older than the configured threshold must be reclaimed');

    const liveLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-live-lock-log-'));
    logDirs.push(liveLogDir);
    const liveLock = createTurnStateLock(liveLogDir, basePayload, {
      pid: process.pid,
      processIdentity: processGenerationIdentity(process.pid),
      token: 'live-owner',
      acquiredAt: new Date(0).toISOString(),
    });
    fs.utimesSync(liveLock, new Date(0), new Date(0));
    const liveResult = runHookResult(basePayload, hookEnv(liveLogDir, {
      AI_CONTRIBUTION_TURN_STATE_LOCK_TIMEOUT_MS: '40',
      AI_CONTRIBUTION_TURN_STATE_STALE_LOCK_MS: '1',
    }));
    assert.notStrictEqual(liveResult.status, 0, 'an observable live owner must never be stolen');
    assert(fs.existsSync(liveLock));
  } finally {
    cleanupFixture({ root }, logDirs);
  }
}

/** Failed owner publication removes only the lock generation created by that acquisition attempt. */
async function testOwnerPublishFailureCleansOnlyCreatedGeneration() {
  const root = makeRepo('ai-contribution-owner-publish-failure');
  const emptyFailureLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-owner-publish-empty-log-'));
  const replacementFailureLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-owner-publish-replacement-log-'));
  const payload = {
    session_id: 'owner-publish-session',
    turn_id: 'owner-publish-turn',
    message_id: 'owner-publish-message',
    cwd: root,
    model: 'test-model',
    hook_event_name: 'UserPromptSubmit',
  };
  const replacementOwner = {
    pid: process.pid,
    processIdentity: processGenerationIdentity(process.pid),
    token: 'replacement-live-generation',
    acquiredAt: new Date().toISOString(),
  };
  try {
    const emptyLock = createTurnStateLock(emptyFailureLogDir, payload, null);
    fs.rmdirSync(emptyLock);
    const emptyFailure = runHookResult(payload, withPreload(
      hookEnv(emptyFailureLogDir, { AI_CONTRIBUTION_TEST_OWNER_PUBLISH_FAULT: 'partial_then_throw' }),
      STALE_LOCK_RECLAIM_BARRIER_PATH,
    ));
    assert.notStrictEqual(emptyFailure.status, 0, 'the injected owner publication failure must surface');
    assert(!fs.existsSync(emptyLock), 'a failed publication must remove its own empty lock generation');
    runHook(payload, hookEnv(emptyFailureLogDir));
    assert(!fs.existsSync(emptyLock), 'a later acquisition must proceed without a 60-second ownerless lock');

    const replacementLock = createTurnStateLock(replacementFailureLogDir, payload, null);
    fs.rmdirSync(replacementLock);
    const replacementFailure = runHookResult(payload, withPreload(hookEnv(replacementFailureLogDir, {
      AI_CONTRIBUTION_TEST_OWNER_PUBLISH_FAULT: 'replace_generation_then_throw',
      AI_CONTRIBUTION_TEST_REPLACEMENT_OWNER_JSON: JSON.stringify(replacementOwner),
    }), STALE_LOCK_RECLAIM_BARRIER_PATH));
    assert.notStrictEqual(replacementFailure.status, 0, 'the replacement-generation fault must surface');
    assert.deepStrictEqual(
      JSON.parse(fs.readFileSync(path.join(replacementLock, 'owner.json'), 'utf8')),
      replacementOwner,
      'cleanup from the failed old generation must preserve the replacement live owner',
    );
  } finally {
    cleanupFixture({ root }, [emptyFailureLogDir, replacementFailureLogDir]);
  }
}

/** A stale observer delayed before reclaimer election must preserve a replacement live generation. */
async function testStaleObserverPreservesReplacementLiveGeneration() {
  const root = makeRepo('ai-contribution-stale-lock-race');
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-stale-lock-race-log-'));
  const barrierDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-stale-lock-race-barrier-'));
  const payload = {
    session_id: 'stale-lock-race-session',
    turn_id: 'stale-lock-race-turn',
    message_id: 'stale-lock-race-message',
    cwd: root,
    model: 'test-model',
    hook_event_name: 'UserPromptSubmit',
  };
  try {
    const deadPid = Number(execFileSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }));
    const staleLock = createTurnStateLock(logDir, payload, {
      pid: deadPid, token: 'stale-generation', acquiredAt: new Date(0).toISOString(),
    });
    fs.utimesSync(staleLock, new Date(0), new Date(0));
    const oldObserver = startHook(payload, withPreload(hookEnv(logDir, {
      AI_CONTRIBUTION_TURN_STATE_LOCK_TIMEOUT_MS: '500',
      AI_CONTRIBUTION_TURN_STATE_STALE_LOCK_MS: '60000',
      AI_CONTRIBUTION_TEST_RECLAIM_BARRIER_DIR: barrierDir,
    }), STALE_LOCK_RECLAIM_BARRIER_PATH));
    const arrivedPath = path.join(barrierDir, `arrived-${oldObserver.child.pid}`);
    await waitForPath(arrivedPath);

    fs.rmSync(staleLock, { recursive: true, force: true });
    const replacementOwner = {
      pid: process.pid,
      processIdentity: processGenerationIdentity(process.pid),
      token: 'replacement-live-generation',
      acquiredAt: new Date().toISOString(),
    };
    createTurnStateLock(logDir, payload, replacementOwner);
    fs.writeFileSync(path.join(barrierDir, 'release'), '');

    const result = await oldObserver.done;
    assert.notStrictEqual(result.code, 0, 'the old observer must time out behind the replacement live owner');
    assert.deepStrictEqual(
      JSON.parse(fs.readFileSync(path.join(staleLock, 'owner.json'), 'utf8')),
      replacementOwner,
      'the delayed old observer must preserve the replacement lock generation',
    );
    assert(!fs.existsSync(path.join(staleLock, '.reclaim')), 'the old observer must remove only its marker');
  } finally {
    cleanupFixture({ root, logDir }, [barrierDir]);
  }
}

/** Final retirement must restore a replacement generation moved after the last public-path check. */
async function testFinalRetirementPreservesReplacementGenerations() {
  const root = makeRepo('ai-contribution-final-retire-race');
  const staleLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-final-stale-retire-log-'));
  const releaseLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-final-release-retire-log-'));
  const payload = {
    session_id: 'final-retire-session',
    turn_id: 'final-retire-turn',
    message_id: 'final-retire-message',
    cwd: root,
    model: 'test-model',
    hook_event_name: 'UserPromptSubmit',
  };
  const replacementOwner = {
    pid: process.pid,
    processIdentity: processGenerationIdentity(process.pid),
    token: 'final-retire-replacement',
    acquiredAt: new Date().toISOString(),
  };
  const faultEnv = {
    AI_CONTRIBUTION_TEST_RETIRE_FAULT: 'replace_before_retire',
    AI_CONTRIBUTION_TEST_REPLACEMENT_OWNER_JSON: JSON.stringify(replacementOwner),
  };
  try {
    const deadPid = Number(execFileSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }));
    const staleLock = createTurnStateLock(staleLogDir, payload, {
      pid: deadPid,
      token: 'stale-before-final-retire',
      acquiredAt: new Date(0).toISOString(),
    });
    fs.utimesSync(staleLock, new Date(0), new Date(0));
    const staleResult = runHookResult(payload, withPreload(hookEnv(staleLogDir, {
      ...faultEnv,
      AI_CONTRIBUTION_TURN_STATE_LOCK_TIMEOUT_MS: '100',
      AI_CONTRIBUTION_TURN_STATE_STALE_LOCK_MS: '1',
    }), STALE_LOCK_RECLAIM_BARRIER_PATH));
    assert.notStrictEqual(staleResult.status, 0, 'the stale observer must time out behind the restored live replacement');
    assert.deepStrictEqual(
      JSON.parse(fs.readFileSync(path.join(staleLock, 'owner.json'), 'utf8')),
      replacementOwner,
      'stale retirement must restore the replacement generation moved at the final rename boundary',
    );
    assertNoStateLockTransitionArtifacts(staleLock);

    const releaseLock = createTurnStateLock(releaseLogDir, payload, null);
    fs.rmdirSync(releaseLock);
    const releaseResult = runHookResult(payload, withPreload(hookEnv(releaseLogDir, faultEnv), STALE_LOCK_RECLAIM_BARRIER_PATH));
    assert.notStrictEqual(releaseResult.status, 0, 'release must surface ownership loss after restoring the replacement');
    assert.deepStrictEqual(
      JSON.parse(fs.readFileSync(path.join(releaseLock, 'owner.json'), 'utf8')),
      replacementOwner,
      'release retirement must restore the replacement generation moved at the final rename boundary',
    );
    assertNoStateLockTransitionArtifacts(releaseLock);
  } finally {
    cleanupFixture({ root }, [staleLogDir, releaseLogDir]);
  }
}

/** An unreadable owner record is unverified authority and must never be treated as ownerless. */
async function testOwnerReadFailureFailsClosed() {
  const root = makeRepo('ai-contribution-owner-read-failure');
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-owner-read-failure-log-'));
  const payload = {
    session_id: 'owner-read-session',
    turn_id: 'owner-read-turn',
    message_id: 'owner-read-message',
    cwd: root,
    model: 'test-model',
    hook_event_name: 'UserPromptSubmit',
  };
  const owner = {
    pid: process.pid,
    processIdentity: processGenerationIdentity(process.pid),
    token: 'unreadable-live-owner',
    acquiredAt: new Date(0).toISOString(),
  };
  try {
    const lockPath = createTurnStateLock(logDir, payload, owner);
    fs.utimesSync(lockPath, new Date(0), new Date(0));
    const result = runHookResult(payload, withPreload(hookEnv(logDir, {
      AI_CONTRIBUTION_TURN_STATE_LOCK_TIMEOUT_MS: '100',
      AI_CONTRIBUTION_TURN_STATE_STALE_LOCK_MS: '1',
      AI_CONTRIBUTION_TEST_OWNER_READ_FAULT: 'throw',
    }), STALE_LOCK_RECLAIM_BARRIER_PATH));

    assert.notStrictEqual(result.status, 0, 'unverified owner metadata must fail the hook closed');
    assert.deepStrictEqual(
      JSON.parse(fs.readFileSync(path.join(lockPath, 'owner.json'), 'utf8')),
      owner,
      'owner-read failure must preserve the live lock generation',
    );
    assertNoStateLockTransitionArtifacts(lockPath);
  } finally {
    cleanupFixture({ root, logDir });
  }
}

/** A failed quarantine restore must keep the transition sentinel and prevent a replacement owner. */
async function testRestoreFailureKeepsTransitionFailClosed() {
  const root = makeRepo('ai-contribution-restore-failure');
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-restore-failure-log-'));
  const payload = {
    session_id: 'restore-failure-session',
    turn_id: 'restore-failure-turn',
    message_id: 'restore-failure-message',
    cwd: root,
    model: 'test-model',
    hook_event_name: 'UserPromptSubmit',
  };
  const replacementOwner = {
    pid: process.pid,
    processIdentity: processGenerationIdentity(process.pid),
    token: 'quarantined-live-owner',
    acquiredAt: new Date().toISOString(),
  };
  try {
    const deadPid = Number(execFileSync(
      process.execPath,
      ['-e', 'process.stdout.write(String(process.pid))'],
      { encoding: 'utf8' },
    ));
    const lockPath = createTurnStateLock(logDir, payload, {
      pid: deadPid,
      token: 'stale-before-restore-failure',
      acquiredAt: new Date(0).toISOString(),
    });
    fs.utimesSync(lockPath, new Date(0), new Date(0));
    const result = runHookResult(payload, withPreload(hookEnv(logDir, {
      AI_CONTRIBUTION_TURN_STATE_LOCK_TIMEOUT_MS: '100',
      AI_CONTRIBUTION_TURN_STATE_STALE_LOCK_MS: '1',
      AI_CONTRIBUTION_TEST_RETIRE_FAULT: 'replace_before_retire',
      AI_CONTRIBUTION_TEST_RESTORE_FAULT: 'throw',
      AI_CONTRIBUTION_TEST_REPLACEMENT_OWNER_JSON: JSON.stringify(replacementOwner),
    }), STALE_LOCK_RECLAIM_BARRIER_PATH));

    assert.notStrictEqual(result.status, 0, 'failed restoration must abort lock acquisition');
    assert(
      fs.existsSync(`${lockPath}.transition`),
      'failed restoration must preserve the transition directory as a fail-closed sentinel',
    );
    const poison = JSON.parse(fs.readFileSync(path.join(`${lockPath}.transition`, 'poison.json'), 'utf8'));
    assert.strictEqual(poison.reason, 'TURN_STATE_LOCK_RETIREMENT_RESTORE_FAILED');
    assert.strictEqual(poison.pid > 0, true);
    assert(!fs.existsSync(lockPath), 'no replacement owner may occupy the vacant public lock path');
    const retiredNames = fs.readdirSync(path.dirname(lockPath))
      .filter((entry) => entry.startsWith(`${path.basename(lockPath)}.retired-`));
    assert.strictEqual(retiredNames.length, 1, 'the unverified quarantined generation must remain intact');
    assert.deepStrictEqual(
      JSON.parse(fs.readFileSync(path.join(path.dirname(lockPath), retiredNames[0], 'owner.json'), 'utf8')),
      replacementOwner,
      'the quarantined replacement owner must remain recoverable for manual inspection',
    );
  } finally {
    cleanupFixture({ root, logDir });
  }
}

/** Stop winning before the Pre transaction must fence every snapshot/blob side effect. */
async function testTombstoneWinsBeforePreSnapshotCreation() {
  const root = makeRepo('ai-contribution-pre-tombstone-race');
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-pre-tombstone-race-log-'));
  const barrierDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-pre-tombstone-race-barrier-'));
  const basePayload = {
    session_id: 'pre-tombstone-session',
    turn_id: 'pre-tombstone-turn',
    message_id: 'pre-tombstone-message',
    cwd: root,
    model: 'test-model',
  };
  const prePayload = {
    ...basePayload,
    hook_event_name: 'PreToolUse',
    tool_use_id: 'pre-tombstone-tool',
    tool_name: 'Bash',
    tool_input: {
      workdir: root,
      command: 'touch src/tracked.js',
    },
  };
  try {
    runHook({ ...basePayload, hook_event_name: 'UserPromptSubmit' }, hookEnv(logDir));
    const blobsBeforeRace = snapshotBlobNames(logDir);
    const blockedPre = startHook(prePayload, withPreload(hookEnv(logDir, {
      AI_CONTRIBUTION_TEST_LOCK_BARRIER_DIR: barrierDir,
      AI_CONTRIBUTION_TEST_LOCK_BARRIER_TIMEOUT_MS: '5000',
    }), LOCK_BARRIER_PATH));
    await waitForPath(path.join(barrierDir, 'arrived'));

    runHook({ ...basePayload, hook_event_name: 'Stop' }, hookEnv(logDir));
    fs.writeFileSync(path.join(barrierDir, 'release'), '');
    const preResult = await blockedPre.done;
    assert.strictEqual(preResult.code, 0, preResult.stderr);

    const state = readTurnState(logDir);
    assert.strictEqual(state.retentionState, 'completed_turn_tombstone');
    assert.deepStrictEqual(
      snapshotBlobNames(logDir),
      blobsBeforeRace,
      'a Pre fenced by a completed tombstone must not publish an unreferenced snapshot blob',
    );
  } finally {
    cleanupFixture({ root, logDir }, [barrierDir]);
  }
}

/** Missing-Pre direct patches are diagnosed once per hook and never reported from after-only state. */
async function testMissingPreDirectPatchDoesNotReport() {
  const root = makeRepo('ai-contribution-missing-pre');
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-missing-pre-log-'));
  const env = hookEnv(logDir);
  const payload = {
    session_id: 'missing-pre-session',
    turn_id: 'missing-pre-turn',
    message_id: 'missing-pre-message',
    cwd: root,
    model: 'test-model',
    tool_use_id: 'missing-pre-tool',
    tool_name: 'apply_patch',
    tool_input: {
      command: [
        '*** Begin Patch',
        '*** Update File: src/tracked.js',
        '@@',
        ' const tracked = true;',
        '+const missingPre = true;',
        '*** End Patch',
      ].join('\n'),
    },
    hook_event_name: 'PostToolUse',
    tool_response: 'completed',
  };
  try {
    runHook({ ...payload, hook_event_name: 'UserPromptSubmit' }, env);
    fs.writeFileSync(path.join(root, 'src', 'tracked.js'), 'const tracked = true;\nconst missingPre = true;\n');
    await Promise.all(Array.from({ length: 6 }, () => {
      const processHandle = startHook(payload, env);
      return processHandle.done.then((result) => {
        assert.strictEqual(result.code, 0, result.stderr);
      });
    }));
    assert.strictEqual(reportResults(logDir).length, 0, 'missing Pre must never report an after-only direct patch');
    const diagnostics = readJsonLines(path.join(logDir, 'diagnostics.jsonl'));
    assert(
      diagnostics.filter((entry) => entry.reason === 'missing_pre_tool_snapshot').length === 6 &&
        diagnostics.every((entry) => (
          entry.reason !== 'missing_pre_tool_snapshot' || entry.afterOnlyReportSkipped === true
        )),
      'missing Pre must remain explicitly diagnosable',
    );

    runHook({ ...payload, hook_event_name: 'PreToolUse' }, env);
    runHook(payload, env);
    runHook({ ...payload, hook_event_name: 'Stop' }, env);
    runHook(payload, env);
    assert.strictEqual(
      reportResults(logDir).length,
      1,
      'a delayed Pre may enable one later terminal report, while duplicate Post/Stop remain idempotent',
    );
  } finally {
    cleanupFixture({ root, logDir });
  }
}

/** A stored owner generation mismatch must allow takeover even while the PID is currently live. */
async function testReusedPidPreparingClaimCanBeTakenOver() {
  const fixture = prepareReportableSpan('pid-reuse-claim');
  try {
    const stateDir = path.join(fixture.logDir, 'turn-snapshots');
    const stateFile = fs.readdirSync(stateDir).find((entry) => entry.endsWith('.json'));
    const statePath = path.join(stateDir, stateFile);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const span = spanFor(state, fixture.toolPayload.tool_use_id);
    span.terminalClaimState = 'preparing';
    span.terminalClaimId = 'abandoned-reused-pid-claim';
    span.terminalClaimOwnerPid = process.pid;
    span.terminalClaimOwnerIdentity = 'different-process-generation';
    span.terminalClaimStartedAt = new Date(0).toISOString();
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

    runHook({ ...fixture.toolPayload, hook_event_name: 'PostToolUse', tool_response: 'completed' }, fixture.env);
    assert.strictEqual(reportResults(fixture.logDir).length, 1, 'PID reuse must not permanently fence a dead preparing owner');
    const completedSpan = spanFor(readTurnState(fixture.logDir), fixture.toolPayload.tool_use_id);
    assert.strictEqual(
      completedSpan.terminalClaimTakeoverCount,
      1,
      'PID reuse recovery must record one process-generation takeover',
    );
    assert(completedSpan.completedAt);
  } finally {
    cleanupFixture(fixture);
  }
}

/** A preparing owner with the same live PID generation remains the sole terminal owner. */
async function testLivePreparingOwnerCannotBeTakenOver() {
  const fixture = prepareReportableSpan('live-preparing-owner');
  try {
    const stateDir = path.join(fixture.logDir, 'turn-snapshots');
    const stateFile = fs.readdirSync(stateDir).find((entry) => entry.endsWith('.json'));
    const statePath = path.join(stateDir, stateFile);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const span = spanFor(state, fixture.toolPayload.tool_use_id);
    span.terminalClaimState = 'preparing';
    span.terminalClaimId = 'live-generation-claim';
    span.terminalClaimOwnerPid = process.pid;
    span.terminalClaimOwnerIdentity = processGenerationIdentity(process.pid);
    span.terminalClaimStartedAt = new Date().toISOString();
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

    runHook({ ...fixture.toolPayload, hook_event_name: 'PostToolUse', tool_response: 'completed' }, fixture.env);
    const preserved = spanFor(readTurnState(fixture.logDir), fixture.toolPayload.tool_use_id);
    assert.strictEqual(preserved.terminalClaimId, 'live-generation-claim');
    assert.strictEqual(reportResults(fixture.logDir).length, 0, 'a live owner generation cannot be stolen');
  } finally {
    cleanupFixture(fixture);
  }
}

/** A stale lock carrying a reused live PID but mismatched generation identity is reclaimable. */
async function testReusedPidStateLockCanBeReclaimed() {
  const root = makeRepo('ai-contribution-pid-reuse-lock');
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-pid-reuse-lock-log-'));
  const payload = {
    session_id: 'pid-reuse-lock-session',
    turn_id: 'pid-reuse-lock-turn',
    message_id: 'pid-reuse-lock-message',
    cwd: root,
    model: 'test-model',
    hook_event_name: 'UserPromptSubmit',
  };
  try {
    const lockPath = createTurnStateLock(logDir, payload, {
      pid: process.pid,
      processIdentity: 'different-process-generation',
      token: 'reused-pid-owner',
      acquiredAt: new Date(0).toISOString(),
    });
    fs.utimesSync(lockPath, new Date(0), new Date(0));
    runHook(payload, hookEnv(logDir, {
      AI_CONTRIBUTION_TURN_STATE_LOCK_TIMEOUT_MS: '200',
      AI_CONTRIBUTION_TURN_STATE_STALE_LOCK_MS: '1',
    }));
    assert(!fs.existsSync(lockPath), 'reused PID with a different start identity must not keep a stale lock alive');
  } finally {
    cleanupFixture({ root, logDir });
  }
}

const TESTS = {
  'preparing-crash': testPreparingOwnerCrashRecovery,
  'preparation-throw': testPreparationExceptionRelease,
  'report-started-crash': testReportStartedCrashIsNotReplayed,
  'no-blocks': testNoBlocksCompletesWithoutReportStarted,
  'prompt-pre': testLateAndRepeatedPromptPreservePreSpan,
  'duplicate-pre': testDuplicatePrePreservesFirstSnapshot,
  'direct-pre': testDirectReportAndPreCrossConcurrency,
  'dead-transition-owner': testDeadTransitionOwnerCanBeReclaimed,
  'live-transition-owner': testLiveTransitionOwnerCannotBeReclaimed,
  locks: testStateLockRecoveryAndTimeoutDiagnostics,
  'owner-publish-failure': testOwnerPublishFailureCleansOnlyCreatedGeneration,
  'lock-race': testStaleObserverPreservesReplacementLiveGeneration,
  'lock-retire-race': testFinalRetirementPreservesReplacementGenerations,
  'owner-read-failure': testOwnerReadFailureFailsClosed,
  'restore-failure': testRestoreFailureKeepsTransitionFailClosed,
  'late-pre-tombstone-race': testTombstoneWinsBeforePreSnapshotCreation,
  'missing-pre': testMissingPreDirectPatchDoesNotReport,
  'pid-reuse-claim': testReusedPidPreparingClaimCanBeTakenOver,
  'live-owner-claim': testLivePreparingOwnerCannotBeTakenOver,
  'pid-reuse-lock': testReusedPidStateLockCanBeReclaimed,
};

/** Run one named RED case or the complete hardening contract. */
async function main() {
  const selected = process.argv[2];
  if (selected) {
    assert(TESTS[selected], `unknown test case ${selected}`);
    await TESTS[selected]();
  } else {
    for (const test of Object.values(TESTS)) {
      await test();
    }
  }
  console.log(`turn state hardening tests passed${selected ? `: ${selected}` : ''}`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
