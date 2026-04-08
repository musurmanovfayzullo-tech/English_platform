const session = require('express-session');
const { hasDatabase, getPgPool, ensurePgReady } = require('./fsdb');

class PgSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.ttlSeconds = Number(options.ttlSeconds || 60 * 60 * 24 * 7);
  }

  async get(sid, callback) {
    try {
      await ensurePgReady();
      const pool = await getPgPool();
      const result = await pool.query(
        'SELECT sess FROM app_sessions WHERE sid = $1 AND expires_at > NOW() LIMIT 1',
        [sid]
      );
      callback(null, result.rows[0]?.sess || null);
    } catch (error) {
      callback(error);
    }
  }

  async set(sid, sess, callback) {
    try {
      await ensurePgReady();
      const pool = await getPgPool();
      const cookieMaxAge = Number(sess?.cookie?.maxAge || this.ttlSeconds * 1000);
      const expiresAt = new Date(Date.now() + cookieMaxAge);
      await pool.query(
        `INSERT INTO app_sessions (sid, sess, expires_at, updated_at)
         VALUES ($1, $2::jsonb, $3, NOW())
         ON CONFLICT (sid)
         DO UPDATE SET sess = EXCLUDED.sess, expires_at = EXCLUDED.expires_at, updated_at = NOW()`,
        [sid, JSON.stringify(sess), expiresAt]
      );
      callback?.(null);
    } catch (error) {
      callback?.(error);
    }
  }

  async destroy(sid, callback) {
    try {
      await ensurePgReady();
      const pool = await getPgPool();
      await pool.query('DELETE FROM app_sessions WHERE sid = $1', [sid]);
      callback?.(null);
    } catch (error) {
      callback?.(error);
    }
  }

  async touch(sid, sess, callback) {
    return this.set(sid, sess, callback);
  }

  async clearExpired() {
    if (!hasDatabase()) return;
    await ensurePgReady();
    const pool = await getPgPool();
    await pool.query('DELETE FROM app_sessions WHERE expires_at <= NOW()');
  }
}

module.exports = { PgSessionStore };
