/* 國土通檢專案控管：共用工具、資料層（db＋共編）、路由、抽屜、對話框 */
(function () {
'use strict';
const A = window.APP = {};

/* ---------- DOM 小工具 ---------- */
const h = A.h = function (tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') e.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
  return e;
};
const svgNS = 'http://www.w3.org/2000/svg';
A.s = function (tag, attrs) { const e = document.createElementNS(svgNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
A.icon = function (d) { const s = A.s('svg', { viewBox: '0 0 24 24' }); s.innerHTML = d; return s; };
A.$ = (s, r = document) => r.querySelector(s);

/* ---------- 日期（ISO yyyy-mm-dd，本地時間） ---------- */
const pad = n => String(n).padStart(2, '0');
A.iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
A.parse = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
A.today = () => A.iso(new Date());
A.addDays = (s, n) => { const d = A.parse(s); d.setDate(d.getDate() + n); return A.iso(d); };
A.diff = (a, b) => Math.round((A.parse(a) - A.parse(b)) / 86400000);
const WD = ['日', '一', '二', '三', '四', '五', '六'];
A.wd = s => WD[A.parse(s).getDay()];
A.md = s => { if (!s) return '未定'; const d = A.parse(s); return (d.getMonth() + 1) + '/' + d.getDate(); };
A.mdw = s => s ? A.md(s) + '（' + A.wd(s) + '）' : '未定';
A.roc = s => { if (!s) return ''; const d = A.parse(s); return (d.getFullYear() - 1911) + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()); };
A.holidaySet = () => { const m = {}; ((A.S.calendar && A.S.calendar.holidays) || []).forEach(x => { if (x && x.date) m[x.date] = x.name || '假日'; }); return m; };
A.isOff = (s, H) => { const d = A.parse(s).getDay(); return d === 0 || d === 6 || !!(H || A.holidaySet())[s]; };
/* 從日期往前推 n 個工作天（週末、國定假日不算） */
A.backWorkdays = (s, n) => { const H = A.holidaySet(); let d = s, c = 0; while (c < n) { d = A.addDays(d, -1); if (!A.isOff(d, H)) c++; } return d; };
A.workdaysBetween = (a, b) => { const H = A.holidaySet(); if (a >= b) return 0; let d = a, c = 0; while (d < b) { d = A.addDays(d, 1); if (!A.isOff(d, H)) c++; } return c; };

/* ---------- 狀態 ---------- */
const S = A.S = {
  ready: false, demo: false, conn: 'wait', canWrite: true, isAdmin: false, myUid: null,
  project: {}, templates: { types: [] }, calendar: { holidays: [] },
  people: [], tasks: [], meetings: [], issues: [], letters: [], reviews: [],
  peers: [], page: 'overview', drawer: null
};
A.COLLS = ['people', 'tasks', 'meetings', 'issues', 'letters', 'reviews', 'contacts'];
A.newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
A.byId = (coll, id) => S[coll].find(x => x.id === id);
A.person = id => S.people.find(p => p.id === id);
A.pname = id => { const p = A.person(id); return p ? p.name : ''; };
// 用 Google 帳號登入時，依成員表的 email 自動對到「我是誰」；對不到才用手選
A.meAuto = () => { const em = window.FB_EMAIL; const p = em && S.people.find(x => String(x.email || '').trim().toLowerCase() === em); return p ? p.id : ''; };
A.meId = () => { const a = A.meAuto(); if (a || window.FB_EMAIL) return a; try { return localStorage.getItem('gt-me') || ''; } catch (_) { return ''; } };
A.setMe = id => { try { localStorage.setItem('gt-me', id); } catch (_) {} };
const PALETTE = ['#e4f1fb', '#e2f3ef', '#fbe9e6', '#efebf7', '#f1eee7', '#fbf1d6', '#e7f3ea', '#f6e6ef'];
A.pcolor = id => { const i = S.people.findIndex(p => p.id === id); return i < 0 ? 'var(--chip)' : PALETTE[i % PALETTE.length]; };
A.avatar = (id, size) => { const n = A.pname(id); return h('span', { class: 'av', style: 'color:#14202b;background:' + A.pcolor(id) + (size ? ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * .42) + 'px' : ''), title: n || '未指派' }, n ? (/[A-Za-z0-9]$/.test(n) ? n.slice(-1) : n.length >= 3 ? n.slice(1, 2) : n.slice(0, 1)) : '?'); };

/* ---------- 資料層 ---------- */
let db = null, user = null; A.assets = null; A.downloads = null; A.room = null;
let renderQueued = false;
A.schedule = function () { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; A.render(); }); };

function setConn(k, txt) { S.conn = k; const c = A.$('#conn'); if (!c) return; c.className = 'conn ' + k; c.lastChild.textContent = txt; }
A.setConn = setConn;

async function writeErr(e) {
  const code = e && e.code;
  if (code === 'invalid_argument' && !S.canWriteChecked) { S.canWrite = false; A.toast('你目前只有檢視權限，變更沒有儲存。'); A.schedule(); }
  else if (code === 'quota_exceeded') A.toast('資料筆數已達上限，請先刪除不用的資料。');
  else A.toast('儲存失敗，請稍後再試。');
}
function localApply(coll, id, data, merge) {
  const arr = S[coll]; const i = arr.findIndex(x => x.id === id);
  if (data === null) { if (i >= 0) arr.splice(i, 1); }
  else if (i >= 0) arr[i] = merge ? deepMerge(Object.assign({}, arr[i]), data) : Object.assign({ id }, data);
  else arr.push(Object.assign({ id }, data));
  A.schedule();
}
function deepMerge(t, s) { for (const k in s) { if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) t[k] = deepMerge(Object.assign({}, t[k]), s[k]); else t[k] = s[k]; } return t; }
const stamp = () => ({ updatedAt: new Date().toISOString(), updatedBy: S.myUid || null });

A.put = async function (coll, id, data) {
  data = Object.assign({}, data, stamp()); delete data.id;
  if (!db) { localApply(coll, id, data, false); return true; }
  try { await db.collection(coll).doc(id).set(data); A.saved(); return true; } catch (e) { writeErr(e); return false; }
};
A.patch = async function (coll, id, data) {
  data = Object.assign({}, data, stamp());
  if (!db) { localApply(coll, id, data, true); return true; }
  try { await db.collection(coll).doc(id).update(data); A.saved(); return true; } catch (e) { writeErr(e); return false; }
};
A.del = async function (coll, id) {
  if (!db) { localApply(coll, id, null); return true; }
  myDel.add(coll + '/' + id);
  try { await db.collection(coll).doc(id).delete(); A.saved(); return true; } catch (e) { writeErr(e); return false; }
};
A.putConfig = async function (key, data) {
  if (!db) { S[key] = data; A.schedule(); return true; }
  try { await db.doc('config/' + key).set(data); return true; }
  catch (e) { if (e && (e.code === 'invalid_argument' || e.code === 'permission-denied')) A.toast('只有管理者可以修改設定。'); else writeErr(e); return false; }
};

/* 共編：誰在線上、誰正在編哪一筆 */
A.presence = function (patch) { if (A.room) A.room.presence(patch).catch(() => {}); };
A.editorsOf = function (key) { return S.peers.filter(p => !p.sameTab && p.presence && p.presence.rec === key); };
let profCache = {};
A.profiles = async function (ids) { if (!user || !ids.length) return {}; try { const r = await user.profiles(ids); Object.assign(profCache, r); return r; } catch (_) { return {}; } };
const triedP = new Set();
A.needProfiles = function (ids) { const m = ids.filter(i => i && !triedP.has(i)); if (!m.length) return; m.forEach(i => triedP.add(i)); A.profiles(m).then(() => A.schedule()); };
A.profName = id => (profCache[id] && profCache[id].name) || '';

async function boot() {
  A.renderShell();
  if (!window.claude || typeof window.claude.use !== 'function') {
    if (location.protocol === 'file:') {
      await new Promise(r => { const sc = document.createElement('script'); sc.src = 'demo.js'; sc.onload = r; sc.onerror = r; document.head.append(sc); });
      if (window.DEMO) { Object.assign(S, window.DEMO); S.demo = true; S.isAdmin = true;
        const q = new URLSearchParams(location.search); if (q.get('page')) S.page = q.get('page'); if (q.get('view')) S.schedView = q.get('view'); if (q.get('theme')) document.documentElement.dataset.theme = q.get('theme'); }
    }
    S.ready = true; setConn(S.demo ? 'on' : 'off', S.demo ? '本機預覽' : '未連線'); A.render();
    if (window.DEMO_AFTER) setTimeout(window.DEMO_AFTER, 60);
    return;
  }
  db = await window.claude.use('db');
  if (!db) { S.ready = true; setConn('off', '無法連線'); A.render(); A.toast('目前無法連線到共用資料，請重新整理或確認已登入。'); return; }
  user = await window.claude.use('user');
  if (user) {
    try { S.myUid = await user.id(); } catch (_) {}
    try { S.isAdmin = !!(await user.canEdit()); } catch (_) {}
    try { const w = await user.can('data.write'); if (w === false) S.canWrite = false; if (w !== null) S.canWriteChecked = true; } catch (_) {}
  }
  let first = 0; const need = A.COLLS.length + 1;
  const done = () => { first++; if (first >= need && !S.ready) { S.ready = true; setConn('on', '即時同步'); A.schedule(); setTimeout(() => A.brief && A.brief(), 900); } };
  A.COLLS.forEach(c => {
    let got = false;
    db.collection(c).onSnapshot(snap => { const prev = S[c]; S[c] = snap.docs.map(d => Object.assign({ id: d.id }, d.data())); if (got) A.noteChanges(c, snap, prev); if (!got) { got = true; done(); } A.schedule(); },
      () => { if (c === 'contacts') { S.contactsErr = true; if (!got) { got = true; done(); } return; } setConn('off', '同步中斷'); A.toast('資料同步中斷，請重新整理頁面。'); });
  });
  let gotCfg = false;
  db.collection('config').onSnapshot(snap => {
    snap.docs.forEach(d => { if (['project', 'templates', 'calendar'].includes(d.id)) S[d.id] = d.data() || {}; });
    if (!gotCfg) { gotCfg = true; done(); } A.schedule();
  }, () => {});
  setTimeout(() => { if (!S.ready) { S.ready = true; A.schedule(); } }, 6000);
  // 下載、上傳、共編 在背景開啟，拿不到就隱藏相關按鈕
  window.claude.use('downloads').then(d => { A.downloads = d; }).catch(() => {});
  window.claude.use('assets').then(a => { A.assets = a; A.schedule(); }).catch(() => {});
  window.claude.use('room').then(r => {
    A.room = r; if (!r) return;
    let sigO = '', sigR = '';
    r.onPeers(ch => { const ps = ch.peers.filter(p => p.kind === 'viewer'); S.peers = ps;
      const o = JSON.stringify(ps.map(p => p.by || p.peer).sort()), rr = JSON.stringify(ps.filter(p => !p.sameTab && p.presence && p.presence.rec).map(p => p.peer + ':' + p.presence.rec).sort());
      if (o !== sigO) { sigO = o; A.renderOnline(); } if (rr !== sigR) { sigR = rr; A.schedule(); } }, () => {});
    A.presence({ page: S.page, rec: null, me: S.myUid || null });
  }).catch(() => {});
}

/* ---------- 路由與外框 ---------- */
A.PAGES = [
  ['overview', '總覽', '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'],
  ['schedule', '時程', '<path d="M4 7h9M4 12h16M4 17h6"/><circle cx="16.5" cy="7" r="2"/><circle cx="13.5" cy="17" r="2"/>'],
  ['meetings', '會議', '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'],
  ['issues', '議題', '<path d="M12 3l8 4.5-8 4.5-8-4.5z"/><path d="M4 12l8 4.5 8-4.5M4 16.5L12 21l8-4.5"/>'],
  ['docs', '文件', '<path d="M6 3.5h8l4 4V20.5H6z"/><path d="M14 3.5v4h4M9 12h6M9 16h4"/>'],
  ['admin', '後台', '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>']
];
A.go = function (p) { S.page = p; try { localStorage.setItem('gt-page', p); } catch (_) {} A.presence({ page: p }); A.render(); window.scrollTo({ top: 0 }); };
A.renderShell = function () {
  try { const p = localStorage.getItem('gt-page'); if (p && A.PAGES.some(x => x[0] === p)) S.page = p; } catch (_) {}
  const hash = (location.hash || '').slice(1); if (A.PAGES.some(x => x[0] === hash)) S.page = hash;
  A.$('#openSearch').addEventListener('click', A.openSearch);
  A.$('#addBtn').addEventListener('click', A.openAdd);
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); A.openSearch(); }
    if (e.key === 'Escape') { const t = document.querySelector('.cf,.sr,.ov'); if (t) { t.remove(); if (t.classList.contains('ov')) A.closeDrawer(); } }
  });
  A.$('#meSel').addEventListener('change', e => { A.setMe(e.target.value); A.render(); });
};
A.renderNav = function () {
  const nav = A.$('#nav'); nav.replaceChildren();
  const late = A.overdue ? A.overdue().length : 0;
  const counts = { schedule: S.tasks.length || '', meetings: A.heldCount ? A.heldCount() + '/' + A.quotaTotal() : '', issues: S.issues.length || '', docs: '' };
  A.PAGES.forEach(([k, label, d]) => {
    const b = h('button', { type: 'button', 'aria-current': S.page === k ? 'page' : null, onclick: () => A.go(k) }, A.icon(d), label);
    if (k === 'overview' && late) b.append(h('span', { class: 'ct r' }, late));
    else if (counts[k] !== undefined && counts[k] !== '') b.append(h('span', { class: 'ct' }, counts[k]));
    nav.append(b);
  });
  const sel = A.$('#meSel'); const me = A.meId(); sel.replaceChildren(h('option', { value: '' }, '（請選擇）'), ...S.people.map(p => h('option', { value: p.id, selected: p.id === me ? true : null }, p.name)));
  // 用 Google 帳號登入的版本不需要手選：直接顯示登入者，另附登出
  const auto = !!window.FB_EMAIL; let mn = A.$('#meName'); if (!mn) { mn = h('b', { id: 'meName', style: 'display:block;font-size:13px;font-weight:500;padding:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px' }); sel.after(mn); }
  sel.style.display = auto ? 'none' : ''; mn.style.display = auto ? 'block' : 'none';
  if (auto) { mn.textContent = (me && A.pname(me)) || window.FB_NAME || window.FB_EMAIL; mn.title = window.FB_EMAIL + (me ? '' : '（後台成員表填上這個 email，就會對到你的工項）');
    if (!A.$('#meOut')) mn.after(h('button', { id: 'meOut', type: 'button', class: 'melo', onclick: () => window.FB_LOGOUT && window.FB_LOGOUT() }, '登出')); }
  const av = A.$('#meAv'); av.replaceWith(Object.assign(A.avatar(me), { id: 'meAv' }));
};
A.renderOnline = function () {
  const box = A.$('#online'); if (!box) return; box.replaceChildren();
  const others = S.peers; if (!others.length) return;
  const ids = [...new Set(others.map(p => p.by).filter(Boolean))];
  A.profiles(ids).then(() => {
    const st = h('div', { class: 'stack' });
    const seen = new Set();
    others.forEach(p => { const key = p.by || p.peer; if (seen.has(key)) return; seen.add(key); const nm = (p.by && A.profName(p.by)) || '成員';
      const pr = p.by && profCache[p.by]; st.append(h('span', { class: 'av', title: nm + (p.isMe ? '（你）' : ''), style: 'background:' + (pr ? pr.color : 'var(--chip)') + ';color:#fff' }, pr && pr.avatarUrl ? h('img', { src: pr.avatarUrl, alt: '' }) : nm.slice(0, 1))); });
    box.replaceChildren(st, h('span', null, seen.size + ' 人在線上'));
  });
};
A.render = function () {
  if (!A.pages) return;
  A.renderNav(); A.renderToday && A.renderToday(); A.renderBell && A.renderBell();
  const v = A.$('#view');
  const keep = document.activeElement && v.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (keep || S.dragging) { A.pendingRender = true; return; }
  const fn = A.pages[S.page] || A.pages.overview;
  const frag = h('div', { style: 'display:flex;flex-direction:column;gap:20px' });
  if (S.demo) frag.append(h('div', { class: 'demo-ribbon' }, '本機預覽：畫面上是示意資料，發佈後會改用共用資料庫。'));
  if (!S.canWrite) frag.append(h('div', { class: 'demo-ribbon' }, '你目前只有檢視權限，無法修改內容。需要編輯權限請聯絡管理者。'));
  fn(frag);
  v.replaceChildren(frag);
  if (S.drawer && A.refreshDrawer) A.refreshDrawer();
};
document.addEventListener('focusout', () => { setTimeout(() => { if (A.pendingRender && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) { A.pendingRender = false; A.render(); } }, 120); });

/* ---------- 抽屜、對話框、提示 ---------- */
A.openDrawer = function (kind, id) {
  S.drawer = { kind, id }; A.presence({ rec: kind + ':' + id });
  document.querySelectorAll('.ov').forEach(x => x.remove());
  const ov = h('div', { class: 'ov', onclick: e => { if (e.target === ov) { ov.remove(); A.closeDrawer(); } } });
  const dw = h('div', { class: 'dw', role: 'dialog', 'aria-modal': 'true' });
  ov.append(dw); document.body.append(ov);
  A.fillDrawer(dw);
};
A.closeDrawer = function () { S.drawer = null; A.presence({ rec: null }); document.querySelectorAll('.ov').forEach(x => x.remove()); A.schedule(); };
A.refreshDrawer = function () {
  const dw = document.querySelector('.ov .dw'); if (!dw || !S.drawer) return;
  if (dw.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const st = dw.querySelector('.dwb') ? dw.querySelector('.dwb').scrollTop : 0;
  A.fillDrawer(dw); const b = dw.querySelector('.dwb'); if (b) b.scrollTop = st;
};
A.fillDrawer = function (dw) {
  const d = S.drawer; const fn = A.drawers && A.drawers[d.kind]; if (!fn) return;
  const close = h('button', { class: 'ib', type: 'button', 'aria-label': '關閉', onclick: () => A.closeDrawer() }, A.icon('<path d="M6 6l12 12M18 6L6 18"/>'));
  const out = fn(d.id); if (!out) { A.closeDrawer(); return; }
  const head = h('div', { class: 'dwh' }, h('h3', null, out.title), out.actions || null, close);
  const eds = A.editorsOf(d.kind + ':' + d.id);
  const peer = eds.length ? h('div', { class: 'peerbar' }, '共編中：另有 ' + eds.length + ' 位成員正在看這一筆，存檔以最後一次為準。') : null;
  dw.replaceChildren(head, peer || '', h('div', { class: 'dwb' }, out.body));
};
A.confirm = function (title, msg, yes, onYes, danger) {
  const box = h('div', { class: 'cf', role: 'alertdialog', 'aria-modal': 'true' });
  const close = () => box.remove();
  box.append(h('div', { class: 'cfb' }, h('h3', null, title), msg ? h('p', null, msg) : '',
    h('div', { class: 'act' }, h('button', { class: 'btn', type: 'button', onclick: close }, '取消'),
      h('button', { class: 'btn' + (danger ? ' danger' : ''), type: 'button', onclick: () => { close(); onYes(); } }, yes || '確定'))));
  document.body.append(box); box.querySelector('.act .btn:last-child').focus();
};
A.prompt = function (title, ph, onOk, def) {
  const box = h('div', { class: 'cf', role: 'dialog', 'aria-modal': 'true' });
  const inp = h('input', { class: 'in', placeholder: ph || '', value: def || '', id: 'prompt-in' });
  const ok = () => { const v = inp.value.trim(); if (!v) { inp.focus(); return; } box.remove(); onOk(v); };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) ok(); });
  box.append(h('div', { class: 'cfb' }, h('h3', null, title), inp, h('div', { class: 'act' }, h('button', { class: 'btn', type: 'button', onclick: () => box.remove() }, '取消'), h('button', { class: 'btn', type: 'button', onclick: ok }, '確定'))));
  document.body.append(box); setTimeout(() => inp.focus(), 30);
};
let toastT = 0;
A.toast = function (msg) { document.querySelectorAll('.toast').forEach(x => x.remove()); const t = h('div', { class: 'toast', role: 'status' }, msg); document.body.append(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2800); };

/* 欄位：失焦或按 Enter 才存，避免共編時一直覆寫 */
A.field = function (label, input, top) { return h('div', { class: 'fld' + (top ? ' top' : '') }, h('label', null, label), input); };
A.inp = function (val, onSave, attrs) {
  const e = h(attrs && attrs.multi ? 'textarea' : 'input', Object.assign({ class: 'in' + (attrs && attrs.sm ? ' sm' : '') }, attrs && attrs.type ? { type: attrs.type } : {}, attrs && attrs.ph ? { placeholder: attrs.ph } : {}, attrs && attrs.id ? { id: attrs.id } : {}));
  e.value = val == null ? '' : val;
  if (!S.canWrite || (attrs && attrs.ro)) e.disabled = true;
  const go = () => { const v = attrs && attrs.type === 'number' ? (e.value === '' ? null : Number(e.value)) : e.value.trim(); if (String(v ?? '') !== String(val ?? '')) { val = v; onSave(v); } };
  e.addEventListener('change', go);
  if (!(attrs && attrs.multi)) e.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.isComposing) e.blur(); });
  return e;
};
A.sel = function (val, options, onSave, attrs) {
  const e = h('select', { class: 'in' + (attrs && attrs.sm ? ' sm' : ''), id: attrs && attrs.id });
  options.forEach(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; e.append(h('option', { value: v, selected: String(v) === String(val ?? '') ? true : null }, t)); });
  if (!S.canWrite || (attrs && attrs.ro)) e.disabled = true;
  e.addEventListener('change', () => onSave(e.value));
  return e;
};
A.peopleOpts = (blank) => [['', blank || '未指派'], ...S.people.map(p => [p.id, p.name])];

/* ---------- 全站搜尋 ---------- */
A.openSearch = function () {
  document.querySelectorAll('.sr').forEach(x => x.remove());
  const box = h('div', { class: 'sr', onclick: e => { if (e.target === box) box.remove(); } });
  const inp = h('input', { placeholder: '輸入關鍵字：會議、決議、議題、公文、工項…', id: 'search-in', 'aria-label': '搜尋' });
  const list = h('div', { class: 'srl' });
  const run = () => {
    const q = inp.value.trim().toLowerCase(); list.replaceChildren(); if (!q) { list.append(h('div', { class: 'empty' }, '可以搜尋會議紀錄的摘要與決議、議題導讀內容、公文主旨。')); return; }
    const hit = (t) => t && String(t).toLowerCase().includes(q);
    const res = [];
    S.meetings.forEach(m => { const mi = m.minutes || {}; const dec = (mi.decisions || []).map(x => x.text).join(' '); if (hit(m.title) || hit(mi.summary) || hit(dec) || hit(m.place)) res.push(['會議', m.title || '未命名會議', (mi.summary || dec || '').slice(0, 80), () => A.openDrawer('meeting', m.id)]); });
    S.issues.forEach(i => { const nt = Object.values(i.notes || {}).join(' '); if (hit(i.name) || hit(nt) || hit('議題 ' + i.no)) res.push(['議題', '議題 ' + i.no + (i.name ? '　' + i.name : ''), nt.slice(0, 80), () => A.openDrawer('issue', i.id)]); });
    S.tasks.forEach(t => { if (hit(t.title) || hit(t.note)) res.push(['工項', t.title, t.note || '', () => A.openDrawer('task', t.id)]); });
    S.letters.forEach(l => { if (hit(l.subject) || hit(l.no)) res.push(['公文', l.subject || l.no, (l.kind || '') + ' ' + (l.no || ''), () => A.openDrawer('letter', l.id)]); });
    (S.contacts || []).forEach(c => { if (hit(c.name) || hit(c.org) || hit(c.note)) res.push(['聯絡人', c.name || '', [c.org, c.title, c.phone].filter(Boolean).join('．'), () => A.openDrawer('contact', c.id)]); });
    if (!res.length) list.append(h('div', { class: 'empty' }, '找不到「' + inp.value.trim() + '」。'));
    res.slice(0, 40).forEach(([k, t, sub, fn]) => list.append(h('button', { type: 'button', onclick: () => { box.remove(); fn(); } }, h('small', null, k), h('span', null, t, h('em', null, sub)))));
  };
  inp.addEventListener('input', run);
  box.append(h('div', { class: 'srb', role: 'dialog', 'aria-modal': 'true' }, inp, list));
  document.body.append(box); run(); setTimeout(() => inp.focus(), 20);
};

/* 新增：依目前頁面決定新增什麼 */
A.openAdd = function () {
  if (!S.canWrite) { A.toast('你目前只有檢視權限。'); return; }
  const box = h('div', { class: 'cf' });
  const pick = (fn) => { box.remove(); fn(); };
  box.append(h('div', { class: 'cfb' }, h('h3', null, '要新增什麼？'),
    h('div', { style: 'display:grid;gap:8px' },
      h('button', { class: 'btn', type: 'button', onclick: () => pick(A.newTask) }, '工項'),
      h('button', { class: 'btn', type: 'button', onclick: () => pick(A.newMeeting) }, '會議'),
      h('button', { class: 'btn', type: 'button', onclick: () => pick(() => A.newLetter && A.newLetter()) }, '公文'),
      h('button', { class: 'btn', type: 'button', onclick: () => pick(() => A.newReview && A.newReview()) }, '審查意見')),
    h('div', { class: 'act' }, h('button', { class: 'btn', type: 'button', onclick: () => box.remove() }, '取消'))));
  document.body.append(box);
};

/* CSV 匯出（Excel 可直接開） */
A.exportCSV = async function (name, rows) {
  const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const text = '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n');
  if (!A.downloads) { A.toast('這個檢視無法下載檔案。'); return; }
  try { await A.downloads.save({ filename: name + '.csv', data: text }); } catch (e) { if (!e || e.code !== 'declined') A.toast('匯出失敗：' + ((e && e.message) || '')); }
};

/* 更新提示：自己存檔顯示「已儲存」，別人改了資料跳通知卡 */
const myDel = new Set();
let savedT = 0;
A.saved = function () { clearTimeout(savedT); savedT = setTimeout(() => { if (!document.querySelector('.toast')) A.toast('已儲存'); }, 250); };
const COLL_LB = { tasks: '工項', meetings: '會議', issues: '議題', letters: '公文', reviews: '審查意見', people: '成員', contacts: '聯絡人' };
const KIND = { tasks: 'task', meetings: 'meeting', issues: 'issue', letters: 'letter', reviews: 'review', contacts: 'contact' };
const recName = d => (d && (d.title || d.name || d.subject || d.no)) || '';
let noteQ = [], noteT = 0;
A.noteChanges = function (c, snap, prev) {
  if (!snap || typeof snap.docChanges !== 'function' || !COLL_LB[c]) return;
  snap.docChanges().forEach(ch => {
    const id = ch.doc.id, d = ch.doc.data() || {};
    if (ch.doc.metadata && ch.doc.metadata.hasPendingWrites) return;
    if (ch.type === 'removed') { if (myDel.has(c + '/' + id)) { myDel.delete(c + '/' + id); return; } noteQ.push({ c, id, type: 'removed', name: recName(d), by: null }); return; }
    if (!d.updatedBy || d.updatedBy === S.myUid) return;
    const old = (prev || []).find(x => x.id === id);
    noteQ.push({ c, id, type: ch.type === 'added' ? 'added' : 'modified', name: recName(d), by: d.updatedBy, st: old && d.status && old.status !== d.status ? d.status : '', dt: c === 'meetings' && old && d.date && old.date !== d.date ? d.date : '' });
  });
  clearTimeout(noteT); noteT = setTimeout(flushNotes, 1200);
};
async function flushNotes() {
  const q = noteQ; noteQ = []; if (!q.length) return;
  const groups = {}; q.forEach(n => { const k = (n.by || '-') + '|' + n.c + '|' + n.type; (groups[k] = groups[k] || []).push(n); });
  const ids = [...new Set(q.map(n => n.by).filter(Boolean))]; if (ids.length) await A.profiles(ids);
  Object.values(groups).forEach(g => {
    const n = g[0], who = n.by ? (A.profName(n.by) || '有人') : '', lb = COLL_LB[n.c], verb = n.type === 'added' ? '新增了' : n.type === 'removed' ? '刪除了' : '更新了';
    let txt;
    if (g.length > 1) txt = (who || '有人') + ' ' + verb + ' ' + g.length + ' 筆' + lb;
    else if (n.type === 'removed') txt = lb + '「' + n.name + '」已被刪除';
    else txt = who + ' ' + verb + lb + '「' + n.name + '」' + (n.st ? '，狀態改為「' + n.st + '」' : '') + (n.dt ? '，日期改為 ' + A.md(n.dt) : '');
    A.notify(txt, who, g.length === 1 && n.type !== 'removed' && KIND[n.c] ? () => A.openDrawer(KIND[n.c], n.id) : null);
  });
}
A.notify = function (txt, who, onOpen) {
  let box = document.getElementById('notes'); if (!box) { box = h('div', { id: 'notes', class: 'notes', 'aria-live': 'polite' }); document.body.append(box); }
  const x = h('button', { class: 'x', type: 'button', 'aria-label': '關閉通知' }, '×');
  const card = h('div', { class: 'note' + (onOpen ? ' go' : '') }, h('span', { class: 'nav0' }, (who || '・').slice(0, 1)), h('div', { style: 'min-width:0' }, txt, h('small', null, '剛剛' + (onOpen ? '．點一下查看' : ''))), x);
  const close = () => { card.classList.add('out'); setTimeout(() => card.remove(), 200); };
  x.addEventListener('click', e => { e.stopPropagation(); close(); });
  if (onOpen) card.addEventListener('click', () => { close(); onOpen(); });
  box.append(card); while (box.children.length > 4) box.firstChild.remove();
  let t = setTimeout(close, 8000);
  card.addEventListener('mouseenter', () => clearTimeout(t)); card.addEventListener('mouseleave', () => { t = setTimeout(close, 3000); });
};

/* 通知中心：最近 7 天誰改了哪一筆（讀各筆的 updatedAt／updatedBy） */
const SEEN_K = 'gt-seen';
const getSeen = () => { try { return localStorage.getItem(SEEN_K) || ''; } catch (_) { return ''; } };
const setSeen = v => { try { localStorage.setItem(SEEN_K, v); } catch (_) {} };
if (!getSeen()) setSeen(new Date().toISOString());
A.recent = function () {
  const from = new Date(Date.now() - 7 * 864e5).toISOString(), out = [];
  Object.keys(COLL_LB).forEach(c => (S[c] || []).forEach(d => { if (d.updatedAt && d.updatedAt >= from) out.push({ c, id: d.id, at: d.updatedAt, by: d.updatedBy || null, name: recName(d) }); }));
  return out.sort((x, y) => (x.at < y.at ? 1 : -1)).slice(0, 60);
};
A.renderBell = function () {
  const n = A.$('#bellN'); if (!n) return;
  const seen = getSeen(), k = A.recent().filter(x => x.at > seen && x.by && x.by !== S.myUid).length;
  n.hidden = !k; n.textContent = k > 99 ? '99+' : String(k);
};
const ago = iso => { const t = (Date.now() - Date.parse(iso)) / 1000; if (t < 60) return '剛剛'; if (t < 3600) return Math.floor(t / 60) + ' 分鐘前'; if (t < 86400) return Math.floor(t / 3600) + ' 小時前'; const d = new Date(iso); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
A.openBell = async function () {
  const old = document.getElementById('bellPop'); if (old) { old.remove(); return; }
  const list = A.recent(), seen = getSeen();
  await A.profiles([...new Set(list.map(x => x.by).filter(Boolean))]);
  const pop = h('div', { id: 'bellPop', class: 'bellpop', role: 'dialog', 'aria-label': '最近更新' });
  const outside = e => { if (!pop.contains(e.target) && !e.target.closest('#bellBtn')) close(); };
  const esc = e => { if (e.key === 'Escape') close(); };
  const close = () => { pop.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', esc); };
  pop.append(h('div', { class: 'bh2' }, h('b', null, '最近 7 天的更新'), h('small', null, list.length + ' 筆')));
  const ul = h('div', { class: 'bl' });
  if (!list.length) ul.append(h('div', { class: 'muted', style: 'padding:22px;text-align:center' }, '最近 7 天沒有更新'));
  list.forEach(x => {
    const mine = !!x.by && x.by === S.myUid, who = mine ? '你' : (x.by && A.profName(x.by)) || '有人', unread = !mine && !!x.by && x.at > seen;
    ul.append(h('button', { type: 'button', class: 'bi' + (unread ? ' un' : ''), onclick: () => { close(); if (KIND[x.c]) A.openDrawer(KIND[x.c], x.id); else if (A.go) A.go('admin'); } },
      h('span', { class: 'nav0' }, who.slice(0, 1)), h('span', { class: 'bt' }, who + ' 更新了' + COLL_LB[x.c] + '「' + (x.name || '未命名') + '」', h('small', null, ago(x.at))), unread ? h('i', { class: 'dot' }) : ''));
  });
  pop.append(ul); document.body.append(pop);
  const r = A.$('#bellBtn').getBoundingClientRect();
  // 靠鈴鐺右緣對齊，但不超出畫面左右（手機鈴鐺在中間時也不會跑出去）
  const w = pop.offsetWidth, vw = document.documentElement.clientWidth;
  pop.style.top = (r.bottom + 8) + 'px'; pop.style.left = Math.max(12, Math.min(r.right - w, vw - w - 12)) + 'px';
  setSeen(new Date().toISOString()); A.renderBell();
  setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', esc); }, 0);
};
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#bellBtn')) A.openBell(); });
setInterval(() => A.renderBell(), 60000);

/* Word 檔（.docx）：用 JSZip 自己組 OOXML；中文字型設標楷體（eastAsia），英數 Times New Roman */
A.loadScript = src => new Promise((ok, no) => { if (src in loadedJs) return loadedJs[src].then(ok, no); const s = document.createElement('script'); loadedJs[src] = new Promise((a, b) => { s.onload = a; s.onerror = b; }); s.src = src; document.head.append(s); loadedJs[src].then(ok, no); });
const loadedJs = {};
const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const xe = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const wruns = (text, o) => String(text == null ? '' : text).split('\n').map((ln, i) => (i ? '<w:r><w:br/></w:r>' : '') + '<w:r><w:rPr>' + (o.b ? '<w:b/><w:bCs/>' : '') + (o.sz ? '<w:sz w:val="' + o.sz * 2 + '"/><w:szCs w:val="' + o.sz * 2 + '"/>' : '') + '</w:rPr><w:t xml:space="preserve">' + xe(ln) + '</w:t></w:r>').join('');
const wpara = (text, o = {}) => '<w:p><w:pPr>' + (o.keep ? '<w:keepNext/>' : '') + '<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after == null ? 60 : o.after) + '" w:line="' + (o.line || 300) + '" w:lineRule="auto"/>' + (o.left ? '<w:ind w:left="' + o.left + '" w:hanging="' + (o.hanging || 0) + '"/>' : '') + '<w:jc w:val="' + (o.align || 'both') + '"/></w:pPr>' + wruns(text, o) + '</w:p>';
const wtbl = (widths, rows, o = {}) => {
  const W = widths.reduce((a, b) => a + b, 0);
  const bd = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(k => '<w:' + k + ' w:val="single" w:sz="6" w:space="0" w:color="000000"/>').join('') + '</w:tblBorders>';
  const hdr = '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>';
  return '<w:tbl><w:tblPr><w:tblW w:w="' + W + '" w:type="dxa"/><w:jc w:val="center"/>' + bd + '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' + widths.map(w => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>' +
    rows.map((r, ri) => {
      const head = ri === 0 && o.header;
      const trPr = '<w:trPr>' + (head ? '<w:tblHeader/><w:cantSplit/>' : '') + (!head && o.rowH ? '<w:trHeight w:val="' + o.rowH + '" w:hRule="atLeast"/>' : '') + '</w:trPr>';
      if (r && r.span !== undefined) return '<w:tr>' + trPr + '<w:tc><w:tcPr><w:tcW w:w="' + W + '" w:type="dxa"/><w:gridSpan w:val="' + widths.length + '"/>' + hdr + '</w:tcPr>' + wpara(r.span, { b: true, sz: o.sz, align: 'left', after: 0 }) + '</w:tc></w:tr>';
      return '<w:tr>' + trPr + r.map((c, ci) => { const cc = c !== null && typeof c === 'object' ? c : { t: c };
        return '<w:tc><w:tcPr><w:tcW w:w="' + widths[ci] + '" w:type="dxa"/>' + (head ? hdr : '') + '<w:vAlign w:val="' + (head || o.rowH ? 'center' : 'top') + '"/></w:tcPr>' + wpara(cc.t, { sz: o.sz, b: head, align: cc.align || (head ? 'center' : 'both'), after: 0 }) + '</w:tc>'; }).join('') + '</w:tr>';
    }).join('') + '</w:tbl>' + wpara('', { after: 0 });
};
A.docx = { para: wpara, tbl: wtbl };
A.makeDocx = async function (filename, bodyXml, o = {}) {
  if (!A.downloads) { A.toast('這個檢視無法下載檔案。'); return; }
  try { await A.loadScript(JSZIP); } catch (_) { A.toast('Word 產生工具載入失敗，請確認網路後再試。'); return; }
  const z = new window.JSZip(), font = o.font || '標楷體', sz = (o.sz || 14) * 2;
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"', XH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  z.file('[Content_Types].xml', XH + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>');
  z.file('_rels/.rels', XH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/_rels/document.xml.rels', XH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>');
  z.file('word/styles.xml', XH + '<w:styles ' + NS + '><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="' + font + '" w:cs="Times New Roman"/><w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/><w:lang w:val="en-US" w:eastAsia="zh-TW"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>');
  const fr = t => '<w:r><w:rPr><w:sz w:val="20"/></w:rPr>' + t + '</w:r>';
  z.file('word/footer1.xml', XH + '<w:ftr ' + NS + '><w:p><w:pPr><w:jc w:val="center"/></w:pPr>' + fr('<w:fldChar w:fldCharType="begin"/>') + fr('<w:instrText xml:space="preserve"> PAGE </w:instrText>') + fr('<w:fldChar w:fldCharType="separate"/>') + fr('<w:t>1</w:t>') + fr('<w:fldChar w:fldCharType="end"/>') + '</w:p></w:ftr>');
  const land = !!o.landscape;
  z.file('word/document.xml', XH + '<w:document ' + NS + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' + bodyXml + '<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="' + (land ? 16838 : 11906) + '" w:h="' + (land ? 11906 : 16838) + '"' + (land ? ' w:orient="landscape"' : '') + '/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>');
  const blob = await z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  try { await A.downloads.save({ filename, data: blob }); } catch (e) { if (!e || e.code !== 'declined') A.toast('下載失敗：' + ((e && e.message) || '')); }
};
A.money = n => Math.round(Number(n) || 0).toLocaleString('zh-TW');

A.boot = boot;
})();
