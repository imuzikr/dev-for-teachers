"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "./BookPortfolio.css";
import { flushStudentAutosaves } from "@/lib/studentAutosave";

const BookPortfolioModal = dynamic(() => import("./BookPortfolioModal"), { ssr: false });

export default function BookPortfolioButton({ project, participant, classId, className, user, entriesByActivity, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    setOpen(false);
    setSaving(false);
    setSaveError(false);
    return () => { request.current += 1; };
  }, [classId, project?.id, project?.version, participant?.uid, user?.uid]);
  async function openPortfolio() {
    const current = ++request.current;
    setSaving(true);
    setSaveError(false);
    const saved = await flushStudentAutosaves();
    if (current !== request.current) return;
    setSaving(false);
    if (saved) setOpen(true);
    else setSaveError(true);
  }
  const unavailable = disabled || !classId || (project?.classId || project?.id) !== classId;
  const label = participant?.name || participant?.realName || participant?.displayName || "학생";
  return <>
    <button type="button" className="book-portfolio-trigger" disabled={unavailable || !participant || saving} aria-busy={saving}
      aria-label={participant ? `${label} 포트폴리오 만들기` : "포트폴리오 만들기"}
      aria-haspopup="dialog" aria-expanded={open}
      title={!participant ? "학생 개인 카드를 선택해 주세요." : `${className}에 저장한 활동으로 학생별 차시 보고서 만들기`} onClick={openPortfolio}>
      포트폴리오 만들기
    </button>
    {saveError && <small className="form-error" role="alert">입력 내용을 아직 모두 저장하지 못했어요. 이미지 처리와 자동 저장 상태를 확인해 주세요.</small>}
    {open && participant && !unavailable && <BookPortfolioModal project={project} participant={participant} classId={classId} className={className}
      user={user} entriesByActivity={entriesByActivity} onClose={() => setOpen(false)} />}
  </>;
}
