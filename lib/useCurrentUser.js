"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "./user";
import { isFirebaseConfigured } from "./firebase";
import { onAuthChange } from "./auth";

// 현재 로그인 사용자를 반환합니다(로그인 전/로딩 중에는 null).
export function useCurrentUser() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (isFirebaseConfigured) {
      // 실서비스: 인증 상태 구독
      return onAuthChange((u) => setUser(u));
    }
    // 데모 모드: 역할 전환 이벤트 구독
    const syncUser = () => setUser(getCurrentUser());
    syncUser();
    window.addEventListener("role-change", syncUser);
    return () => window.removeEventListener("role-change", syncUser);
  }, []);

  return user;
}
