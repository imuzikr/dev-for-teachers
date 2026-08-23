"use client";

// =============================================================
// [개발용] 관리자/학생 보기 전환 토글
// -------------------------------------------------------------
// 실제 로그인을 붙이기 전, 두 역할의 화면 차이(공지 작성 버튼,
// 실명 확인 등)를 바로 확인하기 위한 도구입니다.
// 운영 배포 시 이 컴포넌트만 상단바에서 빼면 됩니다.
// =============================================================
import { useEffect, useState } from "react";
import { getCurrentUser, setRoleOverride } from "@/lib/user";
import { IconTeacher, IconStudent } from "./StatusIcons";

const ROLES = [
  { id: "admin", Icon: IconTeacher, label: "관리자" },
  { id: "student", Icon: IconStudent, label: "학생" },
];

export default function RoleSwitcher() {
  // 하이드레이션 오류 방지를 위해 마운트 후에 현재 역할을 읽습니다
  const [role, setRole] = useState(null);

  useEffect(() => {
    setRole(getCurrentUser().role);
  }, []);

  function choose(r) {
    setRoleOverride(r);
    setRole(r);
  }

  return (
    <div
      className="role-switch"
      title="개발용 — 관리자/학생 화면을 전환해서 확인할 수 있어요"
    >
      {ROLES.map(({ id, Icon, label }) => (
        <button
          key={id}
          type="button"
          className={role === id ? "active" : ""}
          onClick={() => choose(id)}
        >
          <Icon size={22} /> {label}
        </button>
      ))}
    </div>
  );
}
