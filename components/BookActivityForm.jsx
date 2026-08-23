"use client";

// =============================================================
// 독서 활동 만들기 (교사 전용)
// -------------------------------------------------------------
// 활동 종류를 먼저 고르면 그에 필요한 항목만 남습니다.
//  · 닿소리 채우기 — 모둠 협동. 주제어와 모둠 구성을 정합니다.
//      교사 배정/무작위 → 만든 뒤 모둠 대시보드에서 명단을 짜고,
//      자유 구성 → 학생이 직접 골라 들어갑니다.
//      모둠 이름을 쉼표로 적으면 그 이름으로 한 번에 만들어집니다.
//  · 곁텍스트 읽기 / RAFT 글쓰기 / KWLS로 성찰하기 — 개인 활동. 모둠이 없어
//      모둠 설정은 감추고, 대신 학생이 눌러볼 도서 정보 사이트 주소를 받습니다.
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useState } from "react";
import { safeBookUrl } from "@/lib/paratext";

const TYPES = [
  { key: "consonant", label: "닿소리 채우기", desc: "모둠이 함께 자음 칸을 낱말로 채웁니다", defaultTitle: "닿소리 채우기" },
  { key: "paratext", label: "곁텍스트 읽기", desc: "표지·제목·목차를 보고 혼자 내용을 짐작합니다", defaultTitle: "곁텍스트 읽기" },
  { key: "raft", label: "RAFT 글쓰기", desc: "역할·청중·형식·주제를 정해 읽은 뒤 글을 씁니다", defaultTitle: "RAFT 글쓰기" },
  { key: "kwls", label: "KWLS로 성찰하기", desc: "읽기 전 아는 것·궁금한 것, 읽은 뒤 알게 된 것을 적습니다", defaultTitle: "KWLS로 성찰하기" },
  { key: "mindmap", label: "마인드맵", desc: "주제에서 가지를 뻗어 생각을 방사형·계층형으로 펼칩니다", defaultTitle: "마인드맵" },
];
const MODES = [
  { key: "teacher", label: "교사 배정" },
  { key: "random", label: "무작위" },
  { key: "free", label: "자유 구성" },
];
const GROUP_COUNTS = [3, 4, 5, 6];

// "햇살, 바람, 나무" → ["햇살","바람","나무"] (빈 항목은 버림)
function parseNames(raw) {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export default function BookActivityForm({ onSave, onClose, initialType = "consonant", fixedType = false }) {
  const initial = TYPES.find((t) => t.key === initialType) ?? TYPES[0];
  const [type, setType] = useState(initial.key);
  const [title, setTitle] = useState(initial.defaultTitle);
  const [topic, setTopic] = useState("");
  const [bookUrl, setBookUrl] = useState("");
  const [groupMode, setGroupMode] = useState("teacher");
  const [groupCount, setGroupCount] = useState(4);
  const [maxPerGroup, setMaxPerGroup] = useState(6);
  const [namesRaw, setNamesRaw] = useState("");
  const [warning, setWarning] = useState(null); // 이름 개수 불일치 안내
  const [saving, setSaving] = useState(false);

  const names = parseNames(namesRaw);
  // 곁텍스트 읽기·RAFT·KWLS·마인드맵은 개인 활동이라 모둠 설정이 없고,
  // 대신 학생이 눌러볼 도서 정보 주소를 받습니다.
  const isSolo = ["paratext", "raft", "kwls", "mindmap"].includes(type);
  // 주소를 적었는데 열 수 없는 형태면 만들기 전에 알려 줍니다.
  const urlBad = bookUrl.trim().length > 0 && !safeBookUrl(bookUrl);

  // 종류를 바꾸면 활동 이름도 따라갑니다 — 단, 교사가 직접 고친 이름은 지키기
  function pickType(next) {
    setType(next);
    const from = TYPES.find((t) => t.key === type);
    if (title.trim() === "" || title === from?.defaultTitle) {
      setTitle(TYPES.find((t) => t.key === next)?.defaultTitle ?? title);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!topic.trim() || saving || urlBad) return;

    // 이름을 적었는데 모둠 수와 개수가 다르면 만들지 않고 알려 줍니다.
    if (!isSolo && names.length > 0 && names.length !== groupCount) {
      setWarning(
        `모둠은 ${groupCount}개인데 이름은 ${names.length}개를 적으셨어요.\n` +
          `개수를 맞추거나, 이름을 비우면 '1모둠·2모둠…'으로 자동으로 붙습니다.`
      );
      return;
    }

    setSaving(true);
    try {
      await onSave({
        type,
        title,
        topic,
        bookUrl: isSolo ? bookUrl.trim() : "",
        groupMode,
        groupCount,
        maxPerGroup,
        groupNames: names,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <form className="modal book-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-head">
          <h3>독서 활동 만들기</h3>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {!fixedType && (
          <div className="book-field">
            <span>활동 종류</span>
            <div className="book-type-seg">
              {TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`book-type-btn${type === t.key ? " active" : ""}`}
                  onClick={() => pickType(t.key)}
                  aria-pressed={type === t.key}
                >
                  <strong>{t.label}</strong>
                  <em>{t.desc}</em>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="book-field-row">
          <label className="book-field">
            <span>활동 이름</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={40}
            />
          </label>
          <label className="book-field">
            <span>주제어 · 도서명</span>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="예: 어린 왕자"
              maxLength={30}
              autoFocus
            />
          </label>
        </div>

        {isSolo ? (
          /* 개인 활동 — 모둠 설정 대신 학생이 눌러볼 도서 정보 주소를 받습니다 */
          <label className="book-field">
            <span>
              도서 정보 사이트 <em className="book-optional">선택</em>
            </span>
            {/* type="url"이 아니라 text입니다 — 'www.yes24.com/…'처럼 앞에
                https://를 안 붙이고 적는 경우가 많은데, type="url"이면 브라우저가
                제출 자체를 막아 버립니다. 대신 safeBookUrl이 검사하고 채워 줍니다. */}
            <input
              type="text"
              inputMode="url"
              value={bookUrl}
              onChange={(e) => setBookUrl(e.target.value)}
              placeholder="예: www.yes24.com/product/goods/..."
            />
            <em className="book-help">
              {urlBad
                ? "열 수 없는 주소예요. http:// 또는 https:// 로 시작하는 주소를 넣어 주세요."
                : "넣어 두면 학생 화면에 ‘도서 정보’ 버튼이 생겨 새 탭으로 열립니다."}
            </em>
          </label>
        ) : (
          <>
            <div className="book-field">
              <span>모둠 구성 방식</span>
              <div className="book-seg">
                {MODES.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    className={`book-seg-btn${groupMode === m.key ? " active" : ""}`}
                    onClick={() => setGroupMode(m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="book-field-row">
              <div className="book-field">
                <span>모둠 수</span>
                <div className="book-seg">
                  {GROUP_COUNTS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`book-seg-btn${groupCount === n ? " active" : ""}`}
                      onClick={() => setGroupCount(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {groupMode === "free" && (
                <div className="book-field book-field--narrow">
                  <span>모둠당 최대</span>
                  <select value={maxPerGroup} onChange={(e) => setMaxPerGroup(Number(e.target.value))}>
                    {[3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>{n}명</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <label className="book-field">
              <span>
                모둠 이름 <em className="book-optional">선택</em>
                {names.length > 0 && (
                  <b className={names.length === groupCount ? "book-cnt ok" : "book-cnt bad"}>
                    {names.length} / {groupCount}
                  </b>
                )}
              </span>
              <input
                type="text"
                value={namesRaw}
                onChange={(e) => setNamesRaw(e.target.value)}
                placeholder="쉼표로 구분 — 예: 햇살, 바람, 나무, 별빛"
              />
            </label>
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
          <button
            type="submit"
            className="btn-primary"
            disabled={!topic.trim() || saving || urlBad}
          >
            {saving
              ? "만드는 중…"
              : isSolo
                ? "학생별 활동으로 만들기"
                : `모둠 ${groupCount}개와 함께 만들기`}
          </button>
        </div>

        {warning && (
          <div className="modal-backdrop confirm-backdrop" onClick={() => setWarning(null)}>
            <div
              className="confirm-modal"
              role="alertdialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="confirm-icon-wrap">
                <span className="confirm-icon" aria-hidden="true">⚠️</span>
              </div>
              <h3 className="confirm-title">모둠 수와 이름 개수가 달라요</h3>
              <p className="confirm-desc">{warning}</p>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="confirm-confirm"
                  onClick={() => setWarning(null)}
                  autoFocus
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
