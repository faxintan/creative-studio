#!/usr/bin/env node

const fs = require('fs');

const originalRenameSync = fs.renameSync.bind(fs);
let crashInjected = false;

/** Crash immediately after one transition owner record becomes durable. */
fs.renameSync = function renameSyncWithTransitionOwnerCrash(sourcePath, destinationPath, ...args) {
  const result = originalRenameSync(sourcePath, destinationPath, ...args);
  const normalizedDestination = String(destinationPath || '').replace(/\\/g, '/');
  if (
    !crashInjected &&
    process.env.AI_CONTRIBUTION_TEST_CRASH_TRANSITION_OWNER === '1' &&
    normalizedDestination.includes('/turn-snapshots/') &&
    normalizedDestination.endsWith('.json.lock.transition/owner.json')
  ) {
    crashInjected = true;
    process.exit(99);
  }
  return result;
};
