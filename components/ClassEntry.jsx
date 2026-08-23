"use client";

// =============================================================
// 반 입장 화면 (학생) — 공부방은 반별 공간이라 입장 코드가 필요합니다.
// -------------------------------------------------------------
// 코드를 맞게 입력하면 그 반 id를 세션에 저장하고 공부방을 보여줍니다.
// 실명/명부 없이 "어느 반인지"만 기억하므로 익명성은 그대로 유지됩니다.
// =============================================================
import { useState } from "react";
import { findClassByCode, joinClass } from "@/lib/store";
import { setSelectedClassId } from "@/lib/classroom";
import { getCurrentUser } from "@/lib/user";
import { isFirebaseConfigured } from "@/lib/firebase";

export default function ClassEntry() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setChecking(true);
    setError("");
    try {
      const found = await findClassByCode(code);
      if (!found) {
        setError("입장 코드를 찾을 수 없어요. 코드를 다시 확인해 주세요.");
        return;
      }
      if (found.expired) {
        setError("만료된 입장 코드예요. 선생님께 새 코드를 요청해 주세요.");
        return;
      }
      // 서버에 소속을 기록 → 기기를 바꿔도 로그인하면 그대로 입장 상태 유지
      // 코드를 함께 보내 보안 규칙이 코드 유효성·만료를 서버에서 재검증합니다
      const user = getCurrentUser();
      if (user) await joinClass(found.id, user, code);
      setSelectedClassId(found.id);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="class-entry">
      <div className="class-entry-card">
        <div className="class-entry-emoji" aria-hidden="true">🧩</div>
        <h2>공부방에 입장하기</h2>
        <p>선생님이 알려 준 우리 반 입장 코드를 입력해 주세요.</p>
        <form onSubmit={handleSubmit} className="class-entry-form">
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError("");
            }}
            placeholder="예: MATH31"
            maxLength={10}
            autoFocus
            className="class-entry-input"
            aria-label="반 입장 코드"
          />
          <button type="submit" className="btn-primary" disabled={checking}>
            {checking ? "확인 중..." : "입장"}
          </button>
        </form>
        {error && <p className="class-entry-error">{error}</p>}
        {!isFirebaseConfigured && (
          <p className="class-entry-hint">
            데모 코드 — <code>MATH31</code> (3학년 1반) · <code>INFO32</code>{" "}
            (3학년 2반) · <code>BOND33</code> (3학년 3반)
          </p>
        )}
      </div>
    </div>
  );
}
