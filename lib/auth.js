"use client";

// =============================================================
// 인증 (Firebase Authentication) — 익명 사용자 + Google 관리자
// -------------------------------------------------------------
// · 회원가입/로그인/로그아웃, 구글 로그인
// · 로그인 시 users/{uid} 프로필 문서를 보장(없으면 생성)
// · 앱 전역의 동기 getCurrentUser()를 위해, 인증 상태가 바뀌면
//   lib/user.js의 _setAuthUser()로 현재 사용자 캐시를 갱신합니다.
// =============================================================
import { auth, db } from "./firebase";
import {
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import {
  _setAuthUser,
  makeAnonName,
  getSessionNick,
  clearSessionNick,
  saveGuestTeacherSession,
  clearGuestTeacherSession,
  getGuestTeacherSession,
  getGuestTeacherUser,
  splitWorkspaceName,
} from "./user";

export const INITIAL_ADMIN_EMAIL = "iseoul72@gmail.com";

function isBootstrapAdminEmail(email) {
  return (email || "").toLowerCase().trim() === INITIAL_ADMIN_EMAIL;
}

// users/{uid} 프로필 보장 — 없으면 생성하고 데이터를 반환합니다.
export async function ensureUserProfile(fbUser, extra = {}) {
  const ref = doc(db, "users", fbUser.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  const isGuestUser = fbUser.isAnonymous || extra.isGuestTeacher === true;
  if (isGuestUser) {
    const teacherName = String(extra.teacherName || extra.realName || "선생님").trim() || "선생님";
    const profile = {
      email: "",
      realName: teacherName,
      displayName: teacherName,
      emoji: "🧑‍🏫",
      role: "student",
      requestedRole: null,
      studentId: null,
      schoolName: String(extra.schoolName || "").trim(),
      createdAt: serverTimestamp(),
    };
    await setDoc(ref, profile);
    return profile;
  }

  const anon = makeAnonName();
  const emailPrefix = (fbUser.email || "").split("@")[0];
  // 학교 워크스페이스 계정 이름("21031홍길동")이면 학번·이름을 자동 분리
  const rawName =
    extra.realName || fbUser.displayName || emailPrefix || "이름 미설정";
  const ws = splitWorkspaceName(rawName);
  const profile = {
    email: fbUser.email ?? "",
    realName: ws ? ws.realName : rawName,
    displayName: anon.name,
    emoji: anon.emoji,
    role: isBootstrapAdminEmail(fbUser.email) ? "admin" : "student",
    requestedRole: null,
    studentId: ws ? ws.studentId : null,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, profile);
  return profile;
}

// Firebase 사용자 → 앱 사용자 객체(역할/프로필 포함)
async function buildAppUser(fbUser) {
  const profile = await ensureUserProfile(fbUser);
  // 초기 관리자 이메일은 클레임이 없어도 admin으로(부트스트랩)
  let role = profile.role;
  if (!role && fbUser.email === INITIAL_ADMIN_EMAIL) role = "admin";

  const finalRole = role || profile.role || "student";
  // 교사/관리자는 익명 닉네임 대신 항상 '선생님'으로 표시
  const isTeacherRole = finalRole === "admin" || finalRole === "teacher";

  // 교사/관리자 프로필 자가 치유:
  //  · 표시 이름을 항상 '선생님' + 🧑‍🏫로 고정(닉네임 미적용) → 디렉터리·목록 등
  //    프로필 문서를 읽는 모든 화면에서 '선생님'으로 보이게 함
  //  · 최고 관리자는 users.role도 'admin'으로 맞춰 학생 목록/탈퇴 규칙에서 제외
  // (본인은 isTeacher라 규칙상 자기 문서 쓰기 허용)
  if (isTeacherRole) {
    const heal = {};
    if (fbUser.email === INITIAL_ADMIN_EMAIL && profile.role !== "admin") heal.role = "admin";
    if (profile.displayName !== "선생님") heal.displayName = "선생님";
    if (profile.emoji !== "🧑‍🏫") heal.emoji = "🧑‍🏫";
    if (Object.keys(heal).length > 0) {
      try {
        await setDoc(doc(db, "users", fbUser.uid), heal, { merge: true });
        Object.assign(profile, heal);
      } catch {
        /* 규칙 미반영 등은 무시 — 반환값은 아래에서 '선생님'으로 강제 */
      }
    }
  }

  // 학생: 접속(세션)마다 새 익명 닉네임 — 게시물엔 작성 시점 이름이
  // 저장되므로, 이전 접속에서 쓴 글과 이어 붙여 추측하기 어려워집니다.
  const sessionNick = isTeacherRole ? null : getSessionNick(fbUser.uid);

  // 예전 가입 계정: 실명 칸에 "21031홍길동"이 통째로 저장되어 있고 학번이
  // 비어 있으면, 표시 시점에 학번·이름으로 분리(규칙상 본인은 저장 불가 —
  // 저장값 정리는 교사가 학생 수정 모달에서).
  const rawRealName = profile.realName || fbUser.displayName || "이름 미설정";
  const ws = !profile.studentId ? splitWorkspaceName(rawRealName) : null;

  return {
    uid: fbUser.uid,
    email: fbUser.email ?? "",
    role: finalRole,
    displayName: isTeacherRole
      ? "선생님"
      : sessionNick?.name || profile.displayName,
    emoji: isTeacherRole ? "🧑‍🏫" : sessionNick?.emoji || profile.emoji || "🙂",
    realName: ws ? ws.realName : rawRealName,
    studentId: profile.studentId ?? (ws ? ws.studentId : null),
    withdrawRequested: profile.withdrawRequested ?? false,
  };
}

// 인증 상태 구독 — 사용자 객체(또는 null)를 콜백으로 전달.
// 캐시(_setAuthUser)도 함께 갱신해 동기 getCurrentUser()가 동작하게 합니다.
export function onAuthChange(cb) {
  return onAuthStateChanged(auth, async (fbUser) => {
    let appUser = null;
    if (fbUser) {
      try {
        if (fbUser.isAnonymous && getGuestTeacherSession()) {
          appUser = getGuestTeacherUser(fbUser.uid);
        } else if (fbUser.isAnonymous) {
          await signOut(auth);
          appUser = null;
        } else {
          clearGuestTeacherSession();
          appUser = await buildAppUser(fbUser);
        }
      } catch {
        appUser = null;
      }
    }
    _setAuthUser(appUser);
    cb(appUser);
  });
}

export async function signInAsGuestTeacher({ schoolName, teacherName }) {
  const cred = await signInAnonymously(auth);
  await ensureUserProfile(cred.user, {
    isGuestTeacher: true,
    schoolName,
    teacherName,
  });
  saveGuestTeacherSession({
    uid: cred.user.uid,
    schoolName,
    teacherName,
  });
  const appUser = getGuestTeacherUser(cred.user.uid);
  _setAuthUser(appUser);
  return appUser;
}

export async function signInAsAdminWithGoogle() {
  clearGuestTeacherSession();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await signInWithPopup(auth, provider);

  if (!isBootstrapAdminEmail(cred.user.email) || cred.user.emailVerified !== true) {
    await signOut(auth);
    throw Object.assign(new Error("허용되지 않은 관리자 계정입니다."), {
      code: "auth/admin-email-required",
    });
  }

  try {
    await ensureUserProfile(cred.user);
    const appUser = await buildAppUser(cred.user);
    _setAuthUser(appUser);
    return appUser;
  } catch (err) {
    await signOut(auth);
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
