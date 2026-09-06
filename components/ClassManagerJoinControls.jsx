"use client";

import { useEffect, useState } from "react";
import { isValidClassJoinCode, normalizeClassJoinCode } from "@/lib/store";
import { backdropClose } from "@/lib/modal";

export default function ClassManagerJoinControls({
  classItem,
  busy,
  onToggleJoinAccess,
  onRefreshJoinCode,
  onSaveJoinCode,
  onToast,
}) {
  const [draftCode, setDraftCode] = useState(normalizeClassJoinCode(classItem.joinCode));
  const [showCodeModal, setShowCodeModal] = useState(false);
  const savedCode = normalizeClassJoinCode(classItem.joinCode);
  const readyToJoin = classItem.joinEnabled === true && isValidClassJoinCode(savedCode);
  const normalizedDraft = normalizeClassJoinCode(draftCode);
  const canSaveCode = isValidClassJoinCode(normalizedDraft) && normalizedDraft !== savedCode;
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

  async function copyCode() {
    if (!isValidClassJoinCode(savedCode)) return;
    try {
      await navigator.clipboard.writeText(savedCode);
      onToast?.(`'${classItem.name}' 반 참여 코드를 복사했어요.`);
    } catch {
      onToast?.("참여 코드를 복사하지 못했어요.");
    }
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
        <button
          type="button"
          className="btn-ghost"
          onClick={copyCode}
          disabled={busy || !isValidClassJoinCode(savedCode)}
          title="참여 코드를 클립보드에 복사합니다"
        >
          코드 복사
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setShowCodeModal(true)}
          disabled={!isValidClassJoinCode(savedCode)}
          title="학생들이 보기 쉽게 참여 코드를 크게 보여줍니다"
        >
          전체보기
        </button>
      </div>
      {showCodeModal && (
        <div className="class-code-preview-backdrop" {...backdropClose(() => setShowCodeModal(false))}>
          <section
            className="class-code-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`class-code-preview-title-${classItem.id}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="btn-close" onClick={() => setShowCodeModal(false)} aria-label="닫기">×</button>
            <span>참여 코드</span>
            <h3 id={`class-code-preview-title-${classItem.id}`}>{classItem.name}</h3>
            <strong>{savedCode}</strong>
            <button type="button" className="btn-primary" onClick={copyCode}>코드 복사</button>
          </section>
        </div>
      )}
    </div>
  );
}
