"use client";

// 보호 페이지 가드 — 로그인하지 않은 사용자를 랜딩(/)으로 보냅니다.
// 인증 상태가 확정된 뒤 사용자가 없으면 리다이렉트합니다(로딩 중에는 대기).
// Firebase 미설정(데모) 시에는 아무것도 하지 않습니다.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "./firebase";
import { onAuthChange } from "./auth";

export function useRequireAuth() {
  const router = useRouter();
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onAuthChange((u) => {
      if (!u) router.replace("/");
    });
  }, [router]);
}
