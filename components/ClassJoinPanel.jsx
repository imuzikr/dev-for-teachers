"use client";

import { useState } from "react";
import { IconSchool } from "./StatusIcons";
import { isValidClassJoinCode, normalizeClassJoinCode } from "@/lib/store";

export default function ClassJoinPanel({ joining, onJoin }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const normalizedCode = normalizeClassJoinCode(code);
    if (!isValidClassJoinCode(normalizedCode)) {
      setError("6자리 숫자 코드를 입력해 주세요.");
      return;
    }

    setError("");
    await onJoin(normalizedCode);
  }

  return (
    <main className="class-join-main" aria-labelledby="class-join-title">
      <section className="class-join-card">
        <div className="class-join-mark" aria-hidden="true">
          <IconSchool size={32} />
        </div>
        <p className="class-join-kicker">개발자실 참여</p>
        <h1 id="class-join-title" style={{ wordBreak: "keep-all" }}>우리 반 참여 코드로 들어가세요</h1>
        <p className="class-join-copy">
          안내받은 숫자 6자리 참여 코드를 입력해 주세요.
        </p>

        <form className="class-join-form" onSubmit={handleSubmit}>
          <label htmlFor="class-join-code">참여 코드</label>
          <div className="class-join-code-row">
            <input
              id="class-join-code"
              type="text"
              value={code}
              onChange={(event) => setCode(normalizeClassJoinCode(event.target.value).slice(0, 6))}
              placeholder="예: 123456"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="off"
              disabled={joining}
            />
            <button type="submit" className="btn-primary" disabled={joining}>
              {joining ? "확인 중" : "참여하기"}
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </form>

      </section>
    </main>
  );
}
