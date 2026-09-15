#!/usr/bin/env node
'use strict';
const path = require('path');
const fs = require('fs');
const storage = require('./storage.cjs');
const worker = require('./report-worker.cjs');
const PLUGIN_DIR = process.env.AI_CONTRIBUTION_PLUGIN_DIR || __dirname;
function runtimeOwner() {
  let pid = process.ppid;
  if (process.platform === 'linux') {
    for (let i = 0; i < 8 && pid > 1; i++) {
      try {
        const executable = path.basename(fs.readlinkSync('/proc/' + pid + '/exe'));
        if (/^(traex|traecli|codex)(-|$)/.test(executable)) return storage.owner(pid);
        const fields = fs.readFileSync('/proc/' + pid + '/stat', 'utf8').split(') ').slice(1).join(') ').split(' ');
        pid = Number(fields[1]);
      } catch { break; }
    }
  }
  return storage.owner(process.ppid);
}
async function main() {
  const budget = require('./hook-budget.cjs');
  budget.begin();
  const diagnostic = require('./diagnostics.cjs').emergency;
  let raw = '', oversized = false;
  // Bound stdin as well as adapter and tail work. The last 50 ms are reserved for teardown.
  const inputTimer = setTimeout(() => process.exit(0), budget.timeout(25000));
  for await (const chunk of process.stdin) {
    if (Buffer.byteLength(raw) + chunk.length > 8 * 1024 * 1024) { oversized = true; raw = ''; }
    if (!oversized) raw += chunk;
  }
  clearTimeout(inputTimer);
  if (oversized) { diagnostic({ event: 'hook_skipped', reason: 'payload_too_large' }); return; }
  const adapterLimit = Math.min(budget.limit('AI_CONTRIBUTION_ADAPTER_TIMEOUT_MS', 25000), budget.timeout(25000, 50));
  let context = {};
  try { const p = JSON.parse(raw); context = { sessionId: p.session_id, turnId: p.turn_id, toolUseId: p.tool_use_id, hookEvent: p.hook_event_name }; } catch {}
  const started = budget.now();
  if (!worker.paused()) {
    const { spawn } = require('child_process');
    const result = await new Promise(resolve => {
      const child = spawn(process.execPath, [path.join(PLUGIN_DIR, 'ai_contribution_sdk_adapter.js')], {
        stdio: ['pipe', 'ignore', 'pipe'], detached: process.platform !== 'win32', windowsHide: true,
        env: { ...process.env, AI_CONTRIBUTION_HOOK_DEADLINE_MS: String(budget.deadline - 50),
          AI_CONTRIBUTION_TURN_STATE_LOCK_TIMEOUT_MS: String(budget.limit('AI_CONTRIBUTION_TURN_STATE_LOCK_TIMEOUT_MS', 50, 50)),
          AI_CONTRIBUTION_RUNTIME_OWNER: JSON.stringify(runtimeOwner()) },
      });
      let stderr = '', timedOut = false, escalation;
      function killTree(signal) {
        try {
          if (process.platform !== 'win32') process.kill(-child.pid, signal);
          else spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => child.kill());
        } catch {}
      }
      const timer = setTimeout(() => {
        timedOut = true; killTree('SIGTERM');
        escalation = setTimeout(() => killTree('SIGKILL'), 40);
      }, Math.max(1, Math.min(adapterLimit, budget.remaining(50))));
      child.stderr.on('data', chunk => { if (stderr.length < 8000) stderr += chunk.toString().slice(0, 8000 - stderr.length); });
      child.stdin.on('error', () => {}); child.stdin.end(raw);
      child.on('error', error => { clearTimeout(timer); resolve({ error: error.code, stderr }); });
      child.on('close', (exitCode, signal) => {
        clearTimeout(timer); clearTimeout(escalation);
        if (timedOut) killTree('SIGKILL');
        resolve({ exitCode, signal, stderr, error: timedOut ? 'HOOK_BUDGET_EXHAUSTED' : null });
      });
    });
    if (result.error || result.exitCode !== 0) {
      diagnostic({ ...context, status: 'warn', event: 'hook_adapter_process', elapsedMs: budget.now() - started,
        exitCode: result.exitCode, signal: result.signal, reason: result.error || 'adapter_failed', detail: result.stderr.slice(0, 1800) });
      return; // No scheduling or lock-dependent logging after a failed adapter.
    }
  }
  if (budget.remaining() > 30) worker.schedule({ timeoutMs: Math.min(20, budget.remaining() - 10) });
}
main().catch(e => require('./diagnostics.cjs').emergency({ status: 'warn', event: 'hook_runner', reason: e.code || e.message })).finally(() => process.exit(0));
