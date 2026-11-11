
/* =========================================================
   AssetPulse — client application
   Accounts and the ledger live on the server (PostgreSQL/SQLite).
   ========================================================= */
const DAY = 86400000;
const now = () => Date.now();
const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9);
const qs = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = n => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const dt = t => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const dts = t => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const timeAgo = t => {
  const d = Math.max(0, now() - t), m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  const dd = Math.floor(h / 24); return dd === 1 ? 'yesterday' : dd + 'd ago';
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------------- icons ---------------- */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V21H3z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  down: '<path d="M12 4v14M6 12l6 6 6-6"/>',
  up: '<path d="M12 20V6M6 12l6-6 6 6"/>',
  transfer: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  shield: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  bell: '<path d="M18 15V9a6 6 0 1 0-12 0v6l-2 3h16l-2-3Z"/><path d="M10 21h4"/>',
  users: '<circle cx="9" cy="8" r="3.4"/><path d="M2 20c0-3.6 3.2-5.5 7-5.5s7 1.9 7 5.5"/><path d="M17 5.2a3.4 3.4 0 0 1 0 6.6M18 14.8c2.4.6 4 2.3 4 5.2"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H11a1.7 1.7 0 0 0 1-1.5 2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V11a1.7 1.7 0 0 0 1.5 1 2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.5 1Z"/>',
  logout: '<path d="M15 17l5-5-5-5M20 12H9M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7"/>',
  wallet: '<path d="M20 8H5a2 2 0 0 1 0-4h13v4"/><path d="M3 6v12a2 2 0 0 0 2 2h16V8H6"/><circle cx="17" cy="14" r="1.2"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  spark: '<path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z"/>'
};
const icon = (n, size = 16) => '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[n] || '') + '</svg>';

/* ---------------- state (server-backed) ---------------- */
/* The server owns accounts and the ledger. This module keeps an in-memory
   snapshot so the view layer can stay synchronous. */
const emptyState = () => ({
  me: null, users: [], plans: [], positions: [], transactions: [], deposits: [],
  withdrawals: [], kyc: [], notifications: [], paymentMethods: [], withdrawNetworks: [],
  withdrawalAudit: [], emailLog: [], activity: [],
  settings: { maintenance: false, minWithdrawal: 50, withdrawalFeePct: 0 },
  appUrl: null, emailConfigured: false
});
let db = emptyState();
let booted = false;
let stateLoaded = false;

function me() { return db.me; }
function userBy(email) {
  return db.users.find(u => u.email === email) || (db.me && db.me.email === email ? db.me : null);
}
function save() { /* server is the source of truth */ }

async function api(path, options) {
  const res = await fetch(path, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, options || {}));
  let data = {};
  try { data = await res.json(); } catch (e) { }
  if (!res.ok) { const err = new Error(data.error || 'Request failed.'); err.status = res.status; throw err; }
  return data;
}
async function refreshState() {
  try {
    const data = await api('api/state');
    if (data.state) { db = Object.assign(emptyState(), data.state); booted = true; }
    stateLoaded = true;
    return true;
  } catch (e) {
    if (e.status === 401) { db = emptyState(); booted = true; stateLoaded = true; return false; }
    throw e;
  }
}
async function act(type, payload) {
  const data = await api('api/action', { method: 'POST', body: JSON.stringify(Object.assign({ type }, payload || {})) });
  if (data.state) db = Object.assign(emptyState(), data.state);
  return data;
}
function accrue() { /* accrual runs on the server */ }

/* ---------------- feedback ---------------- */
function toast(msg, kind = 'ok') {
  const box = qs('#toasts');
  while (box.children.length >= 3) box.removeChild(box.firstChild);
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(10px)'; el.style.transition = '.25s'; }, 2800);
  setTimeout(() => el.remove(), 3150);
}
function openModal(title, body, opts = {}) {
  const root = qs('#modal-root');
  root.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3 style="font-size:17px">' + title + '</h3><button class="x" data-act="close-modal">×</button></div><div class="modal-body">' + body + '</div></div>';
  root.classList.add('open');
  if (opts.after) opts.after(root);
}
function closeModal() {
  const r = qs('#modal-root'); r.classList.remove('open'); r.innerHTML = '';
}
function addNote(email, message, type = 'info', fromAdmin = false) {
  db.notifications.unshift({ id: uid('n'), userEmail: email, message, type, read: false, created: now(), fromAdmin });
}
function logAdmin(what) {
  db.activity.unshift({ id: uid('a'), at: now(), who: (me() || {}).email || 'system', what });
  db.activity = db.activity.slice(0, 60);
}
function pinOk(u, entered) {
  if (!u.pin) { toast('Set a transaction PIN in Profile first.', 'err'); return false; }
  if (String(entered) !== String(u.pin)) { toast('Incorrect transaction PIN.', 'err'); return false; }
  return true;
}
function badge(status) {
  const map = { Active: 'green', Completed: 'blue', Approved: 'green', Verified: 'green', Pending: 'amber', Rejected: 'red', Rejected_:'red', Failed: 'red', Frozen: 'red' };
  return '<span class="badge ' + (map[status] || '') + '">' + esc(status) + '</span>';
}

/* ---------------- chart ---------------- */
function areaChart(series, opts = {}) {
  const w = opts.w || 640, h = opts.h || 190, pad = 8;
  if (!series.length) series = [0, 0];
  const max = Math.max.apply(null, series), min = Math.min.apply(null, series);
  const span = (max - min) || 1;
  const pts = series.map((v, i) => {
    const x = pad + (i / Math.max(1, series.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / span) * (h - pad * 2 - 14) + 6;
    return [x, y];
  });
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (h - pad) + ' L' + pts[0][0].toFixed(1) + ' ' + (h - pad) + ' Z';
  const gid = 'g' + Math.random().toString(36).slice(2, 7);
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="none">' +
    '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e4e4e7" stop-opacity=".26"/><stop offset="100%" stop-color="#e4e4e7" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + area + '" fill="url(#' + gid + ')"/>' +
    '<path d="' + line + '" fill="none" stroke="#ededf0" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
    '</svg>';
}
function portfolioSeries(u, days = 30) {
  const out = [];
  const base = Math.max(500, u.cash + u.assets + u.reinvest);
  for (let i = days; i >= 0; i--) {
    const wob = Math.sin(i / 3.1) * base * 0.012 + Math.cos(i / 1.7) * base * 0.006;
    out.push(Math.max(0, base - i * base * 0.004 + wob));
  }
  return out;
}

/* ---------------- routing ---------------- */
const ROUTES = [
  { re: /^\/?$/, view: 'home' },
  { re: /^\/login$/, view: 'login' },
  { re: /^\/register$/, view: 'register' },
  { re: /^\/app\/overview$/, view: 'overview', auth: true },
  { re: /^\/app\/plans$/, view: 'plans', auth: true },
  { re: /^\/app\/deposit$/, view: 'deposit', auth: true },
  { re: /^\/app\/withdraw$/, view: 'withdraw', auth: true },
  { re: /^\/app\/transfer$/, view: 'transfer', auth: true },
  { re: /^\/app\/transactions$/, view: 'transactions', auth: true },
  { re: /^\/app\/kyc$/, view: 'kyc', auth: true },
  { re: /^\/app\/notifications$/, view: 'notifications', auth: true },
  { re: /^\/app\/profile$/, view: 'profile', auth: true },
  { re: /^\/admin\/overview$/, view: 'adminOverview', admin: true },
  { re: /^\/admin\/users$/, view: 'adminUsers', admin: true },
  { re: /^\/admin\/deposits$/, view: 'adminDeposits', admin: true },
  { re: /^\/admin\/withdrawals$/, view: 'adminWithdrawals', admin: true },
  { re: /^\/admin\/kyc$/, view: 'adminKyc', admin: true },
  { re: /^\/admin\/transactions$/, view: 'adminTransactions', admin: true },
  { re: /^\/admin\/notifications$/, view: 'adminNotifications', admin: true },
  { re: /^\/admin\/paymentmethods$/, view: 'adminPaymentMethods', admin: true },
  { re: /^\/admin\/email$/, view: 'adminEmail', admin: true },
  { re: /^\/admin\/plans$/, view: 'adminPlans', admin: true },
  { re: /^\/admin\/settings$/, view: 'adminSettings', admin: true }
];
function go(path) {
  if (location.hash === '#' + path) render();
  else location.hash = '#' + path;
}
function currentPath() {
  let h = location.hash.replace(/^#/, '');
  if (!h) h = '/';
  return h;
}
function route() {
  const path = currentPath();
  const hit = ROUTES.find(r => r.re.test(path));
  if (!hit) return { view: 'notfound' };
  const u = me();
  if (hit.auth && !u) return { view: 'login', redirect: path };
  if (hit.admin && (!u || !u.isAdmin)) return { view: u ? 'overview' : 'login', denied: path };
  return hit;
}

/* shell pieces */
function publicNav(active) {
  const u = me();
  return '<div class="topnav"><div class="wrap topnav-in">' +
    '<a href="#/" class="brand"><span class="logo">' + icon('spark', 18) + '</span> AssetPulse</a>' +
    '<nav class="nav-links">' +
    ['/', '/login'].map(() => '').join('') +
    '<a href="#/" class="' + (active === 'home' ? 'on' : '') + '">Overview</a>' +
    '<a data-act="scroll" data-target="strategies" style="cursor:pointer">Strategies</a>' +
    '<a data-act="scroll" data-target="how" style="cursor:pointer">How it works</a>' +
    '<a data-act="scroll" data-target="disclosures" style="cursor:pointer">Disclosures</a>' +
    '</nav>' +
    '<div class="nav-cta">' +
    '<button class="btn btn-ghost btn-sm" data-act="share-app" title="Share this app">' + icon('globe', 14) + '</button>' +
    '<button class="btn btn-ghost btn-sm install-btn" data-act="install-app" title="Install this app">' + icon('down', 14) + '<span class="install-label">Install</span></button>' +
    (u ? '<a class="btn btn-ghost btn-sm" href="#' + (u.isAdmin ? '/admin/overview' : '/app/overview') + '">Dashboard</a>'
      : '<a class="btn btn-ghost btn-sm" href="#/login">Sign in</a><a class="btn btn-primary btn-sm" href="#/register"><span class="hide-sm">Create account</span><span class="show-sm">Sign up</span></a>') +
    '</div></div></div>';
}
function publicFooter() {
  return '<footer><div class="wrap foot-in"><div>© ' + new Date().getFullYear() + ' AssetPulse. All rights reserved.</div>' +
    '<div class="foot-links"><a href="#/">Overview</a><a data-act="scroll" data-target="strategies" style="cursor:pointer">Strategies</a><a data-act="scroll" data-target="disclosures" style="cursor:pointer">Risk disclosure</a><a href="#/login">Sign in</a><a data-act="share-app" style="cursor:pointer">Share app</a></div></div></footer>';
}

const NAV_INVESTOR = [
  { g: 'Portfolio', items: [['overview', 'Overview', 'home'], ['plans', 'Plans & Invest', 'layers'], ['transactions', 'Transactions', 'list']] },
  { g: 'Money', items: [['deposit', 'Add funds', 'down'], ['withdraw', 'Withdraw', 'up'], ['transfer', 'Transfer', 'transfer']] },
  { g: 'Account', items: [['kyc', 'Verification', 'shield'], ['notifications', 'Notifications', 'bell'], ['profile', 'Profile & security', 'user']] }
];
const NAV_ADMIN = [
  { g: 'Operations', items: [['adminOverview', 'Overview', 'chart'], ['adminDeposits', 'Deposits', 'down'], ['adminWithdrawals', 'Withdrawals', 'up'], ['adminKyc', 'Verification', 'shield']] },
  { g: 'Manage', items: [['adminUsers', 'Users', 'users'], ['adminTransactions', 'Transactions', 'list'], ['adminNotifications', 'Notifications', 'bell'], ['adminPaymentMethods', 'Payment methods', 'card'], ['adminPlans', 'Plans', 'layers']] },
  { g: 'Communicate', items: [['adminEmail', 'Email centre', 'doc'], ['adminSettings', 'Settings', 'settings']] }
];
function sideNav(kind, activeKey) {
  const groups = kind === 'admin' ? NAV_ADMIN : NAV_INVESTOR;
  const u = me();
  let h = '<aside class="side" id="side"><a href="#/" class="brand"><span class="logo">' + icon('spark', 18) + '</span> AssetPulse</a>';
  h += '<div><div class="side-label">' + (kind === 'admin' ? 'Admin console' : 'Investor') + '</div><div class="side-nav">';
  groups.forEach(g => {
    h += '<div class="side-label">' + g.g + '</div>';
    g.items.forEach(it => {
      const key = it[0], label = it[1], icn = it[2];
      const href = kind === 'admin' ? '#/admin/' + key.replace('admin', '').toLowerCase() : '#/app/' + key;
      h += '<a class="side-link ' + (activeKey === key ? 'on' : '') + '" href="' + href + '">' + icon(icn) + '<span>' + label + '</span></a>';
    });
  });
  h += '</div></div>';
  h += '<div class="side-foot">';
  h += kind === 'admin'
    ? '<a class="side-link" href="#/app/overview">' + icon('wallet') + '<span>Investor view</span></a>'
    : (u && u.isAdmin ? '<a class="side-link" href="#/admin/overview">' + icon('settings') + '<span>Admin console</span></a>' : '');
  h += '<a class="side-link" data-act="logout">' + icon('logout') + '<span>Sign out</span></a>';
  h += '</div></aside><div class="side-backdrop" id="sideBackdrop" data-act="close-side"></div>';
  return h;
}
function appShell(kind, activeKey, title, content) {
  const u = me();
  const initials = (u.name || u.email).split(/[\s.@]/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('');
  const unread = db.notifications.filter(n => n.userEmail === u.email && !n.read).length;
  return '<div class="app">' + sideNav(kind, activeKey) +
    '<div class="main"><div class="topbar">' +
    '<div style="display:flex;align-items:center;gap:12px"><button class="menu-btn" data-act="open-side">☰</button><h1>' + title + '</h1></div>' +
    '<div class="tb-right">' +
    '<button class="btn btn-ghost btn-sm" data-act="share-app" title="Share app link">' + icon('globe', 15) + '</button>' +
    '<button class="btn btn-ghost btn-sm install-btn" data-act="install-app" title="Install app">' + icon('down', 15) + '<span class="install-label">Install</span></button>' +
    '<a class="btn btn-ghost btn-sm" href="#/app/notifications" style="position:relative">' + icon('bell', 15) + (unread ? '<span style="position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;border-radius:999px;font-size:9.5px;padding:1px 5px;font-weight:700">' + unread + '</span>' : '') + '</a>' +
    '<div style="display:flex;align-items:center;gap:9px"><div class="avatar">' + esc(initials) + '</div>' +
    '<div style="line-height:1.25" class="small"><div style="font-weight:600">' + esc(u.name || u.email) + '</div>' +
    '<div class="hint">' + (u.isAdmin ? 'Administrator' : 'Investor') + '</div></div></div>' +
    '</div></div><div class="content">' + content + '</div></div></div>';
}
/* ---------------- public: home ---------------- */
function viewHome() {
  const u = me();
  const plans = db.plans.filter(p => p.active);
  const sample = { cash: 6200, assets: 12450, reinvest: 3200 };
  const series = portfolioSeries(sample, 40);
  const total = sample.cash + sample.assets + sample.reinvest;

  const feats = [
    ['shield', 'Accounts, not demo data', 'Register once and your balance, positions and history follow you to every browser and device you sign in from.'],
    ['chart', 'A ledger you can audit', 'Every credit, debit, approval and rejection is written to a timestamped transaction record — nothing changes silently.'],
    ['lock', 'Protected actions', 'Signed-in sessions, hashed passwords and a transaction PIN on every movement of funds.'],
    ['users', 'Manual funding review', 'Deposits are credited only after the operations team verifies the transfer, and withdrawals are reviewed before payout.'],
    ['list', 'Full history', 'Statements, filters and CSV export for every entry on your account.'],
    ['globe', 'Works like an app', 'Install to your home screen and receive device notifications for deposits and payouts.']
  ];
  const steps = [
    ['Create your account', 'Register with your email. The first account on a new deployment becomes the administrator.'],
    ['Verify your identity', 'Submit your document reference from the dashboard. Verification unlocks withdrawals.'],
    ['Fund your account', 'Choose a payment method, send the transfer and submit the reference. Operations credits your balance after verification.'],
    ['Allocate and track', 'Select a plan, confirm with your transaction PIN, and follow accrual and settlement in the ledger.']
  ];

  return publicNav('home') +
    '<section class="hero"><div class="wrap hero-in">' +
    '<div>' +
    '<span class="eyebrow"><span class="dot-live"></span> Digital asset allocation · manual funding review</span>' +
    '<h1>Invest with a ledger you can <em>audit</em>.</h1>' +
    '<p class="lead">AssetPulse brings allocation plans, deposits, withdrawals and identity checks into one account — with a transaction record behind every number. Sign in from any device and pick up where you left off.</p>' +
    '<div class="hero-actions">' +
    '<button class="btn btn-primary" data-act="' + (u ? 'go-app' : 'go-register') + '">' + (u ? 'Open dashboard' : 'Create your account') + icon('arrowRight') + '</button>' +
    '<a class="btn btn-ghost" href="#/login">Sign in</a>' +
    '</div>' +
    '<div class="hero-meta">' +
    '<span><span class="tick">✓</span> Cross-device accounts</span>' +
    '<span><span class="tick">✓</span> Manual deposit verification</span>' +
    '<span><span class="tick">✓</span> Installable app</span>' +
    '</div></div>' +
    '<div class="hero-card">' +
    '<div class="hc-head"><div><div class="hint" style="margin-bottom:3px">Sample portfolio</div>' +
    '<div class="hc-val mono">' + money(total) + '</div></div><span class="sim-tag">Illustrative</span></div>' +
    areaChart(series, { h: 150 }) +
    '<div class="grid g2" style="margin-top:14px;gap:10px">' +
    '<div style="padding:11px 13px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid var(--line)"><div class="hint">Cash available</div><div class="mono" style="font-weight:600">' + money(sample.cash) + '</div></div>' +
    '<div style="padding:11px 13px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid var(--line)"><div class="hint">Invested</div><div class="mono" style="font-weight:600">' + money(sample.assets) + '</div></div>' +
    '</div>' +
    '<div class="hint" style="margin-top:12px;display:flex;gap:6px;align-items:center">' + icon('clock', 13) + ' Illustrative dashboard view, not an account.</div>' +
    '</div></div></section>' +

    '<section class="section" style="border-top:1px solid var(--line)"><div class="wrap">' +
    '<div class="section-head"><h2>Built like an account, not a landing page</h2>' +
    '<p>Sign in on your phone, your laptop or a new browser — the same balance, positions and history.</p></div>' +
    '<div class="grid g3">' + feats.map(f => '<div class="feat"><div class="ic">' + icon(f[0]) + '</div><div><h4>' + f[1] + '</h4><p>' + f[2] + '</p></div></div>').join('') + '</div>' +
    '</div></section>' +

    '<section class="section" id="strategies" style="background:linear-gradient(180deg,rgba(255,255,255,.02),transparent)"><div class="wrap">' +
    '<div class="section-head"><h2>Allocation plans</h2>' +
    '<p>Each plan has a fixed term and a modeled daily yield. Rates are illustrative: they are not offers, guarantees or projections of real performance.</p></div>' +
    '<div class="grid g4">' + plans.map(p => '<div class="plan-card' + (p.id === 'p_growth' ? ' hl' : '') + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center"><h4 style="font-size:15px">' + esc(p.name) + '</h4><span class="risk ' + (p.risk === 'Low' ? 'low' : p.risk === 'Medium' ? 'med' : 'high') + '">' + esc(p.risk) + ' risk</span></div>' +
      '<div><div class="rate">' + p.dailyRate.toFixed(2) + '%<small> / day</small></div><div class="hint">modeled, not guaranteed</div></div>' +
      '<div><div class="plan-kv"><span class="muted">Term</span><span>' + p.durationDays + ' days</span></div>' +
      '<div class="plan-kv"><span class="muted">Range</span><span class="mono">' + money(p.min) + ' – ' + (p.max >= 99999 ? 'no cap' : money(p.max)) + '</span></div></div>' +
      '<p class="small muted" style="margin:0;line-height:1.55">' + esc(p.desc) + '</p>' +
      '<button class="btn btn-ghost btn-sm" data-act="plan-detail" data-id="' + p.id + '">Details</button>' +
      '</div>').join('') + '</div>' +
    '<div class="notice warn" style="margin-top:18px">' + icon('shield') + '<div><b>No return is promised.</b> Digital-asset strategies can lose value. Review the disclosure before allocating funds.</div></div>' +
    '</div></section>' +

    '<section class="section" id="how"><div class="wrap" style="display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start">' +
    '<div><div class="section-head"><h2>How it works</h2><p>Four steps from registration to your first allocation.</p></div>' +
    '<div class="steps">' + steps.map((s2, i) => '<div class="step"><div class="n">' + (i + 1) + '</div><div><h4>' + s2[0] + '</h4><p>' + s2[1] + '</p></div></div>').join('') + '</div></div>' +
    '<div style="position:sticky;top:110px"><div class="disclosure" id="disclosures">' +
    '<h4>' + icon('shield', 15) + ' Risk disclosure</h4>' +
    '<p><b>Capital at risk.</b> Digital-asset strategies can lose value. Modeled yields on this platform are illustrative and are not a forecast, quote or guarantee of future performance.</p>' +
    '<p><b>Manual funding.</b> Deposits are credited only after operations verify the transfer; withdrawals are reviewed before payout. Processing can take time.</p>' +
    '<p><b>Not financial advice.</b> Nothing here is a personal recommendation. Seek independent advice if you are unsure.</p>' +
    '<p><b>Licensing.</b> AssetPulse makes no regulatory claim, holds no client assets and has no custodian relationship unless stated in your agreement.</p>' +
    '</div></div></div></section>' + publicFooter();
}

/* ---------------- public: auth ---------------- */
function viewLogin(redirect) {
  return publicNav('login') +
    '<div class="auth-wrap"><div class="auth-card">' +
    '<a href="#/" class="brand" style="margin-bottom:20px;font-size:15px"><span class="logo" style="width:28px;height:28px;border-radius:8px">' + icon('spark', 15) + '</span> AssetPulse</a>' +
    '<h2>Sign in</h2><p class="sub">Access your account from any device.</p>' +
    '<div class="err-box" id="loginErr"></div>' +
    '<form data-form="login" novalidate>' +
    '<input type="hidden" name="redirect" value="' + esc(redirect || '') + '">' +
    '<div class="field"><label>Email</label><input name="email" type="email" placeholder="you@example.com" autocomplete="username" required></div>' +
    '<div class="field"><label>Password</label><input name="password" type="password" placeholder="••••••••" autocomplete="current-password" required></div>' +
    '<button class="btn btn-primary" style="width:100%;margin-top:6px" type="submit">Sign in</button>' +
    '</form>' +
    '<div class="notice info" style="margin-top:16px">' + icon('lock') + '<div>Passwords are hashed on the server and your session is protected with an HttpOnly cookie.</div></div>' +
    '<div style="margin-top:16px;text-align:center" class="small muted">No account? <a class="link" href="#/register">Create one</a></div>' +
    '</div></div>';
}

function viewRegister() {
  return publicNav('register') +
    '<div class="auth-wrap"><div class="auth-card">' +
    '<a href="#/" class="brand" style="margin-bottom:20px;font-size:15px"><span class="logo" style="width:28px;height:28px;border-radius:8px">' + icon('spark', 15) + '</span> AssetPulse</a>' +
    '<h2>Create your account</h2><p class="sub">Your balance and history stay with your account across devices.</p>' +
    '<div class="err-box" id="regErr"></div>' +
    '<form data-form="register" novalidate>' +
    '<div class="field"><label>Full name</label><input name="name" placeholder="Jordan Rivera" autocomplete="name" required></div>' +
    '<div class="field"><label>Email</label><input name="email" type="email" placeholder="you@example.com" autocomplete="email" required></div>' +
    '<div class="grid g2" style="gap:12px"><div class="field"><label>Country</label><select name="country">' +
    ['United States', 'United Kingdom', 'Germany', 'India', 'Nigeria', 'Singapore', 'Brazil', 'Canada', 'Australia', 'Other'].map(c => '<option>' + c + '</option>').join('') +
    '</select></div><div class="field"><label>Phone</label><input name="phone" placeholder="+1 555 0100" autocomplete="tel"></div></div>' +
    '<div class="field"><label>Password</label><input name="password" type="password" placeholder="At least 8 characters" autocomplete="new-password" required></div>' +
    '<div class="field"><label>Referral code <span class="hint">(optional)</span></label><input name="ref" placeholder="AP-XXXXX"></div>' +
    '<button class="btn btn-primary" style="width:100%;margin-top:6px" type="submit">Create account</button>' +
    '</form>' +
    '<div class="notice info" style="margin-top:16px">' + icon('shield') + '<div>You will receive a confirmation email. The first account created on a new deployment becomes the administrator.</div></div>' +
    '<div style="margin-top:14px;text-align:center" class="small muted">Already have an account? <a class="link" href="#/login">Sign in</a></div>' +
    '</div></div>';
}

/* ---------------- investor: overview ---------------- */
function viewOverview() {
  const u = me();
  accrue();
  const positions = db.positions.filter(p => p.userEmail === u.email);
  const active = positions.filter(p => p.status === 'Active');
  const series = portfolioSeries(u, 30);
  const total = u.cash + u.assets + u.reinvest;
  const earned = positions.reduce((s, p) => s + p.credited, 0);
  const unread = db.notifications.filter(n => n.userEmail === u.email && !n.read).length;

  const kpis =
    '<div class="grid g4">' +
    '<div class="kpi"><div class="lbl">' + icon('wallet', 14) + ' Total portfolio</div><div class="val mono">' + money(total) + '</div><div class="sub">Across all balances</div></div>' +
    '<div class="kpi green"><div class="lbl">' + icon('wallet', 14) + ' Available cash</div><div class="val mono">' + money(u.cash) + '</div><div class="sub">Withdrawable</div></div>' +
    '<div class="kpi violet"><div class="lbl">' + icon('layers', 14) + ' Invested</div><div class="val mono">' + money(u.assets) + '</div><div class="sub">' + active.length + ' active position' + (active.length === 1 ? '' : 's') + '</div></div>' +
    '<div class="kpi amber"><div class="lbl">' + icon('chart', 14) + ' Accrued yield</div><div class="val mono">' + money(earned) + '</div><div class="sub">Modeled, to date</div></div>' +
    '</div>';

  const chartCard = '<div class="card pad" style="margin-top:16px">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:6px">' +
    '<div><h3 style="font-size:15px">Portfolio value</h3><div class="hint">Illustrative 30-day series</div></div>' +
    '<span class="sim-tag">Illustrative</span></div>' +
    areaChart(series, { h: 200 }) +
    '<div style="display:flex;justify-content:space-between;margin-top:10px" class="small muted"><span>30 days ago</span><span>Today</span></div></div>';

  const posRows = positions.length ? positions.map(p => {
    const daysDone = clamp(Math.floor((now() - p.start) / DAY), 0, p.durationDays);
    const pct = Math.round(daysDone / p.durationDays * 100);
    return '<tr><td><b>' + esc(p.planName) + '</b><div class="hint mono">' + money(p.amount) + ' principal</div></td>' +
      '<td class="mono">' + p.dailyRate.toFixed(2) + '%<div class="hint">per day, modeled</div></td>' +
      '<td><div style="min-width:110px"><div class="bar"><i style="width:' + pct + '%"></i></div><div class="hint" style="margin-top:4px">' + daysDone + '/' + p.durationDays + ' days</div></div></td>' +
      '<td class="mono pos">+' + money(p.credited) + '</td>' +
      '<td>' + badge(p.status) + '</td></tr>';
  }).join('') : '<tr><td colspan="5"><div class="empty">No positions yet. Allocate funds to a plan to get started.</div></td></tr>';

  const recent = db.transactions.filter(t => t.userEmail === u.email).slice(0, 6);
  const txRows = recent.length ? recent.map(t => '<tr><td>' + esc(t.type) + '</td><td class="mono ' + (t.type === 'Withdrawal' || t.type === 'Investment' ? 'neg' : 'pos') + '">' +
    (t.type === 'Withdrawal' || t.type === 'Investment' ? '−' : '+') + money(t.amount) + '</td><td class="muted small">' + esc(t.desc) + '</td><td>' + badge(t.status) + '</td><td class="hint">' + timeAgo(t.created) + '</td></tr>').join('')
    : '<tr><td colspan="5"><div class="empty">No activity yet.</div></td></tr>';

  const content = '<div class="page-head"><div><h2>Welcome back, ' + esc((u.name || u.email).split(' ')[0]) + '</h2>' +
    '<p>Your portfolio at a glance' + (unread ? ' · ' + unread + ' unread notification' + (unread === 1 ? '' : 's') : '') + '.</p></div>' +
    '<div style="display:flex;gap:8px"><a class="btn btn-ghost btn-sm" href="#/app/transactions">' + icon('list', 14) + ' History</a>' +
    '<a class="btn btn-primary btn-sm" href="#/app/deposit">' + icon('down', 14) + ' Add funds</a></div></div>' +
    kpis + chartCard +
    '<div class="grid" style="grid-template-columns:1.55fr 1fr;margin-top:16px;align-items:start">' +
    '<div class="card"><div style="padding:18px 18px 0;display:flex;justify-content:space-between;align-items:center"><h3 style="font-size:15px">Positions</h3><a class="link small" href="#/app/plans">Invest →</a></div>' +
    '<div class="table-scroll" style="padding-bottom:6px"><table><thead><tr><th>Plan</th><th>Modeled rate</th><th>Progress</th><th>Yield</th><th>Status</th></tr></thead><tbody>' + posRows + '</tbody></table></div></div>' +
    '<div class="card pad"><h3 style="font-size:15px;margin-bottom:14px">Quick actions</h3><div style="display:flex;flex-direction:column;gap:9px">' +
    [['down', 'Add funds', 'Simulate a deposit', '#/app/deposit'],
    ['layers', 'Invest', 'Allocate to a plan', '#/app/plans'],
    ['up', 'Withdraw', 'Request a payout', '#/app/withdraw'],
    ['transfer', 'Transfer', 'Move between balances', '#/app/transfer']].map(a =>
      '<a class="qa" href="' + a[3] + '"><span class="ic">' + icon(a[0]) + '</span><span><b>' + a[1] + '</b><span>' + a[2] + '</span></span></a>').join('') +
    '</div>' +
    '<div class="divider"></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:12.5px"><span class="muted">Reinvest balance</span><span class="mono">' + money(u.reinvest) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:12.5px;margin-top:7px"><span class="muted">Auto-reinvest</span><span>' + (u.autoReinvest ? '<span class="badge green">On</span>' : '<span class="badge">Off</span>') + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:12.5px;margin-top:7px"><span class="muted">Verification</span><span>' + badge(u.kyc) + '</span></div>' +
    '</div></div>' +
    '<div class="card" style="margin-top:16px"><div style="padding:18px 18px 0;display:flex;justify-content:space-between;align-items:center"><h3 style="font-size:15px">Recent activity</h3><a class="link small" href="#/app/transactions">View all →</a></div>' +
    '<div class="table-scroll"><table><thead><tr><th>Type</th><th>Amount</th><th>Description</th><th>Status</th><th>When</th></tr></thead><tbody>' + txRows + '</tbody></table></div></div>' +
    '<div class="notice warn" style="margin-top:16px">' + icon('shield') + '<div><b>Capital at risk.</b> Accrued yield is modeled, not guaranteed. Deposits are credited after operations verify your transfer, and withdrawals unlock once your identity is verified.</div></div>';

  return appShell('investor', 'overview', 'Overview', content);
}
/* ---------------- investor: plans ---------------- */
function viewPlans() {
  const u = me(); accrue();
  const plans = db.plans.filter(p => p.active);
  const myPos = db.positions.filter(p => p.userEmail === u.email && p.status === 'Active');
  const cards = plans.map(p => {
    const used = myPos.some(x => x.planId === p.id);
    const est = p.min * (p.dailyRate / 100) * p.durationDays;
    return '<div class="plan-card' + (p.id === 'p_growth' ? ' hl' : '') + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center"><h4 style="font-size:15px">' + esc(p.name) + '</h4>' +
      '<span class="risk ' + (p.risk === 'Low' ? 'low' : p.risk === 'Medium' ? 'med' : 'high') + '">' + esc(p.risk) + '</span></div>' +
      '<div><div class="rate">' + p.dailyRate.toFixed(2) + '%<small> / day</small></div><div class="hint">modeled estimate, not guaranteed</div></div>' +
      '<p class="small muted" style="margin:0;line-height:1.55">' + esc(p.desc) + '</p>' +
      '<div><div class="plan-kv"><span class="muted">Term</span><span>' + p.durationDays + ' days</span></div>' +
      '<div class="plan-kv"><span class="muted">Minimum</span><span class="mono">' + money(p.min) + '</span></div>' +
      '<div class="plan-kv"><span class="muted">Maximum</span><span class="mono">' + (p.max >= 99999 ? 'No cap' : money(p.max)) + '</span></div>' +
      '<div class="plan-kv"><span class="muted">Illustrative gross at minimum</span><span class="mono">' + money(p.min + est) + '</span></div></div>' +
      '<button class="btn btn-primary btn-sm" data-act="invest" data-id="' + p.id + '"' + (used ? ' disabled' : '') + '>' + (used ? 'Already active' : 'Allocate funds') + '</button>' +
      '</div>';
  }).join('');

  const activeRows = myPos.length ? myPos.map(p => '<tr><td><b>' + esc(p.planName) + '</b><div class="hint">' + dt(p.start) + ' → ' + dt(p.end) + '</div></td>' +
    '<td class="mono">' + money(p.amount) + '</td><td class="mono pos">+' + money(p.credited) + '</td><td>' + badge(p.status) + '</td>' +
    '<td><button class="btn btn-ghost btn-sm" data-act="position-detail" data-id="' + p.id + '">Details</button></td></tr>').join('')
    : '<tr><td colspan="5"><div class="empty">No active positions.</div></td></tr>';

  const content = '<div class="page-head"><div><h2>Plans & invest</h2><p>Allocate available balance to a plan. Rates are modeled estimates, not guarantees.</p></div>' +
    '<div class="badge"><span class="dot-live"></span> Cash available: ' + money(u.cash) + '</div></div>' +
    '<div class="notice info" style="margin-bottom:16px">' + icon('chart') + '<div>Each plan has a fixed term and a modeled daily yield used to demonstrate accrual. In a production product these figures would come from a licensed manager and require full risk disclosure.</div></div>' +
    '<div class="grid g4">' + cards + '</div>' +
    '<div class="card" style="margin-top:20px"><div style="padding:18px 18px 0"><h3 style="font-size:15px">Active positions</h3></div>' +
    '<div class="table-scroll"><table><thead><tr><th>Plan</th><th>Principal</th><th>Accrued yield</th><th>Status</th><th></th></tr></thead><tbody>' + activeRows + '</tbody></table></div></div>';

  return appShell('investor', 'plans', 'Plans & invest', content);
}

function investModal(planId) {
  const u = me();
  const plan = db.plans.find(p => p.id === planId); if (!plan) return;
  openModal('Allocate to ' + esc(plan.name),
    '<div class="notice info" style="margin-bottom:14px">' + icon('chart') + '<div>Modeled at <b>' + plan.dailyRate.toFixed(2) + '%/day</b> for <b>' + plan.durationDays + ' days</b>. Estimates are illustrative only.</div></div>' +
    '<form data-form="invest">' +
    '<input type="hidden" name="planId" value="' + plan.id + '">' +
    '<div class="field"><label>Amount (USD)</label><input name="amount" type="number" min="' + plan.min + '" step="0.01" value="' + plan.min + '" required>' +
    '<div class="hint">Range ' + money(plan.min) + ' – ' + (plan.max >= 99999 ? 'no cap' : money(plan.max)) + '</div></div>' +
    '<div class="field"><label>Funding source</label><select name="source">' +
    '<option value="cash">Available cash — ' + money(u.cash) + '</option>' +
    '<option value="reinvest">Reinvest balance — ' + money(u.reinvest) + '</option>' +
    (u.assets > 0 ? '<option value="assets">Invested balance — ' + money(u.assets) + '</option>' : '') +
    '</select></div>' +
    '<div class="field"><label>Transaction PIN</label><input name="pin" type="password" inputmode="numeric" maxlength="6" placeholder="1111" required><div class="hint">Set or change your PIN in Profile &amp; security.</div></div>' +
    '<button class="btn btn-primary" style="width:100%" type="submit">Confirm allocation</button>' +
    '</form>');
}

/* ---------------- investor: deposit ---------------- */
function viewDeposit() {
  const u = me();
  const methods = (db.paymentMethods || []).filter(m => m.active)
    .map(m => [m.name + ' (' + m.network + ')', m.address, m.note || 'Deposit address']);
  const pending = db.deposits.filter(d => d.userEmail === u.email && d.status === 'Pending');
  const rows = db.deposits.filter(d => d.userEmail === u.email).slice(0, 10).map(d =>
    '<tr><td class="mono">' + money(d.amount) + '</td><td>' + esc(d.method) + '</td><td class="hint mono">' + esc(d.ref || '—') + '</td><td>' + badge(d.status) + '</td><td class="hint">' + dts(d.created) + '</td></tr>').join('');

  const content = '<div class="page-head"><div><h2>Add funds</h2><p>Send your transfer, then submit the reference. Operations credits your balance after verification.</p></div></div>' +
    (pending.length ? '<div class="notice warn" style="margin-bottom:16px">' + icon('clock') + '<div><b>' + pending.length + ' deposit' + (pending.length === 1 ? '' : 's') + ' awaiting review.</b> Approvals happen in the admin console under Deposits.</div></div>' : '') +
    '<div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">' +
    '<div class="card pad"><h3 style="font-size:15px;margin-bottom:4px">New deposit</h3><p class="small muted" style="margin:0 0 16px">Your request is queued for review. You will be emailed when it is approved.</p>' +
    '<form data-form="deposit">' +
    '<div class="field"><label>Amount (USD)</label><input name="amount" type="number" min="10" step="0.01" placeholder="1000.00" required></div>' +
    '<div class="field"><label>Payment method</label><select name="method">' + methods.map(m => '<option>' + m[0] + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Reference / transaction hash <span class="hint">(optional)</span></label><input name="ref" placeholder="e.g. 0x8f2c…a41d"></div>' +
    '<div class="notice info" style="margin:0 0 14px">' + icon('clock') + '<div>Deposits are usually reviewed within one business day.</div></div>' +
    '<button class="btn btn-primary" style="width:100%" type="submit">Create deposit</button>' +
    '</form></div>' +
    '<div class="card pad"><h3 style="font-size:15px;margin-bottom:4px">Funding instructions</h3><p class="small muted" style="margin:0 0 14px">Send to the address for your chosen method and include the reference below.</p>' +
    methods.map(m => '<div style="padding:12px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid var(--line);margin-bottom:9px">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:5px"><b class="small">' + m[0] + '</b><span class="hint">' + m[2] + '</span></div>' +
      '<div class="small mono" style="word-break:break-all;color:#b4b4bd">' + m[1] + '</div></div>').join('') +
    '<div class="notice warn" style="margin-top:6px">' + icon('shield') + '<div>Always confirm the address inside your account before sending funds.</div></div>' +
    '</div></div>' +
    '<div class="card" style="margin-top:18px"><div style="padding:18px 18px 0"><h3 style="font-size:15px">Deposit history</h3></div>' +
    '<div class="table-scroll"><table><thead><tr><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th><th>Created</th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="5"><div class="empty">No deposits yet.</div></td></tr>') + '</tbody></table></div></div>';

  return appShell('investor', 'deposit', 'Add funds', content);
}

/* ---------------- investor: withdraw ---------------- */
function viewWithdraw() {
  const u = me();
  const fee = db.settings.withdrawalFeePct || 0;
  const rows = db.withdrawals.filter(w => w.userEmail === u.email).map(w =>
    '<tr><td class="mono">' + money(w.amount) + '</td><td>' + esc(w.network) + '</td><td class="hint mono">' + esc(w.address) + '</td><td>' + badge(w.status) + '</td><td class="hint">' + dts(w.created) + '</td></tr>').join('');

  const content = '<div class="page-head"><div><h2>Withdraw</h2><p>Requests are reviewed by operations before payout. Verification is required.</p></div>' +
    '<div class="badge blue">Available: ' + money(u.cash) + '</div></div>' +
    '<div class="grid" style="grid-template-columns:1fr 1.1fr;align-items:start">' +
    '<div class="card pad"><h3 style="font-size:15px;margin-bottom:14px">Request a payout</h3>' +
    '<form data-form="withdraw">' +
    '<div class="field"><label>Amount (USD)</label><input name="amount" type="number" min="' + (db.settings.minWithdrawal || 50) + '" step="0.01" placeholder="' + (db.settings.minWithdrawal || 50) + '.00" required>' +
    '<div class="hint">Minimum ' + money(db.settings.minWithdrawal || 50) + (fee ? ' · network fee ' + fee + '%' : ' · no network fee') + '</div></div>' +
    '<div class="field"><label>Network</label><select name="network">' + (db.withdrawNetworks || []).filter(n => n.active).map(n => '<option value="' + esc(n.name) + '">' + esc(n.name) + ' · min ' + money(n.min) + (n.feePct ? ' · fee ' + n.feePct + '%' : '') + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Destination address</label><input name="address" placeholder="Wallet address or IBAN" required></div>' +
    '<div class="field"><label>Transaction PIN</label><input name="pin" type="password" inputmode="numeric" maxlength="6" placeholder="••••" required></div>' +
    '<button class="btn btn-primary" style="width:100%" type="submit">Submit request</button>' +
    '</form>' +
    '<div class="divider"></div>' +
    '<div class="small muted">Your balance is held when a request is submitted and refunded if it is rejected.</div></div>' +
    '<div class="card"><div style="padding:18px 18px 0"><h3 style="font-size:15px">Withdrawal history</h3></div>' +
    '<div class="table-scroll"><table><thead><tr><th>Amount</th><th>Network</th><th>Address</th><th>Status</th><th>Requested</th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="5"><div class="empty">No withdrawals yet.</div></td></tr>') + '</tbody></table></div>' +
    '<div style="padding:14px 18px"><div class="notice info">' + icon('clock') + '<div>Funds are held while your request is reviewed. Rejected requests are refunded in full.</div></div></div>' +
    '</div></div>';
  return appShell('investor', 'withdraw', 'Withdraw', content);
}

/* ---------------- investor: transfer ---------------- */
function viewTransfer() {
  const u = me();
  const rows = db.transactions.filter(t => t.userEmail === u.email && t.type === 'Transfer').slice(0, 12).map(t =>
    '<tr><td class="mono">' + money(t.amount) + '</td><td class="muted small">' + esc(t.desc) + '</td><td>' + badge(t.status) + '</td><td class="hint">' + dts(t.created) + '</td></tr>').join('');

  const content = '<div class="page-head"><div><h2>Transfer</h2><p>Move funds between your own balances.</p></div></div>' +
    '<div class="grid g3" style="margin-bottom:16px">' +
    '<div class="kpi"><div class="lbl">Available cash</div><div class="val mono">' + money(u.cash) + '</div></div>' +
    '<div class="kpi violet"><div class="lbl">Invested</div><div class="val mono">' + money(u.assets) + '</div></div>' +
    '<div class="kpi green"><div class="lbl">Reinvest balance</div><div class="val mono">' + money(u.reinvest) + '</div></div>' +
    '</div>' +
    '<div class="grid" style="grid-template-columns:1fr 1.1fr;align-items:start">' +
    '<div class="card pad"><h3 style="font-size:15px;margin-bottom:14px">New transfer</h3>' +
    '<form data-form="transfer">' +
    '<div class="field"><label>From</label><select name="from"><option value="cash">Available cash — ' + money(u.cash) + '</option><option value="reinvest">Reinvest balance — ' + money(u.reinvest) + '</option><option value="assets">Invested balance — ' + money(u.assets) + '</option></select></div>' +
    '<div class="field"><label>To</label><select name="to"><option value="reinvest">Reinvest balance</option><option value="cash">Available cash</option><option value="assets">Invested balance</option></select></div>' +
    '<div class="field"><label>Amount (USD)</label><input name="amount" type="number" min="1" step="0.01" placeholder="500.00" required></div>' +
    '<div class="field"><label>Transaction PIN</label><input name="pin" type="password" inputmode="numeric" maxlength="6" placeholder="••••" required></div>' +
    '<button class="btn btn-primary" style="width:100%" type="submit">Transfer</button>' +
    '</form></div>' +
    '<div class="card"><div style="padding:18px 18px 0"><h3 style="font-size:15px">Recent transfers</h3></div>' +
    '<div class="table-scroll"><table><thead><tr><th>Amount</th><th>Description</th><th>Status</th><th>When</th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="4"><div class="empty">No transfers yet.</div></td></tr>') + '</tbody></table></div></div></div>';
  return appShell('investor', 'transfer', 'Transfer', content);
}

/* ---------------- investor: transactions ---------------- */
function viewTransactions(filterType, q) {
  const u = me();
  let list = db.transactions.filter(t => t.userEmail === u.email);
  const types = ['All', 'Deposit', 'Withdrawal', 'Investment', 'Earning', 'Transfer', 'Settlement', 'Adjustment'];
  if (filterType && filterType !== 'All') list = list.filter(t => t.type === filterType);
  if (q) list = list.filter(t => (t.desc + ' ' + t.type).toLowerCase().includes(q.toLowerCase()));

  const rows = list.map(t => '<tr><td><span class="badge">' + esc(t.type) + '</span></td>' +
    '<td class="mono ' + (['Withdrawal', 'Investment'].includes(t.type) ? 'neg' : 'pos') + '">' + (['Withdrawal', 'Investment'].includes(t.type) ? '−' : '+') + money(t.amount) + '</td>' +
    '<td class="muted small">' + esc(t.desc) + '</td><td>' + badge(t.status) + '</td><td class="hint">' + dts(t.created) + '</td></tr>').join('');

  const totalIn = list.filter(t => ['Deposit', 'Earning', 'Settlement'].includes(t.type) && t.status === 'Completed').reduce((s, t) => s + t.amount, 0);
  const totalOut = list.filter(t => ['Withdrawal', 'Investment'].includes(t.type) && t.status === 'Completed').reduce((s, t) => s + t.amount, 0);

  const content = '<div class="page-head"><div><h2>Transactions</h2><p>Every ledger entry on your account.</p></div>' +
    '<button class="btn btn-ghost btn-sm" data-act="export-csv">' + icon('down', 14) + ' Export CSV</button></div>' +
    '<div class="grid g3" style="margin-bottom:16px">' +
    '<div class="kpi green"><div class="lbl">Credits</div><div class="val mono">' + money(totalIn) + '</div></div>' +
    '<div class="kpi"><div class="lbl">Debits</div><div class="val mono">' + money(totalOut) + '</div></div>' +
    '<div class="kpi violet"><div class="lbl">Entries</div><div class="val mono">' + list.length + '</div></div></div>' +
    '<div class="filters">' +
    '<input placeholder="Search description…" id="txSearch" value="' + esc(q || '') + '">' +
    '<select id="txType">' + types.map(t => '<option' + (t === (filterType || 'All') ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' +
    '</div>' +
    '<div class="card"><div class="table-scroll"><table><thead><tr><th>Type</th><th>Amount</th><th>Description</th><th>Status</th><th>Date</th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="5"><div class="empty">No transactions match this filter.</div></td></tr>') + '</tbody></table></div></div>';
  return appShell('investor', 'transactions', 'Transactions', content);
}

/* ---------------- investor: KYC ---------------- */
function viewKyc() {
  const u = me();
  const rec = db.kyc.filter(k => k.userEmail === u.email).sort((a, b) => b.submitted - a.submitted)[0];
  const content = '<div class="page-head"><div><h2>Verification</h2><p>Identity checks gate withdrawals — as they do in any regulated product.</p></div>' +
    '<div>' + badge(u.kyc) + '</div></div>' +
    '<div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">' +
    '<div class="card pad"><h3 style="font-size:15px;margin-bottom:6px">Your status</h3>' +
    '<div style="display:flex;align-items:center;gap:12px;padding:14px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid var(--line);margin:12px 0">' +
    '<div class="ic" style="width:40px;height:40px;border-radius:11px;display:grid;place-items:center;background:var(--primary-dim);color:#e4e4e7">' + icon(u.kyc === 'Verified' ? 'check' : 'clock', 19) + '</div>' +
    '<div><b>' + esc(u.kyc === 'Verified' ? 'Identity verified' : u.kyc === 'Rejected' ? 'Verification rejected' : 'Under review') + '</b>' +
    '<div class="hint">' + (rec ? 'Submitted ' + dt(rec.submitted) + ' · ' + esc(rec.docType) : 'No submission on file') + '</div></div></div>' +
    (rec && rec.notes ? '<div class="notice warn">' + icon('doc') + '<div>' + esc(rec.notes) + '</div></div>' : '') +
    '<div class="notice info" style="margin-top:12px">' + icon('shield') + '<div>Your document number is stored with your verification record and reviewed by our operations team.</div></div>' +
    '<div class="divider"></div><div class="small muted">Reviews are performed in <b>Admin console → Verification</b>.</div></div>' +
    '<div class="card pad"><h3 style="font-size:15px;margin-bottom:14px">Submit a document</h3>' +
    '<form data-form="kyc">' +
    '<div class="field"><label>Document type</label><select name="docType"><option>Passport</option><option>National ID</option><option>Driver\'s licence</option><option>Residence permit</option></select></div>' +
    '<div class="field"><label>Document number</label><input name="docNumber" placeholder="P-8823411" required><div class="hint">Stored securely with your verification record.</div></div>' +
    '<div class="field"><label>Full legal name</label><input name="legalName" value="' + esc(u.name) + '" required></div>' +
    '<div class="field"><label>Document upload</label><div style="border:1px dashed var(--line2);border-radius:10px;padding:16px;text-align:center" class="small muted">' + icon('doc') + '<div style="margin-top:6px">Include your document number above; operations may request a scan</div></div></div>' +
    '<button class="btn btn-primary" style="width:100%" type="submit">Submit for review</button>' +
    '</form></div></div>';
  return appShell('investor', 'kyc', 'Verification', content);
}

/* ---------------- investor: notifications ---------------- */
function viewNotifications() {
  const u = me();
  const list = db.notifications.filter(n => n.userEmail === u.email);
  const content = '<div class="page-head"><div><h2>Notifications</h2><p>' + list.filter(n => !n.read).length + ' unread</p></div>' +
    '<button class="btn btn-ghost btn-sm" data-act="mark-read">Mark all as read</button></div>' +
    '<div class="card">' + (list.length ? list.map(n =>
      '<div style="display:flex;gap:13px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.05);' + (n.read ? '' : 'background:rgba(255,255,255,.04)') + '">' +
      '<div style="width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:none;background:' +
      (n.type === 'success' ? 'var(--green-dim)' : n.type === 'error' ? 'var(--red-dim)' : 'var(--primary-dim)') + ';color:#f4f4f5">' +
      icon(n.type === 'success' ? 'check' : 'bell', 16) + '</div>' +
      '<div style="flex:1"><div style="font-size:13.5px;line-height:1.5">' + esc(n.message) + '</div>' +
      '<div class="hint" style="margin-top:4px">' + timeAgo(n.created) + (n.fromAdmin ? ' · from admin' : '') + '</div></div>' +
      (n.read ? '' : '<span class="dot-live" style="margin-top:6px"></span>') + '</div>').join('')
      : '<div class="empty">No notifications.</div>') + '</div>';
  return appShell('investor', 'notifications', 'Notifications', content);
}

/* ---------------- investor: profile ---------------- */
function viewProfile() {
  const u = me();
  const content = '<div class="page-head"><div><h2>Profile &amp; security</h2><p>Your account details and security settings.</p></div></div>' +
    '<div class="grid" style="grid-template-columns:1.3fr 1fr;align-items:start">' +
    '<div class="card pad"><h3 style="font-size:15px;margin-bottom:14px">Personal details</h3>' +
    '<form data-form="profile">' +
    '<div class="grid g2" style="gap:12px"><div class="field"><label>Full name</label><input name="name" value="' + esc(u.name) + '" required></div>' +
    '<div class="field"><label>Phone</label><input name="phone" value="' + esc(u.phone) + '" placeholder="+1 555 0100"></div></div>' +
    '<div class="field"><label>Email</label><input value="' + esc(u.email) + '" disabled><div class="hint">Contact support to change the email on your account.</div></div>' +
    '<div class="grid g2" style="gap:12px"><div class="field"><label>Country</label><select name="country">' +
    ['United States', 'United Kingdom', 'Germany', 'India', 'Nigeria', 'Singapore', 'Brazil', 'Canada', 'Australia', 'Other'].map(c => '<option' + (c === u.country ? ' selected' : '') + '>' + c + '</option>').join('') +
    '</select></div><div class="field"><label>Language</label><select name="lang"><option value="en">English</option><option value="es">Español</option><option value="fr">Français</option><option value="de">Deutsch</option><option value="pt-BR">Português (BR)</option><option value="ar">العربية</option><option value="zh">中文</option></select></div></div>' +
    '<button class="btn btn-primary" type="submit">Save changes</button>' +
    '</form></div>' +
    '<div style="display:flex;flex-direction:column;gap:16px">' +
    '<div class="card pad"><h3 style="font-size:15px;margin-bottom:14px">Security</h3>' +
    '<form data-form="pin"><div class="field"><label>New transaction PIN</label><input name="pin" type="password" inputmode="numeric" maxlength="6" placeholder="6 digits" required></div>' +
    '<div class="field"><label>Confirm PIN</label><input name="pin2" type="password" inputmode="numeric" maxlength="6" required></div>' +
    '<button class="btn btn-ghost btn-sm" type="submit">Update PIN</button></form>' +
    '<div class="divider"></div>' +
    '<label style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;font-size:13.5px">Auto-reinvest earnings <input type="checkbox" data-act="toggle-auto" ' + (u.autoReinvest ? 'checked' : '') + ' style="width:auto"></label>' +
    '<div class="hint" style="margin-top:5px">When on, completed positions roll into your reinvest balance.</div></div>' +
    '<div class="card pad"><h3 style="font-size:15px;margin-bottom:10px">App &amp; device alerts</h3>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:9px"><button class="btn btn-primary btn-sm" data-act="install-app">Install app</button>' +
    '<button class="btn btn-ghost btn-sm" data-act="share-app">Share app</button>' +
    '<button class="btn btn-ghost btn-sm" data-act="enable-notifications">Enable alerts</button>' +
    '<button class="btn btn-ghost btn-sm" data-act="notify-test">Test alert</button>' +
    (db.settings && db.settings.pushConfigured ? '<button class="btn btn-ghost btn-sm" data-act="push-test">Send push</button>' : '') + '</div>' +
    '<div class="hint" style="line-height:1.6">Alerts appear in your device notification centre and on the lock screen once the app is installed. ' +
    (db.settings && db.settings.pushConfigured ? 'Server push is active.' : 'Server push activates once VAPID keys are configured.') + '</div></div>' +
    '<div class="card pad"><h3 style="font-size:15px;margin-bottom:10px">Referral</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Share your referral code.</div>' +
    '<div style="display:flex;gap:8px;align-items:center"><input value="' + esc(u.referral) + '" readonly class="mono"><button class="btn btn-ghost btn-sm" data-act="copy-ref" data-val="' + esc(u.referral) + '">Copy</button></div>' +
    '<div class="hint" style="margin-top:8px">No commission program is active in this build.</div></div>' +
    '</div></div>';
  return appShell('investor', 'profile', 'Profile & security', content);
}
/* ---------------- admin: overview ---------------- */
function pendingCounts() {
  return {
    dep: db.deposits.filter(d => d.status === 'Pending').length,
    wd: db.withdrawals.filter(w => w.status === 'Pending').length,
    kyc: db.kyc.filter(k => k.status === 'Pending').length
  };
}
function viewAdminOverview() {
  accrue();
  const pc = pendingCounts();
  const clients = db.users.filter(u => !u.isAdmin);
  const aum = clients.reduce((s, u) => s + u.assets + u.cash + u.reinvest, 0);
  const funded = db.deposits.filter(d => d.status === 'Approved').reduce((s, d) => s + d.amount, 0);

  const queueCard = (title, count, href, sub) => '<a class="qa" href="' + href + '" style="justify-content:space-between">' +
    '<span style="display:flex;align-items:center;gap:11px"><span class="ic">' + icon('clock') + '</span><span><b>' + title + '</b><span>' + sub + '</span></span></span>' +
    '<span class="badge ' + (count ? 'amber' : 'green') + '">' + count + '</span></a>';

  const recentUsers = clients.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map(u =>
    '<tr><td><b>' + esc(u.name) + '</b><div class="hint">' + esc(u.email) + '</div></td><td>' + esc(u.country) + '</td>' +
    '<td class="mono">' + money(u.cash + u.assets + u.reinvest) + '</td><td>' + badge(u.kyc) + '</td><td class="hint">' + dt(u.createdAt) + '</td></tr>').join('');

  const activity = (db.activity || []).slice(0, 6).map(a => '<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:12.5px">' +
    '<span class="muted">' + esc(a.what) + '</span><span class="hint" style="white-space:nowrap">' + timeAgo(a.at) + '</span></div>').join('');

  const content = '<div class="page-head"><div><h2>Operations overview</h2><p>Accounts, balances and review queues.</p></div>' +
    '<div style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" data-act="share-app">' + icon('globe', 14) + ' Share app link</button></div></div>' +
    (db.settings.maintenance ? '<div class="notice warn" style="margin-bottom:16px">' + icon('shield') + '<div><b>Maintenance mode is on.</b> Investors see a maintenance screen; admins keep access.</div></div>' : '') +
    '<div class="grid g4">' +
    '<div class="kpi"><div class="lbl">' + icon('users', 14) + ' Users</div><div class="val mono">' + clients.length + '</div><div class="sub">' + clients.filter(u => u.frozen).length + ' frozen</div></div>' +
    '<div class="kpi green"><div class="lbl">' + icon('wallet', 14) + ' Client balances</div><div class="val mono">' + money(aum) + '</div><div class="sub">Across all balances</div></div>' +
    '<div class="kpi violet"><div class="lbl">' + icon('down', 14) + ' Approved deposits</div><div class="val mono">' + money(funded) + '</div><div class="sub">Lifetime</div></div>' +
    '<div class="kpi amber"><div class="lbl">' + icon('clock', 14) + ' Pending reviews</div><div class="val mono">' + (pc.dep + pc.wd + pc.kyc) + '</div><div class="sub">' + pc.dep + ' deposits · ' + pc.wd + ' payouts · ' + pc.kyc + ' KYC</div></div>' +
    '</div>' +
    '<div class="grid" style="grid-template-columns:1fr 1fr;margin-top:16px;align-items:start">' +
    '<div class="card pad"><h3 style="font-size:15px;margin-bottom:12px">Review queues</h3><div style="display:flex;flex-direction:column;gap:9px">' +
    queueCard('Deposit approvals', pc.dep, '#/admin/deposits', 'Funding awaiting verification') +
    queueCard('Withdrawal approvals', pc.wd, '#/admin/withdrawals', 'Payout requests holding funds') +
    queueCard('Identity checks', pc.kyc, '#/admin/kyc', 'Documents submitted for review') +
    '</div></div>' +
    '<div class="card pad"><h3 style="font-size:15px;margin-bottom:10px">Admin activity</h3>' + (activity || '<div class="empty">No admin actions yet.</div>') + '</div>' +
    '</div>' +
    '<div class="card" style="margin-top:16px"><div style="padding:18px 18px 0;display:flex;justify-content:space-between;align-items:center"><h3 style="font-size:15px">Newest users</h3><a class="link small" href="#/admin/users">Manage users →</a></div>' +
    '<div class="table-scroll"><table><thead><tr><th>User</th><th>Country</th><th>Portfolio</th><th>KYC</th><th>Joined</th></tr></thead><tbody>' + recentUsers + '</tbody></table></div></div>';
  return appShell('admin', 'adminOverview', 'Admin overview', content);
}

/* ---------------- admin: users ---------------- */
function viewAdminUsers(q) {
  const list = db.users.filter(u => !q || (u.name + ' ' + u.email + ' ' + u.country).toLowerCase().includes(q.toLowerCase()));
  const rows = list.map(u => '<tr>' +
    '<td><b>' + esc(u.name) + '</b><div class="hint">' + esc(u.email) + '</div></td>' +
    '<td>' + esc(u.country) + '</td>' +
    '<td class="mono">' + money(u.cash) + '</td>' +
    '<td class="mono">' + money(u.assets) + '</td>' +
    '<td class="mono">' + money(u.reinvest) + '</td>' +
    '<td>' + badge(u.kyc) + '</td>' +
    '<td>' + (u.frozen ? '<span class="badge red">Frozen</span>' : '<span class="badge green">Active</span>') + (u.isAdmin ? ' <span class="badge blue">Admin</span>' : '') + '</td>' +
    '<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-act="user-view" data-id="' + u.id + '">Open</button> ' +
    (u.isAdmin ? '' : '<button class="btn ' + (u.frozen ? 'btn-green' : 'btn-red') + ' btn-sm" data-act="user-freeze" data-id="' + u.id + '">' + (u.frozen ? 'Unfreeze' : 'Freeze') + '</button>') +
    '</td></tr>').join('');
  const content = '<div class="page-head"><div><h2>Users</h2><p>' + list.length + ' account' + (list.length === 1 ? '' : 's') + ' registered.</p></div></div>' +
    '<div class="filters"><input id="userSearch" placeholder="Search name, email or country…" value="' + esc(q || '') + '"></div>' +
    '<div class="card"><div class="table-scroll"><table><thead><tr><th>User</th><th>Country</th><th>Cash</th><th>Invested</th><th>Reinvest</th><th>KYC</th><th>State</th><th></th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="8"><div class="empty">No users match.</div></td></tr>') + '</tbody></table></div></div>';
  return appShell('admin', 'adminUsers', 'Users', content);
}

function userModal(id) {
  const u = db.users.find(x => x.id === id); if (!u) return;
  const self = me();
  const editingSelf = self && self.id === u.id;
  const pos = db.positions.filter(p => p.userEmail === u.email);
  const field = (label, name, value, type, extra) =>
    '<div class="field"><label>' + label + '</label><input name="' + name + '" type="' + (type || 'text') + '" value="' + esc(value) + '" ' + (extra || '') + '></div>';

  openModal('Edit user — ' + esc(u.name),
    '<div class="notice info" style="margin-bottom:14px">' + icon('user') + '<div>Admins can edit every field below. Balance changes post ledger entries, and email edits move the account and all related records.</div></div>' +
    '<form data-form="admin-user"><input type="hidden" name="id" value="' + u.id + '">' +
    '<div class="grid g2" style="gap:12px">' +
      field('Full name', 'name', u.name, 'text', 'required') +
      field('Email', 'email', u.email, 'email', 'required' + (editingSelf ? ' disabled' : '')) +
      field('Phone', 'phone', u.phone || '') +
      field('Country', 'country', u.country) +
    '</div>' +
    '<div class="grid g3" style="gap:12px">' +
      '<div class="field"><label>Verification</label><select name="kyc">' + ['Pending', 'Verified', 'Rejected'].map(k => '<option' + (k === u.kyc ? ' selected' : '') + '>' + k + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Transaction PIN</label><input name="pin" placeholder="Leave blank to keep" maxlength="6" inputmode="numeric"></div>' +
      '<div class="field"><label>New password</label><input name="pw" placeholder="Leave blank to keep"></div>' +
    '</div>' +
    '<div class="divider"></div><div class="side-label" style="padding:0 0 8px">Balances</div>' +
    '<div class="grid g3" style="gap:12px">' +
      field('Cash', 'cash', u.cash, 'number', 'step="0.01"') +
      field('Invested', 'assets', u.assets, 'number', 'step="0.01"') +
      field('Reinvest', 'reinvest', u.reinvest, 'number', 'step="0.01"') +
    '</div>' +
    '<div class="grid g2" style="gap:12px;margin-bottom:12px">' +
      '<label style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:11px 13px;border:1px solid var(--line2);border-radius:10px;cursor:pointer">Account frozen <input type="checkbox" name="frozen" ' + (u.frozen ? 'checked' : '') + ' style="width:auto"' + (editingSelf ? ' disabled' : '') + '></label>' +
      '<label style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:11px 13px;border:1px solid var(--line2);border-radius:10px;cursor:pointer">Administrator <input type="checkbox" name="isAdmin" ' + (u.isAdmin ? 'checked' : '') + ' style="width:auto"' + (editingSelf ? ' disabled' : '') + '></label>' +
    '</div>' +
    '<div class="field"><label>Message to user <span class="hint">(optional — appears in their notifications)</span></label><input name="note" placeholder="e.g. Your account details were updated."></div>' +
    '<div style="display:flex;gap:10px;margin-top:6px"><button class="btn btn-primary" type="submit" style="flex:1">Save user</button>' +
    '<button class="btn btn-ghost" type="button" data-act="close-modal">Cancel</button></div>' +
    '</form>' +
    '<div class="hint" style="margin-top:12px">Referral code <b class="mono">' + esc(u.referral) + '</b> · joined ' + dt(u.createdAt) + ' · ' + pos.filter(p => p.status === 'Active').length + ' active position(s)</div>');
}

/* ---------------- admin: deposits ---------------- */
function viewAdminDeposits() {
  const rows = db.deposits.slice().sort((a, b) => b.created - a.created).map(d => {
    const u = userBy(d.userEmail);
    const pending = d.status === 'Pending';
    return '<tr><td><b>' + esc(u ? u.name : d.userEmail) + '</b><div class="hint">' + esc(d.userEmail) + '</div></td>' +
      '<td class="mono">' + money(d.amount) + '</td><td>' + esc(d.method) + '</td><td class="hint mono">' + esc(d.ref || '—') + '</td>' +
      '<td>' + badge(d.status) + '</td><td class="hint">' + dts(d.created) + '</td>' +
      '<td style="white-space:nowrap">' + (pending ? '<button class="btn btn-green btn-sm" data-act="dep-approve" data-id="' + d.id + '">Approve</button> <button class="btn btn-red btn-sm" data-act="dep-reject" data-id="' + d.id + '">Reject</button>' : '<span class="hint">—</span>') + '</td></tr>';
  }).join('');
  const content = '<div class="page-head"><div><h2>Deposits</h2><p>Funding requests. Approving credits the user\'s cash balance.</p></div>' +
    '<div class="badge amber">' + pendingCounts().dep + ' pending</div></div>' +
    '<div class="notice info" style="margin-bottom:16px">' + icon('shield') + '<div>Verify the transfer against your statement before approving. Approval credits the balance immediately.</div></div>' +
    '<div class="card"><div class="table-scroll"><table><thead><tr><th>User</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="7"><div class="empty">No deposits.</div></td></tr>') + '</tbody></table></div></div>';
  return appShell('admin', 'adminDeposits', 'Deposits', content);
}

/* ---------------- admin: withdrawals ---------------- */
function viewAdminWithdrawals() {
  const rows = db.withdrawals.slice().sort((a, b) => b.created - a.created).map(w => {
    const u = userBy(w.userEmail);
    const pending = w.status === 'Pending';
    return '<tr><td><button class="link" data-act="user-view" data-id="' + (u ? u.id : '') + '" style="background:none;border:none;padding:0;text-align:left;cursor:pointer"><b>' + esc(u ? u.name : w.userEmail) + '</b></button><div class="hint">' + esc(w.userEmail) + '</div></td>' +
      '<td class="mono">' + money(w.amount) + '</td><td>' + esc(w.network) + '</td><td class="hint mono" style="max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(w.address) + '</td>' +
      '<td>' + badge(w.status) + '</td><td class="hint">' + dts(w.created) + '</td>' +
      '<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-act="wd-edit" data-id="' + w.id + '">Edit</button>' +
      (pending ? ' <button class="btn btn-green btn-sm" data-act="wd-approve" data-id="' + w.id + '">Approve</button> <button class="btn btn-red btn-sm" data-act="wd-reject" data-id="' + w.id + '">Reject</button>' : '') +
      '</td></tr>';
  }).join('');

  const audit = (db.withdrawalAudit || []).slice(0, 8).map(a =>
    '<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:12.5px">' +
    '<span class="muted">' + esc(a.summary) + '</span><span class="hint" style="white-space:nowrap">' + timeAgo(a.at) + '</span></div>').join('');

  const content = '<div class="page-head"><div><h2>Withdrawals</h2><p>Review payout requests, approve or reject them, and edit the details on file.</p></div>' +
    '<div class="badge amber">' + pendingCounts().wd + ' pending</div></div>' +
    '<div class="notice info" style="margin-bottom:16px">' + icon('shield') + '<div><b>Editing a request updates what the investor sees on their own withdrawal record.</b> Details are recorded in the internal audit log below, which is visible to administrators only.</div></div>' +
    '<div class="card"><div class="table-scroll"><table><thead><tr><th>User</th><th>Amount</th><th>Network</th><th>Destination</th><th>Status</th><th>Requested</th><th></th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="7"><div class="empty">No withdrawal requests.</div></td></tr>') + '</tbody></table></div></div>' +
    '<div class="card pad" style="margin-top:16px"><h3 style="font-size:15px;margin-bottom:8px">Internal audit log</h3>' +
    (audit || '<div class="empty">No withdrawal edits recorded.</div>') + '</div>';
  return appShell('admin', 'adminWithdrawals', 'Withdrawals', content);
}

function withdrawEditModal(id) {
  const w = db.withdrawals.find(x => x.id === id); if (!w) return;
  const u = userBy(w.userEmail);
  openModal('Edit withdrawal request',
    '<div class="small muted" style="margin-bottom:14px">' + esc(u ? u.name : w.userEmail) + ' · requested ' + dts(w.created) + '</div>' +
    '<form data-form="admin-withdraw"><input type="hidden" name="id" value="' + w.id + '">' +
    '<div class="grid g2" style="gap:12px">' +
    '<div class="field"><label>Amount (USD)</label><input name="amount" type="number" step="0.01" value="' + w.amount + '"></div>' +
    '<div class="field"><label>Status</label><select name="status">' + ['Pending', 'Completed', 'Rejected'].map(x => '<option' + (x === w.status ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div></div>' +
    '<div class="field"><label>Network</label><select name="network">' + Array.from(new Set(['TRC-20', 'ERC-20', 'BEP-20', 'SEPA / bank', w.network].concat((db.withdrawNetworks || []).map(n => n.name)))).map(n => '<option' + (n === w.network ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Destination address</label><input name="address" value="' + esc(w.address) + '"></div>' +
    '<div class="field"><label>Admin notes <span class="hint">(internal)</span></label><textarea name="notes" rows="2">' + esc(w.notes || '') + '</textarea></div>' +
    '<div class="notice warn" style="margin-bottom:14px">' + icon('lock') + '<div>These changes are written to the admin-only audit log and are <b>not</b> announced to the investor.</div></div>' +
    '<button class="btn btn-primary" style="width:100%" type="submit">Save request</button>' +
    '</form>');
}

/* ---------------- admin: kyc ---------------- */
function viewAdminKyc() {
  const rows = db.kyc.slice().sort((a, b) => b.submitted - a.submitted).map(k => {
    const u = userBy(k.userEmail);
    const pending = k.status === 'Pending';
    return '<tr><td><b>' + esc(u ? u.name : k.userEmail) + '</b><div class="hint">' + esc(k.userEmail) + '</div></td>' +
      '<td>' + esc(k.docType) + '</td><td class="hint mono">' + esc(k.docNumber) + '</td>' +
      '<td>' + badge(k.status) + '</td><td class="hint">' + dts(k.submitted) + '</td>' +
      '<td style="white-space:nowrap">' + (pending ? '<button class="btn btn-green btn-sm" data-act="kyc-approve" data-id="' + k.id + '">Approve</button> <button class="btn btn-red btn-sm" data-act="kyc-reject" data-id="' + k.id + '">Reject</button>' : '<span class="hint">—</span>') + '</td></tr>';
  }).join('');
  const content = '<div class="page-head"><div><h2>Verification</h2><p>Identity review queue. Approving verifies the investor account.</p></div>' +
    '<div class="badge amber">' + pendingCounts().kyc + ' pending</div></div>' +
    '<div class="card"><div class="table-scroll"><table><thead><tr><th>User</th><th>Document</th><th>Number</th><th>Status</th><th>Submitted</th><th></th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="6"><div class="empty">No submissions.</div></td></tr>') + '</tbody></table></div></div>';
  return appShell('admin', 'adminKyc', 'Verification', content);
}

/* ---------------- admin: plans ---------------- */
function viewAdminPlans() {
  accrue();
  const rows = db.plans.map(p => {
    const activeCount = db.positions.filter(x => x.planId === p.id && x.status === 'Active').length;
    return '<tr><td><b>' + esc(p.name) + '</b><div class="hint">' + esc(p.risk) + ' risk</div></td>' +
      '<td class="mono">' + p.dailyRate.toFixed(2) + '%</td><td>' + p.durationDays + 'd</td>' +
      '<td class="mono">' + money(p.min) + '</td><td class="mono">' + (p.max >= 99999 ? '—' : money(p.max)) + '</td>' +
      '<td>' + activeCount + '</td><td>' + (p.active ? '<span class="badge green">Active</span>' : '<span class="badge">Hidden</span>') + '</td>' +
      '<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-act="plan-edit" data-id="' + p.id + '">Edit</button> ' +
      '<button class="btn btn-ghost btn-sm" data-act="plan-toggle" data-id="' + p.id + '">' + (p.active ? 'Hide' : 'Show') + '</button></td></tr>';
  }).join('');
  const content = '<div class="page-head"><div><h2>Plans</h2><p>Modeled strategies shown to investors. Rates are illustrative placeholders.</p></div>' +
    '<button class="btn btn-primary btn-sm" data-act="plan-new">+ New plan</button></div>' +
    '<div class="notice warn" style="margin-bottom:16px">' + icon('shield') + '<div>If this were a live product, every rate listed here would need to be substantiated and accompanied by balanced risk warnings. Do not present modeled rates as expected or guaranteed returns.</div></div>' +
    '<div class="card"><div class="table-scroll"><table><thead><tr><th>Plan</th><th>Modeled daily</th><th>Term</th><th>Min</th><th>Max</th><th>Open positions</th><th>Visibility</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  return appShell('admin', 'adminPlans', 'Plans', content);
}

function planForm(id) {
  const p = id ? db.plans.find(x => x.id === id) : { name: '', dailyRate: 0.5, durationDays: 30, min: 100, max: 5000, risk: 'Low', desc: '', active: true };
  openModal(id ? 'Edit plan' : 'New plan',
    '<form data-form="plan"><input type="hidden" name="id" value="' + (id || '') + '">' +
    '<div class="field"><label>Plan name</label><input name="name" value="' + esc(p.name) + '" required></div>' +
    '<div class="grid g2" style="gap:12px"><div class="field"><label>Modeled daily rate (%)</label><input name="dailyRate" type="number" step="0.01" min="0" max="5" value="' + p.dailyRate + '" required></div>' +
    '<div class="field"><label>Term (days)</label><input name="durationDays" type="number" min="1" value="' + p.durationDays + '" required></div></div>' +
    '<div class="grid g2" style="gap:12px"><div class="field"><label>Minimum</label><input name="min" type="number" min="0" value="' + p.min + '" required></div>' +
    '<div class="field"><label>Maximum</label><input name="max" type="number" min="0" value="' + p.max + '" required></div></div>' +
    '<div class="field"><label>Risk band</label><select name="risk">' + ['Low', 'Medium', 'High'].map(r => '<option' + (r === p.risk ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Description</label><textarea name="desc" rows="3">' + esc(p.desc) + '</textarea></div>' +
    '<button class="btn btn-primary" style="width:100%" type="submit">' + (id ? 'Save changes' : 'Create plan') + '</button>' +
    '</form>');
}

/* ---------------- admin: transactions ---------------- */
function viewAdminTransactions() {
  let list = db.transactions.slice();
  if (uiState.adminTxType && uiState.adminTxType !== 'All') list = list.filter(t => t.type === uiState.adminTxType);
  if (uiState.adminTxQ) {
    const q = uiState.adminTxQ.toLowerCase();
    list = list.filter(t => (t.userEmail + ' ' + t.desc + ' ' + t.type).toLowerCase().includes(q));
  }
  const types = ['All', 'Deposit', 'Withdrawal', 'Investment', 'Earning', 'Transfer', 'Settlement', 'Adjustment'];
  const rows = list.slice(0, 300).map(t => {
    const owner = userBy(t.userEmail);
    return '<tr><td class="hint" style="white-space:nowrap">' + dts(t.created) + '</td>' +
      '<td>' + esc(owner ? owner.name : t.userEmail) + '<div class="hint">' + esc(t.userEmail) + '</div></td>' +
      '<td><span class="badge">' + esc(t.type) + '</span></td>' +
      '<td class="mono">' + money(t.amount) + '</td><td>' + badge(t.status) + '</td>' +
      '<td class="muted small" style="max-width:260px">' + esc(t.desc) + '</td>' +
      '<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-act="tx-edit" data-id="' + t.id + '">Edit</button> ' +
      '<button class="btn btn-red btn-sm" data-act="tx-delete" data-id="' + t.id + '">Delete</button></td></tr>';
  }).join('');

  const content = '<div class="page-head"><div><h2>Transactions</h2><p>Full ledger across every account. Admins can add, edit or remove entries.</p></div>' +
    '<button class="btn btn-primary btn-sm" data-act="tx-new">+ Add entry</button></div>' +
    '<div class="filters"><input id="adminTxSearch" placeholder="Search user or description…" value="' + esc(uiState.adminTxQ) + '">' +
    '<select id="adminTxType">' + types.map(t => '<option' + (t === uiState.adminTxType ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' +
    '<span class="badge">' + list.length + ' entries</span></div>' +
    '<div class="card"><div class="table-scroll"><table><thead><tr><th>Date</th><th>User</th><th>Type</th><th>Amount</th><th>Status</th><th>Description</th><th></th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="7"><div class="empty">No entries match.</div></td></tr>') + '</tbody></table></div></div>';
  return appShell('admin', 'adminTransactions', 'Transactions', content);
}

function txForm(id) {
  const t = id ? db.transactions.find(x => x.id === id) : { userEmail: (db.users[0] || {}).email, type: 'Deposit', amount: 0, status: 'Completed', desc: '' };
  const types = ['Deposit', 'Withdrawal', 'Investment', 'Earning', 'Transfer', 'Settlement', 'Adjustment'];
  openModal(id ? 'Edit transaction' : 'New transaction entry',
    '<div class="notice info" style="margin-bottom:14px">' + icon('list') + '<div>Entries are ledger records. Editing or deleting one updates history immediately.</div></div>' +
    '<form data-form="admin-tx"><input type="hidden" name="id" value="' + (id || '') + '">' +
    '<div class="field"><label>User</label><select name="userEmail">' + db.users.map(u => '<option value="' + esc(u.email) + '"' + (u.email === t.userEmail ? ' selected' : '') + '>' + esc(u.name) + ' — ' + esc(u.email) + '</option>').join('') + '</select></div>' +
    '<div class="grid g2" style="gap:12px"><div class="field"><label>Type</label><select name="type">' + types.map(x => '<option' + (x === t.type ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Status</label><select name="status">' + ['Completed', 'Pending', 'Rejected', 'Failed'].map(x => '<option' + (x === t.status ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div></div>' +
    '<div class="field"><label>Amount (USD)</label><input name="amount" type="number" step="0.01" value="' + t.amount + '" required></div>' +
    '<div class="field"><label>Description</label><input name="desc" value="' + esc(t.desc) + '"></div>' +
    '<div class="field"><label>Date</label><input name="when" type="datetime-local" value="' + new Date(t.created || now()).toISOString().slice(0, 16) + '"></div>' +
    '<button class="btn btn-primary" style="width:100%" type="submit">' + (id ? 'Save entry' : 'Create entry') + '</button></form>');
}

/* ---------------- admin: notifications ---------------- */
function viewAdminNotifications() {
  const all = db.notifications.slice().sort((a, b) => b.created - a.created).slice(0, 120);
  const rows = all.map(n => {
    const owner = userBy(n.userEmail);
    return '<tr><td style="max-width:420px"><div style="font-size:13px;line-height:1.5">' + esc(n.message) + '</div>' +
      '<div class="hint" style="margin-top:3px">' + esc(owner ? owner.name : n.userEmail) + ' · ' + timeAgo(n.created) + (n.fromAdmin ? ' · admin' : '') + '</div></td>' +
      '<td><span class="badge">' + esc(n.type) + '</span></td>' +
      '<td>' + (n.read ? '<span class="badge">Read</span>' : '<span class="badge blue">Unread</span>') + '</td>' +
      '<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-act="notif-edit" data-id="' + n.id + '">Edit</button> ' +
      '<button class="btn btn-red btn-sm" data-act="notif-delete" data-id="' + n.id + '">Delete</button></td></tr>';
  }).join('');

  const content = '<div class="page-head"><div><h2>Notifications</h2><p>Compose in-app notices and manage what investors see.</p></div></div>' +
    '<div class="grid" style="grid-template-columns:1fr 1.25fr;align-items:start">' +
    '<div class="card pad"><h3 style="font-size:15px;margin-bottom:14px">New notification</h3>' +
    '<form data-form="admin-notify">' +
    '<div class="field"><label>Recipient</label><select name="target"><option value="all">All users</option>' + db.users.filter(u => !u.isAdmin).map(u => '<option value="' + esc(u.email) + '">' + esc(u.name) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Type</label><select name="type"><option value="info">Info</option><option value="success">Success</option><option value="error">Alert</option></select></div>' +
    '<div class="field"><label>Message</label><textarea name="message" rows="3" placeholder="Write the notice…" required></textarea></div>' +
    '<label style="display:flex;justify-content:space-between;align-items:center;font-size:13px;margin-bottom:14px;cursor:pointer">Also send as device notification <input type="checkbox" name="device" checked style="width:auto"></label>' +
    '<button class="btn btn-primary" style="width:100%" type="submit">Send notification</button></form></div>' +
    '<div class="card"><div style="padding:18px 18px 0"><h3 style="font-size:15px">Recent notifications</h3></div>' +
    '<div class="table-scroll"><table><thead><tr><th>Message</th><th>Type</th><th>State</th><th></th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="4"><div class="empty">No notifications.</div></td></tr>') + '</tbody></table></div></div></div>';
  return appShell('admin', 'adminNotifications', 'Notifications', content);
}

function notifForm(id) {
  const n = db.notifications.find(x => x.id === id); if (!n) return;
  openModal('Edit notification',
    '<form data-form="admin-notif-edit"><input type="hidden" name="id" value="' + n.id + '">' +
    '<div class="field"><label>Message</label><textarea name="message" rows="3" required>' + esc(n.message) + '</textarea></div>' +
    '<div class="grid g2" style="gap:12px"><div class="field"><label>Type</label><select name="type">' + ['info', 'success', 'error'].map(t => '<option' + (t === n.type ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Read</label><select name="read"><option value="0"' + (!n.read ? ' selected' : '') + '>Unread</option><option value="1"' + (n.read ? ' selected' : '') + '>Read</option></select></div></div>' +
    '<button class="btn btn-primary" style="width:100%" type="submit">Save</button></form>');
}

/* ---------------- admin: payment methods ---------------- */
function viewAdminPaymentMethods() {
  const pmRows = (db.paymentMethods || []).map(m =>
    '<tr><td><b>' + esc(m.name) + '</b><div class="hint">' + esc(m.network) + '</div></td>' +
    '<td class="mono hint" style="max-width:260px;word-break:break-all">' + esc(m.address) + '</td>' +
    '<td>' + (m.active ? '<span class="badge green">Shown</span>' : '<span class="badge">Hidden</span>') + '</td>' +
    '<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-act="pm-edit" data-id="' + m.id + '">Edit</button> ' +
    '<button class="btn btn-ghost btn-sm" data-act="pm-toggle" data-id="' + m.id + '">' + (m.active ? 'Hide' : 'Show') + '</button> ' +
    '<button class="btn btn-red btn-sm" data-act="pm-delete" data-id="' + m.id + '">Delete</button></td></tr>').join('');

  const wnRows = (db.withdrawNetworks || []).map(n =>
    '<tr><td><b>' + esc(n.name) + '</b></td><td class="mono">' + money(n.min) + '</td><td class="mono">' + (Number(n.feePct) || 0) + '%</td>' +
    '<td>' + (n.active ? '<span class="badge green">Active</span>' : '<span class="badge">Off</span>') + '</td>' +
    '<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-act="wn-edit" data-id="' + n.id + '">Edit</button> ' +
    '<button class="btn btn-ghost btn-sm" data-act="wn-toggle" data-id="' + n.id + '">' + (n.active ? 'Disable' : 'Enable') + '</button></td></tr>').join('');

  const content = '<div class="page-head"><div><h2>Payment methods</h2><p>What investors can choose when funding or withdrawing. Changes apply instantly.</p></div></div>' +
    '<div class="grid" style="grid-template-columns:1.35fr 1fr;align-items:start">' +
    '<div class="card"><div style="padding:18px 18px 0;display:flex;justify-content:space-between;align-items:center"><h3 style="font-size:15px">Deposit methods</h3><button class="btn btn-primary btn-sm" data-act="pm-new">+ Add method</button></div>' +
    '<div class="table-scroll"><table><thead><tr><th>Method</th><th>Address / reference</th><th>Visibility</th><th></th></tr></thead><tbody>' +
    (pmRows || '<tr><td colspan="4"><div class="empty">No deposit methods.</div></td></tr>') + '</tbody></table></div></div>' +
    '<div class="card"><div style="padding:18px 18px 0;display:flex;justify-content:space-between;align-items:center"><h3 style="font-size:15px">Withdrawal networks</h3><button class="btn btn-primary btn-sm" data-act="wn-new">+ Add network</button></div>' +
    '<div class="table-scroll"><table><thead><tr><th>Network</th><th>Minimum</th><th>Fee</th><th>Status</th><th></th></tr></thead><tbody>' +
    (wnRows || '<tr><td colspan="5"><div class="empty">No networks.</div></td></tr>') + '</tbody></table></div></div></div>' +
    '<div class="notice warn" style="margin-top:16px">' + icon('shield') + '<div>These addresses are shown to investors on the Add funds screen. Double-check before publishing.</div></div>';
  return appShell('admin', 'adminPaymentMethods', 'Payment methods', content);
}

function pmForm(id) {
  const m = id ? (db.paymentMethods || []).find(x => x.id === id) : { name: '', network: '', address: '', note: 'Deposit address', active: true };
  openModal(id ? 'Edit deposit method' : 'New deposit method',
    '<form data-form="pm"><input type="hidden" name="id" value="' + (id || '') + '">' +
    '<div class="grid g2" style="gap:12px"><div class="field"><label>Asset / name</label><input name="name" value="' + esc(m.name) + '" placeholder="USDT" required></div>' +
    '<div class="field"><label>Network</label><input name="network" value="' + esc(m.network) + '" placeholder="TRC-20" required></div></div>' +
    '<div class="field"><label>Address / reference</label><input name="address" value="' + esc(m.address) + '" required></div>' +
    '<div class="field"><label>Caption</label><input name="note" value="' + esc(m.note || '') + '" placeholder="Simulated address"></div>' +
    '<label style="display:flex;justify-content:space-between;align-items:center;font-size:13px;margin-bottom:14px;cursor:pointer">Visible to investors <input type="checkbox" name="active" ' + (m.active ? 'checked' : '') + ' style="width:auto"></label>' +
    '<button class="btn btn-primary" style="width:100%" type="submit">Save method</button></form>');
}

function wnForm(id) {
  const n = id ? (db.withdrawNetworks || []).find(x => x.id === id) : { name: '', min: 50, feePct: 0, active: true };
  openModal(id ? 'Edit withdrawal network' : 'New withdrawal network',
    '<form data-form="wn"><input type="hidden" name="id" value="' + (id || '') + '">' +
    '<div class="field"><label>Network name</label><input name="name" value="' + esc(n.name) + '" placeholder="TRC-20" required></div>' +
    '<div class="grid g2" style="gap:12px"><div class="field"><label>Minimum withdrawal (USD)</label><input name="min" type="number" min="0" step="1" value="' + n.min + '"></div>' +
    '<div class="field"><label>Fee (%)</label><input name="feePct" type="number" min="0" max="20" step="0.1" value="' + n.feePct + '"></div></div>' +
    '<label style="display:flex;justify-content:space-between;align-items:center;font-size:13px;margin-bottom:14px;cursor:pointer">Available to investors <input type="checkbox" name="active" ' + (n.active ? 'checked' : '') + ' style="width:auto"></label>' +
    '<button class="btn btn-primary" style="width:100%" type="submit">Save network</button></form>');
}

/* ---------------- admin: email centre ---------------- */
let EMAIL_HEALTH = null;
function emailHealthHTML() {
  const ok = EMAIL_HEALTH && EMAIL_HEALTH.email && EMAIL_HEALTH.email.configured;
  return '<span class="badge ' + (ok ? 'green' : 'amber') + '">' + (ok ? 'Brevo connected' : 'Email not configured') + '</span>' +
    (ok && EMAIL_HEALTH.email.sender ? '<div class="hint" style="margin-top:8px">Sender: ' + esc(EMAIL_HEALTH.email.sender) + (EMAIL_HEALTH.email.testMode ? ' · test mode' : '') + '</div>' : '') +
    (!ok ? '<div class="hint" style="margin-top:8px">Set BREVO_API_KEY and BREVO_SENDER_EMAIL in Render → Environment.</div>' : '');
}
function loadEmailHealth() {
  if (location.protocol === 'file:') { EMAIL_HEALTH = { email: { configured: false } }; return; }
  fetch('./api/health').then(r => r.json()).then(j => {
    EMAIL_HEALTH = j;
    const el = document.getElementById('emailHealth'); if (el) el.innerHTML = emailHealthHTML();
  }).catch(() => { });
}

function viewAdminEmail() {
  loadEmailHealth();
  const users = db.users.filter(u => !u.isAdmin);
  const log = (db.emailLog || []).slice(0, 12).map(e =>
    '<tr><td class="hint" style="white-space:nowrap">' + dts(e.at) + '</td><td class="hint">' + esc(e.to) + '</td>' +
    '<td>' + esc(e.subject) + '</td><td><span class="badge ' + (e.status === 'sent' ? 'green' : e.status === 'failed' ? 'red' : 'amber') + '">' + esc(e.status) + '</span></td></tr>').join('');

  const content = '<div class="page-head"><div><h2>Email centre</h2><p>Send a broadcast with Brevo to one user, a selection, or everyone.</p></div>' +
    '<div id="emailHealth">' + emailHealthHTML() + '</div></div>' +
    '<div class="notice info" style="margin-bottom:16px">' + icon('doc') + '<div>Automated email is limited to three events: <b>registration</b>, <b>deposit approval</b> and <b>withdrawal approval</b>. Everything else is a manual broadcast from this page.</div></div>' +
    '<div class="grid" style="grid-template-columns:1.25fr 1fr;align-items:start">' +
    '<div class="card pad"><h3 style="font-size:15px;margin-bottom:14px">Compose</h3>' +
    '<form data-form="admin-email">' +
    '<div class="field"><label>Recipients</label><select name="target" id="emailTarget"><option value="all">All users (' + users.length + ')</option><option value="selected">Selected users…</option></select></div>' +
    '<div id="emailPicker" style="display:none;margin-bottom:14px;padding:12px;border:1px solid var(--line2);border-radius:10px;max-height:190px;overflow:auto">' +
    users.map(u => '<label style="display:flex;gap:9px;align-items:center;font-size:12.5px;padding:4px 0;cursor:pointer"><input type="checkbox" name="rcpt" value="' + esc(u.email) + '" style="width:auto">' + esc(u.name) + ' <span class="hint">' + esc(u.email) + '</span></label>').join('') +
    '</div>' +
    '<div class="field"><label>Subject</label><input name="subject" placeholder="Platform update" required></div>' +
    '<div class="field"><label>Message</label><textarea name="message" rows="5" placeholder="Write your message…" required></textarea></div>' +
    '<button class="btn btn-primary" style="width:100%" type="submit">Send email</button>' +
    '</form></div>' +
    '<div class="card"><div style="padding:18px 18px 0"><h3 style="font-size:15px">Recent sends</h3></div>' +
    '<div class="table-scroll"><table><thead><tr><th>When</th><th>To</th><th>Subject</th><th>Status</th></tr></thead><tbody>' +
    (log || '<tr><td colspan="4"><div class="empty">No emails sent yet.</div></td></tr>') + '</tbody></table></div></div></div>';
  return appShell('admin', 'adminEmail', 'Email centre', content);
}

/* ---------------- admin: settings ---------------- */
function viewAdminSettings() {
  const s = db.settings;
  const url = (db.settings && db.settings.appUrl) || location.origin;
  const content = '<div class="page-head"><div><h2>Settings</h2><p>Platform configuration, public link and account data.</p></div></div>' +
    '<div class="grid" style="grid-template-columns:1.15fr 1fr;align-items:start">' +
    '<div class="card pad"><h3 style="font-size:15px;margin-bottom:14px">Platform</h3>' +
    '<form data-form="settings">' +
    '<label style="display:flex;justify-content:space-between;align-items:center;font-size:13.5px;margin-bottom:14px;cursor:pointer">Maintenance mode <input type="checkbox" name="maintenance" ' + (s.maintenance ? 'checked' : '') + ' style="width:auto"></label>' +
    '<div class="hint" style="margin:-8px 0 14px">When on, investors see a maintenance page. Admin access is unaffected.</div>' +
    '<div class="grid g2" style="gap:12px"><div class="field"><label>Minimum withdrawal (USD)</label><input name="minWithdrawal" type="number" min="0" value="' + s.minWithdrawal + '"></div>' +
    '<div class="field"><label>Withdrawal fee (%)</label><input name="withdrawalFeePct" type="number" min="0" max="10" step="0.1" value="' + s.withdrawalFeePct + '"></div></div>' +
    '<button class="btn btn-primary" type="submit">Save settings</button>' +
    '</form></div>' +
    '<div style="display:flex;flex-direction:column;gap:16px">' +
    '<div class="card pad"><h3 style="font-size:15px;margin-bottom:10px">Public link</h3>' +
    '<p class="small muted" style="margin:0 0 12px;line-height:1.6">Share this address — anyone with it can open the app and create an account.</p>' +
    '<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><input value="' + esc(url) + '" readonly class="mono"><button class="btn btn-primary btn-sm" data-act="copy-share" data-val="' + esc(url) + '">Copy</button></div>' +
    '<button class="btn btn-ghost btn-sm" data-act="share-app">Share app link</button></div>' +
    '<div class="card pad"><h3 style="font-size:15px;margin-bottom:10px">Database</h3>' +
    '<div class="small" style="display:flex;flex-direction:column;gap:7px">' +
    '<div style="display:flex;justify-content:space-between"><span class="muted">Users</span><span class="mono">' + db.users.length + '</span></div>' +
    '<div style="display:flex;justify-content:space-between"><span class="muted">Positions</span><span class="mono">' + db.positions.length + '</span></div>' +
    '<div style="display:flex;justify-content:space-between"><span class="muted">Transactions</span><span class="mono">' + db.transactions.length + '</span></div>' +
    '<div style="display:flex;justify-content:space-between"><span class="muted">Deposits</span><span class="mono">' + db.deposits.length + '</span></div>' +
    '<div style="display:flex;justify-content:space-between"><span class="muted">Withdrawals</span><span class="mono">' + db.withdrawals.length + '</span></div>' +
    '<div style="display:flex;justify-content:space-between"><span class="muted">Notifications</span><span class="mono">' + db.notifications.length + '</span></div>' +
    '</div><div class="hint" style="margin-top:10px">Records are stored server-side, so accounts follow users across devices.</div></div>' +
    '</div></div>';
  return appShell('admin', 'adminSettings', 'Settings', content);
}

/* ---------------- share ---------------- */
function shareUrl() {
  return (db.settings && db.settings.appUrl) || location.origin;
}
function shareApp() {
  const url = shareUrl();
  const encoded = encodeURIComponent('Join me on AssetPulse: ' + url);
  openModal('Share AssetPulse',
    '<p class="small muted" style="line-height:1.65;margin:0 0 14px">Anyone with this link can open the app and create an account.</p>' +
    '<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px"><input id="shareUrl" value="' + esc(url) + '" readonly class="mono">' +
    '<button class="btn btn-primary btn-sm" data-act="copy-share" data-val="' + esc(url) + '">Copy</button></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=' + encoded + '">WhatsApp</a>' +
    '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://t.me/share/url?url=' + encodeURIComponent(url) + '">Telegram</a>' +
    '<a class="btn btn-ghost btn-sm" href="mailto:?subject=' + encodeURIComponent('AssetPulse') + '&body=' + encoded + '">Email</a>' +
    (navigator.share ? '<button class="btn btn-ghost btn-sm" data-act="share-native">More…</button>' : '') +
    '</div>');
}
function copyShare(v) {
  if (navigator.clipboard) navigator.clipboard.writeText(v).then(() => toast('Link copied.', 'ok'), () => toast('Copy failed.', 'err'));
  else toast('Copy failed.', 'err');
}

function viewNotFound() {
  return publicNav('') + '<div class="auth-wrap"><div class="auth-card" style="text-align:center">' +
    '<h2 style="font-size:22px">Page not found</h2><p class="sub">That route does not exist.</p>' +
    '<a class="btn btn-primary" href="#/">Back to overview</a></div></div>';
}
function viewMaintenance() {
  return '<div class="wrap" style="padding:80px 22px;text-align:center;max-width:620px">' +
    '<div class="logo" style="margin:0 auto 18px;width:46px;height:46px">' + icon('spark', 22) + '</div>' +
    '<h1 style="font-size:28px;margin-bottom:10px">Scheduled maintenance</h1>' +
    '<p class="muted" style="line-height:1.7">The platform is in maintenance mode. Administrators can still sign in.</p>' +
    '<a class="btn btn-ghost" href="#/login" style="margin-top:14px">Admin sign in</a>' +
    '<div class="hint" style="margin-top:16px">Toggle this from Admin → Settings.</div></div>';
}
/* ---------------- views registry ---------------- */
const VIEWS = {
  home: () => viewHome(),
  login: r => viewLogin(r.redirect),
  register: () => viewRegister(),
  overview: () => viewOverview(),
  plans: () => viewPlans(),
  deposit: () => viewDeposit(),
  withdraw: () => viewWithdraw(),
  transfer: () => viewTransfer(),
  transactions: () => viewTransactions(uiState.txType, uiState.txQ),
  kyc: () => viewKyc(),
  notifications: () => viewNotifications(),
  profile: () => viewProfile(),
  adminOverview: () => viewAdminOverview(),
  adminUsers: () => viewAdminUsers(uiState.userQ),
  adminDeposits: () => viewAdminDeposits(),
  adminWithdrawals: () => viewAdminWithdrawals(),
  adminKyc: () => viewAdminKyc(),
  adminPlans: () => viewAdminPlans(),
  adminTransactions: () => viewAdminTransactions(),
  adminNotifications: () => viewAdminNotifications(),
  adminPaymentMethods: () => viewAdminPaymentMethods(),
  adminEmail: () => viewAdminEmail(),
  adminSettings: () => viewAdminSettings()
};
const uiState = { txType: 'All', txQ: '', userQ: '', adminTxQ: '', adminTxType: 'All' };

/* ---------------- render ---------------- */
function render() {
  const root = qs('#app');
  if (!stateLoaded && document.cookie.indexOf('ap_auth=1') > -1) {
    root.innerHTML = '<div style="min-height:70vh;display:grid;place-items:center;gap:12px"><div style="text-align:center"><div class="spin" style="margin:0 auto 10px;width:22px;height:22px"></div><div class="hint">Loading your account…</div></div></div>';
    return;
  }
  let r;
  try { r = route(); } catch (e) { console.error(e); r = { view: 'home' }; }
  const path = currentPath();
  const u = me();

  if (u && !u.isAdmin && db.settings.maintenance && path.indexOf('/app') === 0) {
    root.innerHTML = viewMaintenance();
    return;
  }
  if (r.view === 'login' && u && path === '/login') {
    go(u.isAdmin ? '/admin/overview' : '/app/overview');
    return;
  }
  const fn = VIEWS[r.view];
  root.innerHTML = fn ? fn(r) : viewNotFound();
}
function renderKeep(id) {
  const cur = document.getElementById(id);
  const caret = cur && cur.selectionStart;
  render();
  const next = document.getElementById(id);
  if (next && next.focus) { next.focus(); if (caret != null) try { next.setSelectionRange(caret, caret); } catch (e) { } }
}

/* ---------------- actions ---------------- */
async function doAct(type, payload, successText) {
  try {
    const res = await act(type, payload);
    toast(res.message || successText || 'Done.', 'ok');
    render();
    return res;
  } catch (e) {
    toast(e.message || 'Something went wrong.', 'err');
    throw e;
  }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const action = el.dataset.act, id = el.dataset.id, u = me();

  switch (action) {
    case 'close-modal': closeModal(); break;
    case 'open-side': qs('#side').classList.add('open'); qs('#sideBackdrop').classList.add('on'); break;
    case 'close-side': qs('#side').classList.remove('open'); qs('#sideBackdrop').classList.remove('on'); break;
    case 'scroll': {
      const t = el.dataset.target;
      const node = document.getElementById(t);
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else { go('/'); setTimeout(() => { const n2 = document.getElementById(t); if (n2) n2.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 90); }
      break;
    }
    case 'logout':
      api('api/auth/logout', { method: 'POST' }).catch(() => { });
      db = emptyState();
      toast('Signed out.', 'ok');
      go('/');
      break;
    case 'go-app': go(u && u.isAdmin ? '/admin/overview' : '/app/overview'); break;
    case 'go-register': go('/register'); break;

    /* install & notifications */
    case 'install-app': installApp(); break;
    case 'dismiss-install': hideInstallPopup(); break;
    case 'enable-notifications': enableNotifications(); break;
    case 'notify-test': notifyDevice('AssetPulse', 'Test notification — device alerts are working.', 'test'); toast('Test notification sent.', 'ok'); break;
    case 'push-test': sendServerPushTest(); break;

    /* share */
    case 'share-app': shareApp(); break;
    case 'share-native':
      if (navigator.share) navigator.share({ title: 'AssetPulse', text: 'Join me on AssetPulse', url: shareUrl() }).catch(() => { });
      break;
    case 'copy-share': copyShare(el.dataset.val); break;

    /* investor */
    case 'invest': if (u) investModal(id); break;
    case 'plan-detail': {
      const p = db.plans.find(x => x.id === id); if (!p) break;
      openModal(esc(p.name) + ' · plan details',
        '<div style="display:flex;gap:14px;align-items:baseline;margin-bottom:12px"><div style="font-family:Poppins;font-size:30px;font-weight:800;color:#ededf0">' + p.dailyRate.toFixed(2) + '%<span style="font-size:13px;color:var(--muted)"> /day modeled</span></div></div>' +
        '<p class="small muted" style="line-height:1.65;margin:0 0 14px">' + esc(p.desc) + '</p>' +
        '<div class="plan-kv"><span class="muted">Term</span><span>' + p.durationDays + ' days</span></div>' +
        '<div class="plan-kv"><span class="muted">Minimum</span><span class="mono">' + money(p.min) + '</span></div>' +
        '<div class="plan-kv"><span class="muted">Maximum</span><span class="mono">' + (p.max >= 99999 ? 'No cap' : money(p.max)) + '</span></div>' +
        '<div class="plan-kv"><span class="muted">Risk band</span><span>' + esc(p.risk) + '</span></div>' +
        '<div class="notice warn" style="margin-top:14px">' + icon('shield') + '<div>Modeled rate. Not a forecast, quote or guarantee.</div></div>' +
        (u ? '<button class="btn btn-primary" style="width:100%;margin-top:14px" data-act="invest" data-id="' + p.id + '">Allocate funds</button>' : '<a class="btn btn-primary" style="width:100%;margin-top:14px" href="#/login">Sign in to invest</a>'));
      break;
    }
    case 'position-detail': {
      const p = db.positions.find(x => x.id === id); if (!p) break;
      const days = clamp(Math.floor((now() - p.start) / DAY), 0, p.durationDays);
      openModal(esc(p.planName) + ' position',
        '<div class="grid g3" style="gap:10px;margin-bottom:14px">' +
        '<div style="padding:11px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid var(--line)"><div class="hint">Principal</div><div class="mono" style="font-weight:600">' + money(p.amount) + '</div></div>' +
        '<div style="padding:11px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid var(--line)"><div class="hint">Accrued</div><div class="mono pos" style="font-weight:600">' + money(p.credited) + '</div></div>' +
        '<div style="padding:11px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid var(--line)"><div class="hint">Status</div><div>' + badge(p.status) + '</div></div></div>' +
        '<div class="bar" style="margin:10px 0 8px"><i style="width:' + Math.round(days / p.durationDays * 100) + '%"></i></div>' +
        '<div class="small muted" style="display:flex;justify-content:space-between"><span>' + days + ' of ' + p.durationDays + ' days</span><span>' + dt(p.start) + ' → ' + dt(p.end) + '</span></div>' +
        '<div class="divider"></div>' +
        '<div class="small" style="display:flex;flex-direction:column;gap:7px">' +
        '<div style="display:flex;justify-content:space-between"><span class="muted">Modeled daily yield</span><span class="mono">' + money(p.amount * p.dailyRate / 100) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span class="muted">Funded from</span><span>' + esc(p.source) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span class="muted">Position ID</span><span class="mono hint">' + esc(p.id) + '</span></div></div>');
      break;
    }
    case 'export-csv': {
      if (!u) break;
      const rows = [['Date', 'Type', 'Amount', 'Status', 'Description']].concat(
        db.transactions.filter(t => t.userEmail === u.email).map(t => [new Date(t.created).toISOString(), t.type, t.amount, t.status, t.desc]));
      const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'assetpulse-transactions.csv'; a.click(); URL.revokeObjectURL(a.href);
      toast('CSV exported.', 'ok'); break;
    }
    case 'mark-read': doAct('notifications.readAll', {}, 'Notifications marked as read.').catch(() => { }); break;
    case 'copy-ref':
      if (navigator.clipboard) navigator.clipboard.writeText(el.dataset.val).then(() => toast('Copied.', 'ok'), () => toast('Copy failed.', 'err'));
      break;

    /* admin: deposits */
    case 'dep-approve': doAct('admin.deposit.approve', { id }).catch(() => { }); break;
    case 'dep-reject': doAct('admin.deposit.reject', { id }).catch(() => { }); break;

    /* admin: withdrawals */
    case 'wd-edit': withdrawEditModal(id); break;
    case 'wd-approve': doAct('admin.withdraw.approve', { id }).catch(() => { }); break;
    case 'wd-reject': doAct('admin.withdraw.reject', { id }).catch(() => { }); break;

    /* admin: kyc */
    case 'kyc-approve': doAct('admin.kyc.approve', { id }).catch(() => { }); break;
    case 'kyc-reject': doAct('admin.kyc.reject', { id }).catch(() => { }); break;

    /* admin: users */
    case 'user-view': userModal(id); break;
    case 'user-freeze': doAct('admin.user.freeze', { id }).catch(() => { }); break;

    /* admin: transactions */
    case 'tx-new': txForm(); break;
    case 'tx-edit': txForm(id); break;
    case 'tx-delete':
      openModal('Delete transaction',
        '<p class="small muted" style="line-height:1.65">This removes the ledger entry permanently. Balances are not recalculated.</p>' +
        '<div style="display:flex;gap:10px;margin-top:12px"><button class="btn btn-red" data-act="tx-delete-confirm" data-id="' + id + '" style="flex:1">Delete</button>' +
        '<button class="btn btn-ghost" data-act="close-modal" style="flex:1">Cancel</button></div>');
      break;
    case 'tx-delete-confirm': closeModal(); doAct('admin.tx.delete', { id }).catch(() => { }); break;

    /* admin: notifications */
    case 'notif-edit': notifForm(id); break;
    case 'notif-delete': doAct('admin.notif.delete', { id }, 'Notification deleted.').catch(() => { }); break;

    /* admin: payment methods */
    case 'pm-new': pmForm(); break;
    case 'pm-edit': pmForm(id); break;
    case 'pm-toggle': doAct('admin.pm.toggle', { id }).catch(() => { }); break;
    case 'pm-delete':
      openModal('Delete deposit method', '<p class="small muted">Investors will no longer see this funding option.</p>' +
        '<div style="display:flex;gap:10px;margin-top:12px"><button class="btn btn-red" data-act="pm-delete-confirm" data-id="' + id + '" style="flex:1">Delete</button>' +
        '<button class="btn btn-ghost" data-act="close-modal" style="flex:1">Cancel</button></div>');
      break;
    case 'pm-delete-confirm': closeModal(); doAct('admin.pm.delete', { id }).catch(() => { }); break;
    case 'wn-new': wnForm(); break;
    case 'wn-edit': wnForm(id); break;
    case 'wn-toggle': doAct('admin.wn.toggle', { id }).catch(() => { }); break;

    /* admin: plans */
    case 'plan-new': planForm(); break;
    case 'plan-edit': planForm(id); break;
    case 'plan-toggle': doAct('admin.plan.toggle', { id }).catch(() => { }); break;
  }
});

/* ---------------- forms ---------------- */
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const kind = f.dataset.form;
  const val = n => (f[n] ? String(f[n].value).trim() : '');
  const btn = f.querySelector('button[type="submit"]');
  const busy = on => { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.label = btn.textContent; btn.textContent = 'Please wait…'; } else if (btn.dataset.label) { btn.textContent = btn.dataset.label; } };

  const submit = async (fn, errBox) => {
    busy(true);
    if (errBox) { const b = qs(errBox); if (b) b.classList.remove('on'); }
    try { await fn(); }
    catch (err) {

      if (errBox) {
        const box = qs(errBox);
        if (box) { box.textContent = err.message; box.classList.add('on'); }
      }
      toast(err.message || 'Something went wrong.', 'err');
    } finally { busy(false); }
  };

  if (kind === 'login') {
    submit(async () => {
      const data = await api('api/auth/login', { method: 'POST', body: JSON.stringify({ email: val('email'), password: val('password') }) });
      db = Object.assign(emptyState(), data.state);
      toast('Signed in as ' + (db.me.name || db.me.email) + '.', 'ok');
      const redirect = val('redirect');
      go(db.me.isAdmin ? '/admin/overview' : (redirect && redirect.indexOf('/app') === 0 ? redirect : '/app/overview'));
    }, '#loginErr');
    return;
  }

  if (kind === 'register') {
    submit(async () => {
      const data = await api('api/auth/register', {
        method: 'POST', body: JSON.stringify({
          name: val('name'), email: val('email'), password: val('password'),
          country: val('country'), phone: val('phone'), ref: val('ref')
        })
      });
      db = Object.assign(emptyState(), data.state);
      toast('Account created.', 'ok');
      go(db.me.isAdmin ? '/admin/overview' : '/app/overview');
    }, '#regErr');
    return;
  }

  const u = me();
  if (!u) return;

  if (kind === 'invest') {
    submit(async () => {
      await doAct('invest', { planId: val('planId'), amount: Number(val('amount')), source: val('source'), pin: val('pin') }, 'Position activated.');
      closeModal();
    });
    return;
  }

  if (kind === 'deposit') {
    submit(async () => {
      await doAct('deposit.create', { amount: Number(val('amount')), method: val('method'), ref: val('ref') }, 'Deposit submitted for review.');
    });
    return;
  }

  if (kind === 'withdraw') {
    submit(async () => {
      await doAct('withdraw.create', { amount: Number(val('amount')), network: val('network'), address: val('address'), pin: val('pin') }, 'Withdrawal request submitted.');
    });
    return;
  }

  if (kind === 'transfer') {
    submit(async () => {
      await doAct('transfer', { from: val('from'), to: val('to'), amount: Number(val('amount')), pin: val('pin') }, 'Transfer complete.');
    });
    return;
  }

  if (kind === 'kyc') {
    submit(async () => {
      await doAct('kyc.submit', { docType: val('docType'), docNumber: val('docNumber'), legalName: val('legalName') }, 'Submitted for review.');
    });
    return;
  }

  if (kind === 'profile') {
    submit(async () => {
      await doAct('profile.update', { name: val('name'), phone: val('phone'), country: val('country'), lang: val('lang') }, 'Profile updated.');
    });
    return;
  }

  if (kind === 'pin') {
    submit(async () => {
      await doAct('pin.update', { pin: val('pin'), pin2: val('pin2') }, 'Transaction PIN updated.');
      f.reset();
    });
    return;
  }

  if (kind === 'admin-user') {
    submit(async () => {
      await doAct('admin.user.update', {
        id: val('id'), name: val('name'), email: val('email'), phone: val('phone'), country: val('country'),
        kyc: val('kyc'), pin: val('pin'), pw: val('pw'),
        cash: Number(val('cash')), assets: Number(val('assets')), reinvest: Number(val('reinvest')),
        frozen: !!(f.frozen && f.frozen.checked), isAdmin: !!(f.isAdmin && f.isAdmin.checked), note: val('note')
      }, 'User account updated.');
      closeModal();
    });
    return;
  }

  if (kind === 'admin-tx') {
    submit(async () => {
      const payload = {
        id: val('id') || undefined, userEmail: val('userEmail'), type: val('type'),
        amount: Number(val('amount')), status: val('status'), desc: val('desc'),
        when: val('when') || undefined
      };
      await doAct(val('id') ? 'admin.tx.update' : 'admin.tx.create', payload, 'Transaction saved.');
      closeModal();
    });
    return;
  }

  if (kind === 'admin-notify') {
    submit(async () => {
      const res = await doAct('admin.notify', { target: val('target'), type: val('type'), message: val('message') }, 'Notification sent.');
      if (f.device && f.device.checked) notifyDevice('AssetPulse', val('message'), 'admin');
      f.reset();
    });
    return;
  }

  if (kind === 'admin-notif-edit') {
    submit(async () => {
      await doAct('admin.notif.update', { id: val('id'), message: val('message'), type: val('type'), read: val('read') === '1' }, 'Notification updated.');
      closeModal();
    });
    return;
  }

  if (kind === 'pm') {
    submit(async () => {
      await doAct(val('id') ? 'admin.pm.update' : 'admin.pm.create', {
        id: val('id') || undefined, name: val('name'), network: val('network'), address: val('address'),
        note: val('note'), active: !!(f.active && f.active.checked)
      }, 'Deposit method saved.');
      closeModal();
    });
    return;
  }

  if (kind === 'wn') {
    submit(async () => {
      await doAct(val('id') ? 'admin.wn.update' : 'admin.wn.create', {
        id: val('id') || undefined, name: val('name'), min: Number(val('min')),
        feePct: Number(val('feePct')), active: !!(f.active && f.active.checked)
      }, 'Withdrawal network saved.');
      closeModal();
    });
    return;
  }

  if (kind === 'admin-withdraw') {
    submit(async () => {
      await doAct('admin.withdraw.edit', {
        id: val('id'), amount: Number(val('amount')), network: val('network'),
        address: val('address'), status: val('status'), notes: val('notes')
      }, 'Withdrawal request updated.');
      closeModal();
    });
    return;
  }

  if (kind === 'admin-email') {
    submit(async () => {
      const target = val('target');
      const recipients = target === 'all' ? [] : Array.from(f.querySelectorAll('input[name="rcpt"]:checked')).map(c => c.value);
      await doAct('admin.email.broadcast', {
        target, recipients, subject: val('subject'), message: val('message')
      }, 'Email sent.');
      f.reset();
    });
    return;
  }

  if (kind === 'plan') {
    submit(async () => {
      await doAct(val('id') ? 'admin.plan.update' : 'admin.plan.create', {
        id: val('id') || undefined, name: val('name'), dailyRate: Number(val('dailyRate')),
        durationDays: Number(val('durationDays')), min: Number(val('min')), max: Number(val('max')),
        risk: val('risk'), desc: val('desc')
      }, 'Plan saved.');
      closeModal();
    });
    return;
  }

  if (kind === 'settings') {
    submit(async () => {
      await doAct('admin.settings.update', {
        maintenance: !!(f.maintenance && f.maintenance.checked),
        minWithdrawal: Number(val('minWithdrawal')),
        withdrawalFeePct: Number(val('withdrawalFeePct'))
      }, 'Settings saved.');
    });
    return;
  }
});

/* ---------------- inputs ---------------- */
document.addEventListener('input', e => {
  if (e.target.id === 'txSearch') { uiState.txQ = e.target.value; renderKeep('txSearch'); }
  if (e.target.id === 'userSearch') { uiState.userQ = e.target.value; renderKeep('userSearch'); }
  if (e.target.id === 'adminTxSearch') { uiState.adminTxQ = e.target.value; renderKeep('adminTxSearch'); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'txType') { uiState.txType = e.target.value; render(); }
  if (e.target.id === 'adminTxType') { uiState.adminTxType = e.target.value; render(); }
  if (e.target.id === 'emailTarget') { const picker = document.getElementById('emailPicker'); if (picker) picker.style.display = e.target.value === 'selected' ? 'block' : 'none'; }
  if (e.target.dataset && e.target.dataset.act === 'toggle-auto') {
    const u = me(); if (!u) return;
    u.autoReinvest = e.target.checked; save(); toast('Auto-reinvest ' + (u.autoReinvest ? 'enabled' : 'disabled') + '.', 'ok');
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
qs('#modal-root').addEventListener('click', e => { if (e.target.id === 'modal-root') closeModal(); });

/* =========================================================
   Install (PWA), device notifications, transactional email
   ========================================================= */
let deferredPrompt = null;
let swReg = null;
const INSTALL_DISMISSED = 'assetpulse.install.dismissed';

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  const root = document.getElementById('install-root');
  if (root && !root.dataset.done) showInstallPopup();
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  hideInstallPopup(true);
  toast('AssetPulse was installed on this device.', 'ok');
});

function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}
function installPopupHTML() {
  const notif = ('Notification' in window) ? Notification.permission : 'unsupported';
  return '<div class="install-card" role="dialog" aria-label="Install AssetPulse">' +
    '<button class="install-x" data-act="dismiss-install" aria-label="Dismiss">×</button>' +
    '<div class="install-head"><img src="./icons/icon-192.png" alt="" width="38" height="38"><div><b>Install AssetPulse</b><div class="hint">Add it to your home screen for full-screen access.</div></div></div>' +
    '<div class="install-actions"><button class="btn btn-primary btn-sm" data-act="install-app">Install app</button>' +
    (notif === 'granted' ? '<span class="badge green">Alerts on</span>' : '<button class="btn btn-ghost btn-sm" data-act="enable-notifications">Enable alerts</button>') +
    '</div></div>';
}
function showInstallPopup() {
  if (isStandalone()) return;
  const root = document.getElementById('install-root');
  if (!root) return;
  if (localStorage.getItem(INSTALL_DISMISSED) === '1') return;
  root.innerHTML = installPopupHTML();
  root.dataset.done = '1';
}
function hideInstallPopup(permanent) {
  const root = document.getElementById('install-root');
  if (root) { root.innerHTML = ''; delete root.dataset.done; }
  if (permanent) localStorage.setItem(INSTALL_DISMISSED, '1');
}
function maybeShowInstall() {
  if (isStandalone() || localStorage.getItem(INSTALL_DISMISSED) === '1') return;
  let shown = false;
  const attempt = () => {
    if (shown || localStorage.getItem(INSTALL_DISMISSED) === '1') return;
    const inApp = location.hash.indexOf('/app') > -1 || location.hash.indexOf('/admin') > -1;
    if (inApp || window.scrollY > 280) { shown = true; showInstallPopup(); }
  };
  window.addEventListener('scroll', attempt, { passive: true });
  window.addEventListener('hashchange', () => setTimeout(attempt, 900));
  setTimeout(attempt, 7000);
}
async function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    try {
      const res = await deferredPrompt.userChoice;
      if (res && res.outcome === 'accepted') { hideInstallPopup(true); toast('Installing AssetPulse…', 'ok'); }
    } catch (e) { }
    deferredPrompt = null;
    return;
  }
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    openModal('Install on iPhone or iPad',
      '<p class="small muted" style="line-height:1.7;margin:0 0 12px">Safari cannot prompt directly. Tap the <b>Share</b> button, then choose <b>Add to Home Screen</b>.</p>' +
      '<div class="notice info">' + icon('down') + '<div>The app then opens full-screen and can show alerts on your lock screen.</div></div>');
    return;
  }
  openModal('Install AssetPulse',
    '<p class="small muted" style="line-height:1.7;margin:0 0 12px">Use your browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>. If the option is missing, the app may already be installed, or the browser does not support installation.</p>' +
    '<div class="notice info">' + icon('shield') + '<div>Installation requires the app to be served over HTTPS — which is how it runs on Render.</div></div>');
}

/* ---- device notifications ---- */
async function ensureSW() {
  if (!('serviceWorker' in navigator)) return null;
  if (swReg) return swReg;
  try {
    swReg = await navigator.serviceWorker.register('./sw.js');
    return swReg;
  } catch (e) { console.warn('SW registration failed', e); return null; }
}
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
async function notifyDevice(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const reg = await ensureSW();
  if (reg && reg.showNotification) {
    try {
      reg.showNotification(title, {
        body, icon: './icons/icon-192.png', badge: './icons/favicon-32.png',
        tag: tag || 'assetpulse', data: { url: './#/app/notifications' }, vibrate: [90, 40, 90]
      });
      return true;
    } catch (e) { }
  }
  try { new Notification(title, { body, icon: './icons/icon-192.png' }); return true; } catch (e) { return false; }
}
async function registerPush(reg) {
  try {
    const cfg = await api('api/push/key');
    if (!cfg.enabled || !cfg.key || !reg || !reg.pushManager) return { ok: false, reason: 'not-configured' };
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(cfg.key) });
    }
    await api('api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}
async function sendServerPushTest() {
  try {
    const r = await api('api/push/test', { method: 'POST', body: '{}' });
    toast(r.delivered ? 'Push delivered to ' + r.delivered + ' device(s).' : (r.skipped || 'No device subscribed yet.'), r.delivered ? 'ok' : 'err');
  } catch (e) { toast(e.message || 'Push test failed.', 'err'); }
}

async function enableNotifications() {
  if (!('Notification' in window)) return toast('This browser does not support notifications.', 'err');
  if (Notification.permission === 'denied') return toast('Notifications are blocked in your browser settings.', 'err');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return toast('Notification permission was not granted.', 'err');
  const reg = await ensureSW();
  toast('Device alerts enabled.', 'ok');
  await notifyDevice('AssetPulse alerts are on', 'You will be notified about deposits, withdrawals and account updates.', 'welcome');
  await registerPush(reg);
  hideInstallPopup();
  render();
}

/* ---- email ---- */
async function sendEventEmail(event, payload) {
  const rec = { id: uid('em'), to: payload.to, subject: event, at: now(), status: 'sending', kind: 'auto' };
  db.emailLog = db.emailLog || [];
  db.emailLog.unshift(rec);
  db.emailLog = db.emailLog.slice(0, 100);
  save();
  if (location.protocol === 'file:') { rec.status = 'skipped'; save(); return; }
  try {
    const r = await fetch('./api/email/event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ event }, payload))
    });
    const j = await r.json().catch(() => ({}));
    if (j.sent) rec.status = 'sent';
    else if (j.skipped) { rec.status = 'skipped'; rec.reason = j.skipped; }
    else rec.status = 'failed';
  } catch (e) { rec.status = 'offline'; }
  save();
}

/* ---------------- boot ---------------- */
(async function boot() {
  if (!location.hash) location.replace('#/');
  render();                       // paint shell immediately
  if (document.cookie.indexOf('ap_auth=1') > -1) {
    try { await refreshState(); } catch (e) { toast('Could not load your account. Check your connection.', 'err'); }
    render();
  } else {
    booted = true;
    stateLoaded = true;
    try {
      const cfg = await api('api/config');
      db.plans = cfg.plans || [];
      if (cfg.appUrl) db.settings.appUrl = cfg.appUrl;
    } catch (e) { }
    render();
  }
  ensureSW().then(() => { });
  maybeShowInstall();
  // keep balances and queues fresh while the tab is open
  setInterval(() => {
    if (!me() || document.visibilityState !== 'visible') return;
    refreshState().then(() => { const a = document.activeElement; render(); if (a && a.id) { const n = document.getElementById(a.id); if (n && n.focus) n.focus(); } }).catch(() => { });
  }, 60000);
})();
window.addEventListener('hashchange', () => {
  render();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  if (me()) refreshState().then(() => render()).catch(() => { });
});

