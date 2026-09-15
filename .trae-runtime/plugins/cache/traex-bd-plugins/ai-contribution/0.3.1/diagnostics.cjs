'use strict';
// No business locks or emergency files on the failure path. Keep complete JSON.
const fs = require('fs');
function emergency(value) {
  try {
    let record = { ts: new Date().toISOString(), ...value };
    if (Buffer.byteLength(JSON.stringify(record)) > 3900) {
      record = { ts: record.ts, event: record.event, reason: record.reason, truncated: true,
        detail: JSON.stringify(value).slice(0, 600) };
    }
    fs.writeSync(2, JSON.stringify(record) + '\n');
  } catch {}
}
module.exports = { emergency };
