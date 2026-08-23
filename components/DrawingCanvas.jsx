"use client";

// =============================================================
// 그리기 캔버스 모달
// -------------------------------------------------------------
// 그린 내용을 "도형 객체 목록"으로 저장하고 매번 캔버스를 다시
// 그리는 구조입니다. 덕분에 다음이 가능합니다:
//   · 🧽 지우개      — 문지른 부분만 지움 (픽셀 지우개)
//   · ✂️ 획 지우개   — 클릭한 획/도형 전체를 한 번에 지움
//   · 🖱️ 선택        — 클릭해 이동, 모서리 핸들로 크기 조절,
//                      위쪽 동그라미 핸들로 회전 (Delete로 삭제)
//   · ↩️/↪️          — 되돌리기/다시 실행 (Ctrl+Z / Ctrl+Y)
// '그림 첨부'를 누르면 캔버스 내용이 이미지(data URL)로 변환되어
// 질문 작성 폼의 첨부 이미지로 들어갑니다.
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useEffect, useRef, useState } from "react";
import { readImageAsDataUrl } from "@/lib/image";
import { IconTrash } from "./StatusIcons";

const COLORS = ["#262625", "#c04a3f", "#d97757", "#3d7a4a", "#d4a017"];
const SIZES = [
  { label: "가늘게", value: 3 },
  { label: "보통", value: 6 },
  { label: "굵게", value: 12 },
];
const TOOLS = [
  { id: "pen", label: "✏️ 펜" },
  { id: "rect", label: "⬜ 사각형" },
  { id: "ellipse", label: "⚪ 원" },
  { id: "line", label: "╱ 직선" },
  { id: "arrow", label: "↗ 화살표" },
  { id: "select", label: "🖱️ 선택" },
  { id: "eraser", label: "🧽 지우개" },
  { id: "eraser-stroke", label: "✂️ 획 지우개" },
];

let shapeSeq = 1;

// ---------- 좌표 유틸 ----------

// 점 p와 선분 a-b 사이의 거리
function segDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// 점 p를 중심 c 기준으로 ang(라디안)만큼 회전
function rotatePoint(p, c, ang) {
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

// 도형의 중심점 (회전의 기준)
function centerOf(s) {
  const pts = s.points ?? [s.a, s.b];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

// 도형을 중심 c 기준으로 (sx, sy)배 확대/축소한 새 도형 반환
function scaleShape(s, c, sx, sy) {
  const f = (p) => ({ x: c.x + (p.x - c.x) * sx, y: c.y + (p.y - c.y) * sy });
  if (s.points) return { ...s, points: s.points.map(f) };
  return { ...s, a: f(s.a), b: f(s.b) };
}

// 선택 상자(로컬 좌표)의 핸들 위치: 모서리 4개 + 위쪽 회전 핸들
function handlePositionsLocal(box) {
  return {
    corners: [
      { x: box.x1, y: box.y1 },
      { x: box.x2, y: box.y1 },
      { x: box.x2, y: box.y2 },
      { x: box.x1, y: box.y2 },
    ],
    rotate: { x: (box.x1 + box.x2) / 2, y: box.y1 - 24 },
  };
}

// 도형의 경계 상자 {x1, y1, x2, y2}
function bboxOf(s) {
  const pts = s.points ?? [s.a, s.b];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const pad = s.size / 2 + 4;
  return {
    x1: Math.min(...xs) - pad,
    y1: Math.min(...ys) - pad,
    x2: Math.max(...xs) + pad,
    y2: Math.max(...ys) + pad,
  };
}

// 점 p가 도형 s에 닿았는지 검사
// allowInside: true면 도형 안쪽 클릭도 인정 (선택 도구용)
function hitTest(s, p, allowInside) {
  const tol = Math.max(10, s.size / 2 + 8);

  // 회전된 도형은 클릭 지점을 도형의 로컬 좌표로 되돌려 검사
  if (s.rot) p = rotatePoint(p, centerOf(s), -s.rot);

  // 삽입한 이미지는 영역 안쪽 클릭으로 잡습니다
  if (s.tool === "image") {
    const box = bboxOf(s);
    return p.x > box.x1 && p.x < box.x2 && p.y > box.y1 && p.y < box.y2;
  }

  if (s.tool === "pen") {
    const pts = s.points;
    if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) < tol;
    for (let i = 1; i < pts.length; i++) {
      if (segDist(p, pts[i - 1], pts[i]) < tol) return true;
    }
    return false;
  }

  if (s.tool === "line" || s.tool === "arrow") {
    return segDist(p, s.a, s.b) < tol;
  }

  const box = bboxOf(s);
  const inside =
    p.x > box.x1 && p.x < box.x2 && p.y > box.y1 && p.y < box.y2;

  if (s.tool === "rect") {
    if (allowInside && inside) return true;
    // 테두리 네 변 근처인지 검사
    const a = s.a;
    const b = s.b;
    const c1 = { x: a.x, y: a.y };
    const c2 = { x: b.x, y: a.y };
    const c3 = { x: b.x, y: b.y };
    const c4 = { x: a.x, y: b.y };
    return (
      segDist(p, c1, c2) < tol ||
      segDist(p, c2, c3) < tol ||
      segDist(p, c3, c4) < tol ||
      segDist(p, c4, c1) < tol
    );
  }

  if (s.tool === "ellipse") {
    if (allowInside && inside) return true;
    const cx = (s.a.x + s.b.x) / 2;
    const cy = (s.a.y + s.b.y) / 2;
    const rx = Math.max(1, Math.abs(s.b.x - s.a.x) / 2);
    const ry = Math.max(1, Math.abs(s.b.y - s.a.y) / 2);
    const v = Math.hypot((p.x - cx) / rx, (p.y - cy) / ry);
    const band = tol / Math.min(rx, ry);
    return Math.abs(v - 1) < band;
  }

  return false;
}

// 도형을 (dx, dy)만큼 이동한 새 도형을 반환 (원본은 그대로 둠)
function moveShape(s, dx, dy) {
  if (s.points) {
    return { ...s, points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  }
  return {
    ...s,
    a: { x: s.a.x + dx, y: s.a.y + dy },
    b: { x: s.b.x + dx, y: s.b.y + dy },
  };
}

export default function DrawingCanvas({ onSave, onClose }) {
  const canvasRef = useRef(null);

  // 그린 도형 목록 + 되돌리기/다시 실행 스택 (ref로 관리, UI 갱신은 tick)
  const shapesRef = useRef([]);
  const pastRef = useRef([]); // 되돌리기용 이전 상태들
  const futureRef = useRef([]); // 다시 실행용 상태들
  const selectedRef = useRef(null); // 선택된 도형 id
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  // 그리는 중 상태
  const drawingRef = useRef(false);
  const draftRef = useRef(null); // 그리는 중인 도형 (아직 미확정)
  const dragRef = useRef(null); // 선택 도구의 드래그 정보

  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1].value);
  const toolRef = useRef(tool);
  toolRef.current = tool;

  // ---------- 렌더링 ----------

  // 회전을 적용해서 도형 하나를 그림
  function drawShapeObj(ctx, s) {
    ctx.save();
    if (s.rot) {
      const c0 = centerOf(s);
      ctx.translate(c0.x, c0.y);
      ctx.rotate(s.rot);
      ctx.translate(-c0.x, -c0.y);
    }
    drawShapeBody(ctx, s);
    ctx.restore();
  }

  function drawShapeBody(ctx, s) {
    // 삽입한 이미지 (배경 역할 — 위에 그린 획이 덮습니다)
    if (s.tool === "image") {
      ctx.drawImage(s.img, s.a.x, s.a.y, s.b.x - s.a.x, s.b.y - s.a.y);
      return;
    }
    ctx.strokeStyle = s.isEraser ? "#ffffff" : s.color;
    ctx.lineWidth = s.isEraser ? s.size * 4 : s.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();

    if (s.tool === "pen") {
      const pts = s.points;
      ctx.moveTo(pts[0].x, pts[0].y);
      if (pts.length === 1) ctx.lineTo(pts[0].x + 0.01, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      return;
    }
    if (s.tool === "rect") {
      ctx.strokeRect(s.a.x, s.a.y, s.b.x - s.a.x, s.b.y - s.a.y);
      return;
    }
    if (s.tool === "ellipse") {
      ctx.ellipse(
        (s.a.x + s.b.x) / 2,
        (s.a.y + s.b.y) / 2,
        Math.abs(s.b.x - s.a.x) / 2,
        Math.abs(s.b.y - s.a.y) / 2,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      return;
    }
    // 직선 (화살표도 몸통은 직선)
    ctx.moveTo(s.a.x, s.a.y);
    ctx.lineTo(s.b.x, s.b.y);
    ctx.stroke();

    if (s.tool === "arrow") {
      const angle = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);
      const head = Math.max(14, s.size * 3);
      ctx.beginPath();
      ctx.moveTo(s.b.x, s.b.y);
      ctx.lineTo(
        s.b.x - head * Math.cos(angle - Math.PI / 6),
        s.b.y - head * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(s.b.x, s.b.y);
      ctx.lineTo(
        s.b.x - head * Math.cos(angle + Math.PI / 6),
        s.b.y - head * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
    }
  }

  // 전체 다시 그리기 (draft: 그리는 중인 도형, showSelection: 선택 표시 여부)
  function renderAll(draft = null, showSelection = true) {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    shapesRef.current.forEach((s) => drawShapeObj(ctx, s));
    if (draft) drawShapeObj(ctx, draft);

    // 선택된 도형은 점선 상자 + 크기 조절/회전 핸들로 표시
    const sel = showSelection
      ? shapesRef.current.find((s) => s.id === selectedRef.current)
      : null;
    if (sel) drawSelectionOverlay(ctx, sel);
  }

  // 선택 오버레이: 테라코타 점선 상자, 모서리 핸들 4개, 위쪽 회전 핸들
  function drawSelectionOverlay(ctx, s) {
    const c0 = centerOf(s);
    const box = bboxOf(s);
    const hs = handlePositionsLocal(box);
    ctx.save();
    if (s.rot) {
      ctx.translate(c0.x, c0.y);
      ctx.rotate(s.rot);
      ctx.translate(-c0.x, -c0.y);
    }
    ctx.strokeStyle = "#d97757";
    ctx.lineWidth = 1.5;
    // 점선 상자
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
    ctx.setLineDash([]);
    // 회전 핸들로 이어지는 줄기
    ctx.beginPath();
    ctx.moveTo((box.x1 + box.x2) / 2, box.y1);
    ctx.lineTo(hs.rotate.x, hs.rotate.y);
    ctx.stroke();
    // 모서리 핸들 (크기 조절)
    ctx.fillStyle = "#ffffff";
    hs.corners.forEach((h) => {
      ctx.beginPath();
      ctx.rect(h.x - 5, h.y - 5, 10, 10);
      ctx.fill();
      ctx.stroke();
    });
    // 회전 핸들 (동그라미)
    ctx.beginPath();
    ctx.arc(hs.rotate.x, hs.rotate.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // p 위치에 선택된 도형의 핸들이 있는지 검사
  function findHandleAt(s, p) {
    const c0 = centerOf(s);
    const lp = s.rot ? rotatePoint(p, c0, -s.rot) : p;
    const hs = handlePositionsLocal(bboxOf(s));
    if (Math.hypot(lp.x - hs.rotate.x, lp.y - hs.rotate.y) < 11) {
      return { type: "rotate" };
    }
    for (const h of hs.corners) {
      if (Math.abs(lp.x - h.x) < 10 && Math.abs(lp.y - h.y) < 10) {
        return { type: "resize", corner: h };
      }
    }
    return null;
  }

  useEffect(() => {
    renderAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 도구를 바꾸면 선택 해제
  useEffect(() => {
    if (tool !== "select" && selectedRef.current) {
      selectedRef.current = null;
      renderAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // ---------- 히스토리 ----------

  // 변경 확정: 이전 상태를 되돌리기 스택에 쌓고 새 상태로 교체
  function commit(newShapes) {
    pastRef.current.push(shapesRef.current);
    futureRef.current = [];
    shapesRef.current = newShapes;
    renderAll();
    rerender();
  }

  function undo() {
    if (pastRef.current.length === 0) return;
    futureRef.current.unshift(shapesRef.current);
    shapesRef.current = pastRef.current.pop();
    selectedRef.current = null;
    renderAll();
    rerender();
  }

  function redo() {
    if (futureRef.current.length === 0) return;
    pastRef.current.push(shapesRef.current);
    shapesRef.current = futureRef.current.shift();
    selectedRef.current = null;
    renderAll();
    rerender();
  }

  // 선택된 도형 삭제 (Delete 키 / 획 지우개와 동일한 효과)
  function deleteSelected() {
    if (!selectedRef.current) return;
    const next = shapesRef.current.filter((s) => s.id !== selectedRef.current);
    selectedRef.current = null;
    commit(next);
  }

  // 단축키: Ctrl+Z 되돌리기, Ctrl+Y(또는 Ctrl+Shift+Z) 다시 실행, Delete 삭제
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "Delete" && toolRef.current === "select") {
        deleteSelected();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 포인터 입력 ----------

  // 화면 좌표 → 캔버스 내부 좌표 변환 (마우스/터치 공용)
  function getPos(e) {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return {
      x: ((p.clientX - rect.left) * c.width) / rect.width,
      y: ((p.clientY - rect.top) * c.height) / rect.height,
    };
  }

  // p 위치의 도형 찾기 (위에 그린 것부터, 픽셀 지우개 자국은 제외)
  function findShapeAt(p, allowInside) {
    const list = shapesRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].isEraser) continue;
      if (hitTest(list[i], p, allowInside)) return list[i];
    }
    return null;
  }

  function start(e) {
    const p = getPos(e);

    // 선택 도구: 핸들(크기/회전) 우선, 그다음 도형 집어 이동
    if (tool === "select") {
      const selShape = shapesRef.current.find(
        (s) => s.id === selectedRef.current
      );
      if (selShape) {
        const h = findHandleAt(selShape, p);
        if (h) {
          const c0 = centerOf(selShape);
          dragRef.current = {
            mode: h.type, // "resize" | "rotate"
            startP: p,
            orig: selShape,
            center: c0,
            corner: h.corner ?? null,
            startAngle: Math.atan2(p.y - c0.y, p.x - c0.x),
            origRot: selShape.rot ?? 0,
            before: shapesRef.current,
            moved: false,
          };
          return;
        }
      }
      const s = findShapeAt(p, true);
      selectedRef.current = s?.id ?? null;
      dragRef.current = s
        ? {
            mode: "move",
            startP: p,
            orig: s,
            before: shapesRef.current,
            moved: false,
          }
        : null;
      renderAll();
      return;
    }

    // 획 지우개: 클릭한 도형 전체 삭제
    if (tool === "eraser-stroke") {
      const s = findShapeAt(p, false);
      if (s) commit(shapesRef.current.filter((x) => x.id !== s.id));
      return;
    }

    // 펜/지우개/도형: 새 도형 그리기 시작
    drawingRef.current = true;
    if (tool === "pen" || tool === "eraser") {
      draftRef.current = {
        id: `s${shapeSeq++}`,
        tool: "pen",
        color,
        size,
        isEraser: tool === "eraser",
        points: [p],
      };
    } else {
      draftRef.current = { id: `s${shapeSeq++}`, tool, color, size, a: p, b: p };
    }
    renderAll(draftRef.current);
  }

  function move(e) {
    const p = getPos(e);

    // 선택 도구: 드래그로 이동 / 크기 조절 / 회전
    if (tool === "select") {
      const d = dragRef.current;
      if (!d || !selectedRef.current) return;
      let next = null;

      if (d.mode === "move") {
        const dx = p.x - d.startP.x;
        const dy = p.y - d.startP.y;
        if (!d.moved && Math.hypot(dx, dy) > 2) d.moved = true;
        if (d.moved) next = moveShape(d.orig, dx, dy);
      } else if (d.mode === "rotate") {
        // 중심 기준 포인터 각도의 변화량만큼 회전
        const ang = Math.atan2(p.y - d.center.y, p.x - d.center.x);
        d.moved = true;
        next = { ...d.orig, rot: d.origRot + (ang - d.startAngle) };
      } else if (d.mode === "resize") {
        // 포인터를 도형의 로컬 좌표로 바꿔 중심 기준 배율 계산
        const rot = d.orig.rot ?? 0;
        const lp = rot ? rotatePoint(p, d.center, -rot) : p;
        const ox = Math.abs(d.corner.x - d.center.x) || 1;
        const oy = Math.abs(d.corner.y - d.center.y) || 1;
        let sx = Math.max(0.05, Math.abs(lp.x - d.center.x) / ox);
        let sy = Math.max(0.05, Math.abs(lp.y - d.center.y) / oy);
        // 이미지는 가로세로 비율을 유지
        if (d.orig.tool === "image") {
          const u = (sx + sy) / 2;
          sx = u;
          sy = u;
        }
        d.moved = true;
        next = scaleShape(d.orig, d.center, sx, sy);
      }

      if (next) {
        shapesRef.current = shapesRef.current.map((s) =>
          s.id === selectedRef.current ? next : s
        );
        renderAll();
      }
      return;
    }

    if (!drawingRef.current || !draftRef.current) return;
    if (draftRef.current.points) draftRef.current.points.push(p);
    else draftRef.current.b = p;
    renderAll(draftRef.current);
  }

  function end() {
    // 선택 도구: 이동이 있었다면 히스토리에 확정
    if (tool === "select") {
      const d = dragRef.current;
      if (d?.moved) {
        pastRef.current.push(d.before);
        futureRef.current = [];
        rerender();
      }
      dragRef.current = null;
      return;
    }

    if (drawingRef.current && draftRef.current) {
      commit([...shapesRef.current, draftRef.current]);
    }
    drawingRef.current = false;
    draftRef.current = null;
  }

  function clearAll() {
    if (shapesRef.current.length === 0) return;
    selectedRef.current = null;
    commit([]);
  }

  // 이미지 삽입 — 캔버스에 맞게 축소해 가운데에, 맨 아래(배경)로 넣습니다.
  // 위에 펜/도형을 그릴 수 있고, 선택 도구로 위치 이동도 가능합니다.
  async function handleImageFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 삽입할 수 있습니다.");
      return;
    }
    const dataUrl = await readImageAsDataUrl(file);
    e.target.value = ""; // 같은 파일 재선택 가능하도록
    const img = new Image();
    img.onload = () => {
      const c = canvasRef.current;
      const scale = Math.min(c.width / img.width, c.height / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (c.width - w) / 2;
      const y = (c.height - h) / 2;
      commit([
        {
          id: `s${shapeSeq++}`,
          tool: "image",
          img,
          size: 2,
          a: { x, y },
          b: { x: x + w, y: y + h },
        },
        ...shapesRef.current, // 기존 그림은 이미지 위에 유지
      ]);
    };
    img.src = dataUrl;
  }

  function handleSave() {
    renderAll(null, false); // 선택 점선 상자는 빼고 그리기
    onSave(canvasRef.current.toDataURL("image/jpeg", 0.85));
    onClose();
  }

  const cursor =
    tool === "select"
      ? "default"
      : tool === "eraser-stroke"
      ? "pointer"
      : "crosshair";

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div className="modal modal-canvas" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>🎨 그리기</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        {/* 도구 모음 */}
        <div className="canvas-toolbar">
          <div className="color-row">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-swatch ${
                  tool !== "eraser" && tool !== "eraser-stroke" && color === c
                    ? "active"
                    : ""
                }`}
                style={{ background: c }}
                onClick={() => {
                  setColor(c);
                  if (tool === "eraser" || tool === "eraser-stroke") {
                    setTool("pen");
                  }
                }}
                aria-label={`색상 ${c}`}
              />
            ))}
          </div>

          <div className="tool-row">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`btn-ghost ${tool === t.id ? "tool-active" : ""}`}
                onClick={() => setTool(t.id)}
              >
                {t.label}
              </button>
            ))}
            {/* 이미지 삽입 — 배경으로 깔고 그 위에 그립니다 */}
            <label
              className="btn-ghost"
              style={{ cursor: "pointer" }}
              title="이미지를 배경으로 삽입하고 그 위에 그릴 수 있어요"
            >
              🖼️ 이미지
              <input
                type="file"
                accept="image/*"
                onChange={handleImageFile}
                hidden
              />
            </label>
          </div>

          <div className="tool-row">
            {SIZES.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`btn-ghost ${size === s.value ? "tool-active" : ""}`}
                onClick={() => setSize(s.value)}
              >
                {s.label}
              </button>
            ))}
            <button
              type="button"
              className="btn-ghost"
              onClick={undo}
              disabled={pastRef.current.length === 0}
              title="되돌리기 (Ctrl+Z)"
            >
              ↩️ 되돌리기
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={redo}
              disabled={futureRef.current.length === 0}
              title="다시 실행 (Ctrl+Y)"
            >
              ↪️ 다시 실행
            </button>
            <button type="button" className="btn-ghost" onClick={clearAll}>
              <IconTrash size={16} /> 전체 지우기
            </button>
          </div>
        </div>

        {/* 그리기 영역 */}
        <canvas
          ref={canvasRef}
          width={800}
          height={500}
          className="draw-canvas"
          style={{ cursor }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />

        <div className="canvas-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn-primary" onClick={handleSave}>
            ✓ 그림 첨부
          </button>
        </div>
      </div>
    </div>
  );
}
