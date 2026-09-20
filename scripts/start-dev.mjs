import { execFileSync, spawn } from 'node:child_process';

const ports = [Number(process.env.VITE_PORT ?? 5173), Number(process.env.BRIDGE_PORT ?? 8787)];

function listeningPids(port) {
  try {
    const output = execFileSync('lsof', ['-tiTCP:' + port, '-sTCP:LISTEN'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(Number)
      .filter(Number.isInteger);
  } catch {
    return [];
  }
}

function processInfo(pid) {
  try {
    return execFileSync('ps', ['-o', 'ppid=', '-o', 'command=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .split(/\s+/);
  } catch {
    return [];
  }
}

function staleDevPids() {
  try {
    const output = execFileSync('ps', ['-axo', 'pid=,command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split('\n')
      .map((line) => {
        const match = line.trim().match(/^(\d+)\s+(.*)$/);
        return match ? { pid: Number(match[1]), command: match[2] } : null;
      })
      .filter(
        (entry) =>
          entry &&
          entry.pid !== process.pid &&
          (entry.command.includes('concurrently') ||
            entry.command.includes('scripts/start-dev.mjs') ||
            /pnpm.*--filter.*@(web|bridge).*dev/.test(entry.command) ||
            /creative-studio\/apps\/(web|bridge).*\/(vite|tsx)/.test(entry.command)),
      )
      .map((entry) => entry.pid);
  } catch {
    return [];
  }
}

function launcherPid(pid) {
  let current = pid;
  for (let depth = 0; depth < 12; depth += 1) {
    const [parent, ...commandParts] = processInfo(current);
    const command = commandParts.join(' ');
    if (
      command.includes('concurrently') ||
      command.includes('start-dev.mjs') ||
      /pnpm.*dev/.test(command)
    ) {
      return current;
    }
    const parentPid = Number(parent);
    if (!Number.isInteger(parentPid) || parentPid <= 1 || parentPid === current) break;
    current = parentPid;
  }
  return null;
}

function releasePort(port) {
  const pids = listeningPids(port);
  if (!pids.length) return;

  console.log(`[dev] Releasing port ${port}: ${pids.join(', ')}`);
  const targets = new Set(pids);
  for (const pid of pids) {
    const launcher = launcherPid(pid);
    if (launcher) targets.add(launcher);
  }
  for (const pid of targets) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // The process may exit between lsof and kill.
    }
  }
}

for (const pid of staleDevPids()) {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // The process may exit between ps and kill.
  }
}

for (const port of ports) {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid development port: ${port}`);
  }
  releasePort(port);
}

const children = [
  spawn('pnpm', ['--filter', '@creative-studio/bridge', 'dev'], {
    stdio: 'inherit',
    env: process.env,
  }),
  spawn('pnpm', ['--filter', '@creative-studio/web', 'dev'], {
    stdio: 'inherit',
    env: process.env,
  }),
];

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (!shuttingDown && (code ?? 0) !== 0) {
      shutdown('SIGTERM');
      process.exitCode = code ?? 1;
    }
    if (!shuttingDown && signal) {
      shutdown(signal);
      process.exitCode = 1;
    }
  });
}
