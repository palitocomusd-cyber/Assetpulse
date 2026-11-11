/**
 * AssetPulse server — real accounts, server-side ledger, PostgreSQL/SQLite persistence.
 *
 * Env:
 *   DATABASE_URL         Postgres connection string (Render). Falls back to SQLite.
 *   SESSION_SECRET       unused for opaque tokens, reserved
 *   APP_URL              public URL (e.g. https://assetpulse.app)
 *   BREVO_API_KEY        Brevo API key
 *   BREVO_SENDER_EMAIL   verified Brevo sender
 *   BREVO_SENDER_NAME    display name
 *   BREVO_TEST_MODE      true = log instead of send
 *   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  optional web push
 */
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));

const PORT = process.env.PORT || 3000;
const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');
const BREVO_KEY = process.env.BREVO_API_KEY || '';
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || '';
const SENDER_NAME = process.env.BREVO_SENDER_NAME || 'AssetPulse';
const TEST_MODE = String(process.env.BREVO_TEST_MODE || '').toLowerCase() === 'true';
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || ('mailto:' + (process.env.BREVO_SENDER_EMAIL || 'admin@assetpulse.app'));
let webpush = null;
try {
  webpush = require('web-push');
  if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
} catch (e) { console.warn('web-push unavailable:', e.message); }
const pushEnabled = () => !!(webpush && VAPID_PUBLIC && VAPID_PRIVATE);
const DAY = 86400000;
const SESSION_DAYS = 30;

/* ---------------- helpers ---------------- */
const isEmail = v => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const str = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const money = n => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

/* naive rate limiting */
const buckets = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = (req.ip || 'x') + ':' + req.path;
    const t = Date.now();
    const b = buckets.get(key) || { n: 0, t };
    if (t - b.t > windowMs) { b.n = 0; b.t = t; }
    if (++b.n > max) return res.status(429).json({ error: 'Too many attempts. Try again shortly.' });
    buckets.set(key, b);
    next();
  };
}

/* ---------------- cookies & sessions ---------------- */
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function setSessionCookie(req, res, token, maxAgeMs) {
  const secure = req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https');
  const sec = Math.floor(maxAgeMs / 1000);
  const bits = ['ap_session=' + token, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=' + sec];
  if (secure) bits.push('Secure');
  res.append('Set-Cookie', bits.join('; '));
  // readable hint so the client knows whether to fetch state on load
  res.append('Set-Cookie', 'ap_auth=1; Path=/; SameSite=Lax; Max-Age=' + sec + (secure ? '; Secure' : ''));
}
function clearSessionCookie(res) {
  res.append('Set-Cookie', 'ap_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.append('Set-Cookie', 'ap_auth=; Path=/; SameSite=Lax; Max-Age=0');
}

async function sessionUser(req) {
  const token = parseCookies(req).ap_session;
  if (!token) return null;
  const row = await db.get(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', [token]
  );
  if (!row) return null;
  const sess = await db.get('SELECT expires_at FROM sessions WHERE token = ?', [token]);
  if (!sess || Number(sess.expires_at) < Date.now()) {
    await db.run('DELETE FROM sessions WHERE token = ?', [token]);
    return null;
  }
  return row;
}

const publicUser = u => ({
  id: u.id, email: u.email, name: u.name, country: u.country, phone: u.phone,
  referral: u.referral, referredBy: u.referred_by,
  cash: num(u.cash), assets: num(u.assets), reinvest: num(u.reinvest),
  kyc: u.kyc, isAdmin: !!Number(u.is_admin), frozen: !!Number(u.frozen),
  autoReinvest: !!Number(u.auto_reinvest), hasPin: !!u.pin_hash,
  lang: u.lang || 'en', createdAt: Number(u.created_at)
});

/* ---------------- notifications & activity ---------------- */
async function notify(userId, message, type = 'info', fromAdmin = false) {
  await db.run(
    'INSERT INTO notifications (id,user_id,message,type,is_read,from_admin,created_at) VALUES (?,?,?,?,?,?,?)',
    [db.id('n'), userId, message, type, 0, fromAdmin ? 1 : 0, Date.now()]
  );
}
async function logActivity(actor, what) {
  await db.run('INSERT INTO activity (id,actor,what,at) VALUES (?,?,?,?)', [db.id('a'), actor || 'system', what, Date.now()]);
}
async function addTransaction(userId, type, amount, status, description, at) {
  await db.run(
    'INSERT INTO transactions (id,user_id,type,amount,status,description,created_at) VALUES (?,?,?,?,?,?,?)',
    [db.id('tx'), userId, type, +Number(amount).toFixed(2), status, description, at || Date.now()]
  );
}
async function adjust(userId, field, delta) {
  const allowed = ['cash', 'assets', 'reinvest'];
  if (!allowed.includes(field)) throw new Error('bad field');
  const row = await db.get('SELECT ' + field + ' AS v FROM users WHERE id = ?', [userId]);
  const next = Math.max(0, +(num(row.v) + delta).toFixed(2));
  await db.run('UPDATE users SET ' + field + ' = ? WHERE id = ?', [next, userId]);
  return next;
}

/* ---------------- accrual engine ---------------- */
async function accrueUser(userId) {
  const positions = await db.all("SELECT * FROM positions WHERE user_id = ? AND status = 'Active'", [userId]);
  for (const p of positions) {
    const elapsed = Math.floor((Date.now() - Number(p.start_at)) / DAY);
    const capped = clamp(elapsed, 0, Number(p.duration_days));
    const target = +(Number(p.amount) * (Number(p.daily_rate) / 100) * capped).toFixed(2);
    if (target > Number(p.credited) + 0.005) {
      const delta = +(target - Number(p.credited)).toFixed(2);
      await db.run('UPDATE positions SET credited = ? WHERE id = ?', [target, p.id]);
      await adjust(userId, 'assets', delta);
      await addTransaction(userId, 'Earning', delta, 'Completed', p.plan_name + ' — accrued yield (' + capped + '/' + p.duration_days + ' days)');
    }
    if (elapsed >= Number(p.duration_days)) {
      const credited = num((await db.get('SELECT credited FROM positions WHERE id = ?', [p.id])).credited);
      const payout = +(Number(p.amount) + credited).toFixed(2);
      await db.run("UPDATE positions SET status = 'Completed', end_at = ? WHERE id = ?", [Number(p.start_at) + Number(p.duration_days) * DAY, p.id]);
      await adjust(userId, 'assets', -Number(p.amount));
      await adjust(userId, 'cash', payout);
      if (p.source === 'reinvest') await adjust(userId, 'reinvest', payout);
      await addTransaction(userId, 'Settlement', payout, 'Completed', p.plan_name + ' completed — principal + accrued yield returned');
      await notify(userId, 'Your ' + p.plan_name + ' plan completed. ' + money(payout) + ' was returned to your balance.', 'success');
    }
  }
}
async function accrueAll() {
  const users = await db.all('SELECT id FROM users', []);
  for (const u of users) await accrueUser(u.id);
}

/* ---------------- state ---------------- */
function mapPlan(p) {
  return { id: p.id, name: p.name, dailyRate: num(p.daily_rate), durationDays: Number(p.duration_days), min: num(p.min_amount), max: num(p.max_amount), risk: p.risk, desc: p.description, active: !!Number(p.active) };
}
function mapPosition(p) {
  return { id: p.id, userEmail: p.user_email, planId: p.plan_id, planName: p.plan_name, amount: num(p.amount), dailyRate: num(p.daily_rate), durationDays: Number(p.duration_days), start: Number(p.start_at), end: Number(p.end_at), credited: num(p.credited), source: p.source, status: p.status };
}
function mapTx(t) {
  return { id: t.id, userEmail: t.user_email, type: t.type, amount: num(t.amount), status: t.status, desc: t.description, created: Number(t.created_at) };
}
function mapDeposit(d) {
  return { id: d.id, userEmail: d.user_email, amount: num(d.amount), method: d.method, ref: d.ref, status: d.status, notes: d.notes, created: Number(d.created_at) };
}
function mapWithdrawal(w) {
  return { id: w.id, userEmail: w.user_email, amount: num(w.amount), address: w.address, network: w.network, status: w.status, notes: w.notes, fee: num(w.fee), created: Number(w.created_at) };
}
function mapKyc(k) { return { id: k.id, userEmail: k.user_email, docType: k.doc_type, docNumber: k.doc_number, status: k.status, notes: k.notes, submitted: Number(k.submitted_at) }; }
function mapNotif(n) { return { id: n.id, userEmail: n.user_email, message: n.message, type: n.type, read: !!Number(n.is_read), fromAdmin: !!Number(n.from_admin), created: Number(n.created_at) }; }
function mapPm(m) { return { id: m.id, name: m.name, network: m.network, address: m.address, note: m.note, active: !!Number(m.active) }; }
function mapWn(n) { return { id: n.id, name: n.name, min: num(n.min_amount), feePct: num(n.fee_pct), active: !!Number(n.active) }; }

async function settingsMap() {
  const rows = await db.all('SELECT key, value FROM settings', []);
  const s = {};
  rows.forEach(r => { s[r.key] = r.value; });
  return {
    maintenance: s.maintenance === 'true',
    minWithdrawal: num(s.minWithdrawal, 50),
    withdrawalFeePct: num(s.withdrawalFeePct, 0),
    appUrl: APP_URL || null,
    emailConfigured: !!BREVO_KEY && !!SENDER_EMAIL,
    pushConfigured: pushEnabled()
  };
}

const base = {
  plans: () => db.all('SELECT * FROM plans ORDER BY sort ASC, name ASC', []),
  methods: () => db.all('SELECT * FROM payment_methods ORDER BY sort ASC, name ASC', []),
  networks: () => db.all('SELECT * FROM withdraw_networks ORDER BY min_amount ASC', [])
};

async function investorState(user) {
  const uid = user.id;
  const [plans, methods, networks, positions, txs, deposits, withdrawals, kycRows, notifs, settings] = await Promise.all([
    base.plans(), base.methods(), base.networks(),
    db.all('SELECT p.*, u.email AS user_email FROM positions p JOIN users u ON u.id = p.user_id WHERE p.user_id = ? ORDER BY p.start_at DESC', [uid]),
    db.all('SELECT t.*, u.email AS user_email FROM transactions t JOIN users u ON u.id = t.user_id WHERE t.user_id = ? ORDER BY t.created_at DESC LIMIT 300', [uid]),
    db.all('SELECT d.*, u.email AS user_email FROM deposits d JOIN users u ON u.id = d.user_id WHERE d.user_id = ? ORDER BY d.created_at DESC', [uid]),
    db.all('SELECT w.*, u.email AS user_email FROM withdrawals w JOIN users u ON u.id = w.user_id WHERE w.user_id = ? ORDER BY w.created_at DESC', [uid]),
    db.all('SELECT k.*, u.email AS user_email FROM kyc k JOIN users u ON u.id = k.user_id WHERE k.user_id = ? ORDER BY k.submitted_at DESC', [uid]),
    db.all('SELECT n.*, u.email AS user_email FROM notifications n JOIN users u ON u.id = n.user_id WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 100', [uid]),
    settingsMap()
  ]);
  return {
    me: publicUser(user),
    users: [publicUser(user)],
    plans: plans.map(mapPlan).filter(p => p.active),
    positions: positions.map(mapPosition),
    transactions: txs.map(mapTx),
    deposits: deposits.map(mapDeposit),
    withdrawals: withdrawals.map(mapWithdrawal),
    kyc: kycRows.map(mapKyc),
    notifications: notifs.map(mapNotif),
    paymentMethods: methods.map(mapPm).filter(m => m.active),
    withdrawNetworks: networks.map(mapWn).filter(n => n.active),
    withdrawalAudit: [], emailLog: [], activity: [],
    settings
  };
}

async function adminState(user) {
  await accrueAll();
  const [users, plans, methods, networks, positions, txs, deposits, withdrawals, kycRows, notifs, audit, emails, activity, settings] = await Promise.all([
    db.all('SELECT * FROM users ORDER BY created_at DESC', []),
    base.plans(), base.methods(), base.networks(),
    db.all('SELECT p.*, u.email AS user_email FROM positions p JOIN users u ON u.id = p.user_id ORDER BY p.start_at DESC', []),
    db.all('SELECT t.*, u.email AS user_email FROM transactions t JOIN users u ON u.id = t.user_id ORDER BY t.created_at DESC LIMIT 600', []),
    db.all('SELECT d.*, u.email AS user_email FROM deposits d JOIN users u ON u.id = d.user_id ORDER BY d.created_at DESC', []),
    db.all('SELECT w.*, u.email AS user_email FROM withdrawals w JOIN users u ON u.id = w.user_id ORDER BY w.created_at DESC', []),
    db.all('SELECT k.*, u.email AS user_email FROM kyc k JOIN users u ON u.id = k.user_id ORDER BY k.submitted_at DESC', []),
    db.all('SELECT n.*, u.email AS user_email FROM notifications n JOIN users u ON u.id = n.user_id ORDER BY n.created_at DESC LIMIT 300', []),
    db.all('SELECT a.*, u.email AS user_email FROM withdrawal_audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.at DESC LIMIT 100', []),
    db.all('SELECT * FROM email_log ORDER BY at DESC LIMIT 200', []),
    db.all('SELECT * FROM activity ORDER BY at DESC LIMIT 100', []),
    settingsMap()
  ]);
  return {
    me: publicUser(user),
    users: users.map(publicUser),
    plans: plans.map(mapPlan),
    positions: positions.map(mapPosition),
    transactions: txs.map(mapTx),
    deposits: deposits.map(mapDeposit),
    withdrawals: withdrawals.map(mapWithdrawal),
    kyc: kycRows.map(mapKyc),
    notifications: notifs.map(mapNotif),
    paymentMethods: methods.map(mapPm),
    withdrawNetworks: networks.map(mapWn),
    withdrawalAudit: audit.map(a => ({ id: a.id, withdrawalId: a.withdrawal_id, userEmail: a.user_email, summary: a.summary, actor: a.actor, at: Number(a.at) })),
    emailLog: emails.map(e => ({ id: e.id, to: e.recipient, subject: e.subject, status: e.status, kind: e.kind, at: Number(e.at), reason: e.detail })),
    activity: activity.map(a => ({ id: a.id, who: a.actor, what: a.what, at: Number(a.at) })),
    settings
  };
}

const buildState = user => (publicUser(user).isAdmin ? adminState(user) : investorState(user));

/* ---------------- Web Push ---------------- */
async function sendPush(userId, title, body, url) {
  if (!pushEnabled()) return { delivered: 0, skipped: 'Push is not configured.' };
  const rows = await db.all('SELECT * FROM push_subscriptions WHERE user_id = ?', [userId]);
  if (!rows.length) return { delivered: 0, skipped: 'No subscriptions.' };
  const payload = JSON.stringify({ title, body, url: url || './#/app/notifications' });
  let delivered = 0;
  for (const row of rows) {
    const sub = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
    try {
      await webpush.sendNotification(sub, payload);
      delivered++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await db.run('DELETE FROM push_subscriptions WHERE id = ?', [row.id]);
      } else {
        console.warn('push send failed', e.statusCode || e.message);
      }
    }
  }
  return { delivered };
}

/* ---------------- Brevo ---------------- */
function emailShell(title, heading, rows, note) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#111114;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111114;padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#18181d;border:1px solid #2a2a31;border-radius:14px;overflow:hidden;">
<tr><td style="padding:26px 28px 8px;">
<div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#8b8b94;">AssetPulse</div>
<div style="height:2px;width:44px;background:linear-gradient(90deg,#e6e6ea,#6d6d76);margin:12px 0 18px;"></div>
<h1 style="margin:0 0 8px;font-size:21px;line-height:1.3;color:#f2f2f4;font-weight:700;">${escapeHtml(heading)}</h1>
<p style="margin:0 0 18px;font-size:13px;line-height:1.65;color:#9b9ba4;">${escapeHtml(title)}</p>
</td></tr>
<tr><td style="padding:0 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1e1e24;border:1px solid #2a2a31;border-radius:10px;">
${rows.map(r => `<tr><td style="padding:11px 14px;font-size:12.5px;color:#9b9ba4;border-bottom:1px solid #26262d;">${escapeHtml(r[0])}</td><td style="padding:11px 14px;font-size:12.5px;color:#ededf0;text-align:right;border-bottom:1px solid #26262d;">${escapeHtml(r[1])}</td></tr>`).join('')}
</table></td></tr>
<tr><td style="padding:20px 28px 26px;">
<p style="margin:0 0 16px;font-size:12px;line-height:1.7;color:#8b8b94;">${escapeHtml(note || '')}</p>
${APP_URL ? `<a href="${APP_URL}" style="display:inline-block;padding:11px 18px;border-radius:9px;background:#f2f2f4;color:#111114;font-size:13px;font-weight:700;text-decoration:none;">Open AssetPulse</a>` : ''}
</td></tr></table></td></tr></table></body></html>`;
}

async function brevoSend(to, name, subject, html, text) {
  if (!BREVO_KEY || !SENDER_EMAIL) return { skipped: 'Email service is not configured.' };
  if (TEST_MODE) { console.log('[brevo:test]', to, '|', subject); return { sent: true }; }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { name: SENDER_NAME, email: SENDER_EMAIL }, to: [{ email: to, name: name || to }], subject, htmlContent: html, textContent: text })
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('Brevo error', res.status, body.slice(0, 300));
    throw new Error('Email provider rejected the request.');
  }
  return { sent: true };
}

async function logEmail(recipient, subject, status, kind, detail) {
  await db.run('INSERT INTO email_log (id,recipient,subject,status,kind,detail,at) VALUES (?,?,?,?,?,?,?)',
    [db.id('em'), recipient, subject, status, kind, detail || '', Date.now()]);
}

async function sendEventEmail(event, to, name, data = {}) {
  let subject, heading, text, rows;
  if (event === 'registration') {
    subject = 'Your AssetPulse account is ready';
    heading = 'Welcome, ' + (name || to);
    text = 'Your account was created successfully.';
    rows = [['Account', to], ['Status', 'Active'], ['Created', new Date().toLocaleString('en-US')]];
  } else if (event === 'deposit-approved') {
    subject = 'Deposit approved — ' + money(data.amount);
    heading = 'Your deposit was approved';
    text = 'Your funding request has been reviewed and credited to your available balance.';
    rows = [['Amount', money(data.amount)], ['Method', data.method || '—'], ['Reference', data.reference || '—'], ['Status', 'Approved']];
  } else if (event === 'withdrawal-approved') {
    subject = 'Withdrawal approved — ' + money(data.amount);
    heading = 'Your withdrawal was approved';
    text = 'Your payout request has been reviewed and approved.';
    rows = [['Amount', money(data.amount)], ['Network', data.network || '—'], ['Destination', data.address || '—'], ['Status', 'Approved']];
  } else {
    return;
  }
  try {
    const r = await brevoSend(to, name, subject, emailShell(text, heading, rows, 'You are receiving this because of activity on your AssetPulse account.'), text);
    await logEmail(to, subject, r.sent ? 'sent' : 'skipped', 'auto', r.skipped || '');
  } catch (e) {
    await logEmail(to, subject, 'failed', 'auto', e.message);
  }
}

/* ---------------- auth routes ---------------- */
app.get('/api/config', async (req, res) => {
  const row = await db.get('SELECT COUNT(*) AS n FROM users', []);
  const plans = await db.all('SELECT * FROM plans WHERE active = 1 ORDER BY sort ASC, name ASC', []);
  res.json({
    appUrl: APP_URL || null,
    needsSetup: Number(row.n) === 0,
    emailConfigured: !!BREVO_KEY && !!SENDER_EMAIL,
    requiresVerification: true,
    plans: plans.map(mapPlan)
  });
});

app.post('/api/auth/register', rateLimit(10, 60_000), async (req, res, next) => {
  try {
    const email = str(req.body.email, 190).toLowerCase();
    const password = String(req.body.password || '');
    const name = str(req.body.name, 120);
    if (!isEmail(email)) fail(400, 'Enter a valid email address.');
    if (name.length < 2) fail(400, 'Enter your full name.');
    if (password.length < 8) fail(400, 'Password must be at least 8 characters.');

    const exists = await db.get('SELECT id FROM users WHERE LOWER(email) = ?', [email]);
    if (exists) fail(409, 'An account with that email already exists.');

    const countRow = await db.get('SELECT COUNT(*) AS n FROM users', []);
    const isFirst = Number(countRow.n) === 0;
    const hash = await bcrypt.hash(password, 10);
    const userId = db.id('u');
    const referral = 'AP-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    await db.run(
      `INSERT INTO users (id,email,password_hash,name,country,phone,referral,referred_by,cash,assets,reinvest,kyc,is_admin,frozen,auto_reinvest,lang,created_at)
       VALUES (?,?,?,?,?,?,?,?,0,0,0,?,?,0,0,'en',?)`,
      [userId, email, hash, name, str(req.body.country, 80) || 'Other', str(req.body.phone, 40), referral, str(req.body.ref, 40),
        isFirst ? 'Verified' : 'Pending', isFirst ? 1 : 0, Date.now()]
    );

    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + SESSION_DAYS * DAY;
    await db.run('INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES (?,?,?,?)', [token, userId, Date.now(), expires]);
    setSessionCookie(req, res, token, SESSION_DAYS * DAY);

    await notify(userId, isFirst
      ? 'Administrator account created. Configure payment methods and review the settings.'
      : 'Welcome to AssetPulse. Complete identity verification to unlock withdrawals.', 'success', true);
    sendEventEmail('registration', email, name, {});
    sendPush(userId, 'Welcome to AssetPulse', 'Your account is ready. Complete verification to unlock withdrawals.', './#/app/kyc');

    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    res.json({ ok: true, isAdmin: isFirst, state: await buildState(user) });
  } catch (e) { next(e); }
});

app.post('/api/auth/login', rateLimit(12, 60_000), async (req, res, next) => {
  try {
    const email = str(req.body.email, 190).toLowerCase();
    const user = await db.get('SELECT * FROM users WHERE LOWER(email) = ?', [email]);
    if (!user) fail(401, 'Invalid email or password.');
    if (Number(user.frozen)) fail(403, 'This account is suspended. Contact support.');
    const ok = await bcrypt.compare(String(req.body.password || ''), user.password_hash);
    if (!ok) fail(401, 'Invalid email or password.');

    const token = crypto.randomBytes(32).toString('hex');
    await db.run('INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES (?,?,?,?)',
      [token, user.id, Date.now(), Date.now() + SESSION_DAYS * DAY]);
    setSessionCookie(req, res, token, SESSION_DAYS * DAY);
    res.json({ ok: true, state: await buildState(user) });
  } catch (e) { next(e); }
});

app.post('/api/auth/logout', async (req, res) => {
  const token = parseCookies(req).ap_session;
  if (token) await db.run('DELETE FROM sessions WHERE token = ?', [token]);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/state', async (req, res, next) => {
  try {
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not signed in.' });
    await accrueUser(user.id);
    const fresh = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);
    res.json({ state: await buildState(fresh) });
  } catch (e) { next(e); }
});

/* ---------------- actions ---------------- */
app.post('/api/action', rateLimit(240, 60_000), async (req, res, next) => {
  try {
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not signed in.' });
    if (req.body.type !== 'auth') await accrueUser(user.id);
    const fresh = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);
    const result = await runAction(req.body || {}, fresh);
    const updated = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);
    res.json(Object.assign({ ok: true }, result || {}, { state: await buildState(updated) }));
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

async function requireAdmin(user) {
  if (!Number(user.is_admin)) fail(403, 'Administrator access required.');
}
async function requirePin(user, pin) {
  if (!user.pin_hash) fail(400, 'Set a transaction PIN in Profile first.');
  const ok = await bcrypt.compare(String(pin || ''), user.pin_hash);
  if (!ok) fail(401, 'Incorrect transaction PIN.');
}
async function userById(id) { return db.get('SELECT * FROM users WHERE id = ?', [id]); }
async function userByEmail(email) { return db.get('SELECT * FROM users WHERE LOWER(email) = ?', [String(email || '').toLowerCase()]); }

async function runAction(body, user) {
  const type = str(body.type, 60);

  /* ---------- investor ---------- */
  if (type === 'invest') {
    const plan = await db.get('SELECT * FROM plans WHERE id = ?', [body.planId]);
    if (!plan || !Number(plan.active)) fail(404, 'Plan not found.');
    const amount = num(body.amount);
    const source = ['cash', 'reinvest', 'assets'].includes(body.source) ? body.source : 'cash';
    if (!(amount > 0)) fail(400, 'Enter a valid amount.');
    if (amount < num(plan.min_amount)) fail(400, 'Minimum for ' + plan.name + ' is ' + money(plan.min_amount) + '.');
    if (num(plan.max_amount) < 99999 && amount > num(plan.max_amount)) fail(400, 'Maximum for ' + plan.name + ' is ' + money(plan.max_amount) + '.');
    const bal = num(user[source]);
    if (amount > bal) fail(400, 'Insufficient ' + source + ' balance.');
    await requirePin(user, body.pin);
    const dup = await db.get("SELECT id FROM positions WHERE user_id = ? AND plan_id = ? AND status = 'Active'", [user.id, plan.id]);
    if (dup) fail(400, 'You already hold an active ' + plan.name + ' position.');

    await adjust(user.id, source, -amount);
    await adjust(user.id, 'assets', amount);
    const start = Date.now();
    await db.run(
      `INSERT INTO positions (id,user_id,plan_id,plan_name,amount,daily_rate,duration_days,start_at,end_at,credited,source,status)
       VALUES (?,?,?,?,?,?,?,?,?,0,?,'Active')`,
      [db.id('pos'), user.id, plan.id, plan.name, amount, num(plan.daily_rate), Number(plan.duration_days), start, start + Number(plan.duration_days) * DAY, source]
    );
    await addTransaction(user.id, 'Investment', amount, 'Completed', plan.name + ' plan activated');
    await notify(user.id, 'Your ' + plan.name + ' position was activated with ' + money(amount) + '.', 'success');
    return { message: 'Position activated.' };
  }

  if (type === 'deposit.create') {
    const amount = num(body.amount);
    if (!(amount >= 10)) fail(400, 'Minimum deposit is $10.');
    const method = str(body.method, 120);
    if (!method) fail(400, 'Choose a payment method.');
    const pm = await db.get('SELECT * FROM payment_methods WHERE (name || " (" || network || ")") = ? OR name = ?', [method, method]).catch(() => null);
    await db.run('INSERT INTO deposits (id,user_id,amount,method,ref,status,notes,created_at) VALUES (?,?,?,?,?,?,?,?)',
      [db.id('dep'), user.id, +amount.toFixed(2), method, str(body.ref, 190), 'Pending', '', Date.now()]);
    await addTransaction(user.id, 'Deposit', amount, 'Pending', method + ' deposit awaiting review');
    await notify(user.id, 'Deposit of ' + money(amount) + ' submitted for review.', 'info');
    return { message: 'Deposit submitted for review.' };
  }

  if (type === 'withdraw.create') {
    if (user.kyc !== 'Verified') fail(400, 'Complete identity verification before withdrawing.');
    const amount = num(body.amount);
    const network = str(body.network, 40);
    const address = str(body.address, 190);
    if (!address) fail(400, 'Enter a destination address.');
    const wn = await db.get('SELECT * FROM withdraw_networks WHERE name = ? AND active = 1', [network]);
    const min = Math.max(Number((await db.get("SELECT value FROM settings WHERE key='minWithdrawal'"))?.value || 50), wn ? num(wn.min_amount) : 0);
    if (!(amount > 0) || amount < min) fail(400, 'Minimum withdrawal on this network is ' + money(min) + '.');
    if (amount > num(user.cash)) fail(400, 'Amount exceeds available cash.');
    await requirePin(user, body.pin);
    const feePct = wn ? num(wn.fee_pct) : 0;
    const fee = +(amount * feePct / 100).toFixed(2);
    await adjust(user.id, 'cash', -amount);
    await db.run('INSERT INTO withdrawals (id,user_id,amount,address,network,status,notes,fee,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [db.id('wd'), user.id, +amount.toFixed(2), address, network, 'Pending', '', fee, Date.now()]);
    await addTransaction(user.id, 'Withdrawal', amount, 'Pending', 'Payout request · ' + network + (fee ? ' · fee ' + money(fee) : ''));
    await notify(user.id, 'Withdrawal request of ' + money(amount) + ' received and is awaiting review.', 'info');
    return { message: 'Withdrawal request submitted.' };
  }

  if (type === 'transfer') {
    const from = ['cash', 'assets', 'reinvest'].includes(body.from) ? body.from : null;
    const to = ['cash', 'assets', 'reinvest'].includes(body.to) ? body.to : null;
    if (!from || !to || from === to) fail(400, 'Choose two different balances.');
    const amount = num(body.amount);
    if (!(amount > 0)) fail(400, 'Enter a valid amount.');
    if (amount > num(user[from])) fail(400, 'Insufficient ' + from + ' balance.');
    await requirePin(user, body.pin);
    await adjust(user.id, from, -amount);
    await adjust(user.id, to, amount);
    await addTransaction(user.id, 'Transfer', amount, 'Completed', 'Moved from ' + from + ' to ' + to);
    return { message: 'Transfer complete.' };
  }

  if (type === 'kyc.submit') {
    const docType = str(body.docType, 60), docNumber = str(body.docNumber, 80);
    if (!docNumber) fail(400, 'Enter a document number.');
    await db.run('INSERT INTO kyc (id,user_id,doc_type,doc_number,status,notes,submitted_at) VALUES (?,?,?,?,?,?,?)',
      [db.id('kyc'), user.id, docType, docNumber, 'Pending', '', Date.now()]);
    await db.run("UPDATE users SET kyc = 'Pending' WHERE id = ?", [user.id]);
    await notify(user.id, 'Your verification documents were submitted for review.', 'info');
    await logActivity(user.email, 'Submitted verification documents');
    return { message: 'Submitted for review.' };
  }

  if (type === 'profile.update') {
    await db.run('UPDATE users SET name = ?, phone = ?, country = ?, lang = ? WHERE id = ?',
      [str(body.name, 120) || user.name, str(body.phone, 40), str(body.country, 80) || user.country, str(body.lang, 10) || 'en', user.id]);
    return { message: 'Profile updated.' };
  }

  if (type === 'pin.update') {
    const pin = String(body.pin || '');
    if (!/^\d{4,6}$/.test(pin)) fail(400, 'PIN must be 4–6 digits.');
    if (pin !== String(body.pin2 || '')) fail(400, 'PINs do not match.');
    const hash = await bcrypt.hash(pin, 10);
    await db.run('UPDATE users SET pin_hash = ? WHERE id = ?', [hash, user.id]);
    return { message: 'Transaction PIN updated.' };
  }

  if (type === 'notifications.readAll') {
    await db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [user.id]);
    return {};
  }

  /* ---------- admin ---------- */
  if (type.startsWith('admin.')) await requireAdmin(user);

  if (type === 'admin.deposit.approve' || type === 'admin.deposit.reject') {
    const d = await db.get('SELECT * FROM deposits WHERE id = ?', [body.id]);
    if (!d || d.status !== 'Pending') fail(400, 'Deposit is not pending.');
    const owner = await userById(d.user_id);
    if (type.endsWith('approve')) {
      await db.run("UPDATE deposits SET status = 'Approved' WHERE id = ?", [d.id]);
      await adjust(d.user_id, 'cash', num(d.amount));
      await addTransaction(d.user_id, 'Deposit', num(d.amount), 'Completed', d.method + ' deposit approved');
      await notify(d.user_id, 'Your deposit of ' + money(d.amount) + ' was approved and credited.', 'success', true);
      await logActivity(user.email, 'Approved deposit ' + money(d.amount) + ' for ' + owner.email);
      sendEventEmail('deposit-approved', owner.email, owner.name, { amount: num(d.amount), method: d.method, reference: d.ref });
      sendPush(d.user_id, 'Deposit approved', money(d.amount) + ' was credited to your available balance.', './#/app/overview');
      return { message: 'Deposit approved and credited.' };
    }
    await db.run("UPDATE deposits SET status = 'Rejected' WHERE id = ?", [d.id]);
    await addTransaction(d.user_id, 'Deposit', num(d.amount), 'Rejected', d.method + ' deposit rejected');
    await notify(d.user_id, 'Your deposit of ' + money(d.amount) + ' was rejected. The reference could not be matched.', 'error', true);
    await logActivity(user.email, 'Rejected deposit ' + money(d.amount) + ' for ' + owner.email);
    return { message: 'Deposit rejected.' };
  }

  if (type === 'admin.withdraw.approve' || type === 'admin.withdraw.reject') {
    const w = await db.get('SELECT * FROM withdrawals WHERE id = ?', [body.id]);
    if (!w || w.status !== 'Pending') fail(400, 'Withdrawal is not pending.');
    const owner = await userById(w.user_id);
    if (type.endsWith('approve')) {
      await db.run("UPDATE withdrawals SET status = 'Completed', notes = 'Approved' WHERE id = ?", [w.id]);
      await db.run("UPDATE transactions SET status = 'Completed' WHERE user_id = ? AND type = 'Withdrawal' AND status = 'Pending' AND ABS(amount - ?) < 0.01", [w.user_id, num(w.amount)]);
      await notify(w.user_id, 'Your withdrawal of ' + money(w.amount) + ' was approved and paid.', 'success', true);
      await logActivity(user.email, 'Approved withdrawal ' + money(w.amount) + ' for ' + owner.email);
      sendEventEmail('withdrawal-approved', owner.email, owner.name, { amount: num(w.amount), network: w.network, address: w.address });
      sendPush(w.user_id, 'Withdrawal approved', money(w.amount) + ' was approved and is processing.', './#/app/withdraw');
      return { message: 'Withdrawal approved.' };
    }
    await db.run("UPDATE withdrawals SET status = 'Rejected', notes = 'Rejected' WHERE id = ?", [w.id]);
    await adjust(w.user_id, 'cash', num(w.amount));
    await db.run("UPDATE transactions SET status = 'Rejected' WHERE user_id = ? AND type = 'Withdrawal' AND status = 'Pending' AND ABS(amount - ?) < 0.01", [w.user_id, num(w.amount)]);
    await notify(w.user_id, 'Your withdrawal of ' + money(w.amount) + ' was rejected and the funds returned to your balance.', 'error', true);
    await logActivity(user.email, 'Rejected withdrawal ' + money(w.amount) + ' for ' + owner.email);
    return { message: 'Withdrawal rejected and refunded.' };
  }

  if (type === 'admin.withdraw.edit') {
    const w = await db.get('SELECT * FROM withdrawals WHERE id = ?', [body.id]);
    if (!w) fail(404, 'Withdrawal not found.');
    const owner = await userById(w.user_id);
    const old = { amount: num(w.amount), network: w.network, address: w.address, status: w.status };
    const newAmount = num(body.amount, old.amount);
    if (!(newAmount > 0)) fail(400, 'Enter a valid amount.');
    const diff = +(newAmount - old.amount).toFixed(2);
    if (diff > 0) {
      if (num(owner.cash) < diff) fail(400, 'User has insufficient cash to increase the held amount.');
      await adjust(owner.id, 'cash', -diff);
    } else if (diff < 0) {
      await adjust(owner.id, 'cash', Math.abs(diff));
    }
    const network = str(body.network, 40) || old.network;
    const address = str(body.address, 190) || old.address;
    const status = ['Pending', 'Completed', 'Rejected'].includes(body.status) ? body.status : old.status;
    await db.run('UPDATE withdrawals SET amount = ?, network = ?, address = ?, status = ?, notes = ? WHERE id = ?',
      [+newAmount.toFixed(2), network, address, status, str(body.notes, 500), w.id]);

    if (status !== old.status) {
      if (status === 'Completed' && old.status === 'Pending') {
        await db.run("UPDATE transactions SET status = 'Completed' WHERE user_id = ? AND type = 'Withdrawal' AND status = 'Pending' AND ABS(amount - ?) < 0.01", [owner.id, newAmount]);
        sendEventEmail('withdrawal-approved', owner.email, owner.name, { amount: newAmount, network, address });
        sendPush(owner.id, 'Withdrawal approved', money(newAmount) + ' was approved and is processing.', './#/app/withdraw');
        await notify(owner.id, 'Your withdrawal of ' + money(newAmount) + ' was approved and is processing.', 'success', true);
      } else if (status === 'Rejected' && old.status === 'Pending') {
        await adjust(owner.id, 'cash', newAmount);
        await db.run("UPDATE transactions SET status = 'Rejected' WHERE user_id = ? AND type = 'Withdrawal' AND status = 'Pending' AND ABS(amount - ?) < 0.01", [owner.id, newAmount]);
        await notify(owner.id, 'Your withdrawal of ' + money(newAmount) + ' was rejected and the funds returned.', 'error', true);
      }
    }

    const changes = [];
    if (Math.abs(old.amount - newAmount) > 0.004) changes.push('amount ' + money(old.amount) + '→' + money(newAmount));
    if (old.network !== network) changes.push('network ' + old.network + '→' + network);
    if (old.address !== address) changes.push('destination changed');
    if (old.status !== status) changes.push('status ' + old.status + '→' + status);
    if (changes.length) {
      await db.run('INSERT INTO withdrawal_audit (id,withdrawal_id,user_id,summary,actor,at) VALUES (?,?,?,?,?,?)',
        [db.id('wa'), w.id, owner.id, 'Edited ' + owner.email + ' · ' + changes.join(' · '), user.email, Date.now()]);
      await logActivity(user.email, 'Edited withdrawal for ' + owner.email + ' (' + changes.join(', ') + ')');
    }
    return { message: 'Withdrawal request updated.' };
  }

  if (type === 'admin.kyc.approve' || type === 'admin.kyc.reject') {
    const k = await db.get('SELECT * FROM kyc WHERE id = ?', [body.id]);
    if (!k || k.status !== 'Pending') fail(400, 'Submission is not pending.');
    const owner = await userById(k.user_id);
    const approved = type.endsWith('approve');
    await db.run('UPDATE kyc SET status = ?, notes = ? WHERE id = ?', [approved ? 'Approved' : 'Rejected', approved ? '' : 'Document could not be verified.', k.id]);
    await db.run('UPDATE users SET kyc = ? WHERE id = ?', [approved ? 'Verified' : 'Rejected', k.user_id]);
    await notify(k.user_id, approved ? 'Your identity verification was approved.' : 'Your identity verification was rejected. Please resubmit a clearer document.', approved ? 'success' : 'error', true);
    await logActivity(user.email, (approved ? 'Approved' : 'Rejected') + ' verification for ' + owner.email);
    return { message: 'Verification ' + (approved ? 'approved' : 'rejected') + '.' };
  }

  if (type === 'admin.user.update') {
    const target = await userById(body.id);
    if (!target) fail(404, 'User not found.');
    const email = str(body.email, 190).toLowerCase();
    if (!isEmail(email)) fail(400, 'Enter a valid email address.');
    if (email !== target.email.toLowerCase()) {
      const clash = await userByEmail(email);
      if (clash) fail(409, 'That email is already in use.');
    }
    if (body.pin) {
      if (!/^\d{4,6}$/.test(String(body.pin))) fail(400, 'PIN must be 4–6 digits.');
      await db.run('UPDATE users SET pin_hash = ? WHERE id = ?', [await bcrypt.hash(String(body.pin), 10), target.id]);
    }
    if (body.pw) {
      if (String(body.pw).length < 8) fail(400, 'Password must be at least 8 characters.');
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(String(body.pw), 10), target.id]);
    }
    const before = { cash: num(target.cash), assets: num(target.assets), reinvest: num(target.reinvest) };
    const name = str(body.name, 120) || target.name;
    const kyc = ['Pending', 'Verified', 'Rejected'].includes(body.kyc) ? body.kyc : target.kyc;
    const isSelf = target.id === user.id;
    const frozen = isSelf ? Number(target.frozen) : (body.frozen ? 1 : 0);
    const isAdmin = isSelf ? Number(target.is_admin) : (body.isAdmin ? 1 : 0);
    await db.run('UPDATE users SET name=?, email=?, phone=?, country=?, kyc=?, frozen=?, is_admin=? WHERE id=?',
      [name, email, str(body.phone, 40), str(body.country, 80) || target.country, kyc, frozen, isAdmin, target.id]);

    const next = { cash: num(body.cash, before.cash), assets: num(body.assets, before.assets), reinvest: num(body.reinvest, before.reinvest) };
    for (const k of ['cash', 'assets', 'reinvest']) {
      const v = Math.max(0, +next[k].toFixed(2));
      if (Math.abs(v - before[k]) > 0.004) {
        await db.run('UPDATE users SET ' + k + ' = ? WHERE id = ?', [v, target.id]);
        await addTransaction(target.id, 'Adjustment', +(v - before[k]).toFixed(2), 'Completed', 'Administrator updated ' + k + ' balance');
      }
    }
    const note = str(body.note, 400);
    if (note) await notify(target.id, note, 'info', true);
    if (frozen && !Number(target.frozen)) await notify(target.id, 'Your account has been frozen by an administrator.', 'error', true);
    await logActivity(user.email, 'Updated account ' + email);
    return { message: 'User account updated.' };
  }

  if (type === 'admin.user.freeze') {
    const target = await userById(body.id);
    if (!target) fail(404, 'User not found.');
    if (target.id === user.id) fail(400, 'You cannot freeze your own account.');
    const frozen = Number(target.frozen) ? 0 : 1;
    await db.run('UPDATE users SET frozen = ? WHERE id = ?', [frozen, target.id]);
    await db.run('DELETE FROM sessions WHERE user_id = ?', [target.id]);
    await notify(target.id, frozen ? 'Your account has been frozen pending review.' : 'Your account has been unfrozen.', frozen ? 'error' : 'success', true);
    await logActivity(user.email, (frozen ? 'Froze' : 'Unfroze') + ' account ' + target.email);
    return { message: frozen ? 'Account frozen.' : 'Account unfrozen.' };
  }

  if (type === 'admin.tx.create' || type === 'admin.tx.update') {
    const owner = await userByEmail(body.userEmail);
    if (!owner) fail(400, 'Select a user.');
    const payload = [
      str(body.type, 40) || 'Adjustment',
      num(body.amount),
      str(body.status, 20) || 'Completed',
      str(body.description || body.desc, 300) || 'Entry',
      body.when ? new Date(body.when).getTime() : Date.now()
    ];
    if (type.endsWith('create')) {
      await db.run('INSERT INTO transactions (id,user_id,type,amount,status,description,created_at) VALUES (?,?,?,?,?,?,?)',
        [db.id('tx'), owner.id, ...payload]);
    } else {
      await db.run('UPDATE transactions SET type=?, amount=?, status=?, description=?, created_at=? WHERE id=?',
        [...payload, body.id]);
    }
    await logActivity(user.email, (type.endsWith('create') ? 'Added' : 'Edited') + ' a transaction for ' + owner.email);
    return { message: 'Transaction saved.' };
  }

  if (type === 'admin.tx.delete') {
    const t = await db.get('SELECT * FROM transactions WHERE id = ?', [body.id]);
    if (!t) fail(404, 'Entry not found.');
    await db.run('DELETE FROM transactions WHERE id = ?', [body.id]);
    await logActivity(user.email, 'Deleted a transaction');
    return { message: 'Transaction deleted.' };
  }

  if (type === 'admin.notify') {
    const message = str(body.message, 600);
    if (!message) fail(400, 'Write a message.');
    const type2 = ['info', 'success', 'error'].includes(body.type) ? body.type : 'info';
    let targets;
    if (body.target === 'all') targets = await db.all('SELECT id FROM users WHERE is_admin = 0', []);
    else {
      const t = await userByEmail(body.target);
      if (!t) fail(400, 'Select a recipient.');
      targets = [{ id: t.id }];
    }
    for (const t of targets) {
      await notify(t.id, message, type2, true);
      sendPush(t.id, 'AssetPulse', message, './#/app/notifications');
    }
    await logActivity(user.email, 'Sent a notification to ' + targets.length + ' user(s)');
    return { message: 'Notification sent to ' + targets.length + ' user(s).' };
  }

  if (type === 'admin.notif.update') {
    await db.run('UPDATE notifications SET message = ?, type = ?, is_read = ? WHERE id = ?',
      [str(body.message, 600), ['info', 'success', 'error'].includes(body.type) ? body.type : 'info', body.read ? 1 : 0, body.id]);
    return { message: 'Notification updated.' };
  }

  if (type === 'admin.notif.delete') {
    await db.run('DELETE FROM notifications WHERE id = ?', [body.id]);
    return { message: 'Notification deleted.' };
  }

  if (type === 'admin.pm.create' || type === 'admin.pm.update') {
    const p = [str(body.name, 60), str(body.network, 60), str(body.address, 190), str(body.note, 120), body.active ? 1 : 0];
    if (!p[0] || !p[1] || !p[2]) fail(400, 'Fill in the method details.');
    if (type.endsWith('create')) {
      await db.run('INSERT INTO payment_methods (id,name,network,address,note,active,sort) VALUES (?,?,?,?,?,?,?)',
        [db.id('pm'), ...p, Date.now() % 100000]);
    } else {
      await db.run('UPDATE payment_methods SET name=?, network=?, address=?, note=?, active=? WHERE id=?', [...p, body.id]);
    }
    await logActivity(user.email, (type.endsWith('create') ? 'Added' : 'Updated') + ' deposit method ' + p[0]);
    return { message: 'Deposit method saved.' };
  }

  if (type === 'admin.pm.toggle') {
    const m = await db.get('SELECT * FROM payment_methods WHERE id = ?', [body.id]);
    if (!m) fail(404, 'Method not found.');
    await db.run('UPDATE payment_methods SET active = ? WHERE id = ?', [Number(m.active) ? 0 : 1, m.id]);
    return {};
  }

  if (type === 'admin.pm.delete') {
    await db.run('DELETE FROM payment_methods WHERE id = ?', [body.id]);
    return { message: 'Method deleted.' };
  }

  if (type === 'admin.wn.create' || type === 'admin.wn.update') {
    const name = str(body.name, 60);
    if (!name) fail(400, 'Network name is required.');
    const vals = [name, Math.max(0, num(body.min, 50)), clamp(num(body.feePct), 0, 20), body.active ? 1 : 0];
    if (type.endsWith('create')) {
      await db.run('INSERT INTO withdraw_networks (id,name,min_amount,fee_pct,active) VALUES (?,?,?,?,?)', [db.id('wn'), ...vals]);
    } else {
      await db.run('UPDATE withdraw_networks SET name=?, min_amount=?, fee_pct=?, active=? WHERE id=?', [...vals, body.id]);
    }
    return { message: 'Withdrawal network saved.' };
  }

  if (type === 'admin.wn.toggle') {
    const n = await db.get('SELECT * FROM withdraw_networks WHERE id = ?', [body.id]);
    if (!n) fail(404, 'Network not found.');
    await db.run('UPDATE withdraw_networks SET active = ? WHERE id = ?', [Number(n.active) ? 0 : 1, n.id]);
    return {};
  }

  if (type === 'admin.plan.create' || type === 'admin.plan.update') {
    const name = str(body.name, 60);
    const rate = num(body.dailyRate);
    if (!name) fail(400, 'Plan name is required.');
    if (!(rate > 0) || rate > 5) fail(400, 'Daily rate must be between 0 and 5%.');
    const vals = [name, rate, Math.max(1, Number(body.durationDays) || 30), Math.max(0, num(body.min)), Math.max(0, num(body.max)), str(body.risk, 20) || 'Low', str(body.desc, 400)];
    if (type.endsWith('create')) {
      await db.run('INSERT INTO plans (id,name,daily_rate,duration_days,min_amount,max_amount,risk,description,active,sort) VALUES (?,?,?,?,?,?,?,?,1,?)',
        [db.id('p'), ...vals, Date.now() % 100000]);
    } else {
      await db.run('UPDATE plans SET name=?, daily_rate=?, duration_days=?, min_amount=?, max_amount=?, risk=?, description=? WHERE id=?', [...vals, body.id]);
    }
    await logActivity(user.email, (type.endsWith('create') ? 'Created' : 'Edited') + ' plan ' + name);
    return { message: 'Plan saved.' };
  }

  if (type === 'admin.plan.toggle') {
    const p = await db.get('SELECT * FROM plans WHERE id = ?', [body.id]);
    if (!p) fail(404, 'Plan not found.');
    await db.run('UPDATE plans SET active = ? WHERE id = ?', [Number(p.active) ? 0 : 1, p.id]);
    return {};
  }

  if (type === 'admin.settings.update') {
    for (const [k, v] of Object.entries({ maintenance: body.maintenance ? 'true' : 'false', minWithdrawal: String(Math.max(0, num(body.minWithdrawal, 50))), withdrawalFeePct: String(clamp(num(body.withdrawalFeePct), 0, 10)) })) {
      const row = await db.get('SELECT key FROM settings WHERE key = ?', [k]);
      if (row) await db.run('UPDATE settings SET value = ? WHERE key = ?', [v, k]);
      else await db.run('INSERT INTO settings (key,value) VALUES (?,?)', [k, v]);
    }
    await logActivity(user.email, 'Updated platform settings');
    return { message: 'Settings saved.' };
  }

  if (type === 'admin.email.broadcast') {
    const recipients = body.target === 'all'
      ? (await db.all('SELECT email FROM users WHERE is_admin = 0', [])).map(r => r.email)
      : (Array.isArray(body.recipients) ? body.recipients.filter(isEmail) : []);
    if (!recipients.length) fail(400, 'Select at least one recipient.');
    if (recipients.length > 500) fail(400, 'Maximum 500 recipients per send.');
    const subject = str(body.subject, 190), message = str(body.message, 4000);
    if (!subject || !message) fail(400, 'Subject and message are required.');
    if (!BREVO_KEY || !SENDER_EMAIL) fail(400, 'Email service is not configured yet.');
    let sent = 0;
    for (const to of recipients) {
      try {
        const r = await brevoSend(to, to, subject, emailShell(message, subject, [['Sent', new Date().toLocaleString('en-US')]], 'You are receiving this because you have an AssetPulse account.'), message);
        if (r.sent) sent++;
      } catch (e) { /* logged below */ }
      await new Promise(r => setTimeout(r, 120));
    }
    await logEmail(recipients.length > 1 ? recipients.length + ' recipients' : recipients[0], subject, sent ? 'sent' : 'failed', 'broadcast', '');
    await logActivity(user.email, 'Sent a broadcast email to ' + recipients.length + ' users');
    return { message: 'Email sent to ' + sent + ' recipient(s).' };
  }

  fail(400, 'Unknown action: ' + type);
}

/* ---------------- web push routes ---------------- */
app.get('/api/push/key', (req, res) => res.json({ key: VAPID_PUBLIC || null, enabled: pushEnabled() }));

app.post('/api/push/subscribe', rateLimit(20, 60_000), async (req, res, next) => {
  try {
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in first.' });
    const sub = req.body && req.body.subscription;
    if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      return res.status(400).json({ error: 'Invalid subscription.' });
    }
    const existing = await db.get('SELECT id FROM push_subscriptions WHERE endpoint = ?', [sub.endpoint]);
    if (existing) {
      await db.run('UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ? WHERE id = ?',
        [user.id, sub.keys.p256dh, sub.keys.auth, existing.id]);
    } else {
      await db.run('INSERT INTO push_subscriptions (id,user_id,endpoint,p256dh,auth,created_at) VALUES (?,?,?,?,?,?)',
        [db.id('ps'), user.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth, Date.now()]);
    }
    const count = await db.get('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?', [user.id]);
    res.json({ ok: true, subscriptions: Number(count.n) });
  } catch (e) { next(e); }
});

app.post('/api/push/unsubscribe', async (req, res, next) => {
  try {
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in first.' });
    const endpoint = str(req.body.endpoint, 500);
    if (endpoint) await db.run('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', [endpoint, user.id]);
    else await db.run('DELETE FROM push_subscriptions WHERE user_id = ?', [user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post('/api/push/test', rateLimit(10, 60_000), async (req, res, next) => {
  try {
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in first.' });
    const r = await sendPush(user.id, 'AssetPulse', 'Device alerts are working.', './#/app/notifications');
    res.json({ ok: true, delivered: r.delivered, skipped: r.skipped || null });
  } catch (e) { next(e); }
});

/* ---------------- health & static ---------------- */
app.get('/api/health', async (req, res) => {
  const row = await db.get('SELECT COUNT(*) AS n FROM users', []);
  res.json({
    ok: true,
    service: 'assetpulse',
    database: db.driver(),
    appUrl: APP_URL || null,
    needsSetup: Number(row.n) === 0,
    email: { configured: !!BREVO_KEY && !!SENDER_EMAIL, sender: SENDER_EMAIL || null, testMode: TEST_MODE },
    push: { configured: pushEnabled() }
  });
});
app.get('/healthz', (req, res) => res.type('text').send('ok'));

const PUBLIC = path.join(__dirname, 'public');
const fs = require('fs');
app.get('/', (req, res) => {
  try {
    let html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
    const origin = APP_URL || (req.protocol + '://' + req.get('host'));
    html = html.replace(/__APP_URL__/g, origin);
    res.type('html').send(html);
  } catch (e) {
    res.sendFile(path.join(PUBLIC, 'index.html'));
  }
});
app.use(express.static(PUBLIC, { extensions: ['html'], maxAge: '1h' }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(PUBLIC, 'index.html'));
});

app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Server error.' });
});

db.init().then(info => {
  app.listen(PORT, () => {
    console.log('AssetPulse on ' + PORT + ' · db=' + info.driver + ' · email=' + (!!BREVO_KEY && !!SENDER_EMAIL));
  });
}).catch(err => {
  console.error('Database init failed', err);
  process.exit(1);
});
