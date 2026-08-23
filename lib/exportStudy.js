// =============================================================
// 공부방 활동 자료 내보내기 — CSV / Excel(반별 시트) / PDF(인쇄) (교사 전용)
// -------------------------------------------------------------
// 헤더: 클래스 · 주제(보드 제목) · 학번 · 이름 · 작성시각 · 제목 · 내용
// · 실명/학번은 교사 디렉터리(users)에서 조회 — 게시물엔 익명 정보만 있으므로.
// · 내용은 서식(HTML)을 제거한 순수 텍스트. 텍스트가 없고 이미지·첨부만 있으면
//   [이미지 N] · [첨부 N] 표시로 대체.
// =============================================================
import { stripHtml } from "./html";
import { toDate } from "./store";

const HEADERS = ["클래스", "주제", "학번", "이름", "작성시각", "제목", "내용"];
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

// 흔한 HTML 엔티티를 사람이 읽을 수 있는 문자로 되돌림
function decodeEntities(s = "") {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// 내용 셀 — 텍스트 우선, 없으면 이미지/첨부 개수 표시
function cardContentCell(card) {
  const text = decodeEntities(stripHtml(card.content || "")).trim();
  if (text) return text;
  const atts = card.attachments || [];
  const imgs =
    (card.content?.match(/<img\b/gi)?.length || 0) +
    (card.imageUrl ? 1 : 0) +
    atts.filter((a) => IMAGE_EXTS.has(a.ext)).length;
  const files = atts.filter((a) => !IMAGE_EXTS.has(a.ext)).length;
  const parts = [];
  if (imgs) parts.push(`[이미지 ${imgs}]`);
  if (files) parts.push(`[첨부 ${files}]`);
  return parts.join(" ");
}

function formatTs(value) {
  if (!value) return "";
  const d = toDate(value);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 카드 목록 → 내보내기 행 배열
// boards: [{ id, title }], cardsByBoard: { [boardId]: cards[] }, dirMap: Map(uid -> user)
export function buildStudyRows({ className, boards, cardsByBoard, dirMap }) {
  const rows = [];
  boards.forEach((board) => {
    const cards = cardsByBoard[board.id] || [];
    cards.forEach((card) => {
      // 모둠 카드 — 이름 열에 모둠명(구성원), 학번은 빈칸
      if (card.groupId) {
        if (card.retired) return; // 보관(재구성으로 남은) 카드는 제외
        const groupTitle = card.title || card.groupName || "";
        const memberNames = (card.members ?? []).map((m) => m.name).join(", ");
        rows.push({
          클래스: className || "",
          주제: board.title || "",
          학번: "",
          이름: memberNames ? `${groupTitle} (${memberNames})` : groupTitle,
          작성시각: formatTs(card.createdAt),
          제목: card.title || "",
          내용: cardContentCell(card),
        });
        return;
      }
      const dir = dirMap.get(card.authorId) || {};
      // 교사·관리자가 작성한 카드는 학생 활동 자료에서 제외
      if (dir.role === "teacher" || dir.role === "admin") return;
      rows.push({
        클래스: className || "",
        주제: board.title || "",
        학번: dir.studentId || "",
        이름: dir.realName || "",
        작성시각: formatTs(card.createdAt),
        제목: card.title || "",
        내용: cardContentCell(card),
      });
    });
  });
  // 주제 → 학번 → 이름 순 정렬
  rows.sort(
    (a, b) =>
      a.주제.localeCompare(b.주제, "ko") ||
      String(a.학번).localeCompare(String(b.학번), "ko", { numeric: true }) ||
      a.이름.localeCompare(b.이름, "ko")
  );
  return rows;
}

// ---- 다운로드 공통 ----
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- CSV (한 반) ----
function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadStudyCsv(rows, filename) {
  const lines = [HEADERS.join(",")];
  rows.forEach((r) => lines.push(HEADERS.map((h) => csvEscape(r[h])).join(",")));
  // Excel에서 한글이 깨지지 않도록 UTF-8 BOM 부착
  const blob = new Blob(["﻿" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  triggerDownload(blob, filename);
}

// ---- Excel 워크북 (반별 시트) — 라이브러리 없이 SpreadsheetML(.xls) 생성 ----
function xmlEscape(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
// 엑셀 시트명 제약: 31자 이내, : \ / ? * [ ] 사용 불가
function sanitizeSheetName(name, index) {
  let n = String(name || `반${index + 1}`).replace(/[:\\/?*[\]]/g, " ").trim();
  if (!n) n = `반${index + 1}`;
  return n.slice(0, 31);
}

// sheets: [{ name, rows }]
export function downloadStudyWorkbook(sheets, filename) {
  const usedNames = new Set();
  const worksheets = sheets
    .map((sheet, i) => {
      let name = sanitizeSheetName(sheet.name, i);
      while (usedNames.has(name)) name = (name.slice(0, 28) + "_" + i).slice(0, 31);
      usedNames.add(name);
      const rowXml = (cells) =>
        `<Row>${cells
          .map((c) => `<Cell><Data ss:Type="String">${xmlEscape(c)}</Data></Cell>`)
          .join("")}</Row>`;
      const header = rowXml(HEADERS);
      const body = sheet.rows.map((r) => rowXml(HEADERS.map((h) => r[h]))).join("");
      return `<Worksheet ss:Name="${xmlEscape(name)}"><Table>${header}${body}</Table></Worksheet>`;
    })
    .join("");
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<?mso-application progid="Excel.Sheet"?>\n` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
    `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${worksheets}</Workbook>`;
  const blob = new Blob(["﻿" + xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
  triggerDownload(blob, filename);
}

// ---- PDF (브라우저 인쇄 → 'PDF로 저장') ----
function escHtml(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sectionHtml(rows) {
  const body = rows
    .map(
      (r) => `<tr>
        <td>${escHtml(r.주제)}</td>
        <td class="c">${escHtml(r.학번)}</td>
        <td class="c">${escHtml(r.이름)}</td>
        <td class="c">${escHtml(r.작성시각)}</td>
        <td>${escHtml(r.제목)}</td>
        <td>${escHtml(r.내용)}</td>
      </tr>`
    )
    .join("");
  return `<table>
    <thead><tr><th>주제</th><th>학번</th><th>이름</th><th>작성시각</th><th>제목</th><th>내용</th></tr></thead>
    <tbody>${body || '<tr><td colspan="6" class="c">자료가 없습니다.</td></tr>'}</tbody>
  </table>`;
}

// sections: [{ className, rows }]
function buildPrintHtml(sections, title) {
  const today = new Date().toLocaleDateString("ko-KR");
  const blocks = sections
    .map(
      (s, i) => `<section class="${i > 0 ? "pb" : ""}">
        <h1>${escHtml(s.className)} · 공부방 활동 자료</h1>
        <div class="meta">${escHtml(today)} · 총 ${s.rows.length}건</div>
        ${sectionHtml(s.rows)}
      </section>`
    )
    .join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
    <title>${escHtml(title)} 공부방 활동 자료</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Malgun Gothic','Apple SD Gothic Neo',sans-serif; margin: 24px; color: #2e241a; }
      section.pb { break-before: page; page-break-before: always; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      .meta { font-size: 12px; color: #6b5b4a; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
      th, td { border: 1px solid #d9cdbc; padding: 6px 8px; text-align: left; vertical-align: top; }
      th { background: #f3ebdd; font-weight: 700; }
      td.c { text-align: center; white-space: nowrap; }
      tr { break-inside: avoid; }
      thead { display: table-header-group; }
    </style></head>
    <body>${blocks}</body></html>`;
}

export function printStudyPdf(rows, className) {
  printStudyPdfSections([{ className, rows }], className);
}

export function printStudyPdfSections(sections, title) {
  const iframe = document.createElement("iframe");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(buildPrintHtml(sections, title));
  doc.close();
  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  }, 350);
}
