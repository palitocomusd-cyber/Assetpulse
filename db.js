/**
 * Database layer — works with either:
 *   - PostgreSQL (Render): set DATABASE_URL
 *   - SQLite (local dev / single instance): default file ./data/assetpulse.db
 *
 * All timestamps are epoch milliseconds stored as BIGINT/INTEGER.
 * All ids are application-generated strings so both engines behave identically.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATABASE_URL = process.env.DATABASE_URL || '';
const isPg = !!DATABASE_URL;

let pgPool = null;
let sqlite = null;

function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => '$' + (++i));
}

async function init() {
  if (isPg) {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: /sslmode=require|render\.com/.test(DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
      max: 8
    });
  } else {
    const Database = require('better-sqlite3');
    const file = process.env.SQLITE_PATH || path.join(__dirname, 'data', 'assetpulse.db');
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      sqlite = new Database(file);
      sqlite.pragma('journal_mode = WAL');
    } catch (e) {
      // Some sandboxed/network filesystems cannot host SQLite. Fall back to a temp file.
      const fallback = path.join(require('os').tmpdir(), 'assetpulse.db');
      console.warn('SQLite unavailable at ' + file + ' (' + e.code + '), using ' + fallback);
      sqlite = new Database(fallback);
    }
  }
  await migrate();
  await seedDefaults();
  return { driver: isPg ? 'postgres' : 'sqlite' };
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    country TEXT,
    phone TEXT,
    referral TEXT,
    referred_by TEXT,
    cash REAL DEFAULT 0,
    assets REAL DEFAULT 0,
    reinvest REAL DEFAULT 0,
    pin_hash TEXT,
    kyc TEXT DEFAULT 'Pending',
    is_admin INTEGER DEFAULT 0,
    frozen INTEGER DEFAULT 0,
    auto_reinvest INTEGER DEFAULT 0,
    lang TEXT DEFAULT 'en',
    created_at BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at BIGINT,
    expires_at BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT,
    daily_rate REAL,
    duration_days INTEGER,
    min_amount REAL,
    max_amount REAL,
    risk TEXT,
    description TEXT,
    active INTEGER DEFAULT 1,
    sort INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT,
    plan_name TEXT,
    amount REAL,
    daily_rate REAL,
    duration_days INTEGER,
    start_at BIGINT,
    end_at BIGINT,
    credited REAL DEFAULT 0,
    source TEXT,
    status TEXT DEFAULT 'Active'
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT,
    amount REAL,
    status TEXT,
    description TEXT,
    created_at BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS deposits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount REAL,
    method TEXT,
    ref TEXT,
    status TEXT DEFAULT 'Pending',
    notes TEXT,
    created_at BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS withdrawals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount REAL,
    address TEXT,
    network TEXT,
    status TEXT DEFAULT 'Pending',
    notes TEXT,
    fee REAL DEFAULT 0,
    created_at BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS kyc (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    doc_type TEXT,
    doc_number TEXT,
    status TEXT DEFAULT 'Pending',
    notes TEXT,
    submitted_at BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    message TEXT,
    type TEXT DEFAULT 'info',
    is_read INTEGER DEFAULT 0,
    from_admin INTEGER DEFAULT 0,
    created_at BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS payment_methods (
    id TEXT PRIMARY KEY,
    name TEXT,
    network TEXT,
    address TEXT,
    note TEXT,
    active INTEGER DEFAULT 1,
    sort INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS withdraw_networks (
    id TEXT PRIMARY KEY,
    name TEXT,
    min_amount REAL DEFAULT 50,
    fee_pct REAL DEFAULT 0,
    active INTEGER DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS withdrawal_audit (
    id TEXT PRIMARY KEY,
    withdrawal_id TEXT,
    user_id TEXT,
    summary TEXT,
    actor TEXT,
    at BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS activity (
    id TEXT PRIMARY KEY,
    actor TEXT,
    what TEXT,
    at BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS email_log (
    id TEXT PRIMARY KEY,
    recipient TEXT,
    subject TEXT,
    status TEXT,
    kind TEXT,
    detail TEXT,
    at BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT,
    auth TEXT,
    created_at BIGINT
  )`
];

async function migrate() {
  for (const stmt of SCHEMA) await run(stmt, []);
  await run('CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions (user_id, created_at)', []);
  await run('CREATE INDEX IF NOT EXISTS idx_pos_user ON positions (user_id, status)', []);
  await run('CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications (user_id, created_at)', []);
  await run('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)', []);
}

async function seedDefaults() {
  const plans = await get('SELECT COUNT(*) AS n FROM plans', []);
  if (!Number(plans.n)) {
    const rows = [
      ['p_core', 'Core', 0.45, 30, 100, 4999, 'Low', 'Diversified, lower-volatility allocation modeled on blue-chip digital assets.', 1, 1],
      ['p_growth', 'Growth', 0.7, 45, 500, 24999, 'Medium', 'Balanced allocation across majors and mid-cap tokens, rebalanced weekly.', 1, 2],
      ['p_momentum', 'Momentum', 1.1, 60, 2500, 99999, 'High', 'Higher-volatility, momentum-driven strategy. Suitable for risk-tolerant investors.', 1, 3],
      ['p_vault', 'Vault', 0.3, 90, 50, 999999, 'Low', 'Capital-preservation focused allocation with stablecoin-heavy weighting.', 1, 4]
    ];
    for (const p of rows) {
      await run('INSERT INTO plans (id,name,daily_rate,duration_days,min_amount,max_amount,risk,description,active,sort) VALUES (?,?,?,?,?,?,?,?,?,?)', p);
    }
  }
  const pm = await get('SELECT COUNT(*) AS n FROM payment_methods', []);
  if (!Number(pm.n)) {
    const rows = [
      ['pm_usdt', 'USDT', 'TRC-20', 'TQ4r8mJ2wL9xKdVn7sQePz3YbH6uNcAfXm', 'Deposit address', 1, 1],
      ['pm_usdc', 'USDC', 'ERC-20', '0x71bE4c92Aa8Df31C5eB7a0d9F6c2B485E1dC92A', 'Deposit address', 1, 2],
      ['pm_sepa', 'SEPA', 'Bank transfer', 'IBAN on request', 'Bank transfer', 1, 3]
    ];
    for (const m of rows) {
      await run('INSERT INTO payment_methods (id,name,network,address,note,active,sort) VALUES (?,?,?,?,?,?,?)', m);
    }
  }
  const wn = await get('SELECT COUNT(*) AS n FROM withdraw_networks', []);
  if (!Number(wn.n)) {
    const rows = [
      ['wn_trc', 'TRC-20', 50, 0, 1],
      ['wn_erc', 'ERC-20', 100, 0.5, 1],
      ['wn_bep', 'BEP-20', 50, 0, 1],
      ['wn_sepa', 'SEPA / bank', 250, 0, 1]
    ];
    for (const n of rows) {
      await run('INSERT INTO withdraw_networks (id,name,min_amount,fee_pct,active) VALUES (?,?,?,?,?)', n);
    }
  }
  const defaults = {
    maintenance: 'false',
    minWithdrawal: '50',
    withdrawalFeePct: '0'
  };
  for (const [k, v] of Object.entries(defaults)) {
    const row = await get('SELECT value FROM settings WHERE key = ?', [k]);
    if (!row) await run('INSERT INTO settings (key,value) VALUES (?,?)', [k, v]);
  }
}

async function all(sql, params = []) {
  if (isPg) {
    const res = await pgPool.query(toPg(sql), params);
    return res.rows;
  }
  return sqlite.prepare(sql).all(params);
}

async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0] || null;
}

async function run(sql, params = []) {
  if (isPg) {
    return pgPool.query(toPg(sql), params);
  }
  return sqlite.prepare(sql).run(params);
}

function id(prefix) {
  return (prefix || 'id') + '_' + crypto.randomBytes(7).toString('hex');
}
function now() { return Date.now(); }

module.exports = { init, all, get, run, id, now, driver: () => (isPg ? 'postgres' : 'sqlite') };
