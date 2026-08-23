// =============================================================
// 첨부 업로드 — Firebase Storage
// -------------------------------------------------------------
// 이미지/파일을 Storage에 올리고 다운로드 URL을 반환합니다.
// 그 URL만 Firestore 문서에 저장하므로 문서 용량(1MB 제한)을 아끼고
// 원본 화질을 유지할 수 있습니다.
//
// 데모 모드(Firebase 미설정) 또는 Storage 미초기화 시에는 기존처럼
// data URL(base64)을 반환해 동작이 끊기지 않게 합니다.
//
// 경로 설계: uploads/{uid}/{시각}_{파일명}
//  · Storage 규칙에서 "본인 uid 폴더에만 쓰기"로 제한합니다.
// =============================================================
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { isFirebaseConfigured, storage } from "./firebase";
import { getCurrentUser } from "./user";
import { readImageAsDataUrl, readFileAsDataUrl } from "./image";

function storagePath(name) {
  const uid = getCurrentUser()?.uid ?? "anon";
  const safe = String(name || "file")
    .replace(/[^\w.\-]/g, "_")
    .slice(-80);
  return `uploads/${uid}/${Date.now()}_${safe}`;
}

// 이 크기 미만이면 단순 업로드(uploadBytes) 사용.
// resumable 업로드는 "세션 생성 → 업로드 → 완료" 왕복이 있어 작은 파일엔
// 오히려 느립니다. 압축된 이미지는 대부분 수백 KB라 이 경로로 더 빨라집니다.
const SIMPLE_UPLOAD_MAX = 1024 * 1024; // 1MB

// Blob 업로드 → 다운로드 URL. onProgress(0~1)로 진행률을 전달합니다.
function putBlob(blobOrFile, name, onProgress, metadata) {
  const r = ref(storage, storagePath(name));
  const size = blobOrFile?.size ?? 0;

  // 작은 파일: 단일 요청(uploadBytes)으로 빠르게. 진행률은 시작/완료만 표시.
  if (size > 0 && size < SIMPLE_UPLOAD_MAX) {
    if (onProgress) onProgress(0.2);
    return uploadBytes(r, blobOrFile, metadata).then((snap) => {
      if (onProgress) onProgress(1);
      return getDownloadURL(snap.ref);
    });
  }

  // 큰 파일: resumable + 실시간 진행률
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(r, blobOrFile, metadata);
    task.on(
      "state_changed",
      (snap) => {
        if (onProgress && snap.totalBytes) {
          onProgress(snap.bytesTransferred / snap.totalBytes);
        }
      },
      reject,
      () => getDownloadURL(task.snapshot.ref).then(resolve, reject)
    );
  });
}

// 이미지를 압축(JPEG)해 업로드 용량을 줄입니다.
//  · createImageBitmap: 파일에서 바로 디코딩(base64 변환 생략, 하드웨어 가속)
//    → 지원 안 되는 구형 브라우저는 FileReader+Image로 폴백.
async function compressImageToBlob(file, maxWidth, quality) {
  const bitmap = await decodeImage(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close(); // ImageBitmap 메모리 해제
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("이미지 압축 실패"))),
      "image/jpeg",
      quality
    );
  });
}

// createImageBitmap 우선, 미지원 시 FileReader→Image 폴백.
function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).catch(() => decodeImageLegacy(file));
  }
  return decodeImageLegacy(file);
}

function decodeImageLegacy(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => resolve(img);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// 이미지 업로드 → 다운로드 URL. (데모: 압축 data URL)
//  · maxWidth 1080 / 품질 0.72 — 판서·화면 사진 화질은 유지하며 용량을 크게 절감.
export async function uploadImage(file, { maxWidth = 1080, quality = 0.72, onProgress } = {}) {
  if (!isFirebaseConfigured || !storage) {
    return readImageAsDataUrl(file, 900);
  }
  const blob = await compressImageToBlob(file, maxWidth, quality);
  return putBlob(blob, (file.name || "image").replace(/\.\w+$/, "") + ".jpg", onProgress);
}

// 이미 알맞게 만들어진 이미지 Blob을 '그대로' 업로드 → 다운로드 URL.
//  · uploadImage()는 원본 사진을 줄이고 다시 인코딩하는 용도라, 이미 크기·품질을
//    맞춰 만든 이미지(PDF 슬라이드 등)에 쓰면 디코딩→재인코딩이 한 번 더 일어나
//    느려지고 화질만 손해입니다. 그런 경우엔 이 함수를 씁니다.
export async function uploadImageBlob(blob, name = "image.jpg", { onProgress } = {}) {
  if (!isFirebaseConfigured || !storage) {
    return readFileAsDataUrl(blob);
  }
  // contentType은 Blob의 type에서 그대로 잡힙니다(image/jpeg) — Storage 규칙의
  // 이미지 허용 조건을 만족해야 하므로 첨부(attachment) 디스포지션은 붙이지 않습니다.
  return putBlob(blob, name, onProgress);
}

// 일반 파일 업로드(이미지 외) → 다운로드 URL. (데모: data URL)
//  · contentDisposition: 'attachment' — 업로드된 파일(특히 .html)을 URL로 열면
//    브라우저에서 렌더링되지 않고 다운로드되게 해, Storage 도메인에서의
//    피싱 페이지 호스팅을 차단합니다. (이미지는 <img>로 정상 표시됨 — 첨부
//    디스포지션은 하위 리소스 로드엔 영향 없음)
export async function uploadFile(file, { onProgress } = {}) {
  if (!isFirebaseConfigured || !storage) {
    return readFileAsDataUrl(file);
  }
  return putBlob(file, file.name, onProgress, { contentDisposition: "attachment" });
}

// data URL(그리기 결과·붙여넣기 등)을 Storage에 업로드 → 다운로드 URL.
// 데모/미설정 시 data URL을 그대로 반환합니다.
export async function uploadDataUrl(dataUrl, name = "image.png", { onProgress } = {}) {
  if (!isFirebaseConfigured || !storage) return dataUrl;
  if (!dataUrl?.startsWith("data:")) return dataUrl; // 이미 URL이면 그대로
  const blob = await (await fetch(dataUrl)).blob();
  return putBlob(blob, name, onProgress);
}

// Storage에 올라간 파일 1개를 삭제합니다. data URL(데모/구버전)이거나
// 이미 지워진 파일이면 조용히 건너뜁니다 — 게시물 삭제 자체가 실패하면
// 안 되므로, 스토리지 정리는 최선을 다하되(best-effort) 실패해도 무시합니다.
export async function deleteUploadedFile(url) {
  if (!isFirebaseConfigured || !storage) return;
  if (!url || !url.startsWith("https://firebasestorage.googleapis.com/")) return;
  try {
    await deleteObject(ref(storage, url));
  } catch {
    /* 이미 삭제됨·권한 없음 등 — 무시 */
  }
}

// 질문/답변/카드 문서 하나에 딸린 이미지·첨부 URL을 모아 한 번에 정리합니다.
export async function deleteAttachedFiles({ imageUrl, images, attachments } = {}) {
  const urls = [
    imageUrl,
    ...(images ?? []),
    ...(attachments ?? []).map((a) => a.dataUrl),
  ].filter(Boolean);
  await Promise.all(urls.map(deleteUploadedFile));
}
