import { toDate } from "./store";

export const PINNED_METOO_THRESHOLD = 5;

export function getMeTooCount(question) {
  return question.meTooIds?.length ?? 0;
}

export function isPinnedQuestion(question) {
  return getMeTooCount(question) >= PINNED_METOO_THRESHOLD;
}

function newestFirst(a, b) {
  return toDate(b.createdAt) - toDate(a.createdAt);
}

export function sortPinnedQuestions(list) {
  const pinned = [];
  const regular = [];

  list.forEach((question) => {
    if (isPinnedQuestion(question)) {
      pinned.push(question);
    } else {
      regular.push(question);
    }
  });

  pinned.sort((a, b) => {
    const countDiff = getMeTooCount(b) - getMeTooCount(a);
    return countDiff || newestFirst(a, b);
  });

  return [...pinned, ...regular];
}
