#!/usr/bin/env node
/* eslint-disable no-console */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const TEST_ADAPTER_LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-adapter-test-log-'));
process.env.AI_CONTRIBUTION_LOG_DIR = TEST_ADAPTER_LOG_DIR;

const {
  collectToolPathCandidates,
  createGhostSnapshot,
  filterAlreadyDirectReportedBlocks,
  pathSnapshotDiff,
  parseUnifiedGitDiff,
  safeSnapshotPathspecsForRoot,
  snapshotPathsForRoot,
} = require('../ai_contribution_sdk_adapter');

const ADAPTER_PATH = path.join(__dirname, '..', 'ai_contribution_sdk_adapter.js');
const RUNNER_PATH = path.join(__dirname, '..', 'ai_contribution_sdk_hook.js');
const HOOKS_PATH = path.join(__dirname, '..', 'hooks.json');

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-path-snapshot-test-'));
  git(['init'], root);
  git(['config', 'user.name', 'AI Contribution Test'], root);
  git(['config', 'user.email', 'ai-contribution-test@example.invalid'], root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'other'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'tracked.js'), 'const value = 1;\n');
  fs.writeFileSync(path.join(root, 'other', 'untouched.js'), 'const untouched = true;\n');
  git(['add', '--all'], root);
  git(['commit', '-m', 'initial'], root);
  return root;
}

/** Compare repository roots by filesystem identity so macOS /var aliases do not affect assertions. */
function sameFilesystemPath(left, right) {
  return fs.realpathSync(left) === fs.realpathSync(right);
}

function changedFilesBetween(fromCommit, toCommit, root) {
  const from = typeof fromCommit === 'string' ? fromCommit : fromCommit.id;
  const to = typeof toCommit === 'string' ? toCommit : toCommit.id;
  return git(['diff', '--name-only', from, to, '--'], root)
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();
}

function changedFilesBetweenSnapshots(fromSnapshot, toSnapshot, root) {
  return parseUnifiedGitDiff(pathSnapshotDiff(fromSnapshot, toSnapshot), root)
    .map((block) => path.relative(root, block.filePath))
    .sort();
}

function runHook(payload, env) {
  execFileSync(process.execPath, [ADAPTER_PATH], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
}

function runHookRunner(payload, env) {
  const runnerEnv = { ...process.env, ...env };
  delete runnerEnv.HOME;
  execFileSync(process.execPath, [RUNNER_PATH], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: runnerEnv,
  });
}

function runAdapterSnippet(script, env) {
  return execFileSync(process.execPath, ['-e', script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  }).trim();
}

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function main() {
  const root = makeRepo();
  try {
    const commandOnlyPaths = collectToolPathCandidates({
      cwd: root,
      tool_input: {
        workdir: root,
        command: 'git status',
      },
    });
    assert.deepStrictEqual(commandOnlyPaths, [], 'workdir-only commands must not snapshot the repo root');

    assert.deepStrictEqual(
      safeSnapshotPathspecsForRoot(root, [root]),
      { safe: ['.'], skipped: [] },
      'repo root pathspec should be allowed for small repositories',
    );
    assert.deepStrictEqual(
      safeSnapshotPathspecsForRoot(root, [path.join(root, 'src')]),
      { safe: ['src'], skipped: [] },
      'directory pathspecs should be allowed for small repositories',
    );
    const rootSnapshot = createGhostSnapshot(root, 'wide root should snapshot small repo', [root]);
    assert.strictEqual(rootSnapshot.skipped, undefined);
    assert.deepStrictEqual(rootSnapshot.paths, ['.']);
    assert.strictEqual(rootSnapshot.kind, 'path_content');
    assert(rootSnapshot.snapshottedPaths.includes('src/tracked.js'));
    assert(rootSnapshot.snapshottedPaths.includes('other/untouched.js'));
    fs.mkdirSync(path.join(root, 'workspace'), { recursive: true });
    fs.writeFileSync(path.join(root, 'workspace', 'runtime.jsonl'), '{"runtime":true}\n');
    fs.writeFileSync(path.join(root, '.gitignore'), 'workspace/\n');
    const ignoredRuntimeSnapshot = createGhostSnapshot(root, 'ignored runtime files', [root]);
    assert(!ignoredRuntimeSnapshot.snapshottedPaths.includes('workspace/runtime.jsonl'));
    const hostileFindDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-hostile-find-'));
    const hostileFindPath = path.join(hostileFindDir, process.platform === 'win32' ? 'find.cmd' : 'find');
    fs.writeFileSync(hostileFindPath, process.platform === 'win32' ? '@exit /b 99\r\n' : '#!/bin/sh\nexit 99\n');
    fs.chmodSync(hostileFindPath, 0o755);
    const portableWidePathspecResult = JSON.parse(runAdapterSnippet(
      [
        'const adapter = require("./ai_contribution_sdk_adapter");',
        `const root = ${JSON.stringify(root)};`,
        'console.log(JSON.stringify(adapter.safeSnapshotPathspecsForRoot(root, [root])));',
      ].join(' '),
      { PATH: `${hostileFindDir}${path.delimiter}${process.env.PATH || ''}` },
    ));
    assert.deepStrictEqual(
      portableWidePathspecResult,
      { safe: ['.'], skipped: [] },
      'wide snapshots must not depend on a platform-specific find implementation',
    );
    fs.rmSync(hostileFindDir, { recursive: true, force: true });

    const fileCountLimitResult = JSON.parse(runAdapterSnippet(
      [
        'const adapter = require("./ai_contribution_sdk_adapter");',
        `const root = ${JSON.stringify(root)};`,
        'const snapshot = adapter.createGhostSnapshot(root, "file count limit", [root]);',
        'console.log(JSON.stringify({ skipped: snapshot.skipped, reason: snapshot.reason, limit: snapshot.limit }));',
      ].join(' '),
      { AI_CONTRIBUTION_SNAPSHOT_FILE_COUNT_LIMIT: '1' },
    ));
    assert.deepStrictEqual(
      fileCountLimitResult,
      { skipped: true, reason: 'snapshot_file_count_exceeds_limit', limit: 1 },
      'wide snapshots must remain bounded by the configured file-count limit',
    );

    const mixedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-mixed-path-limit-'));
    try {
      git(['init'], mixedRoot);
      fs.mkdirSync(path.join(mixedRoot, 'docs'));
      fs.mkdirSync(path.join(mixedRoot, 'dist'));
      fs.writeFileSync(path.join(mixedRoot, 'code.js'), 'const mixed = 1;\n');
      for (let i = 0; i < 20; i++) {
        fs.writeFileSync(path.join(mixedRoot, 'docs', i + '.md'), 'document\n');
        fs.writeFileSync(path.join(mixedRoot, 'dist', i + '.js'), 'generated\n');
      }
      git(['add', '--all'], mixedRoot);
      const mixedResult = JSON.parse(runAdapterSnippet([
        'const fs = require("fs");',
        'const path = require("path");',
        'const adapter = require(process.env.AI_CONTRIBUTION_TEST_ADAPTER_MODULE || "./ai_contribution_sdk_adapter");',
        'const storage = require("./storage.cjs");',
        'storage.withRoot(() => {',
        'const root = process.env.AI_CONTRIBUTION_TEST_MIXED_ROOT;',
        'const before = adapter.createGhostSnapshot(root, "mixed before", [root]);',
        'fs.writeFileSync(path.join(root, "code.js"), "const mixed = 2;\\n");',
        'const after = adapter.createGhostSnapshot(root, "mixed after", [root]);',
        'const blocks = before.skipped || after.skipped ? [] : adapter.parseUnifiedGitDiff(adapter.pathSnapshotDiff(before, after), root);',
        'fs.writeFileSync(path.join(root, "extra.js"), "const extra = 1;\\n");',
        'const exceeded = adapter.createGhostSnapshot(root, "over limit", [root]);',
        'console.log(JSON.stringify({before: {skipped:before.skipped, paths:before.snapshottedPaths}, after: {skipped:after.skipped, paths:after.snapshottedPaths}, blockCount:blocks.length, exceeded:{skipped:exceeded.skipped, reason:exceeded.reason, fileCount:exceeded.fileCount, limit:exceeded.limit}}));',
        '});',
      ].join(' '), { AI_CONTRIBUTION_SNAPSHOT_FILE_COUNT_LIMIT: '1', AI_CONTRIBUTION_TEST_MIXED_ROOT: mixedRoot }));
      assert.deepStrictEqual(mixedResult.before, { paths: ['code.js'] }, 'filtered tracked files must not consume the code snapshot count');
      assert.deepStrictEqual(mixedResult.after, { paths: ['code.js'] });
      assert.strictEqual(mixedResult.blockCount, 1, 'actual source change must remain reportable among many filtered files');
      assert.deepStrictEqual(mixedResult.exceeded, { skipped: true, reason: 'snapshot_file_count_exceeds_limit', fileCount: 2, limit: 1 });
    } finally { fs.rmSync(mixedRoot, { recursive: true, force: true }); }

    const totalSizeLimitResult = JSON.parse(runAdapterSnippet(
      [
        'const adapter = require("./ai_contribution_sdk_adapter");',
        `const root = ${JSON.stringify(root)};`,
        'const snapshot = adapter.createGhostSnapshot(root, "total size limit", [root]);',
        'console.log(JSON.stringify({ skipped: snapshot.skipped, reason: snapshot.reason, limit: snapshot.limit }));',
      ].join(' '),
      { AI_CONTRIBUTION_SNAPSHOT_TOTAL_SIZE_LIMIT_BYTES: '1' },
    ));
    assert.deepStrictEqual(
      totalSizeLimitResult,
      { skipped: true, reason: 'snapshot_total_size_exceeds_limit', limit: 1 },
      'wide snapshots must remain bounded by the configured total-size limit',
    );

    const shellWritePaths = collectToolPathCandidates({
      cwd: root,
      tool_input: {
        workdir: root,
        command: [
          'printf value > src/generated.js',
          'echo more >> "src/generated.js"',
          'cat input | tee src/tee.js',
          'sed -i s/1/2/ src/tracked.js',
          'cd other && touch nested.js',
        ].join('; '),
      },
    });
    assert.deepStrictEqual(
      snapshotPathsForRoot(root, shellWritePaths).sort(),
      ['other/nested.js', 'src/generated.js', 'src/tee.js', 'src/tracked.js'],
      'shell write commands should expose touched file candidates',
    );

    const powerShellWritePaths = collectToolPathCandidates({
      cwd: root,
      tool_input: {
        workdir: root,
        command: [
          'Set-Content -Path "src/generated.ps1" -Value "value"',
          'Add-Content -LiteralPath "src/generated.ps1" -Value "more"',
          'Get-Content input.txt | Out-File -FilePath "src/output.ps1"',
          'Set-Content -NoNewline "src/positional.ps1" -Value "value"',
          'Copy-Item "src/positional.ps1" "src/copied.ps1"',
        ].join('; '),
      },
    });
    assert.deepStrictEqual(
      snapshotPathsForRoot(root, powerShellWritePaths).sort(),
      ['src/copied.ps1', 'src/generated.ps1', 'src/output.ps1', 'src/positional.ps1'],
      'PowerShell write commands should expose touched file candidates',
    );

    const cmdWritePaths = collectToolPathCandidates({
      cwd: root,
      tool_input: {
        workdir: root,
        command: 'copy /Y src/tracked.js src/copied.js\nmove /Y src/copied.js src/moved.js',
      },
    });
    assert.deepStrictEqual(
      snapshotPathsForRoot(root, cmdWritePaths).sort(),
      ['src/copied.js', 'src/moved.js', 'src/tracked.js'],
      'cmd.exe copy and move switches must not be mistaken for file paths',
    );

    const patchPaths = collectToolPathCandidates({
      cwd: root,
      tool_input: {
        workdir: root,
        command: '*** Begin Patch\n*** Update File: src/tracked.js\n@@\n-old\n+new\n*** End Patch\n',
      },
    });
    assert.deepStrictEqual(snapshotPathsForRoot(root, patchPaths), ['src/tracked.js']);

    const before = createGhostSnapshot(root, 'before', [path.join(root, 'src', 'tracked.js')]);
    fs.writeFileSync(path.join(root, 'src', 'tracked.js'), 'const value = 2;\n');
    fs.writeFileSync(path.join(root, 'other', 'untouched.js'), 'const untouched = false;\n');
    const after = createGhostSnapshot(root, 'after', [path.join(root, 'src', 'tracked.js')]);
    assert.deepStrictEqual(after.paths, ['src/tracked.js']);
    assert.deepStrictEqual(
      changedFilesBetweenSnapshots(before, after, root),
      ['src/tracked.js'],
      'path-limited snapshots must exclude unrelated working-tree changes',
    );

    const newFilePath = path.join(root, 'src', 'created.js');
    const beforeCreate = createGhostSnapshot(root, 'before create', [newFilePath]);
    assert.deepStrictEqual(beforeCreate.paths, ['src/created.js']);
    assert.deepStrictEqual(beforeCreate.snapshottedPaths, ['src/created.js']);
    fs.writeFileSync(newFilePath, 'const created = true;\n');
    const afterCreate = createGhostSnapshot(root, 'after create', [newFilePath]);
    assert.deepStrictEqual(afterCreate.snapshottedPaths, ['src/created.js']);
    assert.deepStrictEqual(changedFilesBetweenSnapshots(beforeCreate, afterCreate, root), ['src/created.js']);

    const existingUserFile = path.join(root, 'src', 'user-owned.js');
    fs.writeFileSync(existingUserFile, 'const userLine1 = true;\nconst userLine2 = true;\n');
    const beforeAiAppend = createGhostSnapshot(root, 'before ai append', [existingUserFile]);
    fs.appendFileSync(existingUserFile, 'const aiLine = true;\n');
    const afterAiAppend = createGhostSnapshot(root, 'after ai append', [existingUserFile]);
    const appendBlocks = parseUnifiedGitDiff(pathSnapshotDiff(beforeAiAppend, afterAiAppend), root);
    assert.strictEqual(appendBlocks.length, 1);
    assert.strictEqual(
      appendBlocks[0].acceptCode,
      'const aiLine = true;\n',
      'pre-existing user code must remain in the before snapshot and must not be attributed to AI',
    );

    const crlfFile = path.join(root, 'src', 'crlf.js');
    fs.writeFileSync(crlfFile, 'const first = true;\r\nconst second = true;\r\n');
    const beforeCrlfAppend = createGhostSnapshot(root, 'before CRLF append', [crlfFile]);
    fs.appendFileSync(crlfFile, 'const aiCrlfLine = true;\r\n');
    const afterCrlfAppend = createGhostSnapshot(root, 'after CRLF append', [crlfFile]);
    const crlfBlocks = parseUnifiedGitDiff(pathSnapshotDiff(beforeCrlfAppend, afterCrlfAppend), root);
    assert.strictEqual(crlfBlocks.length, 1);
    assert.strictEqual(crlfBlocks[0].acceptCode, 'const aiCrlfLine = true;\n');
    assert.deepStrictEqual(
      crlfBlocks[0].position,
      { line: 2, character: 0 },
      'CRLF files must locate inserted code at its real line instead of falling back to 0:0',
    );

    const unicodeFile = path.join(root, 'src', '测试.js');
    fs.writeFileSync(unicodeFile, 'const unicodeValue = 1;\n');
    const beforeUnicodeWide = createGhostSnapshot(root, 'before Unicode wide snapshot', [root]);
    assert(
      beforeUnicodeWide.snapshottedPaths.includes('src/测试.js'),
      'wide snapshots must preserve non-ASCII Git paths without C-style quoting corruption',
    );
    fs.appendFileSync(unicodeFile, 'const unicodeAiLine = true;\n');
    const afterUnicodeWide = createGhostSnapshot(root, 'after Unicode wide snapshot', [root]);
    assert(
      changedFilesBetweenSnapshots(beforeUnicodeWide, afterUnicodeWide, root).includes('src/测试.js'),
      'wide snapshots must report changes in non-ASCII paths',
    );

    const beforeUnknownScript = createGhostSnapshot(root, 'before unknown script', [root]);
    fs.writeFileSync(path.join(root, 'src', 'unknown-script-output.js'), 'const generated = true;\n');
    const afterUnknownScript = createGhostSnapshot(root, 'after unknown script', [root]);
    assert(
      beforeUnknownScript.snapshottedPaths.includes('src/user-owned.js'),
      'wide fallback coverage must be captured before the unknown script runs',
    );
    assert.deepStrictEqual(
      changedFilesBetweenSnapshots(beforeUnknownScript, afterUnknownScript, root),
      ['src/unknown-script-output.js'],
      'unknown scripts should retain broad detection without treating pre-existing files as newly generated',
    );

    const ignoredFilePath = path.join(root, 'workspace', 'new-runtime.jsonl');
    fs.writeFileSync(ignoredFilePath, '{"ignored":true}\n');
    const ignoredFileSnapshot = createGhostSnapshot(root, 'ignored file', [ignoredFilePath]);
    assert.deepStrictEqual(ignoredFileSnapshot.snapshottedPaths, []);

    const beforeMixed = createGhostSnapshot(root, 'before mixed', [path.join(root, 'src', 'created.js'), path.join(root, 'src', 'tracked.js')]);
    fs.writeFileSync(path.join(root, 'src', 'created.js'), 'const created = false;\n');
    fs.writeFileSync(path.join(root, 'src', 'tracked.js'), 'const value = 3;\n');
    const afterMixed = createGhostSnapshot(root, 'after mixed', [path.join(root, 'src', 'created.js'), path.join(root, 'src', 'tracked.js')]);
    const diffText = pathSnapshotDiff(beforeMixed, afterMixed);
    const blocks = parseUnifiedGitDiff(diffText, root);
    assert.strictEqual(blocks.length, 2, 'mixed diff should produce two reportable blocks');
    const directBlock = blocks.find((block) => block.filePath.endsWith('src/created.js'));
    const remaining = filterAlreadyDirectReportedBlocks(blocks, {
      directReportBlockSignatures: [
        require('crypto')
          .createHash('sha1')
          .update([
            path.resolve(directBlock.filePath),
            directBlock.acceptCode,
            `${directBlock.range.start.line}:${directBlock.range.start.character}`,
          ].join('\0'))
          .digest('hex'),
      ],
    });
    assert.deepStrictEqual(
      remaining.map((block) => path.relative(root, block.filePath)).sort(),
      ['src/tracked.js'],
      'turn diff should continue after direct reports while deduping already-reported blocks',
    );

    const hooksConfig = JSON.parse(fs.readFileSync(HOOKS_PATH, 'utf8'));
    const hookEntries = Object.values(hooksConfig.hooks)
      .flatMap((groups) => groups)
      .flatMap((group) => group.hooks);
    assert(hookEntries.length > 0);
    assert(
      hookEntries.every((hook) => hook.command === 'node "__PLUGIN_DIR__/ai_contribution_sdk_hook.js"'),
      'plugin hook commands must be shell-neutral across POSIX shells, PowerShell, and cmd.exe',
    );
    assert(
      hookEntries.every((hook) => hook.timeout >= 30),
      'outer hook timeouts must cover bounded adapter execution',
    );

    const runnerLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-runner-log-'));
    runHookRunner({
      session_id: 'portable-runner-session',
      turn_id: 'portable-runner-turn',
      message_id: 'portable-runner-message',
      cwd: root,
      model: 'test-model',
      hook_event_name: 'UserPromptSubmit',
    }, {
      AI_CONTRIBUTION_LOG_DIR: runnerLogDir,
      AI_CONTRIBUTION_SDK_DRY_RUN: '1',
    });
    assert(
      readJsonLines(path.join(runnerLogDir, 'diagnostics.jsonl'))
        .some((entry) => entry.event === 'turn_snapshot_start'),
      'Node hook runner must work without HOME and without loading reporter dependencies for snapshot-only events',
    );
    fs.rmSync(runnerLogDir, { recursive: true, force: true });

    const timeoutPluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-timeout-plugin-'));
    fs.writeFileSync(
      path.join(timeoutPluginDir, 'ai_contribution_sdk_adapter.js'),
      'setTimeout(() => {}, 10000);\n',
    );
    const timeoutLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-timeout-log-'));
    const timeoutResult = require('child_process').spawnSync(process.execPath, [RUNNER_PATH], {
      input: JSON.stringify({ hook_event_name: 'UserPromptSubmit' }), encoding: 'utf8',
      env: { ...process.env,
      AI_CONTRIBUTION_PLUGIN_DIR: timeoutPluginDir,
      AI_CONTRIBUTION_LOG_DIR: timeoutLogDir,
      AI_CONTRIBUTION_ADAPTER_TIMEOUT_MS: '50', },
    });
    assert.strictEqual(timeoutResult.status, 0);
    assert(
      timeoutResult.stderr.includes('hook_adapter_process'),
      'Node hook runner must bound adapter execution even where the GNU timeout command is unavailable',
    );
    fs.rmSync(timeoutPluginDir, { recursive: true, force: true });
    fs.rmSync(timeoutLogDir, { recursive: true, force: true });

    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-tool-span-log-'));
    const hookEnv = {
      AI_CONTRIBUTION_SDK_DRY_RUN: '1',
      AI_CONTRIBUTION_LOG_DIR: logDir,
      AI_CONTRIBUTION_USERNAME: 'ai-contribution-test',
      AI_CONTRIBUTION_DEVICE_ID: 'device_ai_contribution_test',
    };
    const sessionId = 'path-snapshot-tool-span-session';
    const basePayload = {
      session_id: sessionId,
      cwd: root,
      model: 'test-model',
    };
    runHook({
      ...basePayload,
      hook_event_name: 'UserPromptSubmit',
      turn_id: 'turn-1',
      message_id: 'message-1',
    }, hookEnv);
    runHook({
      ...basePayload,
      hook_event_name: 'PreToolUse',
      turn_id: 'turn-1',
      message_id: 'message-1',
      tool_use_id: 'tool-repo-local',
      tool_name: 'Bash',
      tool_input: {
        workdir: root,
        command: 'printf "const recovered = true;\\n" > src/recovered.js',
      },
    }, hookEnv);
    fs.writeFileSync(path.join(root, 'src', 'recovered.js'), 'const recovered = true;\n');
    runHook({
      ...basePayload,
      hook_event_name: 'PostToolUse',
      turn_id: 'turn-1',
      message_id: 'message-1',
      tool_use_id: 'tool-repo-local',
      tool_name: 'Bash',
      tool_input: {
        workdir: root,
        command: 'printf "const recovered = true;\\n" > src/recovered.js',
      },
      tool_response: 'completed',
    }, hookEnv);
    const diagnostics = readJsonLines(path.join(logDir, 'diagnostics.jsonl'));
    assert(
      diagnostics.some((entry) => entry.event === 'tool_snapshot_post' && entry.blockCount > 0),
      'PostToolUse should report a repository-local write from its immutable pre-tool snapshot',
    );
    const reports = readJsonLines(path.join(logDir, 'reports.jsonl'));
    assert(
      reports.some((entry) => entry.event === 'ai_contribution_code' && entry.source === 'tool_git_diff' && entry.count > 0),
      'repository-local writes should emit tool_git_diff contribution reports',
    );
    fs.rmSync(logDir, { recursive: true, force: true });

    const outsideCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-outside-cwd-'));
    const outsideLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-outside-log-'));
    const outsideEnv = { ...hookEnv, AI_CONTRIBUTION_LOG_DIR: outsideLogDir };
    const outsideFile = path.join(root, 'src', 'outside-write.js');
    const outsidePayload = {
      session_id: 'outside-session',
      turn_id: 'outside-turn',
      message_id: 'outside-message',
      cwd: outsideCwd,
      model: 'test-model',
      tool_use_id: 'tool-outside-write',
      tool_name: 'Bash',
      tool_input: {
        workdir: outsideCwd,
        command: `printf "const outside = true;\\n" > ${JSON.stringify(outsideFile)}`,
      },
    };
    runHook({ ...outsidePayload, hook_event_name: 'UserPromptSubmit' }, outsideEnv);
    runHook({ ...outsidePayload, hook_event_name: 'PreToolUse' }, outsideEnv);
    fs.writeFileSync(outsideFile, 'const outside = true;\n');
    runHook({ ...outsidePayload, hook_event_name: 'PostToolUse', tool_response: 'completed' }, outsideEnv);
    const outsideDiagnostics = readJsonLines(path.join(outsideLogDir, 'diagnostics.jsonl'));
    const outsideStart = outsideDiagnostics.find((entry) => entry.event === 'tool_snapshot_start');
    assert(
      outsideStart && outsideStart.roots.some((entry) => sameFilesystemPath(entry.root, root)),
      'writes from a non-Git cwd must resolve the target repository root',
    );
    assert(
      outsideDiagnostics.some((entry) => entry.event === 'tool_snapshot_post' && entry.blockCount > 0),
      'writes from outside the repository should still be reported',
    );
    fs.rmSync(outsideCwd, { recursive: true, force: true });
    fs.rmSync(outsideLogDir, { recursive: true, force: true });

    const linkedWorktree = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-linked-worktree-'));
    fs.rmdirSync(linkedWorktree);
    git(['worktree', 'add', '-b', `ai-contribution-test-${process.pid}`, linkedWorktree, 'HEAD'], root);
    const worktreeLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-worktree-log-'));
    const worktreeEnv = { ...hookEnv, AI_CONTRIBUTION_LOG_DIR: worktreeLogDir };
    const worktreeFile = path.join(linkedWorktree, 'src', 'tracked.js');
    const worktreePayload = {
      session_id: 'worktree-session',
      turn_id: 'worktree-turn',
      message_id: 'worktree-message',
      cwd: linkedWorktree,
      model: 'test-model',
      tool_use_id: 'tool-worktree-write',
      tool_name: 'Bash',
      tool_input: {
        workdir: linkedWorktree,
        command: 'printf "const value = 9;\\n" > src/tracked.js',
      },
    };
    try {
      runHook({ ...worktreePayload, hook_event_name: 'UserPromptSubmit' }, worktreeEnv);
      runHook({ ...worktreePayload, hook_event_name: 'PreToolUse' }, worktreeEnv);
      fs.writeFileSync(worktreeFile, 'const value = 9;\n');
      runHook({ ...worktreePayload, hook_event_name: 'PostToolUse', tool_response: 'completed' }, worktreeEnv);
      const worktreeDiagnostics = readJsonLines(path.join(worktreeLogDir, 'diagnostics.jsonl'));
      const worktreeStart = worktreeDiagnostics.find((entry) => entry.event === 'tool_snapshot_start');
      assert(
        worktreeStart && worktreeStart.roots.some((entry) => sameFilesystemPath(entry.root, linkedWorktree)),
        'linked Git worktrees must use their own worktree root',
      );
      assert(
        worktreeDiagnostics.some((entry) => entry.event === 'tool_snapshot_post' && entry.blockCount > 0),
        'linked Git worktree writes should be reported',
      );
    } finally {
      git(['worktree', 'remove', '--force', linkedWorktree], root);
      fs.rmSync(worktreeLogDir, { recursive: true, force: true });
    }

    const nonGitCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-non-git-cwd-'));
    const nonGitLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-non-git-log-'));
    const nonGitEnv = {
      AI_CONTRIBUTION_SDK_DRY_RUN: '1',
      AI_CONTRIBUTION_LOG_DIR: nonGitLogDir,
      AI_CONTRIBUTION_USERNAME: 'ai-contribution-test',
      AI_CONTRIBUTION_DEVICE_ID: 'device_ai_contribution_test',
    };
    const nonGitPayload = {
      session_id: 'non-git-session',
      turn_id: 'non-git-turn',
      message_id: 'non-git-message',
      cwd: nonGitCwd,
      model: 'test-model',
    };
    runHook({
      ...nonGitPayload,
      hook_event_name: 'UserPromptSubmit',
    }, nonGitEnv);
    runHook({
      ...nonGitPayload,
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: {
        workdir: nonGitCwd,
        command: 'printf "const local = true;\\n" > local.js',
      },
    }, nonGitEnv);
    runHook({
      ...nonGitPayload,
      hook_event_name: 'Stop',
    }, nonGitEnv);
    const nonGitDiagnostics = readJsonLines(path.join(nonGitLogDir, 'diagnostics.jsonl'));
    assert(
      nonGitDiagnostics.some((entry) => (
        entry.event === 'turn_snapshot_start' &&
        entry.cwdGitStatus === 'cwd_not_git_repository' &&
        /Git worktree/.test(entry.message || '')
      )),
      'non-Git cwd should be identified as an environment precondition, not a plugin failure',
    );
    assert(
      nonGitDiagnostics.some((entry) => (
        entry.event === 'tool_snapshot_start' &&
        entry.status === 'skip' &&
        entry.nonGitCandidates.length === 1
      )),
      'tool paths outside Git repositories should be logged as non-reportable paths',
    );
    assert(
      nonGitDiagnostics.some((entry) => (
        entry.event === 'turn_snapshot_stop' &&
        entry.status === 'ok' &&
        entry.toolSpanCount === 1 &&
        entry.completedToolSpanCount === 1
      )),
      'Stop should terminalize non-reportable tool spans without historical recovery',
    );
    fs.rmSync(nonGitCwd, { recursive: true, force: true });
    fs.rmSync(nonGitLogDir, { recursive: true, force: true });

    console.log('path snapshot tests passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(TEST_ADAPTER_LOG_DIR, { recursive: true, force: true });
  }
}

main();
