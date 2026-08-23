// =============================================================
// 닿소리(자음) 채우기 활동 — 격자 상수
// -------------------------------------------------------------
// 3행 5열 격자. 정중앙(인덱스 7)은 학습주제/도서명 칸이고
// 나머지 14칸에 자음 라벨이 들어갑니다.
//
//   ㄱ/ㄲ   ㄴ    ㄷ/ㄸ   ㄹ    ㅁ
//   ㅂ/ㅃ  ㅅ/ㅆ  [주제]  ㅇ   ㅈ/ㅉ
//    ㅊ     ㅋ     ㅌ     ㅍ    ㅎ
//
// 저장 키는 라벨 대신 `c0`~`c13`을 씁니다. 라벨에 '/'가 들어가는데
// Firestore 필드 경로에서 '/'는 구분자로 해석되기 때문입니다.
// =============================================================

// 자음 라벨 14개 (저장 키 c0 ~ c13 순서)
// 쌍자음(ㄲ·ㄸ·ㅆ·ㅉ)은 따로 칸을 두지 않고 홑자음 칸에 함께 담습니다 —
// 표시만 홑자음으로 하고, 저장 키(c0 등)는 그대로라 기존 활동에 영향 없음.
export const CONSONANT_LABELS = [
  "ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ",
  "ㅂ", "ㅅ",
  "ㅇ", "ㅈ",
  "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

export const CELL_COUNT = CONSONANT_LABELS.length; // 14

// 격자 15칸 → 자음 인덱스(null이면 중앙 주제 칸)
export const GRID_SLOTS = [
  0, 1, 2, 3, 4,
  5, 6, null, 7, 8,
  9, 10, 11, 12, 13,
];

// 자음 인덱스 → 저장 키
export function cellKey(index) {
  return `c${index}`;
}

// ── 모둠 색 (교사 집계·중계·모둠 진행 패널이 모두 같은 색을 씁니다) ──
export const GROUP_COLORS = ["#E07A5F", "#3D8A72", "#5B7DB1", "#C1873B", "#8B6BB1", "#B5566E"];
export function groupColorOf(groupIndex) {
  return GROUP_COLORS[(groupIndex - 1) % GROUP_COLORS.length];
}

// 낱말 분포 히트맵 — 한 칸에 모인 낱말이 많을수록 진하게
const HEAT_OPACITY = [0, 0.3, 0.52, 0.74, 1];
export function heatLevel(n) {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  if (n === 2) return 2;
  if (n <= 4) return 3;
  return 4;
}
export function heatOpacity(n) {
  return HEAT_OPACITY[heatLevel(n)];
}

// 저장된 cells 맵에서 채워진 칸 수를 셉니다(진행률 표시용).
export function filledCount(cells = {}) {
  let n = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    if ((cells[cellKey(i)] ?? []).length > 0) n += 1;
  }
  return n;
}
