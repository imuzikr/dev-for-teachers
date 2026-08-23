// =============================================================
// 수업 보드의 '활동' 공용 헬퍼
// -------------------------------------------------------------
// 보드(studyBoards) 문서는 활동을 두 개의 나란한 배열로 들고 있습니다.
//   activities    : string[]   활동 이름
//   activityLocks : boolean[]  같은 자리의 활동이 잠겨 있는지
//
// [왜 배열 두 개인가]
// activities를 객체 배열({name, locked})로 바꾸면 이미 저장된 보드·카드를
// 전부 옮겨야 합니다. 나란한 배열이면 예전 보드(activityLocks 없음)도
// 그대로 읽히고, 없는 값은 '잠기지 않음'으로 봅니다 — 이 기능이 생기기
// 전에 만든 활동이 어느 날 갑자기 잠겨 버리는 일이 없게.
//
// [잠금의 성격]
// 잠금은 '화면에서 입력을 막는' 수업 진행 도구입니다. 카드 내용은 활동
// 여러 개가 한 덩어리 HTML로 저장되므로, 보안 규칙이 "몇 번째 활동이
// 바뀌었는지"를 판별할 수 없습니다(규칙은 HTML을 해석하지 못함).
// 보드 전체 잠금(editMode: 'locked')은 규칙으로도 막히지만, 활동별
// 잠금은 서버에서 강제되지 않습니다.
// =============================================================

// 활동 목록 → 학생 카드의 작성 틀(제목 + 빈 줄)
export function buildActivityTemplate(activities) {
  if (!activities?.length) return "";
  return activities
    .map(
      (act) =>
        `<div class="activity-section"><h4 class="activity-title">${act}</h4><p><br></p></div>`
    )
    .join("");
}

// 카드 HTML → [{ title, content }] — buildActivityTemplate이 만든 구조를
// 되읽습니다. 구조가 아니면(옛 자유형 카드) 빈 배열을 돌려주므로, 호출부는
// 그걸 보고 예전 단일 편집기로 물러설 수 있습니다.
export function parseActivitySections(html) {
  if (!html || typeof DOMParser === "undefined") return [];
  try {
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    return Array.from(doc.querySelectorAll(".activity-section")).map((sec) => {
      const h = sec.querySelector(".activity-title");
      const title = h ? h.textContent.trim() : "";
      // 제목을 뺀 나머지가 학생이 쓴 내용
      const rest = Array.from(sec.childNodes)
        .filter((n) => n !== h)
        .map((n) => (n.nodeType === 1 ? n.outerHTML : n.textContent))
        .join("");
      return { title, content: rest };
    });
  } catch {
    return [];
  }
}

// i번째 활동이 잠겨 있는가 (예전 보드엔 activityLocks가 없음 → 잠기지 않음)
export function isActivityLocked(board, i) {
  return board?.activityLocks?.[i] === true;
}

// 활동 목록을 바꿀 때 새 잠금 배열을 만듭니다.
//  · 이름이 그대로 남아 있는 활동은 잠금 상태를 그대로 이어받고
//  · 새로 추가된 활동은 잠긴 채로 시작합니다(교사가 풀어 줘야 학생이 입력)
export function nextActivityLocks(prevActivities, prevLocks, nextActivities) {
  const prev = prevActivities ?? [];
  return (nextActivities ?? []).map((name) => {
    const at = prev.indexOf(name);
    return at >= 0 ? prevLocks?.[at] === true : true;
  });
}
