// =============================================================
// 이미지 / 파일 첨부 공용 유틸
// -------------------------------------------------------------
// 첨부 이미지를 캔버스로 리사이즈해서 data URL로 변환합니다.
// (Firestore 문서는 1MB 제한이 있어 폭 900px / JPEG 80%로 압축.
//  나중에 큰 원본이 필요하면 Firebase Storage로 교체하면 됩니다.)
// =============================================================
export function readImageAsDataUrl(file, maxWidth = 900) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// 파일을 data URL로 읽기 (이미지 외 첨부 파일용 — 크기 조정 없음)
export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

// 파일 크기를 읽기 좋은 문자열로 변환
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
