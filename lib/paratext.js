// =============================================================
// 곁텍스트(paratext) 읽기 활동 — 항목 정의
// -------------------------------------------------------------
// 본문을 읽기 전에 표지·책날개·제목·목차·머리말·참고문헌·그림처럼 본문을
// 둘러싼 '곁텍스트'만 훑어보며 책의 내용을 미리 짐작해 보는 독서 전략입니다.
// 영어 첫 글자를 모으면 CATAPULT — 여덟 항목을 그 순서대로 씁니다.
//
// 이 파일이 항목의 유일한 출처입니다 — 학생 입력 화면(ParatextForm)과
// 교사가 학생 카드를 눌러 보는 모달(ParatextBoard)이 모두 여기를 읽습니다.
// 답은 Firestore에 { [field.key]: "글" } 한 겹 맵으로 저장하므로,
// 항목을 나중에 더하거나 빼도 이미 저장된 답은 그대로 남습니다.
// =============================================================

export const PARATEXT_SECTIONS = [
  {
    key: "covers",
    letter: "C",
    en: "Covers",
    ko: "표지",
    prompt: "책의 앞면과 뒷면을 보고 책의 내용을 상상해서 써 보세요.",
    hint: "시간·장소·인물 등 자유롭게",
    fields: [
      { key: "covers", lines: 4, placeholder: "표지 그림, 뒷면의 추천 글에서 어떤 이야기가 떠오르나요?" },
    ],
  },
  {
    key: "author",
    letter: "A",
    en: "Author",
    ko: "지은이",
    prompt: "책날개를 읽고, 작가의 배경이나 작가의 다른 책에 대해 써 보세요.",
    fields: [
      { key: "author", lines: 4, placeholder: "작가가 어떤 일을 해 왔는지, 어떤 책을 더 썼는지" },
    ],
  },
  {
    key: "title",
    letter: "T",
    en: "Title",
    ko: "제목",
    prompt: "제목으로 예상되는 내용을 써 보세요.",
    fields: [
      { key: "titleMain", label: "표제", lines: 1, placeholder: "책의 제목" },
      // 부제가 없는 책도 많아 비워 둬도 '다 쓴' 것으로 봅니다
      { key: "titleSub", label: "부제", lines: 1, optional: true, placeholder: "제목에 딸린 작은 제목 (없으면 비워 두세요)" },
      { key: "titleKnown", label: "제목에서 알 수 있는 내용", lines: 2, placeholder: "제목만 보고도 짐작되는 것" },
      { key: "predictClaim", label: "나는 … 라고 예측한다", lines: 2, placeholder: "이 책이 무엇을 다룰지" },
      { key: "predictReason", label: "왜냐하면 … 이기 때문이다", lines: 2, placeholder: "그렇게 생각한 까닭" },
    ],
  },
  {
    key: "audience",
    letter: "A",
    en: "Audience",
    ko: "독자",
    prompt: "다른 사람은 이 책에 대해 어떻게 생각하는지 써 보세요.",
    hint: "뒤표지의 추천사, 서평, 친구의 말 등",
    fields: [
      { key: "audience", lines: 4, placeholder: "이 책을 먼저 읽은 사람들은 무엇을 좋게 보았나요?" },
    ],
  },
  {
    key: "page",
    letter: "P",
    en: "Page",
    ko: "목차",
    prompt: "책의 목차를 읽고 마음에 드는 소챕터를 고른 후 어떤 내용이 담겨 있을지 써 보세요.",
    fields: [
      { key: "chapterTitle", label: "마음에 드는 소챕터의 제목", lines: 1, placeholder: "목차에서 고른 한 꼭지" },
      { key: "chapterReason", label: "마음에 든 이유", lines: 2, placeholder: "왜 그 꼭지가 눈에 들어왔나요?" },
      { key: "chapterGuess", label: "예상한 내용", lines: 3, placeholder: "그 꼭지에 어떤 이야기가 담겨 있을까요?" },
    ],
  },
  {
    key: "underlying",
    letter: "U",
    en: "Underlying message",
    ko: "머리말",
    prompt: "머리말을 읽고 저자가 다루는 책의 주제와 책을 쓴 이유에 대해 써 보세요.",
    fields: [
      { key: "scope", label: "책의 주제 범위", lines: 3, placeholder: "이 책이 다루는 것과 다루지 않는 것" },
      { key: "purpose", label: "저자가 책을 쓴 이유", lines: 3, placeholder: "무엇을 전하고 싶어서 썼을까요?" },
    ],
  },
  {
    key: "look",
    letter: "L",
    en: "Look at the reference",
    ko: "참고문헌",
    prompt: "참고문헌 목록이 이 책과 어떤 관련성을 맺고 있을지 예상해서 써 보세요.",
    fields: [
      { key: "reference", lines: 4, placeholder: "참고문헌의 종류나 성격에서 짐작되는 것" },
    ],
  },
  {
    key: "visuals",
    letter: "T",
    en: "Time, place, characters",
    ko: "시각자료",
    prompt: "책 속의 그림·지도·사진을 훑어보고 내용 또는 인물에 대해 써 보세요.",
    fields: [
      { key: "visuals", lines: 4, placeholder: "언제·어디의 이야기인지, 누가 나오는지" },
    ],
  },
];

export const PARATEXT_SECTION_COUNT = PARATEXT_SECTIONS.length; // 7

// 저장되는 모든 칸의 키 (빈 답 만들기·글자 수 세기에 씁니다)
export const PARATEXT_FIELD_KEYS = PARATEXT_SECTIONS.flatMap((s) =>
  s.fields.map((f) => f.key)
);

export function emptyParatextAnswers() {
  return Object.fromEntries(PARATEXT_FIELD_KEYS.map((k) => [k, ""]));
}

// 한 항목이 '다 쓴' 상태인지 — 그 항목의 칸을 모두 채웠을 때만 참.
// (부제처럼 비어 있을 수 있는 칸이 있어 optional 표시가 붙은 칸은 빼고 셉니다)
export function isSectionDone(section, answers = {}) {
  return section.fields.every(
    (f) => f.optional || String(answers[f.key] ?? "").trim().length > 0
  );
}

export function isSectionStarted(section, answers = {}) {
  return section.fields.some((f) => String(answers[f.key] ?? "").trim().length > 0);
}

// 진행률 — 다 쓴 항목 수. 교사 카드의 막대·숫자에 씁니다.
export function paratextDoneCount(answers = {}) {
  return PARATEXT_SECTIONS.filter((s) => isSectionDone(s, answers)).length;
}

// 아직 아무것도 안 쓴 학생과 '제출은 했지만 비어 있는' 학생을 구분하려고
// 전체 글자 수도 함께 봅니다.
export function paratextCharCount(answers = {}) {
  return PARATEXT_FIELD_KEYS.reduce(
    (n, k) => n + String(answers[k] ?? "").trim().length,
    0
  );
}

// 교사가 넣은 도서 정보 링크가 실제로 열어도 되는 주소인지 확인합니다.
// http(s)가 아닌 주소(javascript: 등)는 버튼을 만들지 않습니다.
export function safeBookUrl(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
