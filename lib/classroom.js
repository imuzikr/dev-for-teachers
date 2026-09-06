// 탭을 닫으면 사라지므로, 공용 PC에서도 다음 학생에게 새지 않습니다.

import { getNextClassPurpose, normalizeClassPurpose, CLASS_PURPOSE_TRAINING } from "./classPurpose";

const CLASS_KEY = "study_class_id";
const CLASS_PURPOSE_KEY = "book_class_purpose";

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

export function getSelectedClassPurpose() {
  if (typeof window === "undefined") return CLASS_PURPOSE_TRAINING;
  return normalizeClassPurpose(localStorage.getItem(CLASS_PURPOSE_KEY));
}

export function setSelectedClassPurpose(purpose) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CLASS_PURPOSE_KEY, normalizeClassPurpose(purpose));
  window.dispatchEvent(new Event("class-purpose-change"));
  window.dispatchEvent(new Event("class-change"));
}

export function toggleSelectedClassPurpose() {
  const nextPurpose = getNextClassPurpose(getSelectedClassPurpose());
  setSelectedClassPurpose(nextPurpose);
  return nextPurpose;
}
