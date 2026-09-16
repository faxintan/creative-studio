import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const port = Number.parseInt(process.env.AICHAT_PORT ?? "8787", 10);
const serverEntry = path.join(projectRoot, "src", "bridge", "server.ts");
const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await startBridge();
}

export function listListeningPids(targetPort = port) {
  try {
    const output = execFileSync(
      "lsof",
      ["-tiTCP:" + targetPort, "-sTCP:LISTEN"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return output
      .split(/\r?\n/)
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}

export function processCommand(pid) {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function isProjectBridgeProcess(command, root = projectRoot) {
  const projectTsx = path.join(root, "node_modules", "tsx");
  return (
    command.includes(projectTsx) &&
    command.includes(path.join("src", "bridge", "server.ts"))
  );
}

async function startBridge() {
  if (!existsSync(serverEntry) || !existsSync(tsxCli)) {
    console.error("[bridge] project build is incomplete; run pnpm install first.");
    process.exitCode = 1;
    return;
  }

  const occupants = listListeningPids();
  for (const pid of occupants) {
    const command = processCommand(pid);
    if (!isProjectBridgeProcess(command)) {
      console.error(
        `[bridge] port ${port} is occupied by an unrelated process (pid ${pid}). ` +
          `Stop it or set AICHAT_PORT to another free port.`,
      );
      process.exitCode = 1;
      return;
    }
  }

  for (const pid of occupants) {
    await terminateProcess(pid);
  }

  const child = spawn(process.execPath, [tsxCli, serverEntry], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };
  process.once("SIGINT", () => forwardSignal("SIGINT"));
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));

  child.once("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

async function terminateProcess(pid) {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }

  const deadline = Date.now() + 1500;
  while (Date.now() < deadline && listListeningPids().includes(pid)) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (listListeningPids().includes(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The process exited between the port check and escalation.
    }
  }
}
