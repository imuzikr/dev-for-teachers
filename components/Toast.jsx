"use client";

// =============================================================
// 간단한 토스트 알림 — 화면 하단 가운데에 잠깐 떴다 사라집니다.
// message가 있으면 보이고, duration 후 onDone으로 부모에게 알립니다.
// =============================================================
import { useEffect } from "react";

export default function Toast({ message, duration = 2600, onDone }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => onDone?.(), duration);
    return () => clearTimeout(t);
  }, [message, duration, onDone]);

  if (!message) return null;
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}
