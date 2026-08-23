"use client";

// KWLS 사이드 패널 — 공부방 왼쪽 고정 패널
// 하루에 1개 항목만 유지(같은 날 저장 시 덮어쓰기), 저장 후 입력창은 초기화됩니다.
import { useEffect, useState } from "react";
import { subscribeMyTodayKwl, subscribeAllKwl, subscribeMyAllKwl, addKwl, updateKwl, deleteKwl } from "@/lib/store";
import { IconRecord } from "@/components/StatusIcons";
import { IconPen } from "@/components/RichTextEditor";
import KwlFullscreenModal from "@/components/KwlFullscreenModal";
import { KWLS_COLUMNS, emptyKwlsAnswers, kwlsAnswersFromEntry } from "@/lib/kwls";

function getToday() {
  // 로컬(사용자 시간대) 자정 기준 날짜 — UTC 기준이면 KST 오전 9시에
  // 날짜가 바뀌므로, 한국 달력과 일치하도록 로컬 기준으로 계산합니다.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}

function KwlEntry({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [answers, setAnswers] = useState(() => kwlsAnswersFromEntry(entry));
  const [saving, setSaving] = useState(false);

  // 편집 중이 아닐 때만 외부 갱신(실시간 구독)을 입력값에 반영
  useEffect(() => {
    if (!editing) {
      setAnswers(kwlsAnswersFromEntry(entry));
    }
  }, [entry, editing]);

  function startEdit(e) {
    e.stopPropagation();
    setEditing(true);
  }
  function cancelEdit(e) {
    e.stopPropagation();
    setAnswers(kwlsAnswersFromEntry(entry));
    setEditing(false);
  }
  async function saveEdit(e) {
    e.stopPropagation();
    if (!Object.values(answers).some((v) => String(v).trim())) return;
    setSaving(true);
    try {
      await updateKwl(entry, { answers });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="kwl-entry kwl-entry--editing">
        {KWLS_COLUMNS.map((c) => (
          <div className="kwl-edit-row" key={c.key}>
            <span className={`kwl-badge kwl-badge-${c.letter.toLowerCase()}`}>{c.letter}</span>
            <textarea
              className="kwl-edit-textarea"
              value={answers[c.key] ?? ""}
              rows={2}
              placeholder={c.prompt}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [c.key]: e.target.value }))}
            />
          </div>
        ))}
        <div className="kwl-edit-actions">
          <button type="button" className="kwl-edit-cancel" onClick={cancelEdit} disabled={saving}>
            취소
          </button>
          <button type="button" className="kwl-edit-save" onClick={saveEdit} disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    );
  }

  const answersView = kwlsAnswersFromEntry(entry);

  return (
    <div
      className={`kwl-entry${expanded ? " kwl-entry--open" : ""}`}
      onClick={() => setExpanded((v) => !v)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && setExpanded((v) => !v)}
    >
      {KWLS_COLUMNS.map((c) =>
        answersView[c.key]?.trim() ? (
          <div className="kwl-history-row" key={c.key}>
            <span className={`kwl-badge kwl-badge-${c.letter.toLowerCase()}`}>{c.letter}</span>
            <p>{answersView[c.key]}</p>
          </div>
        ) : null
      )}
      <button type="button" className="kwl-entry-edit-btn" onClick={startEdit} aria-label="수정">
        <IconPen size={14} /> 수정
      </button>
    </div>
  );
}

export default function KwlPanel({ classId, user, isTeacher, onAsk, mobileOpen, onMobileClose }) {
  const today = getToday();

  const [tab, setTab] = useState("today");
  const [answers, setAnswers] = useState(() => emptyKwlsAnswers());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [todayEntries, setTodayEntries] = useState([]);
  const [allEntries, setAllEntries] = useState([]);
  const [showAllW, setShowAllW] = useState(false);
  const [history, setHistory] = useState([]);
  const [expandedDate, setExpandedDate] = useState(null);
  const [fullscreen, setFullscreen] = useState(false); // 교사: KWLS 전체 화면

  // 오늘 내 항목 구독
  useEffect(() => {
    if (!classId || !user) return;
    return subscribeMyTodayKwl(classId, user.uid, today, setTodayEntries);
  }, [classId, user?.uid, today]);

  // 교사: 오늘 전체 학생 구독
  useEffect(() => {
    if (!isTeacher || !classId) return;
    return subscribeAllKwl(classId, today, setAllEntries);
  }, [isTeacher, classId, today]);

  // 기록 탭: 내 전체 항목 구독 (오늘 포함)
  useEffect(() => {
    if (tab !== "history" || !classId || !user) return;
    return subscribeMyAllKwl(classId, user.uid, setHistory);
  }, [tab, classId, user?.uid, today]);

  async function handleSave() {
    if (!classId || !user) return;
    if (!Object.values(answers).some((v) => String(v).trim())) return;
    setSaving(true);
    try {
      await addKwl(classId, user, today, { answers });
      // 과거에 append 방식으로 누적된 오늘의 중복 항목 정리 (표준 ID 1개만 남김)
      const canonicalId = `${user.uid}_${classId}_${today}`;
      await Promise.all(
        todayEntries.filter((e) => e.id !== canonicalId).map((e) => deleteKwl(e))
      );
      // 저장 후 입력창 초기화
      setAnswers(emptyKwlsAnswers());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const allW = allEntries
    .map((e) => ({ ...e, answers: kwlsAnswersFromEntry(e) }))
    .filter((e) => e.answers.want?.trim() && e.userId !== user?.uid);
  const isEmpty = !Object.values(answers).some((v) => String(v).trim());

  // 기록 탭: 날짜별로 그룹화
  const historyByDate = history.reduce((acc, entry) => {
    if (!acc[entry.date]) acc[entry.date] = [];
    acc[entry.date].push(entry);
    return acc;
  }, {});
  const historyDates = Object.keys(historyByDate).sort((a, b) => b.localeCompare(a));

  if (!classId || !user) return null;

  return (
    <aside className={`kwl-panel${mobileOpen ? " kwl-panel--open" : ""}`}>
      {/* 모바일 닫기 버튼 */}
      {onMobileClose && (
        <button className="kwl-mobile-close" onClick={onMobileClose} aria-label="닫기">
          ×
        </button>
      )}
      {/* 탭 */}
      <div className="kwl-tabs">
        <button
          type="button"
          className={`kwl-tab ${tab === "today" ? "active" : ""}`}
          onClick={() => setTab("today")}
        >
          오늘
        </button>
        <button
          type="button"
          className={`kwl-tab kwl-tab--record ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          <IconRecord size={16} /> 기록
        </button>
        {isTeacher && (
          <button
            type="button"
            className="kwl-fullscreen-btn"
            onClick={() => setFullscreen(true)}
            title="오늘 학생들의 K·W·L·S를 전체 화면 4컬럼으로 보기"
          >
            ⛶ 전체 화면
          </button>
        )}
      </div>

      {tab === "today" ? (
        <>
          <div className="kwl-panel-date">{formatDateLabel(today)}</div>

          {/* 입력 폼 — 오늘 이미 작성했다면 숨기고 아래 항목의 '수정'으로만
              고치게 합니다(하루 1개, 새 글 추가 대신 수정만 허용). */}
          {todayEntries.length === 0 ? (
            <>
              {KWLS_COLUMNS.map((c) => (
                <div className="kwl-section" key={c.key}>
                  <div className="kwl-label-row">
                    <label className="kwl-label">
                      <span className={`kwl-badge kwl-badge-${c.letter.toLowerCase()}`}>{c.letter}</span>
                      {c.ko}
                    </label>
                    {c.key === "want" && answers.want.trim() && onAsk && (
                      <button
                        type="button"
                        className="kwl-ask-btn"
                        onClick={() => onAsk(answers.want.trim())}
                      >
                        ❓ 질문으로
                      </button>
                    )}
                  </div>
                  <textarea
                    className="kwl-textarea"
                    value={answers[c.key] ?? ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [c.key]: e.target.value }))}
                    placeholder={c.placeholder}
                    rows={3}
                  />
                </div>
              ))}

              <button
                type="button"
                className="kwl-save-btn"
                onClick={handleSave}
                disabled={saving || isEmpty}
              >
                {saving ? "저장 중..." : saved ? "✓ 저장됨" : "저장"}
              </button>
            </>
          ) : (
            <p className="kwl-already-done">
              ✓ 오늘의 KWLS를 작성했어요. 아래 항목의 <strong>수정</strong> 버튼으로 고칠 수 있어요.
            </p>
          )}

          {/* 오늘 저장된 항목 목록 */}
          {todayEntries.length > 0 && (
            <div className="kwl-today-entries">
              <p className="kwl-today-entries-label">
                오늘 저장된 항목 ({todayEntries.length})
              </p>
              {todayEntries.map((entry) => (
                <KwlEntry key={entry.id} entry={entry} />
              ))}
            </div>
          )}

          {/* 교사: 학생 W 모아보기 */}
          {isTeacher && allW.length > 0 && (
            <div className="kwl-all-w">
              <button
                type="button"
                className="kwl-all-w-toggle"
                onClick={() => setShowAllW((v) => !v)}
              >
                <span>👥 학생 W 모음 ({allW.length})</span>
                <span className="kwl-chevron">{showAllW ? "▴" : "▾"}</span>
              </button>
              {showAllW && (
                <ul className="kwl-all-w-list">
                  {allW.map((e) => (
                    <li key={e.id} className="kwl-all-w-item">
                      <span className="kwl-all-w-author">
                        {e.authorEmoji} {e.authorName}
                      </span>
                      <p className="kwl-all-w-text">{e.answers.want}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      ) : (
        /* 기록 탭 */
        <div className="kwl-history">
          {historyDates.length === 0 ? (
            <p className="kwl-history-empty">아직 저장된 기록이 없어요.</p>
          ) : (
            <ul className="kwl-history-list">
              {historyDates.map((date) => {
                const open = expandedDate === date;
                const entries = historyByDate[date];
                const firstAnswers = kwlsAnswersFromEntry(entries[0]);
                const preview = KWLS_COLUMNS.map((c) => firstAnswers[c.key]).find(Boolean) || "";
                return (
                  <li key={date} className="kwl-history-item">
                    <button
                      type="button"
                      className="kwl-history-toggle"
                      onClick={() => setExpandedDate(open ? null : date)}
                    >
                      <span className="kwl-history-toggle-inner">
                        <span className="kwl-history-date">
                          {formatDateLabel(date)}
                          {entries.length > 1 && (
                            <span className="kwl-history-count"> ×{entries.length}</span>
                          )}
                        </span>
                        {!open && preview && (
                          <span className="kwl-history-preview">{preview}</span>
                        )}
                      </span>
                      <span className="kwl-chevron">{open ? "▴" : "▾"}</span>
                    </button>
                    {open && (
                      <div className="kwl-history-body">
                        {entries.map((entry) => (
                          <KwlEntry key={entry.id} entry={entry} />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* 교사: KWLS 전체 화면 (날짜별 4컬럼, 좌우 화살표·달력으로 날짜 이동) */}
      {fullscreen && (
        <KwlFullscreenModal
          classId={classId}
          initialDate={today}
          onClose={() => setFullscreen(false)}
        />
      )}
    </aside>
  );
}
