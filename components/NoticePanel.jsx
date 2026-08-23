"use client";

// 3단: 공지사항 패널 — 실시간 공지 목록 + 공지 작성(서식 지원)
import { useState } from "react";
import { addNotice, deleteNotice, formatTime, toDate } from "@/lib/store";
import { getCurrentUser, isTeacher, isAdmin } from "@/lib/user";
import { sanitizeHtml, stripHtml } from "@/lib/html";
import { useCurrentUser } from "@/lib/useCurrentUser";
import RichTextEditor from "./RichTextEditor";
import ConfirmModal from "./ConfirmModal";
import { IconNotice, IconTeacher, IconTrash } from "./StatusIcons";

export default function NoticePanel({ notices }) {
  const user = useCurrentUser();
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState(""); // 서식(HTML) 내용
  const [resetKey, setResetKey] = useState(0);
  const [sortDir, setSortDir] = useState("desc"); // 날짜 정렬: desc(최신순)/asc(오래된순)
  const [confirmDelete, setConfirmDelete] = useState(null); // 삭제 확인 중인 공지
  const [mobileOpen, setMobileOpen] = useState(false); // 모바일에서 공지 본문 펼침

  // 날짜 기준 정렬 (토글)
  const sortedNotices = [...notices].sort((a, b) => {
    const diff = toDate(a.createdAt) - toDate(b.createdAt);
    return sortDir === "asc" ? diff : -diff;
  });

  async function handleSubmit(e) {
    e.preventDefault();
    const html = sanitizeHtml(content);
    if (!title.trim() || stripHtml(html).length === 0) return;
    await addNotice(getCurrentUser(), {
      title: title.trim(),
      content: html,
    });
    setTitle("");
    setContent("");
    setResetKey((k) => k + 1);
    setWriting(false);
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    await deleteNotice(confirmDelete.id);
    setConfirmDelete(null);
  }

  return (
    <aside className={`notice-col${mobileOpen ? " is-open" : ""}`}>
      <h2>
        <span className="notice-col-title">
          <IconNotice size={32} /> 공지사항
          {/* 접혀 있는 모바일에서 새 공지가 있는지 바로 보이도록 개수 표시 */}
          {notices.length > 0 && (
            <span className="notice-count">{notices.length}</span>
          )}
        </span>
        <span className="notice-head-actions">
          {/* 날짜 정렬 토글 — 한 버튼으로 오름/내림 전환 */}
          <button
            className="btn-ghost notice-sort-btn"
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            title={sortDir === "desc" ? "최신순 (클릭 시 오래된순)" : "오래된순 (클릭 시 최신순)"}
          >
            {sortDir === "desc" ? "↓ 최신순" : "↑ 오래된순"}
          </button>
          {/* 공지 작성은 관리자/교사 전용 (isAdmin 관문) */}
          {isTeacher(user) && (
            <button className="btn-ghost" onClick={() => setWriting(!writing)}>
              {writing ? "닫기" : "+ 작성"}
            </button>
          )}
          {/* 모바일 전용 펼침 버튼 — 좁은 화면에선 공지 영역이 질문 목록을
              밀어내므로 기본은 접어 두고 필요할 때만 펼칩니다.
              (데스크톱에서는 CSS로 숨기고 본문을 항상 펼쳐 둡니다) */}
          <button
            className="btn-ghost notice-toggle-btn"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "공지사항 접기" : "공지사항 펼치기"}
          >
            {mobileOpen ? "⌃" : "⌄"}
          </button>
        </span>
      </h2>

      <div className="notice-body">
      {writing && (
        <form
          className="form-grid"
          onSubmit={handleSubmit}
          style={{ marginBottom: 14 }}
        >
          <input
            type="text"
            placeholder="공지 제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <RichTextEditor
            key={resetKey}
            variant="full"
            small
            onChange={setContent}
            placeholder="공지 내용"
          />
          <button type="submit" className="btn-primary">
            공지 등록
          </button>
        </form>
      )}

      {notices.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--text-sub)" }}>
          등록된 공지가 없습니다.
        </p>
      )}
      {sortedNotices.map((n) => {
        const canDelete = !!user && (n.authorId === user.uid || isAdmin(user));
        return (
          <div className="notice-item" key={n.id}>
            <h4>{n.title}</h4>
            <div className="notice-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(n.content) }} />
            <div className="notice-foot">
              {/* 공지 작성자는 항상 "선생님"으로 표시됩니다 */}
              <time className="notice-author">
                <IconTeacher size={16} /> {n.authorName ?? "선생님"} · {formatTime(n.createdAt)}
              </time>
              {canDelete && (
                <button
                  type="button"
                  className="btn-ghost qa-delete notice-delete-btn"
                  onClick={() => setConfirmDelete(n)}
                  aria-label="공지 삭제"
                >
                  <IconTrash size={15} />
                </button>
              )}
            </div>
          </div>
        );
      })}
      </div>

      {confirmDelete && (
        <ConfirmModal
          icon={<IconTrash size={40} />}
          title="공지 삭제"
          preview={confirmDelete.title}
          description={"이 공지를 삭제합니다. 되돌릴 수 없습니다."}
          confirmLabel="삭제하기"
          danger
          onConfirm={handleConfirmDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </aside>
  );
}
