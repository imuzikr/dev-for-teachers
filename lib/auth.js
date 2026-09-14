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
async function buildAppUser(fbUser) {
  const token = await fbUser.getIdTokenResult();
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
  return onAuthStateChanged(auth, async (fbUser) => {
    const currentGeneration = ++generation;
    let appUser = null;
    if (fbUser && !fbUser.isAnonymous) {
      try {
        appUser = await buildAppUser(fbUser);
      } catch {
        appUser = null;
      }
    }
    if (currentGeneration !== generation) return;
    _setAuthUser(appUser);
    cb(appUser);
  });
}

export async function signInWithPin({ mode, schoolName, realName, pin, pinConfirm }) {
  const result = await requestPinAuth({ action: mode === "login" ? "login" : "register", schoolName, realName, pin, pinConfirm });
  if (!result.customToken) throw new Error("로그인 토큰을 받지 못했습니다.");
  const credential = await signInWithCustomToken(auth, result.customToken);
  const appUser = await buildAppUser(credential.user);
  if (!appUser) { await signOut(auth); throw new Error("PIN 인증을 확인하지 못했습니다."); }
  saveGuestTeacherSession({ uid: appUser.uid, schoolName: appUser.schoolName, teacherName: appUser.realName });
  _setAuthUser(appUser);
  return appUser;
}

export async function signInAsAdminWithGoogle() {
  clearGuestTeacherSession();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await signInWithPopup(auth, provider);

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
    const appUser = await buildAppUser(cred.user);
    _setAuthUser(appUser);
    return appUser;
  } catch (err) {
    await signOut(auth);
    if (err?.code === "auth/admin-already-claimed") throw err;
    throw Object.assign(new Error("관리자 정보를 저장하지 못했습니다."), {
      code: "auth/profile-create-failed",
      cause: err,
    });
  }
}

export async function signOutUser() {
  await signOut(auth);
  _setAuthUser(null);
  // 같은 탭에서 다음 로그인(다른 학생 포함) 시 새 닉네임을 받도록 초기화
  clearSessionNick();
  clearGuestTeacherSession();
}
