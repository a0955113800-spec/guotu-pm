/* 國土通檢專案控管：各頁面與編輯抽屜 */
(function () {
'use strict';
const A = window.APP, S = A.S, h = A.h;
const STATUS = ['未開始', '進行中', '待確認', '完成'];
const CATS = ['交付文件', '會議', '議題導讀', '文宣與紀錄', '行政', '其他'];
const MSTATUS = ['規劃中', '已排定', '已開會', '紀錄完成'];
const ISTATUS = ['未開始', '閱讀中', '摘要完成', '已導讀'];
const GROUPS = ['各界關切與永續目標', '成長管理策略', '計畫體系及引導管制', '國土功能分區劃定', '其餘個別議題'];
const COUNTIES = ['臺北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'];
const DEF_DELIV = [
  { key: 'plan', name: '工作計畫書', day: 10, copies: 5, pay: 20 },
  { key: 'mid', name: '期中報告', day: 350, copies: 10, pay: 30 },
  { key: 'final', name: '期末報告', day: 650, copies: 10, pay: 30 },
  { key: 'summary', name: '總結報告', day: 715, copies: null, pay: 20, note: '初稿；核定後 15 天交定稿 5 份＋光碟 5 片' }
];
const ic = A.icon;
const I_ARROW = '<path d="M7 17L17 7M9 7h8v8"/>', I_CLOCK = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', I_ALERT = '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.3"/>';

/* ---------- 計算 ---------- */
const today = () => A.today();
A.deliverables = () => (S.project.deliverables && S.project.deliverables.length ? S.project.deliverables : DEF_DELIV);
A.totalDays = () => S.project.totalDays || 730;
A.delivDue = d => S.project.startDate ? A.addDays(S.project.startDate, d.day - 1) : null;
A.delivStatus = d => (S.project.delivStatus && S.project.delivStatus[d.key]) || '未提送';
A.dayNo = () => S.project.startDate ? A.diff(today(), S.project.startDate) + 1 : null;
const types = () => (S.templates.types || []);
A.typeOf = id => types().find(t => t.id === id);
A.quotaTotal = () => types().reduce((a, t) => a + (Number(t.quota) || 0), 0);
const held = m => m.status === '已開會' || m.status === '紀錄完成';
A.heldCount = () => S.meetings.filter(m => held(m) && (Number((A.typeOf(m.type) || {}).quota) || 0) > 0).length;
A.prep = function (m) {
  const t = A.typeOf(m.type); const steps = (t && t.steps) || []; const td = today();
  let firstOpen = true;
  return steps.map(s => {
    const due = m.date ? A.backWorkdays(m.date, Number(s.offset) || 0) : null;
    const done = m.prep && m.prep[s.id];
    let st = 'idle';
    if (done) st = 'ok'; else if (due && due < td && !held(m)) st = 'late'; else if (firstOpen) st = 'now';
    if (!done) firstOpen = false;
    return { id: s.id, name: s.name, offset: s.offset, due, done, st };
  });
};
A.overdue = function () {
  const td = today(), out = [];
  S.tasks.forEach(t => { if (t.due && t.due < td && t.status !== '完成') out.push({ label: t.title, due: t.due, open: () => A.openDrawer('task', t.id) }); });
  S.meetings.forEach(m => { if (held(m)) return; A.prep(m).forEach(p => { if (p.st === 'late') out.push({ label: (m.title || '會議') + '：' + p.name, due: p.due, open: () => A.openDrawer('meeting', m.id) }); });
    ((m.minutes || {}).decisions || []).forEach(d => { if (d.due && d.due < td && !d.done) out.push({ label: '決議：' + d.text, due: d.due, open: () => A.openDrawer('meeting', m.id) }); }); });
  S.meetings.forEach(m => { if (!held(m)) return; ((m.minutes || {}).decisions || []).forEach(d => { if (d.due && d.due < td && !d.done && !out.some(o => o.label === '決議：' + d.text)) out.push({ label: '決議：' + d.text, due: d.due, open: () => A.openDrawer('meeting', m.id) }); }); });
  S.issues.forEach(i => { if (i.summaryDue && i.summaryDue < td && (i.status === '未開始' || i.status === '閱讀中' || !i.status)) out.push({ label: '議題 ' + i.no + ' 導讀摘要', due: i.summaryDue, open: () => A.openDrawer('issue', i.id) }); });
  return out.sort((a, b) => (a.due < b.due ? -1 : 1));
};
const lateTxt = due => { const n = A.diff(today(), due); return n > 0 ? '逾期 ' + n + ' 天' : ''; };
const leftTxt = due => { if (!due) return ''; const td = today(); if (due < td) return lateTxt(due); if (due === td) return '今天到期'; return '剩 ' + A.workdaysBetween(td, due) + ' 個工作天'; };

// 我負責、N 天內到期（含逾期）的事：工項、導讀摘要、會議決議
A.myItems = function (days) {
  const me = A.meId(); if (!me) return [];
  const lim = A.addDays(today(), days), items = [];
  S.tasks.forEach(t => { if ((t.owners || []).includes(me) && t.status !== '完成' && t.due && t.due <= lim) items.push({ t: t.title, due: t.due, kind: '工項', open: () => A.openDrawer('task', t.id) }); });
  S.issues.forEach(i => { if (i.reader === me && i.summaryDue && i.summaryDue <= lim && !['摘要完成', '已導讀'].includes(i.status)) items.push({ t: '議題 ' + i.no + ' 導讀摘要', due: i.summaryDue, kind: '導讀', open: () => A.openDrawer('issue', i.id) }); });
  (S.letters || []).forEach(l => { if (l.owner === me && l.status !== '已辦結' && l.due && l.due <= lim) items.push({ t: '公文：' + (l.subject || l.no || '未填主旨'), due: l.due, kind: '公文', open: () => A.openDrawer('letter', l.id) }); });
  S.meetings.forEach(m => ((m.minutes || {}).decisions || []).forEach(d => { if (d.owner === me && !d.done && d.due && d.due <= lim) items.push({ t: d.text, due: d.due, kind: '決議', open: () => A.openDrawer('meeting', m.id) }); }));
  return items.sort((a, b) => (a.due < b.due ? -1 : 1));
};
A.renderToday = function () {
  const box = A.$('#today'); if (!box) return; box.replaceChildren();
  const me = A.meId(); if (!me) { box.append(h('div', { class: 'empty-s' }, window.FB_EMAIL ? '到後台成員表填上你的 Google 帳號，這裡會列出你的工作。' : '在左下角選「我是誰」，這裡會列出你的工作。')); return; }
  const td = today(), items = A.myItems(7);
  if (!items.length) { box.append(h('div', { class: 'empty-s' }, '七天內沒有到期的工作。')); return; }
  items.slice(0, 6).forEach(x => box.append(h('button', { class: 'td', type: 'button', onclick: x.open }, h('i'), h('span', null, h('b', null, x.t), h('small', { class: x.due < td ? 'r' : null }, A.mdw(x.due) + (x.due < td ? '．' + lateTxt(x.due) : ''))))));
  if (items.length > 6) box.append(h('button', { class: 'td', type: 'button', onclick: () => A.brief(true) }, h('i'), h('span', null, h('small', null, '還有 ' + (items.length - 6) + ' 項．看全部'))));
};
// 登入後的今日提醒：每人每天在這台電腦跳一次；側邊欄「我的今天」旁的「提醒」可以再打開
A.brief = function (force) {
  const me = A.meId();
  if (!me) { if (force) A.toast(window.FB_EMAIL ? '請先到後台成員表填上你的 Google 帳號。' : '請先在左下角選「我是誰」。'); return; }
  if (!S.ready) return;
  const td = today(), key = 'gt-brief:' + me;
  if (!force) { try { if (localStorage.getItem(key) === td) return; } catch (_) {} }
  const mine = A.myItems(7), late = mine.filter(x => x.due < td), soon = mine.filter(x => x.due >= td);
  const lim = A.addDays(td, 7), mts = S.meetings.filter(m => m.date && m.date >= td && m.date <= lim).sort((a, b) => (a.date < b.date ? -1 : 1));
  const preps = [];
  S.meetings.forEach(m => { if (!m.date || m.date < td) return; A.prep(m).forEach(st => { if (!st.done && st.due && st.due <= A.addDays(td, 3)) preps.push({ t: st.name + '｜' + (m.title || ''), due: st.due, open: () => A.openDrawer('meeting', m.id) }); }); });
  preps.sort((a, b) => (a.due < b.due ? -1 : 1));
  if (!force && !mine.length && !mts.length && !preps.length) return;
  try { localStorage.setItem(key, td); } catch (_) {}
  const esc = e => { if (e.key === 'Escape') close(); };
  const close = () => { ov.remove(); document.removeEventListener('keydown', esc); };
  const row = (x, cls) => h('button', { type: 'button', class: 'br-i', onclick: () => { close(); x.open(); } }, h('span', { class: 'br-d' + (cls ? ' ' + cls : '') }, A.md(x.due)), h('span', { class: 'br-t' }, x.t, x.kind && x.kind !== '工項' ? h('em', null, x.kind) : ''), x.due < td ? h('small', { class: 'r' }, lateTxt(x.due)) : '');
  const sec = (title, list, cls) => list.length ? h('div', { class: 'br-s' }, h('h3', null, title, h('small', null, String(list.length))), list.map(x => row(x, cls))) : '';
  const mrow = m => h('button', { type: 'button', class: 'br-i', onclick: () => { close(); A.openDrawer('meeting', m.id); } }, h('span', { class: 'br-d' }, A.md(m.date)), h('span', { class: 'br-t' }, m.title || '會議'));
  const body = h('div', { class: 'br-b' },
    sec('已逾期', late, 'late'), sec('7 天內到期', soon), sec('會前作業（3 天內）', preps),
    mts.length ? h('div', { class: 'br-s' }, h('h3', null, '7 天內的會議', h('small', null, String(mts.length))), mts.map(mrow)) : '',
    !mine.length && !mts.length && !preps.length ? h('div', { class: 'muted', style: 'padding:18px 10px' }, '最近 7 天沒有你要處理的事。') : '');
  const head = late.length ? '有 ' + late.length + ' 項已經逾期' : mine.length ? '最近有 ' + mine.length + ' 項要處理' : '今天的提醒';
  const ov = h('div', { class: 'br-ov', onclick: e => { if (e.target === ov) close(); } },
    h('div', { class: 'br', role: 'dialog', 'aria-label': '今日提醒' },
      h('div', { class: 'br-h' }, h('small', null, A.mdw(td)), h('h2', null, (A.pname(me) ? A.pname(me) + '，' : '') + head)),
      body,
      h('div', { class: 'br-f' }, h('button', { class: 'btn sm', type: 'button', onclick: () => { close(); A.go('schedule'); } }, '看全部時程'), h('button', { class: 'btn sm pri', type: 'button', onclick: close }, '知道了'))));
  document.body.append(ov); document.addEventListener('keydown', esc);
};

/* ---------- 共用小元件 ---------- */
const card = (head, body) => h('section', { class: 'bz' }, h('div', { class: 'core' }, head, body));
const chead = (title, sub, right) => h('div', { class: 'ch' }, h('h2', null, title), sub ? h('small', null, sub) : '', right ? h('div', { class: 'r' }, right) : '');
const more = (label, fn) => h('button', { class: 'btn sm', type: 'button', onclick: fn }, label, ic(I_ARROW));
const stTag = s => h('span', { class: 'tag ' + ({ '完成': 't-good', '進行中': 't-blue', '待確認': 't-warn', '已開會': 't-ink', '紀錄完成': 't-good', '已排定': 't-teal', '摘要完成': 't-teal', '已導讀': 't-good', '閱讀中': 't-blue', '已核定': 't-good', '已提送': 't-blue', '已回應': 't-good', '已辦結': 't-good' }[s] || '') }, s || '未設定');
const emptyBox = (title, sub, btn) => h('div', { class: 'empty' }, h('b', null, title), sub, btn ? h('div', { style: 'margin-top:12px' }, btn) : '');
const editDot = key => A.editorsOf(key).length ? h('span', { class: 'edit-dot', style: 'background:var(--teal)', title: '有人正在編輯' }) : '';
const readyGate = frag => { if (!S.ready) { frag.append(emptyBox('資料載入中…', '')); return false; } return true; };

/* ---------- 總覽 ---------- */
function mapSvg() {
  const TW = window.TW; const svg = A.s('svg', { viewBox: '-40 -20 380 610', 'aria-label': '臺灣本島縣市與公聽會地點' });
  if (!TW) return svg;
  const cx = 150, cy = 290;
  const P = (attrs, style) => { const p = A.s('path', attrs); if (style) p.setAttribute('style', style); svg.append(p); };
  [1.16, 1.10, 1.05].forEach((k, i) => P({ d: TW.outline, transform: `translate(${cx} ${cy}) scale(${k}) translate(${-cx} ${-cy})`, fill: 'none', 'stroke-width': 1.1, 'stroke-dasharray': '3 4' }, 'stroke:var(--teal);stroke-opacity:' + (0.12 + i * .06)));
  TW.counties.forEach(c => P({ d: c.d, 'stroke-width': .7, 'stroke-linejoin': 'round' }, 'fill:var(--panel);stroke:var(--hair-2)'));
  [0.84, 0.68, 0.52, 0.36, 0.2].forEach((k, i) => P({ d: TW.outline, transform: `translate(${cx} ${cy + 20}) scale(${k}) translate(${-cx} ${-(cy + 20)})`, fill: 'none', 'stroke-width': 1 }, 'stroke:var(--teal);stroke-opacity:' + (0.28 + i * .08)));
  P({ d: TW.outline, fill: 'none', 'stroke-width': 1.2 }, 'stroke:var(--ink);stroke-opacity:.5');
  const pos = {}; TW.counties.forEach(c => pos[c.n] = c.c);
  const used = {};
  S.meetings.filter(m => /公聽/.test((A.typeOf(m.type) || {}).name || '') && m.county && pos[m.county]).forEach(m => {
    const k = used[m.county] = (used[m.county] || 0) + 1; let [x, y] = pos[m.county]; y += (k - 1) * 18;
    const st = held(m) ? 'd' : (m.status === '已排定' ? 's' : 'p');
    if (st === 's') { const r = A.s('circle', { cx: x, cy: y, r: 14 }); r.setAttribute('style', 'fill:var(--teal);fill-opacity:.2'); svg.append(r); }
    const c = A.s('circle', { cx: x, cy: y, r: st === 'p' ? 5.5 : 6.5, 'stroke-width': st === 'p' ? 1.8 : 2.5 });
    c.setAttribute('style', st === 'd' ? 'fill:var(--ink);stroke:var(--panel)' : st === 's' ? 'fill:var(--teal);stroke:var(--panel)' : 'fill:var(--panel);stroke:var(--ink-2)');
    svg.append(c);
    const left = x > 150; const lab = m.county.replace(/[市縣]$/, '');
    [true, false].forEach(bg => { const t = A.s('text', { x: left ? x - 14 : x + 14, y: y + 5.5, 'text-anchor': left ? 'end' : 'start', 'font-size': 17, 'font-family': 'Noto Sans TC' }); t.textContent = lab;
      t.setAttribute('style', bg ? 'fill:none;stroke:var(--side);stroke-width:4;stroke-linejoin:round' : 'fill:var(--ink);font-weight:' + (st === 'p' ? 400 : 600)); svg.append(t); });
  });
  return svg;
}
function ruler() {
  const start = S.project.startDate, total = A.totalDays(), dn = A.dayNo();
  const dv = A.deliverables(), lowAt = dv.map((d, i) => i < dv.length - 1 && (dv[i + 1].day - d.day) / total < .15);
  const rz = h('div', { class: 'rz' + (lowAt.some(Boolean) ? ' two' : '') });
  const ticks = h('div', { class: 'ticks' }); for (let d = 0; d <= total; d += 10) ticks.append(h('i', { class: d % 30 === 0 ? 'm' : null })); rz.append(ticks, h('div', { class: 'base' }));
  if (dn) rz.append(h('div', { class: 'past', style: 'width:' + Math.min(100, Math.max(0, dn / total * 100)) + '%' }));
  const months = h('div', { class: 'months' });
  if (start) for (let k = 0; k * 91.25 <= total; k++) { const dd = A.addDays(start, Math.round(k * 91.25)); const pct = k * 91.25 / total * 100; const d = A.parse(dd); months.append(h('span', { style: 'left:' + pct + '%;' + (k === 0 ? 'transform:none' : pct > 97 ? 'transform:translateX(-100%)' : '') }, (d.getFullYear() - 1911) + '.' + String(d.getMonth() + 1).padStart(2, '0'))); }
  rz.append(months);
  A.deliverables().forEach((d, i, arr) => {
    const pct = (d.day - 1) / total * 100; const right = pct > 80; const low = lowAt[i];
    const st = A.delivStatus(d);
    rz.append(h('div', { class: 'flag' + (st === '已核定' ? ' done' : '') + (right ? ' r' : '') + (low ? ' low' : ''), style: 'left:' + pct + '%' }, h('div', { class: 'stem' }), h('div', { class: 'pt' }),
      h('div', { class: 'lb' }, h('b', null, d.name, st === '已核定' ? h('span', { class: 'tag t-good', style: 'margin-left:6px;font-size:10.5px;padding:0 6px' }, '已核定') : ''), h('small', null, 'D' + d.day + (d.copies ? '．' + d.copies + ' 份' : '')))));
  });
  if (dn && dn >= 1 && dn <= total) rz.append(h('div', { class: 'pin', style: 'left:' + (dn / total * 100) + '%' }, '今天．D' + dn));
  const pay = h('div', { class: 'pay' }, A.deliverables().map((d, i) => h('div', { class: ({ '已核撥': 'ok', '已送件': 'sent' })[((S.project.pays || {})[d.key] || {}).status] || null, title: ((S.project.pays || {})[d.key] || {}).status || '未請款', style: 'flex-grow:' + (d.pay || 20) }, '第 ' + (i + 1) + ' 期．' + d.name.replace(/報告$/, ''), h('b', null, (d.pay || 0) + '%'))));
  return h('div', { class: 'ruler' }, rz, pay);
}
function prepStrip(m) {
  const steps = A.prep(m); const td = today();
  if (!m.date || !steps.length) return h('p', { class: 'cap' }, m.date ? '這類會議還沒設定會前步驟，可到後台的「會議類型」設定。' : '還沒排定開會日期。');
  const first = steps.reduce((a, s) => (s.due && s.due < a ? s.due : a), m.date);
  let from = A.addDays(first < td ? first : td, 0); if (A.diff(m.date, from) > 20) from = A.addDays(m.date, -20);
  const H = A.holidaySet(); const days = h('div', { class: 'days' });
  for (let d = from; d <= m.date; d = A.addDays(d, 1)) {
    const off = A.isOff(d, H); const evs = steps.filter(s => s.due === d);
    const cell = h('div', { class: 'dy' + (off ? ' off' : '') + (d === td ? ' today' : '') }, h('span', { class: 'w' }, d === td ? '今天' : A.wd(d)), h('span', { class: 'dn' }, A.md(d)),
      h('span', { class: 'di' }, off ? (H[d] || '') : d === m.date ? 'D0' : (() => { const n = A.workdaysBetween(d, m.date); return 'D-' + n; })()));
    if (d === m.date) cell.append(h('span', { class: 'ev mt' }, '開會'));
    else if (evs.length) cell.append(h('span', { class: 'ev ' + evs[0].st, title: evs.map(e => e.name).join('、') }, evs[0].name.replace(/^給|審閱$/g, '')));
    days.append(cell);
  }
  return h('div', null, h('div', { class: 'steps' }, steps.map(s => h('span', { class: s.st }, s.name + (s.due ? ' ' + A.md(s.due) : '')))), days,
    h('p', { class: 'cap' }, '算工作天、從開會日往前推；週末與國定假日自動跳過。'));
}
function meetingMatrix() {
  const box = h('div', { class: 'mx' });
  const ts = types().filter(t => Number(t.quota) > 0);
  if (!ts.length) { box.append(h('p', { class: 'cap' }, '後台還沒設定會議類型與應辦場次。')); return box; }
  ts.forEach(t => {
    const ms = S.meetings.filter(m => m.type === t.id); const d = ms.filter(held).length, s = ms.filter(m => !held(m) && m.status === '已排定').length;
    const sq = h('div', { class: 'sq' }); for (let i = 0; i < Math.max(Number(t.quota), d + s); i++) sq.append(h('i', { class: i < d ? 'd' : i < d + s ? 's' : null }));
    box.append(h('div', { class: 'mr' }, h('span', { class: 'nm' }, t.name), sq, h('span', { class: 'c' }, h('b', null, d), '/' + t.quota)));
  });
  box.append(h('div', { class: 'leg' }, h('span', null, h('i', { style: 'background:var(--ink)' }), '已開'), h('span', null, h('i', { style: 'box-shadow:inset 0 0 0 1.8px var(--teal)' }), '已排定'), h('span', null, h('i', { style: 'background:var(--dot)' }), '未排')));
  return box;
}
A.allocation = function () {
  const readers = S.people.filter(p => Number(p.share) > 0);
  return readers.map(p => { const iss = S.issues.filter(i => i.reader === p.id).sort((a, b) => a.no - b.no); const pages = iss.reduce((a, i) => a + pagesOf(i), 0); const read = iss.reduce((a, i) => a + Math.min(Number(i.readPages) || 0, pagesOf(i)), 0); return { p, iss, pages, read }; });
};
const pagesOf = i => (i.pages && i.pages[1] && i.pages[0]) ? (i.pages[1] - i.pages[0] + 1) : 0;
function readingStrip() {
  const al = A.allocation().filter(x => x.pages > 0);
  if (!al.length) return h('p', { class: 'cap' }, '還沒分配導讀人。到「議題」頁可以依頁數自動平均分配。');
  const strip = h('div', { class: 'strip' });
  al.forEach(({ p, iss, pages, read }) => {
    const bar = h('div', { class: 'bar' }, h('div', { class: 'fill', style: 'width:' + (pages ? read / pages * 100 : 0) + '%' }));
    const lb = h('div', { class: 'lbls' });
    iss.forEach(i => { bar.append(h('div', { class: 'sg', style: 'flex:' + pagesOf(i) })); lb.append(h('span', { style: 'flex:' + pagesOf(i) }, i.no)); });
    strip.append(h('div', { class: 'blk', style: 'flex:' + pages }, h('div', { class: 'bh' }, A.avatar(p.id, 22), h('small', null, read + '/' + pages), Number(p.share) < 1 ? h('em', null, '半份') : ''), bar, lb));
  });
  return strip;
}
A.pages = {};
A.pages.overview = function (frag) {
  if (!readyGate(frag)) return;
  const start = S.project.startDate, td = today(), dn = A.dayNo();
  const dl = A.deliverables(); const next = dl.find(d => A.delivStatus(d) !== '已核定');
  const weekEnd = A.addDays(td, 6);
  const weekMeet = S.meetings.filter(m => m.date && m.date >= td && m.date <= weekEnd).length;
  const late = A.overdue();
  const hl = h('div', { class: 'hl' }, h('div', { class: 'eyebrow' }, '全國國土計畫通盤檢討法定作業　115A-044'));
  if (!start) {
    hl.append(h('h1', null, '專案尚未起算'), h('div', { class: 'setup' }, '請管理者到「後台」填入履約起算日，系統會自動算出四期交付日期、倒數天數與時程尺規。',
      S.isAdmin ? h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn sm', type: 'button', onclick: () => A.go('admin') }, '前往後台設定')) : ''));
  } else if (next) {
    const due = A.delivDue(next); const left = A.diff(due, td);
    hl.append(h('h1', null, left >= 0 ? '距離' + next.name : next.name + '已逾期'), h('div', { class: 'count' }, h('span', { class: 'n' }, Math.abs(left)), h('span', { class: 'u' }, '天'),
      h('span', { class: 'meta' }, '第 ' + next.day + ' 天．' + A.roc(due) + (next.copies ? '．交 ' + next.copies + ' 份' : ''), h('br'), '核定後請第 ' + (dl.indexOf(next) + 1) + ' 期款 ' + (next.pay || 0) + '%')));
  } else hl.append(h('h1', null, '四期交付皆已核定'));
  if (start) hl.append(h('p', { class: 'lede' }, '履約第 ' + Math.max(0, dn) + ' 天，共 ' + A.totalDays() + ' 天。未來 7 天有 ' + weekMeet + ' 場會議' + (late.length ? '，' : '。'), late.length ? h('em', null, late.length + ' 項工作逾期') : '', late.length ? '。' : ''), ruler());
  const pub = S.meetings.filter(m => /公聽/.test((A.typeOf(m.type) || {}).name || ''));
  const pq = (types().find(t => /公聽/.test(t.name)) || {}).quota || 0;
  const hm = h('div', { class: 'hm' }, h('div', { class: 'leg2' }, h('b', null, '公聽會 ' + (pq || pub.length) + ' 場'),
    h('span', null, h('i', { class: 'd' }), '已辦 ' + pub.filter(held).length), h('span', null, h('i', { class: 's' }), '已排定 ' + pub.filter(m => !held(m) && m.status === '已排定').length),
    h('span', null, h('i'), '規劃中 ' + pub.filter(m => m.status === '規劃中' || !m.status).length), pub.some(m => !m.county) ? h('small', null, '有 ' + pub.filter(m => !m.county).length + ' 場還沒填縣市') : ''), mapSvg());
  const tDone = S.tasks.filter(t => t.status === '完成').length;
  const wk = S.tasks.filter(t => t.status !== '完成' && t.due && t.due >= td && t.due <= weekEnd).length;
  const revOpen = S.reviews.filter(r => r.status !== '已回應').length;
  const hk = h('div', { class: 'hk' },
    h('button', { class: 'hi', type: 'button', onclick: () => A.go('schedule') }, h('span', { class: 'l' }, '工項完成'), h('b', null, tDone, h('small', null, '/' + S.tasks.length)), h('span', { class: 'tag t-teal' }, S.tasks.length ? Math.round(tDone / S.tasks.length * 100) + '%' : '尚無工項')),
    h('button', { class: 'hi', type: 'button', onclick: () => A.go('schedule') }, h('span', { class: 'l' }, '7 天內到期'), h('b', null, wk, h('small', null, ' 項')), h('span', { class: 'tag t-warn' }, '至 ' + A.md(weekEnd))),
    h('button', { class: 'hi', type: 'button', onclick: () => late[0] && late[0].open() }, h('span', { class: 'l' }, '逾期'), h('b', { class: late.length ? 'r' : null }, late.length, h('small', null, ' 項')), late.length ? h('span', { class: 'tag t-bad' }, late[0].label.slice(0, 10)) : h('span', { class: 'tag t-good' }, '沒有逾期')),
    h('button', { class: 'hi', type: 'button', onclick: () => { S.docTab = 'reviews'; A.go('docs'); } }, h('span', { class: 'l' }, '待回應審查意見'), h('b', null, revOpen, h('small', null, '/' + S.reviews.length)), h('span', { class: 'tag ' + (revOpen ? 't-warn' : 't-good') }, S.reviews.length ? '已回應 ' + Math.round((S.reviews.length - revOpen) / S.reviews.length * 100) + '%' : '尚無意見')));
  frag.append(h('section', { class: 'hc' }, hl, hm, hk));

  // 會前作業＋會議場次
  const upcoming = S.meetings.filter(m => m.date && m.date >= td && !held(m)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const nm = upcoming.find(m => A.prep(m).length) || upcoming[0];
  const prepBody = h('div');
  if (nm) {
    const steps = A.prep(nm); const cur = steps.find(s => s.st === 'now' || s.st === 'late');
    prepBody.append(h('div', { class: 'pad', style: 'padding-bottom:6px' },
      h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, h('b', { style: 'font-weight:500;font-size:15.5px' }, nm.title || '會議'), h('small', { class: 'muted' }, A.mdw(nm.date) + (nm.place ? '．' + nm.place : '') + ((nm.issues || []).length ? '．議題 ' + nm.issues.join('、') : '')),
        cur ? h('span', { class: 'tag ' + (cur.st === 'late' ? 't-bad' : 't-warn'), style: 'margin-left:auto' }, ic(cur.st === 'late' ? I_ALERT : I_CLOCK), cur.name + '．' + leftTxt(cur.due)) : h('span', { class: 'tag t-good', style: 'margin-left:auto' }, '會前作業都完成了')),
      prepStrip(nm)));
    upcoming.filter(m => m !== nm).slice(0, 3).forEach(m => { const c = A.prep(m).find(s => s.st === 'now' || s.st === 'late');
      prepBody.append(h('button', { class: 'rowx', type: 'button', onclick: () => A.openDrawer('meeting', m.id) }, h('span', { class: 'dd' }, A.md(m.date) + ' ' + A.wd(m.date)), h('b', null, m.title || '會議', h('small', null, ((A.typeOf(m.type) || {}).name || ''))),
        c ? h('span', { class: 'tag ' + (c.st === 'late' ? 't-bad' : 't-blue') }, c.name + ' ' + A.md(c.due)) : h('span', { class: 'tag' }, m.status || '規劃中'))); });
  } else prepBody.append(emptyBox('近期沒有排定的會議', '到「會議」頁新增會議並填開會日期，這裡會自動倒推會前作業。', S.canWrite ? h('button', { class: 'btn sm', type: 'button', onclick: A.newMeeting }, '新增會議') : null));
  const risky = S.meetings.filter(m => m.date && m.date >= td && !held(m)).map(m => [m, A.meetRisks(m)]).filter(x => x[1].length).sort((a, b) => (a[0].date < b[0].date ? -1 : 1));
  if (risky.length) frag.append(card(chead('時程風險', '會前作業來不及、會議太近、撞假日或超過最晚召開日', more('全部會議', () => A.go('meetings'))), h('div', { style: 'margin-top:8px' }, risky.map(([m, rs]) => h('button', { class: 'rowx', type: 'button', onclick: () => A.openDrawer('meeting', m.id) }, h('span', { class: 'dd' }, A.md(m.date) + ' ' + A.wd(m.date)), h('span', { style: 'min-width:0' }, h('b', null, m.title || '會議'), riskList(rs)), riskTag(rs))))));
  frag.append(h('div', { class: 'grid2' },
    card(chead('會前作業', '依開會日倒推', more('全部會議', () => A.go('meetings'))), prepBody),
    card(chead('會議場次', null, h('span', { class: 'big' }, A.heldCount(), h('small', null, ' / ' + A.quotaTotal()))), meetingMatrix())));

  // 議題導讀＋最近會議紀錄
  const al = A.allocation(); const totP = S.issues.reduce((a, i) => a + pagesOf(i), 0); const readP = al.reduce((a, x) => a + x.read, 0);
  const sess = S.meetings.filter(m => m.date && m.date >= td && /導讀|組內/.test(((A.typeOf(m.type) || {}).name || '') + (m.title || ''))).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const due = S.issues.filter(i => i.summaryDue && !['摘要完成', '已導讀'].includes(i.status)).sort((a, b) => (a.summaryDue < b.summaryDue ? -1 : 1));
  const c4 = h('div', { class: 'cards4' });
  c4.append(h('button', { type: 'button', onclick: () => sess ? A.openDrawer('meeting', sess.id) : A.go('meetings') }, h('span', { class: 'k2' }, '下一場導讀'), h('b', null, sess ? A.mdw(sess.date) + ' ' + (sess.title || '') : '尚未排定'), h('small', null, sess && (sess.issues || []).length ? '議題 ' + sess.issues.join('、') : '')));
  due.slice(0, 3).forEach(i => { const lt = i.summaryDue < td; c4.append(h('button', { type: 'button', onclick: () => A.openDrawer('issue', i.id) }, h('span', { class: 'k2' }, lt ? '逾期' : '摘要待交'), h('b', { class: lt ? 'r' : null }, '議題 ' + i.no), h('small', null, (A.pname(i.reader) || '未指派') + '．' + (lt ? lateTxt(i.summaryDue) : A.md(i.summaryDue))))); });
  const recs = S.meetings.filter(m => m.minutes && (m.minutes.summary || (m.minutes.decisions || []).length || (m.minutes.files || []).length)).sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1)).slice(0, 3);
  const recBox = h('div', { class: 'pad' });
  if (!recs.length) recBox.append(emptyBox('還沒有會議紀錄', '開完會後在會議裡上傳紀錄、寫重點與決議，就會出現在這裡。'));
  recs.forEach(m => { const mi = m.minutes; const decs = mi.decisions || [];
    recBox.append(h('button', { class: 'ms', type: 'button', onclick: () => A.openDrawer('meeting', m.id) }, h('div', { class: 'nd' }), h('div', null, h('div', { class: 'h' }, h('b', null, m.title || '會議'), h('small', null, A.md(m.date))),
      h('p', null, (decs.length ? '決議 ' + decs.length + ' 項，已辦結 ' + decs.filter(d => d.done).length + ' 項。' : '') + (mi.summary ? mi.summary.slice(0, 40) : '')),
      h('div', { class: 'tg' }, (m.issues || []).slice(0, 4).map(n => h('span', null, '議題 ' + n)), (mi.files || []).length ? h('span', { style: 'background:none;color:var(--blue-ink);font-weight:500' }, (mi.files || []).length + ' 個檔案') : '')))); });
  recBox.append(h('button', { class: 'drop', type: 'button', style: 'all:unset;cursor:pointer;display:block;box-sizing:border-box;width:100%', onclick: () => A.go('meetings') }, h('div', { class: 'drop' }, '到「會議」打開那一場，', h('b', null, '上傳紀錄、寫決議'), '，之後可依議題查歷次討論')));
  frag.append(h('div', { class: 'grid2' },
    card(chead('議題導讀', '成大總結報告 ' + totP + ' 頁．寬度＝頁數', h('span', { class: 'big' }, readP, h('small', null, ' / ' + totP + ' 頁'))), h('div', { class: 'pad' }, readingStrip(), c4)),
    card(chead('會議紀錄', '依議題串起歷次討論', more('搜尋', A.openSearch)), recBox)));
};

/* ---------- 時程 ---------- */
S.schedView = 'list';
try { S.schedView = localStorage.getItem('gt-sv') || 'list'; } catch (_) {}
S.f = { owner: '', status: 'open', q: '' };
function filteredTasks() {
  const f = S.f; return S.tasks.filter(t => (!f.owner || (t.owners || []).includes(f.owner)) && (f.status === 'all' || (f.status === 'open' ? t.status !== '完成' : t.status === f.status)) && (!f.q || (t.title || '').includes(f.q) || (t.note || '').includes(f.q)));
}
A.pages.schedule = function (frag) {
  frag.append(h('div', { class: 'page-h' }, h('div', null, h('h1', null, '時程'), h('p', null, '所有工項集中在這裡，同一份資料可以切換清單、看板、甘特圖。')),
    h('div', { class: 'act' }, h('button', { class: 'btn', type: 'button', onclick: exportTasks }, '匯出 Excel'), S.canWrite ? h('button', { class: 'btn', type: 'button', onclick: () => A.newTask() }, '新增工項') : '')));
  if (!readyGate(frag)) return;
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': '檢視方式' }, [['list', '清單'], ['board', '看板'], ['gantt', '甘特圖']].map(([k, t]) => h('button', { type: 'button', 'aria-pressed': String(S.schedView === k), onclick: () => { S.schedView = k; try { localStorage.setItem('gt-sv', k); } catch (_) {} A.render(); } }, t)));
  const q = h('input', { class: 'in sm', placeholder: '搜尋工項', value: S.f.q, id: 'task-q', style: 'width:180px' }); q.addEventListener('change', () => { S.f.q = q.value.trim(); A.render(); });
  const tb = h('div', { class: 'toolbar' }, seg, A.sel(S.f.owner, A.peopleOpts('全部負責人'), v => { S.f.owner = v; A.render(); }, { sm: true, id: 'f-owner' }),
    A.sel(S.f.status, [['open', '未完成'], ['all', '全部狀態'], ...STATUS.map(s => [s, s])], v => { S.f.status = v; A.render(); }, { sm: true, id: 'f-status' }), q);
  tb.querySelectorAll('select').forEach(s => s.disabled = false);
  const ts = filteredTasks();
  let body;
  if (!S.tasks.length) body = emptyBox('還沒有工項', '從右上角「新增」或這頁的「新增工項」開始；會議決議也可以一鍵轉成工項。', S.canWrite ? h('button', { class: 'btn sm', type: 'button', onclick: () => A.newTask() }, '新增工項') : null);
  else if (S.schedView === 'board') body = boardView();
  else if (S.schedView === 'gantt') body = ganttView(ts);
  else body = listView(ts);
  frag.append(tb, card(h('div'), body));
};
function listView(ts) {
  const td = today(); const tb = h('tbody');
  CATS.forEach(c => { const rows = ts.filter(t => (t.cat || '其他') === c).sort((a, b) => ((a.due || '9') < (b.due || '9') ? -1 : 1)); if (!rows.length) return;
    tb.append(h('tr', { class: 'grp' }, h('td', { colspan: 6 }, c + '　' + rows.length)));
    rows.forEach(t => { const late = t.due && t.due < td && t.status !== '完成';
      const chk = h('button', { class: 'chk' + (t.status === '完成' ? ' on' : ''), type: 'button', 'aria-label': '標記完成', onclick: e => { e.stopPropagation(); if (S.canWrite) A.patch('tasks', t.id, { status: t.status === '完成' ? '進行中' : '完成' }); } });
      tb.append(h('tr', { class: 'click', onclick: () => A.openDrawer('task', t.id) }, h('td', { style: 'width:44px' }, chk),
        h('td', null, h('span', { class: t.status === '完成' ? 'done-t' : null }, t.title), t.crit ? h('span', { class: 'tag t-bad', style: 'margin-left:8px' }, '關鍵') : '', t.status !== '完成' && A.depRisk(t).length ? h('span', { class: 'tag t-warn', style: 'margin-left:8px', title: '前置延誤：' + A.depRisk(t).join('、') }, '前置延誤') : '', editDot('task:' + t.id),
          (t.deps || []).length ? h('small', { class: 'deps' }, '前置：' + t.deps.map(d => (A.byId('tasks', d) || {}).title).filter(Boolean).join('、')) : ''),
        h('td', null, h('div', { style: 'display:flex;gap:4px' }, (t.owners || []).map(o => A.avatar(o, 26)))),
        h('td', { class: 'num', style: 'white-space:nowrap' }, (t.start ? A.md(t.start) + ' – ' : '') + A.md(t.due)),
        h('td', null, stTag(t.status)), h('td', { style: 'white-space:nowrap' }, late ? h('span', { class: 'tag t-bad' }, lateTxt(t.due)) : '')));
    });
  });
  if (!tb.children.length) return emptyBox('沒有符合條件的工項', '調整上面的篩選條件看看。');
  return h('div', { class: 'tbl' }, h('table', null, h('thead', null, h('tr', null, h('th'), h('th', null, '工項'), h('th', null, '負責'), h('th', null, '期程'), h('th', null, '狀態'), h('th'))), tb));
}
function boardView() {
  // 看板的欄位就是狀態，所以不套「狀態」篩選，只套負責人與關鍵字
  const f = S.f, ts = S.tasks.filter(t => (!f.owner || (t.owners || []).includes(f.owner)) && (!f.q || (t.title || '').includes(f.q) || (t.note || '').includes(f.q)));
  const kb = h('div', { class: 'kb' });
  STATUS.forEach(s => {
    const col = h('div', { class: 'col', 'data-st': s });
    const items = ts.filter(t => (t.status || '未開始') === s).sort((a, b) => ((a.due || '9') < (b.due || '9') ? -1 : 1));
    col.append(h('h3', null, s, h('small', null, items.length)));
    items.forEach(t => {
      const c = h('button', { class: 'kc', type: 'button', 'data-id': t.id }, h('b', null, t.title, editDot('task:' + t.id)),
        h('div', { class: 'meta2' }, (t.owners || []).map(o => A.avatar(o, 22)), t.due ? h('span', { class: t.due < today() && s !== '完成' ? 'tag t-bad' : 'tag' }, A.md(t.due)) : '', h('span', null, t.cat || '')));
      c.addEventListener('click', () => { if (c.dataset.dragged) { delete c.dataset.dragged; return; } A.openDrawer('task', t.id); });
      if (S.canWrite) kbDrag(c, t);
      col.append(c);
    });
    if (!items.length) col.append(h('div', { class: 'kb-empty' }, S.canWrite ? '把卡片拖到這裡' : '沒有工項'));
    kb.append(col);
  });
  return h('div', null, S.canWrite ? h('p', { class: 'kb-tip' }, '按住卡片拖到其他欄，放開就會更新狀態；點一下打開詳細內容。') : '', kb);
}
// 用滑鼠拖曳卡片（不靠瀏覽器內建拖放，避免重繪時中斷）；手機請點開卡片改狀態
function kbDrag(card, t) {
  card.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const sx = e.clientX, sy = e.clientY; let ghost = null, over = null, ox = 0, oy = 0;
    const move = ev => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        const r = card.getBoundingClientRect(); ox = sx - r.left; oy = sy - r.top;
        ghost = card.cloneNode(true); ghost.classList.add('kc-ghost'); ghost.style.width = r.width + 'px'; document.body.append(ghost);
        card.classList.add('kc-src'); S.dragging = true; document.body.classList.add('kb-dragging');
      }
      ev.preventDefault();
      ghost.style.transform = 'translate(' + (ev.clientX - ox) + 'px,' + (ev.clientY - oy) + 'px) rotate(1.5deg)';
      const el = document.elementFromPoint(ev.clientX, ev.clientY), col = el && el.closest('.kb .col');
      if (col !== over) { if (over) over.classList.remove('over'); over = col; if (over) over.classList.add('over'); }
      if (ev.clientY < 70) window.scrollBy(0, -14); else if (ev.clientY > innerHeight - 70) window.scrollBy(0, 14);
    };
    const end = ev => {
      const dragged = !!ghost, target = over;
      removeEventListener('pointermove', move); removeEventListener('pointerup', end); removeEventListener('pointercancel', end);
      if (ghost) ghost.remove(); if (over) over.classList.remove('over'); card.classList.remove('kc-src'); document.body.classList.remove('kb-dragging'); S.dragging = false;
      if (!dragged) return;
      card.dataset.dragged = '1'; setTimeout(() => { delete card.dataset.dragged; }, 50);
      const st = target && target.dataset.st;
      if (ev.type === 'pointerup' && st && st !== (t.status || '未開始')) { A.patch('tasks', t.id, { status: st }); t.status = st; }
      if (A.pendingRender) A.pendingRender = false;
      A.render();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', end); addEventListener('pointercancel', end);
  });
}
const GX_WD = '日一二三四五六';
function gxPref(k, d) { try { return localStorage.getItem(k) || d; } catch (_) { return d; } }
function gxSave(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
S.gZoom = gxPref('gt-gz', 'week'); S.gLinks = gxPref('gt-gl', '1') === '1'; S.gCrit = gxPref('gt-gc', '0') === '1'; S.gOwn = gxPref('gt-go', '1') === '1';
S.gFold = new Set(gxPref('gt-gf', '').split('|').filter(Boolean));
// 依工項名稱長度估工項欄寬：讓大部分名稱一行放得下，太長的折成兩行
function gxAutoLW(ts) {
  const c = gxAutoLW.c || (gxAutoLW.c = document.createElement('canvas').getContext('2d')); c.font = '13px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  const ws = ts.filter(t => t.due || t.start).map(t => c.measureText((t.title || '') + (t.crit ? '　關鍵' : '')).width).sort((a, b) => a - b);
  if (!ws.length) return 260; const p = ws[Math.floor(ws.length * 0.85)] || ws[ws.length - 1];
  return Math.round(Math.max(260, Math.min(400, p + 22 + 8 + 7 + 14)));
}
function ganttView(ts) {
  const td = today(), mob = window.innerWidth < 700, zoom = S.gZoom;
  const LW = mob ? 150 : (Number(gxPref('gt-lw', '0')) || gxAutoLW(ts));
  let DW = zoom === 'day' ? (mob ? 22 : 26) : zoom === 'week' ? (mob ? 7 : 9) : (mob ? 3 : 3.4);
  const dated = ts.filter(t => (t.due || t.start) && (!S.gCrit || t.crit)), und = ts.filter(t => !(t.due || t.start)).length;
  const chk = (k, key, label) => { const c = h('input', { type: 'checkbox' }); c.checked = S[k]; c.addEventListener('change', () => { c.blur(); S[k] = c.checked; gxSave(key, c.checked ? '1' : '0'); A.render(); }); return h('label', { class: 'gx-chk' }, c, label); };
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': '時間縮放' }, [['day', '日'], ['week', '週'], ['month', '月']].map(([k, t]) => h('button', { type: 'button', 'aria-pressed': String(zoom === k), onclick: () => { S.gZoom = k; S.gScroll = null; gxSave('gt-gz', k); A.render(); } }, t)));
  const own = h('input', { type: 'checkbox' }); own.checked = S.gOwn; own.addEventListener('change', () => { own.blur(); S.gOwn = own.checked; gxSave('gt-go', own.checked ? '1' : '0'); A.render(); });
  const box = h('div', { class: 'gx-box' });
  const toToday = () => { const t = box.querySelector('.gx-line.today'); if (t) box.scrollLeft = Math.max(0, parseFloat(t.style.left) - LW - (box.clientWidth - LW) / 3); };
  const sub = h('span', { class: 'gx-sub' });
  const top = h('div', { class: 'gx-top' }, h('div', null, h('b', null, '時程甘特圖'), sub), h('div', { class: 'gx-ctl' }, seg, h('button', { class: 'btn sm', type: 'button', onclick: toToday }, '定位到今天'), h('label', { class: 'gx-chk' }, own, '顯示負責人'), chk('gLinks', 'gt-gl', '顯示相依連線'), chk('gCrit', 'gt-gc', '只看關鍵工項'),
    h('button', { class: 'btn sm', type: 'button', onclick: () => A.ganttExport('pdf') }, '匯出 PDF'), h('button', { class: 'btn sm', type: 'button', onclick: () => A.ganttExport('print') }, '列印')));
  const lg = h('div', { class: 'gx-lg' }, h('span', null, h('i', { class: 'sw st-未開始' }), '未開始'), h('span', null, h('i', { class: 'sw' }), '進行中'), h('span', null, h('i', { class: 'sw st-待確認' }), '待確認'), h('span', null, h('i', { class: 'sw done' }), '完成'), h('i', { class: 'sep' }),
    h('span', null, h('i', { class: 'sw late' }), '已逾期'), h('span', null, h('i', { class: 'sw crit' }), '關鍵'), h('span', null, h('i', { class: 'tdl' }), '今天'), h('span', null, h('i', { class: 'msl' }), '契約交付期限'), h('span', null, h('i', { class: 'lnk' }), '前置 → 後續'), h('span', null, '⚠ 前置延誤'));
  const wrap = h('div', { class: 'gx' }, top, lg, box);
  if (!dated.length) { box.append(emptyBox('沒有填日期的工項', '在工項裡填上開始與期限，就會出現在甘特圖上。')); return wrap; }
  let min = td, max = td;
  dated.forEach(t => { const s = t.start || t.due, e = t.due || t.start; if (s < min) min = s; if (e > max) max = e; if (s > max) max = s; });
  if (zoom === 'day') { min = A.addDays(min, -2); max = A.addDays(max, 2); }
  else if (zoom === 'week') { min = A.addDays(min, -((A.parse(min).getDay() + 6) % 7)); max = A.addDays(max, 6 - ((A.parse(max).getDay() + 6) % 7)); }
  else { min = min.slice(0, 8) + '01'; max = A.addDays(A.addDays(max.slice(0, 8) + '01', 32).slice(0, 8) + '01', -1); }
  const days = A.diff(max, min) + 1;
  const vw = (document.getElementById('view') || {}).clientWidth || 1000, avail = vw - 46 - LW;
  if (avail > 0 && days * DW < avail) DW = avail / days;
  const W = Math.floor(days * DW), x = d => A.diff(d, min) * DW;
  sub.textContent = A.md(min) + ' – ' + A.md(max) + (und ? '．' + und + ' 項未排日期（未顯示）' : '');
  const dates = [], grid = [], off = [];
  for (let i = 0; i < days; i++) { const d = A.addDays(min, i), dt = A.parse(d); dates.push(d);
    if (zoom !== 'month' && A.isOff(d)) off.push(`transparent ${i * DW}px,var(--gx-off) ${i * DW}px,var(--gx-off) ${(i + 1) * DW}px,transparent ${(i + 1) * DW}px`);
    if ((zoom !== 'month' && dt.getDay() === 1) || (zoom === 'month' && dt.getDate() === 1)) grid.push(`transparent ${i * DW}px,var(--gx-gl) ${i * DW}px,var(--gx-gl) ${i * DW + 1}px,transparent ${i * DW + 1}px`); }
  const layers = []; if (grid.length) layers.push(`linear-gradient(to right,${grid.join(',')})`); if (zoom === 'day') layers.push(`repeating-linear-gradient(to right,transparent 0 ${DW - 1}px,var(--gx-gl2) ${DW - 1}px ${DW}px)`); if (off.length) layers.push(`linear-gradient(to right,${off.join(',')})`);
  const bg = layers.join(',');
  const inner = h('div', { class: 'gx-in', style: 'width:' + (LW + W) + 'px;--lw:' + LW + 'px' });
  const mon = h('div', { class: 'gx-mon' }), dn = h('div', { class: 'gx-dn' });
  let cur = '', sp = null, cnt = 0;
  dates.forEach(d => { const m = d.slice(0, 7); if (m !== cur) { if (sp) sp.style.width = cnt * DW + 'px'; cur = m; cnt = 0; const y = +d.slice(0, 4), mm = +d.slice(5, 7); sp = h('div', null, zoom === 'month' && DW * 31 < 70 ? mm + '月' : (y - 1911) + ' 年 ' + mm + ' 月'); mon.append(sp); } cnt++; });
  if (sp) sp.style.width = cnt * DW + 'px';
  const dls = S.project.startDate ? A.deliverables().map(v => ({ n: v.name, d: A.delivDue(v) })).filter(v => v.d >= min && v.d <= max) : [];
  if (zoom === 'day') dates.forEach(d => { const dt = A.parse(d); dn.append(h('div', { class: (A.isOff(d) ? 'off' : '') + (d === td ? ' td' : '') + (dls.some(v => v.d === d) ? ' ms' : '') + (dt.getDay() === 1 ? ' mon' : ''), style: 'width:' + DW + 'px', title: A.md(d) + '（' + GX_WD[dt.getDay()] + '）' }, h('b', null, String(dt.getDate())), h('small', null, GX_WD[dt.getDay()]))); });
  else if (zoom === 'week') for (let i = 0; i < days; i += 7) { const n = Math.min(7, days - i), d = dates[i]; dn.append(h('div', { class: dates.slice(i, i + n).includes(td) ? 'td' : '', style: 'width:' + n * DW + 'px', title: A.md(d) + ' 起的一週' }, A.md(d))); }
  else dn.append(h('div', { style: 'width:' + W + 'px' }));
  const rsz = mob ? '' : h('span', { class: 'gx-rsz', title: '拖曳調整工項欄寬；點兩下恢復自動' });
  const head = h('div', { class: 'gx-head' }, h('div', { class: 'gx-lab' }, '工項', rsz), h('div', { class: 'gx-days' }, mon, dn));
  if (rsz) {
    rsz.addEventListener('dblclick', () => { try { localStorage.removeItem('gt-lw'); } catch (_) {} A.render(); });
    rsz.addEventListener('pointerdown', e => { e.preventDefault(); const x0 = e.clientX; let w = LW; S.dragging = true; document.body.classList.add('gx-resizing');
      const mv = ev => { w = Math.max(180, Math.min(640, LW + ev.clientX - x0)); inner.style.setProperty('--lw', w + 'px'); };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); S.dragging = false; document.body.classList.remove('gx-resizing'); gxSave('gt-lw', String(Math.round(w))); A.pendingRender = false; A.render(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up); });
  }
  inner.append(head);
  const body = h('div', { class: 'gx-body' });
  const track = () => h('div', { class: 'gx-track', style: 'width:' + W + 'px' + (bg ? ';background-image:' + bg : '') });
  const late = t => t.due && t.due < td && t.status !== '完成';
  const pos = {};
  const taskRow = t => {
    const tr = track(), s = t.start || t.due, e = t.due || t.start, a = s <= e ? s : e, b = s <= e ? e : s;
    const os = (t.owners || []).map(A.pname).filter(Boolean), st = t.status || '未開始';
    const bl = x(a) + 1, bw = Math.max(x(b) - x(a) + DW - 2, 6);
    const bar = h('div', { class: 'gx-bar st-' + st + (st === '完成' ? ' done' : '') + (late(t) ? ' late' : '') + (t.crit ? ' crit' : ''), style: 'left:' + bl + 'px;width:' + bw + 'px', title: t.title + '\n' + (os.join('、') || '未指派') + '｜' + st + '\n' + (t.start ? A.md(t.start) : '—') + ' → ' + (t.due ? A.md(t.due) : '—') + (t.crit ? '\n關鍵工項' : '') });
    if (st === '完成' && bw >= 18) bar.append(h('span', { class: 'gx-ok' }, '✓'));
    tr.append(bar);
    const tx = h('span', { class: 'gx-tx' + (late(t) ? ' late' : '') }, h('b', null, t.due ? A.md(t.due) : ''), S.gOwn ? (os.length ? os.join('、') : h('em', null, '未指派')) : '');
    if (bl + bw + (S.gOwn ? 150 : 50) > W) { tx.classList.add('lft'); tx.style.right = (W - bl + 6) + 'px'; } else tx.style.left = (bl + bw + 6) + 'px';
    tr.append(tx);
    const rk = st === '完成' ? [] : A.depRisk(t);
    const rowEl = h('div', { class: 'gx-row t' + (st === '完成' ? ' done' : ''), onclick: () => A.openDrawer('task', t.id) },
      h('div', { class: 'gx-lab', title: t.title + (rk.length ? '\n⚠ 前置延誤：' + rk.join('、') : '') }, h('i', { class: 'gx-dot st-' + st, title: st }), h('span', { class: late(t) || rk.length ? 'lt' : '' }, (rk.length ? '⚠ ' : '') + t.title), t.crit ? h('em', { class: 'gx-cr' }, '關鍵') : ''), tr);
    pos[t.id] = { row: rowEl, x1: bl, x2: bl + bw };
    return rowEl;
  };
  const byStart = (p, q) => { const a = p.start || p.due, b = q.start || q.due; return a < b ? -1 : a > b ? 1 : (p.due < q.due ? -1 : 1); };
  const cats = CATS.concat([...new Set(dated.map(t => t.cat || '其他'))].filter(c => !CATS.includes(c)));
  cats.forEach(c => {
    const items = dated.filter(t => (t.cat || '其他') === c); if (!items.length) return;
    const open = !S.gFold.has(c), dc = items.filter(t => t.status === '完成').length;
    const btn = h('button', { class: 'gx-tw', type: 'button', 'aria-expanded': String(open), onclick: e => { e.stopPropagation(); open ? S.gFold.add(c) : S.gFold.delete(c); gxSave('gt-gf', [...S.gFold].join('|')); A.render(); } }, h('i', null, '▼'), h('span', null, c));
    const tr = track(), ss = items.map(t => t.start || t.due).sort(), ee = items.map(t => t.due || t.start).sort();
    const sb = h('div', { class: 'gx-sum', style: 'left:' + (x(ss[0]) + 1) + 'px;width:' + Math.max(x(ee[ee.length - 1]) - x(ss[0]) + DW - 2, 6) + 'px', title: c + '\n' + A.md(ss[0]) + ' → ' + A.md(ee[ee.length - 1]) + '\n完成 ' + dc + '/' + items.length }, h('i', { style: 'width:' + (dc / items.length * 100) + '%' }));
    tr.append(sb);
    body.append(h('div', { class: 'gx-row g' }, h('div', { class: 'gx-lab' }, btn, h('small', null, dc + '/' + items.length)), tr));
    if (open) items.sort(byStart).forEach(t => body.append(taskRow(t)));
  });
  const pill = (cls, txt, d, tip) => { const p = h('div', { class: 'gx-pill ' + cls, title: tip }); [...txt].forEach(ch => p.append(h('span', null, ch))); p.style.left = (LW + x(d) + DW / 2) + 'px'; body.append(p); };
  dls.forEach(v => { body.append(h('div', { class: 'gx-line dl', style: 'left:' + (LW + x(v.d) + DW / 2 - 1) + 'px', title: v.n + ' ' + A.roc(v.d) })); pill('dl', v.n.replace(/（.*$/, ''), v.d, v.n + ' ' + A.roc(v.d)); });
  if (td >= min && td <= max) { body.prepend(h('div', { class: 'gx-band', style: 'left:' + (LW + x(td)) + 'px;width:' + Math.max(DW, 2) + 'px' }));
    body.append(h('div', { class: 'gx-line today', style: 'left:' + (LW + x(td) + DW / 2 - 1) + 'px' })); pill('today' + (zoom === 'day' ? '' : ' sm'), '今天', td, '今天 ' + A.md(td)); }
  inner.append(body); box.append(inner);
  box.addEventListener('scroll', () => { S.gScroll = box.scrollLeft; });
  setTimeout(() => { if (S.gLinks) { const hid = gxLinks(body, pos, W, LW, dated); if (hid) sub.textContent += '．' + hid + ' 條連線因收合或篩選未顯示'; } if (S.gScroll != null) box.scrollLeft = S.gScroll; else toToday(); gxHead(); }, 0);
  return wrap;
}
function gxHead() {
  const box = document.querySelector('.gx-box'), hd = box && box.querySelector('.gx-head'); if (!hd) return;
  const r = box.getBoundingClientRect(), y = Math.min(Math.max(0, r.height - hd.offsetHeight - 40), Math.max(0, -r.top));
  hd.style.transform = y ? 'translateY(' + y + 'px)' : ''; hd.classList.toggle('stuck', y > 0);
  const ps = box.querySelectorAll('.gx-pill'); if (!ps.length) return;
  const bd = ps[0].parentElement.getBoundingClientRect(), t0 = Math.max(bd.top, hd.getBoundingClientRect().bottom), b0 = Math.min(bd.bottom, window.innerHeight), mid = (t0 + b0) / 2 - bd.top;
  ps.forEach(p => { const lh = p.offsetHeight || 60; p.style.top = Math.max(4, Math.min(bd.height - lh - 4, mid - lh / 2)) + 'px'; });
}
document.addEventListener('scroll', () => { requestAnimationFrame(gxHead); }, { passive: true, capture: true });
let gxRz = 0; window.addEventListener('resize', () => { clearTimeout(gxRz); gxRz = setTimeout(() => { if (S.page === 'schedule' && S.schedView === 'gantt') A.render(); }, 200); });
function exportTasks() {
  A.exportCSV('國土通檢_工項', [['分類', '工項', '負責人', '開始', '期限', '狀態', '關鍵', '備註'], ...S.tasks.map(t => [t.cat || '', t.title, (t.owners || []).map(A.pname).join('、'), A.roc(t.start), A.roc(t.due), t.status || '', t.crit ? '是' : '', t.note || ''])]);
}
A.newTask = async function (preset) {
  const id = A.newId(); const me = A.meId();
  const data = Object.assign({ title: '新工項', cat: '其他', status: '未開始', owners: me ? [me] : [], start: '', due: '', note: '', crit: false, createdAt: new Date().toISOString() }, preset || {});
  if (await A.put('tasks', id, data)) A.openDrawer('task', id);
};

/* ---------- 會議 ---------- */
S.mType = '';
/* ---------- 會議改期風險 ---------- */
const MEET_GAP = 5; // 兩場有會前作業的會議至少相隔幾個工作天
const mkey = s => String(s || '').replace(/[\s　]/g, '');
// 會議名稱的關鍵字（第1次工作會議、研商1、諮詢②…），用來找可能相關的工項
function meetKeys(m) {
  const t = mkey(m.title), ks = [];
  let r = t.match(/第(\d+)次(工作會議|研商會議|諮詢會議)/); if (r) ks.push('第' + r[1] + '次' + r[2]);
  r = t.match(/(研商|諮詢|座談|公聽)會?議?([0-9①-⑩]+)/); if (r) ks.push(r[1] + r[2]);
  const base = t.replace(/（.*$/, ''); if (base.length >= 4) ks.push(base);
  return [...new Set(ks)];
}
A.relatedTasks = function (m) {
  const ks = meetKeys(m), out = [];
  S.tasks.forEach(t => {
    if (t.meeting === m.id) { out.push({ t, linked: true }); return; }
    if (t.meeting || t.status === '完成' || !m.date) return;
    const d = t.due || t.start; if (!d || Math.abs(A.diff(d, m.date)) > 30) return;
    const tt = mkey(t.title); if (ks.some(k => tt.includes(k))) out.push({ t, linked: false });
  });
  return out;
};
A.meetRisks = function (m, date) {
  date = date || m.date; const out = []; if (!date || held(m)) return out;
  const td = today();
  if (A.isOff(date)) out.push({ lv: 'warn', txt: '開會日是' + (A.holidaySet()[date] ? '國定假日' : '週末') });
  if (m.latest && date > m.latest) out.push({ lv: 'bad', txt: '超過最晚召開日 ' + A.md(m.latest) });
  const t = A.typeOf(m.type), steps = (t && t.steps) || [];
  steps.forEach(s => { if (m.prep && m.prep[s.id]) return; const due = A.backWorkdays(date, Number(s.offset) || 0);
    if (due < td) out.push({ lv: 'bad', txt: s.name + '來不及（應在 ' + A.md(due) + ' 前）' });
    else { const n = A.workdaysBetween(td, due); if (n <= 1) out.push({ lv: 'warn', txt: s.name + (n === 0 ? '今天就要完成' : '只剩 1 個工作天') }); } });
  if (steps.length) S.meetings.forEach(o => { if (o.id === m.id || !o.date || held(o)) return; const ot = A.typeOf(o.type); if (!ot || !(ot.steps || []).length) return;
    const g = o.date < date ? A.workdaysBetween(o.date, date) : A.workdaysBetween(date, o.date);
    if (g < MEET_GAP) out.push({ lv: g <= 2 ? 'bad' : 'warn', txt: '與「' + (o.title || '會議') + '」' + (g === 0 ? '同一天' : '只相隔 ' + g + ' 個工作天') }); });
  return out;
};
const riskTag = rs => rs.length ? h('span', { class: 'tag ' + (rs.some(r => r.lv === 'bad') ? 't-bad' : 't-warn'), title: rs.map(r => r.txt).join('\n') }, ic(I_ALERT), rs[0].txt + (rs.length > 1 ? '．另 ' + (rs.length - 1) + ' 項' : '')) : '';
const riskList = rs => rs.length ? h('div', { class: 'rk-list' }, rs.map(r => h('div', { class: 'rk ' + r.lv }, ic(I_ALERT), r.txt))) : '';
// 改日期前先檢查：有風險或有相關工項就跳視窗確認
A.changeMeetingDate = function (m, nd) {
  if (!nd || nd === m.date) return;
  const rs = A.meetRisks(m, nd), rel = m.date ? A.relatedTasks(m) : [], delta = m.date ? A.diff(nd, m.date) : 0;
  if (!rs.length && !(rel.length && delta)) { A.patch('meetings', m.id, { date: nd }); return; }
  const checks = rel.map(x => { const c = h('input', { type: 'checkbox' }); c.checked = x.linked; return [x.t, c]; });
  const sh = d => (d ? A.md(A.addDays(d, delta)) : '');
  const body = h('div', { class: 'br-b' },
    h('div', { class: 'br-s' }, h('h3', null, rs.length ? '改到 ' + A.mdw(nd) + ' 會有這些問題' : '改到 ' + A.mdw(nd) + '，會前作業時間足夠'), riskList(rs)),
    rel.length && delta ? h('div', { class: 'br-s' }, h('h3', null, '相關工項要一起' + (delta > 0 ? '延後 ' : '提前 ') + Math.abs(delta) + ' 天嗎？'),
      h('div', { class: 'muted', style: 'font-size:12px;margin:0 10px 6px' }, '有勾的才會移動；勾過的工項之後會記住屬於這場會議。'),
      checks.map(([t, c]) => h('label', { class: 'rk-t' }, c, h('span', null, t.title), h('small', null, (t.start ? A.md(t.start) + '–' : '') + A.md(t.due) + ' → ' + (t.start ? sh(t.start) + '–' : '') + sh(t.due))))) : '');
  const close = () => ov.remove();
  const ok = async () => { close(); await A.patch('meetings', m.id, { date: nd }); let n = 0;
    for (const [t, c] of checks) if (c.checked && delta) { const d = { meeting: m.id }; if (t.start) d.start = A.addDays(t.start, delta); if (t.due) d.due = A.addDays(t.due, delta); await A.patch('tasks', t.id, d); n++; }
    A.toast('已改到 ' + A.md(nd) + (n ? '，' + n + ' 個工項一起移動' : '')); };
  const ov = h('div', { class: 'br-ov' }, h('div', { class: 'br', role: 'dialog', 'aria-label': '改期檢查' },
    h('div', { class: 'br-h' }, h('small', null, (m.title || '會議') + '．原訂 ' + (m.date ? A.mdw(m.date) : '未定')), h('h2', null, rs.some(r => r.lv === 'bad') ? '改期前請確認' : '改期檢查')), body,
    h('div', { class: 'br-f' }, h('button', { class: 'btn sm', type: 'button', onclick: () => { close(); A.refreshDrawer && A.refreshDrawer(); } }, '取消'), h('button', { class: 'btn sm pri', type: 'button', onclick: ok }, rs.length ? '仍要改期' : '確定改期'))));
  document.body.append(ov);
};

A.pages.meetings = function (frag) {
  frag.append(h('div', { class: 'page-h' }, h('div', null, h('h1', null, '會議'), h('p', null, '每場會議從會前準備、開會到上傳紀錄都在同一張卡片裡；紀錄標上議題，日後可依議題查歷次討論。')),
    h('div', { class: 'act' }, h('button', { class: 'btn', type: 'button', onclick: exportMeetings }, '匯出 Excel'), S.canWrite ? h('button', { class: 'btn', type: 'button', onclick: () => A.newMeeting() }, '新增會議') : '')));
  if (!readyGate(frag)) return;
  const chips = h('div', { class: 'toolbar' }, h('button', { class: 'btn sm', type: 'button', 'aria-pressed': String(!S.mType), style: !S.mType ? 'background:var(--ink);color:var(--panel)' : '', onclick: () => { S.mType = ''; A.render(); } }, '全部'),
    types().map(t => { const ms = S.meetings.filter(m => m.type === t.id); return h('button', { class: 'btn sm', type: 'button', style: S.mType === t.id ? 'background:var(--ink);color:var(--panel)' : '', onclick: () => { S.mType = t.id; A.render(); } }, t.name, h('span', { class: 'muted num' }, ' ' + ms.filter(held).length + (Number(t.quota) ? '/' + t.quota : ''))); }));
  frag.append(chips);
  const td = today(); const list = S.meetings.filter(m => !S.mType || m.type === S.mType);
  const groups = [['即將召開', list.filter(m => m.date && m.date >= td && !held(m)).sort((a, b) => (a.date < b.date ? -1 : 1))],
    ['未排日期', list.filter(m => !m.date && !held(m))],
    ['已召開', list.filter(m => held(m) || (m.date && m.date < td)).sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1))]];
  if (!S.meetings.length) { frag.append(card(h('div'), emptyBox('還沒有會議', '新增第一場會議，填上類型與開會日期，系統會依後台範本自動倒推會前作業。', S.canWrite ? h('button', { class: 'btn sm', type: 'button', onclick: () => A.newMeeting() }, '新增會議') : null))); return; }
  groups.forEach(([g, ms]) => {
    if (!ms.length) return;
    const tb = h('div');
    ms.forEach(m => { const t = A.typeOf(m.type); const steps = A.prep(m); const cur = steps.find(s => s.st === 'now' || s.st === 'late'); const mi = m.minutes || {};
      const right = held(m) ? ((mi.files || []).length || mi.summary ? h('span', { class: 'tag t-good' }, '紀錄已存' + ((mi.decisions || []).length ? '．決議 ' + mi.decisions.length : '')) : h('span', { class: 'tag t-warn' }, '待上傳紀錄'))
        : cur ? h('span', { class: 'tag ' + (cur.st === 'late' ? 't-bad' : 't-blue') }, ic(cur.st === 'late' ? I_ALERT : I_CLOCK), cur.name + '．' + (cur.due ? A.md(cur.due) + ' ' + leftTxt(cur.due) : '')) : stTag(m.status || '規劃中');
      tb.append(h('button', { class: 'rowx', type: 'button', onclick: () => A.openDrawer('meeting', m.id) }, h('span', { class: 'dd' }, m.date ? A.md(m.date) + ' ' + A.wd(m.date) : '未定'),
        h('span', { style: 'min-width:0' }, h('b', null, m.title || '未命名會議', editDot('meeting:' + m.id), h('small', null, (t ? t.name : '未分類') + (m.place ? '．' + m.place : ''))), A.meetRisks(m).length ? h('div', { style: 'margin-top:4px' }, riskTag(A.meetRisks(m))) : '',
          (m.issues || []).length ? h('div', { class: 'tg', style: 'margin-top:4px' }, m.issues.map(n => h('span', null, '議題 ' + n))) : ''), right)); });
    frag.append(card(chead(g, ms.length + ' 場'), h('div', { style: 'margin-top:12px' }, tb)));
  });
};
function exportMeetings() {
  A.exportCSV('國土通檢_會議', [['日期', '會議', '類型', '地點', '縣市', '狀態', '議題', '摘要', '決議'], ...S.meetings.map(m => { const mi = m.minutes || {}; return [A.roc(m.date), m.title, (A.typeOf(m.type) || {}).name || '', m.place || '', m.county || '', m.status || '', (m.issues || []).join('、'), mi.summary || '', (mi.decisions || []).map((d, i) => (i + 1) + '. ' + d.text + (d.owner ? '（' + A.pname(d.owner) + '）' : '')).join('\n')]; })]);
}
A.newMeeting = async function (preset) {
  const id = A.newId(); const t0 = types()[0];
  const data = Object.assign({ title: '新會議', type: S.mType || (t0 ? t0.id : ''), date: '', time: '', place: '', county: '', status: '規劃中', issues: [], prep: {}, minutes: { summary: '', decisions: [], files: [], paths: [] } }, preset || {});
  if (await A.put('meetings', id, data)) A.openDrawer('meeting', id);
};

/* ---------- 議題 ---------- */
A.pages.issues = function (frag) {
  frag.append(h('div', { class: 'page-h' }, h('div', null, h('h1', null, '議題'), h('p', null, '國土議題案 24 項重要議題的導讀分工、進度與歷次討論。')),
    h('div', { class: 'act' }, S.canWrite && S.issues.length ? h('button', { class: 'btn', type: 'button', onclick: autoAllocate }, '依頁數自動分配') : '')));
  if (!readyGate(frag)) return;
  if (!S.issues.length) { frag.append(card(h('div'), emptyBox('議題清單還沒建立', '請管理者建立 24 項議題與報告頁碼，之後即可分配導讀。'))); return; }
  const al = A.allocation(); const totP = S.issues.reduce((a, i) => a + pagesOf(i), 0); const units = al.reduce((a, x) => a + Number(x.p.share), 0);
  const per = units ? Math.round(totP / units) : 0;
  const legend = h('div', { class: 'tg', style: 'margin-top:14px' }, al.map(x => h('span', null, x.p.name + '：' + x.pages + ' 頁' + (per ? '（目標 ' + Math.round(per * x.p.share) + '）' : ''))));
  frag.append(card(chead('導讀分配', '每份約 ' + per + ' 頁' + (al.some(x => Number(x.p.share) < 1) ? '，半份約 ' + Math.round(per / 2) + ' 頁' : '') + '．寬度＝頁數'), h('div', { class: 'pad' }, readingStrip(), legend,
    !al.length ? h('p', { class: 'cap' }, '到後台「成員」設定每個人的導讀份額（整份 1、半份 0.5），再按「依頁數自動分配」。') : '')));
  const tb = h('tbody'); const td = today();
  [...S.issues].sort((a, b) => a.no - b.no).forEach(i => {
    const n = pagesOf(i); const dis = S.meetings.filter(m => (m.issues || []).map(Number).includes(Number(i.no)));
    tb.append(h('tr', { class: 'click', onclick: () => A.openDrawer('issue', i.id) }, h('td', { class: 'num', style: 'width:52px;font-weight:600' }, i.no),
      h('td', null, i.name || h('span', { class: 'muted' }, '（未填名稱）'), editDot('issue:' + i.id), h('div', { class: 'muted', style: 'font-size:12px' }, i.group || '')),
      h('td', { class: 'num muted', style: 'white-space:nowrap' }, i.pages ? 'p.' + i.pages[0] + '–' + i.pages[1] : ''),
      h('td', { style: 'white-space:nowrap' }, i.reader ? h('span', { style: 'display:inline-flex;gap:6px;align-items:center' }, A.avatar(i.reader, 24), A.pname(i.reader)) : h('span', { class: 'muted' }, '未分配')),
      h('td', { style: 'min-width:120px' }, h('div', { class: 'bar' }, h('div', { class: 'fill', style: 'width:' + (n ? Math.min(100, (Number(i.readPages) || 0) / n * 100) : 0) + '%' })), h('small', { class: 'muted num' }, (Number(i.readPages) || 0) + '/' + n + ' 頁')),
      h('td', null, stTag(i.status || '未開始'), i.summaryDue && i.summaryDue < td && !['摘要完成', '已導讀'].includes(i.status) ? h('span', { class: 'tag t-bad', style: 'margin-left:6px' }, '摘要逾期') : ''),
      h('td', { class: 'muted', style: 'white-space:nowrap' }, dis.length ? '討論 ' + dis.length + ' 次' : '')));
  });
  frag.append(card(chead('24 項重要議題', '點一列看導讀內容與歷次討論'), h('div', { class: 'tbl', style: 'margin-top:10px' }, h('table', null, h('thead', null, h('tr', null, h('th', null, '編號'), h('th', null, '議題'), h('th', null, '頁碼'), h('th', null, '導讀人'), h('th', null, '進度'), h('th', null, '狀態'), h('th', null, '討論'))), tb))));
};
function autoAllocate() {
  const readers = S.people.filter(p => Number(p.share) > 0);
  if (!readers.length) { A.toast('請先到後台設定成員的導讀份額。'); return; }
  A.confirm('依頁數自動分配？', '依報告頁數平均分給 ' + readers.length + ' 位成員（半份的人分一半），已經分配的會被重新安排。', '重新分配', async () => {
    const load = {}; readers.forEach(p => load[p.id] = 0);
    const iss = [...S.issues].sort((a, b) => pagesOf(b) - pagesOf(a));
    const plan = {};
    iss.forEach(i => { let best = null, bv = Infinity; readers.forEach(p => { const v = (load[p.id] + pagesOf(i)) / Number(p.share); if (v < bv) { bv = v; best = p.id; } }); load[best] += pagesOf(i); plan[i.id] = best; });
    for (const i of S.issues) if (i.reader !== plan[i.id]) await A.patch('issues', i.id, { reader: plan[i.id] });
    A.toast('已依頁數重新分配導讀人。');
  });
}

/* ---------- 文件 ---------- */
S.docTab = 'letters';
A.pages.docs = function (frag) {
  frag.append(h('div', { class: 'page-h' }, h('div', null, h('h1', null, '文件'), h('p', null, '公文收發、審查意見回應、通訊錄，以及各場會議上傳的檔案。'))));
  if (!readyGate(frag)) return;
  const seg = h('div', { class: 'seg', role: 'group' }, [['letters', '公文收發'], ['reviews', '審查意見'], ['contacts', '通訊錄'], ['files', '檔案']].map(([k, t]) => h('button', { type: 'button', 'aria-pressed': String(S.docTab === k), onclick: () => { S.docTab = k; A.render(); } }, t)));
  frag.append(h('div', { class: 'toolbar' }, seg, h('div', { class: 'sp' }), S.docTab === 'letters' && S.canWrite ? h('button', { class: 'btn', type: 'button', onclick: A.newLetter }, '新增公文') : '', S.docTab === 'reviews' && S.canWrite ? h('button', { class: 'btn', type: 'button', onclick: A.newReview }, '新增審查意見') : '',
    S.docTab === 'reviews' ? ['工作計畫書', '期中報告', '期末報告', '總結報告'].filter(rp => S.reviews.some(r => (r.report || '工作計畫書') === rp)).map(rp => h('button', { class: 'btn', type: 'button', onclick: () => A.reviewDoc(rp) }, '下載' + rp + '回應表')) : '',
    S.docTab === 'contacts' && S.canWrite && !S.contactsErr ? h('button', { class: 'btn', type: 'button', onclick: A.newContact }, '新增聯絡人') : ''));
  const td = today();
  if (S.docTab === 'letters') {
    if (!S.letters.length) { frag.append(card(h('div'), emptyBox('還沒有公文', '收文或發文都可以記在這裡，填上辦理期限就會出現在逾期提醒。'))); return; }
    const tb = h('tbody'); [...S.letters].sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1)).forEach(l => tb.append(h('tr', { class: 'click', onclick: () => A.openDrawer('letter', l.id) },
      h('td', null, h('span', { class: 'tag ' + (l.kind === '發文' ? 't-blue' : 't-teal') }, l.kind || '收文')), h('td', { class: 'num' }, A.roc(l.date)), h('td', { class: 'num muted' }, l.no || ''), h('td', null, l.subject || ''),
      h('td', { class: 'num' }, l.due ? A.md(l.due) : ''), h('td', null, A.pname(l.owner)), h('td', null, l.status === '已辦結' ? stTag('已辦結') : l.due && l.due < td ? h('span', { class: 'tag t-bad' }, lateTxt(l.due)) : stTag(l.status || '待辦')))));
    frag.append(card(h('div'), h('div', { class: 'tbl' }, h('table', null, h('thead', null, h('tr', null, ['類別', '日期', '文號', '主旨', '辦理期限', '承辦', '狀態'].map(x => h('th', null, x)))), tb))));
  } else if (S.docTab === 'reviews') {
    if (!S.reviews.length) { frag.append(card(h('div'), emptyBox('還沒有審查意見', '各次報告審查的委員意見逐條記在這裡，寫回應與修正頁次。'))); return; }
    const tb = h('tbody');
    ['工作計畫書', '期中報告', '期末報告', '總結報告'].forEach(rp => { const rs = S.reviews.filter(r => (r.report || '工作計畫書') === rp); if (!rs.length) return;
      tb.append(h('tr', { class: 'grp' }, h('td', { colspan: 5 }, rp + '　已回應 ' + rs.filter(r => r.status === '已回應').length + ' / ' + rs.length)));
      rs.forEach(r => tb.append(h('tr', { class: 'click', onclick: () => A.openDrawer('review', r.id) }, h('td', { class: 'muted' }, r.who || ''), h('td', null, (r.opinion || '').slice(0, 60)), h('td', { class: 'num muted' }, r.pages || ''), h('td', null, A.pname(r.owner)), h('td', null, stTag(r.status || '未回應'))))); });
    frag.append(card(h('div'), h('div', { class: 'tbl' }, h('table', null, h('thead', null, h('tr', null, ['委員', '意見', '修正頁次', '負責', '狀態'].map(x => h('th', null, x)))), tb))));
  } else if (S.docTab === 'contacts') {
    const cs = S.contacts || [];
    if (S.contactsErr) { frag.append(card(h('div'), emptyBox('通訊錄還不能使用', '請管理者到 Firebase 更新 Firestore 安全規則（加入 contacts），再重新整理。'))); return; }
    if (!cs.length) { frag.append(card(h('div'), emptyBox('還沒有聯絡人', '專家學者、機關窗口都可以記在這裡；會議可以直接選出席者，簽到表和開會通知單會自動帶入。', S.canWrite ? h('button', { class: 'btn sm', type: 'button', onclick: A.newContact }, '新增聯絡人') : null))); return; }
    const nAtt = id => S.meetings.filter(m => (m.attendees || []).includes(id)).length, tb = h('tbody');
    CKINDS.concat([...new Set(cs.map(c => c.kind || '其他'))].filter(k => !CKINDS.includes(k))).forEach(k => { const rows = cs.filter(c => (c.kind || '其他') === k).sort((a, b) => ((a.org || '') + (a.name || '') < (b.org || '') + (b.name || '') ? -1 : 1)); if (!rows.length) return;
      tb.append(h('tr', { class: 'grp' }, h('td', { colspan: 6 }, k + '　' + rows.length)));
      rows.forEach(c => { const n = nAtt(c.id); tb.append(h('tr', { class: 'click', onclick: () => A.openDrawer('contact', c.id) }, h('td', null, c.name || '（未填姓名）'), h('td', null, c.org || ''), h('td', { class: 'muted' }, c.title || ''), h('td', { class: 'num' }, c.phone || ''), h('td', { class: 'num muted' }, c.email || ''), h('td', { class: 'num' }, n ? n + ' 場' : ''))); }); });
    frag.append(card(h('div'), h('div', { class: 'tbl' }, h('table', null, h('thead', null, h('tr', null, ['姓名', '單位', '職稱', '電話', 'Email', '出席'].map(x => h('th', null, x)))), tb))));
  } else {
    const fl = []; S.meetings.forEach(m => ((m.minutes || {}).files || []).forEach(f => fl.push([m, f])));
    const paths = []; S.meetings.forEach(m => ((m.minutes || {}).paths || []).forEach(p => paths.push([m, p])));
    if (!fl.length && !paths.length) { frag.append(card(h('div'), emptyBox('還沒有檔案', '在會議裡上傳的紀錄與附件會集中列在這裡。'))); return; }
    const box = h('div', { class: 'files pad' });
    fl.sort((a, b) => ((a[0].date || '') < (b[0].date || '') ? 1 : -1)).forEach(([m, f]) => box.append(h('div', { class: 'file' }, h('a', { href: f.url || '/_blob/' + f.id, target: '_blank', rel: 'noopener' }, f.name || '檔案'), h('span', { class: 'muted' }, m.title || ''), h('small', null, A.md(m.date)))));
    paths.forEach(([m, p]) => box.append(h('div', { class: 'file' }, h('span', { style: 'user-select:all;font-family:var(--mono);font-size:12px' }, p), h('small', null, m.title || ''))));
    frag.append(card(chead('會議檔案', '點檔名開啟；伺服器路徑可直接複製'), box));
  }
};
A.newLetter = async function () { const id = A.newId(); if (await A.put('letters', id, { kind: '收文', date: today(), no: '', subject: '', due: '', owner: A.meId(), status: '待辦', note: '' })) A.openDrawer('letter', id); };
A.newReview = async function () { const id = A.newId(); if (await A.put('reviews', id, { report: '工作計畫書', who: '', opinion: '', response: '', pages: '', owner: A.meId(), status: '未回應' })) A.openDrawer('review', id); };

/* ---------- 後台 ---------- */
A.pages.admin = function (frag) {
  frag.append(h('div', { class: 'page-h' }, h('div', null, h('h1', null, '後台'), h('p', null, S.isAdmin ? '專案設定、成員、會議類型與會前作業範本、國定假日。' : '只有管理者可以修改這裡的設定；你可以檢視目前的設定。'))));
  if (!readyGate(frag)) return;
  const ro = !S.isAdmin;
  const P = S.project || {};
  const savePrj = patch => A.putConfig('project', Object.assign({}, S.project, patch));
  // 專案設定
  const dl = A.deliverables().map(x => Object.assign({}, x));
  const dt = h('tbody');
  dl.forEach((d, i) => { const up = (k, v) => { dl[i][k] = v; savePrj({ deliverables: dl }); };
    dt.append(h('tr', null, h('td', null, A.inp(d.name, v => up('name', v), { sm: true, ro })), h('td', null, A.inp(d.day, v => up('day', v), { sm: true, type: 'number', ro })), h('td', null, A.inp(d.copies, v => up('copies', v), { sm: true, type: 'number', ro })),
      h('td', null, A.inp(d.pay, v => up('pay', v), { sm: true, type: 'number', ro })), h('td', { class: 'num muted' }, A.roc(A.delivDue(d))),
      h('td', null, A.sel(A.delivStatus(d), ['未提送', '已提送', '已核定'], v => savePrj({ delivStatus: Object.assign({}, P.delivStatus, { [d.key]: v }) }), { sm: true, ro: !S.canWrite })))); });
  frag.append(card(chead('專案設定', '起算日決定所有交付日期與倒數'), h('div', { class: 'pad' },
    h('div', { class: 'fgrid' }, A.field('履約起算日', A.inp(P.startDate, v => savePrj({ startDate: v }), { type: 'date', ro, id: 'p-start' })), A.field('履約天數', A.inp(A.totalDays(), v => savePrj({ totalDays: v }), { type: 'number', ro, id: 'p-days' }))),
    h('div', { class: 'tbl', style: 'margin-top:14px' }, h('table', null, h('thead', null, h('tr', null, ['交付', '第幾天', '份數', '請款 %', '到期日', '狀態'].map(x => h('th', null, x)))), dt)))));
  // 請款追蹤
  const pays = P.pays || {}, amt = Number(P.amount) || 0, savePay = (k, d) => savePrj({ pays: Object.assign({}, pays, { [k]: Object.assign({}, pays[k] || {}, d) }) });
  const pyt = h('tbody');
  A.deliverables().forEach((d, i) => { const r = pays[d.key] || {}; pyt.append(h('tr', null, h('td', null, '第 ' + (i + 1) + ' 期．' + d.name), h('td', { class: 'num' }, (d.pay || 0) + '%'), h('td', { class: 'num' }, amt ? A.money(amt * (d.pay || 0) / 100) : '—'),
    h('td', null, A.sel(r.status || '未請款', ['未請款', '已送件', '已核撥'], v => savePay(d.key, { status: v }), { sm: true, ro })),
    h('td', null, A.inp(r.sent, v => savePay(d.key, { sent: v }), { sm: true, type: 'date', ro })), h('td', null, A.inp(r.paid, v => savePay(d.key, { paid: v }), { sm: true, type: 'date', ro })),
    h('td', null, A.inp(r.note, v => savePay(d.key, { note: v }), { sm: true, ro, ph: '發票號碼、備註' })))); });
  const gotPct = A.deliverables().reduce((a, d) => a + ((pays[d.key] || {}).status === '已核撥' ? (d.pay || 0) : 0), 0);
  frag.append(card(chead('請款追蹤', '已核撥 ' + gotPct + '%' + (amt ? '．' + A.money(amt * gotPct / 100) + ' / ' + A.money(amt) + ' 元' : '')),
    h('div', { class: 'pad', style: 'padding-bottom:0' }, A.field('契約總價（元）', A.inp(P.amount ? String(P.amount) : '', v => savePrj({ amount: Number(String(v).replace(/[^\d.]/g, '')) || 0 }), { ro, ph: '例如 12000000', id: 'p-amount' }))),
    h('div', { class: 'tbl', style: 'margin-top:10px' }, h('table', null, h('thead', null, h('tr', null, ['期別', '比例', '金額', '狀態', '送件日', '核撥日', '備註'].map(x => h('th', null, x)))), pyt))));
  // 成員
  const pt = h('tbody');
  S.people.forEach(p => pt.append(h('tr', null, h('td', null, A.avatar(p.id, 28)), h('td', null, A.inp(p.name, v => A.patch('people', p.id, { name: v }), { sm: true, ro: !S.canWrite })),
    h('td', null, A.inp(p.title, v => A.patch('people', p.id, { title: v }), { sm: true, ro: !S.canWrite, ph: '職稱或分工' })),
    h('td', null, A.inp(p.email || '', v => A.patch('people', p.id, { email: v.trim().toLowerCase() }).then(() => { if (window.FB_SYNC_ACCESS) setTimeout(window.FB_SYNC_ACCESS, 400); }), { sm: true, ro: !S.isAdmin, ph: 'Google 帳號 email' })),
    h('td', null, A.sel(String(p.share ?? 0), [['1', '整份'], ['0.5', '半份'], ['0', '不參與']], v => A.patch('people', p.id, { share: Number(v) }), { sm: true, ro: !S.canWrite })),
    h('td', null, S.canWrite ? h('button', { class: 'btn sm danger', type: 'button', onclick: () => A.confirm('刪除成員「' + p.name + '」？', '已指派給他的工項會變成未指派。', '刪除', () => A.del('people', p.id), true) }, '刪除') : ''))));
  frag.append(card(chead('成員', '導讀份額：整份＝1、半份＝0.5', S.canWrite ? h('button', { class: 'btn sm', type: 'button', onclick: () => A.prompt('新增成員', '姓名', v => A.put('people', A.newId(), { name: v, title: '', share: 1 })) }, '新增成員') : ''),
    S.people.length ? h('div', { class: 'tbl', style: 'margin-top:10px' }, h('table', null, h('thead', null, h('tr', null, ['', '姓名', '職稱／分工', 'Google 帳號', '導讀份額', ''].map(x => h('th', null, x)))), pt)) : emptyBox('還沒有成員', '新增成員後，工項、決議、導讀都可以指派給他們。')));
  // 會議類型與範本
  const T = types().map(t => Object.assign({}, t, { steps: (t.steps || []).map(s => Object.assign({}, s)) }));
  const saveT = () => A.putConfig('templates', { types: T });
  const tbox = h('div', { class: 'pad', style: 'display:flex;flex-direction:column;gap:14px' });
  T.forEach((t, ti) => {
    const steps = h('div', { class: 'stepl' });
    t.steps.forEach((s, si) => steps.append(h('div', null, h('span', { class: 'muted num' }, si + 1), h('span', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, A.inp(s.name, v => { T[ti].steps[si].name = v; saveT(); }, { sm: true, ro, ph: '步驟名稱，例如：給陳總' }),
      h('span', { class: 'muted' }, '開會前'), A.inp(s.offset, v => { T[ti].steps[si].offset = v; saveT(); }, { sm: true, type: 'number', ro }), h('span', { class: 'muted' }, '個工作天')),
      ro ? '' : h('button', { class: 'ib', type: 'button', 'aria-label': '刪除步驟', onclick: () => { T[ti].steps.splice(si, 1); saveT(); } }, ic('<path d="M6 6l12 12M18 6L6 18"/>')))));
    if (!t.steps.length) steps.append(h('div', null, h('span'), h('span', { class: 'muted' }, '還沒有會前步驟'), h('span')));
    tbox.append(h('div', { style: 'border-radius:18px;box-shadow:inset 0 0 0 1px var(--hair);padding:14px;display:flex;flex-direction:column;gap:10px' },
      h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, A.inp(t.name, v => { T[ti].name = v; saveT(); }, { sm: true, ro }), h('span', { class: 'muted' }, '應辦'), A.inp(t.quota, v => { T[ti].quota = v; saveT(); }, { sm: true, type: 'number', ro }), h('span', { class: 'muted' }, '場'),
        h('div', { class: 'sp' }), ro ? '' : h('button', { class: 'btn sm', type: 'button', onclick: () => { T[ti].steps.push({ id: A.newId(), name: '新步驟', offset: 1 }); T[ti].steps.sort((a, b) => b.offset - a.offset); saveT(); } }, '新增步驟'),
        ro ? '' : h('button', { class: 'btn sm danger', type: 'button', onclick: () => A.confirm('刪除會議類型「' + t.name + '」？', '已建立的這類會議會變成未分類。', '刪除', () => { T.splice(ti, 1); saveT(); }, true) }, '刪除類型')), steps));
  });
  frag.append(card(chead('會議類型與會前作業範本', '步驟的天數是「開會前幾個工作天」要完成', ro ? '' : h('button', { class: 'btn sm', type: 'button', onclick: () => A.prompt('新增會議類型', '例如：組內討論', v => { T.push({ id: A.newId(), name: v, quota: 0, steps: [] }); saveT(); }) }, '新增類型')),
    T.length ? tbox : emptyBox('還沒有會議類型', '')));
  // 假日
  const hol = ((S.calendar && S.calendar.holidays) || []).map(x => Object.assign({}, x)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const saveH = () => A.putConfig('calendar', { holidays: hol });
  const hb = h('div', { class: 'pad', style: 'display:flex;flex-wrap:wrap;gap:8px' }, hol.map((x, i) => h('span', { class: 'tag', style: 'padding:4px 6px 4px 12px' }, A.roc(x.date) + ' ' + (x.name || ''), ro ? '' : h('button', { class: 'ib', type: 'button', style: 'width:22px;height:22px', 'aria-label': '刪除', onclick: () => { hol.splice(i, 1); saveH(); } }, ic('<path d="M6 6l12 12M18 6L6 18"/>')))));
  if (!hol.length) hb.append(h('span', { class: 'muted' }, '還沒有設定假日；週末一律不算工作天。'));
  const nd = h('input', { class: 'in sm', type: 'date', id: 'hol-date' }), nn = h('input', { class: 'in sm', placeholder: '名稱，例如：國慶日', id: 'hol-name' });
  frag.append(card(chead('國定假日與補假', '倒推會前作業時跳過這些日子；請依行政院人事行政總處公告維護'), h('div', null, hb,
    ro ? '' : h('div', { class: 'pad', style: 'display:flex;gap:8px;flex-wrap:wrap;padding-top:0' }, nd, nn, h('button', { class: 'btn sm', type: 'button', onclick: () => { if (!nd.value) return; hol.push({ date: nd.value, name: nn.value.trim() }); saveH(); } }, '加入')))));
  const backup = async () => {
    const out = {}; A.COLLS.forEach(c => { out[c] = (S[c] || []).map(d => Object.assign({}, d)); });
    out.config = ['project', 'templates', 'calendar'].filter(k => S[k]).map(k => Object.assign({ id: k }, S[k]));
    const n = Object.values(out).reduce((a, v) => a + v.length, 0);
    if (!A.downloads) { A.toast('這個檢視無法下載檔案。'); return; }
    try { await A.downloads.save({ filename: '國土通檢_備份_' + today().replace(/-/g, '') + '.json', data: JSON.stringify(out, null, 1) }); try { localStorage.setItem('gt-backup', today()); } catch (_) {} A.toast('已下載備份，共 ' + n + ' 筆。'); A.render(); }
    catch (e) { if (!e || e.code !== 'declined') A.toast('下載失敗：' + ((e && e.message) || '')); }
  };
  let lastB = ''; try { lastB = localStorage.getItem('gt-backup') || ''; } catch (_) {}
  frag.append(card(chead('資料備份', lastB ? '這台電腦上次備份：' + A.md(lastB) + (A.diff(today(), lastB) > 14 ? '．已超過兩週，建議再備份一次' : '') : '建議每兩週下載一次，存到公司伺服器'),
    h('div', { class: 'pad' }, h('p', { class: 'muted', style: 'margin:0 0 10px;font-size:13px;line-height:1.7' }, '把工項、會議（含紀錄與決議）、議題、公文、審查意見、通訊錄、成員與設定全部存成一個 JSON 檔。' + (window.FB_ADMIN ? '需要還原時，由管理者在下方「匯入資料」選這個檔。' : '') + '上傳的 PDF 本身不在備份裡。'),
      h('button', { class: 'btn sm', type: 'button', onclick: backup }, '下載完整備份'))));
  if (window.FB_ADMIN) window.FB_ADMIN(frag);
};

/* ---------- 抽屜內容 ---------- */
A.drawers = {};
const logLine = r => { const by = r.updatedBy ? A.profName(r.updatedBy) : ''; if (r.updatedBy) A.profiles([r.updatedBy]); return r.updatedAt ? h('div', { class: 'note-edit' }, '最後更新：' + (by ? by + '．' : '') + new Date(r.updatedAt).toLocaleString('zh-TW', { hour12: false })) : ''; };
const delBtn = (coll, id, what) => S.canWrite ? h('button', { class: 'btn sm danger', type: 'button', onclick: () => A.confirm('刪除這個' + what + '？', '刪除後無法復原。', '刪除', async () => { await A.del(coll, id); A.closeDrawer(); }, true) }, '刪除') : '';
function ownersPicker(sel, onChange) {
  const box = h('div', { class: 'chips-in', style: 'gap:6px' });
  S.people.forEach(p => { const on = sel.includes(p.id); box.append(h('button', { type: 'button', 'aria-pressed': String(on), style: 'width:auto;padding:0 10px', disabled: !S.canWrite, onclick: () => onChange(on ? sel.filter(x => x !== p.id) : sel.concat(p.id)) }, p.name)); });
  if (!S.people.length) box.append(h('span', { class: 'muted' }, '先到後台新增成員'));
  return box;
}
A.drawers.task = function (id) {
  const t = A.byId('tasks', id); if (!t) return null;
  const up = d => A.patch('tasks', id, d);
  const src = t.source && t.source.meeting ? A.byId('meetings', t.source.meeting) : null;
  return { title: t.title || '工項', actions: delBtn('tasks', id, '工項'), body: [
    A.field('工項名稱', A.inp(t.title, v => up({ title: v }), { id: 't-title' })),
    h('div', { class: 'fgrid' }, A.field('分類', A.sel(t.cat || '其他', CATS, v => up({ cat: v }), { id: 't-cat' })), A.field('狀態', A.sel(t.status || '未開始', STATUS, v => up({ status: v }), { id: 't-st' })),
      A.field('開始', A.inp(t.start, v => up({ start: v }), { type: 'date', id: 't-start' })), A.field('期限', A.inp(t.due, v => up({ due: v }), { type: 'date', id: 't-due' }))),
    A.field('負責人', ownersPicker(t.owners || [], v => up({ owners: v })), true),
    depEditor(t),
    A.field('屬於會議', A.sel(t.meeting || '', [['', '（不屬於特定會議）'], ...S.meetings.slice().sort((a, b) => ((a.date || '9') < (b.date || '9') ? -1 : 1)).map(x => [x.id, (x.date ? A.md(x.date) + ' ' : '') + (x.title || '會議')])], v => up({ meeting: v }), { id: 't-meeting' })),
    A.field('關鍵工項', h('label', { style: 'display:flex;gap:8px;align-items:center' }, h('button', { class: 'chk' + (t.crit ? ' on' : ''), type: 'button', 'aria-label': '關鍵工項', onclick: () => S.canWrite && up({ crit: !t.crit }) }), h('span', { class: 'muted' }, '標記後在清單上會特別標出'))),
    A.field('備註', A.inp(t.note, v => up({ note: v }), { multi: true, id: 't-note' }), true),
    src ? A.field('來源', h('button', { class: 'btn sm', type: 'button', onclick: () => A.openDrawer('meeting', src.id) }, '會議決議：' + (src.title || ''))) : '',
    logLine(t)] };
};
A.drawers.meeting = function (id) {
  const m = A.byId('meetings', id); if (!m) return null;
  const up = d => A.patch('meetings', id, d); const mi = Object.assign({ summary: '', decisions: [], files: [], paths: [] }, m.minutes || {});
  const upMin = p => up({ minutes: Object.assign({}, mi, p) });
  const steps = A.prep(m);
  const stepl = h('div', { class: 'stepl' });
  steps.forEach(s => stepl.append(h('div', null, h('button', { class: 'chk' + (s.done ? ' on' : ''), type: 'button', 'aria-label': '完成' + s.name, onclick: () => { if (!S.canWrite) return; const p = Object.assign({}, m.prep || {}); if (p[s.id]) delete p[s.id]; else p[s.id] = { at: new Date().toISOString(), by: S.myUid || null, who: A.meId() || null }; up({ prep: p }); } }),
    h('span', null, h('b', { style: 'font-weight:500' }, s.name), h('small', { class: 'muted', style: 'margin-left:8px' }, '開會前 ' + s.offset + ' 個工作天'), s.done && s.done.who ? h('small', { class: 'muted', style: 'margin-left:8px' }, '由 ' + A.pname(s.done.who) + ' 勾選') : ''),
    h('span', { class: 'tag ' + (s.st === 'ok' ? 't-good' : s.st === 'late' ? 't-bad' : s.st === 'now' ? 't-blue' : '') }, s.due ? A.mdw(s.due) + (s.st === 'late' ? '．' + lateTxt(s.due) : '') : '待定日期'))));
  if (!steps.length) stepl.append(h('div', null, h('span'), h('span', { class: 'muted' }, '這類會議還沒有會前步驟，管理者可到後台設定。'), h('span')));
  // 決議
  const decs = (mi.decisions || []).map(d => Object.assign({}, d));
  const saveD = () => upMin({ decisions: decs });
  const dbox = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  decs.forEach((d, i) => dbox.append(h('div', { class: 'dec' }, h('button', { class: 'chk' + (d.done ? ' on' : ''), type: 'button', 'aria-label': '辦結', onclick: () => { if (!S.canWrite) return; decs[i].done = !d.done; saveD(); } }),
    A.inp(d.text, v => { decs[i].text = v; saveD(); }, { sm: true, ph: '決議內容' }), A.sel(d.owner || '', A.peopleOpts(), v => { decs[i].owner = v; saveD(); }, { sm: true }),
    A.inp(d.due, v => { decs[i].due = v; saveD(); }, { sm: true, type: 'date' }),
    S.canWrite ? h('button', { class: 'ib', type: 'button', 'aria-label': '刪除決議', onclick: () => { decs.splice(i, 1); saveD(); } }, ic('<path d="M6 6l12 12M18 6L6 18"/>')) : '')));
  const decAct = S.canWrite ? h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, h('button', { class: 'btn sm', type: 'button', onclick: () => { decs.push({ text: '', owner: '', due: '', done: false }); saveD(); } }, '新增決議'),
    decs.some(d => d.text && !d.taskId) ? h('button', { class: 'btn sm', type: 'button', onclick: async () => { for (let i = 0; i < decs.length; i++) { const d = decs[i]; if (!d.text || d.taskId) continue; const tid = A.newId(); await A.put('tasks', tid, { title: d.text, cat: '會議', status: d.done ? '完成' : '未開始', owners: d.owner ? [d.owner] : [], start: m.date || '', due: d.due || '', note: '', crit: false, source: { meeting: id } }); decs[i].taskId = tid; } saveD(); A.toast('決議已轉成工項。'); } }, '把決議轉成工項') : '') : '';
  // 檔案
  const files = h('div', { class: 'files' }, (mi.files || []).map((f, i) => h('div', { class: 'file' }, h('a', { href: f.url || '/_blob/' + f.id, target: '_blank', rel: 'noopener' }, f.name || '檔案'), h('small', null, f.size ? Math.round(f.size / 1024) + ' KB' : ''),
    S.canWrite ? h('button', { class: 'ib', type: 'button', style: 'width:26px;height:26px', 'aria-label': '移除檔案', onclick: () => A.confirm('移除「' + (f.name || '檔案') + '」？', '只從這場會議移除連結，檔案仍保留在平台儲存空間。', '移除', () => { const fs = mi.files.filter((_, j) => j !== i); upMin({ files: fs }); }) }, ic('<path d="M6 6l12 12M18 6L6 18"/>')) : '')));
  const pick = h('input', { type: 'file', accept: '.pdf,image/png,image/jpeg,image/webp', multiple: true, style: 'display:none', id: 'file-' + id });
  const drop = h('div', { class: 'drop', tabindex: 0, role: 'button', onclick: () => pick.click(), onkeydown: e => { if (e.key === 'Enter') pick.click(); } }, A.assets ? ['把會議紀錄 ', h('b', null, '拖到這裡'), ' 或點這裡選檔（PDF、圖片，單檔 20 MB 內）'] : '這個檢視無法上傳檔案（需要編輯權限）；可以先把伺服器路徑貼在下面。');
  const upload = async fl => { if (!A.assets) { A.toast('這個檢視無法上傳檔案。'); return; } const add = [];
    for (const f of fl) { if (/\.docx?$/i.test(f.name)) { A.toast('Word 檔請先另存成 PDF 再上傳。'); continue; }
      try { A.toast('上傳中：' + f.name); const r = await A.assets.upload(f); add.push({ id: r.id, url: r.url || null, name: f.name, size: r.sizeBytes, type: r.contentType, at: new Date().toISOString(), by: S.myUid || null }); }
      catch (e) { A.toast(e && e.code === 'too_large' ? f.name + ' 超過大小上限' : e && e.code === 'unsupported_type' ? f.name + ' 格式不支援，請轉成 PDF' : '上傳失敗：' + f.name); } }
    if (add.length) { const cur = (A.byId('meetings', id).minutes || {}).files || []; await upMin({ files: cur.concat(add) }); A.toast('已上傳 ' + add.length + ' 個檔案。'); } };
  pick.addEventListener('change', () => upload([...pick.files]));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('on'); }); drop.addEventListener('dragleave', () => drop.classList.remove('on'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('on'); upload([...e.dataTransfer.files]); });
  const pathIn = h('input', { class: 'in sm', placeholder: '伺服器路徑，例如 \\\\Chm22\\data\\…\\會議紀錄.docx', id: 'path-' + id, style: 'flex:1' });
  const paths = h('div', { class: 'files' }, (mi.paths || []).map((p, i) => h('div', { class: 'file' }, h('span', { style: 'user-select:all;font-family:var(--mono);font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis' }, p),
    S.canWrite ? h('button', { class: 'ib', type: 'button', style: 'width:26px;height:26px;margin-left:auto', 'aria-label': '移除路徑', onclick: () => upMin({ paths: mi.paths.filter((_, j) => j !== i) }) }, ic('<path d="M6 6l12 12M18 6L6 18"/>')) : '')));
  const iss = (m.issues || []).map(Number);
  const issChips = h('div', { class: 'chips-in' }); for (let n = 1; n <= 24; n++) { const on = iss.includes(n); issChips.append(h('button', { type: 'button', 'aria-pressed': String(on), disabled: !S.canWrite, onclick: () => up({ issues: on ? iss.filter(x => x !== n) : iss.concat(n).sort((a, b) => a - b) }) }, n)); }
  const rks = A.meetRisks(m);
  return { title: m.title || '會議', actions: delBtn('meetings', id, '會議'), body: [
    h('div', { class: 'sec' }, A.field('會議名稱', A.inp(m.title, v => up({ title: v }), { id: 'm-title' })),
      h('div', { class: 'fgrid' }, A.field('類型', A.sel(m.type || '', [['', '未分類'], ...types().map(t => [t.id, t.name])], v => up({ type: v }), { id: 'm-type' })), A.field('狀態', A.sel(m.status || '規劃中', MSTATUS, v => up({ status: v }), { id: 'm-st' })),
        A.field('開會日期', A.inp(m.date, v => A.changeMeetingDate(A.byId('meetings', id) || m, v), { type: 'date', id: 'm-date' })), A.field('時間', A.inp(m.time, v => up({ time: v }), { ph: '14:00', id: 'm-time' })),
        A.field('地點', A.inp(m.place, v => up({ place: v }), { id: 'm-place' })), A.field('縣市', A.sel(m.county || '', [['', '（地圖用，可不填）'], ...COUNTIES], v => up({ county: v }), { id: 'm-county' })),
        A.field('最晚召開日', A.inp(m.latest, v => up({ latest: v }), { type: 'date', id: 'm-latest' })))),
    h('div', { class: 'sec' }, h('h4', null, '會前作業', h('small', null, '依後台範本，從開會日往前推工作天')), riskList(rks), stepl),
    h('div', { class: 'sec' }, h('h4', null, '出席與會議文件', h('small', null, '出席者從通訊錄選，文件會自動帶入')),
      h('div', { class: 'fgrid' }, A.field('主持人', A.inp(m.chair, v => up({ chair: v }), { id: 'm-chair', ph: '例如：○○組○組長' })), A.field('聯絡人及電話', A.inp(m.contactPerson, v => up({ contactPerson: v }), { id: 'm-cp' }))),
      A.field('出席者', attPicker(m), true),
      A.field('其他出席', A.inp(m.attendNote, v => up({ attendNote: v }), { multi: true, id: 'm-attn', ph: '不在通訊錄的單位或人員，一行一個' }), true),
      h('div', { class: 'doc-btns' }, ['開會通知單', '簽到表', '會議紀錄'].map(k => h('button', { class: 'btn sm', type: 'button', onclick: () => A.meetDoc(A.byId('meetings', id) || m, k) }, '下載' + k)))),
    h('div', { class: 'sec' }, h('h4', null, '會議紀錄', h('small', null, '摘要、決議與檔案')), A.inp(mi.summary, v => upMin({ summary: v }), { multi: true, ph: '重點摘要：討論了什麼、結論是什麼', id: 'm-sum' })),
    h('div', { class: 'sec' }, h('h4', null, '決議事項', h('small', null, '可指定負責人與期限，逾期會出現在提醒')), dbox, decAct),
    h('div', { class: 'sec' }, h('h4', null, '檔案'), files, S.canWrite ? drop : '', pick,
      S.canWrite ? h('div', { style: 'display:flex;gap:8px' }, pathIn, h('button', { class: 'btn sm', type: 'button', onclick: () => { const v = pathIn.value.trim(); if (v) upMin({ paths: (mi.paths || []).concat(v) }); } }, '加入路徑')) : '', paths),
    h('div', { class: 'sec' }, h('h4', null, '關聯議題', h('small', null, '標上後，議題頁會列出這場會議的討論')), issChips),
    logLine(m)] };
};
A.drawers.issue = function (id) {
  const i = A.byId('issues', id); if (!i) return null;
  const up = d => A.patch('issues', id, d); const nt = Object.assign({}, i.notes || {});
  const note = (k, label) => A.field(label, A.inp(nt[k], v => { nt[k] = v; up({ notes: Object.assign({}, nt) }); }, { multi: true, id: 'i-' + k }), true);
  const dis = S.meetings.filter(m => (m.issues || []).map(Number).includes(Number(i.no))).sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1));
  const hist = h('div', { style: 'display:flex;flex-direction:column' }, dis.length ? dis.map(m => { const mi = m.minutes || {};
    return h('button', { class: 'ms', type: 'button', onclick: () => A.openDrawer('meeting', m.id) }, h('div', { class: 'nd' }), h('div', null, h('div', { class: 'h' }, h('b', null, m.title || '會議'), h('small', null, A.roc(m.date))),
      mi.summary ? h('p', null, mi.summary) : '', (mi.decisions || []).length ? h('div', { class: 'tg' }, mi.decisions.map(d => h('span', null, (d.done ? '✓ ' : '') + d.text))) : '')); }) : h('p', { class: 'muted' }, '還沒有會議標上這個議題。'));
  const n = pagesOf(i);
  return { title: '議題 ' + i.no + (i.name ? '　' + i.name : ''), body: [
    h('div', { class: 'sec' }, A.field('議題名稱', A.inp(i.name, v => up({ name: v }), { id: 'i-name' })),
      h('div', { class: 'fgrid' }, A.field('工作小組', A.sel(i.group || '', [['', '未設定'], ...GROUPS], v => up({ group: v }), { id: 'i-group' })), A.field('導讀人', A.sel(i.reader || '', A.peopleOpts(), v => up({ reader: v }), { id: 'i-reader' })),
        A.field('報告頁碼', h('span', { class: 'muted num' }, i.pages ? '印刷頁 ' + i.pages[0] + '–' + i.pages[1] + '（' + n + ' 頁）' : '未設定')), A.field('已讀頁數', A.inp(i.readPages, v => up({ readPages: v }), { type: 'number', id: 'i-read' })),
        A.field('狀態', A.sel(i.status || '未開始', ISTATUS, v => up({ status: v }), { id: 'i-st' })), A.field('摘要期限', A.inp(i.summaryDue, v => up({ summaryDue: v }), { type: 'date', id: 'i-due' })),
        A.field('處理方式', A.sel(i.handling || '', [['', '待定'], '修正全國國土計畫', '修正其他相關規定', '不修'], v => up({ handling: v }), { id: 'i-hand' })), A.field('對應章節', A.inp(i.chapter, v => up({ chapter: v }), { id: 'i-chap', ph: '例如：第八章' })))),
    h('div', { class: 'sec' }, h('h4', null, '導讀內容', h('small', null, '照報告每個議題的四段，加上實務對照與待釐清')), note('bg', '背景'), note('content', '主要內容'), note('qa', '外界問答'), note('next', '後續研議'), note('practice', '實務對照'), note('open', '待釐清')),
    h('div', { class: 'sec' }, h('h4', null, '歷次討論', h('small', null, dis.length + ' 場會議')), hist),
    logLine(i)] };
};
A.drawers.letter = function (id) {
  const l = A.byId('letters', id); if (!l) return null; const up = d => A.patch('letters', id, d);
  return { title: l.subject || '公文', actions: delBtn('letters', id, '公文'), body: [
    h('div', { class: 'fgrid' }, A.field('類別', A.sel(l.kind || '收文', ['收文', '發文'], v => up({ kind: v }), { id: 'l-kind' })), A.field('日期', A.inp(l.date, v => up({ date: v }), { type: 'date', id: 'l-date' })),
      A.field('文號', A.inp(l.no, v => up({ no: v }), { id: 'l-no' })), A.field('辦理期限', A.inp(l.due, v => up({ due: v }), { type: 'date', id: 'l-due' })),
      A.field('承辦', A.sel(l.owner || '', A.peopleOpts(), v => up({ owner: v }), { id: 'l-owner' })), A.field('狀態', A.sel(l.status || '待辦', ['待辦', '已辦結'], v => up({ status: v }), { id: 'l-st' }))),
    A.field('主旨', A.inp(l.subject, v => up({ subject: v }), { multi: true, id: 'l-sub' }), true), A.field('備註', A.inp(l.note, v => up({ note: v }), { multi: true, id: 'l-note' }), true), logLine(l)] };
};
A.drawers.review = function (id) {
  const r = A.byId('reviews', id); if (!r) return null; const up = d => A.patch('reviews', id, d);
  return { title: (r.report || '審查意見') + (r.who ? '．' + r.who : ''), actions: delBtn('reviews', id, '審查意見'), body: [
    h('div', { class: 'fgrid' }, A.field('報告', A.sel(r.report || '工作計畫書', ['工作計畫書', '期中報告', '期末報告', '總結報告'], v => up({ report: v }), { id: 'r-rep' })), A.field('委員／單位', A.inp(r.who, v => up({ who: v }), { id: 'r-who' })),
      A.field('負責', A.sel(r.owner || '', A.peopleOpts(), v => up({ owner: v }), { id: 'r-owner' })), A.field('狀態', A.sel(r.status || '未回應', ['未回應', '已回應'], v => up({ status: v }), { id: 'r-st' }))),
    A.field('意見', A.inp(r.opinion, v => up({ opinion: v }), { multi: true, id: 'r-op' }), true), A.field('回應', A.inp(r.response, v => up({ response: v }), { multi: true, id: 'r-res' }), true),
    A.field('修正頁次', A.inp(r.pages, v => up({ pages: v }), { id: 'r-pages' })), logLine(r)] };
};

/* ---------- 通訊錄、會議文件、審查意見回應對照表 ---------- */
const CKINDS = ['專家學者', '中央機關', '地方政府', '團體', '其他'];
const PROJ_NAME = '全國國土計畫通盤檢討法定作業';
const CN_NUM = '一二三四五六七八九十';
const cnN = i => (i < 10 ? CN_NUM[i] : i < 20 ? '十' + (i === 10 ? '' : CN_NUM[i - 11]) : String(i + 1));
const rocLong = d => { if (!d) return '　　年　　月　　日'; const x = A.parse(d); return '中華民國 ' + (x.getFullYear() - 1911) + ' 年 ' + (x.getMonth() + 1) + ' 月 ' + x.getDate() + ' 日（星期' + '日一二三四五六'[x.getDay()] + '）'; };
const attList = m => { const cs = S.contacts || []; return (m.attendees || []).map(id => cs.find(c => c.id === id)).filter(Boolean); };
const extraAtt = m => String(m.attendNote || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
A.newContact = async function () { const id = A.newId(); if (await A.put('contacts', id, { name: '', org: '', title: '', phone: '', email: '', kind: '專家學者', note: '' })) A.openDrawer('contact', id); };
A.drawers.contact = function (id) {
  const c = A.byId('contacts', id); if (!c) return null; const up = d => A.patch('contacts', id, d);
  const ms = S.meetings.filter(m => (m.attendees || []).includes(id)).sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1));
  return { title: c.name || '聯絡人', actions: delBtn('contacts', id, '聯絡人'), body: [
    h('div', { class: 'fgrid' }, A.field('姓名', A.inp(c.name, v => up({ name: v }), { id: 'c-name' })), A.field('類別', A.sel(c.kind || '專家學者', CKINDS, v => up({ kind: v }), { id: 'c-kind' })),
      A.field('單位', A.inp(c.org, v => up({ org: v }), { id: 'c-org' })), A.field('職稱', A.inp(c.title, v => up({ title: v }), { id: 'c-title' })),
      A.field('電話', A.inp(c.phone, v => up({ phone: v }), { id: 'c-phone' })), A.field('Email', A.inp(c.email, v => up({ email: v }), { id: 'c-email' }))),
    A.field('專長／備註', A.inp(c.note, v => up({ note: v }), { multi: true, id: 'c-note', ph: '專長領域、聯絡注意事項' }), true),
    h('div', { class: 'sec' }, h('h4', null, '出席紀錄', h('small', null, ms.length + ' 場')),
      ms.length ? h('div', null, ms.map(m => h('button', { class: 'rowx', type: 'button', onclick: () => A.openDrawer('meeting', m.id) }, h('span', { class: 'dd' }, m.date ? A.md(m.date) : '未定'), h('b', null, m.title || '會議'), stTag(m.status || '規劃中'))))
        : h('div', { class: 'muted' }, '還沒有出席紀錄。在會議的「出席者」加入他，就會出現在這裡。')),
    logLine(c)] };
};
function attPicker(m) {
  const cs = S.contacts || [], sel = (m.attendees || []).filter(id => cs.some(c => c.id === id));
  const set = v => A.patch('meetings', m.id, { attendees: v });
  const box = h('div', { class: 'att-box' });
  sel.forEach(id => { const c = cs.find(x => x.id === id); box.append(h('span', { class: 'att' }, (c.org ? c.org + '　' : '') + (c.name || ''), S.canWrite ? h('button', { type: 'button', 'aria-label': '移除出席者', onclick: () => set(sel.filter(x => x !== id)) }, '×') : '')); });
  if (S.canWrite && cs.length) {
    const s = h('select', { class: 'in sm', id: 'm-att-add', style: 'width:auto;max-width:100%' }, h('option', { value: '' }, '＋ 加入出席者'));
    CKINDS.forEach(k => { const g = cs.filter(c => (c.kind || '其他') === k && !sel.includes(c.id)); if (g.length) s.append(h('optgroup', { label: k }, g.map(c => h('option', { value: c.id }, (c.org ? c.org + '．' : '') + (c.name || ''))))); });
    s.addEventListener('change', () => { const v = s.value; s.blur(); if (v) set(sel.concat(v)); });
    box.append(s);
  }
  if (!cs.length) box.append(h('small', { class: 'muted' }, '通訊錄還沒有人，先到「文件 → 通訊錄」新增。'));
  return box;
}
A.meetDoc = async function (m, kind) {
  const P = A.docx.para, T = m.title || '會議', when = rocLong(m.date) + (m.time ? '　' + m.time : '');
  const base = (m.date ? m.date.replace(/-/g, '') + '_' : '') + T.replace(/[\\/:*?"<>|]/g, '_');
  let x = '';
  if (kind === '開會通知單') {
    const who = attList(m).map(c => c.org ? c.org + (c.title || c.name ? '（' + [c.title, c.name].filter(Boolean).join(' ') + '）' : '') : c.name).concat(extraAtt(m));
    const L = (k, v) => P(k + '：' + (v || ''), { left: 1680, hanging: 1680, after: 100 });
    x += P('開會通知單', { b: true, sz: 20, align: 'center', after: 300 });
    x += L('受文者', '如出席者') + L('發文日期', rocLong(today()).replace(/（.*$/, '')) + L('開會事由', T) + L('開會時間', when) + L('開會地點', m.place) + L('主持人', m.chair)
      + L('聯絡人及電話', m.contactPerson) + L('出席者', who.join('、')) + L('列席者', '') + L('副本', '')
      + L('備註', (m.issues || []).length ? '本次討論議題：' + m.issues.map(n => '議題 ' + n).join('、') : '');
  } else if (kind === '簽到表') {
    x += P(T + '　簽到表', { b: true, sz: 18, align: 'center', after: 160 });
    x += P('時間：' + when, { sz: 12, after: 0 }) + P('地點：' + (m.place || ''), { sz: 12, after: 0 }) + P('主持人：' + (m.chair || '') + '　　　　　　　　　　紀錄：', { sz: 12, after: 160 });
    const rows = [['單位', '職稱', '姓名', '簽名']].concat(attList(m).map(c => [c.org || '', c.title || '', c.name || '', ''])).concat(extraAtt(m).map(s => [s, '', '', '']));
    while (rows.length < 17) rows.push(['', '', '', '']);
    x += A.docx.tbl([3000, 1900, 1900, 2838], rows, { header: true, sz: 12, rowH: 620 });
  } else {
    const mi = m.minutes || {}, decs = mi.decisions || [];
    const L = (k, v) => P(k + (v || ''), { left: 560, hanging: 560, after: 80 });
    const S2 = (i, t) => P('（' + cnN(i) + '）' + t, { left: 1400, hanging: 840, after: 60 });
    x += P(T + '　會議紀錄', { b: true, sz: 18, align: 'center', after: 300 });
    x += L('一、時間：', when) + L('二、地點：', m.place) + L('三、主持人：', (m.chair || '') + '　　　　　紀錄：') + L('四、出（列）席人員：', '詳簽到表');
    x += L('五、討論事項及重點摘要：', mi.summary ? '' : '（請填寫）');
    String(mi.summary || '').split(/\n+/).map(s => s.trim()).filter(Boolean).forEach((s, i) => { x += S2(i, s.replace(/^[（(]?[一二三四五六七八九十\d]+[）)、.．]\s*/, '')); });
    x += L('六、結論（決議）：', decs.length ? '' : '（請填寫）');
    decs.forEach((d, i) => { const tail = [A.pname(d.owner), d.due ? A.md(d.due) + ' 前完成' : ''].filter(Boolean).join('，'); x += S2(i, (d.text || '') + (tail ? '（' + tail + '）' : '')); });
    x += L('七、散會：', '');
  }
  await A.makeDocx(base + '_' + kind + '.docx', x);
};
A.reviewDoc = async function (rp) {
  const rs = S.reviews.filter(r => (r.report || '工作計畫書') === rp);
  if (!rs.length) { A.toast('「' + rp + '」還沒有審查意見。'); return; }
  const order = []; rs.forEach(r => { const w = r.who || '未填委員／單位'; if (!order.includes(w)) order.push(w); });
  const rows = [['編號', '審查意見', '回應說明', '修正頁次']];
  order.forEach((w, gi) => { rows.push({ span: w }); rs.filter(r => (r.who || '未填委員／單位') === w).forEach((r, i) => rows.push([{ t: (gi + 1) + '-' + (i + 1), align: 'center' }, r.opinion || '', r.response || '（待回應）', { t: r.pages || '', align: 'center' }])); });
  const x = A.docx.para('「' + PROJ_NAME + '」' + rp + '審查意見回應對照表', { b: true, sz: 16, align: 'center', after: 240 }) + A.docx.tbl([900, 3770, 3768, 1200], rows, { header: true, sz: 12 });
  await A.makeDocx(rp + '_審查意見回應對照表.docx', x, { sz: 12 });
};

/* ---------- 前置工項（相依）：前置延誤、排程衝突、甘特圖連線 ---------- */
A.depRisk = function (t, seen) {
  seen = seen || new Set(); const out = [], td = today();
  (t.deps || []).forEach(d => { if (seen.has(d)) return; seen.add(d); const p = A.byId('tasks', d); if (!p) return;
    if (p.status !== '完成' && p.due && p.due < td) out.push(p.title); out.push(...A.depRisk(p, seen)); });
  return [...new Set(out)];
};
A.depConflict = t => { const s = t.start || t.due; return s ? (t.deps || []).map(d => A.byId('tasks', d)).filter(p => p && p.status !== '完成' && p.due && p.due >= s).map(p => p.title) : []; };
function depEditor(t) {
  const deps = (t.deps || []).map(d => A.byId('tasks', d)).filter(Boolean), td = today();
  const succ = S.tasks.filter(u => (u.deps || []).includes(t.id));
  const desc = new Set(); const walk = id => S.tasks.forEach(u => { if ((u.deps || []).includes(id) && !desc.has(u.id)) { desc.add(u.id); walk(u.id); } }); walk(t.id);
  const set = v => A.patch('tasks', t.id, { deps: v });
  const li = (d, rm) => h('div', { class: 'dep' + (d.status === '完成' ? ' done' : d.due && d.due < td ? ' late' : '') },
    h('button', { type: 'button', class: 'dep-t', onclick: () => A.openDrawer('task', d.id) }, d.title || '工項'), h('small', null, d.due ? A.md(d.due) : ''), stTag(d.status || '未開始'),
    rm && S.canWrite ? h('button', { type: 'button', class: 'dep-x', 'aria-label': '移除前置工項', onclick: () => set((t.deps || []).filter(x => x !== d.id)) }, '×') : '');
  const box = h('div', { class: 'sec' }, h('h4', null, '前置工項', h('small', null, deps.length ? '要等這些完成．' + deps.filter(d => d.status === '完成').length + '/' + deps.length + ' 已完成' : '要等哪些工項完成才能開始')));
  deps.forEach(d => box.append(li(d, true)));
  if (t.status !== '完成') { const rk = A.depRisk(t), cf = A.depConflict(t);
    if (rk.length) box.append(h('div', { class: 'rk bad', style: 'margin-top:6px' }, ic(I_ALERT), '前置延誤：' + rk.join('、')));
    if (cf.length) box.append(h('div', { class: 'rk warn', style: 'margin-top:6px' }, ic(I_ALERT), '排程衝突：開始日早於前置工項的期限（' + cf.join('、') + '）')); }
  if (S.canWrite) {
    const opts = S.tasks.filter(u => u.id !== t.id && !desc.has(u.id) && !(t.deps || []).includes(u.id)).sort((a, b) => ((a.due || '9') < (b.due || '9') ? -1 : 1));
    const s = h('select', { class: 'in sm', id: 't-dep-add', style: 'width:auto;max-width:100%;margin-top:8px' }, h('option', { value: '' }, '＋ 加前置工項'), opts.map(u => h('option', { value: u.id }, (u.due ? A.md(u.due) + '　' : '') + (u.title || '工項'))));
    s.addEventListener('change', () => { const v = s.value; s.blur(); if (v) set((t.deps || []).concat(v)); });
    box.append(s);
  }
  if (succ.length) { box.append(h('h4', { style: 'margin-top:16px' }, '在等這項的工項', h('small', null, succ.length + ' 項'))); succ.forEach(d => box.append(li(d, false))); }
  return box;
}
function gxLinks(body, pos, W, LW, dated) {
  const NS = 'http://www.w3.org/2000/svg', td = today();
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'gx-links'); svg.setAttribute('width', W); svg.setAttribute('height', body.scrollHeight); svg.style.left = LW + 'px';
  const defs = document.createElementNS(NS, 'defs');
  [['n', 'var(--ink-2)'], ['c', 'var(--bad)'], ['r', 'var(--bad)']].forEach(([id, col]) => { const m = document.createElementNS(NS, 'marker'); m.setAttribute('id', 'gxa-' + id); m.setAttribute('viewBox', '0 0 8 8'); m.setAttribute('refX', '7'); m.setAttribute('refY', '4'); m.setAttribute('markerWidth', '7'); m.setAttribute('markerHeight', '7'); m.setAttribute('orient', 'auto-start-reverse'); const p = document.createElementNS(NS, 'path'); p.setAttribute('d', 'M0,0 L8,4 L0,8 z'); p.setAttribute('style', 'fill:' + col); m.append(p); defs.append(m); });
  svg.append(defs); let hidden = 0;
  dated.forEach(t => (t.deps || []).forEach(d => {
    const P = pos[d], Q = pos[t.id]; if (!P || !Q) { if (A.byId('tasks', d)) hidden++; return; }
    const y1 = P.row.offsetTop + P.row.offsetHeight / 2, y2 = Q.row.offsetTop + Q.row.offsetHeight / 2, pred = A.byId('tasks', d);
    const kind = pred && pred.status !== '完成' && pred.due && pred.due < td ? 'r' : pred && pred.crit && t.crit ? 'c' : 'n';
    const xa = P.x2, xb = Q.x1, gap = 6; let ds;
    if (xb - gap > xa + gap) { const mx = Math.max(xa + gap, xb - gap); ds = 'M' + xa + ',' + y1 + ' H' + mx + ' V' + y2 + ' H' + xb; }
    else { const my = y2 - (y2 > y1 ? 11 : -11); ds = 'M' + xa + ',' + y1 + ' H' + (xa + gap) + ' V' + my + ' H' + (xb - gap) + ' V' + y2 + ' H' + xb; }
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', ds); p.setAttribute('class', kind); p.setAttribute('marker-end', 'url(#gxa-' + kind + ')');
    const ti = document.createElementNS(NS, 'title'); ti.textContent = (pred ? pred.title : '') + ' → ' + t.title; p.append(ti); svg.append(p);
  }));
  body.append(svg);
  return hidden;
}
/* ---------- 甘特圖輸出：A4 橫式，畫在 canvas 上再組 PDF／列印版 ---------- */
const gxFilterText = () => { const f = S.f, out = []; if (f.owner) out.push('負責：' + A.pname(f.owner)); if (f.status === 'open') out.push('未完成'); else if (f.status !== 'all') out.push(f.status); if (f.q) out.push('關鍵字：' + f.q); if (S.gCrit) out.push('只看關鍵'); return out.join('．') || '全部工項'; };
async function ganttPages() {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const list = filteredTasks().filter(t => !S.gCrit || t.crit), dated = list.filter(t => t.due || t.start), und = list.length - dated.length;
  if (!dated.length) throw new Error('nogantt');
  const C = { bar: '#2f9e8b', soft: '#d9efea', bad: '#b4413a', ink: '#24231f', ink2: '#5b5850', line: '#dcd6ca', sf2: '#f4f0e8', off: 'rgba(120,105,80,.10)', grid: 'rgba(120,105,80,.20)' };
  const FONT = '"Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif', td = today();
  let min = td, max = td;
  dated.forEach(t => { const a = t.start || t.due, e = t.due || t.start; if (a < min) min = a; if (e > max) max = e; if (a > max) max = a; });
  min = A.addDays(min, -1); max = A.addDays(max, 1);
  const days = A.diff(max, min) + 1, dates = []; for (let i = 0; i < days; i++) dates.push(A.addDays(min, i));
  const rows = [], byStart = (p, q) => { const a = p.start || p.due, b = q.start || q.due; return a < b ? -1 : a > b ? 1 : 0; };
  CATS.concat([...new Set(dated.map(t => t.cat || '其他'))].filter(c => !CATS.includes(c))).forEach(c => { const items = dated.filter(t => (t.cat || '其他') === c); if (!items.length) return;
    const ss = items.map(t => t.start || t.due).sort(), ee = items.map(t => t.due || t.start).sort();
    rows.push({ k: 'g', label: c + '（' + items.filter(t => t.status === '完成').length + '/' + items.length + '）', a: ss[0], e: ee[ee.length - 1] }); items.sort(byStart).forEach(t => rows.push({ k: 't', t })); });
  const SC = 2, PW = 1123, PH = 794, M = 28, LW = 300, TH = 56, MH = 18, DH = 20, HH = MH + DH, RH = 20, FH = 30;
  const X0 = M + LW, TW = PW - M - X0, DW = TW / days, hy = M + TH, bodyTop = hy + HH, per = Math.max(1, Math.floor((PH - M - FH - bodyTop) / RH));
  const xd = d => X0 + A.diff(d, min) * DW, npg = Math.ceil(rows.length / per);
  const dls = S.project.startDate ? A.deliverables().map(v => ({ n: v.name, d: A.delivDue(v) })).filter(v => v.d >= min && v.d <= max) : [];
  const fit = (ctx, tx, w) => { if (ctx.measureText(tx).width <= w) return tx; let s2 = tx; while (s2.length > 1 && ctx.measureText(s2 + '…').width > w) s2 = s2.slice(0, -1); return s2 + '…'; };
  const rr = (ctx, x, y, w, hh, rad) => { rad = Math.min(rad, hh / 2, w / 2); ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + hh, rad); ctx.arcTo(x + w, y + hh, x, y + hh, rad); ctx.arcTo(x, y + hh, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath(); };
  const vline = (ctx, x, y1, y2, col, w, dash) => { ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, y1); ctx.lineTo(Math.round(x) + .5, y2); ctx.stroke(); ctx.restore(); };
  const hline = (ctx, x1, x2, y, col, w) => { ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w || 1; ctx.beginPath(); ctx.moveTo(x1, Math.round(y) + .5); ctx.lineTo(x2, Math.round(y) + .5); ctx.stroke(); ctx.restore(); };
  const now = new Date(), stampTxt = (now.getMonth() + 1) + '/' + now.getDate() + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const pages = [];
  for (let p = 0; p < npg; p++) {
    const cv = document.createElement('canvas'); cv.width = PW * SC; cv.height = PH * SC; const ctx = cv.getContext('2d'); ctx.scale(SC, SC);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PW, PH); ctx.textBaseline = 'middle';
    ctx.fillStyle = C.ink; ctx.font = '700 18px ' + FONT; ctx.textAlign = 'left'; ctx.fillText('國土通檢專案控管｜時程甘特圖', M, M + 12);
    ctx.font = '11px ' + FONT; ctx.fillStyle = C.ink2;
    ctx.fillText(fit(ctx, '115A-044．' + gxFilterText() + '．' + A.md(min) + ' – ' + A.md(max) + (und ? '．' + und + ' 項未排日期（未列入）' : ''), PW - 2 * M - 260), M, M + 34);
    ctx.textAlign = 'right'; ctx.fillText('輸出時間 ' + stampTxt, PW - M, M + 12);
    if (dls.length) { ctx.fillStyle = C.bad; ctx.font = '700 11px ' + FONT; ctx.fillText(dls.map(v => '▌' + A.md(v.d) + ' ' + v.n).join('　'), PW - M, M + 34); }
    hline(ctx, M, PW - M, hy - 7, C.ink, 1.5);
    ctx.fillStyle = C.sf2; ctx.fillRect(M, hy, PW - 2 * M, HH);
    ctx.fillStyle = C.ink2; ctx.font = '11px ' + FONT; ctx.textAlign = 'left'; ctx.fillText('工項', M + 8, hy + HH / 2);
    let ms = 0;
    for (let i = 0; i <= days; i++) { if (i === days || dates[i].slice(8) === '01' || i === 0) { if (i > 0) { const x1 = X0 + ms * DW, x2 = X0 + i * DW; ctx.save(); ctx.beginPath(); ctx.rect(x1, hy, x2 - x1, MH); ctx.clip(); ctx.fillStyle = C.ink; ctx.font = '500 11px ' + FONT; ctx.fillText((+dates[ms].slice(0, 4) - 1911) + ' 年 ' + (+dates[ms].slice(5, 7)) + ' 月', x1 + 5, hy + MH / 2); ctx.restore(); vline(ctx, x1, hy, hy + MH, C.line, 1); } ms = i; } }
    hline(ctx, X0, PW - M, hy + MH, C.line, 1);
    const dy = hy + MH; ctx.font = (DW >= 15 ? 10 : 9) + 'px ' + FONT; ctx.textAlign = 'center';
    dates.forEach((d, i) => { const x = X0 + i * DW, dt = A.parse(d), dl = dls.some(v => v.d === d);
      if (dl) { ctx.fillStyle = C.bad; ctx.fillRect(x, dy, DW, DH); ctx.fillStyle = '#fff'; }
      else if (d === td) { ctx.fillStyle = C.ink; ctx.fillRect(x, dy, DW, DH); ctx.fillStyle = '#fff'; }
      else { if (A.isOff(d)) { ctx.fillStyle = C.off; ctx.fillRect(x, dy, DW, DH); } ctx.fillStyle = C.ink2; }
      if ((DW >= 11 || (dt.getDay() === 1 && DW * 7 >= 26) || dl || d === td)) ctx.fillText(DW >= 11 ? String(dt.getDate()) : (dt.getMonth() + 1) + '/' + dt.getDate(), x + DW / 2, dy + DH / 2); });
    const pr = rows.slice(p * per, (p + 1) * per), bodyH = pr.length * RH, yEnd = bodyTop + bodyH;
    dates.forEach((d, i) => { const x = X0 + i * DW; if (A.isOff(d)) { ctx.fillStyle = C.off; ctx.fillRect(x, bodyTop, DW, bodyH); } if (DW >= 8 || A.parse(d).getDay() === 1) vline(ctx, x, bodyTop, yEnd, C.grid, .5); });
    pr.forEach((row, i) => { const y = bodyTop + i * RH;
      if (row.k === 'g') { ctx.fillStyle = C.sf2; ctx.fillRect(M, y, PW - 2 * M, RH); ctx.fillStyle = C.ink; ctx.font = '700 12px ' + FONT; ctx.textAlign = 'left'; ctx.fillText(fit(ctx, row.label, LW - 16), M + 8, y + RH / 2);
        const x1 = xd(row.a) + 1, x2 = xd(row.e) + DW - 1; ctx.globalAlpha = .4; ctx.fillStyle = C.ink2; rr(ctx, x1, y + RH / 2 - 3, Math.max(x2 - x1, 4), 6, 3); ctx.fill(); ctx.globalAlpha = 1; }
      else { const t = row.t, st = t.status || '未開始', done = st === '完成', late = t.due && t.due < td && !done, risk = !done && A.depRisk(t).length;
        ctx.fillStyle = done ? C.ink2 : (risk || late ? C.bad : C.ink); ctx.font = '11.5px ' + FONT; ctx.textAlign = 'left'; ctx.fillText(fit(ctx, (risk ? '⚠ ' : '') + (t.title || ''), LW - 30), M + 20, y + RH / 2);
        const a = t.start || t.due, e = t.due || t.start, a1 = a <= e ? a : e, e1 = a <= e ? e : a, x1 = xd(a1) + 1, w = Math.max(xd(e1) + DW - 1 - x1, 4), by = y + 4, bh = RH - 8;
        ctx.globalAlpha = done ? .35 : 1;
        if (st === '未開始') { ctx.fillStyle = C.soft; rr(ctx, x1, by, w, bh, 3); ctx.fill(); ctx.strokeStyle = C.bar; ctx.lineWidth = 1.2; rr(ctx, x1, by, w, bh, 3); ctx.stroke(); }
        else { ctx.fillStyle = C.bar; rr(ctx, x1, by, w, bh, 3); ctx.fill(); }
        ctx.globalAlpha = 1;
        if (late) { ctx.strokeStyle = C.bad; ctx.lineWidth = 1.6; rr(ctx, x1 - 1, by - 1, w + 2, bh + 2, 4); ctx.stroke(); }
        if (t.crit) { ctx.save(); ctx.strokeStyle = C.bad; ctx.lineWidth = 1.3; ctx.setLineDash([3, 2]); rr(ctx, x1 - 2.5, by - 2.5, w + 5, bh + 5, 4); ctx.stroke(); ctx.restore(); }
        if (t.due) { ctx.fillStyle = late ? C.bad : C.ink2; ctx.font = '10px ' + FONT; const lx = x1 + w + 4; if (lx + 30 < PW - M) { ctx.textAlign = 'left'; ctx.fillText(A.md(t.due), lx, y + RH / 2); } } }
      hline(ctx, M, PW - M, y + RH, C.line, .8); });
    const lineAt = (d, col, w, dash) => { if (d < min || d > max) return; vline(ctx, X0 + A.diff(d, min) * DW + DW / 2, bodyTop, yEnd, col, w, dash); };
    lineAt(td, C.ink, 1.4); dls.forEach(v => lineAt(v.d, C.bad, 1.2, [4, 3]));
    vline(ctx, X0, hy, yEnd, C.line, 1); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(M + .5, hy + .5, PW - 2 * M - 1, yEnd - hy - 1);
    const fy = PH - M - FH / 2 + 4; let lx = M; ctx.font = '10.5px ' + FONT; ctx.textAlign = 'left';
    const key = (txt, kind) => {
      if (kind === 'todo') { ctx.fillStyle = C.soft; rr(ctx, lx, fy - 5, 14, 10, 2); ctx.fill(); ctx.strokeStyle = C.bar; ctx.lineWidth = 1.1; rr(ctx, lx, fy - 5, 14, 10, 2); ctx.stroke(); lx += 18; }
      else if (kind === 'doing') { ctx.fillStyle = C.bar; rr(ctx, lx, fy - 5, 14, 10, 2); ctx.fill(); lx += 18; }
      else if (kind === 'done') { ctx.globalAlpha = .35; ctx.fillStyle = C.bar; rr(ctx, lx, fy - 5, 14, 10, 2); ctx.fill(); ctx.globalAlpha = 1; lx += 18; }
      else if (kind === 'late') { ctx.fillStyle = C.bar; rr(ctx, lx, fy - 5, 14, 10, 2); ctx.fill(); ctx.strokeStyle = C.bad; ctx.lineWidth = 1.6; rr(ctx, lx - 1, fy - 6, 16, 12, 3); ctx.stroke(); lx += 20; }
      else if (kind === 'crit') { ctx.fillStyle = C.bar; rr(ctx, lx, fy - 5, 14, 10, 2); ctx.fill(); ctx.save(); ctx.strokeStyle = C.bad; ctx.lineWidth = 1.3; ctx.setLineDash([3, 2]); rr(ctx, lx - 2.5, fy - 7.5, 19, 15, 3); ctx.stroke(); ctx.restore(); lx += 20; }
      else if (kind === 'today') { ctx.fillStyle = C.ink; ctx.fillRect(lx + 6, fy - 7, 2, 14); lx += 14; }
      else { vline(ctx, lx + 7, fy - 7, fy + 7, C.bad, 1.4, [3, 2]); lx += 14; }
      ctx.fillStyle = C.ink2; ctx.fillText(txt, lx, fy); lx += ctx.measureText(txt).width + 14; };
    key('未開始', 'todo'); key('進行中', 'doing'); key('已完成（淡色）', 'done'); key('已逾期', 'late'); key('關鍵工項', 'crit'); key('今天', 'today'); key('契約交付期限', 'dl');
    ctx.textAlign = 'right'; ctx.fillStyle = C.ink2; ctx.fillText('第 ' + (p + 1) + ' / ' + npg + ' 頁', PW - M, fy);
    pages.push(cv);
  }
  return pages;
}
A.ganttExport = async function (kind) {
  const busy = h('div', { class: 'toast', role: 'status' }, '正在產生甘特圖…'); document.body.append(busy);
  try {
    let pages; try { pages = await ganttPages(); } catch (e) { A.toast(e && e.message === 'nogantt' ? '甘特圖目前沒有可輸出的工項。' : '甘特圖輸出失敗，請稍後再試。'); return; }
    const stamp = today().replace(/-/g, '');
    if (kind === 'pdf') {
      if (!window.jspdf) { try { await A.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'); } catch (_) { A.toast('PDF 元件載入失敗，請改用「列印」，再從列印視窗另存 PDF。'); return; } }
      const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' }), W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
      pages.forEach((c, i) => { if (i) pdf.addPage(); pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, W, H); });
      if (!A.downloads) { A.toast('這個檢視無法下載檔案。'); return; }
      try { await A.downloads.save({ filename: '國土通檢_甘特圖_' + stamp + '.pdf', data: pdf.output('arraybuffer') }); } catch (e) { if (!e || e.code !== 'declined') A.toast('下載失敗：' + ((e && e.message) || '')); }
    } else {
      const imgs = pages.map(c => '<img src="' + c.toDataURL('image/jpeg', 0.92) + '" alt="甘特圖">').join('');
      const doc = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>國土通檢｜甘特圖（列印版）</title><style>@page{size:A4 landscape;margin:0}body{margin:0;background:#fff;font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif}img{display:block;width:100%;page-break-after:always;break-after:page}img:last-child{page-break-after:auto;break-after:auto}.tip{background:#fff7e0;border:1px solid #e8d49a;padding:6px 10px;margin:8px;border-radius:4px;font-size:13px}@media print{.tip{display:none}}</style></head><body><div class="tip">按 Ctrl＋P（Mac：⌘＋P）列印或另存 PDF；紙張選「橫向」、邊界選「無」。</div>' + imgs + '<scr' + 'ipt>window.addEventListener("load",function(){setTimeout(function(){try{window.print()}catch(e){}},400)});</scr' + 'ipt></body></html>';
      const w = window.FB_EMAIL ? window.open('', '_blank') : null;
      if (w) { w.document.open(); w.document.write(doc); w.document.close(); }
      else if (A.downloads) { try { await A.downloads.save({ filename: '國土通檢_甘特圖_列印版_' + stamp + '.html', data: doc }); A.toast('已下載列印版，打開後按 Ctrl＋P。'); } catch (e) { if (!e || e.code !== 'declined') A.toast('下載失敗：' + ((e && e.message) || '')); } }
    }
  } finally { busy.remove(); }
};

A.boot();
})();
