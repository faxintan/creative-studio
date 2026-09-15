'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
for (const name of ['retire_cleanup_test.cjs', 'path_snapshot_test.js', 'turn_state_concurrency_test.js', 'turn_state_terminal_idempotency_test.js', 'turn_state_hardening_test.js', 'transition_recovery_test.cjs', 'turn_state_retention_test.js', 'report_queue_test.cjs', 'worker_test.cjs', 'resource_limits_test.cjs', 'storage_transport_test.cjs', 'inspect_reporting_test.cjs', 'hook_performance_test.cjs']) {
  const result = spawnSync(process.execPath, [path.join(__dirname, name)], { stdio: 'inherit', timeout: 180000, env: { ...process.env, AI_CONTRIBUTION_HOOK_BUDGET_MS: process.env.AI_CONTRIBUTION_HOOK_BUDGET_MS || '25000' } });
  if (result.status !== 0) { console.error(name, result.error || result.signal || result.status); process.exit(1); }
}
