// 간호학 단어장 — 계정 로그인과 진도 동기화 (Firebase)
// 진도는 users/{로그인한 사람 uid} 문서 하나에 저장됩니다. 보안 규칙상 본인만 읽고 쓸 수 있습니다.
const V = "13.1.0";
const BASE = "https://www.gstatic.com/firebasejs/" + V + "/";
const firebaseConfig = {
  apiKey: "AIzaSyCezRqu2QvyAQsWMRO8v9OjcjjzmW-fkVA",
  authDomain: "nursing-voca-a.firebaseapp.com",
  projectId: "nursing-voca-a",
  storageBucket: "nursing-voca-a.firebasestorage.app",
  messagingSenderId: "614457339051",
  appId: "1:614457339051:web:284fb7fedd8a7ed0c9dbee"
};

let FA, FS, auth, db, user = null, unsub = null, timer = null, status = "loading", errMsg = "", formOpen = false, busy = false;
const KN = () => window.KN;
const STATUS = {
  loading: "동기화 기능을 불러오는 중…",
  failed: "동기화 기능을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 앱을 다시 열어 주세요. (학습은 그대로 할 수 있어요)",
  out: "로그인하면 휴대폰·PC의 진도(별표, 맞은 것/틀린 것)가 자동으로 맞춰져요.",
  syncing: "동기화 중…",
  synced: "동기화됨",
  pending: "올릴 기록이 있어요",
  offline: "오프라인 · 인터넷이 연결되면 자동으로 올라가요",
  denied: "권한 오류예요. Firebase의 Firestore 규칙을 확인해 주세요.",
  error: "동기화 중 오류가 났어요. 잠시 후 다시 시도해 주세요."
};
const AUTH_ERR = {
  "auth/invalid-credential": "이메일 또는 비밀번호가 맞지 않아요.",
  "auth/wrong-password": "이메일 또는 비밀번호가 맞지 않아요.",
  "auth/user-not-found": "가입되지 않은 이메일이에요. ‘회원가입’을 눌러 주세요.",
  "auth/email-already-in-use": "이미 가입된 이메일이에요. ‘로그인’을 눌러 주세요.",
  "auth/weak-password": "비밀번호는 6자 이상으로 정해 주세요.",
  "auth/invalid-email": "이메일 형식이 올바르지 않아요.",
  "auth/missing-password": "비밀번호를 입력해 주세요.",
  "auth/too-many-requests": "시도가 너무 많아요. 잠시 후 다시 해 주세요.",
  "auth/network-request-failed": "인터넷 연결을 확인해 주세요.",
  "auth/unauthorized-domain": "Firebase 승인된 도메인에 이 사이트 주소를 추가해야 해요.",
  "auth/operation-not-allowed": "Firebase에서 이 로그인 방법이 꺼져 있어요.",
  "auth/popup-blocked": "팝업이 차단됐어요. 팝업을 허용하거나 이메일로 로그인해 주세요."
};
function authErr(e) { const c = e && e.code; if (c === "auth/popup-closed-by-user" || c === "auth/cancelled-popup-request") return ""; return AUTH_ERR[c] || ("로그인 오류: " + (c || (e && e.message) || "알 수 없음")); }

function h(tag, attrs, kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
  (kids || []).forEach((c) => { if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
  return e;
}
function setStatus(s) { status = s; render(); }
function curStatus() { if (user && (status === "syncing" || status === "pending") && !navigator.onLine) return "offline"; return status; }

function render(box) {
  box = box || document.getElementById("acct");
  if (!box) return;
  box.innerHTML = ""; box.className = "acct";
  const st = curStatus();
  if (!user) {
    box.appendChild(h("div", { class: "acct-t" }, [h("strong", { text: "계정 동기화" })]));
    box.appendChild(h("p", { class: "note", style: "margin:4px 0 10px", text: STATUS[st === "loading" || st === "failed" ? st : "out"] }));
    if (st === "loading" || st === "failed") return;
    const row = h("div", { class: "acct-btns" }, [
      h("button", { class: "btn primary", type: "button", disabled: busy, text: "Google로 로그인", onclick: google }),
      h("button", { class: "btn", type: "button", "aria-expanded": String(formOpen), text: "이메일로 로그인", onclick: () => { formOpen = !formOpen; errMsg = ""; render(); } })]);
    box.appendChild(row);
    if (formOpen) {
      const em = h("input", { class: "search", type: "email", autocomplete: "email", placeholder: "이메일", "aria-label": "이메일" });
      const pw = h("input", { class: "search", type: "password", autocomplete: "current-password", placeholder: "비밀번호 (6자 이상)", "aria-label": "비밀번호" });
      box.appendChild(h("div", { class: "acct-form" }, [em, pw, h("div", { class: "acct-btns" }, [
        h("button", { class: "btn primary", type: "button", disabled: busy, text: "로그인", onclick: () => emailAuth("in", em.value, pw.value) }),
        h("button", { class: "btn", type: "button", disabled: busy, text: "회원가입", onclick: () => emailAuth("up", em.value, pw.value) })]),
        h("button", { class: "btn ghost", type: "button", style: "min-height:36px;padding:4px 0", text: "비밀번호를 잊었어요", onclick: () => resetPw(em.value) })]));
    }
    if (errMsg) box.appendChild(h("p", { class: "acct-err", role: "alert", text: errMsg }));
    return;
  }
  box.appendChild(h("div", { class: "acct-t" }, [h("strong", { text: user.email || user.displayName || "로그인됨" }),
    h("span", { class: "acct-st " + (st === "synced" ? "ok" : st === "denied" || st === "error" ? "bad" : ""), text: STATUS[st] || "" })]));
  box.appendChild(h("div", { class: "acct-btns" }, [
    h("button", { class: "btn", type: "button", text: "지금 동기화", onclick: () => flush(true) }),
    h("button", { class: "btn ghost", type: "button", text: "로그아웃", onclick: async () => { try { await FA.signOut(auth); } catch (e) {} } })]));
  if (errMsg) box.appendChild(h("p", { class: "acct-err", role: "alert", text: errMsg }));
}

async function google() {
  errMsg = ""; busy = true; render();
  const p = new FA.GoogleAuthProvider();
  try { await FA.signInWithPopup(auth, p); }
  catch (e) {
    if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) {
      try { await FA.signInWithRedirect(auth, p); return; } catch (e2) { errMsg = authErr(e2); }
    } else errMsg = authErr(e);
  }
  busy = false; render();
}
async function emailAuth(mode, email, pw) {
  errMsg = ""; email = (email || "").trim();
  if (!email) { errMsg = "이메일을 입력해 주세요."; render(); return; }
  busy = true; render();
  try { if (mode === "up") await FA.createUserWithEmailAndPassword(auth, email, pw || ""); else await FA.signInWithEmailAndPassword(auth, email, pw || ""); formOpen = false; }
  catch (e) { errMsg = authErr(e); }
  busy = false; render();
}
async function resetPw(email) {
  email = (email || "").trim();
  if (!email) { errMsg = "비밀번호를 재설정할 이메일을 먼저 입력해 주세요."; render(); return; }
  try { await FA.sendPasswordResetEmail(auth, email); errMsg = "비밀번호 재설정 메일을 보냈어요. 메일함(스팸함 포함)을 확인해 주세요."; }
  catch (e) { errMsg = authErr(e); }
  render();
}

// 단어별 기록 중 더 최근(t가 큰) 것을 남깁니다.
function mergeRemote(remote) {
  const S = KN().S; let changed = false; S.d = S.d || {};
  for (const id in remote) {
    const r = remote[id], l = S.w[id];
    if (!r || typeof r !== "object") continue;
    if (!l || (r.t || 0) > (l.t || 0)) { S.w[id] = r; delete S.d[id]; changed = true; }
  }
  return changed;
}
async function flush(manual) {
  if (!user || !db) return;
  clearTimeout(timer);
  const S = KN().S; S.d = S.d || {};
  const ids = Object.keys(S.d);
  if (!ids.length) { if (status !== "denied") setStatus("synced"); return; }
  const w = {}, sent = {};
  ids.forEach((id) => { if (S.w[id]) { w[id] = S.w[id]; sent[id] = S.w[id].t || 0; } });
  setStatus("syncing");
  try {
    await FS.setDoc(FS.doc(db, "users", user.uid), { w, updatedAt: FS.serverTimestamp() }, { merge: true });
    ids.forEach((id) => { if (!S.w[id] || (S.w[id].t || 0) === sent[id]) delete S.d[id]; });
    KN().save(true);
    setStatus(Object.keys(S.d).length ? "pending" : "synced");
  } catch (e) {
    setStatus(e && e.code === "permission-denied" ? "denied" : "error");
  }
}
function onSave() {
  if (!user) return;
  clearTimeout(timer);
  if (status !== "syncing") { status = "pending"; render(); }
  timer = setTimeout(flush, 1500);
}

async function boot() {
  try {
    const [A, AU, F] = await Promise.all([import(BASE + "firebase-app.js"), import(BASE + "firebase-auth.js"), import(BASE + "firebase-firestore.js")]);
    FA = AU; FS = F;
    const app = A.initializeApp(firebaseConfig);
    auth = AU.getAuth(app);
    try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
    catch (e) { db = F.getFirestore(app); }
  } catch (e) { setStatus("failed"); return; }
  try { await FA.getRedirectResult(auth); } catch (e) { errMsg = authErr(e); }
  FA.onAuthStateChanged(auth, (u) => {
    if (unsub) { unsub(); unsub = null; }
    clearTimeout(timer);
    user = u || null; errMsg = "";
    if (!user) { setStatus("out"); return; }
    const S = KN().S;
    // 이 기기에서 다른 계정을 쓰던 기록이면 섞지 않고 새 계정 기록으로 바꿉니다.
    if (S.owner && S.owner !== user.uid) { S.w = {}; S.d = {}; }
    S.owner = user.uid; KN().save(true);
    setStatus("syncing");
    let first = true;
    unsub = FS.onSnapshot(FS.doc(db, "users", user.uid), (snap) => {
      const data = snap.exists() ? snap.data() : null;
      const remote = (data && data.w) || {};
      if (first) {
        first = false; S.d = S.d || {};
        for (const id in S.w) { const l = S.w[id], r = remote[id]; if (!r || (l.t || 0) > (r.t || 0)) S.d[id] = 1; }
      }
      const changed = mergeRemote(remote);
      KN().save(true);
      if (changed) KN().refresh();
      flush();
    }, (err) => setStatus(err && err.code === "permission-denied" ? "denied" : "error"));
  });
}

window.addEventListener("online", () => { render(); if (user) flush(); });
window.addEventListener("offline", () => render());
window.KNSync = { onSave, render };
render();
boot();
