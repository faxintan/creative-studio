'use strict';
const now = () => Number(process.hrtime.bigint() / 1000000n);
function limit(name, fallback, maximum = 25000) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), maximum) : fallback;
}
let deadline = Number(process.env.AI_CONTRIBUTION_HOOK_DEADLINE_MS) || Infinity;
function begin() { deadline = Math.min(deadline, now() + limit('AI_CONTRIBUTION_HOOK_BUDGET_MS', 500)); return deadline; }
function remaining(reserve = 0) { return Math.max(0, deadline - now() - reserve); }
function check(reserve = 0) { if (remaining(reserve) <= 0) throw Object.assign(new Error('hook budget exhausted'), { code: 'HOOK_BUDGET_EXHAUSTED' }); }
function timeout(maximum, reserve = 0) { check(reserve); return Math.max(1, Math.min(maximum, remaining(reserve))); }
module.exports = { now, begin, remaining, check, timeout, limit, get deadline() { return deadline; } };
