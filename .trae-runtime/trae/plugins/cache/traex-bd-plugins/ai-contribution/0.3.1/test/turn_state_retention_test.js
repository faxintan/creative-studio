#!/usr/bin/env node
/* eslint-disable no-console */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ADAPTER_PATH = path.join(__dirname, '..', 'ai_contribution_sdk_adapter.js');

/** Run one adapter lifecycle hook in an isolated log directory. */
function runHook(payload, logDir) {
  execFileSync(process.execPath, [ADAPTER_PATH], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      AI_CONTRIBUTION_LOG_DIR: logDir,
      AI_CONTRIBUTION_SDK_DRY_RUN: '1',
      AI_CONTRIBUTION_USERNAME: 'ai-contribution-retention-test',
      AI_CONTRIBUTION_DEVICE_ID: 'device_ai_contribution_retention_test',
    },
  });
}

/** Create a small Git repository whose tracked file produces a content-addressed snapshot blob. */
function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-retention-repo-'));
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'AI Contribution Retention Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'ai-contribution-retention@example.invalid'], { cwd: root });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'tracked.js'), 'const retained = true;\n');
  execFileSync('git', ['add', '--all'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: root, stdio: 'ignore' });
  return root;
}

/** Return the deterministic state path used by the simple test identifiers below. */
function statePath(logDir, sessionId, turnId) {
  return path.join(logDir, 'turn-snapshots', `${sessionId}-${turnId}.json`);
}

/** Read one durable turn state from disk. */
function readState(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Read append-only diagnostics emitted by isolated lifecycle hooks. */
function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** List the immutable snapshot blob names without reading or mutating their contents. */
function snapshotBlobNames(logDir) {
  const blobDir = path.join(logDir, 'snapshot-blobs');
  return fs.existsSync(blobDir) ? fs.readdirSync(blobDir).sort() : [];
}

/** Start a turn and one path-scoped tool span that snapshots the tracked fixture file. */
function startTrackedToolSpan(root, logDir, sessionId, turnId) {
  const common = {
    session_id: sessionId,
    turn_id: turnId,
    message_id: `${turnId}-message`,
    cwd: root,
    model: 'test-model',
  };
  runHook({ ...common, hook_event_name: 'UserPromptSubmit' }, logDir);
  runHook({
    ...common,
    hook_event_name: 'PreToolUse',
    tool_use_id: `${turnId}-tool`,
    tool_name: 'Bash',
    tool_input: {
      workdir: root,
      command: 'touch src/tracked.js',
    },
  }, logDir);
  return common;
}

/** Verify a completed tombstone retains only bounded summary data and no snapshot references. */
function assertCompletedTombstone(state, expectedToolSpanCount) {
  assert.strictEqual(state.retentionState, 'completed_turn_tombstone');
  assert(state.completedAt, 'completed tombstone must retain its terminal timestamp');
  assert.strictEqual(state.retention.toolSpanCount, expectedToolSpanCount);
  assert.strictEqual(state.retention.completedToolSpanCount, expectedToolSpanCount);
  assert.strictEqual(state.toolSpans, undefined, 'completed tombstone must drop per-tool snapshot indexes');
  assert.strictEqual(state.rootSnapshots, undefined, 'completed tombstone must drop legacy root snapshot indexes');
  assert.strictEqual(state.directReportBlockSignatures, undefined, 'completed tombstone must drop dedupe-only signatures');
  assert(!JSON.stringify(state).includes('blobId'), 'completed tombstone must not retain content blob references');
}

/** Exercise immediate completion and deferred cleanup behind an active concurrent claim. */
function main() {
  const root = makeRepo();
  const immediateLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-retention-log-'));
  const concurrentLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-retention-log-'));
  try {
    const immediate = startTrackedToolSpan(root, immediateLogDir, 'retention-session', 'completed-turn');
    const immediateStatePath = statePath(immediateLogDir, immediate.session_id, immediate.turn_id);
    const expandedStateBytes = fs.statSync(immediateStatePath).size;
    const blobsBeforeStop = snapshotBlobNames(immediateLogDir);
    assert(blobsBeforeStop.length > 0, 'pre-tool snapshot must create a content-addressed blob');

    runHook({ ...immediate, hook_event_name: 'Stop' }, immediateLogDir);

    const compactedState = readState(immediateStatePath);
    assertCompletedTombstone(compactedState, 1);
    assert(
      fs.statSync(immediateStatePath).size < expandedStateBytes,
      'completed turn state must shrink after Stop',
    );
    assert.deepStrictEqual(
      snapshotBlobNames(immediateLogDir),
      blobsBeforeStop,
      'turn-state retention must leave content-addressed blobs untouched',
    );
    const firstTombstoneText = fs.readFileSync(immediateStatePath, 'utf8');
    runHook({ ...immediate, hook_event_name: 'Stop' }, immediateLogDir);
    assert.strictEqual(
      fs.readFileSync(immediateStatePath, 'utf8'),
      firstTombstoneText,
      'repeated Stop must preserve the original completion tombstone byte for byte',
    );
    runHook({ ...immediate, hook_event_name: 'UserPromptSubmit' }, immediateLogDir);
    assert.strictEqual(
      fs.readFileSync(immediateStatePath, 'utf8'),
      firstTombstoneText,
      'late prompt submission must not recreate mutable turn state after completion',
    );
    runHook({
      ...immediate,
      hook_event_name: 'PreToolUse',
      tool_use_id: 'late-tool-after-stop',
      tool_name: 'Bash',
      tool_input: {
        workdir: root,
        command: 'touch src/tracked.js',
      },
    }, immediateLogDir);
    runHook({
      ...immediate,
      hook_event_name: 'PostToolUse',
      tool_use_id: 'late-tool-after-stop',
      tool_name: 'Bash',
      tool_input: {
        workdir: root,
        command: 'touch src/tracked.js',
      },
      tool_response: 'completed',
    }, immediateLogDir);
    const lateTerminalDiagnostics = readJsonLines(path.join(immediateLogDir, 'diagnostics.jsonl'))
      .filter((entry) => entry.toolUseId === 'late-tool-after-stop');
    assert(
      lateTerminalDiagnostics.some((entry) => (
        entry.event === 'tool_snapshot_terminal_skip' &&
        entry.reason === 'completed_turn_tombstone'
      )),
      'late terminal hooks must be classified as completed-tombstone skips',
    );
    assert(
      !lateTerminalDiagnostics.some((entry) => entry.event === 'tool_snapshot_post'),
      'late terminal hooks must not be misclassified as missing-Pre terminal events',
    );
    assert.strictEqual(
      fs.readFileSync(immediateStatePath, 'utf8'),
      firstTombstoneText,
      'late lifecycle events must not expand a completed tombstone back into snapshot state',
    );
    assert.deepStrictEqual(
      snapshotBlobNames(immediateLogDir),
      blobsBeforeStop,
      'late lifecycle events must not publish new snapshot blobs for a completed turn',
    );

    const concurrent = startTrackedToolSpan(root, concurrentLogDir, 'retention-session', 'concurrent-turn');
    const concurrentStatePath = statePath(concurrentLogDir, concurrent.session_id, concurrent.turn_id);
    const liveClaimState = readState(concurrentStatePath);
    const span = liveClaimState.toolSpans[`${concurrent.turn_id}-tool`];
    span.terminalClaimState = 'preparing';
    span.terminalClaimId = 'live-test-claim';
    span.terminalClaimOwnerPid = process.pid;
    span.terminalClaimOwnerIdentity = '';
    fs.writeFileSync(concurrentStatePath, `${JSON.stringify(liveClaimState, null, 2)}\n`);
    const concurrentBlobsBeforeStop = snapshotBlobNames(concurrentLogDir);

    runHook({ ...concurrent, hook_event_name: 'Stop' }, concurrentLogDir);

    const preservedState = readState(concurrentStatePath);
    assert.strictEqual(preservedState.completedAt, undefined, 'active claim must keep the turn recoverable');
    assert(preservedState.stopRequestedAt, 'Stop must persist deferred terminalization for the active writer');
    assert(preservedState.toolSpans[`${concurrent.turn_id}-tool`], 'active span snapshots must remain durable');
    assert(JSON.stringify(preservedState).includes('blobId'), 'active span must retain its blob references');

    preservedState.toolSpans[`${concurrent.turn_id}-tool`].terminalClaimOwnerPid = 2147483647;
    fs.writeFileSync(concurrentStatePath, `${JSON.stringify(preservedState, null, 2)}\n`);
    runHook({
      ...concurrent,
      hook_event_name: 'PostToolUse',
      tool_use_id: `${concurrent.turn_id}-tool`,
      tool_name: 'Bash',
      tool_input: {
        workdir: root,
        command: 'touch src/tracked.js',
      },
      tool_response: 'completed',
    }, concurrentLogDir);

    assertCompletedTombstone(readState(concurrentStatePath), 1);
    assert.deepStrictEqual(
      snapshotBlobNames(concurrentLogDir),
      concurrentBlobsBeforeStop,
      'recovered completion must not garbage-collect shared blobs',
    );

    console.log('turn state retention tests passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(immediateLogDir, { recursive: true, force: true });
    fs.rmSync(concurrentLogDir, { recursive: true, force: true });
  }
}

main();
