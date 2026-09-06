"use client";

import { useState } from "react";
import { IconSchool } from "./StatusIcons";
import { isValidClassJoinCode, normalizeClassJoinCode } from "@/lib/store";

export default function ClassJoinPanel({ joinableCount, joining, onJoin }) {
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
        <h1 id="class-join-title">우리 반 참여 코드로 들어가세요</h1>
        <p className="class-join-copy">
          선생님이 반 관리에서 가입을 열고 알려 준 코드를 입력하면, 다음 접속부터는 자동으로 해당 반 개발자실로 들어갑니다.
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

        <p className="class-join-footnote">
          {joinableCount === 1
            ? "가입 허용 중인 반이 하나라면 자동 연결을 시도합니다."
            : "가입 허용 중인 반이 여러 개이거나 없으면 참여 코드가 필요합니다."}
        </p>
      </section>
    </main>
  );
}
