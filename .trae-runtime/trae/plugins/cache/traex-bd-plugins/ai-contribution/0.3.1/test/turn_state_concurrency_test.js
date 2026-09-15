#!/usr/bin/env node
/* eslint-disable no-console */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const ADAPTER_PATH = path.join(__dirname, '..', 'ai_contribution_sdk_adapter.js');
const BARRIER_PRELOAD_PATH = path.join(__dirname, 'fixtures', 'turn_state_read_barrier.js');
const PARTICIPANT_COUNT = 24;

/** Run Git with deterministic test identity and return trimmed stdout. */
function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** Create the smallest repository that lets every PreToolUse snapshot a distinct future path. */
function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-turn-state-concurrency-repo-'));
  git(['init'], root);
  git(['config', 'user.name', 'AI Contribution Test'], root);
  git(['config', 'user.email', 'ai-contribution-test@example.invalid'], root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'tracked.js'), 'const tracked = true;\n');
  git(['add', '--all'], root);
  git(['commit', '-m', 'initial'], root);
  return root;
}

/** Start one real adapter process and resolve only after the lifecycle hook exits successfully. */
function runHookAsync(payload, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ADAPTER_PATH], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const diagnosticsPath = path.join(env.AI_CONTRIBUTION_LOG_DIR || '', 'diagnostics.jsonl');
      let diagnosticsTail = '';
      try {
        diagnosticsTail = fs.readFileSync(diagnosticsPath, 'utf8').split(/\r?\n/).filter(Boolean).slice(-8).join('\n');
      } catch {}
      reject(new Error(
        `hook exited code=${code} signal=${signal || ''}: ${stderr}\nrecent diagnostics:\n${diagnosticsTail}`,
      ));
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

/** Run one hook synchronously for lifecycle setup and final Stop recovery. */
function runHook(payload, env) {
  execFileSync(process.execPath, [ADAPTER_PATH], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
}

/** Read the sole persisted turn state produced by this isolated test log directory. */
function readTurnState(logDir) {
  const stateDir = path.join(logDir, 'turn-snapshots');
  const stateFiles = fs.readdirSync(stateDir).filter((entry) => entry.endsWith('.json'));
  assert.strictEqual(stateFiles.length, 1, 'the fixture must produce exactly one turn state');
  return JSON.parse(fs.readFileSync(path.join(stateDir, stateFiles[0]), 'utf8'));
}

/** Parse append-only diagnostics so the test can compare accepted starts with durable state. */
function readDiagnostics(logDir) {
  return fs.readFileSync(path.join(logDir, 'diagnostics.jsonl'), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** Prove concurrent lifecycle writers preserve every accepted span through Stop recovery. */
async function main() {
  const root = makeRepo();
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-turn-state-concurrency-log-'));
  const barrierDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-turn-state-concurrency-barrier-'));
  const basePayload = {
    session_id: 'turn-state-concurrency-session',
    turn_id: 'turn-state-concurrency-turn',
    message_id: 'turn-state-concurrency-message',
    cwd: root,
    model: 'test-model',
  };
  const baseEnv = {
    AI_CONTRIBUTION_LOG_DIR: logDir,
    AI_CONTRIBUTION_SDK_DRY_RUN: '1',
    AI_CONTRIBUTION_USERNAME: 'ai-contribution-test',
    AI_CONTRIBUTION_DEVICE_ID: 'device-ai-contribution-test',
  };

  try {
    runHook({ ...basePayload, hook_event_name: 'UserPromptSubmit' }, baseEnv);
    const concurrentEnv = {
      ...baseEnv,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${BARRIER_PRELOAD_PATH}`.trim(),
      AI_CONTRIBUTION_TEST_STATE_READ_BARRIER_DIR: barrierDir,
      AI_CONTRIBUTION_TEST_STATE_READ_BARRIER_COUNT: String(PARTICIPANT_COUNT),
      AI_CONTRIBUTION_TEST_STATE_READ_BARRIER_TIMEOUT_MS: '5000',
    };
    const outcomes = await Promise.allSettled(Array.from({ length: PARTICIPANT_COUNT }, (_, index) => runHookAsync({
      ...basePayload,
      hook_event_name: 'PreToolUse',
      tool_use_id: `concurrent-tool-${index}`,
      tool_name: 'Bash',
      tool_input: {
        workdir: root,
        command: `printf \"const value = ${index};\\n\" > src/concurrent-${index}.js`,
      },
    }, concurrentEnv)));

    const rejected = outcomes.find(r => r.status === 'rejected');
    if (rejected) throw rejected.reason;
    const preStopState = readTurnState(logDir);
    const preStopSpans = Object.values(preStopState.toolSpans || {});
    assert.strictEqual(
      preStopSpans.length,
      PARTICIPANT_COUNT,
      'the turn-state transaction must retain every independently accepted concurrent span before Stop',
    );

    runHook({ ...basePayload, hook_event_name: 'Stop' }, baseEnv);
    const diagnostics = readDiagnostics(logDir);
    const starts = diagnostics.filter((entry) => entry.event === 'tool_snapshot_start');
    assert.strictEqual(starts.length, PARTICIPANT_COUNT, 'all concurrent PreToolUse hooks must be accepted');

    const finalState = readTurnState(logDir);
    assert.strictEqual(finalState.retentionState, 'completed_turn_tombstone');
    assert.strictEqual(finalState.retention.toolSpanCount, PARTICIPANT_COUNT);
    assert.strictEqual(finalState.retention.completedToolSpanCount, PARTICIPANT_COUNT);
    assert.strictEqual(finalState.retention.terminalToolSpanCount, PARTICIPANT_COUNT);
    assert.strictEqual(finalState.toolSpans, undefined, 'Stop must discard terminal per-span snapshot indexes');
    console.log('turn state concurrency tests passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 10 });
    fs.rmSync(logDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 10 });
    fs.rmSync(barrierDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 10 });
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
