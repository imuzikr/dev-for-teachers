"use client";

// =============================================================
// 메인 랜딩 페이지
//   - 전체 배경: public/landing.png (학생들이 질문하는 일러스트)
//   - 중앙 여백: 서비스 타이틀 + 상세 설명
//   - 오른쪽 상단: 로그인 / 회원가입 버튼 (클릭 시 모달)
// -------------------------------------------------------------
// 실서비스 모드: Firebase Authentication으로 실제 로그인/회원가입합니다
// (이메일·비밀번호 + Google, lib/auth.js). 회원가입은 학생/선생님 역할을
// 먼저 고르며, 선생님은 관리자 승인 후 권한이 부여됩니다.
// 데모 모드(Firebase 미설정)에서는 입력값과 무관하게 임시 유저로 입장합니다.
// =============================================================
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import { backdropClose } from "@/lib/modal";
import {
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  onAuthChange,
  SCHOOL_EMAIL_DOMAIN,
} from "@/lib/auth";
import SiteFooter from "@/components/SiteFooter";
import { IconLogo } from "@/components/StatusIcons";

// Firebase 인증 오류 코드를 한국어 메시지로
function authErrorMessage(code) {
  const map = {
    "auth/invalid-email": "이메일 형식이 올바르지 않습니다.",
    "auth/user-not-found": "등록되지 않은 이메일입니다.",
    "auth/wrong-password": "비밀번호가 올바르지 않습니다.",
    "auth/invalid-credential": "이메일 또는 비밀번호가 올바르지 않습니다.",
    "auth/email-already-in-use": "이미 가입된 이메일입니다.",
    "auth/weak-password": "비밀번호는 6자 이상이어야 합니다.",
    "auth/popup-closed-by-user": "구글 로그인 창이 닫혔습니다.",
    "auth/too-many-requests": "잠시 후 다시 시도해 주세요.",
    "auth/school-domain-required": `학교 이메일(@${SCHOOL_EMAIL_DOMAIN})로만 가입할 수 있습니다.`,
    "auth/registration-code-invalid": "등록 코드가 올바르지 않습니다. 선생님께 받은 코드를 다시 확인해 주세요.",
    // 코드를 '확인하지 못한' 경우 — 코드가 틀린 게 아니라 서버 설정 문제라
    // 학생이 아무리 다시 입력해도 통과하지 못합니다. 그래서 학생을 붙잡지 않고
    // 선생님께 알리도록 안내합니다.
    "auth/registration-code-unavailable":
      "등록 코드를 확인할 수 없습니다. 잠시 후 다시 시도하고, 계속 안 되면 선생님께 알려 주세요.",
    "auth/profile-create-failed":
      "가입 정보를 저장하지 못했습니다. 등록 코드를 다시 확인하고, 계속 안 되면 선생님께 알려 주세요.",
    // 프로필을 읽지 못해 막힌 경우(주로 보안 규칙 문제) — '비밀번호가 틀렸나'
    // 하고 헤매지 않도록 따로 구분해 줍니다.
    "permission-denied":
      "계정 정보를 읽지 못했습니다. 잠시 후 다시 시도하고, 계속 안 되면 선생님께 알려 주세요.",
  };
  return map[code] || "로그인에 실패했습니다. 다시 시도해 주세요.";
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"/>
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33Z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"/>
    </svg>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState(null); // null | 'login' | 'signup'
  const [signupRole, setSignupRole] = useState(null); // 회원가입 시 선택: 'student' | 'teacher'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [regCode, setRegCode] = useState(""); // 회원가입 시 선생님이 알려준 등록 코드
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // ── 로그인/회원가입 모달 접근성 ──
  const firstFieldRef = useRef(null);

  // Escape로 닫기 — 마우스로만 닫을 수 있으면 키보드 사용자가 갇힙니다.
  useEffect(() => {
    if (!authMode) return;
    function onKey(e) {
      if (e.key === "Escape") setAuthMode(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authMode]);

  // 열리면 첫 입력칸으로 포커스를 옮겨 줍니다.
  useEffect(() => {
    if (authMode) firstFieldRef.current?.focus();
  }, [authMode]);

  // 모드 전환 시 역할 선택·오류 초기화
  function switchMode(mode) {
    setAuthMode(mode);
    setSignupRole(null);
    setRegCode("");
    setError("");
  }

  // 이미 로그인되어 있으면 게시판으로
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onAuthChange((u) => {
      if (u) router.replace("/board");
    });
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isFirebaseConfigured) {
      // 데모 모드 — 바로 입장
      router.push("/board");
      return;
    }
    setError("");
    setBusy(true);
    try {
      if (authMode === "signup") {
        await signUpWithEmail(email.trim(), password, signupRole, regCode);
      } else {
        await signInWithEmail(email.trim(), password);
      }
      router.push("/board");
    } catch (err) {
      setError(authErrorMessage(err?.code));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError("");
    // "Google 계정으로 계속하기"는 type="button"이라 <form>의 required
    // 검사(등록 코드 입력칸)를 거치지 않습니다 — 그냥 두면 코드 없이도
    // 구글 팝업이 열려 버립니다. 팝업을 열기 전에 여기서 먼저 막습니다.
    if (authMode === "signup" && !regCode.trim()) {
      setError("등록 코드를 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      await signInWithGoogle(
        authMode === "signup" ? signupRole : null,
        authMode === "signup" ? regCode : ""
      );
      router.push("/board");
    } catch (err) {
      setError(authErrorMessage(err?.code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    {/* ── 상단 바: 로고(왼쪽) + 로그인/회원가입(오른쪽) — 배경 일러스트 바깥 ── */}
    <header className="landing-top">
      <span className="landing-logo">
        <IconLogo size={26} /> 배움나눔
      </span>
      <div className="landing-actions">
        <button className="btn-outline" onClick={() => switchMode("login")}>
          로그인
        </button>
        <button className="btn-primary" onClick={() => switchMode("signup")}>
          회원가입
        </button>
      </div>
    </header>

    <main className="landing">
      {/* ── 중앙 여백: 타이틀 + 상세 설명 (글래스 카드) ── */}
      <section className="hero">
        <div className="hero-glass">
          <h1>배움나눔</h1>
          <p className="hero-sub">함께 묻고 답하며 성장하는 우리들의 공부방</p>
          <div className="hero-desc">
            <p>공부하다 막히는 부분이 있나요?</p>
            <p>질문을 올리면 친구들이 답변을 달아 줍니다.</p>
            <p>친구의 질문에 답하면서 내 실력도 함께 자랍니다.</p>
          </div>
        </div>
      </section>
    </main>

      {/* ── 푸터: 브랜드 · 정책 및 약관 · 문의 (배경 이미지 영역 밖) ── */}
      <SiteFooter />

      {/* ── 로그인 / 회원가입 모달 ── */}
      {authMode && (
        <div className="modal-backdrop" {...backdropClose(() => setAuthMode(null))}>
          <div
            className="modal modal-auth"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3 id="auth-modal-title">{authMode === "login" ? "로그인" : "회원가입"}</h3>
              <button
                className="btn-close"
                onClick={() => setAuthMode(null)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            <div className="tab-row">
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => switchMode("login")}
              >
                로그인
              </button>
              <button
                type="button"
                className={authMode === "signup" ? "active" : ""}
                onClick={() => switchMode("signup")}
              >
                회원가입
              </button>
            </div>

            {/* 회원가입 1단계 — 역할 선택 (실서비스만; 데모는 바로 입력) */}
            {isFirebaseConfigured && authMode === "signup" && !signupRole ? (
              <div className="signup-role-select">
                <p className="signup-role-q">어떤 역할로 가입하시나요?</p>
                <button
                  type="button"
                  className="signup-role-card"
                  onClick={() => setSignupRole("student")}
                >
                  <span className="signup-role-emoji">🎒</span>
                  <span className="signup-role-text">
                    <strong>학생</strong>
                    <small>질문하고 답하며, 공부방에 내 활동 카드를 남겨요.</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="signup-role-card"
                  onClick={() => setSignupRole("teacher")}
                >
                  <span className="signup-role-emoji">🧑‍🏫</span>
                  <span className="signup-role-text">
                    <strong>선생님</strong>
                    <small>공지·공부방 관리 등 교사 기능을 사용해요. (관리자 승인 후 활성화)</small>
                  </span>
                </button>
              </div>
            ) : (
            <form className="form-grid" onSubmit={handleSubmit}>
              {authMode === "signup" && signupRole && (
                <>
                  <div className="signup-role-chosen">
                    <span>
                      {signupRole === "teacher" ? "🧑‍🏫 선생님" : "🎒 학생"}(으)로 가입
                    </span>
                    <button
                      type="button"
                      className="signup-role-change"
                      onClick={() => setSignupRole(null)}
                    >
                      역할 변경
                    </button>
                  </div>
                  {signupRole === "teacher" ? (
                    <p className="signup-role-note">
                      선생님도 <strong>학교 이메일(@{SCHOOL_EMAIL_DOMAIN})</strong>로 가입해야 하며,
                      권한은 <strong>관리자 승인 후</strong> 부여됩니다. 승인 전까지는 학생으로
                      이용할 수 있어요.
                    </p>
                  ) : (
                    <p className="signup-role-note">
                      가입은 <strong>학교 이메일(@{SCHOOL_EMAIL_DOMAIN})</strong>로만
                      가능해요.
                    </p>
                  )}
                  <label className="sr-only" htmlFor="auth-regcode">등록 코드</label>
                  <input
                    id="auth-regcode"
                    type="text"
                    autoComplete="off"
                    placeholder="등록 코드 (선생님께 받은 코드)"
                    value={regCode}
                    onChange={(e) => setRegCode(e.target.value)}
                    maxLength={24}
                    required
                  />
                </>
              )}
              {/* placeholder는 입력을 시작하면 사라져 라벨을 대신할 수 없습니다.
                  화면에는 보이지 않되 스크린 리더가 읽는 라벨을 따로 답니다. */}
              <label className="sr-only" htmlFor="auth-email">이메일</label>
              <input
                id="auth-email"
                ref={firstFieldRef}
                type="email"
                autoComplete="email"
                placeholder="이메일"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <label className="sr-only" htmlFor="auth-password">비밀번호 (6자 이상)</label>
              <input
                id="auth-password"
                type="password"
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                placeholder="비밀번호 (6자 이상)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              {error && (
                <p className="auth-error" role="alert">{error}</p>
              )}

              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? "처리 중…" : authMode === "login" ? "로그인" : "회원가입"}
              </button>

              {isFirebaseConfigured && (
                <>
                  <div className="auth-divider"><span>또는</span></div>
                  <button
                    type="button"
                    className="btn-google"
                    onClick={handleGoogle}
                    disabled={busy}
                  >
                    <GoogleMark /> Google 계정으로 계속하기
                  </button>
                </>
              )}

              {!isFirebaseConfigured && (
                <div className="dev-note">
                  🔧 <strong>데모 모드</strong> — Firebase 미설정 상태라 입력값과
                  무관하게 임시 사용자로 입장합니다.
                </div>
              )}
            </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
