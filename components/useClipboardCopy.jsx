"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Toast from "./Toast";

export default function useClipboardCopy() {
  const [result, setResult] = useState(null);
  const request = useRef(0);
  const clear = useCallback(() => setResult(null), []);
  useEffect(() => () => { request.current += 1; }, []);

  async function copy(text, id) {
    const current = ++request.current;
    setResult(null);
    try {
      await navigator.clipboard.writeText(text);
      if (current === request.current) setResult({ id, success: true, message: "복사했습니다." });
    } catch {
      if (current === request.current) setResult({ id, success: false, message: "복사하지 못했어요. 클립보드 권한을 확인하고 다시 시도해 주세요." });
    }
  }

  return {
    copy,
    copiedId: result?.success ? result.id : null,
    notice: result && createPortal(<Toast message={result.message} onDone={clear} />, document.body),
  };
}
