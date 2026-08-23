"use client";

// =============================================================
// PDF → 슬라이드 이미지 변환 (브라우저에서 수행)
// -------------------------------------------------------------
// 수업 자료를 올릴 때 한 번만 실행됩니다. PDF를 페이지마다 캔버스에
// 그린 뒤 JPEG로 뽑아 Storage에 올립니다.
//
// [왜 이미지로 바꾸나]
// 학생 화면을 교사와 "같은 장"으로 맞추려면 앱이 지금 몇 번째 장인지
// 알아야 합니다. 구글 슬라이드·캔바 링크를 iframe으로 띄우면 그 안의
// 페이지는 남의 사이트 영역이라 읽지도 넘기지도 못합니다. 반면 장별
// 이미지는 그냥 배열 인덱스라, 교사가 넘긴 번호만 보내면 학생 화면이
// 정확히 같은 장을 띄웁니다.
//
// pdf.js는 무거워서(수 MB) 실제로 변환할 때만 동적으로 불러옵니다.
//
// [legacy 빌드를 쓰는 이유]
// 기본 빌드는 Map.prototype.getOrInsertComputed 같은 아주 최신 문법을 써서
// Chromium 141에서도 render()가 바로 실패합니다(실제로 확인). 교실 기기는
// 최신 브라우저를 보장할 수 없으니 트랜스파일된 legacy 빌드를 씁니다.
// 메인 스크립트와 워커는 반드시 같은 빌드로 짝을 맞춰야 합니다
// (scripts/copy-pdf-worker.mjs도 legacy 워커를 복사합니다).
// =============================================================

let pdfjsPromise = null;

async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
      // 워커는 같은 출처(public/)에서 — CSP가 worker-src 'self'로 제한됨.
      // scripts/copy-pdf-worker.mjs가 빌드 전에 복사해 둡니다.
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

// PDF 파일을 한 장씩 렌더해 그때그때 넘겨줍니다(모아 두지 않음).
//  · maxWidth: 가로 기준 렌더 해상도. 전자칠판·빔프로젝터를 고려해 넉넉히.
//  · onStart(장수): 첫 장을 그리기 전에 호출 — 여기서 던지면 변환을 접습니다
//    (장수 제한 검사를 다 그린 뒤가 아니라 시작 전에 할 수 있게)
//  · onPage(index, blob): 한 장이 끝날 때마다 호출. **이 함수가 반환한 프로미스를
//    기다립니다** — 호출한 쪽에서 업로드가 밀릴 때 여기서 붙잡아 두면(배압)
//    렌더가 앞서 나가 메모리에 이미지가 쌓이는 걸 막을 수 있습니다.
//
// 예전에는 전부 렌더해 배열로 모은 뒤 업로드를 시작했는데, 그러면 40장짜리
// 자료의 이미지 수십 MB를 통째로 들고 있어야 하고 렌더가 끝날 때까지
// 네트워크가 놀았습니다. 지금은 렌더와 업로드가 겹쳐 돌아갑니다.
export async function convertPdfSlides(
  file,
  { maxWidth = 1600, quality = 0.85, onStart, onPage } = {}
) {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  // destroy()는 문서 객체가 아니라 '로딩 태스크'에 있습니다 — 참조를 들고 있어야
  // 끝나고 워커를 정리할 수 있습니다.
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;

  try {
    await onStart?.(doc.numPages);

    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      // 원본보다 크게 늘리지는 않되(최대 2배), 너무 작지 않게 확대합니다.
      const viewport = page.getViewport({ scale: Math.min(2, maxWidth / base.width) });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      // PDF 배경은 투명이라 JPEG로 바꾸면 검게 나옵니다 — 흰색을 먼저 깔아 줍니다.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvas, viewport }).promise;
      page.cleanup();

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("슬라이드 이미지 변환 실패"))),
          "image/jpeg",
          quality
        );
      });
      // 캔버스 메모리를 바로 놓아 줍니다 — 사양이 낮은 기기에서 장수가 많을 때 중요
      canvas.width = 0;
      canvas.height = 0;

      await onPage?.(n - 1, blob);
    }
    return doc.numPages;
  } finally {
    // 워커 정리는 실패해도 무시합니다 — 여기서 던지면 루프 안의 진짜 원인을
    // 가려 버리고, 이미 올라간 슬라이드까지 헛수고가 됩니다.
    try {
      await task.destroy();
    } catch {
      /* 무시 */
    }
  }
}
