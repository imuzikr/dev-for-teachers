"use client";

// =============================================================
// 파이썬 코드 실행 패널 (Pyodide + CodeMirror)
// -------------------------------------------------------------
// - 코드 에디터: CodeMirror — 줄 번호, 문법 강조, 괄호 자동 닫기,
//   자동 완성(Tab 또는 Enter로 채택), 파이썬 자동 들여쓰기
// - 실행 단축키: Ctrl+Enter (Mac: Cmd+Enter)
// - 패널 왼쪽 가장자리를 드래그하면 너비 조절, ⛶ 버튼으로 전체 화면
//   (전체 화면에서는 에디터 | 입력·출력이 좌우로 나뉩니다)
// - 실행 엔진: Pyodide(WebAssembly)를 Web Worker에서 실행, 15초 제한
// =============================================================
import { useEffect, useRef, useState } from "react";
import { IconPythonRunner, IconKeyboard, IconAnswer } from "@/components/StatusIcons";
import { EditorView, basicSetup } from "codemirror";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { acceptCompletion } from "@codemirror/autocomplete";
import { Prec } from "@codemirror/state";
import { python } from "@codemirror/lang-python";

const PYODIDE_VERSION = "0.26.4";
const TIMEOUT_MS = 15000;
const MIN_WIDTH = 340;

// Web Worker 안에서 실행될 코드 (문자열로 만들어 Blob으로 생성)
const WORKER_SOURCE = `
importScripts("https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js");
const pyodideReady = loadPyodide({
  indexURL: "https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/",
});
pyodideReady.then(() => self.postMessage({ type: "ready" }));

// input()을 '미리 받아 둔 입력값을 한 줄씩 돌려주는 함수'로 교체
const INPUT_SHIM = [
  "import builtins",
  "def _make_input(text):",
  "    lines = iter(text.splitlines())",
  "    def _input(prompt=''):",
  "        if prompt:",
  "            print(prompt, end='')",
  "        try:",
  "            v = next(lines)",
  "        except StopIteration:",
  "            raise EOFError('input() 호출 횟수보다 입력값이 부족합니다. 입력값 칸을 확인하세요.')",
  "        print(v)",
  "        return v",
  "    return _input",
  "builtins.input = _make_input(___stdin_text)",
].join("\\n");

self.onmessage = async (e) => {
  try {
    const pyodide = await pyodideReady;
    pyodide.setStdout({ batched: (s) => self.postMessage({ type: "stdout", text: s }) });
    pyodide.setStderr({ batched: (s) => self.postMessage({ type: "stderr", text: s }) });
    pyodide.globals.set("___stdin_text", e.data.stdin || "");
    await pyodide.runPythonAsync(INPUT_SHIM);
    const result = await pyodide.runPythonAsync(e.data.code);
    self.postMessage({
      type: "done",
      result: result !== undefined && result !== null ? String(result) : "",
    });
  } catch (err) {
    self.postMessage({ type: "error", error: String(err) });
  }
};
`;

const SAMPLE_CODE = `# 파이썬 코드를 입력하고 Ctrl+Enter로 실행해 보세요!
name = input("이름을 입력하세요: ")
print(f"안녕하세요, {name}님!")

for i in range(1, 6):
    print(f"{i}단계: {'★' * i}")
`;

export default function PythonRunner({ open, onClose, onAskQuestion, hasModalOpen = false }) {
  const [stdinText, setStdinText] = useState("홍길동");
  const [lines, setLines] = useState([]); // 출력 줄 목록 {type, text}
  const [status, setStatus] = useState("idle"); // idle | loading | running
  const [copied, setCopied] = useState(false);
  const [width, setWidth] = useState(440); // 패널 너비 (드래그로 조절)
  const [full, setFull] = useState(false); // 전체 화면 여부
  const [dragging, setDragging] = useState(false);
  const editorHostRef = useRef(null);
  const viewRef = useRef(null);
  const runRef = useRef(() => {});
  const workerRef = useRef(null);
  const timerRef = useRef(null);
  const panelRef = useRef(null);

  // 패널 바깥을 클릭하면 실행기를 닫습니다.
  // (모달이 떠 있을 땐 무시, 실행기 토글 버튼[data-py-toggle] 클릭도 무시)
  useEffect(() => {
    if (!open || hasModalOpen) return;
    function onDown(e) {
      if (panelRef.current?.contains(e.target)) return;
      if (e.target.closest?.("[data-py-toggle]")) return;
      onClose?.();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, hasModalOpen, onClose]);

  // ── CodeMirror 에디터 생성 (한 번만) ──
  useEffect(() => {
    if (!editorHostRef.current || viewRef.current) return;
    const view = new EditorView({
      doc: SAMPLE_CODE,
      parent: editorHostRef.current,
      extensions: [
        // Ctrl+Enter 실행 + Tab으로 자동 완성 채택 (최우선 등록)
        Prec.highest(
          keymap.of([
            {
              key: "Ctrl-Enter",
              mac: "Cmd-Enter",
              run: () => {
                runRef.current();
                return true;
              },
            },
            // 자동 완성 목록이 열려 있으면 Tab으로 채택,
            // 아니면 false를 반환해 아래의 indentWithTab으로 넘어감
            { key: "Tab", run: acceptCompletion },
          ])
        ),
        basicSetup, // 줄 번호, 문법 강조, 괄호 자동 닫기, 자동 완성 등
        keymap.of([indentWithTab]), // (완성 목록이 없을 때) Tab 들여쓰기
        python(), // 파이썬 문법 강조 + 키워드/변수 자동 완성
      ],
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // 워커·타이머 정리
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      clearTimeout(timerRef.current);
    };
  }, []);

  // ── 왼쪽 가장자리 드래그로 너비 조절 ──
  function startResize(e) {
    e.preventDefault();
    setDragging(true);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    function onMove(ev) {
      const w = Math.min(
        Math.max(window.innerWidth - ev.clientX, MIN_WIDTH),
        Math.round(window.innerWidth * 0.95)
      );
      setWidth(w);
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setDragging(false);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function appendLine(type, text) {
    setLines((prev) => [...prev, { type, text }]);
  }

  function createWorker() {
    const blob = new Blob([WORKER_SOURCE], { type: "text/javascript" });
    const worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "stdout") appendLine("out", msg.text);
      if (msg.type === "stderr") appendLine("err", msg.text);
      if (msg.type === "done") {
        clearTimeout(timerRef.current);
        if (msg.result) appendLine("result", msg.result);
        appendLine("info", "── 실행 완료 ──");
        setStatus("idle");
      }
      if (msg.type === "error") {
        clearTimeout(timerRef.current);
        appendLine("err", msg.error);
        setStatus("idle");
      }
    };
    return worker;
  }

  function run() {
    if (status === "running" || status === "loading") return;
    const code = viewRef.current?.state.doc.toString() ?? "";
    if (!code.trim()) return;
    setLines([]);

    if (!workerRef.current) {
      setStatus("loading");
      appendLine("info", "파이썬 인터프리터를 불러오는 중... (처음 한 번만)");
      workerRef.current = createWorker();
    }

    setStatus("running");
    workerRef.current.postMessage({ code, stdin: stdinText });

    // 시간제한: 초과하면 워커를 강제 종료하고 새로 만들 준비
    timerRef.current = setTimeout(() => {
      workerRef.current?.terminate();
      workerRef.current = null;
      appendLine(
        "err",
        `⏱ ${TIMEOUT_MS / 1000}초 시간제한을 초과해 중단했습니다. (무한 루프인지 확인해 보세요)`
      );
      setStatus("idle");
    }, TIMEOUT_MS);
  }

  // 단축키 핸들러가 항상 최신 상태의 run을 부르도록 갱신
  runRef.current = run;

  function copyCode() {
    const code = viewRef.current?.state.doc.toString() ?? "";
    if (!code.trim()) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function stop() {
    workerRef.current?.terminate();
    workerRef.current = null;
    clearTimeout(timerRef.current);
    appendLine("info", "⏹ 실행을 중단했습니다.");
    setStatus("idle");
  }

  // 모달이 열려 있으면 전체 화면 모드 강제 해제
  const effectiveFull = full && !hasModalOpen;

  return (
    <aside
      ref={panelRef}
      className={`py-panel ${open ? "open" : ""} ${effectiveFull ? "full" : ""} ${
        dragging ? "dragging" : ""
      }`}
      style={effectiveFull ? undefined : { width }}
    >
      {/* 왼쪽 가장자리 크기 조절 핸들 — 전체 화면이나 모달 위에 떠 있을 때는 숨김 */}
      {!effectiveFull && !hasModalOpen && (
        <div className="py-resizer" onMouseDown={startResize} />
      )}

      <div className="py-head">
        <h3><IconPythonRunner size={26} /> 파이썬 실행기</h3>
        <div className="py-head-actions">
          <button
            className="py-copy-btn"
            onClick={copyCode}
            title={copied ? "복사됨!" : "코드 복사"}
            aria-label="코드 복사"
          >
            {copied ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M5 13l4 4L19 7" stroke="#5c9e68" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="copy-simple-title">
                <title id="copy-simple-title">Copy</title>
                <path d="M9.35 4.25h7.85c.9 0 1.65.74 1.65 1.65v9.85" stroke="#8A6258" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6.95 7.25h7.7c.9 0 1.65.74 1.65 1.65v8.2c0 .9-.74 1.65-1.65 1.65h-7.7c-.9 0-1.65-.74-1.65-1.65V8.9c0-.9.74-1.65 1.65-1.65Z" fill="#FFF7ED" stroke="#3A312E" strokeWidth="1.55" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
          <button
            className="btn-ghost"
            style={{ visibility: hasModalOpen ? "hidden" : "visible" }}
            onClick={() => setFull(!full)}
            title={full ? "원래 크기로" : "전체 화면"}
            tabIndex={hasModalOpen ? -1 : 0}
          >
            {full ? "🗗 축소" : "⛶ 전체 화면"}
          </button>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
      </div>

      {/* 본문: 보통은 세로 배치, 전체 화면에서는 좌(에디터)/우(입출력) */}
      <div className="py-body">
        <div className="py-left">
          <div className="py-editor" ref={editorHostRef} />
        </div>

        <div className="py-right">
          <label className="py-label">
            <IconKeyboard size={26} /> 입력값 — input()이 읽어 갈 내용 (한 줄에 하나씩)
          </label>
          <textarea
            className="py-code py-stdin"
            spellCheck={false}
            value={stdinText}
            onChange={(e) => setStdinText(e.target.value)}
            placeholder={"예) input()을 두 번 쓰면\n첫 번째 입력\n두 번째 입력"}
          />

          <div className="py-actions">
            <button
              className="btn-primary"
              onClick={run}
              disabled={status !== "idle"}
              title="Ctrl+Enter (Mac: Cmd+Enter)"
            >
              {status === "loading" ? (
                "인터프리터 로딩..."
              ) : status === "running" ? (
                "실행 중..."
              ) : (
                <>▶ 실행 <span className="py-run-hint">Ctrl+Enter</span></>
              )}
            </button>
            {status === "running" && (
              <button className="btn-ghost" onClick={stop}>
                ⏹ 중단
              </button>
            )}
            {/* 지금 에디터의 코드를 코드 블록으로 담아 질문 모달 열기 */}
            {onAskQuestion && (
              <button
                className="btn-ghost"
                onClick={() => {
                  const code = viewRef.current?.state.doc.toString() ?? "";
                  if (code.trim()) onAskQuestion(code);
                }}
              >
                <IconAnswer size={22} /> 질문 만들기
              </button>
            )}
            <button className="btn-ghost" onClick={() => setLines([])}>
              출력 지우기
            </button>
          </div>

          <div className="py-output">
            {lines.length === 0 ? (
              <span className="py-line info">
                실행 결과가 여기에 표시됩니다.
              </span>
            ) : (
              lines.map((l, i) => (
                <span key={i} className={`py-line ${l.type}`}>
                  {l.text}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
