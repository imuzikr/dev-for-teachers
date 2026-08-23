"use client";

// =============================================================
// 수업 준비 — 자료 목록 · 새로 만들기 (교사 전용)
// -------------------------------------------------------------
// PDF를 올리면 브라우저가 장마다 이미지로 바꿔 Storage에 저장합니다.
// 구글 슬라이드·캔바·PPT 모두 'PDF로 내보내기'가 있으므로 어떤 도구로
// 만들었든 여기로 들어옵니다. 이미지로 두는 덕분에 수업 중 교사가 넘긴
// 장 번호만 보내면 학생 화면이 정확히 같은 장을 띄울 수 있습니다.
//
// 자료는 만든 선생님에게 귀속됩니다 — 같은 자료로 여러 반에서 수업 가능.
//
// 화면 두 가지
//  · 목록 — 만들어 둔 자료마다 '편집하기'(주제·해설·활동 안내 다듬기)와
//    '수업 시작하기'(그 자료로 바로 수업 페이지에 들어가기) 버튼.
//  · 새 수업 만들기 — 주제 입력 + PDF 업로드. 올리기가 끝나면 바로 편집
//    화면(LessonMode mode="edit")으로 넘어가 해설·활동 안내까지 이어 씁니다.
// =============================================================
import { useEffect, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { subscribeMyLessons, addLesson, deleteLesson } from "@/lib/store";
import { convertPdfSlides } from "@/lib/pdfSlides";
import { createUploadPool } from "@/lib/uploadPool";
import { uploadImageBlob } from "@/lib/storageUpload";
import { getCurrentUser } from "@/lib/user";
import ConfirmModal from "./ConfirmModal";
import { IconTrash } from "./StatusIcons";

const MAX_SLIDES = 60;
// 동시에 올릴 장수 — 교실 회선을 다 잡아먹지 않으면서 왕복 대기를 줄이는 선
const UPLOAD_CONCURRENCY = 4;

export default function LessonManagerModal({ onStart, onEdit, onClose }) {
  const [lessons, setLessons] = useState([]);
  const [creating, setCreating] = useState(false); // '새 수업 만들기' 화면 표시 여부
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(null); // { phase, pct }
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);

  const me = getCurrentUser();
  useEffect(() => subscribeMyLessons(me?.uid, setLessons), [me?.uid]);

  async function handlePdf(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) {
      setError("PDF 파일만 올릴 수 있어요. 구글 슬라이드·캔바·PPT는 ‘PDF로 내보내기’ 후 올려 주세요.");
      return;
    }
    setError("");
    const name = title.trim() || file.name.replace(/\.pdf$/i, "");

    try {
      setBusy({ phase: "PDF를 읽는 중", pct: 0 });

      // 렌더와 업로드를 겹쳐 돌립니다 — 한 장이 그려지는 대로 바로 올리고,
      // 동시 업로드가 상한에 닿으면 렌더가 잠깐 기다립니다(메모리 보호).
      const slides = [];       // 인덱스로 채우므로 완료 순서와 무관하게 차례가 유지됨
      const pool = createUploadPool(UPLOAD_CONCURRENCY);
      let total = 0;
      let done = 0;

      await convertPdfSlides(file, {
        onStart: (numPages) => {
          if (numPages === 0) throw new Error("페이지를 찾지 못했어요.");
          if (numPages > MAX_SLIDES) {
            throw new Error(
              `슬라이드는 최대 ${MAX_SLIDES}장까지 올릴 수 있어요. (지금 ${numPages}장)`
            );
          }
          total = numPages;
          slides.length = numPages;
          setBusy({ phase: `슬라이드 만드는 중 0 / ${total}`, pct: 0 });
        },
        onPage: (index, blob) =>
          pool.submit(async () => {
            const imageUrl = await uploadImageBlob(blob, `slide-${index + 1}.jpg`);
            slides[index] = { imageUrl, note: "" };
            done++;
            setBusy({ phase: `슬라이드 만드는 중 ${done} / ${total}`, pct: done / total });
          }),
      });

      await pool.settle(); // 마지막까지 올라간 뒤에 저장

      // 자료 저장 → 바로 주제·해설·활동 안내를 쓰는 편집 화면으로
      const id = await addLesson(me, { title: name, slides });
      setBusy(null);
      setTitle("");
      setCreating(false);
      onEdit?.({ id, title: name, slides });
    } catch (err) {
      setBusy(null);
      setError(err?.message || "자료를 만들지 못했어요. 다시 시도해 주세요.");
    }
  }

  async function handleDelete() {
    const target = confirmDel;
    setConfirmDel(null);
    await deleteLesson(target.id, target.slides ?? []);
  }

  return (
    <div className="modal-backdrop" {...backdropClose(busy ? () => {} : onClose)}>
      <div className="modal modal-lesson" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          {creating ? (
            <button type="button" className="btn-ghost lesson-back-btn" onClick={() => setCreating(false)} disabled={!!busy}>
              ‹ 목록으로
            </button>
          ) : (
            <h3>📝 수업 준비</h3>
          )}
          {!busy && (
            <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
          )}
        </div>

        {creating ? (
          <>
            {/* 새 수업 만들기 — 주제 입력 + PDF 업로드. 해설·활동 안내는
                업로드가 끝난 뒤 편집 화면에서 이어 씁니다. */}
            <h3 className="lesson-create-title">새 수업 만들기</h3>
            <div className="lesson-new">
              <input
                type="text"
                className="lesson-new-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="수업 주제 (비우면 파일 이름)"
                maxLength={60}
                disabled={!!busy}
                autoFocus
              />
              <label className={`btn-primary lesson-upload-btn${busy ? " disabled" : ""}`}>
                ＋ PDF 올리기
                <input type="file" accept="application/pdf,.pdf" onChange={handlePdf} hidden disabled={!!busy} />
              </label>
            </div>
            <p className="lesson-hint">
              구글 슬라이드·캔바·PPT 모두 <strong>PDF로 내보내기</strong> 후 올려 주세요.
              장별 이미지로 바꿔 두어야 학생 화면이 선생님과 같은 장으로 넘어갑니다.
            </p>

            {busy && (
              <div className="lesson-progress">
                <div className="lesson-progress-bar">
                  <span style={{ width: `${Math.round((busy.pct ?? 0) * 100)}%` }} />
                </div>
                <span className="lesson-progress-text">{busy.phase}…</span>
              </div>
            )}
            {error && <p className="lesson-error">{error}</p>}
          </>
        ) : (
          <>
            <button type="button" className="lesson-create-btn" onClick={() => { setError(""); setCreating(true); }}>
              ＋ 새 수업 만들기
            </button>

            {/* 자료 목록 */}
            <div className="lesson-list">
              {lessons.length === 0 ? (
                <p className="empty-note">아직 만든 수업 자료가 없어요. 위에서 새로 만들어 보세요.</p>
              ) : (
                lessons.map((l) => (
                  <div key={l.id} className="lesson-row">
                    <div className="lesson-row-main">
                      <strong>{l.title}</strong>
                      <span>슬라이드 {(l.slides ?? []).length}장</span>
                    </div>
                    <div className="lesson-row-actions">
                      <button type="button" className="btn-ghost" onClick={() => onEdit?.(l)}>
                        편집하기
                      </button>
                      <button type="button" className="btn-primary" onClick={() => onStart?.(l)}>
                        수업 시작하기
                      </button>
                      <button
                        type="button"
                        className="btn-ghost qa-delete"
                        onClick={() => setConfirmDel(l)}
                        aria-label="삭제"
                      >
                        <IconTrash size={15} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {confirmDel && (
        <ConfirmModal
          title="수업 자료 삭제"
          preview={confirmDel.title}
          description={"슬라이드와 메모가 모두 삭제됩니다.\n되돌릴 수 없습니다."}
          confirmLabel="삭제"
          danger
          onConfirm={handleDelete}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}
