#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.includes("--version")) {
  process.stdout.write("fake-traecli 1.0.0\n");
  process.exit(0);
}

if (args[0] === "models" && args[1] === "--json") {
  process.stdout.write(JSON.stringify([
    {
      name: "Queued Model",
      _meta: { trae: { load: { percent: 147 } } },
    },
    {
      name: "Direct Model",
      _meta: { trae: {} },
    },
  ]));
  process.exit(0);
}

const modelIndex = args.indexOf("--model");
const model = modelIndex >= 0 ? args[modelIndex + 1] : "unknown";
let prompt = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  prompt += chunk;
});
process.stdin.on("end", () => {
  const sessionId = args.includes("resume")
    ? args.at(-2)
    : "fake-exec-session";

  process.stdout.write(`${JSON.stringify({
    type: "session.started",
    session_id: sessionId,
    model,
  })}\n`);

  if (model === "Queued Model") {
    process.stdout.write(`${JSON.stringify({
      type: "turn.queued",
      status: "queued_for_capacity",
      session_id: sessionId,
      model,
    })}\n`);
  }

  const delay = model === "Queued Model" ? 1200 : 20;
  setTimeout(() => {
    process.stdout.write(`${JSON.stringify({
      type: "assistant.delta",
      session_id: sessionId,
      model,
      delta: `${model}: ${prompt.trim()}`,
    })}\n`);
    process.stdout.write(`${JSON.stringify({
      type: "turn.completed",
      session_id: sessionId,
      model,
    })}\n`);
  }, delay);
});
