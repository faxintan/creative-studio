'use strict';
const fs = require('fs');
const path = require('path');
const [file, mode, modulePath] = process.argv.slice(2);
const transition = file + '.lock.transition';
const originalRename = fs.renameSync, originalWrite = fs.writeFileSync;
const originalReaddir = fs.readdirSync;
let replaced = false;
fs.readdirSync = (name, ...rest) => {
  const entries = originalReaddir(name, ...rest);
  if (mode === 'replace-generation' && name === transition && !replaced) {
    replaced = true;
    originalRename(transition, transition + '.displaced');
    fs.mkdirSync(transition);
    fs.mkdirSync(path.join(transition, '.reclaim'));
    originalWrite(path.join(transition, 'owner.json'), JSON.stringify({ token: 'replacement', pid: process.pid }));
    originalWrite(path.join(transition, 'unknown'), 'replacement must survive');
  }
  return entries;
};
fs.renameSync = (from, to, ...rest) => {
  if (mode === 'crash-owner' && to === path.join(transition, 'owner.json')) process.exit(91);
  const result = originalRename(from, to, ...rest);
  if (mode === 'crash-reclaim' && to === path.join(transition, '.reclaim')) process.exit(93);
  if (mode === 'crash-retired-transition' && from === transition && to.includes('.candidate-')) process.exit(94);
  return result;
};
fs.writeFileSync = (name, content, ...rest) => {
  if (mode === 'crash-partial-reclaim' && path.dirname(name).startsWith(transition + '.candidate-')) {
    originalWrite(name, '{', ...rest); process.exit(95);
  }
  if (mode === 'crash-partial-owner' && path.dirname(name) === transition && path.basename(name).startsWith('.owner-')) {
    originalWrite(name, '{"pid":', ...rest);
    process.exit(92);
  }
  return originalWrite(name, content, ...rest);
};
const locks = require(modulePath);
try {
  const lock = locks.acquireStateLock(file);
  if (mode === 'hold') {
    process.stdout.write('acquired\n');
    process.stdin.resume();
    process.stdin.once('data', () => { locks.releaseStateLock(lock); process.exit(0); });
  } else {
    locks.releaseStateLock(lock);
    process.stdout.write('released\n');
  }
} catch (error) {
  process.stderr.write(String(error.code || error.message));
  process.exitCode = 1;
}
