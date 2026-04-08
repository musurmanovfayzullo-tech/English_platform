const fs = require('fs');
const path = require('path');

const writeQueues = new Map();
const DATABASE_URL = process.env.DATABASE_URL ? process.env.DATABASE_URL.trim() : '';
let pgPool = null;
let pgReady = null;

function hasDatabase() {
  return Boolean(DATABASE_URL);
}

function getStoreKey(filePath) {
  const relative = path.relative(path.join(__dirname, '..'), filePath);
  return relative.replace(/\\/g, '/');
}

async function getPgPool() {
  if (!hasDatabase()) return null;
  if (pgPool) return pgPool;
  let Pool;
  try {
    ({ Pool } = require('pg'));
  } catch (error) {
    throw new Error('DATABASE_URL is set but pg dependency is not installed. Run npm install.');
  }
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false),
  });
  return pgPool;
}

async function ensurePgReady() {
  if (!hasDatabase()) return;
  if (pgReady) return pgReady;
  pgReady = (async () => {
    const pool = await getPgPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_kv_store (
        store_key TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_sessions (
        sid TEXT PRIMARY KEY,
        sess JSONB NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  })();
  return pgReady;
}

async function ensureFile(filePath, defaultValue) {
  if (hasDatabase()) {
    await ensurePgReady();
    const pool = await getPgPool();
    const storeKey = getStoreKey(filePath);
    await pool.query(
      `INSERT INTO app_kv_store (store_key, payload) VALUES ($1, $2::jsonb)
       ON CONFLICT (store_key) DO NOTHING`,
      [storeKey, JSON.stringify(defaultValue)]
    );
    return;
  }

  try {
    await fs.promises.access(filePath);
  } catch {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
  }
}

async function readJson(filePath, defaultValue) {
  if (hasDatabase()) {
    await ensureFile(filePath, defaultValue);
    const pool = await getPgPool();
    const storeKey = getStoreKey(filePath);
    const result = await pool.query('SELECT payload FROM app_kv_store WHERE store_key = $1 LIMIT 1', [storeKey]);
    return result.rows[0]?.payload ?? defaultValue;
  }

  await ensureFile(filePath, defaultValue);
  const raw = await fs.promises.readFile(filePath, 'utf8');
  try {
    return JSON.parse(raw || JSON.stringify(defaultValue));
  } catch {
    return defaultValue;
  }
}

async function writeJson(filePath, value) {
  if (hasDatabase()) {
    await ensurePgReady();
    const pool = await getPgPool();
    const storeKey = getStoreKey(filePath);
    await pool.query(
      `INSERT INTO app_kv_store (store_key, payload, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (store_key)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [storeKey, JSON.stringify(value)]
    );
    return value;
  }

  await ensureFile(filePath, value);
  const previous = writeQueues.get(filePath) || Promise.resolve();
  const next = previous.then(async () => {
    const tempPath = `${filePath}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(value, null, 2), 'utf8');
    await fs.promises.rename(tempPath, filePath);
  });
  writeQueues.set(filePath, next.catch(() => {}));
  await next;
  return value;
}

module.exports = {
  ensureFile,
  readJson,
  writeJson,
  hasDatabase,
  getPgPool,
  ensurePgReady,
};
