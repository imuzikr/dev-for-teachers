"use client";

// =============================================================
// 마인드맵 — 학생 화면 (개인 활동)
// -------------------------------------------------------------
// 활동을 열면 먼저 '내 마인드맵' 카드가 보이고, 그 카드를 누르면 자기
// 판으로 들어갑니다. 판에서는 방사형·계층형 가운데 하나를 고르고 가지를
// 붙여 나갑니다.
//
// 저장은 자동입니다(입력을 멈추면 조용히 저장).
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeMyParatextEntry, saveParatextEntry } from "@/lib/store";
import {
  MINDMAP_LAYOUTS,
  ROOT_ID,
  branchCount,
  emptyMindmap,
  maxDepth,
  normalizeMindmap,
  withRadialPositions,
} from "@/lib/mindmap";
import { safeBookUrl } from "@/lib/paratext";
import MindmapCanvas from "./MindmapCanvas";
import { IconBook, IconLock } from "./StatusIcons";

const SAVE_DELAY = 900; // ms — 이만큼 입력이 없으면 저장

export default function MindmapForm({ activity, user, onBack }) {
  const [map, setMap] = useState(() => emptyMindmap(activity.topic));
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false); // 내 카드를 눌러 판으로 들어왔는지
  const [selectedId, setSelectedId] = useState(ROOT_ID);
  const [status, setStatus] = useState("idle"); // idle | saving | saved
  // 내가 고친 뒤로는 서버 값이 와도 덮어쓰지 않습니다(편집 중 그림이 튀는 것 방지)
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);

  const locked = !!activity.locked;
  const bookUrl = safeBookUrl(activity.bookUrl);

  useEffect(() => {
    return subscribeMyParatextEntry(activity.id, user?.uid, (entry) => {
      if (!dirtyRef.current) {
        setMap(normalizeMindmap(entry?.answers, activity.topic));
      }
      setLoaded(true);
    });
  }, [activity.id, user?.uid, activity.topic]);

  useEffect(() => {
    if (!dirtyRef.current || locked) return;
    clearTimeout(timerRef.current);
    setStatus("saving");
    timerRef.current = setTimeout(async () => {
      try {
        await saveParatextEntry(activity.id, user, map);
        setStatus("saved");
      } catch {
        setStatus("idle");
      }
    }, SAVE_DELAY);
    return () => clearTimeout(timerRef.current);
  }, [map, activity.id, user, locked]);

  function edit(next) {
    dirtyRef.current = true;
    setMap(next);
  }

  function pickLayout(key) {
    if (key === map.layout) return;
    // 계층형으로만 만들다 방사형으로 오면 자리가 없어 모두 겹칩니다.
    // 자리 없는 노드에만 방사형 자리를 채워 준 뒤 형태를 바꿉니다.
    edit(key === "radial" ? withRadialPositions({ ...map, layout: key }) : { ...map, layout: key });
  }

  const branches = useMemo(() => branchCount(map), [map]);
  const depth = useMemo(() => maxDepth(map), [map]);
  const layoutKo = MINDMAP_LAYOUTS.find((l) => l.key === map.layout)?.ko ?? "방사형";

  return (
    <main className="books-main mindmap-main">
      <div className="books-head">
        <div className="books-head-main">
          {open ? (
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              ← 내 카드
            </button>
          ) : (
            <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
          )}
          <h1 className="book-group-title">
            {activity.title}
            <span className="book-group-topic">{activity.topic}</span>
          </h1>
          {bookUrl && !open && (
            <a
              className="btn-primary book-info-btn"
              href={bookUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconBook size={15} /> 도서 정보
            </a>
          )}
        </div>
        <div className="paratext-status">
          <span className="paratext-progress">
            {layoutKo} · 가지 {branches}개 · {depth}단계
          </span>
          {locked ? (
            <span className="paratext-saved locked">
              <IconLock size={14} /> 잠김
            </span>
          ) : (
            status !== "idle" && (
              <span className="paratext-saved">
                {status === "saving" ? "저장 중…" : "저장됨"}
              </span>
            )
          )}
        </div>
      </div>

      {locked && (
        <p className="book-locked-note">
          <IconLock size={15} /> 지금은 잠겨 있어 고칠 수 없어요. 만든 마인드맵은 그대로 남아 있습니다.
        </p>
      )}

      {!loaded ? (
        <p className="empty-note">불러오는 중이에요…</p>
      ) : !open ? (
        /* ── 내 카드 — 눌러서 내 판으로 ── */
        <div className="paratext-card-grid mindmap-own-grid">
          <button
            type="button"
            className={`paratext-student-card mindmap-own-card${branches > 0 ? " done" : " none"}`}
            onClick={() => setOpen(true)}
          >
            <span className="paratext-student-head">
              <strong>내 마인드맵</strong>
              <span className="mindmap-layout-tag">{layoutKo}</span>
            </span>
            <span className="mindmap-own-topic">{map.nodes[0]?.text || activity.topic}</span>
            <span className="paratext-student-meta">
              {branches === 0
                ? "아직 가지가 없어요 — 눌러서 시작하기"
                : `가지 ${branches}개 · ${depth}단계`}
            </span>
          </button>
        </div>
      ) : (
        <>
          <div className="mindmap-toolbar">
            <div className="book-seg mindmap-layout-seg">
              {MINDMAP_LAYOUTS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  className={`book-seg-btn${map.layout === l.key ? " active" : ""}`}
                  onClick={() => pickLayout(l.key)}
                  disabled={locked}
                  title={l.hint}
                >
                  {l.ko}
                </button>
              ))}
            </div>
            <span className="mindmap-layout-hint">
              {MINDMAP_LAYOUTS.find((l) => l.key === map.layout)?.hint}
            </span>
          </div>

          <MindmapCanvas
            map={map}
            onChange={locked ? null : edit}
            selectedId={selectedId}
            onSelect={setSelectedId}
            fitKey={activity.id}
          />
        </>
      )}
    </main>
  );
}
