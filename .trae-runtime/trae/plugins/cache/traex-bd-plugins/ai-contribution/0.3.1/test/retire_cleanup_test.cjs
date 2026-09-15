#!/usr/bin/env node

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const fsp = fs.promises;
const PLUGIN_ROOT = path.join(__dirname, '..');
const HOOK_PATH = path.join(PLUGIN_ROOT, 'retire_cleanup_hook.cjs');
const HOOKS_PATH = path.join(PLUGIN_ROOT, 'hooks.json');
const MANIFEST_PATH = path.join(PLUGIN_ROOT, '.codex-plugin', 'plugin.json');
const { MARKER_NAME, QUARANTINE_PATTERN, runCleanup } = require(HOOK_PATH);

async function makeHome() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'ai-contribution-retire-test-'));
}

async function writeFixture(root, relativePath, content) {
  const destination = path.join(root, relativePath);
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await fsp.writeFile(destination, content);
}

async function pathExists(candidate) {
  try {
    await fsp.lstat(candidate);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function ownedEntries(home) {
  const hooksRoot = path.join(home, '.trae', 'hooks');
  const entries = await fsp.readdir(hooksRoot);
  return entries.filter((entry) => (
    entry === 'ai-contribution-sdk'
    || entry === 'ai-contribution'
    || QUARANTINE_PATTERN.test(entry)
  ));
}

async function readMarker(home) {
  return JSON.parse(await fsp.readFile(path.join(home, '.trae', 'hooks', MARKER_NAME), 'utf8'));
}

function runHookProcess(env, payload, options = {}) {
  const { keepStdinOpen = false, timeoutMs = 5_000 } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK_PATH], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`hook did not exit within ${timeoutMs}ms`));
    }, timeoutMs);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.stdin.on('error', (error) => {
      if (!error || error.code !== 'EPIPE') {
        clearTimeout(timeout);
        reject(error);
      }
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`hook exited with code ${code}, signal ${signal || 'none'}: ${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });
    if (keepStdinOpen) {
      child.stdin.write(payload);
    } else {
      child.stdin.end(payload);
    }
  });
}

async function testManifest() {
  const manifest = JSON.parse(await fsp.readFile(MANIFEST_PATH, 'utf8'));
  const hooks = JSON.parse(await fsp.readFile(HOOKS_PATH, 'utf8'));
  assert.strictEqual(manifest.version, '0.3.1');
  assert.strictEqual(manifest.hooks, './hooks.json');
  assert.deepStrictEqual(Object.keys(hooks.hooks), ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop']);
  for (const entries of Object.values(hooks.hooks)) {
    assert.strictEqual(entries[0].hooks[0].async, undefined, 'capture must precede tool execution');
    assert.strictEqual(entries[0].hooks[0].timeout, 30);
    assert(entries[0].hooks[0].command.includes('ai_contribution_sdk_hook.js'));
  }
}

async function testCleanupAndAllowlist() {
  const home = await makeHome();
  try {
    const hooksRoot = path.join(home, '.trae', 'hooks');
    await writeFixture(hooksRoot, 'ai-contribution-sdk/turn-snapshots/turn.json', 'snapshot');
    await writeFixture(hooksRoot, 'ai-contribution-sdk/snapshot-blobs/blob', '12345');
    await writeFixture(hooksRoot, 'ai-contribution/diagnostics.jsonl', 'legacy');
    await writeFixture(hooksRoot, 'npm-cache/shared-package', 'keep');
    await writeFixture(path.join(home, '.trae', 'plugins', 'cache'), 'traex-bd-plugins/ai-contribution/0.2.1/plugin.json', 'keep plugin cache');

    const summary = await runCleanup(home);
    assert.strictEqual(summary.status, 'complete');
    assert.strictEqual(summary.filesBefore, 3);
    assert.strictEqual(summary.bytesBefore, 19);
    assert.strictEqual(summary.filesAfter, 0);
    assert.strictEqual(summary.bytesAfter, 0);
    assert.deepStrictEqual(await ownedEntries(home), []);
    assert.strictEqual(await fsp.readFile(path.join(hooksRoot, 'npm-cache', 'shared-package'), 'utf8'), 'keep');
    assert.strictEqual(
      await fsp.readFile(path.join(home, '.trae', 'plugins', 'cache', 'traex-bd-plugins', 'ai-contribution', '0.2.1', 'plugin.json'), 'utf8'),
      'keep plugin cache',
    );
    const marker = await readMarker(home);
    assert.strictEqual(marker.pluginVersion, '0.2.2');
    assert.strictEqual(marker.status, 'complete');
    assert.strictEqual(marker.filesBefore, 3);
    assert(!JSON.stringify(marker).includes(home));
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
}

async function testMarkerDoesNotSkipRecreatedData() {
  const home = await makeHome();
  try {
    const hooksRoot = path.join(home, '.trae', 'hooks');
    await writeFixture(hooksRoot, 'ai-contribution-sdk/first', 'one');
    await runCleanup(home);
    await writeFixture(hooksRoot, 'ai-contribution-sdk/second', 'two');
    const second = await runCleanup(home);
    assert.strictEqual(second.status, 'complete');
    assert.strictEqual(second.filesBefore, 1);
    assert.deepStrictEqual(await ownedEntries(home), []);
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
}

async function testStaleQuarantineCleanup() {
  const home = await makeHome();
  try {
    const stale = path.join(home, '.trae', 'hooks', '.ai-contribution-sdk.retired-v1-123-deadbeef');
    await writeFixture(stale, 'pending', 'old');
    const summary = await runCleanup(home);
    assert.strictEqual(summary.status, 'complete');
    assert.strictEqual(summary.filesBefore, 1);
    assert.strictEqual(await pathExists(stale), false);
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
}

async function testTargetSymlinkRejected() {
  if (process.platform === 'win32') {
    return;
  }
  const home = await makeHome();
  const outside = await fsp.mkdtemp(path.join(os.tmpdir(), 'ai-contribution-retire-outside-'));
  try {
    const hooksRoot = path.join(home, '.trae', 'hooks');
    await fsp.mkdir(hooksRoot, { recursive: true });
    await writeFixture(outside, 'keep', 'outside');
    await fsp.symlink(outside, path.join(hooksRoot, 'ai-contribution-sdk'));
    const summary = await runCleanup(home);
    assert.strictEqual(summary.status, 'partial');
    assert(summary.errorCodes.includes('TARGET_SYMLINK'));
    assert.strictEqual(await fsp.readFile(path.join(outside, 'keep'), 'utf8'), 'outside');
    assert.strictEqual((await fsp.lstat(path.join(hooksRoot, 'ai-contribution-sdk'))).isSymbolicLink(), true);
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
    await fsp.rm(outside, { recursive: true, force: true });
  }
}

async function testParentSymlinkRejected() {
  if (process.platform === 'win32') {
    return;
  }
  const home = await makeHome();
  const outside = await fsp.mkdtemp(path.join(os.tmpdir(), 'ai-contribution-retire-parent-outside-'));
  try {
    await fsp.mkdir(path.join(home, '.trae'), { recursive: true });
    await writeFixture(outside, 'ai-contribution-sdk/keep', 'outside');
    await fsp.symlink(outside, path.join(home, '.trae', 'hooks'));
    const summary = await runCleanup(home);
    assert.strictEqual(summary.status, 'partial');
    assert(summary.errorCodes.includes('PARENT_SYMLINK'));
    assert.strictEqual(await fsp.readFile(path.join(outside, 'ai-contribution-sdk', 'keep'), 'utf8'), 'outside');
    assert.strictEqual(await pathExists(path.join(outside, MARKER_NAME)), false);
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
    await fsp.rm(outside, { recursive: true, force: true });
  }
}

async function testSymlinkedHomeAccepted() {
  if (process.platform === 'win32') {
    return;
  }
  const root = await makeHome();
  try {
    const realHome = path.join(root, 'real-home');
    const linkedHome = path.join(root, 'linked-home');
    await writeFixture(realHome, '.trae/hooks/ai-contribution-sdk/data', 'remove');
    await fsp.symlink(realHome, linkedHome);

    const summary = await runCleanup(linkedHome);

    assert.strictEqual(summary.status, 'complete');
    assert.strictEqual(summary.filesBefore, 1);
    assert.strictEqual(await pathExists(path.join(realHome, '.trae', 'hooks', 'ai-contribution-sdk')), false);
    assert.strictEqual((await readMarker(realHome)).status, 'complete');
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

async function testSymlinkedFilesystemRootRejected() {
  if (process.platform === 'win32') {
    return;
  }
  const root = await makeHome();
  try {
    const linkedHome = path.join(root, 'linked-root');
    await fsp.symlink(path.parse(root).root, linkedHome);

    const summary = await runCleanup(linkedHome);

    assert.strictEqual(summary.status, 'partial');
    assert.deepStrictEqual(summary.errorCodes, ['HOME_UNSAFE']);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

async function testNonDirectoryTargetRejected() {
  const home = await makeHome();
  try {
    const target = path.join(home, '.trae', 'hooks', 'ai-contribution');
    await writeFixture(path.dirname(target), path.basename(target), 'keep');
    const summary = await runCleanup(home);
    assert.strictEqual(summary.status, 'partial');
    assert(summary.errorCodes.includes('TARGET_NOT_DIRECTORY'));
    assert.strictEqual(await fsp.readFile(target, 'utf8'), 'keep');
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
}

async function testMarkerSymlinkRejected() {
  if (process.platform === 'win32') {
    return;
  }
  const home = await makeHome();
  const outside = await fsp.mkdtemp(path.join(os.tmpdir(), 'ai-contribution-retire-marker-outside-'));
  try {
    const hooksRoot = path.join(home, '.trae', 'hooks');
    const outsideMarker = path.join(outside, 'keep');
    await writeFixture(hooksRoot, 'ai-contribution-sdk/data', 'remove');
    await fsp.writeFile(outsideMarker, 'outside');
    await fsp.symlink(outsideMarker, path.join(hooksRoot, MARKER_NAME));
    const summary = await runCleanup(home);
    assert.strictEqual(summary.status, 'partial');
    assert(summary.errorCodes.includes('MARKER_SYMLINK'));
    assert.strictEqual(await fsp.readFile(outsideMarker, 'utf8'), 'outside');
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
    await fsp.rm(outside, { recursive: true, force: true });
  }
}

async function testConcurrentHookProcesses() {
  const home = await makeHome();
  try {
    const hooksRoot = path.join(home, '.trae', 'hooks');
    for (let index = 0; index < 100; index += 1) {
      await writeFixture(hooksRoot, `ai-contribution-sdk/blobs/${index}`, String(index));
    }
    const outside = await fsp.mkdtemp(path.join(os.tmpdir(), 'ai-contribution-retire-env-outside-'));
    await writeFixture(outside, 'keep', 'outside');
    const env = {
      ...process.env,
      HOME: home,
      AI_CONTRIBUTION_LOG_DIR: outside,
      AI_CONTRIBUTION_SDK_DEPS_PREFIX: outside,
      AI_CONTRIBUTION_NPM_CACHE: outside,
    };
    const largePayload = JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      prompt: 'x'.repeat(2 * 1024 * 1024),
    });
    const results = await Promise.all([
      runHookProcess(env, largePayload),
      runHookProcess(env, largePayload),
    ]);
    assert.deepStrictEqual(results, [
      { stdout: '', stderr: '' },
      { stdout: '', stderr: '' },
    ]);
    assert.deepStrictEqual(await ownedEntries(home), []);
    const marker = await readMarker(home);
    assert.strictEqual(marker.pluginVersion, '0.2.2');
    assert.strictEqual(marker.status, 'complete');
    assert.strictEqual(await fsp.readFile(path.join(outside, 'keep'), 'utf8'), 'outside');
    await fsp.rm(outside, { recursive: true, force: true });
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
}

async function testOpenStdinDoesNotBlockExit() {
  const home = await makeHome();
  try {
    const hooksRoot = path.join(home, '.trae', 'hooks');
    await writeFixture(hooksRoot, 'ai-contribution-sdk/data', 'remove');
    const result = await runHookProcess(
      { ...process.env, HOME: home },
      JSON.stringify({ hook_event_name: 'UserPromptSubmit' }),
      { keepStdinOpen: true, timeoutMs: 3_000 },
    );

    assert.deepStrictEqual(result, { stdout: '', stderr: '' });
    assert.deepStrictEqual(await ownedEntries(home), []);
    assert.strictEqual((await readMarker(home)).status, 'complete');
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
}

async function testFilesystemRootRejected() {
  const summary = await runCleanup(path.parse(process.cwd()).root);
  assert.strictEqual(summary.status, 'partial');
  assert.deepStrictEqual(summary.errorCodes, ['HOME_UNSAFE']);
}

async function testRelativeHomeRejected() {
  const summary = await runCleanup('.');
  assert.strictEqual(summary.status, 'partial');
  assert.deepStrictEqual(summary.errorCodes, ['HOME_UNSAFE']);
}

async function main() {
  await testManifest();
  await testCleanupAndAllowlist();
  await testMarkerDoesNotSkipRecreatedData();
  await testStaleQuarantineCleanup();
  await testTargetSymlinkRejected();
  await testParentSymlinkRejected();
  await testSymlinkedHomeAccepted();
  await testSymlinkedFilesystemRootRejected();
  await testNonDirectoryTargetRejected();
  await testMarkerSymlinkRejected();
  await testConcurrentHookProcesses();
  await testOpenStdinDoesNotBlockExit();
  await testFilesystemRootRejected();
  await testRelativeHomeRejected();
  process.stdout.write('ai-contribution retire cleanup tests passed\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
