const path = require('path');
const { readJson, writeJson } = require('../utils/fsdb');

const LOGS_FILE = path.join(__dirname, '..', 'data', 'logs.json');

async function getLogs() {
  const logs = await readJson(LOGS_FILE, []);
  return Array.isArray(logs) ? logs : [];
}

async function addLog(event, details = {}) {
  const logs = await getLogs();
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    event,
    details,
    createdAt: new Date().toISOString(),
  };
  logs.unshift(item);
  await writeJson(LOGS_FILE, logs.slice(0, 500));
  return item;
}

module.exports = { getLogs, addLog };
