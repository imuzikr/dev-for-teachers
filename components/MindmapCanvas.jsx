"use client";

// =============================================================
// 마인드맵 판 — 학생 편집 · 교사 열람 · 방송 화면이 함께 쓰는 렌더러
// -------------------------------------------------------------
// onChange를 주면 편집판, 안 주면 보기 전용입니다. 세 화면이 같은 그림을
// 그려야 해서(교사가 보는 것과 학생이 만든 것이 달라 보이면 안 되므로)
// 그리는 코드는 여기 한 곳에만 둡니다.
//
// [좌표계]
// 노드의 x·y는 '판 위의 좌표'이고, 뿌리가 (0,0)입니다. 화면에 놓을 때는
//     화면좌표 = 판 가운데 + 이동(pan) + 좌표 × 배율(zoom)
// 로 옮깁니다. 판(.mm-world)을 판 가운데에 놓고 transform으로 한 번에
// 옮기고 키우므로, 노드마다 따로 계산할 필요가 없습니다.
//
// 선(엣지)은 노드 뒤에 깔린 SVG 한 장에 그립니다. 노드 배경이 불투명해서
// 선을 노드 '가운데에서 가운데로' 그어도 겹치는 부분은 노드에 가려집니다
// — 덕분에 노드의 정확한 크기를 몰라도 선이 깔끔하게 붙습니다.
//
// [편집 동작]
//   · 노드를 더블클릭 → 그 노드의 자식 노드를 만들고 바로 편집 상태로
//   · 노드를 우클릭  → 그 노드를 편집 상태로 (내용 입력칸이 뜸)
//   · 선을 클릭      → 그 선(부모→이 노드) 위에 라벨을 입력
// 세 동작 모두 편집판(onChange가 있을 때)에서만 동작합니다.
// =============================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  layoutPositions,
  levelMap,
  levelStyle,
  nodeById,
  subtreeIds,
  addChild,
  removeNode,
  updateNodeText,
  updateEdgeLabel,
  moveSubtreeTo,
  reorderFirstLevelChild,
} from "@/lib/mindmap";

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2.4;
// 자리 맞춤(맞춤 보기)에서 노드가 가장자리에 딱 붙지 않도록 두는 여백
const FIT_PAD = 120;

const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

function textWidth(text, ascii = 7, nonAscii = 13) {
  return [...String(text ?? "").trim()].reduce((sum, ch) => {
    return sum + (/[ -~]/.test(ch) ? ascii : nonAscii);
  }, 0);
}

function estimatedNodeHalfWidth(node, level) {
  const pad = level === 0 ? 36 : 28;
  const max = level === 0 ? 200 : 168;
  const min = level === 0 ? 94 : 62;
  const placeholder = "내용을 적어 주세요";
  const raw = node?.text?.trim() || placeholder;
  return Math.min(max, Math.max(min, textWidth(raw) + pad)) / 2;
}

function edgeLabelMid(a, b, parentNode, childNode, levels) {
  const side = b.x >= a.x ? 1 : -1;
  const parentLv = levels?.get(parentNode?.id) ?? 0;
  const childLv = levels?.get(childNode?.id) ?? 1;
  const parentEdge = a.x + side * estimatedNodeHalfWidth(parentNode, parentLv);
  const childEdge = b.x - side * estimatedNodeHalfWidth(childNode, childLv);
  return { x: (parentEdge + childEdge) / 2, y: (a.y + b.y) / 2 };
}

// 두 점을 잇는 곡선 + 그 곡선 위 라벨 자리.
// 방사형은 두 제어점을 둔 cubic 곡선으로 노드 위치마다 휘어짐을 다르게 만들고,
// 계층형은 가로로 흐르는 삼차 베지어입니다.
// 라벨 자리는 실제 곡선 위의 점이라, 라벨이 선에서 떨어져 보이지 않습니다.
function cubicAt(a, c1, c2, b, t) {
  const mt = 1 - t;
  return {
    x: mt ** 3 * a.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * b.x,
    y: mt ** 3 * a.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * b.y,
  };
}

function edgeGeometry(a, b, layout, parentNode = null, childNode = null, levels = null) {
  const childLv = levels?.get(childNode?.id) ?? 1;
  if (layout === "tree") {
    const dx = Math.max(30, Math.abs(b.x - a.x) / 2);
    const c1 = { x: a.x + dx, y: a.y };
    const c2 = { x: b.x - dx, y: b.y };
    const labelMid = edgeLabelMid(a, b, parentNode, childNode, levels);
    const mid = cubicAt(a, c1, c2, b, 0.5);
    return {
      d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`,
      mid: { x: labelMid.x, y: mid.y },
    };
  }
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;

  // 거의 수평인 중심 가지는 참고 마인드맵처럼 차분한 수평선으로 둡니다.
  const horizontal = Math.abs(dy) <= Math.max(10, Math.abs(dx) * 0.08);
  const nearCenter = Math.abs(midY) < 28;
  if (horizontal && nearCenter) {
    return {
      d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
      mid: edgeLabelMid(a, b, parentNode, childNode, levels),
    };
  }

  const side = b.x >= a.x ? 1 : -1;
  const labelMid = edgeLabelMid(a, b, parentNode, childNode, levels);
  if (childLv > 1) {
    return {
      d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
      mid: labelMid,
    };
  }

  const handleBase = Math.min(Math.max(Math.abs(dx) * 0.42 + Math.abs(dy) * 0.18, 54), dist * 0.72);
  const startHandle = Math.min(handleBase, 240);
  const endHandle = Math.min(Math.max(Math.abs(dx) * 0.38 + Math.abs(dy) * 0.12, 48), 220);
  const c1 = {
    x: a.x + side * startHandle,
    y: a.y,
  };
  const c2 = {
    x: b.x - side * endHandle,
    y: b.y,
  };
  return {
    d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`,
    mid: labelMid,
  };
}

export default function MindmapCanvas({
  map,
  onChange = null,
  selectedId = null,
  onSelect = null,
  className = "",
  // 형태를 바꾸거나 처음 열 때 화면에 맞춰 다시 잡아 주는 열쇠
  fitKey = "",
}) {
  const readOnly = !onChange;
  const stageRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // 지금 내용을 고치는 중인 노드/선 — 우클릭(노드)·클릭(선)으로 들어갑니다.
  const [editingId, setEditingId] = useState(null);
  const [editingEdgeId, setEditingEdgeId] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const editInputRef = useRef(null);
  const edgeInputRef = useRef(null);

  const positions = useMemo(() => layoutPositions(map), [map]);
  const levels = useMemo(() => levelMap(map.nodes), [map.nodes]);
  const previewIds = useMemo(() => {
    if (!dragPreview || map.layout !== "tree") return new Set();
    return subtreeIds(map.nodes, dragPreview.id);
  }, [dragPreview, map.layout, map.nodes]);
  const displayPositions = useMemo(() => {
    if (!dragPreview || previewIds.size === 0) return positions;
    const next = new Map(positions);
    for (const id of previewIds) {
      const p = positions.get(id);
      if (p) next.set(id, { x: p.x, y: p.y + dragPreview.dy });
    }
    return next;
  }, [dragPreview, positions, previewIds]);
  const dropGuideY = useMemo(() => {
    if (!dragPreview || map.layout !== "tree") return null;
    const dropY = dragPreview.originY + dragPreview.dy;
    const firstLevel = map.nodes
      .filter((n) => (levels.get(n.id) ?? 0) === 1)
      .map((n) => ({ id: n.id, y: positions.get(n.id)?.y ?? 0 }))
      .sort((a, b) => a.y - b.y);
    const others = firstLevel.filter(({ id }) => id !== dragPreview.id);
    if (others.length === 0) return dropY;
    const insertBefore = others.find(({ y }) => dropY < y);
    if (insertBefore) return insertBefore.y - 31;
    return others[others.length - 1].y + 31;
  }, [dragPreview, levels, map.layout, map.nodes, positions]);
  const edges = useMemo(() => {
    return map.nodes
      .filter((n) => n.parentId !== null)
      .map((n) => {
        const a = displayPositions.get(n.parentId);
        const b = displayPositions.get(n.id);
        if (!a || !b) return null;
        const parent = nodeById(map.nodes, n.parentId);
        return { node: n, ...edgeGeometry(a, b, map.layout, parent, n, levels) };
      })
      .filter(Boolean);
  }, [map.nodes, map.layout, displayPositions, levels]);

  // 휠 처리기는 한 번만 붙이고 계속 쓰므로, 그 안에서 최신 배율·이동을 읽으려면
  // state를 그대로 잡아 두면 안 됩니다(처음 값에 묶임). 거울용 ref를 둡니다.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;

  const selected = selectedId ? nodeById(map.nodes, selectedId) : null;

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);
  useEffect(() => {
    if (editingEdgeId) edgeInputRef.current?.focus();
  }, [editingEdgeId]);

  // ── 화면에 맞추기 ──
  const fit = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || map.nodes.length === 0) return false;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of map.nodes) {
      const p = positions.get(n.id) ?? { x: 0, y: 0 };
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const w = maxX - minX + FIT_PAD * 2;
    const h = maxY - minY + FIT_PAD * 2;
    const next = clampZoom(Math.min(rect.width / w, rect.height / h, 1));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setZoom(next);
    setPan({ x: -cx * next, y: -cy * next });
    return true;
  }, [map.nodes, positions]);

  // 처음 열릴 때와 형태가 바뀔 때만 맞춥니다(가지를 더할 때마다 튀지 않도록).
  useLayoutEffect(() => {
    if (fit()) return undefined;
    const raf = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.layout, fitKey]);

  // 고른 노드를 화면 안으로 — 가지를 더하면 새 노드가 부모 바깥쪽에 생겨
  // 판 밖으로 나가는 일이 잦습니다(특히 방사형). 그때마다 전체를 다시 맞추면
  // 그림이 통째로 튀므로, 벗어난 만큼만 살짝 따라갑니다.
  useEffect(() => {
    if (!selectedId || dragRef.current) return;
    const stage = stageRef.current;
    const p = positions.get(selectedId);
    if (!stage || !p) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0) return;
    const z = zoomRef.current;
    const { x: px, y: py } = panRef.current;
    const sx = px + p.x * z; // 판 가운데를 0으로 본 노드의 화면 위치
    const sy = py + p.y * z;
    const marginX = Math.max(40, rect.width / 2 - 130);
    const marginY = Math.max(40, rect.height / 2 - 80);
    let nx = px;
    let ny = py;
    if (sx > marginX) nx = px - (sx - marginX);
    else if (sx < -marginX) nx = px + (-marginX - sx);
    if (sy > marginY) ny = py - (sy - marginY);
    else if (sy < -marginY) ny = py + (-marginY - sy);
    if (nx !== px || ny !== py) setPan({ x: nx, y: ny });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, positions]);

  // ── 휠 확대/축소 — 손가락(커서) 아래 지점을 붙잡은 채로 키웁니다 ──
  // React의 onWheel은 기본이 passive라 preventDefault가 통하지 않아,
  // 판이 확대될 때 페이지까지 같이 스크롤됩니다. 그래서 직접 붙입니다.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    function onWheel(e) {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const sx = e.clientX - rect.left - rect.width / 2;
      const sy = e.clientY - rect.top - rect.height / 2;
      const z = zoomRef.current;
      const p = panRef.current;
      const next = clampZoom(z * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
      if (next === z) return;
      const mx = (sx - p.x) / z; // 커서 아래의 판 좌표
      const my = (sy - p.y) / z;
      setPan({ x: sx - mx * next, y: sy - my * next });
      setZoom(next);
    }
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  // 버튼 확대/축소는 판 가운데를 기준으로
  function zoomBy(factor) {
    const next = clampZoom(zoom * factor);
    if (next === zoom) return;
    const k = next / zoom;
    setPan((p) => ({ x: p.x * k, y: p.y * k }));
    setZoom(next);
  }

  // ── 판 끌기(이동) ──
  const dragRef = useRef(null);
  function onStagePointerDown(e) {
    // 노드를 누른 경우는 노드 쪽에서 처리합니다
    if (e.target.closest(".mm-node")) return;
    // 확대/축소 단추는 판 위에 얹혀 있어 여기까지 이벤트가 올라옵니다. 그대로
    // 두면 판 끌기가 시작되면서 포인터를 가로채(setPointerCapture) 단추의
    // click이 아예 발생하지 않습니다 — 버튼이 안 눌리던 원인이었습니다.
    if (e.target.closest(".mm-zoom")) return;
    if (e.target.closest(".mm-edge-label")) return;
    setEditingId(null);
    setEditingEdgeId(null);
    if (onSelect) onSelect(null);
    dragRef.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  // ── 노드 끌기(방사형 위치 조정, 계층형 1단계 순서 조정) / 선택 ──
  function onNodePointerDown(e, node) {
    if (e.target.tagName === "INPUT") return; // 편집 입력칸 안의 클릭은 그대로 둡니다
    if (editingEdgeId) setEditingEdgeId(null);
    if (editingId && editingId !== node.id) setEditingId(null);
    if (onSelect) onSelect(node.id);
    if (readOnly || editingId === node.id) return;
    const lv = levels.get(node.id) ?? 0;
    if (map.layout === "tree" && lv !== 1) return;
    if (map.layout !== "radial" && map.layout !== "tree") return;
    e.stopPropagation();
    const p = positions.get(node.id) ?? { x: 0, y: 0 };
    dragRef.current = {
      kind: map.layout === "tree" ? "tree-reorder" : "node",
      id: node.id,
      sx: e.clientX,
      sy: e.clientY,
      ox: p.x,
      oy: p.y,
      originY: p.y,
      lockY: map.layout === "radial" && lv > 1,
      moved: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  // 더블클릭 — 자식 노드를 만들고 바로 편집 상태로
  function onNodeDoubleClick(e, node) {
    if (readOnly || editingId === node.id) return;
    e.stopPropagation();
    const next = addChild(map, node.id, "");
    const child = next.nodes[next.nodes.length - 1];
    onChange(next);
    onSelect?.(child.id);
    setEditingEdgeId(null);
    setEditingId(child.id);
  }

  // 우클릭 — 이 노드를 편집 상태로
  function onNodeContextMenu(e, node) {
    e.preventDefault();
    if (readOnly) return;
    e.stopPropagation();
    onSelect?.(node.id);
    setEditingEdgeId(null);
    setEditingId(node.id);
  }

  function startEdgeEdit(e, childId) {
    e.stopPropagation();
    if (readOnly) return;
    setEditingId(null);
    setEditingEdgeId(childId);
  }

  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.kind === "pan") {
      setPan({ x: d.ox + dx, y: d.oy + dy });
    } else if (d.kind === "node") {
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return; // 살짝 눌린 것은 클릭으로
      d.moved = true;
      onChange(moveSubtreeTo(map, d.id, d.ox + dx / zoom, d.lockY ? d.oy : d.oy + dy / zoom));
    } else if (d.kind === "tree-reorder") {
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      d.moved = true;
      setDragPreview({ id: d.id, dy: dy / zoom, originY: d.originY });
    }
  }

  function onPointerUp(e) {
    const d = dragRef.current;
    if (d?.kind === "tree-reorder" && d.moved) {
      const dropY = d.oy + (e ? (e.clientY - d.sy) / zoom : 0);
      const firstLevel = map.nodes
        .filter((n) => (levels.get(n.id) ?? 0) === 1)
        .map((n) => ({ node: n, y: positions.get(n.id)?.y ?? 0 }))
        .sort((a, b) => a.y - b.y);
      const others = firstLevel.filter(({ node }) => node.id !== d.id);
      const targetIndex = others.findIndex(({ y }) => dropY < y);
      onChange(reorderFirstLevelChild(map, d.id, targetIndex === -1 ? others.length : targetIndex));
    }
    dragRef.current = null;
    setDragPreview(null);
  }

  const canDragNodes = !readOnly && map.layout === "radial";

  return (
    <div className={`mm-stage${className ? ` ${className}` : ""}`}>
      <div
        ref={stageRef}
        className={`mm-viewport${canDragNodes ? " draggable" : ""}`}
        onPointerDown={onStagePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="mm-world"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {/* 선 — 노드 뒤에 깔립니다. 좌표가 음수일 수 있어 넉넉한 판을 잡습니다.
              편집판에서는 선마다 굵은 투명 선을 하나 더 깔아 클릭 폭을 넓힙니다
              (실제 선은 1~3px라 그대로면 정확히 못 눌러 라벨을 못 답니다). */}
          <svg className="mm-edges" viewBox="-3000 -3000 6000 6000" aria-hidden="true">
            {edges.map(({ node: n, d }) => {
              const lv = levels.get(n.id) ?? 1;
              const isPreviewEdge = previewIds.has(n.id);
              return (
                <g key={n.id}>
                  {!readOnly && (
                    <path
                      d={d}
                      className="mm-edge-hit"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => startEdgeEdit(e, n.id)}
                    />
                  )}
                  <path
                    className={`mm-edge${isPreviewEdge ? " dragging" : ""}`}
                    d={d}
                    stroke={levelStyle(lv).border}
                    strokeWidth={Math.max(1.6, 3.2 - lv * 0.4)}
                  />
                </g>
              );
            })}
          </svg>

          {/* 선 위 라벨 — 곡선의 가운데 점에 둡니다. 보기 전용에서는 라벨이
              있는 선만, 편집판에서는 전부(빈 선은 옅은 + 표시) 보여 줍니다. */}
          {edges.map(({ node: n, mid }) => {
            const hasLabel = !!n.edgeLabel?.trim();
            if (readOnly && !hasLabel) return null;
            const isEditing = editingEdgeId === n.id;
            return (
              <div
                key={`el-${n.id}`}
                className={`mm-edge-label${hasLabel ? "" : " empty"}${isEditing ? " editing" : ""}`}
                style={{ left: mid.x, top: mid.y }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => startEdgeEdit(e, n.id)}
              >
                {isEditing ? (
                  <input
                    ref={edgeInputRef}
                    className="mm-edge-input"
                    value={n.edgeLabel ?? ""}
                    placeholder="선 위 글자"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onChange(updateEdgeLabel(map, n.id, e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Escape") {
                        e.preventDefault();
                        setEditingEdgeId(null);
                      }
                    }}
                    onBlur={() => setEditingEdgeId(null)}
                    maxLength={24}
                  />
                ) : (
                  hasLabel ? n.edgeLabel : "+"
                )}
              </div>
            );
          })}

          {dropGuideY !== null && <div className="mm-drop-guide" style={{ top: dropGuideY }} />}

          {map.nodes.map((n) => {
            const p = displayPositions.get(n.id) ?? { x: 0, y: 0 };
            const lv = levels.get(n.id) ?? 0;
            const s = levelStyle(lv);
            const isSel = selectedId === n.id;
            const isEditing = editingId === n.id;
            const isPreviewRoot = dragPreview?.id === n.id;
            const isPreviewChild = !isPreviewRoot && previewIds.has(n.id);
            const canReorder = !readOnly && map.layout === "tree" && lv === 1;
            return (
              <div
                key={n.id}
                className={`mm-node${isSel ? " sel" : ""}${lv === 0 ? " root" : ""}${
                  isEditing ? " editing" : ""
                }${canReorder ? " reorderable" : ""}${isPreviewRoot ? " dragging" : ""}${
                  isPreviewChild ? " drag-child" : ""
                }`}
                style={{
                  left: p.x,
                  top: p.y,
                  background: s.bg,
                  borderColor: isSel ? "var(--primary)" : s.border,
                  color: s.text,
                  ...(isPreviewRoot || isPreviewChild ? { zIndex: 5 } : {}),
                  ...(isEditing ? { width: lv === 0 ? 200 : 168 } : {}),
                }}
                onPointerDown={(e) => onNodePointerDown(e, n)}
                onDoubleClick={(e) => onNodeDoubleClick(e, n)}
                onContextMenu={(e) => onNodeContextMenu(e, n)}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onKeyDown={
                  onSelect
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(n.id);
                        }
                      }
                    : undefined
                }
              >
                {isEditing ? (
                  <input
                    ref={editInputRef}
                    className="mm-node-input"
                    value={n.text}
                    placeholder={n.parentId === null ? "가운데 주제" : "가지에 담을 내용"}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onChange(updateNodeText(map, n.id, e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Escape") {
                        e.preventDefault();
                        setEditingId(null);
                      }
                    }}
                    onBlur={() => setEditingId(null)}
                    maxLength={60}
                  />
                ) : n.text.trim() ? (
                  n.text
                ) : (
                  <em className="mm-node-empty">내용을 적어 주세요</em>
                )}
              </div>
            );
          })}
        </div>

        {/* 확대/축소 — 판 위에 떠 있어 배율이 바뀌어도 크기가 그대로입니다 */}
        <div className="mm-zoom">
          <button type="button" onClick={() => zoomBy(1 / 1.2)} aria-label="축소">－</button>
          <span className="mm-zoom-val">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => zoomBy(1.2)} aria-label="확대">＋</button>
          <button type="button" className="mm-zoom-fit" onClick={fit}>맞춤</button>
        </div>
      </div>

      {/* 편집 막대 — 이제 만들기·고치기는 노드 위 동작(더블클릭·우클릭)으로
          하므로, 여기는 지우기와 안내만 남깁니다. */}
      {!readOnly && (
        <div className="mm-bar">
          {selected ? (
            <button
              type="button"
              className="btn-ghost mm-bar-del"
              disabled={selected.parentId === null}
              title={
                selected.parentId === null
                  ? "가운데 주제는 지울 수 없어요"
                  : "이 가지와 딸린 가지를 모두 지웁니다"
              }
              onClick={() => {
                onChange(removeNode(map, selected.id));
                onSelect?.(null);
              }}
            >
              지우기
            </button>
          ) : (
            <span className="mm-bar-hint">
              노드를 더블클릭하면 가지가 생기고, 마우스 오른쪽 버튼을 누르면 내용을 고칠 수 있어요.
              선을 클릭하면 선 위에 글자를 넣을 수 있어요.
              {map.layout === "radial" && " 노드를 끌어 자리를 옮길 수도 있어요."}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
