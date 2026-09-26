"use client";

import { useEffect, useRef, useState } from "react";
import { isTeacher } from "@/lib/user";
import { subscribeBroadcast, updateBookBroadcastScroll, startBookPortfolioBroadcast, stopBookPortfolioBroadcast } from "@/lib/store";

export default function usePortfolioPresentation({ user, classId, projectId, participantUid, studentName, className }) {
  const allowed = isTeacher(user);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const session = useRef(null);
  const ownedSession = useRef(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const timer = useRef(null);
  const retry = useRef(null);
  const position = useRef(null);

  useEffect(() => {
    mounted.current = true;
    generation.current += 1;
    session.current = null; ownedSession.current = null; pending.current = false; retry.current = null;
    setActive(false); setBusy(false); setError("");
    const unsubscribe = allowed ? subscribeBroadcast(classId, (broadcast) => {
      if (pending.current || !session.current) return;
      if (broadcast?.mode !== "bookPortfolio" || broadcast.scrollSessionId !== session.current) {
        session.current = null;
        clearTimeout(timer.current); timer.current = null;
        setActive(false); setError(""); retry.current = null;
      }
    }) : () => {};
    return () => {
      mounted.current = false;
      generation.current += 1;
      unsubscribe();
      clearTimeout(timer.current); timer.current = null;
      for (const id of new Set([ownedSession.current, session.current].filter(Boolean))) {
        void stopBookPortfolioBroadcast(classId, id).catch(() => {});
      }
    };
  }, [allowed, classId, projectId, participantUid, user?.uid]);

  async function start(html) {
    if (!allowed || pending.current || !html) return false;
    pending.current = true;
    const operation = generation.current;
    setBusy(true); setError("");
    const sessionId = crypto.randomUUID();
    session.current = sessionId;
    try {
      await startBookPortfolioBroadcast({ user, classId, projectId, participantUid, studentName, className, html, sessionId });
      if (!mounted.current || generation.current !== operation) {
        await stopBookPortfolioBroadcast(classId, sessionId);
        return false;
      }
      ownedSession.current = sessionId;
      setActive(true);
      retry.current = null;
      return true;
    } catch (cause) {
      if (mounted.current && generation.current === operation) {
        session.current = null;
        setActive(false);
        setError(cause?.code === "book-portfolio/html-too-large" ? cause.message : "포트폴리오를 공개하지 못했어요. 연결과 발표 권한을 확인한 뒤 다시 시도해 주세요.");
        retry.current = () => start(html);
      }
      return false;
    } finally {
      if (generation.current === operation) { pending.current = false; if (mounted.current) setBusy(false); }
    }
  }

  async function stop() {
    if (pending.current) return false;
    const sessionId = ownedSession.current || session.current;
    if (!sessionId) { setError(""); retry.current = null; return true; }
    pending.current = true;
    const operation = generation.current;
    setBusy(true); setError("");
    clearTimeout(timer.current); timer.current = null;
    try {
      await stopBookPortfolioBroadcast(classId, sessionId);
      if (generation.current !== operation) return false;
      session.current = null; ownedSession.current = null;
      if (mounted.current) setActive(false);
      retry.current = null;
      return true;
    } catch {
      if (mounted.current && generation.current === operation) {
        setError("발표를 종료하지 못했어요. 다시 시도해 주세요.");
        retry.current = stop;
      }
      return false;
    } finally {
      if (generation.current === operation) { pending.current = false; if (mounted.current) setBusy(false); }
    }
  }

  function scroll(next) {
    if (!session.current || pending.current) return;
    position.current = { ...next, sequence: Date.now() };
    if (timer.current) return;
    const sessionId = session.current;
    const write = async () => {
      timer.current = null;
      if (session.current !== sessionId || pending.current) return;
      try {
        await updateBookBroadcastScroll(classId, sessionId, position.current);
        if (mounted.current && session.current === sessionId && !pending.current) { setError(""); retry.current = null; }
      } catch {
        if (mounted.current && session.current === sessionId && !pending.current) {
          setError("발표 스크롤을 맞추지 못했어요. 다시 시도해 주세요.");
          retry.current = write;
        }
      }
    };
    timer.current = setTimeout(write, 180);
  }

  return { allowed, active, busy, error, start, stop, scroll, retry: () => retry.current?.() };
}
