export const CLASS_PURPOSE_TRAINING = "training";
export const CLASS_PURPOSE_INTERNAL = "internal";

export function normalizeClassPurpose(value) {
  return value === CLASS_PURPOSE_INTERNAL ? CLASS_PURPOSE_INTERNAL : CLASS_PURPOSE_TRAINING;
}

export function getClassPurpose(classItem) {
  return normalizeClassPurpose(classItem?.purpose);
}

export function getClassPurposeLabel(purpose) {
  return normalizeClassPurpose(purpose) === CLASS_PURPOSE_INTERNAL ? "교내용" : "연수용";
}

export function getNextClassPurpose(purpose) {
  return normalizeClassPurpose(purpose) === CLASS_PURPOSE_INTERNAL
    ? CLASS_PURPOSE_TRAINING
    : CLASS_PURPOSE_INTERNAL;
}
