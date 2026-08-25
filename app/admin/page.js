"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";
import ActivityHeatmap from "@/components/ActivityHeatmap";
import ConfirmModal from "@/components/ConfirmModal";
import { IconStudent, IconTrash } from "@/components/StatusIcons";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { isAdmin } from "@/lib/user";
import {
  deleteStudent,
  subscribeUserActivity,
  subscribeUserDirectory,
} from "@/lib/store";

function userName(user) {
  return user.realName || user.displayName || "이름 미설정";
}

function deleteErrorText(error) {
  if (error?.code === "permission-denied") {
    return "관리자 권한을 확인하지 못했습니다. 다시 로그인한 뒤 시도해 주세요.";
  }
  return `탈퇴 처리에 실패했습니다. (${error?.message || "알 수 없는 오류"})`;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const user = useCurrentUser();
  useRequireAuth();
  const admin = user ? isAdmin(user) : false;
  const [directory, setDirectory] = useState([]);
  const [activityEvents, setActivityEvents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user && !admin) router.replace("/books");
  }, [admin, router, user]);

  useEffect(() => {
    if (!admin) return;
    return subscribeUserDirectory(setDirectory);
  }, [admin]);

  const users = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ko");
    return directory
      .filter((entry) => entry.uid !== user?.uid)
      .filter((entry) => {
        if (!term) return true;
        return [entry.schoolName, entry.realName, entry.displayName, entry.email, entry.uid]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase("ko").includes(term));
      })
      .sort((a, b) => userName(a).localeCompare(userName(b), "ko"));
  }, [directory, query, user?.uid]);

  useEffect(() => {
    if (users.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!users.some((entry) => entry.uid === selectedId)) setSelectedId(users[0].uid);
  }, [selectedId, users]);

  const selected = users.find((entry) => entry.uid === selectedId) ?? null;

  useEffect(() => {
    if (!admin || !selectedId) {
      setActivityEvents([]);
      return;
    }
    return subscribeUserActivity(selectedId, setActivityEvents);
  }, [admin, selectedId]);

  async function handleDelete() {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    setError("");
    try {
      await deleteStudent(deleteTarget.uid);
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(deleteErrorText(deleteError));
    } finally {
      setDeleteBusy(false);
    }
  }

  if (!admin) return null;

  return (
    <div className="admin-shell">
      <TopNav active="admin" />
      <div className="admin-layout">
        <aside className="student-panel" aria-label="사용자 목록">
          <div className="admin-panel-head">
            <h2>사용자</h2>
            <span>{users.length}명</span>
          </div>
          <label className="admin-user-search">
            <span className="sr-only">사용자 검색</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="학교명 또는 이름 검색"
            />
          </label>
          {users.length === 0 ? (
            <div className="admin-empty">조회할 사용자가 없습니다.</div>
          ) : (
            <div className="student-list">
              {users.map((entry) => (
                <div className={`student-row ${entry.uid === selectedId ? "active" : ""}`} key={entry.uid}>
                  <button type="button" className="student-row-main" onClick={() => setSelectedId(entry.uid)}>
                    <span className="avatar avatar-sm"><IconStudent size={19} /></span>
                    <span className="student-main">
                      <strong>{userName(entry)}</strong>
                      <small>{entry.schoolName || entry.email || "학교 미입력"}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="student-more-btn admin-user-delete"
                    onClick={() => setDeleteTarget(entry)}
                    title={`${userName(entry)} 탈퇴 처리`}
                    aria-label={`${userName(entry)} 탈퇴 처리`}
                  >
                    <IconTrash size={17} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>

        <main className="admin-main">
          {error && <p className="admin-warning" role="alert">{error}</p>}
          {selected ? (
            <>
              <header className="admin-hero admin-heatmap-heading">
                <div className="admin-student-title">
                  <span className="avatar"><IconStudent size={22} /></span>
                  <div>
                    <h1>{userName(selected)}</h1>
                    <p>{selected.schoolName || "학교 미입력"}</p>
                  </div>
                </div>
                <button type="button" className="btn-ghost role-danger-btn" onClick={() => setDeleteTarget(selected)}>
                  <IconTrash size={17} /> 탈퇴 처리
                </button>
              </header>
              <ActivityHeatmap events={activityEvents} />
            </>
          ) : (
            <div className="admin-empty">왼쪽에서 사용자를 선택해 주세요.</div>
          )}
        </main>
      </div>

      {deleteTarget && (
        <ConfirmModal
          title="사용자 탈퇴 처리"
          preview={`${deleteTarget.schoolName ? `${deleteTarget.schoolName} · ` : ""}${userName(deleteTarget)}`}
          description={"사용자 프로필과 앱에 저장된 게시물·활동 데이터를 삭제합니다. Firebase Authentication의 익명 계정 자체는 Admin SDK 없이 삭제할 수 없습니다."}
          confirmLabel={deleteBusy ? "처리 중..." : "탈퇴 처리"}
          danger
          onConfirm={handleDelete}
          onClose={() => !deleteBusy && setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
