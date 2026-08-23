// =============================================================
// 공부방 반(클래스) 선택 — 세션 단위 보관
// -------------------------------------------------------------
// · 학생: 입장 코드로 반에 들어오면 그 반 id를 세션에 저장합니다.
//   (실명/명부 없이 익명을 유지한 채 "어느 반인지"만 기억)
// · 교사: 공부방 상단 드롭다운에서 고른 반 id를 같은 키에 저장합니다.
// 탭을 닫으면 사라지므로, 공용 PC에서도 다음 학생에게 새지 않습니다.
// =============================================================

const CLASS_KEY = "study_class_id";

export function getSelectedClassId() {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(CLASS_KEY);
}

export function setSelectedClassId(id) {
  if (typeof window === "undefined") return;
  if (id) sessionStorage.setItem(CLASS_KEY, id);
  else sessionStorage.removeItem(CLASS_KEY);
  // 공부방 화면이 새 반으로 다시 그려지도록 알림
  window.dispatchEvent(new Event("class-change"));
}
