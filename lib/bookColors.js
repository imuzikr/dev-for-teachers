// =============================================================
// 모둠원 색 — 판에서 '누가 넣은 낱말인지' 색으로 구분하기 위한 팔레트
// -------------------------------------------------------------
// 색은 모둠에 배정된 순서(members 배열의 자리)로 정합니다.
//  · 한 모둠 안에서 서로 겹치지 않고,
//  · 문서에 색을 따로 저장하지 않아 기존 활동도 그대로 색이 붙습니다.
// (모둠을 다시 구성하거나 학생이 나갔다 들어오면 자리가 바뀌어 색도 바뀝니다
//  — 같은 판을 보는 동안에는 바뀌지 않으므로 수업 중 혼동은 없습니다)
// =============================================================

// 배경이 연해 낱말 글씨가 잘 읽히는 색만 골랐습니다.
export const MEMBER_COLORS = [
  { bg: "#fbe3d0", border: "#e2a06d", text: "#8a4a1e" }, // 주황
  { bg: "#d8efdf", border: "#8cc79f", text: "#1f6b3c" }, // 초록
  { bg: "#d9e6f7", border: "#8fb3de", text: "#27507f" }, // 파랑
  { bg: "#f4e0ef", border: "#d69ac8", text: "#7a3468" }, // 보라
  { bg: "#fbf0cc", border: "#dcc270", text: "#7a6015" }, // 노랑
  { bg: "#d7eef0", border: "#84c3c8", text: "#1d5f64" }, // 청록
  { bg: "#f6dcdc", border: "#dd9a9a", text: "#8a3535" }, // 분홍
  { bg: "#e3e1f5", border: "#a9a4d9", text: "#454083" }, // 남보라
];

// 아직 모둠에 없는 사람(또는 탈퇴한 학생)이 남긴 낱말용 — 눈에 튀지 않는 회색
export const UNKNOWN_MEMBER_COLOR = { bg: "#eceae7", border: "#c9c5c0", text: "#5f5a55" };

// 모둠 안에서 이 학생이 몇 번째 자리인지 (-1이면 구성원이 아님)
export function memberSeat(group, uid) {
  if (!uid) return -1;
  const members = group?.members ?? [];
  const at = members.findIndex((m) => m?.uid === uid);
  if (at >= 0) return at;
  // 예전 문서엔 members 없이 memberUids만 있을 수 있습니다
  return (group?.memberUids ?? []).indexOf(uid);
}

export function memberColor(group, uid) {
  const seat = memberSeat(group, uid);
  if (seat < 0) return UNKNOWN_MEMBER_COLOR;
  return MEMBER_COLORS[seat % MEMBER_COLORS.length];
}

// 판 위쪽 범례에 쓸 [{ uid, name, color }] — 모둠 배정 순서 그대로
export function memberLegend(group) {
  const members = group?.members ?? [];
  if (members.length > 0) {
    return members.map((m, i) => ({
      uid: m.uid,
      name: m.name || "이름 미설정",
      color: MEMBER_COLORS[i % MEMBER_COLORS.length],
    }));
  }
  return (group?.memberUids ?? []).map((uid, i) => ({
    uid,
    name: uid,
    color: MEMBER_COLORS[i % MEMBER_COLORS.length],
  }));
}
