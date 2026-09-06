"use client";

import { useEffect, useState } from "react";
import { isValidClassJoinCode, normalizeClassJoinCode } from "@/lib/store";

export default function ClassManagerJoinControls({
  classItem,
  busy,
  onToggleJoinAccess,
  onRefreshJoinCode,
  onSaveJoinCode,
}) {
  const [draftCode, setDraftCode] = useState(normalizeClassJoinCode(classItem.joinCode));
  const readyToJoin = classItem.joinEnabled === true && isValidClassJoinCode(classItem.joinCode);
  const normalizedDraft = normalizeClassJoinCode(draftCode);
  const canSaveCode = isValidClassJoinCode(normalizedDraft) && normalizedDraft !== classItem.joinCode;
  const statusLabel = readyToJoin
    ? "가입 허용"
    : classItem.joinEnabled === true
      ? "코드 확인 필요"
      : "가입 차단";

  useEffect(() => {
    setDraftCode(normalizeClassJoinCode(classItem.joinCode));
  }, [classItem.joinCode]);

  function handleSubmit(event) {
    event.preventDefault();
    if (!canSaveCode || busy) return;
    onSaveJoinCode(classItem, normalizedDraft);
  }

  return (
    <div className="class-mgr-join-controls">
      <div className="class-mgr-join">
        <span className={`class-mgr-join-state${readyToJoin ? " is-open" : ""}`}>
          {statusLabel}
        </span>
      </div>
      <form className="class-mgr-join-code-form" onSubmit={handleSubmit}>
        <label htmlFor={`class-join-code-${classItem.id}`}>참여 코드</label>
        <input
          id={`class-join-code-${classItem.id}`}
          type="text"
          value={draftCode}
          onChange={(event) => setDraftCode(normalizeClassJoinCode(event.target.value).slice(0, 6))}
          placeholder="123456"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          disabled={busy}
        />
        <button type="submit" className="btn-ghost" disabled={!canSaveCode || busy}>
          코드 저장
        </button>
      </form>
      <div className="class-mgr-join-actions">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => onToggleJoinAccess(classItem)}
          disabled={busy}
          title="학생 가입 허용 상태를 바꿉니다"
        >
          {classItem.joinEnabled === true ? "가입 차단" : "가입 허용"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => onRefreshJoinCode(classItem)}
          disabled={busy}
          title="참여 코드를 새로 만듭니다"
        >
          자동 생성
        </button>
      </div>
    </div>
  );
}
