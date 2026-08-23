"use client";

// =============================================================
// 서식 입력 에디터 (공통 컴포넌트)
// -------------------------------------------------------------
// 굵게 / 기울임 / 밑줄 / 글머리 기호 / 번호 목록을 지원합니다.
//
//   variant="full" : 박스 상단에 툴바 (질문·공지 작성용)
//   variant="chat" : 박스 하단에 툴바 + 종이비행기 전송 버튼 (채팅용)
//
// children으로 추가 도구(이미지 첨부, 그리기 등)를 툴바에 끼워
// 넣을 수 있습니다. 내용은 HTML 문자열로 onChange에 전달되며,
// 저장·표시 전에 lib/html.js의 sanitizeHtml()로 정화합니다.
// 입력 내용을 비우려면 부모에서 key 값을 바꿔 다시 마운트하세요.
// =============================================================
import { useEffect, useRef, useState } from "react";
import { uploadImage } from "@/lib/storageUpload";
import { escapeHtml } from "@/lib/html";

// ───── 툴바 아이콘 (선 스타일 SVG) ─────
const svgProps = {
  width: 17,
  height: 17,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function IconUl() {
  return (
    <svg {...svgProps}>
      <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function IconOl() {
  return (
    <svg {...svgProps}>
      <text x="2" y="8.5" fontSize="8" fill="currentColor" stroke="none">
        1
      </text>
      <text x="2" y="15" fontSize="8" fill="currentColor" stroke="none">
        2
      </text>
      <text x="2" y="21.5" fontSize="8" fill="currentColor" stroke="none">
        3
      </text>
      <line x1="10" y1="6" x2="20" y2="6" />
      <line x1="10" y1="12" x2="20" y2="12" />
      <line x1="10" y1="18" x2="20" y2="18" />
    </svg>
  );
}

export function IconImage() {
  return (
    <svg {...svgProps}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" fill="currentColor" stroke="none" />
      <path d="M5 18l5-5 4 4 2.5-2.5L21 19" />
    </svg>
  );
}

export function IconPen() {
  return (
    <svg {...svgProps}>
      <path d="M17 3l4 4L7 21H3v-4L17 3z" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg {...svgProps} width={16} height={16}>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

// 서식 명령 정의 (null은 구분선)
const COMMANDS = [
  {
    cmd: "bold",
    title: "굵게 (Ctrl+B)",
    icon: <b className="rte-glyph">B</b>,
  },
  {
    cmd: "italic",
    title: "기울임 (Ctrl+I)",
    icon: <i className="rte-glyph rte-serif">I</i>,
  },
  {
    cmd: "underline",
    title: "밑줄 (Ctrl+U)",
    icon: <u className="rte-glyph">U</u>,
  },
  null,
  { cmd: "insertUnorderedList", title: "글머리 기호", icon: <IconUl /> },
  { cmd: "insertOrderedList", title: "번호 목록", icon: <IconOl /> },
  null,
  { cmd: "codeBlock", title: "코드 블록 (</>)", icon: <code className="rte-glyph rte-code-glyph">&lt;/&gt;</code>, custom: true },
];

export default function RichTextEditor({
  variant = "full", // "full" | "chat"
  small = false, // true면 낮은 입력 높이 (공지 등 좁은 영역용)
  initialHtml = "", // 처음부터 채워 둘 내용 (예: 실행기에서 넘어온 코드)
  onChange,
  placeholder = "",
  onSend, // chat 전용: 전송 실행 (Ctrl/⌘+Enter로도 전송)
  sendDisabled = false,
  children, // 툴바에 끼워 넣을 추가 도구 (첨부, 그리기 등)
}) {
  const ref = useRef(null);
  const [active, setActive] = useState({}); // 현재 커서 위치의 서식 상태

  // 초기 내용 채우기 (마운트 시 한 번만)
  useEffect(() => {
    if (initialHtml && ref.current && !ref.current.innerHTML) {
      ref.current.innerHTML = initialHtml;
      onChange(initialHtml);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 커서를 움직일 때마다 어떤 서식이 켜져 있는지 추적해 버튼 강조
  useEffect(() => {
    function update() {
      const sel = window.getSelection();
      if (!sel || !ref.current || !ref.current.contains(sel.anchorNode)) {
        return;
      }
      const next = {};
      COMMANDS.forEach((c) => {
        if (c) next[c.cmd] = document.queryCommandState(c.cmd);
      });
      setActive(next);
    }
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);

  function exec(command) {
    ref.current?.focus();
    document.execCommand(command, false, null);
    onChange(ref.current.innerHTML);
  }

  function insertCodeBlock() {
    ref.current?.focus();
    const sel = window.getSelection();
    const selectedText = sel && !sel.isCollapsed ? sel.toString() : "";
    // 선택 텍스트를 이스케이프해 에디터 내 HTML 오염 방지 (렌더링 시 재정화되지만
    // 편집 중 DOM 오염을 막고, 저장 전 sanitize와 이중 방어)
    const html = `<pre><code>${escapeHtml(selectedText) || " "}</code></pre>`;
    document.execCommand("insertHTML", false, html);
    onChange(ref.current.innerHTML);
  }

  function handleInput() {
    onChange(ref.current.innerHTML);
  }

  // 본문에 이미지를 붙여넣으면 data URL이 문서에 박혀(1MB 한도·피드 부하) 문제이므로,
  // Storage에 업로드하고 그 URL로 <img>를 삽입합니다. (데모 모드는 data URL 유지)
  async function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of items) {
      if (it.type && it.type.startsWith("image/")) {
        e.preventDefault();
        const file = it.getAsFile();
        if (!file) return;
        try {
          const url = await uploadImage(file);
          ref.current?.focus();
          document.execCommand("insertHTML", false, `<img src="${url}" alt="">`);
          onChange(ref.current.innerHTML);
        } catch {
          alert("이미지 업로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
        }
        return;
      }
    }
  }

  // 커서가 목록(li) 안에 있으면 Enter는 '새 항목 추가'로 동작해야 함
  function isInList() {
    let node = window.getSelection()?.anchorNode;
    while (node && node !== ref.current) {
      if (node.nodeName === "LI") return true;
      node = node.parentNode;
    }
    return false;
  }

  // 커서가 들어 있는 <pre> 요소를 반환 (없으면 null)
  function getContainingPre() {
    let node = window.getSelection()?.anchorNode;
    while (node && node !== ref.current) {
      if (node.nodeName === "PRE") return node;
      node = node.parentNode;
    }
    return null;
  }

  // <pre> 블록 뒤로 커서를 이동 (내용은 그대로, 코드 블록 탈출)
  function escapeCodeBlock(pre) {
    let next = pre.nextSibling;
    while (next && next.nodeType === Node.TEXT_NODE) next = next.nextSibling;
    if (!next) {
      next = document.createElement("div");
      next.innerHTML = "<br>";
      pre.after(next);
    }
    const sel = window.getSelection();
    const r = document.createRange();
    r.setStart(next, 0);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    onChange(ref.current.innerHTML);
  }

  function handleKeyDown(e) {
    if (e.nativeEvent.isComposing) return;

    // Ctrl/⌘ + Enter: 채팅 전송 (Enter 단독은 줄바꿈 유지)
    if (
      variant === "chat" &&
      e.key === "Enter" &&
      (e.ctrlKey || e.metaKey)
    ) {
      e.preventDefault();
      if (!sendDisabled) onSend?.();
      return;
    }

    // Escape: 코드 블록 어디서든 탈출
    if (e.key === "Escape") {
      const pre = getContainingPre();
      if (pre) {
        e.preventDefault();
        escapeCodeBlock(pre);
      }
    }
  }

  // 툴바 버튼: onMouseDown에서 preventDefault → 에디터의
  // 글자 선택(selection)이 풀리지 않은 채 서식이 적용됩니다.
  const toolbar = (
    <div className="rte-toolbar">
      {variant === "chat" && children}
      {variant === "chat" && children && <span className="rte-divider" />}

      {COMMANDS.map((c, i) =>
        c === null ? (
          <span key={`d${i}`} className="rte-divider" />
        ) : (
          <button
            key={c.cmd}
            type="button"
            title={c.title}
            className={`rte-tool ${active[c.cmd] ? "active" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => c.custom ? insertCodeBlock() : exec(c.cmd)}
          >
            {c.icon}
          </button>
        )
      )}

      {variant === "full" && children && <span className="rte-divider" />}
      {variant === "full" && children}

      {variant === "chat" && (
        <button
          type="button"
          className="rte-send"
          title="전송 (Ctrl+Enter)"
          disabled={sendDisabled}
          onClick={onSend}
        >
          <IconSend />
        </button>
      )}
    </div>
  );

  const area = (
    <div
      ref={ref}
      className="rte-area"
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    />
  );

  return (
    <div
      className={`rte rte-${variant} ${small ? "rte-sm" : ""}`}
    >
      {variant === "full" ? (
        <>
          {toolbar}
          {area}
        </>
      ) : (
        <>
          {area}
          {toolbar}
        </>
      )}
    </div>
  );
}
