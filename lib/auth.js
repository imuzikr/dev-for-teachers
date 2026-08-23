"use client";

// =============================================================
// 인증 (Firebase Authentication) — 이메일/비밀번호 + 구글
// -------------------------------------------------------------
// · 회원가입/로그인/로그아웃, 구글 로그인
// · 로그인 시 users/{uid} 프로필 문서를 보장(없으면 생성)
// · 역할(role)은 커스텀 클레임에서 읽음(functions/setUserRole가 부여).
//   초기 관리자 이메일은 클레임이 없어도 admin으로 부트스트랩.
// · 앱 전역의 동기 getCurrentUser()를 위해, 인증 상태가 바뀌면
//   lib/user.js의 _setAuthUser()로 현재 사용자 캐시를 갱신합니다.
// =============================================================
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  getAdditionalUserInfo,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import {
  _setAuthUser,
  makeAnonName,
  getSessionNick,
  clearSessionNick,
  splitWorkspaceName,
} from "./user";

const INITIAL_ADMIN_EMAIL = "iseoul72@gmail.com";

// 학생 가입을 제한하는 학교 이메일 도메인('@' 없이). 관리자 화면의 과일 기록
// 정리(REWARD_DOMAIN)도 이 값을 그대로 씁니다 — 두 곳에 따로 적어 두면
// 나중에 하나만 고쳐 어긋나기 쉬우므로 여기 한 곳만 소스로 둡니다.
export const SCHOOL_EMAIL_DOMAIN = "hansung.hs.kr";

function isSchoolEmail(email) {
  return (email || "").toLowerCase().trim().endsWith(`@${SCHOOL_EMAIL_DOMAIN}`);
}

// 최고 관리자 이메일만 학교 도메인 없이도 가입/로그인할 수 있는 유일한 예외.
function isBootstrapAdminEmail(email) {
  return (email || "").toLowerCase().trim() === INITIAL_ADMIN_EMAIL;
}

// 학교 이메일이어도 이 코드가 있어야 가입할 수 있습니다 — 아무나 학교 도메인
// 계정만 있으면 들어오는 것을 막기 위한 별도 관문입니다. 코드 값은 여기 코드가
// 아니라 Firestore registrationCodes/{코드} 문서로 관리합니다(교체할 때 배포가
// 필요 없도록). 문서 ID 대소문자와 맞추기 위해 항상 대문자로 정규화합니다.
function normalizeRegCode(code) {
  return (code || "").trim().toUpperCase();
}

// 등록 코드 확인 — 문제가 있으면 그 까닭을 구분해 던집니다.
// '코드가 틀렸다'와 '코드를 확인하는 것 자체를 못 했다'는 학생에게 해 줄 말이
// 전혀 다릅니다. 후자는 대개 보안 규칙이 아직 배포되지 않아 registrationCodes를
// 읽지 못하는 경우인데, 그냥 흘려보내면 permission-denied가 화면에 '로그인에
// 실패했습니다'로 뭉뚱그려져 원인을 짐작할 수 없게 됩니다.
async function assertRegistrationCode(code) {
  const norm = normalizeRegCode(code);
  if (!norm) {
    throw Object.assign(new Error("등록 코드를 입력해 주세요."), {
      code: "auth/registration-code-invalid",
    });
  }
  let snap;
  try {
    snap = await getDoc(doc(db, "registrationCodes", norm));
  } catch (err) {
    throw Object.assign(new Error("등록 코드를 확인하지 못했습니다."), {
      code: "auth/registration-code-unavailable",
      cause: err,
    });
  }
  if (!snap.exists() || snap.data()?.active !== true) {
    throw Object.assign(new Error("등록 코드가 올바르지 않습니다."), {
      code: "auth/registration-code-invalid",
    });
  }
}

// 프로필 만들기 + 실패 시 계정 되돌리기.
// 계정만 만들어지고 프로필이 없으면, 그 이메일은 새로 가입하려 해도
// '이미 가입된 이메일'이고 로그인해도 프로필이 없어 막히는 — 어느 쪽으로도
// 빠져나올 수 없는 상태가 됩니다. 그래서 프로필 저장이 실패하면 방금 만든
// 계정을 반드시 지워 이메일을 다시 쓸 수 있게 풀어 줍니다.
async function createProfileOrRollback(fbUser, extra) {
  try {
    return await ensureUserProfile(fbUser, extra);
  } catch (err) {
    console.error("[가입] 프로필 저장 실패 — 계정을 되돌립니다:", err?.code, err?.message);
    try {
      await fbUser.delete();
    } catch {
      /* 삭제 실패해도 로그아웃은 진행 */
    }
    try {
      await signOut(auth);
    } catch {
      /* 이미 삭제되어 세션이 끊겼을 수 있음 */
    }
    throw Object.assign(
      new Error("가입 정보를 저장하지 못했습니다. 등록 코드를 다시 확인하거나 선생님께 알려 주세요."),
      { code: "auth/profile-create-failed", cause: err }
    );
  }
}

// users/{uid} 프로필 보장 — 없으면 생성하고 데이터를 반환합니다.
export async function ensureUserProfile(fbUser, extra = {}) {
  const ref = doc(db, "users", fbUser.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  const anon = makeAnonName();
  const emailPrefix = (fbUser.email || "").split("@")[0];
  // 학교 워크스페이스 계정 이름("21031홍길동")이면 학번·이름을 자동 분리
  const rawName =
    extra.realName || fbUser.displayName || emailPrefix || "이름 미설정";
  const ws = splitWorkspaceName(rawName);
  const profile = {
    email: fbUser.email ?? "",
    realName: ws ? ws.realName : rawName,
    displayName: anon.name, // 게시판 표시용 익명 닉네임(고정)
    emoji: anon.emoji,
    role: "student", // 기본 역할 — 승격은 functions/setUserRole로만
    // '선생님'으로 가입 신청 시 표시(권한 아님). 관리자 승인 전까지는 학생으로
    // 이용하며, 승인되면 setUserRole이 role 클레임을 teacher로 바꿉니다.
    requestedRole: extra.requestedRole === "teacher" ? "teacher" : null,
    studentId: ws ? ws.studentId : null,
    // 가입 때 쓴 등록 코드 — firestore.rules의 users 생성 규칙이 이 값으로
    // registrationCodes를 다시 검증합니다. 최고 관리자는 코드 없이 가입하므로 null.
    regCode: extra.regCode ? normalizeRegCode(extra.regCode) : null,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, profile);
  return profile;
}

// Firebase 사용자 → 앱 사용자 객체(역할/프로필 포함)
async function buildAppUser(fbUser) {
  let role;
  try {
    const tokenResult = await fbUser.getIdTokenResult();
    role = tokenResult.claims.role;
  } catch {
    /* 토큰 조회 실패 시 프로필/기본값 사용 */
  }
  const profile = await ensureUserProfile(fbUser);
  // 초기 관리자 이메일은 클레임이 없어도 admin으로(부트스트랩)
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
        appUser = await buildAppUser(fbUser);
      } catch {
        appUser = null;
      }
    }
    _setAuthUser(appUser);
    cb(appUser);
  });
}

// 가입은 학교 이메일(@hansung.hs.kr)만 허용합니다 — 학생·선생님 모두
// 마찬가지이며, 최고 관리자 이메일만 유일한 예외입니다. 선생님으로
// 가입 신청해도 개인 메일로는 가입할 수 없고, 학교 이메일로 가입한 뒤
// 관리자 승인을 받는 방식은 그대로입니다. 실제 강제는 firestore.rules의
// users 생성 규칙이 하고(request.auth.token.email로 위조 불가하게 검사),
// 여기서는 계정 생성 전에 먼저 걸러 불필요한 Auth 계정이 생기지 않게 합니다.
//
// 등록 코드도 마찬가지로 계정 생성 전에 먼저 검사합니다 — registrationCodes
// 문서의 get은 로그인 없이도 읽히도록 열어 둬서(firestore.rules), 이메일
// 가입은 계정을 만들었다 지우는 일 없이 바로 걸러낼 수 있습니다.
export async function signUpWithEmail(email, password, requestedRole = null, regCode = "") {
  try {
    return await signUpWithEmailInner(email, password, requestedRole, regCode);
  } catch (err) {
    // 어느 단계에서 실패했는지 화면 문구만으로는 구분이 안 되므로, 실제
    // Firebase 오류 코드를 콘솔에 남깁니다(F12 → 콘솔에서 확인 가능).
    console.error("[가입 실패]", err?.code, err?.message, err?.cause ?? err);
    throw err;
  }
}

async function signUpWithEmailInner(email, password, requestedRole, regCode) {
  const needsCode = !isBootstrapAdminEmail(email);
  if (needsCode && !isSchoolEmail(email)) {
    throw Object.assign(new Error(`학교 이메일(@${SCHOOL_EMAIL_DOMAIN})로만 가입할 수 있습니다.`), {
      code: "auth/school-domain-required",
    });
  }
  if (needsCode) await assertRegistrationCode(regCode);

  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, email, password);
  } catch (err) {
    if (err?.code !== "auth/email-already-in-use") throw err;
    // 앞선 시도에서 프로필을 못 만든 채 계정만 남았을 수 있습니다(고아 계정).
    // 같은 비밀번호로 들어가 프로필이 정말 없으면 마저 만들어 되살립니다.
    // 비밀번호가 다르거나 프로필이 이미 있으면 진짜 '이미 가입된 이메일'이므로
    // 원래 오류를 그대로 돌려줍니다(가입이 아니라 로그인해야 하는 경우).
    let revived;
    try {
      revived = await signInWithEmailAndPassword(auth, email, password);
    } catch (signInErr) {
      console.error("[가입] 이미 있는 이메일 — 같은 비밀번호로도 로그인 실패:", signInErr?.code);
      throw err;
    }
    // 프로필이 '확실히 없을' 때만 되살립니다. 읽기 자체가 실패해 있는지
    // 없는지 모르는 상태에서 밀고 나가면, 멀쩡한 계정을 고아로 오인해
    // 아래 롤백이 지워 버릴 수 있습니다.
    let existing;
    try {
      existing = await getDoc(doc(db, "users", revived.user.uid));
    } catch (readErr) {
      console.error("[가입] 고아 계정 복구 중 본인 프로필 조회 실패:", readErr?.code, readErr?.message);
      await signOut(auth);
      throw err;
    }
    if (existing.exists()) {
      await signOut(auth);
      throw err;
    }
    console.warn("[가입] 프로필 없는 고아 계정을 복구합니다:", revived.user.uid);
    cred = revived;
  }

  await createProfileOrRollback(cred.user, { requestedRole, regCode });
  const appUser = await buildAppUser(cred.user);
  _setAuthUser(appUser);
  return appUser;
}

export async function signInWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const appUser = await buildAppUser(cred.user);
  _setAuthUser(appUser);
  return appUser;
}

export async function signInWithGoogle(requestedRole = null, regCode = "") {
  try {
    return await signInWithGoogleInner(requestedRole, regCode);
  } catch (err) {
    console.error("[구글 가입/로그인 실패]", err?.code, err?.message, err?.cause ?? err);
    throw err;
  }
}

async function signInWithGoogleInner(requestedRole, regCode) {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);

  // getAdditionalUserInfo().isNewUser는 'Firebase Auth 계정'이 방금
  // 만들어졌는지만 알려줄 뿐, 'Firestore 프로필'이 있는지는 알려주지
  // 않습니다. 이전 시도에서 계정만 만들어지고 프로필 저장이 실패한
  // 고아 계정이라면, 이 값은 이미 false라 아래 검사를 전부 건너뛰고
  // 곧장 프로필을 읽으러 가서 다시 막혔습니다. 그래서 '새 계정인지'가
  // 아니라 '프로필이 실제로 있는지'로 판단합니다.
  let hasProfile;
  try {
    hasProfile = (await getDoc(doc(db, "users", cred.user.uid))).exists();
  } catch (err) {
    await signOut(auth);
    throw Object.assign(new Error("계정 정보를 확인하지 못했습니다."), {
      code: "auth/registration-code-unavailable",
      cause: err,
    });
  }

  // 구글 계정의 이메일은 팝업이 끝나야 알 수 있어 signUpWithEmail처럼
  // 미리 막을 수 없습니다(등록 코드는 미리 검사할 수 있지만, 도메인과
  // 함께 한 번에 되돌리는 편이 계정을 만들었다 지우는 일을 줄입니다).
  // 프로필이 없는데 학교 도메인이 아니거나 등록 코드가 유효하지 않으면
  // 최고 관리자 예외를 뺀 뒤, 이 Auth 계정을 되돌립니다(그대로 두면
  // 프로필 없는 계정이 남아 다음에도 로그인은 되는데 앱은 못 쓰는
  // 어정쩡한 상태가 됩니다).
  if (!hasProfile && !isBootstrapAdminEmail(cred.user.email)) {
    let failure = null;
    if (!isSchoolEmail(cred.user.email)) {
      failure = Object.assign(
        new Error(`학교 이메일(@${SCHOOL_EMAIL_DOMAIN}) 계정으로만 가입할 수 있습니다.`),
        { code: "auth/school-domain-required" }
      );
    } else {
      // 코드가 틀렸는지/확인 자체를 못 했는지 구분해 그대로 전달합니다.
      try {
        await assertRegistrationCode(regCode);
      } catch (err) {
        failure = err;
      }
    }
    if (failure) {
      try {
        await cred.user.delete();
      } catch {
        /* 삭제 실패해도 로그아웃은 진행 — 다음 로그인 시 다시 이 경로를 탐 */
      }
      await signOut(auth);
      throw failure;
    }
  }

  // 프로필이 아직 없을 때만(신규 가입 또는 고아 계정 복구) 신청 역할·
  // 등록 코드를 반영해 만듭니다. 이미 프로필이 있는 기존 사용자는 그대로 둡니다.
  if (!hasProfile) {
    await createProfileOrRollback(cred.user, { requestedRole, regCode });
  }
  const appUser = await buildAppUser(cred.user);
  _setAuthUser(appUser);
  return appUser;
}

export async function signOutUser() {
  await signOut(auth);
  _setAuthUser(null);
  // 같은 탭에서 다음 로그인(다른 학생 포함) 시 새 닉네임을 받도록 초기화
  clearSessionNick();
}
