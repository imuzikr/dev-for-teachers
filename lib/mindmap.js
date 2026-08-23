// =============================================================
// 마인드맵 활동 — 자료 구조와 배치 계산
// -------------------------------------------------------------
// 곁텍스트 읽기·RAFT·KWLS와 같은 개인 활동이라 저장 위치도 같습니다
// (bookActivities/{actId}/entries/{uid}). answers에 담기는 모양만 다릅니다.
//
//   answers = { layout: 'radial' | 'tree', nodes: [...] }
//   node    = { id, parentId, text, x, y, edgeLabel }
//
// [엣지를 따로 저장하지 않는 이유]
// 마인드맵의 선은 '부모-자식'을 잇는 것뿐이라, parentId만 있으면 선은 그때그때
// 그려낼 수 있습니다. 엣지를 따로 저장하면 노드를 지웠는데 선만 남는 식으로
// 둘이 어긋날 수 있어, 하나의 출처(parentId)만 두었습니다.
//
// 선 위에 쓰는 글자(edgeLabel)도 같은 이유로 엣지가 아니라 '그 선이 향하는
// 자식 노드'에 실어 둡니다 — 부모→이 노드로 가는 선은 이 노드가 생길 때
// 함께 생기고 이 노드가 지워질 때 함께 사라지므로, 노드 하나에만 붙여 둬도
// 선과 라벨이 어긋날 일이 없습니다. 뿌리는 들어오는 선이 없어 의미가 없습니다.
//
// x·y는 방사형에서 학생이 끌어 옮긴 자리입니다. 계층형은 자리를 자동으로
// 계산하므로 x·y를 쓰지 않습니다(형태를 되돌려도 옮겨 둔 자리는 그대로 남음).
// =============================================================

export const MINDMAP_LAYOUTS = [
  {
    key: "radial",
    ko: "방사형",
    hint: "가운데에서 사방으로 뻗어 나가요. 노드를 끌어 옮길 수 있어요.",
  },
  {
    key: "tree",
    ko: "계층형",
    hint: "왼쪽에서 오른쪽으로 층층이 정리돼요. 자리는 자동으로 잡혀요.",
  },
];

export const ROOT_ID = "root";

// 계층별 배경색 — 깊이가 한눈에 보이도록 층마다 다른 색을 씁니다.
// 뿌리만 꽉 찬 색이고, 아래로 갈수록 옅은 색이라 글씨가 잘 읽힙니다.
export const LEVEL_STYLES = [
  { bg: "#d97757", border: "#b85c3f", text: "#ffffff" }, // 0 — 뿌리(주제)
  { bg: "#f8ece5", border: "#e0a98f", text: "#a84f30" }, // 1
  { bg: "#eaf4ee", border: "#a9d3ba", text: "#2f6f57" }, // 2
  { bg: "#eef1f9", border: "#b9c6e4", text: "#3f5a8a" }, // 3
  { bg: "#faf1dd", border: "#e6d3a8", text: "#8a6a2f" }, // 4
  { bg: "#f3eef8", border: "#cfc0e0", text: "#6b4f8a" }, // 5 이상
];

export function levelStyle(level) {
  return LEVEL_STYLES[Math.min(Math.max(level, 0), LEVEL_STYLES.length - 1)];
}

export function emptyMindmap(topic = "") {
  return {
    layout: "radial",
    nodes: [{ id: ROOT_ID, parentId: null, text: topic || "주제", x: 0, y: 0 }],
  };
}

// 저장된 값을 그릴 수 있는 모양으로 손질합니다. 예전 기록이나 빈 값이 와도
// 화면이 깨지지 않도록, 뿌리가 없으면 만들어 주고 형태 값도 바로잡습니다.
export function normalizeMindmap(raw, topic = "") {
  const layout = raw?.layout === "tree" ? "tree" : "radial";
  const list = Array.isArray(raw?.nodes) ? raw.nodes : [];
  const nodes = list
    .filter((n) => n && typeof n.id === "string")
    .map((n) => ({
      id: n.id,
      parentId: typeof n.parentId === "string" ? n.parentId : null,
      text: typeof n.text === "string" ? n.text : "",
      x: Number.isFinite(n.x) ? n.x : null,
      y: Number.isFinite(n.y) ? n.y : null,
      edgeLabel: typeof n.edgeLabel === "string" ? n.edgeLabel : "",
    }));
  if (nodes.length === 0) return emptyMindmap(topic);
  // 뿌리(부모 없는 노드)가 하나도 없으면 첫 노드를 뿌리로 삼습니다.
  if (!nodes.some((n) => n.parentId === null)) nodes[0] = { ...nodes[0], parentId: null };
  return { layout, nodes };
}

export function nodeById(nodes, id) {
  return nodes.find((n) => n.id === id) ?? null;
}

export function childrenOf(nodes, id) {
  return nodes.filter((n) => n.parentId === id);
}

// 노드별 깊이(뿌리=0). 부모 관계가 꼬여 고리가 생겨도 멈추도록 방문 표시를 씁니다.
export function levelMap(nodes) {
  const kids = new Map();
  const roots = [];
  for (const n of nodes) {
    if (n.parentId === null) roots.push(n);
    else {
      if (!kids.has(n.parentId)) kids.set(n.parentId, []);
      kids.get(n.parentId).push(n);
    }
  }
  const levels = new Map();
  const seen = new Set();
  const queue = roots.map((n) => [n, 0]);
  while (queue.length > 0) {
    const [node, lv] = queue.shift();
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    levels.set(node.id, lv);
    for (const k of kids.get(node.id) ?? []) queue.push([k, lv + 1]);
  }
  // 부모를 잃은 노드도 그리기는 해야 하므로 1층으로 둡니다.
  for (const n of nodes) if (!levels.has(n.id)) levels.set(n.id, 1);
  return levels;
}

// 이 노드와 그 아래 자손 전체 — 지울 때 씁니다.
export function subtreeIds(nodes, id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (n.parentId && out.has(n.parentId) && !out.has(n.id)) {
        out.add(n.id);
        grew = true;
      }
    }
  }
  return out;
}

let seq = 0;
function makeId() {
  seq += 1;
  return `n${Date.now().toString(36)}${seq.toString(36)}`;
}

// ── 방사형 배치 ────────────────────────────────────────────────
// 새 가지를 부모 옆에 놓습니다. 뿌리의 자식은 둘레를 고르게 나눠 갖고,
// 그 아래는 '뿌리에서 부모로 뻗은 방향'을 이어 좌우로 번갈아 폅니다.
export function radialSpawn(nodes, parentId) {
  const parent = nodeById(nodes, parentId);
  if (!parent) return { x: 0, y: 0 };
  const levels = levelMap(nodes);
  const depth = levels.get(parentId) ?? 0;
  const sibs = childrenOf(nodes, parentId);
  const i = sibs.length; // 새로 붙는 순서
  const radius = depth === 0 ? 200 : 165;
  const px = parent.x ?? 0;
  const py = parent.y ?? 0;

  let angle;
  if (depth === 0) {
    // 뿌리 둘레 한 바퀴 — 처음 여섯 개까지는 60°씩, 그 뒤로는 그 사이를 채웁니다
    angle = (Math.PI * 2 * i) / Math.max(6, i + 1) - Math.PI / 2;
  } else {
    // 2단계 이후는 참고 이미지처럼 부모에서 바깥쪽으로 수평 가지를 뻗습니다.
    const side = px >= 0 ? 1 : -1;
    return {
      x: Math.round(px + side * radius),
      y: Math.round(py),
    };
  }
  return {
    x: Math.round(px + radius * Math.cos(angle)),
    y: Math.round(py + radius * Math.sin(angle)),
  };
}

// 자리(x·y)가 없는 노드에만 방사형 자리를 채워 줍니다.
// 계층형으로만 만들다가 방사형으로 바꾸면 자리가 없어 모두 겹치는데,
// 그때 위에서부터 훑어 내려가며 부모 기준으로 자리를 잡아 줍니다.
export function withRadialPositions(map) {
  const levels = levelMap(map.nodes);
  const order = [...map.nodes].sort(
    (a, b) => (levels.get(a.id) ?? 0) - (levels.get(b.id) ?? 0)
  );
  const placed = map.nodes.map((n) => ({ ...n }));
  const at = (id) => placed.find((n) => n.id === id);
  let changed = false;
  for (const n of order) {
    const cur = at(n.id);
    if (Number.isFinite(cur.x) && Number.isFinite(cur.y)) continue;
    changed = true;
    if (cur.parentId === null) {
      cur.x = 0;
      cur.y = 0;
    } else {
      // 이미 자리를 잡은 형제만 세어 각도를 벌립니다
      const seated = placed.filter(
        (s) => s.parentId === cur.parentId && s.id !== cur.id && Number.isFinite(s.x)
      );
      const spot = radialSpawn(
        placed.map((s) => (seated.includes(s) || s.id === cur.parentId ? s : { ...s, x: null })),
        cur.parentId
      );
      cur.x = spot.x;
      cur.y = spot.y;
    }
  }
  return changed ? { ...map, nodes: placed } : map;
}

// ── 계층형 배치 ────────────────────────────────────────────────
// 왼쪽에서 오른쪽으로: 깊이가 열, 잎을 차례로 쌓아 행을 정하고 부모는
// 자식들의 가운데에 놓습니다. 뿌리가 (0,0)에 오도록 마지막에 옮깁니다.
export function computeTreeLayout(nodes, { colGap = 210, rowGap = 62 } = {}) {
  const kids = new Map();
  for (const n of nodes) {
    if (n.parentId === null) continue;
    if (!kids.has(n.parentId)) kids.set(n.parentId, []);
    kids.get(n.parentId).push(n);
  }

  const pos = new Map();
  const seen = new Set();
  let cursor = 0;

  function walk(node, x) {
    if (seen.has(node.id)) return 0;
    seen.add(node.id);
    const children = kids.get(node.id) ?? [];
    let y;
    if (children.length === 0) {
      y = cursor * rowGap;
      cursor += 1;
    } else {
      const ys = children.map((c) => walk(c, x + gapForEdgeLabel(c.edgeLabel, colGap)));
      y = (ys[0] + ys[ys.length - 1]) / 2;
    }
    pos.set(node.id, { x, y });
    return y;
  }

  const roots = nodes.filter((n) => n.parentId === null);
  for (const r of roots) walk(r, 0);
  // 부모를 잃은 노드도 아래에 이어 붙여 화면에서 사라지지 않게 합니다
  for (const n of nodes) {
    if (!pos.has(n.id)) {
      pos.set(n.id, { x: 0, y: cursor * rowGap });
      cursor += 1;
    }
  }
  const root = roots[0] ? pos.get(roots[0].id) : { x: 0, y: 0 };
  const dy = root?.y ?? 0;
  for (const [id, p] of pos) pos.set(id, { x: p.x, y: p.y - dy });
  return pos;
}

function gapForEdgeLabel(label, baseGap = 210) {
  const text = String(label ?? "").trim();
  if (!text) return baseGap;
  const textWidth = [...text].reduce((sum, ch) => {
    return sum + (/[ -~]/.test(ch) ? 6.5 : 11);
  }, 0);
  const labelWidth = textWidth + 18; // CSS padding + border breathing room
  // 계층형 라벨은 부모-자식 사이 가운데에 놓입니다. 긴 라벨만 해당 엣지를
  // 노드 반폭(약 84px) 양쪽과 겹치지 않을 만큼 늘리고, 빈 라벨은 기본 간격입니다.
  return Math.max(baseGap, Math.ceil(labelWidth + 184));
}

// 지금 형태에 맞는 노드별 좌표
export function layoutPositions(map) {
  if (map.layout === "tree") return computeTreeLayout(map.nodes);
  const levels = levelMap(map.nodes);
  const ordered = [...map.nodes].sort(
    (a, b) => (levels.get(a.id) ?? 0) - (levels.get(b.id) ?? 0)
  );
  const pos = new Map();
  for (const n of ordered) {
    const x = Number.isFinite(n.x) ? n.x : 0;
    const storedY = Number.isFinite(n.y) ? n.y : 0;
    const lv = levels.get(n.id) ?? 0;
    const parent = n.parentId ? pos.get(n.parentId) : null;
    pos.set(n.id, {
      x,
      y: lv > 1 && parent ? parent.y : storedY,
    });
  }
  return pos;
}

// ── 편집 ──────────────────────────────────────────────────────
export function addChild(map, parentId, text = "") {
  const spot = map.layout === "radial" ? radialSpawn(map.nodes, parentId) : { x: null, y: null };
  const node = { id: makeId(), parentId, text, x: spot.x, y: spot.y, edgeLabel: "" };
  return { ...map, nodes: [...map.nodes, node] };
}

export function updateNodeText(map, id, text) {
  return { ...map, nodes: map.nodes.map((n) => (n.id === id ? { ...n, text } : n)) };
}

// 선 위 글자 — 그 선이 향하는 자식 노드(childId)에 실어 둡니다.
export function updateEdgeLabel(map, childId, label) {
  return {
    ...map,
    nodes: map.nodes.map((n) => (n.id === childId ? { ...n, edgeLabel: label } : n)),
  };
}

export function moveNode(map, id, x, y) {
  return {
    ...map,
    nodes: map.nodes.map((n) => (n.id === id ? { ...n, x: Math.round(x), y: Math.round(y) } : n)),
  };
}

export function moveSubtreeTo(map, id, x, y) {
  const node = nodeById(map.nodes, id);
  if (!node) return map;
  const nextX = Math.round(x);
  const nextY = Math.round(y);
  const curX = Number.isFinite(node.x) ? node.x : 0;
  const curY = Number.isFinite(node.y) ? node.y : 0;
  const dx = nextX - curX;
  const dy = nextY - curY;
  if (dx === 0 && dy === 0) return map;

  const moving = subtreeIds(map.nodes, id);
  return {
    ...map,
    nodes: map.nodes.map((n) => {
      if (!moving.has(n.id)) return n;
      const px = Number.isFinite(n.x) ? n.x : 0;
      const py = Number.isFinite(n.y) ? n.y : 0;
      return { ...n, x: Math.round(px + dx), y: Math.round(py + dy) };
    }),
  };
}

export function reorderFirstLevelChild(map, childId, targetIndex) {
  const root = map.nodes.find((n) => n.parentId === null);
  const child = nodeById(map.nodes, childId);
  if (!root || !child || child.parentId !== root.id) return map;

  const siblings = map.nodes.filter((n) => n.parentId === root.id);
  const oldIndex = siblings.findIndex((n) => n.id === childId);
  if (oldIndex < 0) return map;

  const nextSiblings = siblings.filter((n) => n.id !== childId);
  const insertAt = Math.max(0, Math.min(targetIndex, nextSiblings.length));
  nextSiblings.splice(insertAt, 0, child);

  const changed = siblings.some((n, i) => nextSiblings[i]?.id !== n.id);
  if (!changed) return map;

  const firstSiblingIndex = map.nodes.findIndex((n) => n.parentId === root.id);
  const nodes = [];
  let inserted = false;
  for (let i = 0; i < map.nodes.length; i += 1) {
    const n = map.nodes[i];
    if (n.parentId !== root.id) {
      nodes.push(n);
      continue;
    }
    if (!inserted) {
      nodes.push(...nextSiblings);
      inserted = true;
    }
  }
  if (!inserted) nodes.splice(firstSiblingIndex, 0, ...nextSiblings);
  return { ...map, nodes };
}

// 뿌리는 지울 수 없습니다(마인드맵의 주제라 없으면 그림이 성립하지 않음).
export function removeNode(map, id) {
  const target = nodeById(map.nodes, id);
  if (!target || target.parentId === null) return map;
  const doomed = subtreeIds(map.nodes, id);
  return { ...map, nodes: map.nodes.filter((n) => !doomed.has(n.id)) };
}

// ── 진행 상황 ─────────────────────────────────────────────────
// 뿌리는 주제라 처음부터 있으므로, '가지'는 뿌리를 뺀 수로 셉니다.
export function branchCount(map) {
  return Math.max(0, (map?.nodes?.length ?? 0) - 1);
}

export function mindmapStarted(map) {
  return branchCount(map) > 0;
}

export function maxDepth(map) {
  if (!map?.nodes?.length) return 0;
  const levels = levelMap(map.nodes);
  return Math.max(...levels.values(), 0);
}
