#!/usr/bin/env node
/* eslint-disable no-console */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const ADAPTER_PATH = path.join(__dirname, '..', 'ai_contribution_sdk_adapter.js');
const LOCK_BARRIER_PRELOAD_PATH = path.join(__dirname, 'fixtures', 'turn_state_lock_barrier.js');
const PARTICIPANT_COUNT = 12;

/** Run Git with deterministic test identity and return trimmed stdout. */
function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Create a minimal repository for a single reportable tool span. */
function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-terminal-idempotency-repo-'));
  git(['init'], root);
  git(['config', 'user.name', 'AI Contribution Test'], root);
  git(['config', 'user.email', 'ai-contribution-test@example.invalid'], root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'tracked.js'), 'const tracked = true;\n');
  git(['add', '--all'], root);
  git(['commit', '-m', 'initial'], root);
  return root;
}

/** Run one hook synchronously for lifecycle setup. */
function runHook(payload, env) {
  execFileSync(process.execPath, [ADAPTER_PATH], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
}

/** Run one real adapter process and surface abnormal process termination. */
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
      } else {
        const diagnosticPath = path.join(env.AI_CONTRIBUTION_LOG_DIR, 'diagnostics.jsonl');
        const diagnostics = readJsonLines(diagnosticPath).slice(-5);
        reject(new Error(
          `hook exited code=${code} signal=${signal || ''}: ${stderr}; diagnostics=${JSON.stringify(diagnostics)}`,
        ));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

/** Parse one append-only JSONL file, returning an empty list when it was not created. */
function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** Wait until every competing terminal hook is poised at the same state-lock boundary. */
async function releaseLockBarrierWhenReady(barrierDir) {
  const deadline = Date.now() + 5000;
  while (true) {
    const arrivals = fs.readdirSync(barrierDir).filter((entry) => entry.startsWith('arrived-')).length;
    if (arrivals >= PARTICIPANT_COUNT) {
      fs.writeFileSync(path.join(barrierDir, 'release'), '');
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${PARTICIPANT_COUNT} terminal competitors; saw ${arrivals}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Prove concurrent Post and Stop elect one durable terminal owner for the same span. */
async function main() {
  const root = makeRepo();
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-terminal-idempotency-log-'));
  const barrierDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-terminal-idempotency-barrier-'));
  const basePayload = {
    session_id: 'terminal-idempotency-session',
    turn_id: 'terminal-idempotency-turn',
    message_id: 'terminal-idempotency-message',
    cwd: root,
    model: 'test-model',
  };
  const baseEnv = {
    AI_CONTRIBUTION_LOG_DIR: logDir,
    AI_CONTRIBUTION_SDK_DRY_RUN: '1',
    AI_CONTRIBUTION_USERNAME: 'ai-contribution-test',
    AI_CONTRIBUTION_DEVICE_ID: 'device-ai-contribution-test',
  };
  const toolPayload = {
    ...basePayload,
    tool_use_id: 'terminal-idempotency-tool',
    tool_name: 'Bash',
    tool_input: {
      workdir: root,
      command: 'printf \"const generated = true;\\n\" > src/generated.js',
    },
  };

  try {
    runHook({ ...basePayload, hook_event_name: 'UserPromptSubmit' }, baseEnv);
    runHook({ ...toolPayload, hook_event_name: 'PreToolUse' }, baseEnv);
    fs.writeFileSync(path.join(root, 'src', 'generated.js'), 'const generated = true;\n');

    const concurrentEnv = {
      ...baseEnv,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${LOCK_BARRIER_PRELOAD_PATH}`.trim(),
      AI_CONTRIBUTION_TEST_LOCK_BARRIER_DIR: barrierDir,
      AI_CONTRIBUTION_TEST_LOCK_BARRIER_TIMEOUT_MS: '5000',
    };
    const terminalPayloads = Array.from({ length: PARTICIPANT_COUNT }, (_, index) => {
      if (index % 3 === 0) {
        return { ...toolPayload, hook_event_name: 'PostToolUse', tool_response: 'completed' };
      }
      if (index % 3 === 1) {
        return { ...toolPayload, hook_event_name: 'PostToolUseFailure', tool_response: 'failed' };
      }
      return { ...basePayload, hook_event_name: 'Stop' };
    });
    const competitors = terminalPayloads.map((payload) => runHookAsync(payload, concurrentEnv));
    await releaseLockBarrierWhenReady(barrierDir);
    await Promise.all(competitors);

    const diagnostics = readJsonLines(path.join(logDir, 'diagnostics.jsonl'));
    const terminalEvents = diagnostics.filter((entry) => (
      entry.toolUseId === toolPayload.tool_use_id &&
      (
        entry.event === 'tool_snapshot_post' ||
        entry.event === 'tool_snapshot_failure_flush' ||
        entry.event === 'tool_snapshot_stop_recovery'
      )
    ));
    assert.strictEqual(
      terminalEvents.length,
      1,
      'concurrent Post, PostFailure, and Stop hooks must elect exactly one terminal owner for a tool span',
    );

    const reports = readJsonLines(path.join(logDir, 'reports.jsonl'));
    const reportResults = reports.filter((entry) => (
      entry.phase === 'result' && entry.event === 'ai_contribution_code'
    ));
    assert.strictEqual(reportResults.length, 1, 'the elected terminal owner must report the span at most once');
    console.log('turn state terminal idempotency tests passed');
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
