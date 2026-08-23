"use client";

// 새 질문 작성 + 수정 모달 — 키워드 + 제목 + 내용(서식 지원) + 이미지 첨부 + 그리기
// question prop이 있으면 "수정 모드"로 동작합니다 (기존 내용을 미리 채움).
import { backdropClose } from "@/lib/modal";
import { useState } from "react";
import { KEYWORDS, addQuestion, updateQuestion } from "@/lib/store";
import { getCurrentUser } from "@/lib/user";
import { sanitizeHtml, stripHtml } from "@/lib/html";
import { uploadImage, uploadDataUrl } from "@/lib/storageUpload";
import dynamic from "next/dynamic";
import RichTextEditor, { IconImage, IconPen } from "./RichTextEditor";
import UploadProgress from "./UploadProgress";

// 그리기 캔버스는 무거워 열 때만 로딩
const DrawingCanvas = dynamic(() => import("./DrawingCanvas"), { ssr: false });

export default function NewQuestionForm({
  defaultKeyword,
  keywords = [], // 데이터에서 내려받은 키워드 목록 (이름 배열)
  initialContent = "", // 미리 채워 둘 내용 (파이썬 실행기의 '질문 만들기')
  question = null, // 수정할 기존 질문 (있으면 수정 모드)
  onClose,
}) {
  const editing = !!question;
  // 아직 로드 전이면 기본 키워드로 폴백
  let list = keywords.length > 0 ? keywords : KEYWORDS;
  // 수정 모드에서 기존 키워드가 목록에 없어도 선택 가능하도록 보존
  if (editing && !list.includes(question.keyword)) {
    list = [...list, question.keyword];
  }
  const [keyword, setKeyword] = useState(
    editing
      ? question.keyword
      : list.includes(defaultKeyword)
      ? defaultKeyword
      : list[0]
  );
  const [title, setTitle] = useState(editing ? question.title : "");
  const [content, setContent] = useState(
    editing ? question.content : initialContent
  ); // 서식(HTML) 내용
  // 다중 이미지 — 구버전 단일 imageUrl도 흡수해서 표시/편집
  const [images, setImages] = useState(
    editing
      ? question.images?.length
        ? question.images
        : question.imageUrl
        ? [question.imageUrl]
        : []
      : []
  );
  const [drawing, setDrawing] = useState(false); // 그리기 캔버스 열림 여부
  const [saving, setSaving] = useState(false);
  const [uploadPct, setUploadPct] = useState(null); // 첨부 업로드 진행률
  const [error, setError] = useState(""); // 필수 항목 누락 경고
  const MAX_IMAGES = 4;

  function removeImage(i) {
    setImages((prev) => prev.filter((_, idx) => idx !== i));
  }

  // 값이 바뀌면 경고 메시지를 지워 준다 (사용자가 채우는 즉시 사라지도록)
  function changeField(setter, value) {
    setter(value);
    if (error) setError("");
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 첨부할 수 있습니다.");
      e.target.value = "";
      return;
    }
    if (images.length >= MAX_IMAGES) {
      alert(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`);
      e.target.value = "";
      return;
    }
    setUploadPct(0);
    try {
      const url = await uploadImage(file, { onProgress: setUploadPct });
      setImages((prev) => [...prev, url]);
    } catch {
      alert("이미지 업로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setUploadPct(null);
    }
    e.target.value = "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const html = sanitizeHtml(content);
    // 세 항목(키워드·제목·본문)이 모두 채워져야 등록 — 빠진 항목을 경고로 안내
    const missing = [];
    if (!keyword) missing.push("키워드");
    if (!title.trim()) missing.push("제목");
    if (stripHtml(html).length === 0) missing.push("본문");
    if (missing.length > 0) {
      setError(`${missing.join(", ")}을(를) 입력해 주세요.`);
      return;
    }
    setError("");
    setSaving(true);
    try {
      const data = {
        title: title.trim(),
        content: html,
        keyword,
        imageUrl: null, // 신규는 images 배열만 사용(구버전 호환 필드는 비움)
        images,
      };
      if (editing) {
        await updateQuestion(question.id, data);
      } else {
        await addQuestion(getCurrentUser(), data);
      }
      onClose(true); // 등록/수정 성공 — 호출부에서 토스트 등에 활용
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      {/* 상세 모달(modal-wide)과 같은 크기로 맞춘 작성 폼 */}
      <div className="modal modal-form" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{editing ? "✏️ 질문 수정하기" : "✏️ 새 질문 올리기"}</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          {/* 키워드·제목·본문 모두 필수 — 라벨 옆 빨간 * 로 표시 */}
          <div className="form-row">
            <label className="req-field req-kw">
              <span className="field-label">키워드 <b>*</b></span>
              <select value={keyword} onChange={(e) => changeField(setKeyword, e.target.value)} required>
                {list.map((kw) => (
                  <option key={kw} value={kw}>
                    # {kw}
                  </option>
                ))}
              </select>
            </label>
            <label className="req-field req-title">
              <span className="field-label">제목 <b>*</b></span>
              <input
                type="text"
                placeholder="질문 제목을 입력하세요"
                value={title}
                onChange={(e) => changeField(setTitle, e.target.value)}
                required
              />
            </label>
          </div>

          {/* 서식 입력창 — 툴바에 이미지 첨부·그리기 도구 포함 */}
          <span className="field-label">본문 <b>*</b></span>
          <RichTextEditor
            variant="full"
            initialHtml={editing ? question.content : initialContent}
            onChange={(v) => changeField(setContent, v)}
            placeholder="어떤 부분이 이해되지 않는지 구체적으로 적어 주세요. (예: 교과서 몇 쪽, 어떤 개념, 어디까지 풀었는지)"
          >
            <label className="rte-tool" title="이미지 첨부">
              <IconImage />
              <input
                type="file"
                accept="image/*"
                onChange={handleFile}
                hidden
              />
            </label>
            <button
              type="button"
              className="rte-tool"
              title="그리기"
              onClick={() => setDrawing(true)}
            >
              <IconPen />
            </button>
          </RichTextEditor>

          <UploadProgress pct={uploadPct} />

          {images.length > 0 && (
            <div className="attach-multi">
              {images.map((src, i) => (
                <div key={i} className="attach-thumb">
                  <img src={src} alt="첨부 미리보기" className="attach-preview" />
                  <button
                    type="button"
                    className="attach-image-del"
                    onClick={() => removeImage(i)}
                    aria-label="첨부 취소"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="form-error">⚠️ {error}</p>}

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving
              ? editing
                ? "저장 중..."
                : "등록 중..."
              : editing
              ? "수정 저장"
              : "질문 등록"}
          </button>
        </form>

        {/* 그리기 캔버스 — 완료하면 그림이 첨부 이미지로 들어갑니다 */}
        {drawing && (
          <DrawingCanvas
            onSave={async (dataUrl) => {
              if (images.length >= MAX_IMAGES) {
                alert(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`);
                return;
              }
              setUploadPct(0);
              try {
                const url = await uploadDataUrl(dataUrl, "drawing.png", { onProgress: setUploadPct });
                setImages((prev) => [...prev, url]);
              } catch {
                alert("그림 업로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
              } finally {
                setUploadPct(null);
              }
            }}
            onClose={() => setDrawing(false)}
          />
        )}
      </div>
    </div>
  );
}
