"use client";

// =============================================================
// 발표 강제 전환 오버레이 — 교사가 보드 발표 모드·카드 크게 보기를 켜면
// 그 반 학생 전원의 화면이 이 화면으로 강제 전환됩니다(교사 화면은
// 그대로). 학생 쪽에는 닫기 버튼이 없고, 교사가 방송을 끝내면(또는
// 모달을 닫으면) 자동으로 사라집니다.
// =============================================================
import { sanitizeHtml } from "@/lib/html";
import { normalizeMindmap } from "@/lib/mindmap";
import MindmapCanvas from "./MindmapCanvas";

const KNOWN_MODES = ["mindmap", "lesson", "carousel", "single"];

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

  return <PresentationOverlayBody broadcast={broadcast} />;
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
