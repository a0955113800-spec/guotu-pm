/* 國土通檢專案控管：Firebase 轉接層（GitHub Pages 版用，取代 claude.ai 的 window.claude.use） */
(function () {
'use strict';
const CFG = {
  apiKey: 'AIzaSyAInmZDTz3IzVxwD6uTXgD5v7VdrmRc3cM',
  authDomain: 'guotu-pm.firebaseapp.com',
  projectId: 'guotu-pm',
  storageBucket: 'guotu-pm.firebasestorage.app',
  messagingSenderId: '919836169824',
  appId: '1:919836169824:web:209ab239c92863e1f45505'
};
firebase.initializeApp(CFG);
const auth = firebase.auth(), fs = firebase.firestore();
const SID = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const lc = s => String(s || '').trim().toLowerCase();
let me = null, isAdmin = false, isMember = false, readyFn, room = null;
const ready = new Promise(r => { readyFn = r; });
const COLORS = ['#2f9e8b', '#3d7cb8', '#c0812f', '#8a6bbf', '#b4574f', '#4f8a5b', '#a1667f', '#5f7f8f'];
const colorOf = id => { let n = 0; for (const c of String(id)) n = (n * 31 + c.charCodeAt(0)) >>> 0; return COLORS[n % COLORS.length]; };

/* 登入畫面 */
const css = document.createElement('style');
css.textContent = '.fbg{position:fixed;inset:0;z-index:999;display:grid;place-items:center;background:var(--bg,#efeae0);padding:16px}' +
  '.fbg .box{max-width:420px;width:100%;background:var(--panel,#fff);border-radius:24px;padding:32px 28px;box-shadow:0 0 0 1px var(--hair,rgba(0,0,0,.08)),0 20px 40px -20px rgba(0,0,0,.25);text-align:center}' +
  '.fbg h1{font-size:22px;margin:0 0 6px}.fbg p{color:var(--ink-2,#5b5850);font-size:14px;line-height:1.7;margin:8px 0 18px}.fbg .em{font-family:var(--num);color:var(--ink,#222)}' +
  '.fbg button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:10px 20px;border-radius:999px;background:var(--ink,#24231f);color:var(--panel,#fff);font-size:14px;font-weight:500;margin:4px}' +
  '.fbg button.ghost{background:transparent;color:var(--ink-2,#5b5850);box-shadow:inset 0 0 0 1px var(--hair-2,rgba(0,0,0,.15))}';
document.head.append(css);
let gateEl = null;
function gate(title, msg, btns) {
  if (!gateEl) { gateEl = document.createElement('div'); gateEl.className = 'fbg'; document.body.append(gateEl); }
  const box = document.createElement('div'); box.className = 'box';
  const h1 = document.createElement('h1'); h1.textContent = title;
  const p = document.createElement('p'); p.innerHTML = msg;
  box.append(h1, p);
  btns.forEach(([t, fn, ghost]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; if (ghost) b.className = 'ghost'; b.onclick = fn; box.append(b); });
  gateEl.replaceChildren(box);
}
const hideGate = () => { if (gateEl) { gateEl.remove(); gateEl = null; } };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const login = () => { const pv = new firebase.auth.GoogleAuthProvider(); pv.setCustomParameters({ prompt: 'select_account' }); auth.signInWithPopup(pv).catch(e => { if (e && /popup/.test(e.code || '')) auth.signInWithRedirect(pv); else gate('登入失敗', esc((e && e.message) || ''), [['再試一次', login]]); }); };
const logout = () => auth.signOut().then(() => location.reload());
window.FB_LOGOUT = logout;

auth.onAuthStateChanged(async u => {
  if (!u) { gate('國土通檢專案控管', '請用 Google 帳號登入。<br>只有加入名單的成員可以使用。', [['用 Google 帳號登入', login]]); return; }
  me = u; const em = lc(u.email);
  gate('登入中', '正在確認權限…', []);
  fs.collection('users').doc(u.uid).set({ name: u.displayName || u.email || '', email: em, photo: u.photoURL || '', at: Date.now() }, { merge: true }).catch(() => {});
  let snap;
  try { snap = await fs.doc('config/access').get(); }
  catch (e) { gate('沒有使用權限', '<span class="em">' + esc(em) + '</span><br>這個帳號還不在成員名單裡，請管理者把這個 email 加進後台的「登入名單」。', [['換一個帳號', logout, true]]); return; }
  if (!snap.exists) {
    gate('第一次使用', '平台還沒有設定成員名單。<br>按下面的按鈕，<span class="em">' + esc(em) + '</span> 會成為第一位管理者，之後再到後台加入其他成員。', [['設為管理者並開始', async () => {
      try { await fs.doc('config/access').set({ admins: [em], emails: [] }); location.reload(); } catch (e) { gate('設定失敗', esc((e && e.message) || ''), [['重新整理', () => location.reload()]]); } }], ['換一個帳號', logout, true]]);
    return;
  }
  const ac = snap.data() || {};
  isAdmin = (ac.admins || []).map(lc).includes(em);
  isMember = isAdmin || (ac.emails || []).map(lc).includes(em);
  if (!isMember) { gate('沒有使用權限', '<span class="em">' + esc(em) + '</span><br>這個帳號還不在成員名單裡，請管理者把這個 email 加進後台的「登入名單」。', [['換一個帳號', logout, true]]); return; }
  window.FB_EMAIL = em; hideGate(); readyFn();
  // 清掉一天以上沒更新的線上紀錄
  fs.collection('presence').where('at', '<', Date.now() - 864e5).get().then(s => s.forEach(d => d.ref.delete().catch(() => {}))).catch(() => {});
});

/* 對應 claude.use() 的各項功能 */
const api = {
  db: () => fs,
  user: () => ({
    id: async () => me.uid,
    isOwner: async () => isAdmin,
    canEdit: async () => isAdmin,
    can: async n => (n === 'data.write' ? isMember : null),
    profiles: async ids => {
      const out = {};
      await Promise.all(ids.map(async id => { try { const d = await fs.collection('users').doc(id).get(); if (d.exists) { const v = d.data(); out[id] = { name: v.name || '', avatarUrl: v.photo || '', color: colorOf(id) }; } } catch (_) {} }));
      return out;
    }
  }),
  assets: () => (isMember ? {
    upload: async file => {
      if (file.size > 20 * 1024 * 1024) throw { code: 'too_large' };
      if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(file.type)) throw { code: 'unsupported_type' };
      const path = 'minutes/' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '_' + file.name.replace(/[\\/#?%*:|"<>]/g, '_');
      const ref = firebase.storage().ref(path);
      await ref.put(file, { contentType: file.type });
      return { id: path, url: await ref.getDownloadURL(), sizeBytes: file.size, contentType: file.type };
    }
  } : null),
  downloads: () => ({
    save: async ({ filename, data }) => {
      const b = data instanceof Blob ? data : new Blob([data], { type: /\.csv$/i.test(filename) ? 'text/csv;charset=utf-8' : 'application/octet-stream' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = filename; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
  }),
  room: () => {
    if (room) return room;
    const col = fs.collection('presence'); let cur = {};
    const beat = () => col.doc(SID).set({ by: me.uid, presence: cur, at: Date.now() }).catch(() => {});
    setInterval(beat, 30000);
    addEventListener('pagehide', () => { col.doc(SID).delete().catch(() => {}); });
    room = {
      presence: async p => { cur = Object.assign({}, cur, p); await beat(); },
      onPeers: (cb, onErr) => {
        let last = [];
        const emit = () => { const t = Date.now(); cb({ peers: last.filter(d => t - (d.at || 0) < 75000).map(d => ({ peer: d.id, by: d.by, isMe: d.by === me.uid, sameTab: d.id === SID, kind: 'viewer', presence: d.presence || {} })) }); };
        col.onSnapshot(s => { last = s.docs.map(d => Object.assign({ id: d.id }, d.data())); emit(); }, onErr || (() => {}));
        setInterval(emit, 30000);
      }
    };
    return room;
  }
};
window.claude = { use: async name => { await ready; return api[name] ? api[name]() : null; } };

/* 後台：登入名單、資料匯入、登出 */
window.FB_ADMIN = function (frag) {
  const A = window.APP, h = A.h;
  const sec = (title, sub, ...kids) => h('section', { class: 'bz' }, h('div', { class: 'core' }, h('div', { class: 'ch' }, h('h2', null, title), sub ? h('small', null, sub) : ''), h('div', { class: 'pad', style: 'display:flex;flex-direction:column;gap:12px' }, ...kids)));
  const who = h('div', { class: 'muted' }, '目前登入：' + (me ? (me.displayName || '') + '（' + me.email + '）' : '') + (isAdmin ? '．管理者' : '．成員'));
  const out = h('button', { class: 'btn sm', type: 'button', onclick: logout }, '登出');
  if (!isAdmin) { frag.append(sec('帳號', '', h('div', { style: 'display:flex;gap:12px;align-items:center;flex-wrap:wrap' }, who, out))); return; }
  const ta1 = h('textarea', { class: 'in', rows: 6, placeholder: '一行一個 email', id: 'fb-emails' }), ta2 = h('textarea', { class: 'in', rows: 3, placeholder: '一行一個 email', id: 'fb-admins' });
  fs.doc('config/access').get().then(s => { const d = s.data() || {}; ta1.value = (d.emails || []).join('\n'); ta2.value = (d.admins || []).join('\n'); }).catch(() => {});
  const parse = ta => [...new Set(ta.value.split(/[\s,;，、]+/).map(lc).filter(x => /@/.test(x)))];
  const fromPeople = h('button', { class: 'btn sm', type: 'button', onclick: () => { const add = A.S.people.map(p => lc(p.email)).filter(x => /@/.test(x)); if (!add.length) { A.toast('成員表還沒有填 Google 帳號。'); return; } ta1.value = [...new Set(parse(ta1).concat(add))].join('
'); A.toast('已帶入 ' + add.length + ' 個 email，記得按「儲存名單」。'); } }, '帶入成員表的 email');
  const save = h('button', { class: 'btn sm', type: 'button', onclick: async () => {
    const admins = parse(ta2); if (!admins.includes(lc(me.email))) admins.push(lc(me.email));
    try { await fs.doc('config/access').set({ emails: parse(ta1), admins }); A.toast('登入名單已儲存。'); } catch (e) { A.toast('儲存失敗：' + ((e && e.message) || '')); } } }, '儲存名單');
  frag.append(sec('登入名單', '用 Google 帳號的 email；不在名單上的人登入後看不到任何資料',
    h('label', { class: 'muted' }, '成員（可以看、可以編輯）'), ta1, h('label', { class: 'muted' }, '管理者（另外可以改後台設定與名單）'), ta2,
    h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, save, fromPeople, h('div', { style: 'flex:1' }), who, out)));
  const pick = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', id: 'fb-import' });
  pick.addEventListener('change', async () => {
    const f = pick.files[0]; if (!f) return; let data;
    try { data = JSON.parse(await f.text()); } catch (_) { A.toast('檔案不是正確的 JSON。'); return; }
    const writes = []; Object.keys(data).forEach(c => (data[c] || []).forEach(d => { const id = d.id; if (!id) return; const v = Object.assign({}, d); delete v.id; writes.push([c, id, v]); }));
    A.confirm('匯入 ' + writes.length + ' 筆資料？', '同 id 的資料會被檔案內容覆蓋。', '匯入', async () => {
      try { for (let i = 0; i < writes.length; i += 400) { const b = fs.batch(); writes.slice(i, i + 400).forEach(([c, id, v]) => b.set(fs.collection(c).doc(id), v)); await b.commit(); } A.toast('已匯入 ' + writes.length + ' 筆。'); }
      catch (e) { A.toast('匯入失敗：' + ((e && e.message) || '')); } });
    pick.value = '';
  });
  frag.append(sec('匯入資料', '把舊平台匯出的 JSON 一次寫進來（搬家時用一次）', h('div', null, pick, h('button', { class: 'btn sm', type: 'button', onclick: () => pick.click() }, '選擇 JSON 檔'))));
};
})();
