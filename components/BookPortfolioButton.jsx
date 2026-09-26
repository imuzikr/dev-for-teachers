"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import "./BookPortfolio.css";

const BookPortfolioModal = dynamic(() => import("./BookPortfolioModal"), { ssr: false });

export default function BookPortfolioButton({ project, participant, classId, className, user, entriesByActivity, disabled = false }) {
  const [open, setOpen] = useState(false);
  const unavailable = disabled || !classId || (project?.classId || project?.id) !== classId;
  const label = participant?.name || participant?.realName || participant?.displayName || "학생";
  return <>
    <button type="button" className="book-portfolio-trigger" disabled={unavailable || !participant}
      aria-label={participant ? `${label} 포트폴리오 만들기` : "포트폴리오 만들기"}
      aria-haspopup="dialog" aria-expanded={open}
      title={!participant ? "학생 개인 카드를 선택해 주세요." : `${className}에 저장한 활동으로 학생별 차시 보고서 만들기`} onClick={() => setOpen(true)}>
      포트폴리오 만들기
    </button>
    {open && participant && !unavailable && <BookPortfolioModal project={project} participant={participant} classId={classId} className={className}
      user={user} entriesByActivity={entriesByActivity} onClose={() => setOpen(false)} />}
  </>;
}
