"use client";

// =============================================================
// 닿소리 채우기 캔버스 — 3×5 격자
// -------------------------------------------------------------
// 한가운데는 주제어(도서명), 나머지 14칸은 자음입니다.
// 칸을 누르면 입력창이 열리고, 넣은 단어는 칩으로 쌓입니다.
//
// 같은 판을 두 가지로 씁니다.
//  · viewMode="mine"  학생의 '내 판' — 내가 넣은 낱말만 보이고 입력합니다.
//  · viewMode="group" 교사의 '모둠 판' — 모둠원 전체의 낱말을 모아 보여 주고,
//      누가 넣었는지 색으로 구분합니다(위쪽에 이름·색 범례).
//
// 낱말은 예전과 같은 곳(모둠의 words)에 저장됩니다. 문서마다 authorId가
// 있어서, 걸러 보여 주는 기준만 달라질 뿐 자료 구조는 그대로입니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeBookGroups, subscribeGroupWords, addConsonantWord, deleteConsonantWord } from "@/lib/store";
import { CONSONANT_LABELS, GRID_SLOTS, CELL_COUNT, cellKey } from "@/lib/consonants";
import { memberColor, memberLegend } from "@/lib/bookColors";
import { IconLock } from "./StatusIcons";

export default function ConsonantCanvas({
  activity,
  groupId,
  user,
  isTeacher,
  viewMode = "group",
  // embedded — 교사 화면 가운데 칸에 끼워 넣는 형태(자체 머리말·뒤로가기 없음)
  embedded = false,
  onBack,
}) {
  const [words, setWords] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null); // 입력창이 열린 자음 칸
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => subscribeGroupWords(activity.id, groupId, setWords), [activity.id, groupId]);
  useEffect(() => subscribeBookGroups(activity.id, setGroups), [activity.id]);

  const group = groups.find((g) => g.id === groupId);
  const isMember = (group?.memberUids ?? []).includes(user?.uid);
  const mineOnly = viewMode === "mine";
  // 교사는 확인만 하고, 입력은 그 모둠 학생이 합니다. 잠긴 활동도 입력 불가.
  const canWrite = mineOnly && isMember && !activity.locked;

  // '내 판'은 내가 넣은 낱말만 담습니다.
  const shown = useMemo(
    () => (mineOnly ? words.filter((w) => w.authorId === user?.uid) : words),
    [words, mineOnly, user?.uid]
  );

  // 모둠 판 범례 — 누가 어떤 색인지
  const legend = useMemo(
    () => (mineOnly ? [] : memberLegend(group)),
    [mineOnly, group]
  );

  // 자음 칸별로 단어를 모아 둡니다 (오래된 순)
  const byCell = useMemo(() => {
    const map = {};
    shown.forEach((w) => {
      (map[w.cellKey] ??= []).push(w);
    });
    Object.values(map).forEach((list) =>
      list.sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
    );
    return map;
  }, [shown]);

  const filled = useMemo(
    () => Array.from({ length: CELL_COUNT }, (_, i) => (byCell[cellKey(i)] ?? []).length > 0)
      .filter(Boolean).length,
    [byCell]
  );

  useEffect(() => {
    if (activeIndex !== null) inputRef.current?.focus();
  }, [activeIndex]);

  async function handleAdd(index) {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await addConsonantWord(activity.id, groupId, { cellKey: cellKey(index), text }, user);
    inputRef.current?.focus(); // 연달아 입력할 수 있게
  }

  function openCell(index) {
    if (!canWrite) return;
    setActiveIndex(index);
    setDraft("");
  }

  const Root = embedded ? "div" : "main";
  return (
    <Root className={embedded ? "canvas-embed" : "canvas-main"}>
      {!embedded && (
        <div className="canvas-head">
          <button type="button" className="btn-ghost" onClick={onBack}>
            {mineOnly ? "← 활동 목록" : "← 모둠"}
          </button>
          <div className="canvas-head-title">
            <strong>
              {mineOnly ? "내 판" : group?.groupName || "모둠"}
            </strong>
            <span>
              {activity.title}
              {mineOnly && group && ` · ${group.groupName || "모둠"}`}
            </span>
          </div>
          <div className="canvas-progress">
            <div className="canvas-progress-bar">
              <span style={{ width: `${(filled / CELL_COUNT) * 100}%` }} />
            </div>
            <span className="canvas-progress-text">{filled} / {CELL_COUNT}칸</span>
          </div>
        </div>
      )}

      {activity.locked ? (
        <p className="book-locked-note">
          <IconLock size={15} /> 잠긴 활동이라 새 단어를 넣을 수 없어요.
        </p>
      ) : !mineOnly ? (
        !embedded && (
          <p className="book-locked-note">
            모둠원이 각자 넣은 낱말을 모아 봅니다. 색으로 누가 넣었는지 알 수 있어요.
          </p>
        )
      ) : !isMember ? (
        <p className="book-locked-note">이 모둠의 구성원만 단어를 넣을 수 있어요.</p>
      ) : null}

      {/* 모둠 판 범례 — 이름과 색을 짝지어 보여 줍니다 */}
      {!mineOnly && legend.length > 0 && (
        <div className="canvas-legend">
          {legend.map((m) => (
            <span key={m.uid} className="canvas-legend-item">
              <i
                className="canvas-legend-swatch"
                style={{ background: m.color.bg, borderColor: m.color.border }}
              />
              {m.name}
            </span>
          ))}
        </div>
      )}

      <div className="consonant-grid">
        {GRID_SLOTS.map((slot, pos) => {
          // 한가운데 — 주제어 칸
          if (slot === null) {
            return (
              <div key={pos} className="consonant-cell consonant-center">
                <span className="consonant-center-label">학습주제 · 도서명</span>
                <strong className="consonant-center-topic">{activity.topic}</strong>
              </div>
            );
          }

          const list = byCell[cellKey(slot)] ?? [];
          const open = activeIndex === slot;
          return (
            <div
              key={pos}
              className={`consonant-cell${list.length > 0 ? " has-words" : ""}${open ? " open" : ""}`}
            >
              <div className="consonant-cell-head">
                <span className="consonant-label">{CONSONANT_LABELS[slot]}</span>
                {canWrite && !open && (
                  <button
                    type="button"
                    className="consonant-add"
                    onClick={() => openCell(slot)}
                    title={`${CONSONANT_LABELS[slot]} 단어 넣기`}
                    aria-label={`${CONSONANT_LABELS[slot]} 단어 넣기`}
                  >
                    ＋
                  </button>
                )}
              </div>

              <div className="consonant-words">
                {list.map((w) => {
                  // 모둠 판에서는 낱말 색으로 누가 넣었는지 구분합니다.
                  const c = mineOnly ? null : memberColor(group, w.authorId);
                  return (
                  <span
                    key={w.id}
                    className={`consonant-chip${c ? " tinted" : ""}`}
                    title={w.authorName || ""}
                    style={c ? { background: c.bg, borderColor: c.border, color: c.text } : undefined}
                  >
                    {w.text}
                    {(w.authorId === user?.uid || isTeacher) && !activity.locked && (
                      <button
                        type="button"
                        className="consonant-chip-x"
                        aria-label={`${w.text} 지우기`}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConsonantWord(activity.id, groupId, w.id);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </span>
                  );
                })}
              </div>

              {open && (
                <input
                  ref={inputRef}
                  className="consonant-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAdd(slot);
                    } else if (e.key === "Escape") {
                      setActiveIndex(null);
                      setDraft("");
                    }
                  }}
                  onBlur={() => {
                    if (!draft.trim()) setActiveIndex(null);
                  }}
                  placeholder="단어 입력 후 Enter"
                  maxLength={20}
                />
              )}
            </div>
          );
        })}
      </div>

      {canWrite && (
        <p className="canvas-hint">
          칸의 ＋를 누르고 단어를 적은 뒤 Enter를 누르세요. 내가 넣은 단어는 ×로 지울 수 있어요.
        </p>
      )}
    </Root>
  );
}
