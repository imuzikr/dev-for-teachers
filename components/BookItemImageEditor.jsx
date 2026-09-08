"use client";

import { useEffect, useId, useRef, useState } from "react";
import { uploadImage } from "@/lib/storageUpload";
import { normalizeBookImageSizes, BOOK_ITEM_IMAGE_LIMIT as MAX_IMAGES, BOOK_ITEM_IMAGE_MAX_CHARS as MAX_IMAGE_CHARACTERS } from "@/lib/bookProjectImages";
import "./BookItemImageEditor.css";

export default function BookItemImageEditor({ images = [], imageSizes, onChange, disabled = false, onBusyChange }) {
  const sizes = normalizeBookImageSizes(imageSizes, images);
  const inputRef = useRef(null);
  const helpId = useId();
  const [dragging, setDragging] = useState(false);
  const mountedRef = useRef(false);
  const busyRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onBusyChangeRef = useRef(onBusyChange);
  onBusyChangeRef.current = onBusyChange;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (busyRef.current) onBusyChangeRef.current?.(false);
    };
  }, []);

  async function attachFiles(files) {
    if (!files.length || busyRef.current || disabled) return;
    setError("");
    if (images.length + files.length > MAX_IMAGES) {
      setError("이미지는 최대 8장까지 첨부할 수 있어요. 기존 이미지를 삭제하거나 선택 수를 줄여 주세요.");
      return;
    }
    if (files.some((file) => !file.type.startsWith("image/") || file.size > 20 * 1024 * 1024)) {
      setError("20MB 이하의 이미지 파일을 선택해 주세요.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    onBusyChangeRef.current?.(true);
    try {
      const additions = [];
      let total = images.reduce((sum, image) => sum + image.length, 0);
      for (const file of files) {
        const image = await uploadImage(file);
        total += image.length;
        if (total > MAX_IMAGE_CHARACTERS) {
          throw new Error("이미지 전체 용량이 너무 커요. 이미지 크기나 개수를 줄여 다시 선택해 주세요.");
        }
        additions.push(image);
      }
      if (mountedRef.current) onChangeRef.current([...images, ...additions], [...sizes, ...additions.map(() => "medium")]);
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error && cause.message ? cause.message : "이미지를 읽지 못했어요. JPG 또는 PNG 파일로 다시 선택해 주세요.");
    } finally {
      busyRef.current = false;
      if (mountedRef.current) {
        setBusy(false);
        onBusyChangeRef.current?.(false);
      }
    }
  }

  function handlePaste(event) {
    const files = [...(event.clipboardData?.items ?? [])]
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile()).filter(Boolean);
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    void attachFiles(files);
  }

  function handleDragOver(event) {
    if (![...(event.dataTransfer?.types ?? [])].includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = disabled || busyRef.current ? "none" : "copy";
    setDragging(!disabled && !busyRef.current);
  }

  function handleDrop(event) {
    setDragging(false);
    const files = [...(event.dataTransfer?.files ?? [])];
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    void attachFiles(files);
  }

  function moveImage(index, offset) {
    const next = [...images];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    const nextSizes = [...sizes];
    [nextSizes[index], nextSizes[index + offset]] = [nextSizes[index + offset], nextSizes[index]];
    onChange(next, nextSizes);
  }

  return (
    <section className={`book-item-images${dragging ? " is-dragging" : ""}`} aria-label="첨부 이미지" aria-busy={busy}
      tabIndex={disabled ? -1 : 0} aria-disabled={disabled || busy} aria-describedby={helpId}
      onPaste={handlePaste} onDragEnter={handleDragOver} onDragOver={handleDragOver} onDrop={handleDrop}
      onDragLeave={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false);
      }}
    >
      <div className="book-item-images-head">
        <span>이미지 {images.length}/{MAX_IMAGES}</span>
        <button type="button" className="btn-outline" disabled={disabled || busy || images.length >= MAX_IMAGES} onClick={() => inputRef.current?.click()}>
          {busy ? "이미지 준비 중…" : "이미지 첨부"}
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden aria-label="첨부 이미지 선택" onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          void attachFiles(files);
        }} />
      </div>
      <p id={helpId} className="book-item-images-help">이미지를 여기로 끌어 놓거나, 이 영역을 클릭한 뒤 Ctrl+V / ⌘V로 붙여넣으세요. 여러 장도 가능해요.</p>
      {error && <p className="book-item-images-error" role="alert">{error}</p>}
      {images.length > 0 && (
        <ol className="book-item-images-list">
          {images.map((image, index) => (
            <li key={`${index}:${image.slice(-32)}`}>
              <img draggable={false} src={image} alt={`첨부 이미지 ${index + 1}`} />
              <label className="book-item-image-size">
                <span>방송 크기</span>
                <select aria-label={`이미지 ${index + 1} 방송 크기`} value={sizes[index]} disabled={disabled || busy} onChange={(event) => {
                  const nextSizes = [...sizes];
                  nextSizes[index] = event.target.value;
                  onChange(images, nextSizes);
                }}>
                  <option value="large">대</option>
                  <option value="medium">중</option>
                  <option value="small">소</option>
                </select>
              </label>
              <div className="book-item-images-controls">
                <span>{index + 1}</span>
                <button type="button" disabled={disabled || busy || index === 0} aria-label={`이미지 ${index + 1} 앞으로 이동`} onClick={() => moveImage(index, -1)}>←</button>
                <button type="button" disabled={disabled || busy || index === images.length - 1} aria-label={`이미지 ${index + 1} 뒤로 이동`} onClick={() => moveImage(index, 1)}>→</button>
                <button type="button" disabled={disabled || busy} aria-label={`이미지 ${index + 1} 삭제`} onClick={() => { setError(""); onChange(images.filter((_, imageIndex) => imageIndex !== index), sizes.filter((_, imageIndex) => imageIndex !== index)); }}>삭제</button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
