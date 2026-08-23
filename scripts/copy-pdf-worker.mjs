// =============================================================
// pdf.js 워커를 public/ 으로 복사 — 빌드·개발 서버 시작 전에 자동 실행
// -------------------------------------------------------------
// PDF를 슬라이드 이미지로 변환할 때 pdf.js가 별도 워커 파일을 불러옵니다.
// CSP가 worker-src를 'self'로 제한하고 있어 CDN을 쓸 수 없으므로,
// node_modules의 워커를 public/ 에 복사해 같은 출처에서 서빙합니다.
// (생성물이라 git에는 넣지 않고 매 빌드마다 새로 복사합니다)
//
// legacy 빌드를 복사합니다 — 기본 빌드는 최신 문법을 써서 Chromium 141
// 같은 환경에서 렌더가 실패합니다. lib/pdfSlides.js도 legacy를 불러오므로
// 둘의 빌드가 어긋나지 않게 반드시 함께 맞춰야 합니다.
// =============================================================
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs");
const dest = join(root, "public/pdf.worker.min.mjs");

try {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log("[pdf-worker] public/pdf.worker.min.mjs 준비 완료");
} catch (e) {
  // 워커가 없으면 PDF 업로드만 실패합니다 — 빌드 자체는 막지 않습니다.
  console.warn("[pdf-worker] 복사 실패:", e.message);
}
