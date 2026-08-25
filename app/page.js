"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import { backdropClose } from "@/lib/modal";
import {
  signInAsGuestTeacher,
  signInAsAdminWithGoogle,
  onAuthChange,
} from "@/lib/auth";
import { getGuestTeacherSession, saveGuestTeacherSession } from "@/lib/user";
import { IconLogo } from "@/components/StatusIcons";

// Firebase 인증 오류 코드를 한국어 메시지로
function authErrorMessage(code) {
  const map = {
    "auth/popup-closed-by-user": "구글 로그인 창이 닫혔습니다.",
    "auth/too-many-requests": "잠시 후 다시 시도해 주세요.",
    "auth/admin-restricted-operation":
      "일반 선생님 입장이 아직 활성화되지 않았습니다. Firebase Authentication에서 익명 로그인을 켜 주세요.",
    "auth/admin-email-unverified": "확인된 Google 계정으로 로그인해 주세요.",
    "auth/admin-already-claimed": "이미 등록된 관리자 Google 계정으로 로그인해 주세요.",
    "auth/profile-create-failed": "관리자 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
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
  const [authOpen, setAuthOpen] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [entryError, setEntryError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [entryBusy, setEntryBusy] = useState(false);

  useEffect(() => {
    const saved = getGuestTeacherSession();
    if (!saved) return;
    setSchoolName(saved.schoolName);
    setTeacherName(saved.teacherName);
  }, []);

  // Escape로 닫기 — 마우스로만 닫을 수 있으면 키보드 사용자가 갇힙니다.
  useEffect(() => {
    if (!authOpen) return;
    function onKey(e) {
      if (e.key === "Escape") setAuthOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authOpen]);

  // 이미 로그인되어 있으면 책방으로
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onAuthChange((u) => {
      if (u && !u.isGuestTeacher) router.replace("/books");
    });
  }, [router]);

  async function handleGuestStart(e) {
    e.preventDefault();
    const nextSchoolName = schoolName.trim();
    const nextTeacherName = teacherName.trim();
    if (!nextSchoolName || !nextTeacherName) {
      setEntryError("학교 이름과 이름을 모두 입력해 주세요.");
      return;
    }
    setEntryError("");
    setEntryBusy(true);
    try {
      if (isFirebaseConfigured) {
        await signInAsGuestTeacher({
          schoolName: nextSchoolName,
          teacherName: nextTeacherName,
        });
      } else {
        saveGuestTeacherSession({
          schoolName: nextSchoolName,
          teacherName: nextTeacherName,
        });
      }
      router.push("/books");
    } catch (err) {
      setEntryError(authErrorMessage(err?.code));
    } finally {
      setEntryBusy(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setBusy(true);
    try {
      await signInAsAdminWithGoogle();
      router.push("/books");
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
        <IconLogo size={26} /> 교사 개발자
      </span>
      <form className="landing-quick-start" onSubmit={handleGuestStart}>
        <label className="sr-only" htmlFor="landing-school">학교 이름</label>
        <input
          id="landing-school"
          type="text"
          autoComplete="organization"
          placeholder="학교 이름"
          value={schoolName}
          onChange={(e) => setSchoolName(e.target.value)}
          maxLength={40}
          required
        />
        <label className="sr-only" htmlFor="landing-name">이름</label>
        <input
          id="landing-name"
          type="text"
          autoComplete="name"
          placeholder="이름"
          value={teacherName}
          onChange={(e) => setTeacherName(e.target.value)}
          maxLength={40}
          required
        />
        <button className="btn-primary" type="submit" disabled={entryBusy}>
          {entryBusy ? "입장 중" : "시작하기"}
        </button>
        <button
          className="btn-outline"
          type="button"
          onClick={() => {
            setError("");
            setAuthOpen(true);
          }}
        >
          관리자 로그인
        </button>
        {entryError && (
          <p className="landing-entry-error" role="alert">{entryError}</p>
        )}
      </form>
    </header>

    <main className="landing">
      <section className="hero">
        <div className="hero-glass">
          <h1>교사 개발자</h1>
          <p className="hero-sub">
            <span>함께 연구하고</span>
            <span>아이디어를 나누는 작업실</span>
          </p>
        </div>
      </section>
    </main>

      {authOpen && (
        <div className="modal-backdrop" {...backdropClose(() => setAuthOpen(false))}>
          <div
            className="modal modal-auth"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3 id="auth-modal-title">
                관리자 로그인
              </h3>
              <button
                className="btn-close"
                onClick={() => setAuthOpen(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            <div className="form-grid admin-google-login">
              <p className="admin-login-note">
                <span>Google 관리자 계정으로 로그인하세요.</span>
                <span>관리자가 없으면 이 계정이 자동 등록됩니다.</span>
              </p>
              {error && (
                <p className="auth-error" role="alert">{error}</p>
              )}
              {isFirebaseConfigured && (
                <button
                  type="button"
                  className="btn-google"
                  onClick={handleGoogle}
                  disabled={busy}
                >
                  <GoogleMark /> {busy ? "로그인 중" : "Google 계정으로 관리자 로그인"}
                </button>
              )}

              {!isFirebaseConfigured && (
                <div className="dev-note">
                  <strong>Firebase 설정이 필요합니다.</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
