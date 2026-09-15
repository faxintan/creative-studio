#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const budget = require('./hook-budget.cjs');
if (require.main === module) budget.begin();
const crypto = require('crypto');
const storage = require('./storage.cjs');
function loadReporterDependencies() { return require('./vendor/reporter.cjs'); }
const LOG_DIR = storage.ROOT;
const REPORT_LOG = path.join(LOG_DIR, 'reports.jsonl');
const DIAG_LOG = path.join(LOG_DIR, 'diagnostics.jsonl');
const STATE_DIR = path.join(LOG_DIR, 'turn-snapshots');
const SNAPSHOT_BLOB_DIR = path.join(LOG_DIR, 'snapshot-blobs');
const DRY_RUN = process.env.AI_CONTRIBUTION_SDK_DRY_RUN === '1';
const TRAE_CN_APP_ID = Number(process.env.AI_CONTRIBUTION_TEA_APP_ID || '711126');
function boundedLimit(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), fallback) : fallback;
}
const SNAPSHOT_FILE_SIZE_LIMIT_BYTES = boundedLimit('AI_CONTRIBUTION_SNAPSHOT_FILE_SIZE_LIMIT_BYTES', 2 * 1024 * 1024);
const SNAPSHOT_FILE_COUNT_LIMIT = boundedLimit('AI_CONTRIBUTION_SNAPSHOT_FILE_COUNT_LIMIT', 5000);
const SNAPSHOT_TOTAL_SIZE_LIMIT_BYTES = boundedLimit('AI_CONTRIBUTION_SNAPSHOT_TOTAL_SIZE_LIMIT_BYTES', 64 * 1024 * 1024);
const DIFF_SIZE_LIMIT_BYTES = boundedLimit('AI_CONTRIBUTION_DIFF_SIZE_LIMIT_BYTES', 4 * 1024 * 1024);
const BLOCK_COUNT_LIMIT = boundedLimit('AI_CONTRIBUTION_BLOCK_COUNT_LIMIT', 1000);

function appendJson(file, value) { storage.append(file, value); }

function readStdin() {
  return new Promise((resolve) => {
    process.stdin.setEncoding('utf8');
    let input = '';
    process.stdin.on('data', (chunk) => {
      input += chunk;
    });
    process.stdin.on('end', () => resolve(input));
  });
}

function codegenPatchFromResponse(toolResponse) {
  const patch = toolResponse && typeof toolResponse === 'object' ? toolResponse.codegen_patch : null;
  if (!patch || patch.success === false) {
    return null;
  }
  if (typeof patch.file_path !== 'string' || typeof patch.patch !== 'string') {
    return null;
  }
  if (!patch.file_path || !patch.patch) {
    return null;
  }
  return patch;
}

function patchStatus(patch) {
  if (/\*\*\* Add File:/m.test(patch)) {
    return 'A';
  }
  if (/\*\*\* Delete File:/m.test(patch)) {
    return 'D';
  }
  return 'M';
}

function successOutput(filePath, patch) {
  return `Success. Updated the following files:\n${patchStatus(patch)} ${filePath}\n`;
}

function transformPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (payload.hook_event_name !== 'PostToolUse') {
    return null;
  }
  if (payload.tool_name === 'apply_patch') {
    return {
      ...payload,
      source_tool_name: payload.tool_name,
    };
  }
  const codegenPatch = codegenPatchFromResponse(payload.tool_response);
  if (!codegenPatch) {
    return null;
  }
  return {
    ...payload,
    source_tool_name: payload.tool_name,
    tool_name: 'apply_patch',
    tool_input: { command: codegenPatch.patch },
    tool_response: successOutput(codegenPatch.file_path, codegenPatch.patch),
  };
}

const EXT_LANG_MAP = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.sh': 'shellscript',
  '.bash': 'shellscript',
  '.zsh': 'shellscript',
  '.sql': 'sql',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.md': 'markdown',
  '.vue': 'vue',
  '.dart': 'dart',
  '.lua': 'lua',
  '.r': 'r',
  '.scala': 'scala',
  '.ex': 'elixir',
  '.exs': 'elixir',
};

function detectLanguage(filePath) {
  return EXT_LANG_MAP[path.extname(filePath).toLowerCase()] || 'plaintext';
}

function getPatchText(payload) {
  const input = payload.tool_input;
  if (typeof input === 'string') {
    return input;
  }
  if (!input || typeof input !== 'object') {
    return '';
  }
  return input.command || input.patch || '';
}

function resolveFilePath(filePath, cwd) {
  if (path.isAbsolute(filePath)) {
    return path.normalize(filePath);
  }
  return path.resolve(cwd || process.cwd(), filePath);
}

function normalizeLineEndings(text) {
  return String(text || '').replace(/\r\n?/g, '\n');
}

function lineColForOffset(text, offset) {
  const before = text.slice(0, Math.max(0, offset));
  const lines = before.split('\n');
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
}

function findPosition(filePath, acceptCode, fromOffset = 0) {
  try {
    const contents = normalizeLineEndings(fs.readFileSync(filePath, 'utf8'));
    const normalizedAcceptCode = normalizeLineEndings(acceptCode);
    let offset = contents.indexOf(normalizedAcceptCode, Math.max(0, fromOffset));
    if (offset < 0) {
      offset = contents.indexOf(normalizedAcceptCode);
    }
    if (offset >= 0) {
      return lineColForOffset(contents, offset);
    }
  } catch {}
  return { line: 0, character: 0 };
}

function rangeFor(position, acceptCode) {
  const lines = acceptCode.split('\n');
  if (lines.length === 1) {
    return {
      start: position,
      end: { line: position.line, character: position.character + acceptCode.length },
    };
  }
  return {
    start: position,
    end: {
      line: position.line + lines.length - 1,
      character: lines[lines.length - 1].length,
    },
  };
}

function textForLines(lines) {
  return `${lines.join('\n')}\n`;
}

function textLengthForLines(lines) {
  return lines.length ? textForLines(lines).length : 0;
}

function pushBlock(blocks, currentFile, cwd, lines, position) {
  if (!currentFile || !lines.length) {
    return;
  }
  const acceptCode = textForLines(lines);
  const filePath = resolveFilePath(currentFile, cwd);
  const resolvedPosition = position || findPosition(filePath, acceptCode);
  blocks.push({
    filePath,
    acceptCode,
    position: resolvedPosition,
    range: rangeFor(resolvedPosition, acceptCode),
  });
}

function locateFinalHunk(filePath, finalLines, searchOffsets) {
  if (!finalLines.length) {
    return null;
  }
  try {
    const contents = normalizeLineEndings(fs.readFileSync(filePath, 'utf8'));
    const hunkText = textForLines(finalLines);
    const searchStart = searchOffsets.get(filePath) || 0;
    let offset = contents.indexOf(hunkText, searchStart);
    if (offset < 0) {
      offset = contents.indexOf(hunkText);
    }
    if (offset >= 0) {
      searchOffsets.set(filePath, offset + hunkText.length);
      return { contents, offset };
    }

    const hunkTextWithoutTrailingNewline = finalLines.join('\n');
    offset = contents.indexOf(hunkTextWithoutTrailingNewline, searchStart);
    if (offset < 0) {
      offset = contents.indexOf(hunkTextWithoutTrailingNewline);
    }
    if (offset >= 0) {
      searchOffsets.set(filePath, offset + hunkTextWithoutTrailingNewline.length);
      return { contents, offset };
    }
  } catch {}
  return null;
}

function flushUpdateHunk(blocks, currentFile, cwd, hunkItems, searchOffsets) {
  if (!currentFile || !hunkItems.length) {
    return;
  }

  const finalLines = [];
  const finalLineIndexByItem = [];
  for (const item of hunkItems) {
    finalLineIndexByItem.push(finalLines.length);
    if (item.kind === 'context' || item.kind === 'add') {
      finalLines.push(item.text);
    }
  }

  const filePath = resolveFilePath(currentFile, cwd);
  const located = locateFinalHunk(filePath, finalLines, searchOffsets);

  let plusLines = [];
  let plusStartFinalLine = 0;
  const flushPlus = () => {
    if (!plusLines.length) {
      return;
    }
    let position = null;
    if (located) {
      const prefixOffset = textLengthForLines(finalLines.slice(0, plusStartFinalLine));
      position = lineColForOffset(located.contents, located.offset + prefixOffset);
    }
    pushBlock(blocks, currentFile, cwd, plusLines, position);
    plusLines = [];
  };

  hunkItems.forEach((item, index) => {
    if (item.kind === 'add') {
      if (!plusLines.length) {
        plusStartFinalLine = finalLineIndexByItem[index];
      }
      plusLines.push(item.text);
    } else {
      flushPlus();
    }
  });
  flushPlus();
}

function parseApplyPatch(patchText, cwd) {
  const blocks = [];
  const searchOffsets = new Map();
  let currentFile = null;
  let mode = null;
  let addLines = [];
  let hunkItems = [];

  const flushCurrent = () => {
    if (mode === 'add') {
      pushBlock(blocks, currentFile, cwd, addLines, { line: 0, character: 0 });
      addLines = [];
    } else if (mode === 'update') {
      flushUpdateHunk(blocks, currentFile, cwd, hunkItems, searchOffsets);
      hunkItems = [];
    }
  };

  for (const rawLine of patchText.split(/\r?\n/)) {
    let match = rawLine.match(/^\*\*\* Add File:\s+(.+)$/);
    if (match) {
      flushCurrent();
      currentFile = match[1].trim();
      mode = 'add';
      addLines = [];
      hunkItems = [];
      continue;
    }

    match = rawLine.match(/^\*\*\* Update File:\s+(.+)$/);
    if (match) {
      flushCurrent();
      currentFile = match[1].trim();
      mode = 'update';
      addLines = [];
      hunkItems = [];
      continue;
    }

    match = rawLine.match(/^\*\*\* Move to:\s+(.+)$/);
    if (match && mode === 'update') {
      currentFile = match[1].trim();
      continue;
    }

    match = rawLine.match(/^\*\*\* Delete File:\s+(.+)$/);
    if (match) {
      flushCurrent();
      currentFile = null;
      mode = 'delete';
      addLines = [];
      hunkItems = [];
      continue;
    }

    if (/^\*\*\* End Patch$/.test(rawLine)) {
      flushCurrent();
      currentFile = null;
      mode = null;
      addLines = [];
      hunkItems = [];
      continue;
    }

    if (!currentFile) {
      continue;
    }

    if (mode === 'add') {
      if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
        addLines.push(rawLine.slice(1));
      }
      continue;
    }

    if (mode !== 'update') {
      continue;
    }

    if (rawLine.startsWith('@@')) {
      flushUpdateHunk(blocks, currentFile, cwd, hunkItems, searchOffsets);
      hunkItems = [];
    } else if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      hunkItems.push({ kind: 'add', text: rawLine.slice(1) });
    } else if (rawLine.startsWith(' ')) {
      hunkItems.push({ kind: 'context', text: rawLine.slice(1) });
    } else if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
      hunkItems.push({ kind: 'delete', text: rawLine.slice(1) });
    }
  }

  flushCurrent();
  return blocks.filter((block) => block.acceptCode.trim().length > 0);
}

function gitOutput(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: budget.timeout(1500, 30),
    }).trim();
  } catch {
    return '';
  }
}

function gitInfoForFile(filePath) {
  const dir = fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()
    ? filePath
    : path.dirname(filePath);
  const root = gitOutput(['rev-parse', '--show-toplevel'], dir);
  if (!root) {
    return null;
  }
  const url = gitOutput(['remote', 'get-url', 'origin'], root);
  if (!url) {
    return null;
  }
  return [root, url];
}

function buildGitUrlMap(blocks) {
  const map = new Map();
  for (const block of blocks) {
    const info = gitInfoForFile(block.filePath);
    if (info) {
      map.set(info[0], info[1]);
    }
  }
  return map;
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function detectUsername() {
  if (process.env.AI_CONTRIBUTION_USERNAME) {
    return process.env.AI_CONTRIBUTION_USERNAME;
  }
  const gitEmail = gitOutput(['config', 'user.email'], process.cwd());
  if (gitEmail) {
    return gitEmail.replace(/@.*$/, '').trim();
  }
  if (process.env.USER || process.env.LOGNAME || process.env.USERNAME) {
    return process.env.USER || process.env.LOGNAME || process.env.USERNAME;
  }
  try {
    return os.userInfo().username || 'unknown';
  } catch {
    return 'unknown';
  }
}

function detectDeviceId(username) {
  if (process.env.AI_CONTRIBUTION_DEVICE_ID) {
    return process.env.AI_CONTRIBUTION_DEVICE_ID;
  }
  const buddyState = readJsonFile(path.join(os.homedir(), '.trae', 'buddy_state.json'));
  if (buddyState && typeof buddyState.device_id === 'string' && buddyState.device_id) {
    return buddyState.device_id;
  }
  return `device_${username}`;
}

function detectVersionCode() {
  const raw =
    process.env.AI_CONTRIBUTION_VERSION_CODE ||
    process.env.TRAE_VERSION_CODE ||
    process.env.ICUBE_VERSION_CODE ||
    '';
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function detectChatType(transformed) {
  if (process.env.AI_CONTRIBUTION_CHAT_TYPE) {
    return process.env.AI_CONTRIBUTION_CHAT_TYPE;
  }
  const toolName = transformed.source_tool_name || transformed.tool_name;
  return toolName === 'Write' ? 'generate' : 'edit';
}

function detectAiScene(chatType) {
  const { AIScene } = loadReporterDependencies();
  switch ((chatType || '').toLowerCase()) {
    case 'generate':
      return AIScene.GenerateCode;
    case 'edit':
      return AIScene.EditCode;
    case 'completion':
      return AIScene.Completion;
    case 'question':
      return AIScene.Question;
    default:
      return chatType || AIScene.EditCode;
  }
}

function buildMasqueradeContext(transformed) {
  const username = detectUsername();
  const chatType = detectChatType(transformed);
  const deviceId = detectDeviceId(username);
  const bizUserId =
    process.env.AI_CONTRIBUTION_CUSTOM_BIZ_USER_ID ||
    process.env.AI_CONTRIBUTION_BIZ_USER_ID ||
    process.env.AI_CONTRIBUTION_USER_ID ||
    username;
  const customScope = process.env.AI_CONTRIBUTION_CUSTOM_SCOPE || process.env.AI_CONTRIBUTION_SCOPE || 'bytedance';
  const customTenant = process.env.AI_CONTRIBUTION_CUSTOM_TENANT || process.env.AI_CONTRIBUTION_TENANT || customScope;
  const platform = process.env.AI_CONTRIBUTION_PLATFORM || 'electron';
  const messageId =
    process.env.AI_CONTRIBUTION_MESSAGE_ID ||
    transformed.message_id ||
    transformed.turn_id ||
    transformed.tool_use_id ||
    '';
  const ideVersion = process.env.AI_CONTRIBUTION_IDE_VERSION || process.env.TRAE_VERSION || '1.0.0';
  const extensionVersion =
    process.env.AI_CONTRIBUTION_EXTENSION_VERSION ||
    process.env.TRAE_VERSION ||
    '1.0.0';
  const agentName = process.env.AI_CONTRIBUTION_AGENT_NAME || 'traex';
  return {
    username,
    userUniqueId: process.env.AI_CONTRIBUTION_USER_UNIQUE_ID || username,
    chatType,
    aiScene: detectAiScene(chatType),
    agentType: process.env.AI_CONTRIBUTION_AGENT_TYPE || agentName,
    agentName,
    agentId: process.env.AI_CONTRIBUTION_AGENT_ID || agentName,
    callModel: process.env.AI_CONTRIBUTION_CALL_MODEL || transformed.model,
    envId: process.env.AI_CONTRIBUTION_ENV_ID || 'trae_desktop_bytedance',
    ideVersion,
    extensionVersion,
    sessionId: process.env.AI_CONTRIBUTION_SESSION_ID || transformed.session_id || '',
    messageId,
    region: process.env.AI_CONTRIBUTION_REGION || 'CN',
    deviceId,
    bizUserId,
    customScope,
    customTenant,
    platform,
    versionCode: detectVersionCode(),
  };
}

function createTea(context, envelopes) {
  const { TeaSDK } = loadReporterDependencies();
  const tea = new TeaSDK({
    app_id: TRAE_CN_APP_ID,
    disable_auto_pv: true,
  });
  tea.use({ name: 'bounded-capture', install() {}, onSendEvent({ event }) { envelopes.push(event); } });
  tea.config({
    header: {
      platform: context.platform,
    },
    user: {
      user_unique_id: context.userUniqueId,
      user_id: context.bizUserId,
      device_id: context.deviceId,
      user_is_login: Boolean(context.bizUserId),
    },
    custom: {
      biz_user_id: context.bizUserId,
      scope: context.customScope,
      tenant: context.customTenant,
    },
  });
  return tea;
}

function compactDefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== null && entryValue !== ''),
  );
}

function createSdk(tea, context) {
  const { createInternalContributionSdk } = loadReporterDependencies();
  return createInternalContributionSdk({
    tea: {
      collect: (eventName, data) => {
        const enrichedData = compactDefined({
          message_id: context.messageId,
          ...data,
          session_id: data.session_id || context.sessionId,
        });
        if (DRY_RUN) appendJson(REPORT_LOG, { phase: 'before', event: eventName, params: enrichedData });
        tea.collect(eventName, enrichedData);
      },
    },
    getUserScope: () => 'bytedance',
    getClientInfo: () => ({
      envId: context.envId,
      ideVersion: context.ideVersion,
      channel: 'icube-ai',
      extensionVersion: context.extensionVersion,
      sessionID: context.sessionId,
      versionCode: context.versionCode,
      region: context.region,
      deviceId: context.deviceId,
    }),
    getLanguage: (uri) => detectLanguage(uri),
    logger: {
      info: (msg) => appendJson(DIAG_LOG, { status: 'info', message: String(msg) }),
      warn: (msg) => appendJson(DIAG_LOG, { status: 'warn', message: String(msg) }),
      error: (msg) => appendJson(DIAG_LOG, { status: 'error', message: String(msg) }),
      debug: () => {},
    },
  });
}

function sanitizeKeyPart(value) {
  return String(value || 'unknown')
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .slice(0, 96) || 'unknown';
}

function sha1Short(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12);
}

function statePathForPayload(payload) {
  const sessionId = payload.session_id || payload.thread_id || 'unknown-session';
  const turnId = payload.turn_id || payload.message_id || 'unknown-turn';
  const fileName = `${sanitizeKeyPart(sessionId)}-${sanitizeKeyPart(turnId)}.json`;
  return path.join(STATE_DIR, fileName);
}

function writeJsonFile(filePath, value) {
  const text = JSON.stringify(value) + '\n';
  if (Buffer.byteLength(text) > 4 * 1024 * 1024) throw Object.assign(new Error('TURN_STATE_SIZE_LIMIT'), { code: 'TURN_STATE_SIZE_LIMIT' });
  storage.write(filePath, text);
}

const { acquireStateLock, releaseStateLock, recordedProcessOwnerIsAlive, SELF_PROCESS_GENERATION_IDENTITY } = require('./state-lock.cjs');

/** Execute a synchronous state mutation while holding the lock across read, decision, and atomic publish. */
function transactStateFile(filePath, options, mutator) {
  return storage.withRoot(() => {
  storage.reserve(4096, 8);
  const lock = acquireStateLock(filePath);
  try {
    const currentState = storage.read(filePath);
    const state = currentState || (options && options.createState ? options.createState() : null);
    const decision = mutator(state, currentState);
    const changed = !decision || decision.changed !== false;
    if (state && changed) {
      writeJsonFile(filePath, state);
    }
    return {
      state,
      result: decision ? decision.result : undefined,
    };
  } finally {
    releaseStateLock(lock);
  }
  });
}

/** Execute a synchronous transaction for the turn identified by a hook payload. */
function transactTurnState(payload, options, mutator) {
  const guarded = options?.createState ? { ...options, createState: () => {
    // Enumeration runs outside the root lock. GC may have advanced admission
    // since main's optimistic check; recheck at the actual publish transaction.
    if (!storage.admit(payload)) throw Object.assign(new Error('expired turn'), { code: 'EXPIRED_TURN' });
    return options.createState();
  } } : options;
  return transactStateFile(statePathForPayload(payload), guarded, mutator);
}

function readTurnState(payload) {
  return storage.read(statePathForPayload(payload));
}

function runGit(args, cwd, options = {}) {
  const env = options.env ? { ...process.env, ...options.env } : process.env;
  return execFileSync('git', args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', options.stderr === 'inherit' ? 'inherit' : 'ignore'],
    timeout: budget.timeout(options.timeout || 10000, 30),
  }).trim();
}

function tryRunGit(args, cwd, options = {}) {
  try {
    return runGit(args, cwd, options);
  } catch {
    return '';
  }
}

function resolveGitRoot(cwd) {
  const root = tryRunGit(['rev-parse', '--show-toplevel'], cwd || process.cwd());
  return root || null;
}

function existingPathForGit(candidatePath) {
  let current = path.resolve(candidatePath || process.cwd());
  try {
    const stat = fs.statSync(current);
    if (stat.isFile()) {
      current = path.dirname(current);
    }
  } catch {
    current = path.dirname(current);
  }
  while (current && current !== path.dirname(current)) {
    if (fs.existsSync(current)) {
      return current;
    }
    current = path.dirname(current);
  }
  return fs.existsSync(current) ? current : null;
}

function gitRootForCandidate(candidatePath) {
  const existing = existingPathForGit(candidatePath);
  if (!existing) {
    return null;
  }
  return resolveGitRoot(existing);
}

function gitRootStatusForCwd(cwd) {
  const resolvedCwd = path.resolve(cwd || process.cwd());
  const root = resolveGitRoot(resolvedCwd);
  if (root) {
    return { cwd: resolvedCwd, isGitRepository: true, gitRoot: root };
  }
  return {
    cwd: resolvedCwd,
    isGitRepository: false,
    reason: 'cwd_not_git_repository',
    message: 'ai-contribution reports code changes from Git repositories; run the check from a Git worktree or edit files inside one.',
  };
}

function addCandidate(candidates, value, cwd) {
  if (typeof value !== 'string' || !value.trim()) {
    return;
  }
  candidates.add(resolveFilePath(value.trim(), cwd));
}

function collectPatchFileCandidates(patchText, cwd) {
  const candidates = new Set();
  const pattern = /^\*\*\* (?:Add File|Update File|Delete File|Move to):\s*(.+?)\s*$/gm;
  let match = null;
  while ((match = pattern.exec(String(patchText || ''))) !== null) {
    addCandidate(candidates, match[1], cwd);
  }
  return candidates;
}

function unquoteShellToken(token) {
  const value = String(token || '').trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\(["'\\\s])/g, '$1');
  }
  return value.replace(/\\(\s)/g, '$1');
}

function resolveShellPath(token, cwd) {
  const value = unquoteShellToken(token);
  if (!value) {
    return null;
  }
  if (value === '~') {
    return os.homedir();
  }
  if (value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return resolveFilePath(value, cwd);
}

function collectLeadingCdCandidates(commandText, cwd) {
  const candidates = new Set();
  let command = String(commandText || '').trimStart();
  command = command.replace(/^(?:set\s+-[A-Za-z]+\s*(?:;|&&|\n)\s*)+/, '');
  const match = command.match(/^cd\s+((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(?:\\\s|[^\s;&|])+))\s*(?:&&|;|\n|$)/);
  if (!match) {
    return candidates;
  }
  const resolved = resolveShellPath(match[1], cwd);
  if (resolved) {
    candidates.add(resolved);
  }
  return candidates;
}

function splitShellCommandGroups(commandText) {
  return String(commandText || '')
    .split(/[;\n]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function splitShellWords(segment) {
  const words = [];
  const pattern = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(?:\\\s|[^\s])+/g;
  let match = null;
  while ((match = pattern.exec(String(segment || ''))) !== null) {
    const word = match[0].trim();
    if (word) {
      words.push(word);
    }
  }
  return words;
}

function addShellCandidate(candidates, token, cwd) {
  const resolved = resolveShellPath(token, cwd);
  if (resolved) {
    candidates.add(resolved);
  }
}

function collectRedirectionCandidates(segment, cwd) {
  const candidates = new Set();
  const token = String.raw`((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(?:\\\s|[^\s;&|<>])+))`;
  const pattern = new RegExp(String.raw`(?:^|[\s;&|])(?:\d*>>?|\d*<>\s*|&>>?|>\|)\s*${token}`, 'g');
  let match = null;
  while ((match = pattern.exec(String(segment || ''))) !== null) {
    addShellCandidate(candidates, match[1], cwd);
  }
  return candidates;
}

function commandName(words) {
  for (const word of words) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(unquoteShellToken(word))) {
      continue;
    }
    return unquoteShellToken(word);
  }
  return '';
}

function commandArgs(words) {
  const index = words.findIndex((word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(unquoteShellToken(word)));
  return index >= 0 ? words.slice(index + 1) : [];
}

function nonOptionArgs(args) {
  return args.filter((arg) => {
    const value = unquoteShellToken(arg);
    return value && value !== '--' && !value.startsWith('-');
  });
}

function windowsCopyMoveArgs(args) {
  return nonOptionArgs(args).filter((arg) => {
    const value = unquoteShellToken(arg);
    return !/^\/(?:[abdvnyzl]|-y)$/i.test(value);
  });
}

function shellCommandBaseName(command) {
  const nativeBaseName = path.basename(String(command || ''));
  return path.win32.basename(nativeBaseName).replace(/\.(?:exe|cmd)$/i, '').toLowerCase();
}

function optionValues(args, optionNames) {
  const names = new Set(optionNames.map((name) => name.toLowerCase()));
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = unquoteShellToken(args[index]);
    const lower = value.toLowerCase();
    if (names.has(lower) && index + 1 < args.length) {
      values.push(args[index + 1]);
      index += 1;
      continue;
    }
    for (const name of names) {
      if (lower.startsWith(`${name}=`) || lower.startsWith(`${name}:`)) {
        values.push(value.slice(name.length + 1));
        break;
      }
    }
  }
  return values;
}

function positionalArgs(args, optionsWithValues = []) {
  const valueOptions = new Set(optionsWithValues.map((name) => name.toLowerCase()));
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = unquoteShellToken(args[index]);
    if (!value || value === '--') {
      continue;
    }
    if (value.startsWith('-')) {
      if (valueOptions.has(value.toLowerCase()) && index + 1 < args.length) {
        index += 1;
      }
      continue;
    }
    values.push(args[index]);
  }
  return values;
}

function collectStructuredShellCandidates(segment, cwd) {
  const candidates = new Set();
  const words = splitShellWords(segment);
  const cmd = shellCommandBaseName(commandName(words));
  const args = commandArgs(words);
  if (!cmd) {
    return candidates;
  }

  if (cmd === 'tee') {
    for (const arg of nonOptionArgs(args)) {
      addShellCandidate(candidates, arg, cwd);
    }
  } else if (cmd === 'sed') {
    const hasInPlace = args.some((arg) => /^-.*i/.test(unquoteShellToken(arg)));
    if (hasInPlace) {
      for (const arg of nonOptionArgs(args).slice(1)) {
        addShellCandidate(candidates, arg, cwd);
      }
    }
  } else if (['cp', 'mv', 'install'].includes(cmd)) {
    for (const arg of nonOptionArgs(args)) {
      addShellCandidate(candidates, arg, cwd);
    }
  } else if (['copy', 'move'].includes(cmd)) {
    for (const arg of windowsCopyMoveArgs(args)) {
      addShellCandidate(candidates, arg, cwd);
    }
  } else if (['touch', 'mkdir', 'md'].includes(cmd)) {
    for (const arg of nonOptionArgs(args)) {
      addShellCandidate(candidates, arg, cwd);
    }
  } else if (['set-content', 'add-content', 'clear-content'].includes(cmd)) {
    const optionsWithValues = ['-path', '-literalpath', '-value', '-encoding', '-stream', '-filter', '-include', '-exclude'];
    const targets = optionValues(args, ['-path', '-literalpath']);
    const fallback = positionalArgs(args, optionsWithValues)[0];
    for (const target of targets.length ? targets : [fallback]) {
      addShellCandidate(candidates, target, cwd);
    }
  } else if (cmd === 'out-file') {
    const optionsWithValues = ['-filepath', '-literalpath', '-encoding', '-width', '-inputobject'];
    const targets = optionValues(args, ['-filepath', '-literalpath']);
    const fallback = positionalArgs(args, optionsWithValues)[0];
    for (const target of targets.length ? targets : [fallback]) {
      addShellCandidate(candidates, target, cwd);
    }
  } else if (['copy-item', 'move-item'].includes(cmd)) {
    const targets = optionValues(args, ['-path', '-literalpath', '-destination']);
    const optionsWithValues = ['-path', '-literalpath', '-destination', '-filter', '-include', '-exclude'];
    for (const target of targets.length ? targets : positionalArgs(args, optionsWithValues).slice(0, 2)) {
      addShellCandidate(candidates, target, cwd);
    }
  } else if (cmd === 'new-item') {
    const targets = optionValues(args, ['-path', '-name']);
    const optionsWithValues = ['-path', '-name', '-itemtype', '-value'];
    for (const target of targets.length ? targets : positionalArgs(args, optionsWithValues).slice(0, 1)) {
      addShellCandidate(candidates, target, cwd);
    }
  }

  return candidates;
}

function collectShellWritePathCandidates(commandText, cwd) {
  const candidates = new Set();
  for (const group of splitShellCommandGroups(commandText)) {
    let currentCwd = cwd;
    for (const segment of group.split(/(?:&&|\|\|)/).map((part) => part.trim()).filter(Boolean)) {
      const cdPaths = Array.from(collectLeadingCdCandidates(segment, currentCwd));
      if (cdPaths.length) {
        currentCwd = cdPaths[cdPaths.length - 1];
      }
      for (const candidate of collectRedirectionCandidates(segment, currentCwd)) {
        candidates.add(candidate);
      }
      for (const pipelinePart of segment.split('|').map((part) => part.trim()).filter(Boolean)) {
        for (const candidate of collectStructuredShellCandidates(pipelinePart, currentCwd)) {
          candidates.add(candidate);
        }
      }
    }
  }
  return candidates;
}

function collectCommandPathCandidates(commandText, cwd) {
  const candidates = new Set();
  const command = String(commandText || '').trim();

  for (const candidate of collectLeadingCdCandidates(command, cwd)) {
    candidates.add(candidate);
  }

  const fileCommand = command.match(/^(?:Edit|Write)\s+(.+?)\s*$/);
  if (fileCommand) {
    const resolved = resolveShellPath(fileCommand[1], cwd);
    if (resolved) {
      candidates.add(resolved);
    }
  }

  for (const candidate of collectShellWritePathCandidates(command, cwd)) {
    candidates.add(candidate);
  }

  return candidates;
}

function collectToolPathCandidates(payload) {
  const cwd = payload.cwd || process.cwd();
  const candidates = new Set();

  const input = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const workingDir = input.cwd || input.workdir || input.workingDirectory || cwd;
  for (const key of ['path', 'file', 'file_path', 'filePath', 'filename', 'target_file']) {
    addCandidate(candidates, input[key], workingDir);
  }
  for (const key of ['command', 'cmd']) {
    if (typeof input[key] === 'string') {
      for (const candidate of collectCommandPathCandidates(input[key], workingDir)) {
        candidates.add(candidate);
      }
    }
  }

  const patchText = getPatchText(payload);
  for (const candidate of collectPatchFileCandidates(patchText, workingDir)) {
    candidates.add(candidate);
  }

  const codegenPatch = codegenPatchFromResponse(payload.tool_response);
  if (codegenPatch) {
    addCandidate(candidates, codegenPatch.file_path, workingDir);
  }

  return Array.from(candidates);
}

function toolMayModifyWorkspace(payload) {
  if (collectToolPathCandidates(payload).length) {
    return true;
  }
  return /(?:apply.?patch|write|edit|bash|shell|exec|command|codegen)/i.test(payload.tool_name || '');
}

function toolSpanKey(payload) {
  return sanitizeKeyPart(payload.tool_use_id || payload.tool_call_id || payload.call_id || 'unknown-tool');
}

function toolSnapshotScopes(payload) {
  const pathsByRoot = new Map();
  const nonGitCandidates = [];
  for (const candidate of collectToolPathCandidates(payload)) {
    const root = gitRootForCandidate(candidate);
    if (!root) {
      nonGitCandidates.push(candidate);
      continue;
    }
    const paths = pathsByRoot.get(root) || [];
    paths.push(candidate);
    pathsByRoot.set(root, paths);
  }

  if (!pathsByRoot.size && toolMayModifyWorkspace(payload)) {
    const root = resolveGitRoot(payload.cwd || process.cwd());
    if (root) {
      pathsByRoot.set(root, [root]);
    }
  }

  return { pathsByRoot, nonGitCandidates };
}

function relativePathspec(root, candidatePath) {
  const resolvedRoot = canonicalPathWithMissingTail(root);
  const resolvedCandidate = path.isAbsolute(candidatePath)
    ? canonicalPathWithMissingTail(candidatePath)
    : canonicalPathWithMissingTail(path.resolve(resolvedRoot, candidatePath));
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return relative || '.';
}

/** Resolve filesystem aliases through the nearest existing ancestor while preserving a missing file tail. */
function canonicalPathWithMissingTail(candidatePath) {
  const resolvedPath = path.resolve(candidatePath);
  let existingAncestor = resolvedPath;
  const missingParts = [];
  while (!fs.existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) {
      return resolvedPath;
    }
    missingParts.unshift(path.basename(existingAncestor));
    existingAncestor = parent;
  }
  try {
    const realAncestor = fs.realpathSync.native
      ? fs.realpathSync.native(existingAncestor)
      : fs.realpathSync(existingAncestor);
    return path.join(realAncestor, ...missingParts);
  } catch {
    return resolvedPath;
  }
}

function snapshotPathsForRoot(root, candidates) {
  const pathspecs = new Set();
  for (const candidate of candidates || []) {
    const pathspec = relativePathspec(root, candidate);
    if (pathspec) {
      pathspecs.add(pathspec);
    }
  }
  return Array.from(pathspecs);
}

function unsafeSnapshotPathspecReason() {
  // Wide scopes are bounded while enumerating and reading files below. Avoid
  // a separate repository-size probe: platform-specific `find` variants do
  // not share a portable size-printing interface.
  return null;
}

function filterSafeSnapshotPathspecs(root, pathspecs) {
  const safe = [];
  const skipped = [];
  for (const pathspec of pathspecs || []) {
    const reason = unsafeSnapshotPathspecReason(root, pathspec);
    if (reason) {
      skipped.push({ pathspec, reason });
    } else {
      safe.push(pathspec);
    }
  }
  return { safe, skipped };
}

function safeSnapshotPathspecsForRoot(root, candidates) {
  const pathspecs = snapshotPathsForRoot(root, candidates);
  return filterSafeSnapshotPathspecs(root, pathspecs);
}

function toolCommandText(payload) {
  const input = payload && payload.tool_input;
  if (typeof input === 'string') {
    return input;
  }
  if (!input || typeof input !== 'object') {
    return '';
  }
  for (const key of ['command', 'cmd', 'script']) {
    if (typeof input[key] === 'string') {
      return input[key];
    }
  }
  return '';
}

function normalizedCommandText(commandText) {
  return String(commandText || '')
    .replace(/\\\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function commandSummary(commandText) {
  const normalized = normalizedCommandText(commandText);
  return normalized.length > 240 ? `${normalized.slice(0, 240)}...` : normalized;
}

function gitWithOptionalGlobalArgsPattern(subcommandPattern) {
  const shellToken = String.raw`(?:(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S+))`;
  const globalArgs = String.raw`(?:\s+(?:-C\s+${shellToken}|-c\s+${shellToken}|--git-dir(?:=|\s+)${shellToken}|--work-tree(?:=|\s+)${shellToken}))*`;
  return new RegExp(String.raw`\bgit${globalArgs}\s+(?:${subcommandPattern})\b`, 'i');
}

function looksLikeDestructiveWorkspaceCommand(payload) {
  const command = normalizedCommandText(toolCommandText(payload));
  if (!command) {
    return false;
  }

  const rmRecursiveForce = /\brm\s+(?:[^;&|]*\s+)?(?:-[A-Za-z]*r[A-Za-z]*f[A-Za-z]*|-[A-Za-z]*f[A-Za-z]*r[A-Za-z]*|-[A-Za-z]*r[A-Za-z]*\s+-[A-Za-z]*f[A-Za-z]*|-[A-Za-z]*f[A-Za-z]*\s+-[A-Za-z]*r[A-Za-z]*)\b/i;
  if (rmRecursiveForce.test(command)) {
    return true;
  }
  if (gitWithOptionalGlobalArgsPattern(String.raw`worktree\s+remove`).test(command)) {
    return true;
  }
  if (gitWithOptionalGlobalArgsPattern(String.raw`clean\s+-[A-Za-z]*f[A-Za-z]*d|clean\s+-[A-Za-z]*d[A-Za-z]*f`).test(command)) {
    return true;
  }
  if (gitWithOptionalGlobalArgsPattern(String.raw`reset\s+--hard`).test(command)) {
    return true;
  }
  return false;
}

function isProbablyBinary(buffer) {
  return buffer.includes(0);
}

function snapshotBlobPath(blobId) {
  return path.join(SNAPSHOT_BLOB_DIR, blobId);
}

function storeSnapshotContent(content) { return storage.blob(String(content || '')); }

function snapshotFileContent(snapshotFile) {
  if (!snapshotFile || !snapshotFile.exists) {
    return '';
  }
  if (typeof snapshotFile.content === 'string') {
    return snapshotFile.content;
  }
  if (snapshotFile.blobId) {
    return fs.readFileSync(snapshotBlobPath(snapshotFile.blobId), 'utf8');
  }
  return '';
}

function readSnapshotFile(root, pathspec, persist = true) {
  if (pathspec === '.') {
    return { exists: false, skipped: true, reason: 'wide_pathspec' };
  }
  const filePath = path.join(root, pathspec);
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile()) {
      return { exists: false, skipped: true, reason: 'not_regular_file' };
    }
    if (stat.size > SNAPSHOT_FILE_SIZE_LIMIT_BYTES) {
      return { exists: true, skipped: true, reason: 'file_too_large', size: stat.size };
    }
    const fd = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    let buffer;
    try {
      const bytes = Buffer.alloc(Math.min(stat.size + 1, SNAPSHOT_FILE_SIZE_LIMIT_BYTES + 1));
      const count = fs.readSync(fd, bytes, 0, bytes.length, 0);
      if (count > SNAPSHOT_FILE_SIZE_LIMIT_BYTES || fs.fstatSync(fd).size !== stat.size) return { exists: true, skipped: true, reason: 'file_changed_or_too_large' };
      buffer = bytes.subarray(0, count);
    } finally { fs.closeSync(fd); }
    if (isProbablyBinary(buffer)) {
      return { exists: true, skipped: true, reason: 'binary_file', size: stat.size };
    }
    if (!persist) return { exists: true, content: buffer.toString('utf8'), size: buffer.length };
    const stored = storeSnapshotContent(buffer.toString('utf8'));
    return { exists: true, blobId: stored.blobId, size: stored.size };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { exists: false };
    }
    return { exists: false, skipped: true, reason: error && error.code ? error.code : 'read_failed' };
  }
}

function gitListSnapshotFiles(root, pathspecs, deadline) {
  const timeoutMs = Math.max(1, Math.min(deadline - budget.now(), budget.timeout(10000, 40)));
  const result = execFileSync(process.execPath, [path.join(__dirname, 'snapshot-list.cjs')], {
    input: JSON.stringify({ root, pathspecs, fileLimit: SNAPSHOT_FILE_COUNT_LIMIT, timeoutMs: Math.max(1, timeoutMs - 40),
      outputLimit: boundedLimit('AI_CONTRIBUTION_SNAPSHOT_LIST_BYTES', 4 * 1024 * 1024),
      candidateLimit: boundedLimit('AI_CONTRIBUTION_SNAPSHOT_CANDIDATE_LIMIT', 50000) }),
    encoding: 'utf8', timeout: timeoutMs + 20, maxBuffer: 8 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const value = JSON.parse(result);
  if (value.reason) throw Object.assign(new Error(value.reason), value);
  return value.paths;
}

function isGitIgnored(root, pathspec) {
  const result = spawnSync('git', ['check-ignore', '-q', '--', pathspec], {
    cwd: root,
    stdio: 'ignore',
    timeout: budget.timeout(1500, 30),
  });
  return result.status === 0;
}

function expandSnapshotPathspecs(root, pathspecs, deadline) {
  const directories = [];
  const files = new Set();
  for (const pathspec of pathspecs || []) {
    const normalized = String(pathspec || '.').replace(/\\/g, '/');
    const absolutePath = path.join(root, normalized);
    if (normalized === '.') {
      directories.push('.');
      continue;
    }
    try {
      const stat = fs.statSync(absolutePath);
      if (stat.isDirectory()) {
        directories.push(normalized);
      } else if (stat.isFile()) {
        if (!isGitIgnored(root, normalized)) {
          files.add(normalized);
        }
      }
    } catch {
      if (!isGitIgnored(root, normalized)) {
        files.add(normalized);
      }
    }
  }
  if (directories.length) for (const file of gitListSnapshotFiles(root, directories, deadline)) files.add(file);
  return Array.from(files).sort();
}

function snapshotIdForFiles(root, pathspecs, files) {
  const hash = crypto.createHash('sha1');
  hash.update(root);
  hash.update('\0');
  hash.update(JSON.stringify(pathspecs || []));
  for (const filePath of Object.keys(files).sort()) {
    const item = files[filePath] || {};
    hash.update('\0');
    hash.update(filePath);
    hash.update(item.exists ? '\x01' : '\x02');
    hash.update(item.skipped ? `\x03${item.reason || ''}` : '\x04');
    if (item.exists && !item.skipped) {
      hash.update(item.blobId || item.content || '');
    }
  }
  return `pathsnap-${hash.digest('hex')}`;
}

let snapshotDeadline = Infinity;
function startSnapshotBudget() { snapshotDeadline = Math.min(budget.now() + boundedLimit('AI_CONTRIBUTION_SNAPSHOT_BUDGET_MS', 250), budget.now() + budget.remaining(80)); }
function createGhostSnapshot(cwd, message, paths = [], persist = true) {
  const deadline = Math.min(snapshotDeadline, budget.now() + boundedLimit('AI_CONTRIBUTION_SNAPSHOT_BUDGET_MS', 250));
  if (budget.now() >= deadline) return { skipped: true, reason: 'snapshot_time_budget' };
  const root = resolveGitRoot(cwd);
  if (!root) {
    return { skipped: true, reason: 'not_git_repository' };
  }
  const rawPathspecs = snapshotPathsForRoot(root, paths.length ? paths : [root]);
  const { safe: pathspecs, skipped } = filterSafeSnapshotPathspecs(root, rawPathspecs);
  if (!pathspecs.length) {
    return { skipped: true, reason: 'no_safe_pathspecs', root, paths: rawPathspecs, skippedPathspecs: skipped };
  }
  let expandedPaths = [];
  try {
    expandedPaths = expandSnapshotPathspecs(root, pathspecs, deadline);
  } catch (error) {
    return {
      skipped: true,
      reason: error.reason || (error.code === 'ETIMEDOUT' ? 'snapshot_time_budget' : 'snapshot_file_listing_failed'),
      fileCount: error.fileCount, limit: error.limit,
      root,
      paths: pathspecs,
      message: error && error.message ? error.message : String(error),
    };
  }
  const reportablePaths = expandedPaths.filter(shouldReportPath);
  if (reportablePaths.length > SNAPSHOT_FILE_COUNT_LIMIT) {
    return {
      skipped: true,
      reason: 'snapshot_file_count_exceeds_limit',
      root,
      paths: pathspecs,
      fileCount: reportablePaths.length,
      limit: SNAPSHOT_FILE_COUNT_LIMIT,
    };
  }
  const files = {};
  const skippedFiles = {};
  let totalSize = 0;
  for (const filePath of reportablePaths) {
    if (budget.now() >= deadline) return { skipped: true, reason: 'snapshot_time_budget', root, paths: pathspecs };
    const snapshot = readSnapshotFile(root, filePath, persist);
    if (snapshot.skipped) {
      skippedFiles[filePath] = snapshot.reason;
      continue;
    }
    totalSize += snapshot.size || 0;
    if (totalSize > SNAPSHOT_TOTAL_SIZE_LIMIT_BYTES) {
      return {
        skipped: true,
        reason: 'snapshot_total_size_exceeds_limit',
        root,
        paths: pathspecs,
        totalSize,
        limit: SNAPSHOT_TOTAL_SIZE_LIMIT_BYTES,
      };
    }
    files[filePath] = snapshot;
  }
  return {
    id: snapshotIdForFiles(root, pathspecs, files),
    kind: 'path_content',
    root,
    paths: pathspecs,
    snapshottedPaths: Object.keys(files).sort(),
    skippedFiles,
    totalSize,
    message: message || 'ai contribution turn snapshot',
    files,
  };
}

function gitDiff(fromCommit, toCommit, root) {
  return runGit(['diff', '--no-ext-diff', '--unified=3', fromCommit, toCommit, '--'], root, {
    timeout: 30000,
  });
}

function runNoIndexDiff(beforePath, afterPath) {
  try {
    return execFileSync('git', ['diff', '--no-index', '--no-ext-diff', '--unified=3', '--', beforePath, afterPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: Math.max(1, Math.min(snapshotDeadline - budget.now(), budget.timeout(10000, 100))),
      maxBuffer: 1024 * 1024 * 16,
    });
  } catch (error) {
    if (error && error.status === 1 && typeof error.stdout === 'string') {
      return error.stdout;
    }
    throw error;
  }
}

function rewriteNoIndexDiffPaths(diffText, relativePath, beforeExists, afterExists) {
  const escapedPath = relativePath.replace(/\\/g, '/');
  return String(diffText || '')
    .split(/\r?\n/)
    .map((line) => {
      if (line.startsWith('diff --git ')) {
        return `diff --git a/${escapedPath} b/${escapedPath}`;
      }
      if (line.startsWith('--- ')) {
        return beforeExists ? `--- a/${escapedPath}` : '--- /dev/null';
      }
      if (line.startsWith('+++ ')) {
        return afterExists ? `+++ b/${escapedPath}` : '+++ /dev/null';
      }
      return line;
    })
    .join('\n');
}

function pathSnapshotDiff(fromSnapshot, toSnapshot) {
  const files = new Set([...Object.keys(fromSnapshot.files || {}), ...Object.keys(toSnapshot.files || {})]);
  const suffix = `${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
  const beforePath = path.join(LOG_DIR, 'tmp', `diff-${suffix}-before`);
  const afterPath = path.join(LOG_DIR, 'tmp', `diff-${suffix}-after`);
  const chunks = [];
  let size = 0;
  try {
    for (const relativePath of Array.from(files).sort()) {
      budget.check(100);
      if (budget.now() >= snapshotDeadline) throw Object.assign(new Error('snapshot diff budget exhausted'), { code: 'SNAPSHOT_TIME_BUDGET' });
      if (fromSnapshot.skippedFiles?.[relativePath] || toSnapshot.skippedFiles?.[relativePath]) continue;
      const before = fromSnapshot.files[relativePath] || { exists: false };
      const after = toSnapshot.files[relativePath] || { exists: false };
      if (before.skipped || after.skipped) continue;
      const beforeText = snapshotFileContent(before), afterText = snapshotFileContent(after);
      if (Boolean(before.exists) === Boolean(after.exists) && beforeText === afterText) continue;
      storage.write(beforePath, beforeText); storage.write(afterPath, afterText);
      const diff = rewriteNoIndexDiffPaths(runNoIndexDiff(beforePath, afterPath), relativePath, Boolean(before.exists), Boolean(after.exists));
      size += Buffer.byteLength(diff);
      if (size > DIFF_SIZE_LIMIT_BYTES) throw new Error('diff_size_exceeds_limit');
      chunks.push(diff);
    }
    return chunks.join('\n');
  } finally {
    try { storage.remove(beforePath); storage.remove(afterPath); } catch {} // GC reclaims scratch after this owner exits.
  }
}

function diffSnapshots(fromSnapshot, toSnapshot, root) {
  if (fromSnapshot && toSnapshot && fromSnapshot.kind === 'path_content' && toSnapshot.kind === 'path_content') {
    return pathSnapshotDiff(fromSnapshot, toSnapshot);
  }
  return gitDiff(fromSnapshot.id || fromSnapshot, toSnapshot.id || toSnapshot, root);
}

function decodeGitPath(raw) {
  let value = String(raw || '').trim();
  if (value === '/dev/null') {
    return null;
  }
  if ((value.startsWith('a/') || value.startsWith('b/')) && value.length > 2) {
    value = value.slice(2);
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      value = JSON.parse(value);
      if ((value.startsWith('a/') || value.startsWith('b/')) && value.length > 2) {
        value = value.slice(2);
      }
    } catch {}
  }
  return value || null;
}

const { shouldReportPath } = require('./snapshot-paths.cjs');

function parseUnifiedGitDiff(diffText, cwd) {
  const blocks = [];
  const searchOffsets = new Map();
  let currentFile = null;
  let hunkItems = [];
  let binary = false;

  const flush = () => {
    if (currentFile && !binary && hunkItems.length && shouldReportPath(currentFile)) {
      flushUpdateHunk(blocks, currentFile, cwd, hunkItems, searchOffsets);
    }
    hunkItems = [];
  };

  for (const rawLine of String(diffText || '').split(/\r?\n/)) {
    if (rawLine.startsWith('diff --git ')) {
      flush();
      currentFile = null;
      binary = false;
      continue;
    }
    if (rawLine.startsWith('Binary files ') || rawLine.startsWith('GIT binary patch')) {
      binary = true;
      continue;
    }
    if (rawLine.startsWith('+++ ')) {
      flush();
      currentFile = decodeGitPath(rawLine.slice(4));
      binary = false;
      continue;
    }
    if (rawLine.startsWith('@@ ')) {
      flush();
      hunkItems = [];
      continue;
    }
    if (!currentFile || binary) {
      continue;
    }
    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      hunkItems.push({ kind: 'add', text: rawLine.slice(1) });
    } else if (rawLine.startsWith(' ')) {
      hunkItems.push({ kind: 'context', text: rawLine.slice(1) });
    } else if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
      hunkItems.push({ kind: 'delete', text: rawLine.slice(1) });
    }
  }
  flush();
  return blocks.filter((block) => block.acceptCode.trim().length > 0);
}

function newTurnState(payload) {
  return {
    sessionId: payload.session_id || payload.thread_id || '',
    turnId: payload.turn_id || '',
    cwd: payload.cwd || process.cwd(),
    rootSnapshots: {},
    toolSpans: {},
    directReportCount: 0,
    directReportFiles: [],
    directReportBlockSignatures: [],
    turnDiffReportCount: 0,
    createdAt: new Date().toISOString(),
    runtimeOwner: process.env.AI_CONTRIBUTION_RUNTIME_OWNER ? JSON.parse(process.env.AI_CONTRIBUTION_RUNTIME_OWNER) : null,
  };
}

function blockSignature(block) {
  return crypto
    .createHash('sha1')
    .update([
      path.resolve(block.filePath || ''),
      block.acceptCode || '',
      block.range && block.range.start ? `${block.range.start.line}:${block.range.start.character}` : '',
    ].join('\0'))
    .digest('hex');
}

function directReportSignatures(state) {
  return new Set([...(state && state.directReportBlockSignatures) || []]);
}

function filterAlreadyDirectReportedBlocks(blocks, state) {
  const directSignatures = directReportSignatures(state);
  if (!directSignatures.size) {
    return blocks;
  }
  return blocks.filter((block) => !directSignatures.has(blockSignature(block)));
}

async function reportBlocks(transformed, blocks, source, beforeFirstSdkCall) {
  if (!blocks.length) return;
  const { OfflineCodeContributionAction } = loadReporterDependencies();
  const context = buildMasqueradeContext(transformed), envelopes = [];
  const tea = createTea(context, envelopes), sdk = createSdk(tea, context);
  sdk.updateGitUrls(buildGitUrlMap(blocks));
  for (const block of blocks) {
    await sdk.reportAICodeContribution({
      operationId: transformed.tool_use_id || transformed.turn_id || transformed.message_id,
      aiScene: context.aiScene,
      behaviorType: OfflineCodeContributionAction.BehaviorType.Accept,
      documentUri: block.filePath, position: block.position, acceptCode: block.acceptCode,
      chat_type: context.chatType, chat_model: transformed.model, call_model: context.callModel,
      agent_type: context.agentType, agent_id: context.agentId, agent_name: context.agentName,
    });
  }
  const count = envelopes.reduce((n, e) => n + (e.events || []).length, 0);
  if (count !== blocks.length) throw new Error('sdk_event_count_mismatch');
  const id = crypto.randomBytes(16).toString('hex');
  if (DRY_RUN) { if (beforeFirstSdkCall) beforeFirstSdkCall(); }
  else storage.enqueue({ id, state: 'pending', createdAt: Date.now(), source, sessionId: transformed.session_id, turnId: transformed.turn_id, count, envelopes }, beforeFirstSdkCall);
  appendJson(REPORT_LOG, { phase: 'result', event: 'ai_contribution_code', source, batchId: id, sessionId: transformed.session_id, turnId: transformed.turn_id, status: DRY_RUN ? 'dry_run' : 'queued', count });
}

function pseudoTransformedForTurnDiff(payload) {
  return {
    ...payload,
    hook_event_name: payload.hook_event_name,
    tool_name: 'turn_git_diff',
    source_tool_name: 'turn_git_diff',
    tool_use_id: `turn-git-diff-${payload.turn_id || payload.message_id || Date.now()}`,
    session_id: payload.session_id || payload.thread_id || '',
    message_id: payload.message_id || payload.turn_id || '',
    model: payload.model || process.env.AI_CONTRIBUTION_CALL_MODEL || '',
    cwd: payload.cwd || process.cwd(),
  };
}

function createToolSpan(payload) {
  const { pathsByRoot, nonGitCandidates } = toolSnapshotScopes(payload);
  const roots = {};
  const skippedRoots = [];
  for (const [root, candidates] of pathsByRoot.entries()) {
    const snapshot = createGhostSnapshot(
      root,
      `ai contribution pre tool ${payload.tool_use_id || payload.tool_name || ''}`,
      candidates, false,
    );
    if (snapshot.skipped) {
      skippedRoots.push({
        root,
        reason: snapshot.reason,
        message: snapshot.message,
        skippedPathspecs: snapshot.skippedPathspecs,
        fileCount: snapshot.fileCount,
        totalSize: snapshot.totalSize,
        limit: snapshot.limit,
      });
      continue;
    }
    roots[root] = {
      root,
      paths: snapshot.paths,
      before: snapshot,
    };
  }
  return {
    toolUseId: payload.tool_use_id || payload.tool_call_id || payload.call_id || '',
    toolName: payload.tool_name || '',
    startedAt: new Date().toISOString(),
    roots,
    skippedRoots,
    nonGitCandidates,
  };
}

function persistSpanSnapshots(span) {
  for (const entry of Object.values(span.roots || {})) {
    for (const file of Object.values(entry.before.files || {})) {
      if (typeof file.content !== 'string') continue;
      budget.check(30);
      const stored = storeSnapshotContent(file.content);
      delete file.content; Object.assign(file, stored);
    }
    entry.before.id = snapshotIdForFiles(entry.root, entry.before.paths, entry.before.files);
  }
  return span;
}

function directBlocksForPayload(payload) {
  const transformed = transformPayload(payload);
  if (!transformed) {
    return { transformed: null, blocks: [] };
  }
  return {
    transformed,
    blocks: parseApplyPatch(getPatchText(transformed), transformed.cwd).filter(block => {
      const root = gitRootForCandidate(block.filePath);
      if (!root || !shouldReportPath(block.filePath) || isGitIgnored(root, path.relative(root, block.filePath))) return false;
      try { const stat = fs.lstatSync(block.filePath); return stat.isFile() && stat.size <= SNAPSHOT_FILE_SIZE_LIMIT_BYTES; } catch { return false; }
    }),
  };
}

function filterBlocksBySignatures(blocks, signatures) {
  if (!signatures.size) {
    return blocks;
  }
  return blocks.filter((block) => !signatures.has(blockSignature(block)));
}

/** Treat legacy reportAttemptedAt spans as unknown-result reports that must never be replayed. */
function toolSpanReportHasStarted(span) {
  return Boolean(
    span &&
    (span.terminalClaimState === 'report_started' || (span.reportAttemptedAt && span.terminalClaimState !== 'preparing')),
  );
}

/** Return whether a persisted turn has already been reduced to its immutable completion record. */
function turnStateIsCompletedTombstone(state) {
  return Boolean(state && state.retentionState === 'completed_turn_tombstone');
}

/** Return whether a tool span has crossed a terminal boundary and no longer needs recovery data. */
function toolSpanIsTerminal(span) {
  return Boolean(
    span &&
    (span.completedAt || span.terminalClaimState === 'completed' || toolSpanReportHasStarted(span)),
  );
}

/** Replace a locked turn state with a bounded completion tombstone once every span is terminal. */
function compactCompletedTurnState(state, completedAt) {
  if (turnStateIsCompletedTombstone(state)) {
    return { compacted: true, alreadyCompacted: true, ...(state.retention || {}) };
  }
  const spans = Object.values((state && state.toolSpans) || {});
  const terminalToolSpanCount = spans.filter(toolSpanIsTerminal).length;
  const completedToolSpanCount = spans.filter((span) => Boolean(span && span.completedAt)).length;
  if (terminalToolSpanCount !== spans.length) {
    return {
      compacted: false,
      toolSpanCount: spans.length,
      completedToolSpanCount,
      terminalToolSpanCount,
    };
  }

  const tombstone = {
    retentionState: 'completed_turn_tombstone',
    sessionId: state.sessionId || '',
    turnId: state.turnId || '',
    createdAt: state.createdAt,
    completedAt,
    updatedAt: completedAt,
    retention: {
      toolSpanCount: spans.length,
      completedToolSpanCount,
      terminalToolSpanCount,
      directReportCount: state.directReportCount || 0,
      turnDiffReportCount: state.turnDiffReportCount || 0,
    },
  };
  for (const key of Object.keys(state)) {
    delete state[key];
  }
  Object.assign(state, tombstone);
  return { compacted: true, ...tombstone.retention };
}

/** Install a fresh preparing claim, recording enough ownership to prove a dead owner later. */
function startPreparingToolSpanClaim(span, failed) {
  const claimId = crypto.randomBytes(16).toString('hex');
  const startedAt = new Date().toISOString();
  const previousOwnerPid = Number(span.terminalClaimOwnerPid);
  if (
    span.terminalClaimState === 'preparing' &&
    !recordedProcessOwnerIsAlive(previousOwnerPid, span.terminalClaimOwnerIdentity)
  ) {
    span.terminalClaimTakeoverCount = (span.terminalClaimTakeoverCount || 0) + 1;
  }
  span.failed = failed;
  span.terminalClaimState = 'preparing';
  span.terminalClaimId = claimId;
  span.terminalClaimOwnerPid = process.pid;
  span.terminalClaimOwnerIdentity = SELF_PROCESS_GENERATION_IDENTITY;
  span.terminalClaimStartedAt = startedAt;
  return { claimId, startedAt };
}

/** Return whether a pending span is safe for this process to claim or take over. */
function toolSpanCanBeClaimed(span) {
  if (!span || span.completedAt || span.terminalClaimState === 'completed' || toolSpanReportHasStarted(span)) {
    return false;
  }
  if (span.terminalClaimState !== 'preparing') {
    return true;
  }
  const ownerPid = Number(span.terminalClaimOwnerPid);
  return (
    Number.isInteger(ownerPid) &&
    ownerPid > 0 &&
    !recordedProcessOwnerIsAlive(ownerPid, span.terminalClaimOwnerIdentity)
  );
}

/** Atomically elect one Post/Stop process to prepare a tool span for terminal reporting. */
function claimToolSpan(payload, failed) {
  const key = toolSpanKey(payload);
  const transaction = transactTurnState(payload, null, (state) => {
    if (!state) {
      return { changed: false, result: { status: 'missing_turn_state', key } };
    }
    if (turnStateIsCompletedTombstone(state)) {
      return { changed: false, result: { status: 'completed_turn_tombstone', key } };
    }
    state.toolSpans = state.toolSpans || {};
    const span = state.toolSpans[key];
    if (!span) {
      return { changed: false, result: { status: 'missing_tool_span', key } };
    }
    if (!toolSpanCanBeClaimed(span)) {
      return { changed: false, result: { status: 'already_claimed', key } };
    }
    const claim = startPreparingToolSpanClaim(span, failed);
    state.updatedAt = claim.startedAt;
    return { result: { status: 'claimed', key, claimId: claim.claimId } };
  });
  return { ...transaction.result, state: transaction.state };
}

/** Atomically claim every safe pending span from the durable Stop-time state. */
function claimPendingToolSpansForStop(payload) {
  const claims = [];
  const transaction = transactTurnState(payload, null, (state) => {
    if (!state) {
      return { changed: false, result: { status: 'missing_turn_state', claims } };
    }
    state.toolSpans = state.toolSpans || {};
    for (const [key, span] of Object.entries(state.toolSpans)) {
      if (!toolSpanCanBeClaimed(span)) {
        continue;
      }
      const claim = startPreparingToolSpanClaim(span, Boolean(span.failed));
      claims.push({ key, claimId: claim.claimId });
    }
    if (claims.length) {
      state.updatedAt = new Date().toISOString();
    }
    return { changed: claims.length > 0, result: { status: 'ok', claims } };
  });
  return { ...transaction.result, state: transaction.state };
}

/** Merge terminal fields only when the durable span still belongs to this claim generation. */
function updateClaimedToolSpan(payload, key, claimId, updates) {
  return transactTurnState(payload, null, (state) => {
    const span = state && state.toolSpans && state.toolSpans[key];
    if (!span || span.terminalClaimId !== claimId) {
      return { changed: false, result: false };
    }
    Object.assign(span, updates);
    state.updatedAt = updates.completedAt || updates.updatedAt || new Date().toISOString();
    if (state.stopRequestedAt && updates.completedAt) {
      compactCompletedTurnState(state, updates.completedAt);
    }
    return { result: true };
  }).result;
}

/** Atomically cross the at-most-once boundary immediately before the first SDK reporting call. */
function markClaimedToolSpanReportStarted(payload, key, claimId) {
  return transactTurnState(payload, null, (state) => {
    const span = state && state.toolSpans && state.toolSpans[key];
    if (
      !span ||
      span.terminalClaimId !== claimId ||
      span.terminalClaimState !== 'preparing' ||
      Number(span.terminalClaimOwnerPid) !== process.pid ||
      span.completedAt ||
      span.reportAttemptedAt
    ) {
      return { changed: false, result: false };
    }
    const reportAttemptedAt = new Date().toISOString();
    span.terminalClaimState = 'report_started';
    span.reportAttemptedAt = reportAttemptedAt;
    state.updatedAt = reportAttemptedAt;
    return { result: true };
  }).result;
}

/** Release only this process's preparing claim after a failure before the SDK boundary. */
function releasePreparingToolSpanClaim(payload, key, claimId, error) {
  return transactTurnState(payload, null, (state) => {
    const span = state && state.toolSpans && state.toolSpans[key];
    if (
      !span ||
      span.terminalClaimId !== claimId ||
      span.terminalClaimState !== 'preparing' ||
      span.reportAttemptedAt ||
      span.completedAt
    ) {
      return { changed: false, result: false };
    }
    const releasedAt = new Date().toISOString();
    span.lastPreparationFailure = {
      at: releasedAt,
      message: error && error.message ? error.message : String(error),
    };
    delete span.failed;
    delete span.terminalClaimState;
    delete span.terminalClaimId;
    delete span.terminalClaimOwnerPid;
    delete span.terminalClaimOwnerIdentity;
    delete span.terminalClaimStartedAt;
    state.updatedAt = releasedAt;
    return { result: true };
  }).result;
}

/** Prepare and report the immutable before snapshot owned by one durable preparing claim. */
async function prepareClaimedToolSpanReport(payload, state, span, key, claimId, options = {}) {
  if (
    !span ||
    span.terminalClaimState !== 'preparing' ||
    span.terminalClaimId !== claimId ||
    span.completedAt ||
    span.reportAttemptedAt
  ) {
    return { reported: false, blockCount: 0, skipped: true };
  }

  const direct = options.includeDirect === false
    ? { transformed: null, blocks: [] }
    : directBlocksForPayload(payload);
  const directSignatures = new Set(direct.blocks.map(blockSignature));
  const snapshotBlocks = [];
  const rootResults = [];
  let terminalReason = null;

  for (const entry of Object.values(span.roots || {})) {
    const after = createGhostSnapshot(
      entry.root,
      `ai contribution post tool ${span.toolUseId || span.toolName || ''}`,
      (entry.before && entry.before.paths) || entry.paths || [], false,
    );
    if (after.skipped) {
      rootResults.push({ root: entry.root, status: 'skip', reason: after.reason });
      terminalReason = terminalReason || after.reason;
      continue;
    }

    let diffText = '';
    try {
      diffText = diffSnapshots(entry.before, after, entry.root);
    } catch (error) {
      rootResults.push({ root: entry.root, status: 'error', message: error.message });
      terminalReason = terminalReason || 'diff_failed';
      continue;
    }
    if (Buffer.byteLength(diffText) > DIFF_SIZE_LIMIT_BYTES) {
      rootResults.push({
        root: entry.root,
        status: 'skip',
        reason: 'diff_size_exceeds_limit',
        diffBytes: Buffer.byteLength(diffText),
        limit: DIFF_SIZE_LIMIT_BYTES,
      });
      terminalReason = terminalReason || 'diff_size_exceeds_limit';
      continue;
    }
    const blocks = parseUnifiedGitDiff(diffText, entry.root);
    snapshotBlocks.push(...blocks);
    entry.after = after;
    rootResults.push({
      root: entry.root,
      status: 'ok',
      before: entry.before.id,
      after: after.id,
      beforeFileCount: (entry.before.snapshottedPaths || []).length,
      afterFileCount: (after.snapshottedPaths || []).length,
      diffBytes: Buffer.byteLength(diffText),
      blockCount: blocks.length,
      paths: entry.before.paths,
    });
  }

  const fallbackBlocks = filterBlocksBySignatures(snapshotBlocks, directSignatures);
  const allBlocks = [...direct.blocks, ...fallbackBlocks];
  const blockCountExceeded = allBlocks.length > BLOCK_COUNT_LIMIT;
  if (blockCountExceeded) {
    terminalReason = terminalReason || 'block_count_exceeds_limit';
  }
  const reportableDirectBlocks = blockCountExceeded ? [] : direct.blocks;
  const reportableFallbackBlocks = blockCountExceeded ? [] : fallbackBlocks;
  const reportableBlocks = [...reportableDirectBlocks, ...reportableFallbackBlocks];

  updateClaimedToolSpan(payload, key, claimId, {
    rootResults,
    directBlockCount: direct.blocks.length,
    snapshotBlockCount: snapshotBlocks.length,
    blockCount: reportableBlocks.length,
    terminalReason,
    updatedAt: new Date().toISOString(),
  });

  appendJson(DIAG_LOG, {
    status: terminalReason ? 'warn' : 'ok',
    event: options.event || 'tool_snapshot_flush',
    source: options.source || 'tool_git_diff',
    sessionId: state.sessionId,
    turnId: state.turnId,
    toolUseId: span.toolUseId,
    toolName: span.toolName,
    roots: rootResults,
    directBlockCount: direct.blocks.length,
    snapshotBlockCount: snapshotBlocks.length,
    dedupedBlockCount: snapshotBlocks.length - fallbackBlocks.length,
    blockCount: reportableBlocks.length,
    terminalReason,
  });

  const markReportStarted = () => {
    if (!markClaimedToolSpanReportStarted(payload, key, claimId)) {
      const claimLostError = new Error('tool span claim changed before report_started transition');
      claimLostError.code = 'TOOL_SPAN_CLAIM_LOST';
      throw claimLostError;
    }
  };
  if (reportableBlocks.length) {
    await reportBlocks(direct.transformed || pseudoTransformedForTurnDiff(payload), reportableBlocks,
      reportableDirectBlocks.length ? 'codex_post_tool_use' : (options.source || 'tool_git_diff'), markReportStarted);
  }

  const completedAt = new Date().toISOString();
  updateClaimedToolSpan(payload, key, claimId, {
    completedAt,
    reportedBlockCount: reportableBlocks.length,
    terminalClaimState: 'completed',
    roots: {},
  });
  return { reported: reportableBlocks.length > 0, blockCount: reportableBlocks.length, roots: rootResults };
}

/** Release safe preparation failures while preserving unknown report_started results as DO_NOT_REPLAY. */
async function flushClaimedToolSpan(payload, state, span, key, claimId, options = {}) {
  try {
    return await prepareClaimedToolSpanReport(payload, state, span, key, claimId, options);
  } catch (error) {
    let released = false;
    try {
      released = releasePreparingToolSpanClaim(payload, key, claimId, error);
    } catch (releaseError) {
      appendJson(DIAG_LOG, {
        status: 'error',
        event: 'tool_snapshot_claim_release',
        toolUseId: span && span.toolUseId,
        claimId,
        message: releaseError && releaseError.message ? releaseError.message : String(releaseError),
      });
    }
    appendJson(DIAG_LOG, {
      status: 'error',
      event: 'tool_snapshot_claim_error',
      toolUseId: span && span.toolUseId,
      claimId,
      preparingClaimReleased: released,
      message: error && error.message ? error.message : String(error),
    });
    throw error;
  }
}

async function handleUserPromptSubmit(payload) {
  const cwdGitStatus = gitRootStatusForCwd(payload.cwd || process.cwd());
  const promptMetadata = {
    sessionId: payload.session_id || '',
    turnId: payload.turn_id || '',
    cwd: payload.cwd || process.cwd(),
    cwdGitRoot: cwdGitStatus.gitRoot || '',
    cwdGitStatus: cwdGitStatus.isGitRepository ? 'git_repository' : cwdGitStatus.reason,
    promptSubmittedAt: new Date().toISOString(),
  };
  const transaction = transactTurnState(payload, { createState: () => newTurnState(payload) }, (currentState) => {
    if (turnStateIsCompletedTombstone(currentState)) {
      return { changed: false, result: { completedTurn: true } };
    }
    Object.assign(currentState, promptMetadata);
    currentState.rootSnapshots = currentState.rootSnapshots || {};
    currentState.toolSpans = currentState.toolSpans || {};
    currentState.directReportFiles = currentState.directReportFiles || [];
    currentState.directReportBlockSignatures = currentState.directReportBlockSignatures || [];
    currentState.directReportCount = currentState.directReportCount || 0;
    currentState.turnDiffReportCount = currentState.turnDiffReportCount || 0;
    currentState.updatedAt = promptMetadata.promptSubmittedAt;
  });
  const { state } = transaction;
  appendJson(DIAG_LOG, {
    status: transaction.result && transaction.result.completedTurn ? 'skip' : 'ok',
    event: 'turn_snapshot_start',
    reason: transaction.result && transaction.result.completedTurn ? 'completed_turn_tombstone' : undefined,
    sessionId: promptMetadata.sessionId,
    turnId: promptMetadata.turnId,
    cwd: promptMetadata.cwd,
    cwdGitRoot: cwdGitStatus.gitRoot,
    cwdGitStatus: promptMetadata.cwdGitStatus,
    message: cwdGitStatus.message,
    preservedToolSpanCount: Object.keys(state.toolSpans || {}).length,
    snapshotDeferred: true,
    pendingRecoveryDeferredToToolSpans: true,
  });
}

async function handlePreToolUse(payload) {
  const key = toolSpanKey(payload);
  const existing = storage.withRoot(() => readTurnState(payload));
  const draft = existing?.toolSpans?.[key] || turnStateIsCompletedTombstone(existing) ? null : createToolSpan(payload);
  const transaction = transactTurnState(payload, { createState: () => newTurnState(payload) }, (currentState) => {
    if (turnStateIsCompletedTombstone(currentState)) {
      return { changed: false, result: { completedTurn: true } };
    }
    currentState.toolSpans = currentState.toolSpans || {};
    if (currentState.toolSpans[key]) {
      return { changed: false, result: { preserved: true } };
    }
    const span = persistSpanSnapshots(draft);
    currentState.toolSpans[key] = span;
    currentState.updatedAt = new Date().toISOString();
    return { result: { preserved: false } };
  });
  if (transaction.result && transaction.result.completedTurn) {
    appendJson(DIAG_LOG, {
      status: 'skip',
      event: 'tool_snapshot_start',
      reason: 'completed_turn_tombstone',
      turnId: payload.turn_id,
      toolUseId: payload.tool_use_id,
    });
    return;
  }
  const { state } = transaction;
  const persistedSpan = state.toolSpans[key];
  appendJson(DIAG_LOG, {
    status: Object.keys(persistedSpan.roots || {}).length ? 'ok' : 'skip',
    event: 'tool_snapshot_start',
    sessionId: state.sessionId,
    turnId: payload.turn_id,
    toolUseId: persistedSpan.toolUseId,
    toolName: payload.tool_name,
    duplicatePrePreserved: Boolean(transaction.result && transaction.result.preserved),
    roots: Object.values(persistedSpan.roots || {}).map((entry) => ({
      root: entry.root,
      paths: entry.before.paths,
      fileCount: entry.before.snapshottedPaths.length,
      totalSize: entry.before.totalSize,
    })),
    skippedRoots: persistedSpan.skippedRoots,
    nonGitCandidates: persistedSpan.nonGitCandidates,
  });
}

async function handlePostToolUse(payload, failed = false) {
  const claim = claimToolSpan(payload, failed);
  if (claim.status === 'missing_turn_state') {
    appendJson(DIAG_LOG, {
      status: 'skip',
      event: 'tool_snapshot_post',
      reason: 'missing_turn_state',
      turnId: payload.turn_id,
      toolUseId: payload.tool_use_id,
    });
    return;
  }
  if (claim.status === 'completed_turn_tombstone') {
    appendJson(DIAG_LOG, {
      status: 'skip',
      event: 'tool_snapshot_terminal_skip',
      reason: 'completed_turn_tombstone',
      turnId: payload.turn_id,
      toolUseId: payload.tool_use_id,
    });
    return;
  }
  if (claim.status === 'missing_tool_span') {
    const direct = failed ? { transformed: null, blocks: [] } : directBlocksForPayload(payload);
    appendJson(DIAG_LOG, {
      status: direct.blocks.length ? 'warn' : 'skip',
      event: 'tool_snapshot_post',
      reason: 'missing_pre_tool_snapshot',
      turnId: payload.turn_id,
      toolUseId: payload.tool_use_id,
      directBlockCount: direct.blocks.length,
      afterOnlyReportSkipped: true,
      message: 'Missing immutable PreToolUse snapshot; skipped after-only compensation report.',
    });
    return;
  }
  if (claim.status !== 'claimed') {
    return;
  }
  const span = claim.state.toolSpans[claim.key];
  await flushClaimedToolSpan(payload, claim.state, span, claim.key, claim.claimId, {
    event: failed ? 'tool_snapshot_failure_flush' : 'tool_snapshot_post',
    source: failed ? 'tool_git_diff_failure' : 'tool_git_diff',
    includeDirect: !failed,
  });
}

async function handleStop(payload) {
  const pending = claimPendingToolSpansForStop(payload);
  if (pending.status === 'missing_turn_state') {
    appendJson(DIAG_LOG, { status: 'skip', event: 'turn_snapshot_stop', reason: 'missing_turn_state' });
    return;
  }
  for (const claim of pending.claims) {
    const span = pending.state.toolSpans[claim.key];
    await flushClaimedToolSpan(payload, pending.state, span, claim.key, claim.claimId, {
      event: 'tool_snapshot_stop_recovery',
      source: 'tool_git_diff_stop_recovery',
      includeDirect: false,
    });
  }
  const transaction = transactTurnState(payload, null, (currentState) => {
    const completedAt = new Date().toISOString();
    const retention = compactCompletedTurnState(currentState, completedAt);
    if (retention.alreadyCompacted) {
      return { changed: false, result: retention };
    }
    if (!retention.compacted) {
      currentState.stopRequestedAt = currentState.stopRequestedAt || completedAt;
      currentState.updatedAt = completedAt;
    }
    return { result: retention };
  });
  const { state } = transaction;
  appendJson(DIAG_LOG, {
    status: 'ok',
    event: 'turn_snapshot_stop',
    turnId: state.turnId,
    toolSpanCount: transaction.result.toolSpanCount,
    completedToolSpanCount: transaction.result.completedToolSpanCount,
    terminalToolSpanCount: transaction.result.terminalToolSpanCount,
    stateCompacted: transaction.result.compacted,
  });
}

async function main() {
  const raw = await readStdin();
  const payload = raw ? JSON.parse(raw) : null;
  if (!payload || typeof payload !== 'object') {
    appendJson(DIAG_LOG, { status: 'skip', message: 'empty hook payload' });
    return;
  }

  startSnapshotBudget();
  const admitted = storage.withRoot(() => {
    const state = readTurnState(payload);
    if (!state && !storage.admit(payload)) {
      appendJson(DIAG_LOG, { status: 'skip', event: 'event_rejected', reason: 'expired_turn', turnId: payload.turn_id });
      return false;
    }
    return true;
  });
  if (!admitted) return;
  if (payload.hook_event_name === 'UserPromptSubmit') return handleUserPromptSubmit(payload);
  if (payload.hook_event_name === 'PreToolUse') return handlePreToolUse(payload);
  if (payload.hook_event_name === 'Stop') return handleStop(payload);
  if (payload.hook_event_name === 'PostToolUse') return handlePostToolUse(payload, false);
  if (payload.hook_event_name === 'PostToolUseFailure') return handlePostToolUse(payload, true);
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      try { require('./diagnostics.cjs').emergency({
        status: 'error',
        message: error && error.message ? error.message : String(error),
        stack: error && error.stack ? String(error.stack).slice(0, 4000) : '',
      });
      } catch {}
      process.exitCode = 1;
    });
}

module.exports = {
  collectToolPathCandidates,
  createGhostSnapshot: (...args) => storage.withRoot(() => createGhostSnapshot(...args)),
  filterAlreadyDirectReportedBlocks,
  pathSnapshotDiff,
  parseUnifiedGitDiff,
  safeSnapshotPathspecsForRoot,
  snapshotPathsForRoot,
};
