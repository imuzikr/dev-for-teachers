// =============================================================
// KWLS로 성찰하기 활동 — 네 칸 정의
// -------------------------------------------------------------
// 읽기 전에 '이미 아는 것(K)'과 '알고 싶은 것(W)'을 적어 두고, 읽은 뒤에
// '알게 된 것(L)'과 '그래도 더 알고 싶은 것(S)'을 채우는 독서 성찰 전략입니다.
// 읽기 전 칸이 남아 있어야 읽은 뒤에 무엇이 달라졌는지 스스로 견줄 수 있어,
// 네 칸을 한 화면에 나란히 두고 지우지 않은 채로 채워 갑니다.
//
// 곁텍스트 읽기·RAFT 글쓰기와 같은 개인 활동이라 저장 위치도 같습니다
// (bookActivities/{actId}/entries/{uid}). answers에 담기는 키만 다릅니다.
// =============================================================

// phase — 'before'는 읽기 전, 'after'는 읽은 뒤에 채우는 칸입니다.
// 화면에서 두 묶음을 눈에 띄게 갈라 주는 데만 씁니다(저장에는 안 들어감).
export const KWLS_COLUMNS = [
  {
    key: "know",
    letter: "K",
    en: "Know",
    ko: "이미 알고 있는 것",
    phase: "before",
    prompt: "이 주제에 대해 이미 알고 있는 것은?",
    hint: "책을 펴기 전에 떠오르는 것을 그대로 적어 보세요",
    placeholder: "예: 물이 증발하면 수증기가 되어 하늘로 올라간다고 배웠다",
  },
  {
    key: "want",
    letter: "W",
    en: "Want to know",
    ko: "알기를 원하는 것",
    phase: "before",
    prompt: "이 책에서 무엇을 알고 싶은가요?",
    hint: "물음표로 끝나는 문장으로 적으면 읽을 때 찾기 쉬워요",
    placeholder: "예: 구름은 왜 저마다 모양이 다를까?",
  },
  {
    key: "learned",
    letter: "L",
    en: "Learned",
    ko: "알게 된 것",
    phase: "after",
    prompt: "읽고 나서 새로 알게 된 것은?",
    hint: "W에 적어 둔 물음의 답을 찾았는지 견주어 보세요",
    placeholder: "예: 물방울이 먼지에 붙어 뭉치면서 구름이 만들어진다",
  },
  {
    key: "still",
    letter: "S",
    en: "Still want to know",
    ko: "더 알고 싶은 것",
    phase: "after",
    prompt: "읽고 나서도 더 알고 싶어진 것은?",
    hint: "새로 생긴 궁금증 — 다음 읽기의 씨앗이 됩니다",
    placeholder: "예: 구름 위에서는 소리가 어떻게 들릴까?",
  },
];

export const KWLS_COLUMN_COUNT = KWLS_COLUMNS.length; // 4

export const KWLS_FIELD_KEYS = KWLS_COLUMNS.map((c) => c.key);

export const KWLS_LEGACY_KEYS = {
  know: "K",
  want: "W",
  learned: "L",
  still: "S",
};

// 읽기 전/뒤 묶음 — 학생 화면의 머리띠와 진행 표시에 씁니다.
export const KWLS_PHASES = [
  { key: "before", ko: "읽기 전", note: "책을 펴기 전에 K·W를 채웁니다" },
  { key: "after", ko: "읽은 뒤", note: "다 읽고 나서 L·S를 채웁니다" },
];

export function kwlsColumnsOf(phase) {
  return KWLS_COLUMNS.filter((c) => c.phase === phase);
}

export function emptyKwlsAnswers() {
  return Object.fromEntries(KWLS_FIELD_KEYS.map((k) => [k, ""]));
}

export function kwlsAnswersFromEntry(entry = {}) {
  const answers = entry.answers && typeof entry.answers === "object" ? entry.answers : {};
  return Object.fromEntries(
    KWLS_FIELD_KEYS.map((key) => [key, String(answers[key] ?? entry[KWLS_LEGACY_KEYS[key]] ?? "")])
  );
}

export function kwlsLegacyFieldsFromAnswers(answers = {}) {
  const normalized = { ...emptyKwlsAnswers(), ...answers };
  return Object.fromEntries(
    KWLS_FIELD_KEYS.map((key) => [KWLS_LEGACY_KEYS[key], String(normalized[key] ?? "")])
  );
}

function val(answers, key) {
  return String(answers?.[key] ?? "").trim();
}

// 네 칸 중 몇 칸을 채웠는지
export function kwlsFilledCount(answers = {}) {
  return KWLS_FIELD_KEYS.filter((k) => val(answers, k).length > 0).length;
}

// 한 묶음(읽기 전·읽은 뒤)을 다 채웠는지 — 머리띠에 '다 함' 표시를 붙입니다.
export function kwlsPhaseDone(phase, answers = {}) {
  const cols = kwlsColumnsOf(phase);
  return cols.length > 0 && cols.every((c) => val(answers, c.key).length > 0);
}

export function kwlsChars(answers = {}) {
  return KWLS_FIELD_KEYS.reduce((n, k) => n + val(answers, k).length, 0);
}

export function kwlsDone(answers = {}) {
  return kwlsFilledCount(answers) === KWLS_COLUMN_COUNT;
}

export function kwlsStarted(answers = {}) {
  return kwlsFilledCount(answers) > 0;
}
