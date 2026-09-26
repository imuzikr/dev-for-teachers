"use client";

// =============================================================
// 인증 (Firebase Authentication) — PIN 사용자 + Google 관리자
// -------------------------------------------------------------
// · 회원가입/로그인/로그아웃, 구글 로그인
// · 로그인 시 users/{uid} 프로필 문서를 보장(없으면 생성)
// · 앱 전역의 동기 getCurrentUser()를 위해, 인증 상태가 바뀌면
//   lib/user.js의 _setAuthUser()로 현재 사용자 캐시를 갱신합니다.
// =============================================================
import { auth, db } from "./firebase";
import {
  signInWithCustomToken,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import {
  _setAuthUser,
  getSessionNick,
  clearSessionNick,
  saveGuestTeacherSession,
  clearGuestTeacherSession,
} from "./user";
import { requestPinAuth } from "./pinAuthClient";

const ADMIN_CONFIG_PATH = ["system", "admin"];
const PROFILE_HANDOFF_MS = 5000;
let sessionUser = null;
let sessionGeneration = 0;
let authOperation = 0;
let profileHydration = null;

function invalidateProfileHydration() {
  sessionGeneration += 1;
  profileHydration = null;
}

function trackSession(fbUser) {
  if (sessionUser !== fbUser) {
    sessionUser = fbUser;
    invalidateProfileHydration();
  }
  return sessionGeneration;
}

function sessionChangedError() {
  return Object.assign(new Error("인증 상태가 변경되었습니다. 다시 로그인해 주세요."), {
    code: "auth/session-changed",
  });
}

function isCurrentSession(fbUser, generation) {
  return auth.currentUser === fbUser && sessionGeneration === generation;
}

// Share only verified Firebase hydration during sign-in and the immediate route handoff.
async function hydrateAppUser(fbUser, { refresh = false } = {}) {
  const generation = trackSession(fbUser);
  const token = await fbUser.getIdTokenResult();
  if (!isCurrentSession(fbUser, generation)) throw sessionChangedError();
  const tokenKey = JSON.stringify([token.token, token.claims]);
  let entry = profileHydration;
  if (refresh || !entry || entry.tokenKey !== tokenKey || entry.expiresAt <= Date.now()) {
    entry = { tokenKey, expiresAt: Infinity, promise: null };
    profileHydration = entry;
    entry.promise = buildAppUser(fbUser, token).then((appUser) => {
      entry.expiresAt = appUser ? Date.now() + PROFILE_HANDOFF_MS : 0;
      return appUser;
    }).catch((error) => {
      if (profileHydration === entry) profileHydration = null;
      throw error;
    });
  }
  const appUser = await entry.promise;
  if (!isCurrentSession(fbUser, generation) || profileHydration !== entry) throw sessionChangedError();
  return appUser;
}

function assertCurrentSignIn(operation, fbUser) {
  if (authOperation !== operation || (fbUser && auth.currentUser !== fbUser)) throw sessionChangedError();
}

// 학생 프로필 생성은 PIN 인증 서버에서만 처리합니다.
export async function ensureUserProfile(fbUser) {
  const ref = doc(db, "users", fbUser.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  throw Object.assign(new Error("사용자 프로필이 등록되지 않았습니다."), {
    code: "auth/profile-missing",
  });
}

// Firebase 사용자 → 앱 사용자 객체(역할/프로필 포함)
async function buildAppUser(fbUser, token) {
  const pinAuthenticated = token.claims.pinAuthenticated === true;
  const profile = await ensureUserProfile(fbUser);
  const isGoogleUser = token.claims.firebase?.sign_in_provider === "google.com";
  const adminSnap = isGoogleUser ? await getDoc(doc(db, ...ADMIN_CONFIG_PATH)) : null;
  const finalRole = adminSnap?.exists() && adminSnap.data().uid === fbUser.uid
    ? "admin"
    : "student";
  const isTeacherRole = finalRole === "admin" || finalRole === "teacher";
  if (finalRole !== "admin" && !pinAuthenticated) return null;

  // 학생: 접속(세션)마다 새 익명 닉네임 — 게시물엔 작성 시점 이름이
  // 저장되므로, 이전 접속에서 쓴 글과 이어 붙여 추측하기 어려워집니다.
  const sessionNick = isTeacherRole ? null : getSessionNick(fbUser.uid);

  const rawRealName = profile.realName || fbUser.displayName || "이름 미설정";

  return {
    uid: fbUser.uid,
    email: fbUser.email ?? "",
    role: finalRole,
    displayName: isTeacherRole
      ? "선생님"
      : pinAuthenticated ? rawRealName : sessionNick?.name || rawRealName,
    emoji: isTeacherRole ? "🧑‍🏫" : sessionNick?.emoji || "🙂",
    realName: rawRealName,
    schoolName: profile.schoolName ?? "",
    studentId: null,
    withdrawRequested: profile.withdrawRequested ?? false,
    isGuestTeacher: pinAuthenticated && finalRole !== "admin",
  };
}

// 인증 상태 구독 — 사용자 객체(또는 null)를 콜백으로 전달.
// 캐시(_setAuthUser)도 함께 갱신해 동기 getCurrentUser()가 동작하게 합니다.
export function onAuthChange(cb) {
  let generation = 0;
  let active = true;
  const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
    const currentGeneration = ++generation;
    if (auth.currentUser !== fbUser) return;
    const currentSession = trackSession(fbUser);
    let appUser = null;
    if (fbUser && !fbUser.isAnonymous) {
      try {
        appUser = await hydrateAppUser(fbUser);
      } catch (error) {
        if (error?.code === "auth/session-changed") return;
      }
    }
    if (!active || currentGeneration !== generation || !isCurrentSession(fbUser, currentSession)) return;
    _setAuthUser(appUser);
    cb(appUser);
  });
  return () => {
    active = false;
    generation += 1;
    unsubscribe();
  };
}

export async function signInWithPin({ mode, schoolName, realName, pin, pinConfirm }) {
  const operation = ++authOperation;
  invalidateProfileHydration();
  const result = await requestPinAuth({ action: mode === "login" ? "login" : "register", schoolName, realName, pin, pinConfirm });
  if (!result.customToken) throw new Error("로그인 토큰을 받지 못했습니다.");
  assertCurrentSignIn(operation);
  const credential = await signInWithCustomToken(auth, result.customToken);
  assertCurrentSignIn(operation, credential.user);
  const appUser = await hydrateAppUser(credential.user);
  assertCurrentSignIn(operation, credential.user);
  if (!appUser) { await signOut(auth); throw new Error("PIN 인증을 확인하지 못했습니다."); }
  saveGuestTeacherSession({ uid: appUser.uid, schoolName: appUser.schoolName, teacherName: appUser.realName });
  _setAuthUser(appUser);
  return appUser;
}

export async function signInAsAdminWithGoogle() {
  const operation = ++authOperation;
  invalidateProfileHydration();
  clearGuestTeacherSession();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await signInWithPopup(auth, provider);
  assertCurrentSignIn(operation, cred.user);

  if (cred.user.emailVerified !== true) {
    await signOut(auth);
    throw Object.assign(new Error("확인된 Google 계정이 필요합니다."), {
      code: "auth/admin-email-unverified",
    });
  }

  try {
    const adminRef = doc(db, ...ADMIN_CONFIG_PATH);
    const userRef = doc(db, "users", cred.user.uid);
    await runTransaction(db, async (transaction) => {
      const adminSnap = await transaction.get(adminRef);
      if (adminSnap.exists() && adminSnap.data().uid !== cred.user.uid) {
        throw Object.assign(new Error("이미 다른 관리자 계정이 등록되어 있습니다."), {
          code: "auth/admin-already-claimed",
        });
      }

      const userSnap = await transaction.get(userRef);
      const existing = userSnap.exists() ? userSnap.data() : {};
      if (!adminSnap.exists()) {
        transaction.set(adminRef, {
          uid: cred.user.uid,
          createdAt: serverTimestamp(),
        });
      }
      transaction.set(
        userRef,
        {
          ...existing,
          realName: cred.user.displayName || existing.realName || "관리자",
          role: "admin",
          requestedRole: null,
          schoolName: existing.schoolName ?? "",
          createdAt: existing.createdAt ?? serverTimestamp(),
        },
        { merge: true }
      );
    });
    assertCurrentSignIn(operation, cred.user);
    const appUser = await hydrateAppUser(cred.user, { refresh: true });
    assertCurrentSignIn(operation, cred.user);
    _setAuthUser(appUser);
    return appUser;
  } catch (err) {
    assertCurrentSignIn(operation, cred.user);
    if (err?.code === "auth/session-changed") throw err;
    await signOut(auth);
    if (err?.code === "auth/admin-already-claimed") throw err;
    throw Object.assign(new Error("관리자 정보를 저장하지 못했습니다."), {
      code: "auth/profile-create-failed",
      cause: err,
    });
  }
}

export async function signOutUser() {
  authOperation += 1;
  invalidateProfileHydration();
  await signOut(auth);
  _setAuthUser(null);
  // 같은 탭에서 다음 로그인(다른 학생 포함) 시 새 닉네임을 받도록 초기화
  clearSessionNick();
  clearGuestTeacherSession();
}
