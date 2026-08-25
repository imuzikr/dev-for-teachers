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
import { doc, getDoc, runTransaction, setDoc, serverTimestamp } from "firebase/firestore";
import {
  _setAuthUser,
  getSessionNick,
  clearSessionNick,
  saveGuestTeacherSession,
  clearGuestTeacherSession,
  getGuestTeacherSession,
  getGuestTeacherUser,
  splitWorkspaceName,
} from "./user";

const ADMIN_CONFIG_PATH = ["system", "admin"];
let guestSignInInProgress = false;

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

  throw Object.assign(new Error("관리자 프로필이 아직 등록되지 않았습니다."), {
    code: "auth/admin-profile-missing",
  });
}

// Firebase 사용자 → 앱 사용자 객체(역할/프로필 포함)
async function buildAppUser(fbUser) {
  const profile = await ensureUserProfile(fbUser);
  const adminSnap = await getDoc(doc(db, ...ADMIN_CONFIG_PATH));
  const finalRole = adminSnap.exists() && adminSnap.data().uid === fbUser.uid
    ? "admin"
    : "student";
  // 교사/관리자는 익명 닉네임 대신 항상 '선생님'으로 표시
  const isTeacherRole = finalRole === "admin" || finalRole === "teacher";

  // 교사/관리자 프로필 자가 치유:
  //  · 표시 이름을 항상 '선생님' + 🧑‍🏫로 고정(닉네임 미적용) → 디렉터리·목록 등
  //    프로필 문서를 읽는 모든 화면에서 '선생님'으로 보이게 함
  //  · 최고 관리자는 users.role도 'admin'으로 맞춰 학생 목록/탈퇴 규칙에서 제외
  // (본인은 isTeacher라 규칙상 자기 문서 쓰기 허용)
  if (isTeacherRole) {
    const heal = {};
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
    schoolName: profile.schoolName ?? "",
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
        } else if (fbUser.isAnonymous && guestSignInInProgress) {
          return;
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
  guestSignInInProgress = true;
  try {
    const nextSchoolName = String(schoolName ?? "").trim();
    const nextTeacherName = String(teacherName ?? "").trim();
    const saved = getGuestTeacherSession();
    let fbUser = auth.currentUser;
    const canReuse =
      fbUser?.isAnonymous
      && saved?.uid === fbUser.uid
      && saved.schoolName === nextSchoolName
      && saved.teacherName === nextTeacherName;

    if (fbUser && !canReuse) {
      await signOut(auth);
      clearGuestTeacherSession();
      fbUser = null;
    }
    if (!fbUser) {
      fbUser = (await signInAnonymously(auth)).user;
    }

    await ensureUserProfile(fbUser, {
      isGuestTeacher: true,
      schoolName: nextSchoolName,
      teacherName: nextTeacherName,
    });
    saveGuestTeacherSession({
      uid: fbUser.uid,
      schoolName: nextSchoolName,
      teacherName: nextTeacherName,
    });
    const appUser = getGuestTeacherUser(fbUser.uid);
    _setAuthUser(appUser);
    return appUser;
  } catch (err) {
    try {
      await signOut(auth);
    } catch {
      /* 원래 로그인 오류를 유지합니다. */
    }
    throw err;
  } finally {
    guestSignInInProgress = false;
  }
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
          email: cred.user.email ?? "",
          realName: cred.user.displayName || existing.realName || "관리자",
          displayName: "선생님",
          emoji: "🧑‍🏫",
          role: "admin",
          requestedRole: null,
          studentId: null,
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
