// =============================================================
// HTML 서식 유틸
// -------------------------------------------------------------
// 서식 에디터는 내용을 HTML로 저장합니다. 화면에 그대로 출력하면
// 악성 스크립트가 끼어들 수 있으므로(XSS), 허용된 서식 태그만
// 남기고 나머지는 모두 제거한 뒤 렌더링합니다.
// =============================================================

// 허용 태그: 볼드, 이탤릭, 밑줄, 목록, 줄바꿈, 코드 블록
const ALLOWED_TAGS = new Set([
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "UL",
  "OL",
  "LI",
  "BR",
  "DIV",
  "P",
  "PRE",
  "CODE",
  "IMG",
]);

// 안전한 이미지 src만 허용: http(s)(Storage 등) 또는 data:image
function isSafeImageSrc(src = "") {
  return /^https?:\/\//i.test(src) || /^data:image\//i.test(src);
}

// HTML에서 허용 태그만 남기고 모든 속성 제거
export function sanitizeHtml(html = "") {
  // 서버(SSR/프리렌더)엔 DOMParser가 없어 정화가 불가하므로, 원본을 그대로
  // 내보내지 않고 태그를 제거한 순수 텍스트만 반환합니다(잠재 XSS 차단).
  // 실제 서식 렌더링은 클라이언트 하이드레이션 후 다시 정화되어 이뤄집니다.
  if (typeof window === "undefined") return stripHtml(html);
  const doc = new DOMParser().parseFromString(
    `<div>${html}</div>`,
    "text/html"
  );
  const root = doc.body.firstChild;

  function walk(node) {
    // 자식 스냅샷을 떠서 순회 (순회 중 구조가 바뀌므로)
    [...node.children].forEach((el) => {
      walk(el);
      if (!ALLOWED_TAGS.has(el.tagName)) {
        // 허용되지 않은 태그: 태그만 벗기고 내용은 보존
        el.replaceWith(...el.childNodes);
      } else if (el.tagName === "IMG") {
        // 이미지: 안전한 src/alt만 남기고 나머지 속성(onerror 등) 제거
        const src = el.getAttribute("src") || "";
        const alt = el.getAttribute("alt") || "";
        [...el.attributes].forEach((a) => el.removeAttribute(a.name));
        if (isSafeImageSrc(src)) {
          el.setAttribute("src", src);
          if (alt) el.setAttribute("alt", alt);
        } else {
          el.remove(); // 안전하지 않은 이미지(javascript: 등)는 제거
        }
      } else {
        // 허용 태그여도 속성(onclick, style 등)은 모두 제거
        [...el.attributes].forEach((a) => el.removeAttribute(a.name));
      }
    });
  }
  walk(root);
  return root.innerHTML;
}

// 이미지 태그만 제거 (발표 슬라이드처럼 텍스트만 보여줄 때)
export function stripImgTags(html = "") {
  return html.replace(/<img[^>]*>/gi, "");
}

// HTML → 순수 텍스트 (카드 미리보기, 빈 내용 검사용)
export function stripHtml(html = "") {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 일반 텍스트 → HTML 안전 문자로 변환
export function escapeHtml(text = "") {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 코드 문자열 → 어두운 배경의 코드 블록 HTML
// (파이썬 실행기의 '질문 만들기'에서 사용. 뒤에 빈 줄을 붙여
//  학생이 코드 아래에 설명을 이어서 쓸 수 있게 합니다)
export function codeBlockHtml(code = "") {
  return `<pre><code>${escapeHtml(code)}</code></pre><div><br></div>`;
}
