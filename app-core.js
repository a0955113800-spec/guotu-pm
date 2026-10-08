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
A.COLLS = ['people', 'tasks', 'meetings', 'issues', 'letters', 'reviews'];
A.newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
A.byId = (coll, id) => S[coll].find(x => x.id === id);
A.person = id => S.people.find(p => p.id === id);
A.pname = id => { const p = A.person(id); return p ? p.name : ''; };
A.meId = () => { try { return localStorage.getItem('gt-me') || ''; } catch (_) { return ''; } };
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
  const done = () => { first++; if (first >= need && !S.ready) { S.ready = true; setConn('on', '即時同步'); A.schedule(); } };
  A.COLLS.forEach(c => {
    let got = false;
    db.collection(c).onSnapshot(snap => { const prev = S[c]; S[c] = snap.docs.map(d => Object.assign({ id: d.id }, d.data())); if (got) A.noteChanges(c, snap, prev); if (!got) { got = true; done(); } A.schedule(); },
      () => { setConn('off', '同步中斷'); A.toast('資料同步中斷，請重新整理頁面。'); });
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
  A.renderNav(); A.renderToday && A.renderToday();
  const v = A.$('#view');
  const keep = document.activeElement && v.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (keep) { A.pendingRender = true; return; }
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
    S.letters.forEach(l => { if (hit(l.subject) || hit(l.no)) res.push(['公文', l.subject || l.no, (l.kind || '') + ' ' + (l.no || ''), () => { A.go('docs'); }]); });
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
const COLL_LB = { tasks: '工項', meetings: '會議', issues: '議題', letters: '公文', reviews: '審查意見', people: '成員' };
const KIND = { tasks: 'task', meetings: 'meeting', issues: 'issue', letters: 'letter', reviews: 'review' };
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
    noteQ.push({ c, id, type: ch.type === 'added' ? 'added' : 'modified', name: recName(d), by: d.updatedBy, st: old && d.status && old.status !== d.status ? d.status : '' });
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
    else txt = who + ' ' + verb + lb + '「' + n.name + '」' + (n.st ? '，狀態改為「' + n.st + '」' : '');
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

A.boot = boot;
})();
