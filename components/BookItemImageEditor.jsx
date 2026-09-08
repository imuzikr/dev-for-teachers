"use client";

import { useEffect, useRef, useState } from "react";
import { uploadImage } from "@/lib/storageUpload";
import { BOOK_ITEM_IMAGE_LIMIT as MAX_IMAGES, BOOK_ITEM_IMAGE_MAX_CHARS as MAX_IMAGE_CHARACTERS } from "@/lib/bookProjectImages";
import "./BookItemImageEditor.css";

export default function BookItemImageEditor({ images = [], onChange, disabled = false, onBusyChange }) {
  const inputRef = useRef(null);
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

  async function attachFiles(event) {
    const files = [...(event.target.files || [])];
    event.target.value = "";
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
      if (mountedRef.current) onChangeRef.current([...images, ...additions]);
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

  function moveImage(index, offset) {
    const next = [...images];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  }

  return (
    <section className="book-item-images" aria-label="첨부 이미지" aria-busy={busy}>
      <div className="book-item-images-head">
        <span>이미지 {images.length}/{MAX_IMAGES}</span>
        <button type="button" className="btn-outline" disabled={disabled || busy || images.length >= MAX_IMAGES} onClick={() => inputRef.current?.click()}>
          {busy ? "이미지 준비 중…" : "이미지 첨부"}
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden aria-label="첨부 이미지 선택" onChange={attachFiles} />
      </div>
      <p className="book-item-images-help">여러 장을 함께 선택할 수 있어요. 아래 순서대로 발표합니다.</p>
      {error && <p className="book-item-images-error" role="alert">{error}</p>}
      {images.length > 0 && (
        <ol className="book-item-images-list">
          {images.map((image, index) => (
            <li key={`${index}:${image.slice(-32)}`}>
              <img src={image} alt={`첨부 이미지 ${index + 1}`} />
              <div className="book-item-images-controls">
                <span>{index + 1}</span>
                <button type="button" disabled={disabled || busy || index === 0} aria-label={`이미지 ${index + 1} 앞으로 이동`} onClick={() => moveImage(index, -1)}>←</button>
                <button type="button" disabled={disabled || busy || index === images.length - 1} aria-label={`이미지 ${index + 1} 뒤로 이동`} onClick={() => moveImage(index, 1)}>→</button>
                <button type="button" disabled={disabled || busy} aria-label={`이미지 ${index + 1} 삭제`} onClick={() => { setError(""); onChange(images.filter((_, imageIndex) => imageIndex !== index)); }}>삭제</button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
