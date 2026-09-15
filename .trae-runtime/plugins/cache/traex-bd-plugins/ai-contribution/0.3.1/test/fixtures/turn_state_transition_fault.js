#!/usr/bin/env node

const fs = require('fs');

const faultMode = process.env.AI_CONTRIBUTION_TEST_TRANSITION_FAULT || '';
const originalAppendFileSync = fs.appendFileSync.bind(fs);
const originalReadFileSync = fs.readFileSync.bind(fs);
const originalRenameSync = fs.renameSync.bind(fs);
let faultInjected = false;

/** Return every persisted tool span from a candidate turn-state JSON file. */
function persistedToolSpans(filePath) {
  try {
    const state = JSON.parse(originalReadFileSync(filePath, 'utf8'));
    return Object.values(state.toolSpans || {});
  } catch {
    return [];
  }
}

/** Identify the atomic publish that makes a preparing or report-started claim durable. */
function transitionWasPublished(filePath) {
  const normalizedPath = String(filePath || '').replace(/\\/g, '/');
  if (!normalizedPath.includes('/turn-snapshots/') || !normalizedPath.endsWith('.json')) {
    return false;
  }
  const spans = persistedToolSpans(filePath);
  if (faultMode === 'crash_preparing') {
    return spans.some((span) => (
      span.terminalClaimState === 'preparing' ||
      (!span.terminalClaimState && span.reportAttemptedAt && !span.completedAt)
    ));
  }
  if (faultMode === 'crash_report_started') {
    return spans.some((span) => span.terminalClaimState === 'report_started' && !span.completedAt);
  }
  return false;
}

/** Intercept atomic state publication and crash only after the selected terminal transition is durable. */
fs.renameSync = function renameSyncWithTransitionCrash(sourcePath, destinationPath, ...args) {
  const result = originalRenameSync(sourcePath, destinationPath, ...args);
  if (!faultInjected && transitionWasPublished(destinationPath)) {
    faultInjected = true;
    process.exit(faultMode === 'crash_report_started' ? 98 : 97);
  }
  return result;
};

/** Intercept diagnostics publication to inject a preparation failure before report ownership is durable. */
fs.appendFileSync = function appendFileSyncWithPreparationFailure(filePath, data, ...args) {
  const serialized = String(data || '');
  if (
    !faultInjected &&
    faultMode === 'throw_before_report_started' &&
    String(filePath || '').endsWith('diagnostics.jsonl') &&
    serialized.includes('\"event\":\"tool_snapshot_post\"')
  ) {
    faultInjected = true;
    throw new Error('injected preparation failure before report_started');
  }
  return originalAppendFileSync(filePath, data, ...args);
};
