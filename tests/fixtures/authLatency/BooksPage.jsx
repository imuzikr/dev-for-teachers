"use client";
import { useEffect, useState } from "react";
import { onAuthChange, signOutUser } from "@/lib/auth";
import { getCurrentUser } from "@/lib/user";
function Consumer({ number }) {
  const [user, setUser] = useState(undefined);
  useEffect(() => onAuthChange(setUser), []);
  return <p data-testid={`consumer-${number}`}>{user === undefined ? "loading" : user?.uid || "signed-out"}</p>;
}
export default function BooksPage() {
  const [signedOut, setSignedOut] = useState(false);
  return <main><h1>책방</h1>
    {[1, 2, 3].map(number => <Consumer key={number} number={number} />)}
    <button onClick={async () => { await signOutUser(); setSignedOut(getCurrentUser() === null); }}>로그아웃</button>
    {signedOut && <p>사용자 캐시 초기화됨</p>}
  </main>;
}
