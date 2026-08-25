// 탭을 닫으면 사라지므로, 공용 PC에서도 다음 학생에게 새지 않습니다.

const CLASS_KEY = "study_class_id";

export function getSelectedClassId() {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(CLASS_KEY);
}

export function setSelectedClassId(id) {
  if (typeof window === "undefined") return;
  if (id) sessionStorage.setItem(CLASS_KEY, id);
  else sessionStorage.removeItem(CLASS_KEY);
  window.dispatchEvent(new Event("class-change"));
}
