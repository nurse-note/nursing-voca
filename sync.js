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

let deleting = false, delOpen = false, delMsg = "", delBusy = false, delStage = "confirm";
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
function setStatus(s) { status = s; render(); renderDel(); }
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
// 시험 기록: 기록 id 기준으로 합치고, 한쪽에서 삭제한 기록은 양쪽 모두 삭제로 맞춥니다.
function mergeHist(rh) {
  const S = KN().S; S.h = Array.isArray(S.h) ? S.h : []; let changed = false;
  for (const id in rh) {
    const r = rh[id]; if (!r || typeof r !== "object") continue;
    const l = S.h.find((x) => x.id === id);
    if (!l) { S.h.push(r); changed = true; }
    else if (r.del && !l.del) { l.del = 1; changed = true; }
  }
  return changed;
}
// 쓰기 횟수 보호: 한 번에 하나만 보내고(보내는 중이면 끝난 뒤 한 번 더), 변경은 3초 모아서 보냄
let inflight = false, again = false;
const DEBOUNCE = 3000;
let firstPend = 0; const MAXWAIT = 20000; // 계속 공부 중이어도 20초마다는 올림
function schedule(ms) {
  clearTimeout(timer);
  if (!firstPend) firstPend = Date.now();
  let wait = ms == null ? DEBOUNCE : ms;
  wait = Math.max(0, Math.min(wait, MAXWAIT - (Date.now() - firstPend)));
  timer = setTimeout(flush, wait);
}
async function flush(manual) {
  if (!user || !db || deleting) return;
  clearTimeout(timer);
  if (inflight) { again = true; return; }
  const S = KN().S; S.d = S.d || {};
  S.hd = S.hd || {};
  const ids = Object.keys(S.d), hids = Object.keys(S.hd);
  if (!ids.length && !hids.length) { if (status !== "denied") setStatus("synced"); return; }
  const w = {}, sent = {}, hh = {};
  const H = Array.isArray(S.h) ? S.h : [];
  hids.forEach((id) => { const r = H.find((x) => x.id === id); if (r) hh[id] = r; });
  ids.forEach((id) => { if (S.w[id]) { w[id] = S.w[id]; sent[id] = S.w[id].t || 0; } });
  setStatus("syncing");
  inflight = true; firstPend = 0;
  try {
    await FS.setDoc(FS.doc(db, "users", user.uid), Object.assign({ updatedAt: FS.serverTimestamp() }, ids.length ? { w } : {}, hids.length ? { h: hh } : {}), { merge: true });
    ids.forEach((id) => { if (!S.w[id] || (S.w[id].t || 0) === sent[id]) delete S.d[id]; });
    hids.forEach((id) => { delete S.hd[id]; });
    KN().save(true);
    setStatus(Object.keys(S.d).length || Object.keys(S.hd).length ? "pending" : "synced");
  } catch (e) {
    setStatus(e && e.code === "permission-denied" ? "denied" : "error");
  } finally {
    inflight = false;
    const S2 = KN().S;
    if (again || Object.keys(S2.d || {}).length || Object.keys(S2.hd || {}).length) { again = false; if (user && !deleting) schedule(); }
  }
}
function onSave() {
  if (!user || deleting) return;
  clearTimeout(timer);
  if (status !== "syncing") { status = "pending"; render(); }
  schedule();
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
  FA.onAuthStateChanged(auth, (u) => attach(u));
}
function attach(u) {
    if (unsub) { unsub(); unsub = null; }
    clearTimeout(timer);
    user = u || null; errMsg = ""; deleting = false;
    if (!user) { setStatus("out"); return; }
    const S = KN().S;
    // 이 기기에서 다른 계정을 쓰던 기록이면 섞지 않고 새 계정 기록으로 바꿉니다.
    if (S.owner && S.owner !== user.uid) { S.w = {}; S.d = {}; S.h = []; S.hd = {}; }
    S.owner = user.uid; KN().save(true);
    setStatus("syncing");
    let first = true;
    unsub = FS.onSnapshot(FS.doc(db, "users", user.uid), (snap) => {
      const data = snap.exists() ? snap.data() : null;
      const remote = (data && data.w) || {};
      const rh = (data && data.h) || {};
      if (first) {
        S.h = Array.isArray(S.h) ? S.h : []; S.hd = S.hd || {};
        S.h.forEach((r) => { if (!rh[r.id] || (r.del && !rh[r.id].del)) S.hd[r.id] = 1; });
        first = false; S.d = S.d || {};
        for (const id in S.w) { const l = S.w[id], r = remote[id]; if (!r || (l.t || 0) > (r.t || 0)) S.d[id] = 1; }
      }
      const changed = mergeRemote(remote) | mergeHist(rh);
      KN().save(true);
      if (changed) KN().refresh();
      const pendingSnap = snap.metadata && snap.metadata.hasPendingWrites;
      if (!pendingSnap && !inflight && (Object.keys(S.d || {}).length || Object.keys(S.hd || {}).length)) schedule();
      else if (!pendingSnap && !inflight && status !== "denied") setStatus("synced");
    }, (err) => setStatus(err && err.code === "permission-denied" ? "denied" : "error"));
}

// ---------- 회원 탈퇴 ----------
function wipeLocal() { const S = KN().S; S.w = {}; S.d = {}; S.h = []; S.hd = {}; S.owner = null; KN().save(true); KN().refresh(); }
function renderDel(box) {
  box = box || document.getElementById("acct-del");
  if (!box) return;
  box.innerHTML = "";
  if (!user) { if (delMsg) box.appendChild(h("p", { class: "foot-note", role: "status", text: delMsg })); return; }
  const who = user.email || "로그인 계정";
  if (!delOpen) { box.appendChild(h("button", { class: "foot-link", type: "button", text: "회원 탈퇴 (" + who + ")", onclick: () => { delOpen = true; delMsg = ""; delStage = "confirm"; renderDel(); } })); return; }
  const panel = h("div", { class: "del-panel", role: "alertdialog", "aria-label": "회원 탈퇴 확인" });
  panel.appendChild(h("b", { text: "회원 탈퇴 전에 꼭 확인하세요" }));
  panel.appendChild(h("p", { text: "탈퇴하면 서버에 저장된 진도(별표·외움 상태)와 시험 기록, 로그인 계정(" + who + ")이 영구 삭제되며 되돌릴 수 없어요. 이 기기에 저장된 기록도 함께 지워져요." }));
  const cancel = h("button", { class: "btn", type: "button", disabled: delBusy, text: "취소", onclick: () => { delOpen = false; delMsg = ""; const wasDel = delStage === "reauth"; delStage = "confirm"; if (wasDel) attach(auth.currentUser || user); renderDel(); } });
  if (delStage === "confirm") {
    panel.appendChild(h("p", { text: "계속하려면 아래 칸에 ‘확인했습니다’를 입력하세요." }));
    const inp = h("input", { class: "search", type: "text", placeholder: "확인했습니다", "aria-label": "탈퇴 확인 문구 입력", autocomplete: "off" });
    const go = h("button", { class: "btn del-go", type: "button", disabled: true, text: "탈퇴하기", onclick: () => { if (inp.value.trim() === "확인했습니다") doDelete(); } });
    inp.addEventListener("input", () => { go.disabled = delBusy || inp.value.trim() !== "확인했습니다"; });
    panel.appendChild(inp);
    panel.appendChild(h("div", { class: "acct-btns" }, [go, cancel]));
  } else {
    panel.appendChild(h("p", { text: "보안을 위해 다시 로그인해야 탈퇴할 수 있어요. 다시 로그인하면 바로 탈퇴가 진행돼요." }));
    const isPw = (user.providerData || []).some((p) => p.providerId === "password");
    if (isPw) {
      const pw = h("input", { class: "search", type: "password", placeholder: "비밀번호", "aria-label": "비밀번호", autocomplete: "current-password" });
      panel.appendChild(pw);
      panel.appendChild(h("div", { class: "acct-btns" }, [h("button", { class: "btn del-go", type: "button", disabled: delBusy, text: "다시 로그인 후 탈퇴", onclick: () => reauthPw(pw.value) }), cancel]));
    } else {
      panel.appendChild(h("div", { class: "acct-btns" }, [h("button", { class: "btn del-go", type: "button", disabled: delBusy, text: "Google로 다시 로그인 후 탈퇴", onclick: reauthGoogle }), cancel]));
    }
  }
  if (delMsg) panel.appendChild(h("p", { class: "acct-err", role: "alert", text: delMsg }));
  box.appendChild(panel);
}
async function doDelete() {
  if (!user || delBusy) return;
  delBusy = true; delMsg = "탈퇴 처리 중…"; renderDel();
  deleting = true; if (unsub) { unsub(); unsub = null; } clearTimeout(timer);
  const uid = user.uid;
  try {
    await FS.deleteDoc(FS.doc(db, "users", uid));
    await FA.deleteUser(auth.currentUser || user);
    delBusy = false; delOpen = false; delStage = "confirm"; delMsg = "탈퇴가 완료됐어요. 서버와 이 기기의 기록을 모두 지웠어요.";
    wipeLocal();
  } catch (e) {
    delBusy = false;
    if (e && e.code === "auth/requires-recent-login") { delStage = "reauth"; delMsg = ""; }
    else { delMsg = "탈퇴 중 오류가 났어요. 잠시 후 다시 시도해 주세요. (" + ((e && (e.code || e.message)) || "알 수 없음") + ")"; delStage = "confirm"; attach(auth.currentUser || user); }
  }
  render(); renderDel();
}
async function reauthGoogle() {
  try { await FA.reauthenticateWithPopup(auth.currentUser || user, new FA.GoogleAuthProvider()); delStage = "confirm"; await doDelete(); }
  catch (e) { delMsg = authErr(e) || "다시 로그인하지 못했어요."; renderDel(); }
}
async function reauthPw(pw) {
  try { const cred = FA.EmailAuthProvider.credential((auth.currentUser || user).email, pw || ""); await FA.reauthenticateWithCredential(auth.currentUser || user, cred); delStage = "confirm"; await doDelete(); }
  catch (e) { delMsg = authErr(e) || "다시 로그인하지 못했어요."; renderDel(); }
}

window.addEventListener("online", () => { render(); if (user) schedule(500); });
// 앱을 닫거나 다른 화면으로 갈 때 남은 기록을 바로 올림
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && user) flush(); });
window.addEventListener("pagehide", () => { if (user) flush(); });
window.addEventListener("offline", () => render());
window.KNSync = { onSave, render, renderDel };
render();
boot();
