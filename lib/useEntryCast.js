"use client";

// =============================================================
// 개인 활동 영역 방송 훅 (곁텍스트 읽기 · RAFT 글쓰기 공용)
// -------------------------------------------------------------
// 교사가 학생 글의 '한 영역'을 골라 학급 전체 화면에 띄웁니다.
//
// [전환이 왜 간단한가]
// 방송은 반마다 문서 하나(broadcasts/{classId})뿐이라, 다른 영역의 내용을
// 그 문서에 덮어쓰면 학생 화면이 끊김 없이 그 영역으로 바뀝니다. 그래서
// '끄고 다시 켜기'가 필요 없고, 보내고 싶은 영역의 버튼을 그냥 누르면
// 곧바로 전환됩니다(화면이 잠깐 원래대로 돌아가는 깜빡임이 없음).
//
// 방송 중인 학생이 글을 고치면 그 내용도 따라가야 하므로, payload가 바뀌면
// 잠깐 모았다가 다시 보냅니다(타자 한 글자마다 쓰지 않도록).
// =============================================================
import { useEffect, useRef, useState } from "react";
import { startBroadcast, stopBroadcast } from "./store";

const RESEND_DELAY = 600; // ms

export function useEntryCast(classId, user) {
  // 지금 방송 중인 대상 — { uid, key } (학생 uid + 영역 키)
  const [target, setTarget] = useState(null);
  const canCast = !!(classId && user);
  const liveRef = useRef(false);
  liveRef.current = !!target;

  // 보드를 벗어나면 방송도 반드시 종료 — 학생 화면이 갇히지 않게
  useEffect(() => {
    return () => {
      if (liveRef.current && classId) stopBroadcast(classId).catch(() => {});
    };
  }, [classId]);

  // 같은 영역을 다시 누르면 종료, 다른 영역이면 그리로 전환합니다.
  function cast(next, payload) {
    if (!canCast) return;
    if (target && target.uid === next.uid && target.key === next.key) {
      setTarget(null);
      stopBroadcast(classId).catch(() => {});
      return;
    }
    setTarget(next);
    startBroadcast(user, classId, payload).catch(() => {});
  }

  function stop() {
    if (!target) return;
    setTarget(null);
    stopBroadcast(classId).catch(() => {});
  }

  // 방송 중인 내용이 바뀌면(학생이 고치면) 다시 보냅니다.
  function useLiveUpdate(payload) {
    const key = JSON.stringify(payload ?? null);
    useEffect(() => {
      if (!target || !canCast || !payload) return;
      const t = setTimeout(() => {
        startBroadcast(user, classId, payload).catch(() => {});
      }, RESEND_DELAY);
      return () => clearTimeout(t);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
  }

  const isCasting = (uid, key) => !!target && target.uid === uid && target.key === key;

  return { target, canCast, cast, stop, isCasting, useLiveUpdate };
}
