"use client";

// =============================================================
// 발표 강제 전환 오버레이 — 교사가 보드 발표 모드·카드 크게 보기를 켜면
// 그 반 학생 전원의 화면이 이 화면으로 강제 전환됩니다(교사 화면은
// 그대로). 학생 쪽에는 닫기 버튼이 없고, 교사가 방송을 끝내면(또는
// 모달을 닫으면) 자동으로 사라집니다.
// =============================================================
import { sanitizeHtml } from "@/lib/html";
import { CONSONANT_LABELS, GRID_SLOTS, CELL_COUNT, cellKey, groupColorOf } from "@/lib/consonants";
import { normalizeMindmap } from "@/lib/mindmap";
import MindmapCanvas from "./MindmapCanvas";

// 이 화면이 그릴 줄 아는 방송 종류. 새 종류를 추가하면 여기에도 넣어야 합니다.
const KNOWN_MODES = ["consonant", "entry", "mindmap", "lesson", "carousel", "single"];

export default function PresentationOverlay({ broadcast }) {
  // [버전이 어긋났을 때]
  // 학생 브라우저에 이전 배포의 화면이 열린 채로 남아 있으면, 새로 생긴
  // 방송 종류를 못 알아봅니다. 그때 그냥 아래로 흘려보내면 빈 발표 카드가
  // 떠서 '선생님이 빈 화면을 띄웠다'고 오해하게 됩니다. 그래서 모르는
  // 종류는 무엇을 해야 하는지(새로고침) 분명히 알려 줍니다.
  if (!KNOWN_MODES.includes(broadcast.mode ?? "")) {
    return (
      <div
        className="broadcast-overlay broadcast-overlay--stale"
        role="alertdialog"
        aria-modal="true"
        aria-label="화면을 불러오지 못했어요"
      >
        <div className="broadcast-bar">
          <span className="broadcast-live-dot" aria-hidden="true" />
          선생님이 화면을 보여주고 있어요
        </div>
        <div className="broadcast-body">
          <div className="broadcast-stale-note">
            <strong>화면을 불러오려면 새로고침이 필요해요.</strong>
            <p>
              앱이 새 버전으로 바뀌었어요. 브라우저를 새로고침하면
              선생님 화면이 바로 보입니다.
            </p>
            <button type="button" className="btn-primary" onClick={() => location.reload()}>
              새로고침
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 책방 전체 집계 중계 — 교사가 보고 있는 집계판을 그대로 띄웁니다.
  // 학생은 다른 모둠 낱말을 읽을 권한이 없으므로, 집계 결과는 방송 문서에
  // 담겨 옵니다(broadcast.cells). 교사가 칸을 크게 열면 zoomSlot도 따라옵니다.
  if (broadcast.mode === "consonant") {
    const cells = broadcast.cells ?? {};
    const zoomSlot = broadcast.zoomSlot;
    const zoomList = zoomSlot != null ? cells[cellKey(zoomSlot)] ?? [] : null;
    return (
      <div
        className="broadcast-overlay broadcast-overlay--consonant"
        role="alertdialog"
        aria-modal="true"
        aria-label="선생님 집계 화면"
      >
        <div className="broadcast-bar">
          <span className="broadcast-live-dot" aria-hidden="true" />
          선생님이 전체 집계를 보여주고 있어요
          {broadcast.topic && <span className="broadcast-board"># {broadcast.topic}</span>}
          <span className="broadcast-progress">
            {broadcast.totalFilled ?? 0} / {CELL_COUNT}칸 · 낱말 {broadcast.totalWords ?? 0}개
          </span>
        </div>

        <div className="broadcast-body">
          <div className="consonant-grid dash-grid cast-grid">
            {GRID_SLOTS.map((slot, pos) => {
              if (slot === null) {
                return (
                  <div key={pos} className="consonant-cell consonant-center">
                    <span className="consonant-center-label">학습주제 · 도서명</span>
                    <strong className="consonant-center-topic">{broadcast.topic}</strong>
                  </div>
                );
              }
              const list = cells[cellKey(slot)] ?? [];
              return (
                <div
                  key={pos}
                  className={`consonant-cell dash-cell${list.length ? " has-words" : ""}`}
                >
                  <span className="consonant-label">{CONSONANT_LABELS[slot]}</span>
                  <CastRows list={list} />
                </div>
              );
            })}
          </div>
        </div>

        {/* 교사가 칸을 크게 열면 학생 화면에도 같은 모달이 뜹니다.
            (교사 화면과 같은 클래스를 써서 생김새가 똑같습니다.
             학생은 닫을 수 없습니다 — 교사가 닫아야 사라집니다) */}
        {zoomList && (
          <div className="modal-backdrop dash-zoom-backdrop">
            <div className="modal dash-zoom-modal" role="dialog" aria-modal="true">
              <div className="modal-head">
                <h3>
                  <span className="dash-zoom-label">{CONSONANT_LABELS[zoomSlot]}</span>
                  <span className="dash-zoom-topic">{broadcast.topic}</span>
                </h3>
              </div>
              <div className="dash-zoom-body">
                {zoomList.length === 0 ? (
                  <p className="dash-side-empty">아직 이 칸에 나온 단어가 없어요.</p>
                ) : (
                  <CastRows list={zoomList} big />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 마인드맵 중계 — 친구가 만든 마인드맵을 학급 전체 화면에 띄웁니다.
  // 학생 쪽은 보기 전용이라 편집 막대 없이 그림과 확대/축소만 나옵니다.
  if (broadcast.mode === "mindmap") {
    const map = normalizeMindmap(
      { layout: broadcast.layout, nodes: broadcast.nodes },
      broadcast.topic
    );
    const mapSignature = map.nodes
      .map((n) => `${n.id}:${n.parentId ?? ""}:${n.text}:${n.edgeLabel ?? ""}:${n.x ?? ""}:${n.y ?? ""}`)
      .join("|");
    const hasVisibleNode = map.nodes.some((n) => n.text?.trim());
    return (
      <div
        className="broadcast-overlay broadcast-overlay--mindmap"
        role="alertdialog"
        aria-modal="true"
        aria-label="선생님이 보여주는 마인드맵"
      >
        <div className="broadcast-bar">
          <span className="broadcast-live-dot" aria-hidden="true" />
          선생님이 친구의 마인드맵을 보여주고 있어요
          {broadcast.topic && <span className="broadcast-board"># {broadcast.topic}</span>}
          {broadcast.writerName && (
            <span className="broadcast-progress">{broadcast.writerName}</span>
          )}
        </div>
        <div className="broadcast-body">
          {hasVisibleNode ? (
            <MindmapCanvas
              map={map}
              fitKey={`${broadcast.writerName ?? ""}-${map.layout}-${mapSignature}`}
              className="broadcast-mindmap-stage"
            />
          ) : (
            <div className="broadcast-stale-note">
              <strong>아직 보여줄 마인드맵 내용이 없어요.</strong>
              <p>선생님이 다른 학생의 마인드맵을 선택하면 이 화면에 바로 표시됩니다.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 개인 활동(곁텍스트 읽기·RAFT 글쓰기) 영역 중계 — 학생은 남의 기록을
  // 직접 읽을 권한이 없어, 내용이 방송 문서에 실려 옵니다.
  // 교사가 고른 '한 영역'만 크게 띄웁니다. 교사가 다른 영역 버튼을 누르면
  // 이 문서가 새 내용으로 덮여, 화면이 끊김 없이 그 영역으로 바뀝니다.
  if (broadcast.mode === "entry") {
    const fields = broadcast.fields ?? [];
    return (
      <div
        className="broadcast-overlay broadcast-overlay--entry"
        role="alertdialog"
        aria-modal="true"
        aria-label="선생님이 보여주는 글"
      >
        <div className="broadcast-bar">
          <span className="broadcast-live-dot" aria-hidden="true" />
          선생님이 친구의 글을 보여주고 있어요
          {broadcast.topic && <span className="broadcast-board"># {broadcast.topic}</span>}
          {broadcast.writerName && (
            <span className="broadcast-progress">{broadcast.writerName}</span>
          )}
        </div>

        <div className="broadcast-body">
          <div className="entry-cast">
            <header className="entry-cast-head">
              {broadcast.letter && (
                <span className="paratext-letter" aria-hidden="true">{broadcast.letter}</span>
              )}
              <span className="paratext-card-title">
                <strong>{broadcast.label}</strong>
                {broadcast.labelEn && <em>{broadcast.labelEn}</em>}
              </span>
              {typeof broadcast.index === "number" && (
                <span className="paratext-step">
                  {broadcast.index + 1} / {broadcast.total}
                </span>
              )}
            </header>

            {broadcast.prompt && <p className="entry-cast-prompt">{broadcast.prompt}</p>}
            {/* RAFT는 낱말 하나만 뜨면 무슨 말인지 몰라 문장을 함께 보여 줍니다 */}
            {broadcast.note && <p className="raft-sentence done">{broadcast.note}</p>}

            <div className="entry-cast-body">
              {fields.map((f, i) => (
                <div key={i} className="paratext-read-field">
                  {f.label && <span className="paratext-read-label">{f.label}</span>}
                  <p className={`paratext-read-text${f.text ? "" : " empty"}`}>
                    {f.text || "아직 쓰지 않았어요"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <PresentationOverlayBody broadcast={broadcast} />;
}

// 집계 낱말 줄 — 교사 화면(WordRows)과 같은 클래스를 써서 생김새를 맞춥니다.
function CastRows({ list, big = false }) {
  if (!list?.length) return null;
  return (
    <div className={`dash-rows${big ? " big" : ""}`}>
      {list.map((w) => (
        <div key={w.text} className="dash-word-row">
          {(w.from ?? []).map((groupIndex, i) => (
            <span
              key={i}
              className="consonant-chip dash-chip"
              style={{ borderColor: groupColorOf(groupIndex), color: groupColorOf(groupIndex) }}
            >
              {w.text}
            </span>
          ))}
          {w.count > 1 && <em className="dash-row-count">{w.count}</em>}
        </div>
      ))}
    </div>
  );
}

function PresentationOverlayBody({ broadcast }) {
  // 수업하기 — 선생님 화면 전체가 아니라 '슬라이드만' 화면 가득 띄웁니다.
  // (오른쪽 수업 메모는 교사 전용이라 방송에 담기지 않습니다)
  if (broadcast.mode === "lesson") {
    return (
      <div
        className="broadcast-overlay broadcast-overlay--lesson"
        role="alertdialog"
        aria-modal="true"
        aria-label="선생님 수업 화면"
      >
        {broadcast.imageUrl ? (
          <img
            className="broadcast-slide-img"
            src={broadcast.imageUrl}
            alt={`슬라이드 ${(broadcast.slideIndex ?? 0) + 1}`}
          />
        ) : (
          <p className="broadcast-lesson-wait">선생님이 수업을 준비하고 있어요.</p>
        )}
      </div>
    );
  }

  const isGroup = !!broadcast.isGroupCard;
  const html = sanitizeHtml(broadcast.content || "");
  const hasText = html.replace(/<[^>]*>/g, "").trim().length > 0;

  return (
    <div className="broadcast-overlay" role="alertdialog" aria-modal="true" aria-label="선생님 발표 화면">
      <div className="broadcast-bar">
        <span className="broadcast-live-dot" aria-hidden="true" />
        선생님이 화면을 보여주고 있어요
        {broadcast.boardTitle && <span className="broadcast-board"># {broadcast.boardTitle}</span>}
        {broadcast.mode === "carousel" && typeof broadcast.idx === "number" && (
          <span className="broadcast-progress">{broadcast.idx + 1} / {broadcast.total}</span>
        )}
      </div>

      <div className="broadcast-body">
        <div className="present-slide broadcast-slide">
          <div className="broadcast-who">
            <span aria-hidden="true">{isGroup ? "👥" : "🙂"}</span>
            <strong>{broadcast.displayName}</strong>
            {isGroup && broadcast.members?.length > 0 && (
              <span className="present-group-members">
                {broadcast.members.map((m) => m.name).join(" · ")}
              </span>
            )}
          </div>
          {broadcast.title && <h2 className="present-slide-title">{broadcast.title}</h2>}
          {hasText ? (
            <div
              className="present-slide-content study-card-body"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="present-empty">아직 작성한 내용이 없어요.</p>
          )}
        </div>
      </div>
    </div>
  );
}
