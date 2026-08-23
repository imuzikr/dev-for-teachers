"use client";

// =============================================================
// 마인드맵 — 교사 화면 (개인 활동)
// -------------------------------------------------------------
// 왼쪽에 학생 목록, 오른쪽에 고른 학생의 마인드맵. 다른 개인 활동은 목록과
// 상세가 화면을 갈아 끼우지만, 마인드맵은 그림이라 '옆 학생 것과 견주며
// 훑어보는' 일이 잦아 한 화면에 나란히 둡니다.
//
// 오른쪽 판은 교사도 직접 편집할 수 있습니다(수업 중 학생을 도와 가지를
// 잡아 주거나 예시를 보여줄 때). 다만 이 편집은 화면(그리고 방송)에만
// 잠깐 보이는 임시 편집이고, 학생의 실제 기록(entries 문서)에는 저장되지
// 않습니다 — 교사가 임의로 학생의 진짜 마인드맵을 바꿔 버리면 안 되기
// 때문입니다. 방송 중에 고치면 그 내용이 곧바로(0.6초 안에) 학생 화면까지
// 따라가지만, 다른 학생으로 옮기거나 화면을 벗어나면 이 임시 편집은
// 버려지고 학생 자신의 원래 기록이 다시 보입니다.
//
// 오른쪽 판의 '수업 시작'을 누르면 그 학생의 마인드맵이 학급 전체 화면에
// 뜹니다. 방송 중에 다른 학생을 고르면 끄지 않아도 그리로 곧바로 바뀝니다
// (방송 문서를 새 내용으로 덮어쓰기만 하므로 깜빡임이 없습니다).
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeParatextEntries } from "@/lib/store";
import { useEntryCast } from "@/lib/useEntryCast";
import {
  MINDMAP_LAYOUTS,
  branchCount,
  maxDepth,
  mindmapStarted,
  normalizeMindmap,
} from "@/lib/mindmap";
import { safeBookUrl } from "@/lib/paratext";
import MindmapCanvas from "./MindmapCanvas";
import CastBar from "./CastBar";
import { IconBook, IconLock } from "./StatusIcons";

// 방송에서 마인드맵은 통째로 하나 — 나눌 영역이 없어 키를 고정합니다.
const REGION_KEY = "map";

export default function MindmapBoard({
  activity,
  className = "",
  classId = null,
  user = null,
  roster = [],
  onBack,
}) {
  const [entries, setEntries] = useState([]);
  const [openUid, setOpenUid] = useState(null);
  // 교사가 지금 고치는 중인 초안 — 학생의 실제 기록(entries)에는 저장되지
  // 않는 임시 편집입니다. 화면·방송에만 쓰이고, 다른 학생으로 옮기거나
  // 이 화면을 벗어나면 그냥 버려집니다.
  const [draftMap, setDraftMap] = useState(null);
  const dirtyRef = useRef(false);

  useEffect(() => subscribeParatextEntries(activity.id, setEntries), [activity.id]);

  // 편집판이 노드를 고르고 지울 때 씁니다(학생 화면과 같은 방식).
  const [selectedId, setSelectedId] = useState(null);

  // 다른 학생으로 옮기면 이전 학생의 임시 편집·선택은 버립니다.
  useEffect(() => {
    dirtyRef.current = false;
    setDraftMap(null);
    setSelectedId(null);
  }, [openUid]);

  const bookUrl = safeBookUrl(activity.bookUrl);
  const cast = useEntryCast(classId, user);

  const cards = useMemo(() => {
    const byUid = new Map(entries.map((e) => [e.authorId, e]));
    const fromRoster = roster.map((s) => ({
      uid: s.uid,
      name: s.name,
      studentId: s.studentId,
      map: normalizeMindmap(byUid.get(s.uid)?.answers, activity.topic),
      hasEntry: byUid.has(s.uid),
    }));
    const seen = new Set(roster.map((s) => s.uid));
    const strays = entries
      .filter((e) => !seen.has(e.authorId))
      .map((e) => ({
        uid: e.authorId,
        name: e.authorName || "이름 미설정",
        studentId: null,
        map: normalizeMindmap(e.answers, activity.topic),
        hasEntry: true,
      }));
    return [...fromRoster, ...strays];
  }, [roster, entries, activity.topic]);

  // 학생 목록이 바뀌어 지금 열어 둔 학생이 사라진 경우에만 선택을 비웁니다.
  // 처음 진입할 때는 교사가 학생을 직접 고르기 전까지 오른쪽 판을 비워 둡니다.
  useEffect(() => {
    if (openUid !== null && !cards.some((c) => c.uid === openUid)) setOpenUid(null);
  }, [cards, openUid]);

  const open = openUid ? cards.find((c) => c.uid === openUid) ?? null : null;
  const startedCount = cards.filter((c) => mindmapStarted(c.map)).length;

  // 지금 화면·방송에 실제로 쓸 그림 — 고치는 중이면 서버 값 대신 초안입니다.
  const displayedMap = dirtyRef.current && draftMap ? draftMap : open?.map ?? null;

  const castCard = cast.target ? cards.find((c) => c.uid === cast.target.uid) ?? null : null;
  // 방송 중인 학생을 지금 편집하고 있으면, 저장이 끝나길 기다리지 않고
  // 지금 그리는 중인 내용을 그대로 방송에 실어 보냅니다.
  const castMap = castCard && open?.uid === castCard.uid ? displayedMap : castCard?.map ?? null;

  const livePayload = useMemo(() => {
    if (!castCard || !castMap) return null;
    return buildPayload(activity, { ...castCard, map: castMap });
  }, [castCard, castMap, activity]);
  cast.useLiveUpdate(livePayload);

  // 교사 편집 — 캔버스에서 바뀔 때마다 화면(과 방송)에만 바로 반영합니다.
  // 학생의 실제 기록은 건드리지 않는 임시 편집이라 서버 저장은 없습니다.
  function editMindmap(next) {
    dirtyRef.current = true;
    setDraftMap(next);
  }

  function toggleCast(card) {
    cast.cast({ uid: card.uid, key: REGION_KEY }, buildPayload(activity, card));
  }

  const openLive = open ? cast.isCasting(open.uid, REGION_KEY) : false;

  return (
    <main className="books-main mindmap-board-main">
      <div className="books-head">
        <div className="books-head-main">
          <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
          <h1 className="book-group-title">
            {activity.title}
            <span className="book-group-topic">{activity.topic}</span>
            {className && <span className="book-group-class">{className}</span>}
          </h1>
          {bookUrl && (
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
        <span className="paratext-sum">
          시작 {startedCount}명 / 전체 {cards.length}명
        </span>
      </div>

      {cast.target && castCard && (
        <CastBar
          who={castCard.name}
          label="마인드맵"
          index={0}
          total={1}
          onPrev={null}
          onNext={null}
          onStop={cast.stop}
        />
      )}

      {activity.locked && (
        <p className="book-locked-note">
          <IconLock size={15} /> 지금은 잠겨 있어 학생이 고칠 수 없어요.
        </p>
      )}

      {cards.length === 0 ? (
        <p className="empty-note">
          아직 이 반에 들어온 학생이 없어요. 학생이 반에 들어오면 목록이 생깁니다.
        </p>
      ) : (
        <div className="mindmap-board-body">
          {/* ── 왼쪽: 학생 목록 ── */}
          <aside className="dash-side mindmap-student-side">
            <h3>학생 {cards.length}명</h3>
            <ul className="mindmap-student-list">
              {cards.map((c) => {
                const branches = branchCount(c.map);
                const casting = cast.target?.uid === c.uid;
                return (
                  <li key={c.uid}>
                    <button
                      type="button"
                      className={`mindmap-student-card${openUid === c.uid ? " on" : ""}${
                        mindmapStarted(c.map) ? " done" : ""
                      }${casting ? " casting" : ""}`}
                      onClick={() => setOpenUid(c.uid)}
                    >
                      <span className="paratext-student-head">
                        <strong>{c.name}</strong>
                        {c.studentId && (
                          <span className="paratext-student-no">{c.studentId}</span>
                        )}
                        {casting && <span className="broadcast-live-dot" aria-hidden="true" />}
                      </span>
                      <span className="paratext-student-meta">
                        {branches === 0
                          ? "아직 시작 전"
                          : `가지 ${branches}개 · ${maxDepth(c.map)}단계`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* ── 오른쪽: 고른 학생의 마인드맵 ── */}
          <section className="mindmap-view">
            {open ? (
              <>
                <header className="mindmap-view-head">
                  <span className="mindmap-view-who">
                    <strong>{open.name}</strong>
                    {open.studentId && (
                      <span className="paratext-student-no">{open.studentId}</span>
                    )}
                  </span>
                  <span className="mindmap-layout-tag">
                    {MINDMAP_LAYOUTS.find((l) => l.key === displayedMap.layout)?.ko}
                  </span>
                  <span className="mindmap-view-meta">
                    가지 {branchCount(displayedMap)}개 · {maxDepth(displayedMap)}단계
                  </span>
                  {dirtyRef.current && (
                    <span className="paratext-saved">임시 편집 (저장되지 않음)</span>
                  )}
                  {cast.canCast && (
                    <button
                      type="button"
                      className={`btn-ghost dash-cast-btn${openLive ? " on" : ""}`}
                      onClick={() => toggleCast(open)}
                      title={
                        openLive
                          ? "학생 화면을 원래대로 되돌립니다"
                          : "이 마인드맵을 학급 전체 화면에 띄웁니다"
                      }
                    >
                      {openLive && <span className="broadcast-live-dot" aria-hidden="true" />}
                      {openLive ? "수업 종료" : "수업 시작"}
                    </button>
                  )}
                </header>
                {/* 교사도 직접 고칠 수 있습니다 — 학생 화면과 같은 판·같은 조작
                    (더블클릭으로 가지 추가, 우클릭으로 글 고치기)입니다.
                    아직 학생이 시작 전이어도 판 자체는 그대로 두고, 대신
                    가운데 주제만 있다는 안내만 살짝 얹습니다(교사가 대신
                    가지를 잡아 줄 수 있게). */}
                {!mindmapStarted(displayedMap) && (
                  <p className="mindmap-empty-hint">
                    {open.name} 학생이 아직 시작하지 않았어요 — 여기서 대신 가지를 만들어 줄 수 있어요.
                  </p>
                )}
                <MindmapCanvas
                  map={displayedMap}
                  onChange={editMindmap}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  fitKey={open.uid}
                  className="mindmap-view-stage"
                />
              </>
            ) : (
              <p className="empty-note">왼쪽에서 학생을 골라 주세요.</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

// 마인드맵 한 장을 방송 꾸러미로. 학생은 남의 기록을 직접 읽을 권한이 없어
// 그림을 그릴 재료(형태·노드)를 방송 문서에 실어 보냅니다.
function buildPayload(activity, card) {
  const branchTotal = branchCount(card.map);
  const depth = maxDepth(card.map);
  return {
    mode: "mindmap",
    activityTitle: activity.title ?? "",
    topic: activity.topic ?? "",
    writerName: card.name,
    // 오래 켜져 있던 학생 브라우저가 mindmap 전용 오버레이를 아직 모를 때도
    // 빈 발표 카드가 뜨지 않도록 일반 발표 필드도 함께 싣습니다.
    boardTitle: activity.title ?? "마인드맵",
    displayName: card.name,
    title: `${card.name}의 마인드맵`,
    content:
      branchTotal === 0
        ? "아직 작성된 가지가 없습니다."
        : `주제: ${activity.topic ?? ""}\n가지 ${branchTotal}개 · ${depth}단계`,
    layout: card.map.layout,
    nodes: card.map.nodes.map((n) => ({
      id: n.id,
      parentId: n.parentId,
      text: n.text,
      edgeLabel: n.edgeLabel ?? "",
      // Firestore는 undefined를 저장하지 못해 빈 자리는 null로 맞춥니다
      x: Number.isFinite(n.x) ? n.x : null,
      y: Number.isFinite(n.y) ? n.y : null,
    })),
  };
}
