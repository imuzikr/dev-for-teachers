// =============================================================
// 데이터 레이어 (Firestore ↔ 데모 모드 자동 전환)
// -------------------------------------------------------------
// 화면(컴포넌트)은 이 파일의 함수만 호출합니다.
// - Firebase 설정이 완료되면 → Firestore에 실시간 저장/구독
// - 설정 전이면              → 브라우저 메모리에 임시 저장(데모 모드)
//
// [Firestore 데이터 구조] — 사용자별 구분을 위해 모든 문서에
// authorId(uid)를 저장합니다. 나중에 인증을 붙이면 이 값만
// 실제 로그인 유저의 uid로 바뀝니다.
//
//   questions (컬렉션)
//     └ { title, content, keyword, authorId, authorName,
//         authorEmoji, authorRealName,
//         answerCount, meTooIds, createdAt }
//        · meTooIds: "나도 궁금해요"를 누른 사용자 uid 배열.
//          uid가 이미 있으면 추가되지 않으므로 1인 1회가 보장되고,
//          배열 길이가 곧 클릭 수가 됩니다.
//        · authorName은 익명 닉네임, authorRealName은 실제 이름.
//          실명은 관리자(교사)가 프로필을 클릭할 때만 화면에 보입니다.
//       └ answers (하위 컬렉션)
//           └ { content, authorId, authorName, createdAt }
//   notices (컬렉션)
//     └ { title, content, authorId, authorName, createdAt }
// =============================================================
import { db, isFirebaseConfigured, functions } from "./firebase";
import { getCurrentUser, splitWorkspaceName } from "./user";
import { deleteAttachedFiles } from "./storageUpload";
import { emptyKwlsAnswers, kwlsLegacyFieldsFromAnswers } from "./kwls";
import { httpsCallable } from "firebase/functions";
import {
  collection,
  addDoc,
  setDoc,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  increment,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  collectionGroup,
} from "firebase/firestore";

// 기본 키워드 — keywords 컬렉션이 비어 있을 때 자동으로 심는 초기값.
// 운영 중 키워드 관리(추가/삭제/순서)는 관리자가 데이터로 수행합니다.
export const DEFAULT_KEYWORDS = [
  "원자와 주기율표",
  "화학 결합",
  "화학 반응식",
  "산과 염기",
  "산화 환원",
  "반응 속도",
  "화학 평형",
  "탄소 화합물",
  "기타",
];
// (하위 호환용 별칭 — 키워드 목록이 아직 로드되기 전 폴백으로 사용)
export const KEYWORDS = DEFAULT_KEYWORDS;

// -------------------------------------------------------------
// 데모 모드용 임시 데이터 (새로고침하면 초기화됩니다)
// -------------------------------------------------------------
const mock = {
  questions: [
    {
      id: "q1",
      title: "이온 결합과 공유 결합이 어떻게 다른가요?",
      content:
        "나트륨과 염소가 결합할 때는 이온 결합, 수소 분자는 공유 결합이라고 배웠는데 전자를 '주고받는 것'과 '공유하는 것'의 차이가 실제로 어떤 성질 차이로 나타나는지 이해가 안 됩니다.",
      keyword: "화학 결합",
      authorId: "sample_turtle",
      authorName: "느긋한 거북이",
      authorEmoji: "🐢",
      authorRealName: "김민준",
      answerCount: 1,
      resolved: true,
      understoodAnswerId: "a1",
      reflection: {
        learned:
          "이온 결합은 전자를 완전히 옮겨 이온이 되고, 공유 결합은 전자쌍을 함께 씁니다. 그래서 이온 결합 물질은 수용액에서 전기가 통하고, 공유 결합 물질은 대부분 통하지 않는다는 게 핵심이었어요.",
        next: "극성 공유 결합과 비극성 공유 결합의 차이도 이어서 정리해 봐야겠어요.",
        authorId: "sample_turtle",
        authorName: "느긋한 거북이",
        authorEmoji: "🐢",
        createdAt: new Date(Date.now() - 1000 * 60 * 80),
      },
      meTooIds: ["user_02", "user_03"],
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
    },
    {
      id: "q2",
      title: "같은 주기에서 원자 반지름이 줄어드는 이유가 뭔가요?",
      content:
        "주기율표에서 같은 주기의 원소는 전자 껍질 수가 같은데, 오른쪽으로 갈수록 원자 반지름이 작아진다고 배웠어요. 양성자가 많아지면 전자를 더 강하게 당기기 때문이라고 하는데, 전자 수도 같이 늘어나는 거 아닌가요?",
      keyword: "원자와 주기율표",
      authorId: "sample_fox",
      authorName: "엉뚱한 여우",
      authorEmoji: "🦊",
      authorRealName: "이서연",
      answerCount: 0,
      resolved: false,
      understoodAnswerId: null,
      meTooIds: [],
      createdAt: new Date(Date.now() - 1000 * 60 * 40),
    },
    {
      id: "q3",
      title: "pH와 pOH를 헷갈리지 않는 방법이 있을까요?",
      content:
        "산성 용액에서 pH가 낮으면 pOH는 높다고 배웠는데, 수용액에서 항상 pH + pOH = 14인 이유를 이해하고 싶어요. 어떻게 생각하면 쉬울까요?",
      keyword: "산과 염기",
      authorId: "sample_otter",
      authorName: "호기심 많은 수달",
      authorEmoji: "🦦",
      authorRealName: "최하준",
      answerCount: 2,
      resolved: false,
      understoodAnswerId: null,
      meTooIds: [
        "sample_01",
        "sample_02",
        "sample_03",
        "sample_04",
        "sample_05",
        "sample_06",
        "sample_07",
        "sample_08",
      ],
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
    {
      id: "q4",
      title: "화학 반응식 계수를 맞추는 체계적인 방법이 있나요?",
      content:
        "C₃H₈ + O₂ → CO₂ + H₂O 같은 반응식에서 계수를 눈대중으로 맞추다 보면 틀리는 경우가 있어요. 빠르고 확실하게 계수를 맞추는 방법이 궁금합니다.",
      keyword: "화학 반응식",
      authorId: "sample_dolphin",
      authorName: "재빠른 돌고래",
      authorEmoji: "🐬",
      authorRealName: "정다은",
      answerCount: 1,
      resolved: false,
      understoodAnswerId: null,
      meTooIds: ["sample_01", "sample_02", "sample_03", "sample_04", "sample_05"],
      createdAt: new Date(Date.now() - 1000 * 60 * 25),
    },
    {
      id: "q5",
      title: "산화수를 구할 때 규칙들이 너무 많아서 헷갈려요",
      content:
        "산화수 규칙이 너무 많아요. 홑원소 물질은 0, 이온은 이온 전하, H는 +1(금속 수소화물은 -1), O는 -2(과산화물은 -1)... 순서대로 적용하는 우선순위가 있나요?",
      keyword: "산화 환원",
      authorId: "sample_panda",
      authorName: "차분한 판다",
      authorEmoji: "🐼",
      authorRealName: "한지민",
      answerCount: 1,
      resolved: false,
      understoodAnswerId: null,
      meTooIds: ["sample_01", "sample_02", "sample_03", "sample_04", "sample_05"],
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
    },
    {
      // "__me__" 표식 — 데모에서 읽는 시점에 현재 접속자(나)의 것으로 치환됩니다.
      id: "q6",
      title: "촉매가 왜 반응 속도를 빠르게 하는지 원리가 궁금해요",
      content:
        "촉매를 넣으면 반응이 빨라지지만 촉매 자신은 변하지 않는다고 배웠어요. 반응물도 생성물도 바뀌지 않는데 왜 속도만 빨라지는 건지 이해가 안 됩니다.",
      keyword: "반응 속도",
      authorId: "__me__",
      authorName: "나",
      authorEmoji: "🙂",
      authorRealName: "나",
      answerCount: 1,
      resolved: true,
      understoodAnswerId: "a6",
      reflection: {
        learned:
          "촉매는 활성화 에너지가 낮은 새로운 반응 경로를 열어 줘서, 같은 온도에서도 더 많은 분자가 그 에너지 장벽을 넘을 수 있게 됩니다. 반응 자체는 그대로지만 경로가 달라지는 거예요.",
        next: "효소가 생물 촉매인 이유도 같은 원리인지 찾아봐야겠어요.",
        authorId: "__me__",
        authorName: "나",
        authorEmoji: "🙂",
        createdAt: new Date(Date.now() - 1000 * 60 * 15),
      },
      meTooIds: ["sample_01", "sample_02"],
      createdAt: new Date(Date.now() - 1000 * 60 * 50),
    },
    {
      id: "q7",
      title: "르샤틀리에 원리를 수학적으로 이해하고 싶어요",
      content:
        "평형 상태에서 농도나 온도를 바꾸면 평형이 이동한다고 배웠는데, '평형을 되찾으려 한다'는 표현이 마치 계가 의도를 가진 것처럼 느껴져서 혼란스럽습니다. 수학적으로 설명해 줄 수 있나요?",
      keyword: "화학 평형",
      authorId: "sample_owl",
      authorName: "진지한 부엉이",
      authorEmoji: "🦉",
      authorRealName: "윤하은",
      answerCount: 1,
      resolved: false,
      understoodAnswerId: null,
      meTooIds: ["sample_03", "sample_04", "sample_05"],
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
    },
    {
      id: "q8",
      title: "탄소 화합물에서 작용기가 왜 중요한가요?",
      content:
        "에탄올, 아세트산, 아세톤을 배웠는데 작용기(-OH, -COOH, -CO-)에 따라 성질이 크게 다르다고 했어요. 이걸 구조식만 보고 직관적으로 파악하는 방법이 있나요?",
      keyword: "탄소 화합물",
      authorId: "sample_penguin",
      authorName: "명랑한 펭귄",
      authorEmoji: "🐧",
      authorRealName: "박지후",
      answerCount: 0,
      resolved: false,
      understoodAnswerId: null,
      meTooIds: ["sample_01", "sample_02", "sample_06"],
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 7),
    },
  ],
  answers: {
    q1: [
      {
        id: "a1",
        content:
          "가장 큰 차이는 '전기 전도성'이에요. 이온 결합 물질(NaCl 등)은 수용액 상태나 용융 상태에서 이온이 자유롭게 이동해 전기가 통하지만, 공유 결합 물질(설탕 등)은 이온이 없어서 전기가 통하지 않아요. 결합이 끊어지는 방식도 달라서 이온 결합은 쪼개지면 이온이 되고, 공유 결합은 분자가 되는 거예요.",
        authorId: "sample_penguin",
        authorName: "명랑한 펭귄",
        authorEmoji: "🐧",
        authorRealName: "박지후",
        createdAt: new Date(Date.now() - 1000 * 60 * 90),
      },
    ],
    q3: [
      {
        id: "a2",
        content:
          "pH + pOH = 14는 수용액에서 [H⁺][OH⁻] = 10⁻¹⁴(Kw)라는 사실에서 나와요. 양쪽에 -log를 취하면 pH + pOH = 14예요. 산성 → [H⁺]↑이면 [OH⁻]↓라 pH가 낮을수록 pOH는 높아지는 거예요.",
        authorId: "sample_penguin",
        authorName: "명랑한 펭귄",
        authorEmoji: "🐧",
        authorRealName: "박지후",
        createdAt: new Date(Date.now() - 1000 * 60 * 55),
      },
      {
        id: "a3",
        content:
          "간단하게 생각하면 수용액 속에서 H⁺와 OH⁻는 항상 같이 있는데, 한쪽이 많아지면 다른 쪽은 그만큼 줄어드는 관계예요. pH 7이 중성인 이유도 이 두 이온의 농도가 딱 같아질 때이기 때문이에요.",
        authorId: "sample_turtle",
        authorName: "느긋한 거북이",
        authorEmoji: "🐢",
        authorRealName: "김민준",
        createdAt: new Date(Date.now() - 1000 * 60 * 35),
      },
    ],
    q4: [
      {
        id: "a4",
        content:
          "탄소 포함 반응식은 C→CO₂, H→H₂O 순서로 먼저 맞추고 O를 마지막에 조정하는 게 빨라요. C₃H₈ + O₂ → CO₂ + H₂O 에서 C 3개 → CO₂ 3, H 8개 → H₂O 4, 그러면 O 오른쪽 = 6+4=10 → O₂ 5개. 완성: C₃H₈ + 5O₂ → 3CO₂ + 4H₂O",
        authorId: "sample_fox",
        authorName: "엉뚱한 여우",
        authorEmoji: "🦊",
        authorRealName: "이서연",
        createdAt: new Date(Date.now() - 1000 * 60 * 12),
      },
    ],
    q5: [
      {
        id: "a5",
        content:
          "우선순위는 다음과 같아요: ①홑원소=0 ②단원자 이온=이온전하 ③화합물에서 F=-1, O=-2(과산화물 제외), H=+1(금속수소화물 제외) ④나머지는 화합물 전체 전하합=0 조건으로 구해요. '전체 합이 0이 되어야 한다'는 원칙을 먼저 적용하면 복잡한 것도 풀려요.",
        authorId: "sample_dolphin",
        authorName: "재빠른 돌고래",
        authorEmoji: "🐬",
        authorRealName: "정다은",
        createdAt: new Date(Date.now() - 1000 * 60 * 150),
      },
    ],
    q6: [
      {
        id: "a6",
        content:
          "촉매는 활성화 에너지가 더 낮은 새로운 경로를 만들어요. 산이 에스터화 반응의 촉매인 경우처럼, 없으면 직접 충돌해야 하는 높은 에너지 장벽을 중간 단계로 쪼개 주는 거예요. 전체 에너지는 똑같지만 경로를 바꿔 뛰어넘기 쉽게 만드는 역할이에요.",
        authorId: "sample_owl",
        authorName: "진지한 부엉이",
        authorEmoji: "🦉",
        authorRealName: "윤하은",
        createdAt: new Date(Date.now() - 1000 * 60 * 30),
      },
    ],
    q7: [
      {
        id: "a7",
        content:
          "르샤틀리에 원리는 의도가 아니라 Kc 식에서 나오는 수학적 결과예요. 평형 상수 Kc = [생성물]/[반응물]이 정해져 있는데, 농도가 바뀌면 반응 지수 Qc가 Kc와 달라져요. Q < Kc면 정반응, Q > Kc면 역반응이 우세해지고, 그 결과가 겉보기에는 '균형을 되찾으려는 것'처럼 보이는 거예요.",
        authorId: "sample_panda",
        authorName: "차분한 판다",
        authorEmoji: "🐼",
        authorRealName: "한지민",
        createdAt: new Date(Date.now() - 1000 * 60 * 200),
      },
    ],
  },
  notices: [
    {
      id: "n1",
      title: "질문 게시판 이용 안내",
      content:
        "화학 주제별 키워드를 선택해서 질문을 올려 주세요. 이해된 내용은 한 줄 정리(인사이트)로 남겨 두면 나중에 복습할 때 도움이 됩니다.",
      authorId: "teacher_01",
      authorName: "선생님",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    },
    {
      id: "n2",
      title: "중간고사 범위 안내",
      content: "시험 범위: 원자와 주기율표, 화학 결합, 화학 반응식. 궁금한 내용은 게시판에 올려 주세요.",
      authorId: "teacher_01",
      authorName: "선생님",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
    },
  ],
  // 반(클래스) — 공부방은 반별 공간입니다. 학생은 입장 코드로 들어옵니다.
  // 질문 게시판은 전체 공유 공간이라 반과 무관합니다.
  classes: [
    {
      id: "cl1",
      name: "3학년 1반",
      joinCode: "MATH31",
      createdBy: "user_01",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
    },
    {
      id: "cl2",
      name: "3학년 2반",
      joinCode: "INFO32",
      createdBy: "user_01",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 36),
    },
    {
      id: "cl3",
      name: "3학년 3반",
      joinCode: "BOND33",
      createdBy: "user_01",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12),
    },
  ],
  // 공부방 — 수업 보드(컬럼). type: 'notice'(수업 안내, 교사 전용) | 'student'(학생 보드)
  // classId로 반에 속합니다.
  studyBoards: [
    // cl1 — 3학년 1반
    {
      id: "b1",
      classId: "cl1",
      title: "수업 안내",
      type: "notice",
      description: "이번 수업의 자료와 안내 사항입니다.",
      viewMode: "shared",
      editMode: "open",
      keywords: [],
      order: 0,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      createdBy: "teacher_01",
    },
    {
      id: "b2",
      classId: "cl1",
      title: "원자 모형 탐구",
      type: "student",
      description:
        "여러 원자 모형(톰슨·러더퍼드·보어·현대)의 변천을 정리하고, 각 모형이 설명하지 못했던 점을 중심으로 카드에 담아 보세요.",
      viewMode: "private",
      editMode: "open",
      keywords: ["원자와 주기율표"],
      order: 1,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6),
      createdBy: "teacher_01",
    },
    {
      id: "b3",
      classId: "cl1",
      title: "이온 결합 모형 만들기",
      type: "student",
      description:
        "NaCl, MgO 등 이온 결합 물질을 예시로 들어, 전자 이동 과정과 이온 결합의 특징을 그림이나 글로 표현해 보세요.",
      viewMode: "shared",
      editMode: "open",
      keywords: ["화학 결합"],
      order: 2,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
      createdBy: "teacher_01",
    },
    // cl2 — 3학년 2반
    {
      id: "b4",
      classId: "cl2",
      title: "수업 안내",
      type: "notice",
      description: "3학년 2반 수업 자료와 안내 사항입니다.",
      viewMode: "shared",
      editMode: "open",
      keywords: [],
      order: 0,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20),
      createdBy: "teacher_01",
    },
    {
      id: "b5",
      classId: "cl2",
      title: "중화 반응 실험 정리",
      type: "student",
      description:
        "HCl + NaOH 중화 반응 실험 결과를 정리하고, 중화점에서의 변화와 이온 수 변화를 카드에 담아 보세요.",
      viewMode: "private",
      editMode: "open",
      keywords: ["산과 염기"],
      order: 1,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
      createdBy: "teacher_01",
    },
    {
      id: "b6",
      classId: "cl2",
      title: "반응 속도 탐구",
      type: "student",
      description:
        "농도·온도·촉매 중 하나를 골라 반응 속도에 미치는 영향을 실험 설계나 자료 해석으로 정리해 보세요.",
      viewMode: "shared",
      editMode: "open",
      keywords: ["반응 속도"],
      order: 2,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
      createdBy: "teacher_01",
    },
    // cl3 — 3학년 3반
    {
      id: "b7",
      classId: "cl3",
      title: "수업 안내",
      type: "notice",
      description: "3학년 3반 수업 자료와 안내 사항입니다.",
      viewMode: "shared",
      editMode: "open",
      keywords: [],
      order: 0,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 10),
      createdBy: "teacher_01",
    },
    {
      id: "b8",
      classId: "cl3",
      title: "산화 환원 전지 탐구",
      type: "student",
      description:
        "다니엘 전지를 바탕으로 산화 전극과 환원 전극에서 일어나는 반응을 반쪽 반응식으로 정리해 보세요.",
      viewMode: "private",
      editMode: "open",
      keywords: ["산화 환원"],
      order: 1,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8),
      createdBy: "teacher_01",
    },
    {
      id: "b9",
      classId: "cl3",
      title: "화학 반응식 계수 맞추기",
      type: "student",
      description:
        "탄소 화합물이나 연소 반응 중 하나를 골라 화학 반응식 계수를 단계별로 맞추는 과정을 카드로 남겨 보세요.",
      viewMode: "shared",
      editMode: "open",
      keywords: ["화학 반응식"],
      order: 2,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6),
      createdBy: "teacher_01",
    },
  ],
  // 공부방 카드 — boardId로 보드에 속합니다. 학생은 보드당 카드 1개.
  studyCards: [
    // b1 — cl1 수업 안내
    {
      id: "c1",
      boardId: "b1",
      content:
        "<p>오늘 수업 자료입니다. 교과서 112~117쪽(원자의 구조와 보어 모형)을 함께 봅니다. 활동 보드에 각자 탐구 정리 카드를 올려 주세요.</p>",
      imageUrl: null,
      authorId: "teacher_01",
      authorName: "선생님",
      authorEmoji: "🧑‍🏫",
      authorRealName: "선생님",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    },
    // b2 — cl1 원자 모형 탐구
    {
      id: "c2",
      boardId: "b2",
      title: "보어 모형까지의 원자 모형 변천",
      content:
        "<p>보어 모형까지의 변천을 정리했어요. 톰슨의 건포도 모형은 전자 위치를 설명 못 했고, 러더퍼드는 궤도 붕괴 문제가 있었는데 보어가 '특정 에너지 준위만 가능'하다는 조건으로 해결했어요.</p>",
      imageUrl: null,
      authorId: "sample_dolphin",
      authorName: "재빠른 돌고래",
      authorEmoji: "🐬",
      authorRealName: "정다은",
      authorStudentId: "30103",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
    {
      // 데모에서 읽는 시점에 현재 접속자(나)의 것으로 치환됩니다.
      id: "c3",
      boardId: "b2",
      title: "현대 원자 모형과 확률 분포",
      content:
        "<p>현대 원자 모형에서는 전자의 정확한 위치 대신 '확률 분포'로 나타낸다는 점이 인상적이었어요. 전자구름이 진할수록 그 위치에서 전자를 발견할 확률이 높다는 것!</p>",
      authorId: "__me__",
      authorName: "나",
      authorEmoji: "🙂",
      authorRealName: "나",
      authorStudentId: "__me__",
      imageUrl: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 40),
    },
    {
      id: "c4",
      boardId: "b2",
      title: "주기율표에서 원자 반지름 변화",
      content:
        "<p>주기율표에서 같은 주기는 전자 껍질 수가 같고, 같은 족은 원자가 전자 수가 같아요. 원자 반지름은 같은 주기에서 오른쪽으로 갈수록 핵전하가 커져 전자를 더 강하게 당기므로 작아져요.</p>",
      imageUrl: null,
      authorId: "sample_fox",
      authorName: "엉뚱한 여우",
      authorEmoji: "🦊",
      authorRealName: "이서연",
      authorStudentId: "30102",
      createdAt: new Date(Date.now() - 1000 * 60 * 55),
    },
    // b3 — cl1 이온 결합 모형 만들기
    {
      id: "c5",
      boardId: "b3",
      title: "NaCl 이온 결합 모형 분석",
      content:
        "<p>NaCl 이온 결합을 그려봤어요. Na는 전자 1개를 내주어 Na⁺, Cl은 전자 1개를 받아 Cl⁻가 되고, 반대 전하끼리 당기는 정전기적 인력으로 결합이 이뤄져요. 녹으면 이온이 자유롭게 움직여 전기가 통합니다.</p>",
      imageUrl: null,
      authorId: "sample_penguin",
      authorName: "명랑한 펭귄",
      authorEmoji: "🐧",
      authorRealName: "박지후",
      authorStudentId: "30104",
      createdAt: new Date(Date.now() - 1000 * 60 * 50),
    },
    {
      id: "c6",
      boardId: "b3",
      title: "MgO 이온 결합과 결합 에너지",
      content:
        "<p>MgO의 경우 Mg²⁺와 O²⁻가 결합해요. 이온 전하가 크면 결합 에너지도 커서 녹는점이 NaCl보다 훨씬 높아요. 이온 결합의 세기는 이온의 전하량과 거리에 비례한다는 게 핵심이에요.</p>",
      imageUrl: null,
      authorId: "sample_turtle",
      authorName: "느긋한 거북이",
      authorEmoji: "🐢",
      authorRealName: "김민준",
      authorStudentId: "30101",
      createdAt: new Date(Date.now() - 1000 * 60 * 70),
    },
    // b4 — cl2 수업 안내
    {
      id: "c7",
      boardId: "b4",
      content:
        "<p>3학년 2반 수업 안내입니다. 오늘은 중화 반응 실험을 진행합니다. 실험 후 결과를 '중화 반응 실험 정리' 보드에 카드로 올려 주세요. BTB 용액 색 변화를 꼭 기록해 두세요.</p>",
      imageUrl: null,
      authorId: "teacher_01",
      authorName: "선생님",
      authorEmoji: "🧑‍🏫",
      authorRealName: "선생님",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20),
    },
    // b5 — cl2 중화 반응 실험 정리
    {
      id: "c8",
      boardId: "b5",
      title: "중화 반응 실험 결과 정리",
      content:
        "<p>0.1M HCl 20mL에 0.1M NaOH를 20mL 넣었을 때 BTB가 노랑→초록이 됐어요. 중화점에서 H⁺와 OH⁻가 1:1로 반응해 물이 되고, Na⁺와 Cl⁻는 그대로 남아요. pH가 정확히 7이 됐어요.</p>",
      imageUrl: null,
      authorId: "sample_otter",
      authorName: "호기심 많은 수달",
      authorEmoji: "🦦",
      authorRealName: "최하준",
      authorStudentId: "30201",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
    },
    {
      id: "c9",
      boardId: "b5",
      title: "중화 반응 그래프 분석",
      content:
        "<p>중화 반응 그래프를 그려봤어요. 중화점 전에는 Cl⁻와 Na⁺가 같이 늘고, 중화점에서 H⁺=0이 됩니다. 중화점 이후 OH⁻가 남기 시작해요. NaOH를 과량으로 넣으면 염기성이 되는 이유가 이거예요.</p>",
      imageUrl: null,
      authorId: "sample_panda",
      authorName: "차분한 판다",
      authorEmoji: "🐼",
      authorRealName: "한지민",
      authorStudentId: "30202",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
    // b6 — cl2 반응 속도 탐구
    {
      id: "c10",
      boardId: "b6",
      title: "온도와 반응 속도 관계",
      content:
        "<p>온도와 반응 속도 관계를 정리했어요. 온도를 올리면 분자들의 평균 운동 에너지가 증가해서, 활성화 에너지 이상의 에너지를 가진 분자 비율이 늘어나요. 10°C 오를 때마다 반응 속도가 약 2배가 된다는 반응 속도 이배 규칙을 실험으로 확인했어요.</p>",
      imageUrl: null,
      authorId: "sample_turtle",
      authorName: "느긋한 거북이",
      authorEmoji: "🐢",
      authorRealName: "김민준",
      authorStudentId: "30203",
      createdAt: new Date(Date.now() - 1000 * 60 * 90),
    },
    {
      id: "c11",
      boardId: "b6",
      title: "농도와 반응 속도 관계",
      content:
        "<p>농도와 반응 속도: 농도가 높아지면 단위 부피 안에 반응물 분자 수가 많아져 유효 충돌 횟수가 늘어나요. 묽은 HCl보다 진한 HCl이 마그네슘과 훨씬 빠르게 반응하는 것도 이 이유예요.</p>",
      imageUrl: null,
      authorId: "sample_dolphin",
      authorName: "재빠른 돌고래",
      authorEmoji: "🐬",
      authorRealName: "정다은",
      authorStudentId: "30204",
      createdAt: new Date(Date.now() - 1000 * 60 * 75),
    },
    // b7 — cl3 수업 안내
    {
      id: "c12",
      boardId: "b7",
      content:
        "<p>3학년 3반 수업 안내입니다. 이번 주는 산화 환원 반응과 전기 화학을 다룹니다. 다니엘 전지 원리를 먼저 이해하고, 모둠별로 탐구 결과를 카드에 올려 주세요.</p>",
      imageUrl: null,
      authorId: "teacher_01",
      authorName: "선생님",
      authorEmoji: "🧑‍🏫",
      authorRealName: "선생님",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 10),
    },
    // b8 — cl3 산화 환원 전지 탐구
    {
      id: "c13",
      boardId: "b8",
      title: "다니엘 전지 반쪽 반응식 정리",
      content:
        "<p>다니엘 전지 정리: 아연(Zn) 전극에서 Zn → Zn²⁺ + 2e⁻ (산화, 음극), 구리(Cu²⁺) 전극에서 Cu²⁺ + 2e⁻ → Cu (환원, 양극). 전자는 도선을 통해 음극→양극으로 이동하고, 이온은 염다리를 통해 이동해 전하 균형을 맞춰요.</p>",
      imageUrl: null,
      authorId: "sample_owl",
      authorName: "진지한 부엉이",
      authorEmoji: "🦉",
      authorRealName: "윤하은",
      authorStudentId: "30301",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
    },
    {
      id: "c14",
      boardId: "b8",
      title: "전지 기전력의 원리",
      content:
        "<p>전지 전압(기전력)이 왜 생기는지 이해했어요. 아연이 구리보다 표준 환원 전위가 낮아서 전자를 더 쉽게 내놓으려 해요. 이 전위 차이가 전압이 되는 거예요. 표준 전극 전위표를 쓰면 어느 금속이 산화될지 바로 알 수 있어요.</p>",
      imageUrl: null,
      authorId: "sample_penguin",
      authorName: "명랑한 펭귄",
      authorEmoji: "🐧",
      authorRealName: "박지후",
      authorStudentId: "30302",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
    },
    // b9 — cl3 화학 반응식 계수 맞추기
    {
      id: "c15",
      boardId: "b9",
      title: "에탄올 연소 반응식 계수 맞추기",
      content:
        "<p>에탄올 연소 반응식 계수 맞추기: C₂H₅OH + O₂ → CO₂ + H₂O. 단계: ①C:2개→CO₂ 2개 ②H:6개→H₂O 3개 ③O 오른쪽=4+3=7, O₂는 3.5개→분수 제거해 전체 ×2: 2C₂H₅OH + 6O₂ → 4CO₂ + 6H₂O</p>",
      imageUrl: null,
      authorId: "sample_otter",
      authorName: "호기심 많은 수달",
      authorEmoji: "🦦",
      authorRealName: "최하준",
      authorStudentId: "30303",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
    {
      id: "c16",
      boardId: "b9",
      title: "메테인 연소 반응식 계수 맞추기",
      content:
        "<p>메테인 연소 CH₄ + 2O₂ → CO₂ + 2H₂O 를 단계별로: C 1→CO₂ 1, H 4→H₂O 2, O 오른쪽=2+2=4→O₂ 2개. 탄소와 수소부터 맞추고 산소를 나중에 조정하는 순서를 쓰면 거의 모든 연소 반응식을 빠르게 풀 수 있어요.</p>",
      imageUrl: null,
      authorId: "sample_fox",
      authorName: "엉뚱한 여우",
      authorEmoji: "🦊",
      authorRealName: "이서연",
      authorStudentId: "30304",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 1),
    },
  ],
  // KWL 항목 — 수업 단위(classId + userId + date)로 1개
  kwl: [],
  attendanceRecords: [],
  seatLayouts: [],
  groupAssignments: [],
};

// 데모 모드 키워드 (id + 이름 + 순서)
mock.keywords = DEFAULT_KEYWORDS.map((name, i) => ({
  id: `k${i}`,
  name,
  order: i,
}));
// 데모 KWL 기록 — 교사 대시보드에서 학생별 KWL 조회를 미리 볼 수 있게
// 샘플 학생 몇 명에게 최근 며칠치 항목을 심어 둡니다(데모 모드 전용).
const _kwlDate = (back) => {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
mock.kwl = [
  { id: "kwl_s1", classId: "cl1", userId: "sample_turtle", date: _kwlDate(3), K: "이온 결합을 배웠다", W: "공유 결합과 무엇이 다를까?", L: "전자를 주고받으면 이온, 함께 쓰면 공유 결합이다.", S: "금속 결합은 어떻게 다를까?", answers: { know: "이온 결합을 배웠다", want: "공유 결합과 무엇이 다를까?", learned: "전자를 주고받으면 이온, 함께 쓰면 공유 결합이다.", still: "금속 결합은 어떻게 다를까?" }, authorName: "느긋한 거북이", authorEmoji: "🐢", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 70) },
  { id: "kwl_s2", classId: "cl1", userId: "sample_turtle", date: _kwlDate(1), K: "산은 H+를 낸다", W: "중화 반응은 어떤 비율로 일어날까?", L: "산과 염기가 반응하면 물과 염이 생긴다.", S: "약산과 강산의 차이가 더 궁금하다.", answers: { know: "산은 H+를 낸다", want: "중화 반응은 어떤 비율로 일어날까?", learned: "산과 염기가 반응하면 물과 염이 생긴다.", still: "약산과 강산의 차이가 더 궁금하다." }, authorName: "느긋한 거북이", authorEmoji: "🐢", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26) },
  { id: "kwl_s3", classId: "cl1", userId: "sample_fox", date: _kwlDate(2), K: "원소 기호 몇 개", W: "주기율표 규칙이 궁금", L: "같은 족은 성질이 비슷하다.", S: "전이 금속은 왜 성질이 다양할까?", answers: { know: "원소 기호 몇 개", want: "주기율표 규칙이 궁금", learned: "같은 족은 성질이 비슷하다.", still: "전이 금속은 왜 성질이 다양할까?" }, authorName: "재빠른 여우", authorEmoji: "🦊", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48) },
];

let mockSeq = 1;
const mockListeners = {
  questions: new Set(),
  notices: new Set(),
  keywords: new Set(),
  answers: new Map(), // questionId -> Set(callback)
  classes: new Set(),
  studyBoards: new Set(),
  studyCards: new Map(), // boardId -> Set(callback)
  kwl: new Map(),        // `${classId}_${date}` | `${classId}_*` -> Set(callback)
  questionSignals: new Map(), // classId -> Set(callback)
  attendanceRecords: new Map(), // classId -> Set(callback)
  seatLayouts: new Map(), // `${classId}_${layoutId}` -> Set(callback)
  groupAssignments: new Map(), // classId -> Set(callback)
};

function notify(set, data) {
  set.forEach((cb) => cb([...data]));
}

// 데모 전용 — authorId가 "__me__"인 샘플을 현재 접속자(나)의 것으로 치환합니다.
// 세션마다 uid가 랜덤이라 정적 데이터에 고정할 수 없어, 읽는 시점에 입혀 줍니다.
// (서버 렌더링 중에는 접속자 정보가 없으므로 그대로 둡니다.)
function personalizeDemo(list) {
  if (typeof window === "undefined") return list;
  const me = getCurrentUser();
  return list.map((q) => {
    if (q.authorId !== "__me__") return q;
    const mine = {
      ...q,
      authorId: me.uid,
      authorName: me.displayName,
      authorEmoji: me.emoji,
      authorRealName: me.realName,
    };
    if (q.reflection && q.reflection.authorId === "__me__") {
      mine.reflection = {
        ...q.reflection,
        authorId: me.uid,
        authorName: me.displayName,
        authorEmoji: me.emoji,
      };
    }
    return mine;
  });
}

// 질문 목록 구독자에게 알림 — 데모에서는 "내 것" 샘플을 접속자 기준으로 치환
function notifyQuestions() {
  notify(
    mockListeners.questions,
    personalizeDemo(sortByNewest(mock.questions))
  );
}

// 데모 전용 — 공부방 카드의 "__me__" 표식을 현재 접속자(나)의 것으로 치환합니다.
function personalizeCards(list) {
  if (typeof window === "undefined") return list;
  const me = getCurrentUser();
  return list.map((c) =>
    c.authorId === "__me__"
      ? {
          ...c,
          authorId: me.uid,
          authorName: me.displayName,
          authorEmoji: me.emoji,
          authorRealName: me.realName,
          authorStudentId: me.studentId ?? null,
        }
      : c
  );
}

function sortByNewest(arr) {
  return [...arr].sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt));
}

function sortByOldest(arr) {
  return [...arr].sort((a, b) => toDate(a.createdAt) - toDate(b.createdAt));
}

// Firestore Timestamp와 일반 Date를 모두 Date로 변환
export function toDate(value) {
  if (!value) return new Date();
  if (typeof value.toDate === "function") return value.toDate();
  return value instanceof Date ? value : new Date(value);
}

// -------------------------------------------------------------
// 키워드 (Keywords) — 관리자 기능 대비 데이터 구조
// -------------------------------------------------------------
// keywords 컬렉션: { name, order }
// order 값으로 정렬하므로 드래그 앤 드롭 순서 변경은 order만
// 바꾸면 됩니다. 아래 CRUD 함수들은 데이터 계층만 미리 준비해
// 둔 것으로, 관리자 UI는 나중에 붙입니다.

// 키워드 목록 실시간 구독 ({id, name, order} 배열 전달)
export function subscribeKeywords(callback) {
  if (isFirebaseConfigured) {
    const q = query(collection(db, "keywords"), orderBy("order", "asc"));
    return onSnapshot(q, (snap) => {
      if (snap.empty) {
        // 컬렉션이 비어 있으면 기본 키워드를 한 번 심습니다
        seedDefaultKeywords();
        return;
      }
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  mockListeners.keywords.add(callback);
  callback([...mock.keywords].sort((a, b) => a.order - b.order));
  return () => mockListeners.keywords.delete(callback);
}

let keywordsSeeded = false;
async function seedDefaultKeywords() {
  if (keywordsSeeded) return;
  keywordsSeeded = true;
  try {
    // keywords 컬렉션이 "비어 있음"은 두 가지 경우를 구분 못 합니다:
    //  1) 앱을 처음 써서 한 번도 시드한 적이 없음 → 기본값을 심어야 함
    //  2) 교사가 키워드를 전부(마지막 "기타"까지) 의도적으로 지움
    //     → 다시 심으면 안 됨(지워도 곧바로 되살아나는 것처럼 보임)
    // meta/keywordsSeeded 문서로 "한 번이라도 시드했는지"를 영구 기록해
    // 구분합니다. 문서가 있으면(과거에 시드됨) 다시 심지 않습니다.
    const flagRef = doc(db, "meta", "keywordsSeeded");
    const flagSnap = await getDoc(flagRef);
    if (flagSnap.exists()) return;

    // 규칙상 생성은 교사만 가능 — 학생이 먼저 접속하면 권한 거부가 납니다.
    // 그 경우 화면은 클라이언트 DEFAULT_KEYWORDS 폴백으로 채워지고,
    // 교사가 로그인하면 이때 실제로 시드됩니다(재시도 위해 플래그 해제).
    await Promise.all([
      ...DEFAULT_KEYWORDS.map((name, i) =>
        addDoc(collection(db, "keywords"), { name, order: i })
      ),
      setDoc(flagRef, { seededAt: serverTimestamp() }),
    ]);
  } catch (e) {
    keywordsSeeded = false;
    console.warn("[keywords] 기본 시드 보류(교사 로그인 시 생성):", e?.message);
  }
}

function notifyKeywords() {
  notify(
    mockListeners.keywords,
    [...mock.keywords].sort((a, b) => a.order - b.order)
  );
}

// [관리자] 키워드 추가 (맨 뒤 순서로)
export async function addKeyword(name) {
  if (isFirebaseConfigured) {
    await addDoc(collection(db, "keywords"), {
      name,
      order: Date.now(), // 충분히 큰 값 → 맨 뒤
    });
    return;
  }
  const maxOrder = Math.max(0, ...mock.keywords.map((k) => k.order));
  mock.keywords.push({ id: `k${++mockSeq}_m`, name, order: maxOrder + 1 });
  notifyKeywords();
}

// [관리자] 키워드 이름 변경
export async function renameKeyword(id, name) {
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "keywords", id), { name });
    return;
  }
  const k = mock.keywords.find((x) => x.id === id);
  if (k) k.name = name;
  notifyKeywords();
}

// [관리자] 키워드 삭제 (기존 질문의 키워드 문자열은 그대로 남습니다)
export async function deleteKeyword(id) {
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "keywords", id));
    return;
  }
  mock.keywords = mock.keywords.filter((x) => x.id !== id);
  notifyKeywords();
}

// [관리자] 순서 일괄 변경 — 드래그 앤 드롭 결과(id 배열)를 그대로 전달
export async function reorderKeywords(orderedIds) {
  if (isFirebaseConfigured) {
    await Promise.all(
      orderedIds.map((id, i) => updateDoc(doc(db, "keywords", id), { order: i }))
    );
    return;
  }
  orderedIds.forEach((id, i) => {
    const k = mock.keywords.find((x) => x.id === id);
    if (k) k.order = i;
  });
  notifyKeywords();
}

// -------------------------------------------------------------
// 질문 (Questions)
// -------------------------------------------------------------

// 질문 목록 실시간 구독. 해제 함수(unsubscribe)를 반환합니다.
export function subscribeQuestions(callback) {
  if (isFirebaseConfigured) {
    const q = query(collection(db, "questions"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  mockListeners.questions.add(callback);
  callback(personalizeDemo(sortByNewest(mock.questions)));
  return () => mockListeners.questions.delete(callback);
}

// 질문 등록. user는 { uid, displayName } 형태입니다.
// imageUrl: 첨부 이미지(data URL, 선택). Firestore 문서 1MB 제한이 있어
// 작성 폼에서 압축해 저장합니다. 원본이 필요하면 Firebase Storage 권장.
export async function addQuestion(user, { title, content, keyword, imageUrl, images }) {
  const data = {
    title,
    content,
    keyword,
    imageUrl: imageUrl ?? null, // 구버전 단일 이미지(하위호환)
    images: images ?? [], // 다중 이미지(URL 배열)

    authorId: user.uid, // ← 사용자별 구분 키
    authorName: user.displayName, // 익명 닉네임
    authorEmoji: user.emoji ?? null, // 프로필 아바타 이모지
    // 실명·이메일 등 식별 정보는 게시물에 넣지 않습니다(모든 학생이 읽으므로).
    // 교사는 users/{uid}를 조회하는 사용자 디렉터리(subscribeUserDirectory)로 확인합니다.
    answerCount: 0,
    resolved: false, // 궁금해요(false) / 해결됐어요(true)
    understoodAnswerId: null, // 질문자가 "이해됐어요"로 표시한 답변 id
    meTooIds: [], // "나도 궁금해요"를 누른 사용자 uid 목록
  };
  if (isFirebaseConfigured) {
    await addDoc(collection(db, "questions"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return;
  }
  mock.questions.push({ id: `q${++mockSeq}_m`, ...data, createdAt: new Date() });
  notifyQuestions();
}

// 질문 내용 수정 — 작성자 본인만 호출하도록 화면에서 막습니다.
// (운영 시에는 Firestore 보안 규칙으로 authorId == request.auth.uid 검사)
export async function updateQuestion(
  questionId,
  { title, content, keyword, imageUrl, images }
) {
  const patch = { title, content, keyword, imageUrl: imageUrl ?? null };
  if (images !== undefined) patch.images = images ?? [];
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "questions", questionId), patch);
    return;
  }
  const target = mock.questions.find((q) => q.id === questionId);
  if (target) Object.assign(target, patch);
  notifyQuestions();
}

// 질문 삭제 — 답변 서브컬렉션과 첨부된 이미지·파일(Storage)도 함께 삭제합니다.
export async function deleteQuestion(questionId) {
  if (isFirebaseConfigured) {
    const qRef = doc(db, "questions", questionId);
    const [qSnap, answersSnap] = await Promise.all([
      getDoc(qRef),
      getDocs(collection(db, "questions", questionId, "answers")),
    ]);
    await Promise.all([
      deleteAttachedFiles(qSnap.data()),
      ...answersSnap.docs.map((d) => deleteAttachedFiles(d.data())),
    ]);
    await Promise.all(answersSnap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(qRef);
    return;
  }
  mock.questions = mock.questions.filter((q) => q.id !== questionId);
  delete mock.answers[questionId];
  notifyQuestions();
}

// 질문 해결 상태 전환 (궁금해요 ↔ 해결됐어요)
// resolved=false 로 되돌릴 때는 reflectionPending과 understoodAnswerId를 함께 초기화합니다.
export async function setQuestionResolved(questionId, resolved) {
  const patch = resolved
    ? { resolved: true }
    : { resolved: false, reflectionPending: false, understoodAnswerId: null };
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "questions", questionId), patch);
    return;
  }
  const target = mock.questions.find((q) => q.id === questionId);
  if (target) {
    Object.assign(target, patch);
  }
  notifyQuestions();
}

// "나중에 쓸게요" — 해결은 되지만 인사이트를 미룬 상태로 표시합니다.
// understoodAnswerId를 함께 넘기면(이해됐어요 경로) 그 답변도 같이 저장합니다.
export async function setQuestionResolvedLater(questionId, understoodAnswerId = null) {
  const patch = {
    resolved: true,
    reflectionPending: true,
    understoodAnswerId: understoodAnswerId ?? null,
  };
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "questions", questionId), patch);
    return;
  }
  const target = mock.questions.find((q) => q.id === questionId);
  if (target) Object.assign(target, patch);
  notifyQuestions();
}

// 한 줄 정리(인사이트) 저장 — "이해의 전환점"을 내 언어로 남기는 생성적 인사이트.
// 저장하면 reflectionPending이 해제되고 질문 상세에 모두에게 공개됩니다.
// understoodAnswerId를 함께 넘기면 "이해됐어요" 답변 표시도 함께 확정됩니다.
export async function addReflection(user, questionId, { learned, next }, understoodAnswerId = null) {
  const reflection = {
    learned: learned ?? "",
    next: next ?? "",
    authorId: user.uid,
    authorName: user.displayName,
    authorEmoji: user.emoji ?? null,
  };
  // 이해됐어요 경로면 understoodAnswerId + resolved도 함께 확정합니다.
  const understoodPatch = understoodAnswerId
    ? { understoodAnswerId, resolved: true }
    : {};
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "questions", questionId), {
      reflection: { ...reflection, createdAt: serverTimestamp() },
      reflectionPending: false,
      ...understoodPatch,
    });
    return;
  }
  const target = mock.questions.find((q) => q.id === questionId);
  if (target) {
    target.reflection = { ...reflection, createdAt: new Date() };
    target.reflectionPending = false;
    if (understoodAnswerId) {
      target.understoodAnswerId = understoodAnswerId;
      target.resolved = true;
    }
  }
  notifyQuestions();
}

// 답변 강조 표시: 질문자가 가장 도움이 된 답변에 "이해됐어요"를 남깁니다.
// answerId=null 이면 강조와 해결 상태를 함께 해제합니다.
// 이 함수는 직접 호출하지 않고, ReflectionModal을 통해 addReflection과 함께 씁니다.
// (직접 호출이 필요한 경우는 이해됐어요 토글 OFF 경로뿐입니다.)
export async function setUnderstoodAnswer(questionId, answerId) {
  const patch = {
    understoodAnswerId: answerId ?? null,
    resolved: !!answerId,
    ...(answerId ? {} : { reflectionPending: false }),
  };
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "questions", questionId), patch);
    return;
  }
  const target = mock.questions.find((q) => q.id === questionId);
  if (target) Object.assign(target, patch);
  notifyQuestions();
}

// "나도 궁금해요" 설정/해제
// - on=true  → meTooIds 배열에 uid 추가 (이미 있으면 중복 추가되지 않음)
// - on=false → 배열에서 uid 제거 (다시 눌러 취소)
// 배열 기반이라 같은 사람이 여러 번 눌러도 1회만 집계됩니다.
export async function setMeToo(user, questionId, on) {
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "questions", questionId), {
      meTooIds: on ? arrayUnion(user.uid) : arrayRemove(user.uid),
    });
    return;
  }
  const target = mock.questions.find((q) => q.id === questionId);
  if (target) {
    const ids = new Set(target.meTooIds ?? []);
    if (on) ids.add(user.uid);
    else ids.delete(user.uid);
    target.meTooIds = [...ids];
  }
  notifyQuestions();
}

// -------------------------------------------------------------
// 답변 (Answers) — questions/{questionId}/answers 하위 컬렉션
// -------------------------------------------------------------

export function subscribeAnswers(questionId, callback) {
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "questions", questionId, "answers"),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  if (!mockListeners.answers.has(questionId)) {
    mockListeners.answers.set(questionId, new Set());
  }
  mockListeners.answers.get(questionId).add(callback);
  callback(sortByOldest(mock.answers[questionId] ?? []));
  return () => mockListeners.answers.get(questionId)?.delete(callback);
}

// 답변 등록. content는 서식(HTML) 문자열, images는 첨부 이미지 URL 배열(선택)
export async function addAnswer(user, questionId, content, imageUrl = null, images = []) {
  const data = {
    content,
    imageUrl: imageUrl ?? null, // 구버전 단일 이미지(하위호환)
    images: images ?? [], // 다중 이미지(URL 배열)
    authorId: user.uid, // ← 사용자별 구분 키
    authorName: user.displayName, // 익명 닉네임
    authorEmoji: user.emoji ?? null, // 프로필 아바타 이모지
    // 실명·이메일은 게시물에 저장하지 않음 — 교사는 사용자 디렉터리로 확인
  };
  if (isFirebaseConfigured) {
    await addDoc(collection(db, "questions", questionId, "answers"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    // answerCount는 onAnswerCreated Cloud Function이 서버에서 집계합니다.
    // 클라이언트에서 직접 올리면 Function 배포 후 중복 집계가 되므로 제거했습니다.
    return;
  }
  if (!mock.answers[questionId]) mock.answers[questionId] = [];
  mock.answers[questionId].push({
    id: `a${++mockSeq}_m`,
    ...data,
    createdAt: new Date(),
  });
  const target = mock.questions.find((q) => q.id === questionId);
  if (target) target.answerCount += 1;
  notify(
    mockListeners.answers.get(questionId) ?? new Set(),
    sortByOldest(mock.answers[questionId])
  );
  notifyQuestions();
}

// -------------------------------------------------------------
// 공지사항 (Notices)
// -------------------------------------------------------------

export function subscribeNotices(callback) {
  if (isFirebaseConfigured) {
    const q = query(collection(db, "notices"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  mockListeners.notices.add(callback);
  callback(sortByNewest(mock.notices));
  return () => mockListeners.notices.delete(callback);
}

export async function addNotice(user, { title, content }) {
  const data = {
    title,
    content,
    authorId: user.uid,
    // 공지는 관리자(교사) 전용이므로 익명 닉네임 대신 고정 이름 사용
    authorName: "선생님",
  };
  if (isFirebaseConfigured) {
    await addDoc(collection(db, "notices"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return;
  }
  mock.notices.push({ id: `n${++mockSeq}_m`, ...data, createdAt: new Date() });
  notify(mockListeners.notices, sortByNewest(mock.notices));
}

// [작성자 본인 또는 최고 관리자] 공지 삭제
export async function deleteNotice(noticeId) {
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "notices", noticeId));
    return;
  }
  mock.notices = mock.notices.filter((n) => n.id !== noticeId);
  notify(mockListeners.notices, sortByNewest(mock.notices));
}

// -------------------------------------------------------------
// 반 (Classes) — 공부방의 단위. 학생은 입장 코드로 들어옵니다.
// -------------------------------------------------------------
//   classes (컬렉션)
//     └ { name, joinCode, createdBy, createdAt }
// 질문 게시판은 전체 공유 공간이라 반과 무관합니다.
// -------------------------------------------------------------

// 입장 코드에서 제외하는 글자 — 서로 헷갈리기 쉬운 문자들:
//   O·0 (오/영), I·L·1 (아이/엘/일)
// 남는 문자: A B C D E F G H J K M N P Q R S T U V W X Y Z 2 3 4 5 6 7 8 9 (32자)
const JOIN_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// 헷갈리는 글자를 뺀 입장 코드 1개 생성 (6자리)
function makeJoinCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += JOIN_CODE_CHARS[Math.floor(Math.random() * JOIN_CODE_CHARS.length)];
  }
  return code;
}

// 입장 코드 유효기간(일). 유출된 코드의 수명을 제한합니다.
const CODE_TTL_DAYS = 14;
function codeExpiryFromNow() {
  return new Date(Date.now() + CODE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

// 코드가 이미 쓰이고 있는지 확인.
// 보안: 코드는 joinCodes 컬렉션의 "문서 ID"로 저장합니다(열거 차단 — 규칙에서
// get은 허용하되 list는 교사만). 그래서 정확한 코드를 알아야 1건을 읽을 수 있습니다.
async function joinCodeExists(code) {
  if (isFirebaseConfigured) {
    const snap = await getDoc(doc(db, "joinCodes", code));
    return snap.exists();
  }
  return mock.classes.some((c) => c.joinCode === code);
}

// 기존 코드와 겹치지 않는 입장 코드를 생성합니다(충돌 시 재발급).
async function generateUniqueJoinCode() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeJoinCode();
    if (!(await joinCodeExists(code))) return code;
  }
  return makeJoinCode(); // 확률적으로 거의 불가능
}

function notifyClasses() {
  notify(mockListeners.classes, sortByOldest(mock.classes));
}

// 반 목록 실시간 구독 (만든 순)
export function subscribeClasses(callback) {
  if (isFirebaseConfigured) {
    const q = query(collection(db, "classes"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  mockListeners.classes.add(callback);
  callback(sortByOldest(mock.classes));
  return () => mockListeners.classes.delete(callback);
}

// [교사] 반 만들기 — 입장 코드를 자동 생성해 만든 반을 반환합니다.
// 보안: 코드는 classes 문서가 아니라 joinCodes/{코드} 문서로 저장합니다.
//       (classes를 나열해도 코드가 새지 않음 — 코드 열거 차단)
// 반 생성과 동시에 '선생님 보드'(type: notice, 교사 전용 쓰기)를 항상 함께
// 만듭니다 — 다른 보드보다 먼저 생성되므로 항상 첫 번째 보드가 됩니다.
export async function addClass(user, name) {
  const joinCode = await generateUniqueJoinCode();
  const expiresAt = codeExpiryFromNow();
  if (isFirebaseConfigured) {
    const ref = await addDoc(collection(db, "classes"), {
      name: name.trim(),
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, "joinCodes", joinCode), {
      classId: ref.id,
      createdBy: user.uid,
      expiresAt,
      createdAt: serverTimestamp(),
    });
    await ensureDefaultStudyBoard(user, ref.id);
    return { id: ref.id, name: name.trim(), joinCode, codeExpiresAt: expiresAt };
  }
  // 데모: 단순화를 위해 코드/만료를 클래스 객체에 함께 보관
  const created = {
    id: `cl${++mockSeq}_m`,
    name: name.trim(),
    createdBy: user.uid,
    joinCode,
    codeExpiresAt: expiresAt,
    createdAt: new Date(),
  };
  mock.classes.push(created);
  notifyClasses();
  await ensureDefaultStudyBoard(user, created.id);
  return created;
}

// [교사] 반 이름 수정
export async function renameClass(classId, name) {
  const trimmed = name.trim();
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "classes", classId), { name: trimmed });
    return;
  }
  const cls = mock.classes.find((c) => c.id === classId);
  if (cls) cls.name = trimmed;
  notifyClasses();
}

// [교사] 반 보관 — 목록에서 숨기고, 입장 코드를 폐기해 학생 접근을 차단합니다.
// 데이터(보드·카드·과일 등)는 그대로 남지만, 보안 규칙상 보관 중엔 교사도
// 읽기만 가능하고 쓰기는 막힙니다(보관 해제해야 다시 편집 가능).
export async function archiveClass(classId) {
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "classes", classId), { archived: true });
    const codesSnap = await getDocs(
      query(collection(db, "joinCodes"), where("classId", "==", classId))
    );
    await Promise.all(codesSnap.docs.map((d) => deleteDoc(d.ref)));
    return;
  }
  const cls = mock.classes.find((c) => c.id === classId);
  if (cls) {
    cls.archived = true;
    cls.joinCode = null;
    cls.codeExpiresAt = null;
  }
  notifyClasses();
}

// [교사] 반 보관 해제 — 다시 활성화하고 새 입장 코드를 발급합니다.
export async function unarchiveClass(classId, user) {
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "classes", classId), { archived: false });
  } else {
    const cls = mock.classes.find((c) => c.id === classId);
    if (cls) cls.archived = false;
    notifyClasses();
  }
  await regenerateJoinCode(classId, user);
}

// [교사] 입장 코드 재발급 — 기존 코드를 폐기하고 새 코드+만료일을 만듭니다.
export async function regenerateJoinCode(classId, user) {
  const joinCode = await generateUniqueJoinCode();
  const expiresAt = codeExpiryFromNow();
  if (isFirebaseConfigured) {
    // 한 반에 활성 코드 1개만 유지 — 기존 코드 문서 삭제 후 새로 발급
    const old = await getDocs(
      query(collection(db, "joinCodes"), where("classId", "==", classId))
    );
    await Promise.all(old.docs.map((d) => deleteDoc(d.ref)));
    await setDoc(doc(db, "joinCodes", joinCode), {
      classId,
      createdBy: user.uid,
      expiresAt,
      createdAt: serverTimestamp(),
    });
    return { joinCode, codeExpiresAt: expiresAt };
  }
  const cls = mock.classes.find((c) => c.id === classId);
  if (cls) {
    cls.joinCode = joinCode;
    cls.codeExpiresAt = expiresAt;
  }
  notifyClasses();
  return { joinCode, codeExpiresAt: expiresAt };
}

// [교사] 반별 입장 코드/만료일 구독 — 교사 화면에서 코드 표시·재발급 안내용.
// 반환: { [classId]: { code, expiresAt } }. 규칙상 list는 교사만 허용됩니다.
// ownerUid를 주면 그 교사가 만든 코드만 구독합니다(규칙상 교사는 소유 코드만
// 나열 가능). null이면 전체(최고 관리자 전용).
export function subscribeJoinCodes(callback, ownerUid = null) {
  if (isFirebaseConfigured) {
    const ref = ownerUid
      ? query(collection(db, "joinCodes"), where("createdBy", "==", ownerUid))
      : collection(db, "joinCodes");
    return onSnapshot(
      ref,
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          map[data.classId] = { code: d.id, expiresAt: data.expiresAt ?? null };
        });
        callback(map);
      },
      () => callback({})
    );
  }
  const emit = () => {
    const map = {};
    mock.classes.forEach((c) => {
      if (c.joinCode) map[c.id] = { code: c.joinCode, expiresAt: c.codeExpiresAt ?? null };
    });
    callback(map);
  };
  const wrapper = () => emit();
  mockListeners.classes.add(wrapper);
  emit();
  return () => mockListeners.classes.delete(wrapper);
}

// 입장 코드로 반 찾기 — 학생 입장 화면에서 사용.
// 반환: 없으면 null, 만료면 { id, expired:true }, 정상이면 { id, name, expired:false }.
export async function findClassByCode(code) {
  const norm = code.trim().toUpperCase();
  if (!norm) return null;
  if (isFirebaseConfigured) {
    const snap = await getDoc(doc(db, "joinCodes", norm)); // 정확한 코드로 1건 get
    if (!snap.exists()) return null;
    const { classId, expiresAt } = snap.data();
    if (expiresAt && toDate(expiresAt) < new Date()) return { id: classId, expired: true };
    const classSnap = await getDoc(doc(db, "classes", classId));
    if (!classSnap.exists()) return null;
    return { id: classId, name: classSnap.data().name, expired: false };
  }
  const cls = mock.classes.find((c) => c.joinCode === norm);
  if (!cls) return null;
  if (cls.codeExpiresAt && toDate(cls.codeExpiresAt) < new Date())
    return { id: cls.id, expired: true };
  return { id: cls.id, name: cls.name, expired: false };
}

// -------------------------------------------------------------
//   memberships (서버 소속) — 기기·캐시·코드만료와 무관하게 소속 유지
//     문서 ID = `{uid}_{classId}`,  { uid, classId, joinedAt }
// -------------------------------------------------------------
function ensureMockMemberships() {
  if (!mock.memberships) mock.memberships = [];
  if (!mockListeners.memberships) mockListeners.memberships = new Map();
}
function notifyMemberships(uid) {
  ensureMockMemberships();
  const set = mockListeners.memberships.get(uid);
  if (set) notify(set, mock.memberships.filter((m) => m.uid === uid));
}

// 입장 처리 — 서버에 소속을 기록합니다.
// code(입장 코드)를 함께 보내면 보안 규칙이 코드 유효성·만료를 서버에서 검증합니다.
// (규칙에 update가 없으므로 이미 소속돼 있으면 쓰지 않고 건너뜁니다)
export async function joinClass(classId, user, code = "") {
  if (isFirebaseConfigured) {
    const mRef = doc(db, "memberships", `${user.uid}_${classId}`);
    // 문서가 없으면 규칙 평가(resource.data 접근)가 거부로 떨어지므로 catch → 신규 생성 진행
    const existing = await getDoc(mRef).catch(() => null);
    if (existing?.exists()) return;
    await setDoc(mRef, {
      uid: user.uid,
      classId,
      code: code.trim().toUpperCase(),
      joinedAt: serverTimestamp(),
    });
    return;
  }
  ensureMockMemberships();
  if (!mock.memberships.some((m) => m.uid === user.uid && m.classId === classId)) {
    mock.memberships.push({
      id: `${user.uid}_${classId}`,
      uid: user.uid,
      classId,
      joinedAt: new Date(),
    });
  }
  notifyMemberships(user.uid);
}

// 반 나가기 — 소속 기록을 제거합니다.
export async function leaveClass(uid, classId) {
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "memberships", `${uid}_${classId}`));
    return;
  }
  ensureMockMemberships();
  mock.memberships = mock.memberships.filter(
    (m) => !(m.uid === uid && m.classId === classId)
  );
  notifyMemberships(uid);
}

// 내 소속 반 목록 실시간 구독 — 어느 기기에서 로그인하든 같은 uid로 따라옵니다.
export function subscribeMyMemberships(uid, callback) {
  if (isFirebaseConfigured) {
    const q = query(collection(db, "memberships"), where("uid", "==", uid));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => callback([])
    );
  }
  ensureMockMemberships();
  if (!mockListeners.memberships.has(uid)) mockListeners.memberships.set(uid, new Set());
  mockListeners.memberships.get(uid).add(callback);
  callback(mock.memberships.filter((m) => m.uid === uid));
  return () => mockListeners.memberships.get(uid)?.delete(callback);
}

// [교사] 반 삭제 — 보관된 반만 가능. 반에 속한 보드·카드·입장코드·소속도
// 함께 정리합니다. 보안 규칙상 보관 중엔 자식 문서도 쓰기(삭제 포함)가
// 막히므로 — 그런데 삭제 자체가 자식 문서 삭제를 필요로 하므로 — 서버 함수
// (deleteClass, Admin 권한)가 한 번에 처리합니다.
export async function deleteClass(classId) {
  if (isFirebaseConfigured) {
    try {
      await httpsCallable(functions, "deleteClass")({ classId });
      return;
    } catch (e) {
      const code = e?.code || "";
      const missing = code.includes("not-found") || code.includes("unimplemented");
      if (!missing) throw e;
      console.warn("[deleteClass] 서버 함수를 찾지 못해 예전 경로로 처리합니다:", code);
    }
    // ── 이하 폴백(구 경로) — 함수 배포 후에는 실행되지 않습니다.
    //    (보관 중엔 규칙상 자식 문서 삭제가 막혀 일반 교사는 실패할 수 있음) ──
    // studyBoards는 classes의 서브컬렉션이 아닌 독립 컬렉션이므로 직접 쿼리합니다.
    // 각 보드의 cards 서브컬렉션도 삭제 — Firestore는 자동 정리하지 않습니다.
    const boardsSnap = await getDocs(
      query(collection(db, "studyBoards"), where("classId", "==", classId))
    );
    await Promise.all(
      boardsSnap.docs.map(async (boardDoc) => {
        const cardsSnap = await getDocs(
          collection(db, "studyBoards", boardDoc.id, "cards")
        );
        await Promise.all(cardsSnap.docs.map((d) => deleteAttachedFiles(d.data())));
        await Promise.all(cardsSnap.docs.map((d) => deleteDoc(d.ref)));
        await deleteDoc(boardDoc.ref);
      })
    );
    // 입장 코드·소속 기록도 함께 정리
    const codesSnap = await getDocs(
      query(collection(db, "joinCodes"), where("classId", "==", classId))
    );
    await Promise.all(codesSnap.docs.map((d) => deleteDoc(d.ref)));
    const memSnap = await getDocs(
      query(collection(db, "memberships"), where("classId", "==", classId))
    );
    await Promise.all(memSnap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(db, "classes", classId));
    return;
  }
  const boardIds = mock.studyBoards
    .filter((b) => b.classId === classId)
    .map((b) => b.id);
  mock.studyBoards = mock.studyBoards.filter((b) => b.classId !== classId);
  mock.studyCards = mock.studyCards.filter((c) => !boardIds.includes(c.boardId));
  mock.classes = mock.classes.filter((c) => c.id !== classId);
  if (mock.memberships) mock.memberships = mock.memberships.filter((m) => m.classId !== classId);
  notifyClasses();
  notifyStudyBoards();
  // 삭제된 보드들의 카드 구독자에게도 빈 목록을 알립니다(상태 불일치 방지)
  boardIds.forEach((id) => notifyStudyCards(id));
}

// -------------------------------------------------------------
// 공부방 (Study) — 수업의 연장. 보드(컬럼) + 카드.
// -------------------------------------------------------------
//   studyBoards (컬렉션)
//     └ { title, type('notice'|'student'), description,
//         viewMode('shared'|'private'), editMode('open'|'locked'),
//         keyword(연계 키워드|null), order, createdAt, createdBy }
//   studyCards (컬렉션)
//     └ { boardId, content(HTML), imageUrl, authorId, authorName,
//         authorEmoji, authorRealName, createdAt, updatedAt }
//
// [설계] 학생은 한 보드에 카드 1개만 만듭니다(화면에서 제어).
//   viewMode='private'(기본)면 학생은 자기 카드만, 교사는 전부 봅니다.
//   editMode='locked'면 작성/수정이 막히고 보기 전용이 됩니다.
// -------------------------------------------------------------

function notifyStudyBoards() {
  notify(
    mockListeners.studyBoards,
    [...mock.studyBoards].sort((a, b) => a.order - b.order)
  );
}

function notifyStudyCards(boardId) {
  const list = personalizeCards(
    sortByOldest(mock.studyCards.filter((c) => c.boardId === boardId))
  );
  notify(mockListeners.studyCards.get(boardId) ?? new Set(), list);
  // 내 카드 구독자(리포트)도 갱신
  if (mockListeners.myCards) mockListeners.myCards.forEach((cb) => cb());
}

// 보드 목록 실시간 구독 (order 순)
export function subscribeStudyBoards(callback) {
  if (isFirebaseConfigured) {
    const q = query(collection(db, "studyBoards"), orderBy("order", "asc"));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  mockListeners.studyBoards.add(callback);
  callback([...mock.studyBoards].sort((a, b) => a.order - b.order));
  return () => mockListeners.studyBoards.delete(callback);
}

// 한 보드의 카드 목록 실시간 구독 (오래된 순)
export function subscribeStudyCards(boardId, callback) {
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "studyBoards", boardId, "cards"),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  if (!mockListeners.studyCards.has(boardId)) {
    mockListeners.studyCards.set(boardId, new Set());
  }
  mockListeners.studyCards.get(boardId).add(callback);
  callback(
    personalizeCards(
      sortByOldest(mock.studyCards.filter((c) => c.boardId === boardId))
    )
  );
  return () => mockListeners.studyCards.get(boardId)?.delete(callback);
}

// ── 모둠 활동 보드 ─────────────────────────────────────────────
// 내가 속한 모둠의 카드만 구독 — 규칙상 학생은 memberUids array-contains
// 쿼리로만 모둠 카드를 읽을 수 있음('자기 모둠만' 모드).
export function subscribeMyGroupCards(boardId, uid, callback) {
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "studyBoards", boardId, "cards"),
      where("memberUids", "array-contains", uid)
    );
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => callback([])
    );
  }
  if (!mockListeners.studyCards.has(boardId)) {
    mockListeners.studyCards.set(boardId, new Set());
  }
  const emit = () =>
    callback(
      mock.studyCards.filter(
        (c) => c.boardId === boardId && c.memberUids?.includes(uid)
      )
    );
  mockListeners.studyCards.get(boardId).add(emit);
  emit();
  return () => mockListeners.studyCards.get(boardId)?.delete(emit);
}

// [교사] 모둠 구성 저장 — 모둠 수만큼 카드를 만들고(문서 ID = group_순번),
// 이미 있는 순번의 카드는 작성 내용(제목·본문·첨부)을 유지한 채 모둠
// 명단·이름·대표만 갱신합니다(재구성). 모둠 수가 줄면 남는 카드는
// retired 처리(교사만 표시, 학생 구독에선 제외 — memberUids 비움).
// groups: [{ index(1부터), name, memberUids[], members[{uid,name,emoji}], leaderUid }]
export async function composeStudyGroups(user, boardId, groups, options = {}) {
  const groupSetName = options.groupSetName || groups[0]?.groupSetName || "활동 모둠";
  if (isFirebaseConfigured) {
    const snap = await getDocs(collection(db, "studyBoards", boardId, "cards"));
    const existingGroupCardIds = snap.docs
      .filter((d) => d.data().groupId)
      .map((d) => d.id);
    const batch = writeBatch(db);
    groups.forEach((g) => {
      const id = `group_${g.index}`;
      const ref = doc(db, "studyBoards", boardId, "cards", id);
      // 모둠명은 title(학생도 수정 가능)로 저장. 구성 시 교사가 정한 이름을
      // title에도 반영(재구성 시 편집기에 현재 title을 미리 불러오므로 학생
      // 변경분도 보존됨). groupName은 참고용으로 함께 저장.
      const groupFields = {
        groupId: `g${g.index}`,
        groupIndex: g.index,
        groupName: g.name,
        groupSetName,
        title: g.name,
        memberUids: g.memberUids,
        members: g.members,
        leaderUid: g.leaderUid ?? null,
        retired: false,
        updatedAt: serverTimestamp(),
      };
      if (existingGroupCardIds.includes(id)) {
        batch.set(ref, groupFields, { merge: true }); // 본문·첨부는 유지
      } else {
        batch.set(ref, {
          boardId,
          content: "",
          imageUrl: null,
          attachments: [],
          authorId: user.uid,
          authorName: "선생님",
          authorEmoji: "🧑‍🏫",
          createdAt: serverTimestamp(),
          ...groupFields,
        });
      }
    });
    // 줄어든 순번의 기존 모둠 카드 → 보관(retired)
    existingGroupCardIds.forEach((id) => {
      const idx = Number(id.replace("group_", ""));
      if (!groups.some((g) => g.index === idx)) {
        batch.set(
          doc(db, "studyBoards", boardId, "cards", id),
          { retired: true, memberUids: [], members: [], leaderUid: null, updatedAt: serverTimestamp() },
          { merge: true }
        );
      }
    });
    await batch.commit();
    return;
  }
  // 데모 모드
  groups.forEach((g) => {
    const id = `group_${g.index}`;
    const groupFields = {
      groupId: `g${g.index}`,
      groupIndex: g.index,
      groupName: g.name,
      groupSetName,
      title: g.name,
      memberUids: g.memberUids,
      members: g.members,
      leaderUid: g.leaderUid ?? null,
      retired: false,
    };
    const existing = mock.studyCards.find(
      (c) => c.boardId === boardId && c.id === id
    );
    if (existing) Object.assign(existing, groupFields);
    else
      mock.studyCards.push({
        id,
        boardId,
        title: g.name,
        content: "",
        imageUrl: null,
        attachments: [],
        authorId: user.uid,
        authorName: "선생님",
        authorEmoji: "🧑‍🏫",
        createdAt: new Date(),
        ...groupFields,
      });
  });
  mock.studyCards.forEach((c) => {
    if (
      c.boardId === boardId &&
      c.groupId &&
      !groups.some((g) => `group_${g.index}` === c.id)
    ) {
      Object.assign(c, { retired: true, memberUids: [], members: [], leaderUid: null });
    }
  });
  mockListeners.studyCards.get(boardId)?.forEach((cb) => cb());
}

// 한 보드의 카드 목록을 한 번만 가져옴 (내보내기/다운로드용, 구독 아님)
export async function fetchStudyCardsOnce(boardId) {
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "studyBoards", boardId, "cards"),
      orderBy("createdAt", "asc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return sortByOldest(mock.studyCards.filter((c) => c.boardId === boardId));
}

// 내 공부방 카드 전체 구독 — 학생 리포트에서 "내가 낸 카드"만 모읍니다.
// (모든 보드의 카드를 구독하면 반 격리 규칙에 막히므로, collectionGroup +
//  authorId==uid로 내 것만 읽습니다. 카드 규칙이 '본인 카드'를 허용.)
export function subscribeMyStudyCards(uid, callback) {
  if (isFirebaseConfigured) {
    const q = query(collectionGroup(db, "cards"), where("authorId", "==", uid));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => callback([])
    );
  }
  // 데모: 평면 배열에서 내 카드만
  const emit = () => callback((mock.studyCards ?? []).filter((c) => c.authorId === uid));
  const wrapper = () => emit();
  // 카드 변경 시 갱신 — 모든 보드 리스너 집합에 함께 걸어둠
  if (!mockListeners.myCards) mockListeners.myCards = new Set();
  mockListeners.myCards.add(wrapper);
  emit();
  return () => mockListeners.myCards.delete(wrapper);
}

// [교사] 보드 추가 (맨 뒤 순서로)
export async function addStudyBoard(
  user,
  {
    title,
    type = "student",
    description = "",
    keywords = [],
    classId = null,
    activityType = "individual", // 'individual'(개별) | 'group'(모둠)
  }
) {
  const data = {
    classId: classId ?? null,
    title,
    type,
    description,
    keywords: keywords ?? [],
    activityType,
    viewMode: type === "notice" ? "shared" : "private", // notice는 학생 전체 공지, 학생 보드는 기본 비공개
    editMode: "open",
    createdBy: user.uid,
  };
  // 만든 보드의 id를 돌려줍니다 — 수업 준비에서 '수업 보드 추가'로 만든 뒤
  // 바로 그 보드를 수업 자료에 연결하려면 id가 필요합니다.
  if (isFirebaseConfigured) {
    const ref = await addDoc(collection(db, "studyBoards"), {
      ...data,
      order: Date.now(),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }
  const maxOrder = Math.max(0, ...mock.studyBoards.map((b) => b.order));
  const id = `b${++mockSeq}_m`;
  mock.studyBoards.push({
    id,
    ...data,
    order: maxOrder + 1,
    createdAt: new Date(),
  });
  notifyStudyBoards();
  return id;
}

export async function ensureDefaultStudyBoard(user, classId) {
  if (!user || !classId) return null;
  if (isFirebaseConfigured) {
    const existing = await getDocs(
      query(
        collection(db, "studyBoards"),
        where("classId", "==", classId),
        where("type", "==", "notice"),
        limit(1)
      )
    );
    if (!existing.empty) return existing.docs[0].id;
  } else {
    const existing = mock.studyBoards.find((b) => b.classId === classId && b.type === "notice");
    if (existing) return existing.id;
  }

  return addStudyBoard(user, {
    title: "선생님 보드",
    type: "notice",
    description: "수업 안내와 자료를 올려 주세요.",
    classId,
  });
}

// [교사] 보드 순서 일괄 변경 — 드래그 앤 드롭 결과(id 배열)를 그대로 전달.
// (같은 반의 보드 id를 새 순서대로 넘기면 order를 0..n-1로 재배정)
export async function reorderStudyBoards(orderedIds) {
  if (isFirebaseConfigured) {
    await Promise.all(
      orderedIds.map((id, i) => updateDoc(doc(db, "studyBoards", id), { order: i }))
    );
    return;
  }
  orderedIds.forEach((id, i) => {
    const b = mock.studyBoards.find((x) => x.id === id);
    if (b) b.order = i;
  });
  notifyStudyBoards();
}

// [교사] 보드 복제 — 다른 반으로 보드를 복사합니다.
// 학생 기록(카드)은 복사하지 않고(초기화), 교사가 제시한 활동(activities)과
// 공개 범위(viewMode)·편집 상태(editMode)·제목·설명·키워드만 유지합니다.
export async function duplicateStudyBoard(board, targetClassId, user) {
  const data = {
    classId: targetClassId ?? null,
    title: board.title,
    type: board.type ?? "student",
    description: board.description ?? "",
    keywords: board.keywords ?? [],
    activities: board.activities ?? [], // 교사가 제시한 활동 유지
    viewMode: board.viewMode ?? "private", // 공개 범위 유지
    editMode: board.editMode ?? "open", // 편집 상태 유지
    createdBy: user.uid,
  };
  if (isFirebaseConfigured) {
    // 카드(서브컬렉션)는 복사하지 않음 → 학생 기록 초기화
    await addDoc(collection(db, "studyBoards"), {
      ...data,
      order: Date.now(),
      createdAt: serverTimestamp(),
    });
    return;
  }
  const maxOrder = Math.max(0, ...mock.studyBoards.map((b) => b.order));
  mock.studyBoards.push({
    id: `b${++mockSeq}_m`,
    ...data,
    order: maxOrder + 1,
    createdAt: new Date(),
  });
  notifyStudyBoards();
}

// [교사] 보드 설정/제목 수정 (viewMode, editMode, title, description, keyword)
export async function updateStudyBoard(boardId, patch) {
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "studyBoards", boardId), patch);
    return;
  }
  const target = mock.studyBoards.find((b) => b.id === boardId);
  if (target) Object.assign(target, patch);
  notifyStudyBoards();
}

// [교사] 보드 삭제 (보드에 속한 카드와 첨부 파일도 함께 정리)
export async function deleteStudyBoard(boardId) {
  if (isFirebaseConfigured) {
    // Firestore는 서브컬렉션을 자동 삭제하지 않으므로 cards를 먼저 일괄 삭제합니다.
    const cardsSnap = await getDocs(
      collection(db, "studyBoards", boardId, "cards")
    );
    await Promise.all(cardsSnap.docs.map((d) => deleteAttachedFiles(d.data())));
    await Promise.all(cardsSnap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(db, "studyBoards", boardId));
    return;
  }
  mock.studyBoards = mock.studyBoards.filter((b) => b.id !== boardId);
  mock.studyCards = mock.studyCards.filter((c) => c.boardId !== boardId);
  notifyStudyBoards();
}

// 카드 추가. content는 서식(HTML), imageUrl은 첨부 이미지(선택), attachments는 파일 첨부 목록
export async function addStudyCard(user, boardId, { title = "", content, imageUrl = null, attachments = [] }) {
  const data = {
    boardId,
    title: title ?? "",
    content,
    imageUrl: imageUrl ?? null,
    attachments: attachments ?? [],
    authorId: user.uid,
    authorName: user.displayName,
    authorEmoji: user.emoji ?? null,
    // 실명·이메일·학번 등 식별 정보는 카드에 저장하지 않음
    // — 교사는 사용자 디렉터리(users/{uid})로 확인
  };
  // 교사는 한 보드에 카드를 여러 개 올릴 수 있음(예시·자료 등) → 자동 ID.
  // 학생은 문서 ID=uid로 고정해 "보드당 1개"를 문서 수준에서 보장(중복 제출 방지).
  const isTeacherUser = user.role === "admin" || user.role === "teacher";
  if (isFirebaseConfigured) {
    if (isTeacherUser) {
      // 교사는 자동 ID → 생성된 카드 ID를 돌려줍니다(자동저장이 이후 갱신에 사용).
      const ref = await addDoc(collection(db, "studyBoards", boardId, "cards"), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    }
    // 학생은 문서 ID=uid로 고정 → uid가 곧 카드 ID입니다.
    await setDoc(doc(db, "studyBoards", boardId, "cards", user.uid), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return user.uid;
  }
  // mock: 교사는 매번 새 카드, 학생은 기존 카드 교체(없으면 추가)
  const existing = isTeacherUser
    ? null
    : mock.studyCards.find((c) => c.boardId === boardId && c.authorId === user.uid);
  if (existing) {
    Object.assign(existing, data, { updatedAt: new Date() });
    notifyStudyCards(boardId);
    return existing.id;
  }
  const newId = isTeacherUser ? `card${++mockSeq}_m` : user.uid;
  mock.studyCards.push({
    id: newId,
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  notifyStudyCards(boardId);
  return newId;
}

// 카드 수정 — 작성자 본인(또는 교사)만 호출하도록 화면에서 제어
export async function updateStudyCard(boardId, cardId, { title, content, imageUrl, attachments }) {
  const patch = { title: title ?? "", content, imageUrl: imageUrl ?? null, attachments: attachments ?? [] };
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "studyBoards", boardId, "cards", cardId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
    return;
  }
  const target = mock.studyCards.find(
    (c) => c.boardId === boardId && c.id === cardId
  );
  if (target) Object.assign(target, patch, { updatedAt: new Date() });
  notifyStudyCards(boardId);
}

// 카드 삭제 — 첨부된 이미지·파일(Storage)도 함께 삭제합니다.
export async function deleteStudyCard(boardId, cardId) {
  if (isFirebaseConfigured) {
    const cardRef = doc(db, "studyBoards", boardId, "cards", cardId);
    const cardSnap = await getDoc(cardRef);
    await deleteAttachedFiles(cardSnap.data());
    await deleteDoc(cardRef);
    return;
  }
  mock.studyCards = mock.studyCards.filter(
    (c) => !(c.boardId === boardId && c.id === cardId)
  );
  notifyStudyCards(boardId);
}

// =============================================================
// 학생 보상(과일) — 교사가 참여도에 따라 과일을 부여 (반별)
// -------------------------------------------------------------
// rewards/{classId_uid} = { classId, uid, count(0~REWARD_MAX), updatedAt }
//  · 쓰기는 반 소유 교사만(규칙), 읽기는 같은 반 학생도 가능.
//  · 과일 아이콘/순서는 화면에서 결정하고, 여기선 개수만 저장.
//  · 20개(REWARD_STAR)마다 ⭐ 하나로 바꿔 표시하고 과일 뱃지는 새로 시작.
// =============================================================
export const REWARD_STAR = 20;  // 과일 20개 = 별 1개
export const REWARD_MAX = 100;  // 하드 캡(별 5개) — 규칙과 동일

// 특정 반의 소속 학생 uid 목록 구독 (교사 전용 — memberships 읽기)
export function subscribeClassMembers(classId, callback) {
  if (!classId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const q = query(collection(db, "memberships"), where("classId", "==", classId));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => d.data().uid).filter(Boolean)),
      () => callback([])
    );
  }
  if (!mock.memberships) mock.memberships = [];
  if (!mockListeners.classMembers) mockListeners.classMembers = new Set();
  const emit = () =>
    callback(mock.memberships.filter((m) => m.classId === classId).map((m) => m.uid));
  mockListeners.classMembers.add(emit);
  emit();
  return () => mockListeners.classMembers.delete(emit);
}

// 모든 반의 보상(과일) 구독 → [{ classId, uid, count }] (교사 전용, 대시보드 학급통계용)
export function subscribeAllRewards(callback) {
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "rewards"),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => callback([])
    );
  }
  if (!mock.rewards) mock.rewards = [];
  if (!mockListeners.rewards) mockListeners.rewards = new Set();
  const emit = () => callback([...mock.rewards]);
  mockListeners.rewards.add(emit);
  emit();
  return () => mockListeners.rewards.delete(emit);
}

// 여러 반의 보상을 반별 구독으로 나눠 합쳐 반환 (일반 교사: 소유 반만).
// 규칙상 교사는 전체 rewards를 나열할 수 없으므로, 반별(where classId==)로 나눕니다.
export function subscribeRewardsForClasses(classIds, callback) {
  const ids = [...new Set((classIds || []).filter(Boolean))];
  if (ids.length === 0) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const byClass = {};
    const emit = () => callback(Object.values(byClass).flat());
    const unsubs = ids.map((cid) =>
      onSnapshot(
        query(collection(db, "rewards"), where("classId", "==", cid)),
        (snap) => { byClass[cid] = snap.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); },
        () => { byClass[cid] = []; emit(); }
      )
    );
    return () => unsubs.forEach((u) => u());
  }
  if (!mock.rewards) mock.rewards = [];
  if (!mockListeners.rewards) mockListeners.rewards = new Set();
  const emit = () => callback(mock.rewards.filter((r) => ids.includes(r.classId)));
  mockListeners.rewards.add(emit);
  emit();
  return () => mockListeners.rewards.delete(emit);
}

// 특정 반의 보상(과일 개수) 구독 → [{ uid, count }]
export function subscribeClassRewards(classId, callback) {
  if (!classId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const q = query(collection(db, "rewards"), where("classId", "==", classId));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => callback([]) // 권한/네트워크 오류는 빈 목록
    );
  }
  if (!mock.rewards) mock.rewards = [];
  if (!mockListeners.rewards) mockListeners.rewards = new Set();
  const emit = () => callback(mock.rewards.filter((r) => r.classId === classId));
  mockListeners.rewards.add(emit);
  emit();
  return () => mockListeners.rewards.delete(emit);
}

// 한 학생이 받은 과일 총합 구독 (여러 반 합산) — 교사 전용(대시보드용)
export function subscribeStudentRewardTotal(uid, callback) {
  if (!uid) { callback(0); return () => {}; }
  const sum = (docs) => docs.reduce((s, r) => s + (r.count ?? 0), 0);
  if (isFirebaseConfigured) {
    const q = query(collection(db, "rewards"), where("uid", "==", uid));
    return onSnapshot(
      q,
      (snap) => callback(sum(snap.docs.map((d) => d.data()))),
      () => callback(0)
    );
  }
  if (!mock.rewards) mock.rewards = [];
  if (!mockListeners.rewards) mockListeners.rewards = new Set();
  const emit = () => callback(sum(mock.rewards.filter((r) => r.uid === uid)));
  mockListeners.rewards.add(emit);
  emit();
  return () => mockListeners.rewards.delete(emit);
}

// ─── 알림(users/{uid}/notifications) — 상단바 알림 벨 ───────────────
// 새 답변(new_answer) / 답변 채택(answer_understood) 알림을 Cloud
// Functions(onAnswerCreated, onAnswerUnderstood)가 여기에 씁니다.
export function subscribeMyNotifications(uid, callback) {
  if (!uid) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "users", uid, "notifications"),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => callback([])
    );
  }
  // 데모 모드는 알림을 발생시키는 서버 이벤트가 없어 지원하지 않음
  callback([]);
  return () => {};
}

export async function markNotificationRead(uid, notifId) {
  if (!isFirebaseConfigured) return;
  await updateDoc(doc(db, "users", uid, "notifications", notifId), { read: true });
}

// 본인(학생)이 특정 반에서 받은 과일 개수 실시간 구독(rewards/{classId}_{uid}
// 문서 1건) — 상단바 뱃지용. 어느 반을 볼지는 호출하는 쪽(TopNav)이
// study 화면과 동일한 기준(세션에 기억된 반 → 없으면 첫 소속)으로 정해
// 넘겨주므로, 여러 반에 흔적이 남아 있어도 지금 보고 있는 반의 개수만
// 정확히 보여줍니다.
export function subscribeMyClassRewardCount(classId, uid, callback) {
  if (!classId || !uid) { callback(0); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      doc(db, "rewards", `${classId}_${uid}`),
      (snap) => callback(snap.exists() ? (snap.data().count ?? 0) : 0),
      () => callback(0)
    );
  }
  if (!mock.rewards) mock.rewards = [];
  if (!mockListeners.rewards) mockListeners.rewards = new Set();
  const emit = () => {
    const r = mock.rewards.find((x) => x.classId === classId && x.uid === uid);
    callback(r?.count ?? 0);
  };
  mockListeners.rewards.add(emit);
  emit();
  return () => mockListeners.rewards.delete(emit);
}

// [교사] 학생 과일 수 설정 (0~REWARD_MAX). setDoc(merge)로 upsert.
// identity(선택): { name, emoji } — 이름표를 문서에 함께 저장해,
// 학생(읽기 전용) 화면에서 디렉터리 없이도 표시할 수 있게 합니다.
// 공부방은 실명 참여 공간이라 실명을 담습니다. rewards는 규칙상
// 그 반 소속 학생만 읽을 수 있어 반 밖으로는 새지 않습니다.
export async function setStudentReward(classId, uid, count, identity = null) {
  const safe = Math.max(0, Math.min(REWARD_MAX, Math.round(count) || 0));
  const extra = identity
    ? { name: identity.name || "", emoji: identity.emoji || "🙂" }
    : {};
  if (isFirebaseConfigured) {
    await setDoc(
      doc(db, "rewards", `${classId}_${uid}`),
      { classId, uid, count: safe, ...extra, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return;
  }
  if (!mock.rewards) mock.rewards = [];
  const existing = mock.rewards.find((r) => r.classId === classId && r.uid === uid);
  if (existing) Object.assign(existing, { count: safe, ...extra });
  else mock.rewards.push({ id: `${classId}_${uid}`, classId, uid, count: safe, ...extra });
  mockListeners.rewards?.forEach((cb) => cb());
}

// =============================================================
// 공부방 출석부 — 날짜별 출석 기록
// -------------------------------------------------------------
// classes/{classId}/attendanceRecords/{date_uid}
//   = { classId, uid, date, name, studentId, emoji, attendedAt, createdAt }
// 학생은 자기 출석만 남기고, 교사는 반 전체 출석 기록을 봅니다.
// =============================================================
export function todayDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function attendanceIdentity(user) {
  return {
    name: user.realName || user.displayName || "이름 미설정",
    studentId: user.studentId || null,
    emoji: user.emoji || "🙂",
  };
}

function sortAttendanceRecords(list) {
  return [...list].sort((a, b) => {
    const dateCmp = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateCmp) return dateCmp;
    return toDate(b.attendedAt || b.createdAt) - toDate(a.attendedAt || a.createdAt);
  });
}

function notifyAttendanceRecords(classId) {
  mockListeners.attendanceRecords?.get(classId)?.forEach((cb) => cb());
}

export async function markStudyAttendance(classId, user, date = todayDateKey()) {
  if (!classId || !user?.uid) return null;
  const id = `${date}_${user.uid}`;
  if (isFirebaseConfigured) {
    // 문서가 아직 없을 때 존재 여부를 먼저 get()으로 확인하면, 그 읽기 규칙이
    // resource.data를 참조하는 한(없는 문서는 resource가 null) 규칙 평가
    // 자체가 permission-denied로 거부됩니다. 그래서 사전 확인 없이 바로
    // 씁니다 — 이미 기록돼 있으면 규칙(update 금지)이 이 쓰기를 막아 주므로
    // 그 실패는 "이미 출석함"으로 보고 조용히 넘어갑니다.
    const ref = doc(db, "classes", classId, "attendanceRecords", id);
    const data = {
      classId,
      uid: user.uid,
      date,
      ...attendanceIdentity(user),
      attendedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    };
    try {
      await setDoc(ref, data);
    } catch (e) {
      if (e?.code !== "permission-denied") throw e;
    }
    return { id, ...data };
  }
  if (!mock.attendanceRecords) mock.attendanceRecords = [];
  const prev = mock.attendanceRecords.find((r) => r.id === id && r.classId === classId);
  if (prev) return prev;
  const record = {
    id,
    classId,
    uid: user.uid,
    date,
    ...attendanceIdentity(user),
    attendedAt: new Date(),
    createdAt: new Date(),
  };
  mock.attendanceRecords.push(record);
  notifyAttendanceRecords(classId);
  return record;
}

export function subscribeMyStudyAttendance(classId, uid, callback) {
  if (!classId || !uid) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "classes", classId, "attendanceRecords"),
      where("uid", "==", uid)
    );
    return onSnapshot(
      q,
      (snap) => callback(sortAttendanceRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      () => callback([])
    );
  }
  if (!mock.attendanceRecords) mock.attendanceRecords = [];
  if (!mockListeners.attendanceRecords.has(classId)) {
    mockListeners.attendanceRecords.set(classId, new Set());
  }
  const emit = () =>
    callback(sortAttendanceRecords(mock.attendanceRecords.filter((r) => r.classId === classId && r.uid === uid)));
  mockListeners.attendanceRecords.get(classId).add(emit);
  emit();
  return () => mockListeners.attendanceRecords.get(classId)?.delete(emit);
}

export function subscribeClassStudyAttendance(classId, callback) {
  if (!classId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "classes", classId, "attendanceRecords"),
      (snap) => callback(sortAttendanceRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      () => callback([])
    );
  }
  if (!mock.attendanceRecords) mock.attendanceRecords = [];
  if (!mockListeners.attendanceRecords.has(classId)) {
    mockListeners.attendanceRecords.set(classId, new Set());
  }
  const emit = () =>
    callback(sortAttendanceRecords(mock.attendanceRecords.filter((r) => r.classId === classId)));
  mockListeners.attendanceRecords.get(classId).add(emit);
  emit();
  return () => mockListeners.attendanceRecords.get(classId)?.delete(emit);
}

// =============================================================
// 참여 전광판 — 기본 자리표 / 날짜별 임시 자리표 / 반 기본 모둠
// -------------------------------------------------------------
// classes/{classId}/seatLayouts/default
// classes/{classId}/seatLayouts/daily_YYYY-MM-DD
// classes/{classId}/groupAssignments/default
// =============================================================
export const STUDY_SEAT_COUNT = 30;

export function dailySeatLayoutId(date = todayDateKey()) {
  return `daily_${date}`;
}

function normalizeSeatUids(seats = []) {
  const seen = new Set();
  const out = Array.from({ length: STUDY_SEAT_COUNT }, (_, i) => {
    const uid = typeof seats[i] === "string" && seats[i] ? seats[i] : null;
    if (!uid || seen.has(uid)) return null;
    seen.add(uid);
    return uid;
  });
  return out;
}

function seatLayoutKey(classId, layoutId) {
  return `${classId}_${layoutId}`;
}

function notifySeatLayout(classId, layoutId) {
  mockListeners.seatLayouts?.get(seatLayoutKey(classId, layoutId))?.forEach((cb) => cb());
}

function notifyGroupAssignment(classId) {
  mockListeners.groupAssignments?.get(classId)?.forEach((cb) => cb());
}

export async function saveStudySeatLayout(classId, layoutId, seats, user, extra = {}) {
  if (!classId || !layoutId || !user?.uid) return null;
  const cleanSeats = normalizeSeatUids(seats);
  const data = {
    classId,
    layoutId,
    seats: cleanSeats,
    ...extra,
    updatedBy: user.uid,
    updatedAt: isFirebaseConfigured ? serverTimestamp() : new Date(),
  };
  if (isFirebaseConfigured) {
    await setDoc(doc(db, "classes", classId, "seatLayouts", layoutId), data, { merge: true });
    return { id: layoutId, ...data };
  }
  if (!mock.seatLayouts) mock.seatLayouts = [];
  const idx = mock.seatLayouts.findIndex((x) => x.classId === classId && x.id === layoutId);
  const next = { id: layoutId, ...data };
  if (idx >= 0) mock.seatLayouts[idx] = { ...mock.seatLayouts[idx], ...next };
  else mock.seatLayouts.push(next);
  notifySeatLayout(classId, layoutId);
  return next;
}

export function subscribeStudySeatLayout(classId, layoutId, callback) {
  if (!classId || !layoutId) { callback(null); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      doc(db, "classes", classId, "seatLayouts", layoutId),
      (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => callback(null)
    );
  }
  if (!mock.seatLayouts) mock.seatLayouts = [];
  const key = seatLayoutKey(classId, layoutId);
  if (!mockListeners.seatLayouts.has(key)) mockListeners.seatLayouts.set(key, new Set());
  const emit = () =>
    callback(mock.seatLayouts.find((x) => x.classId === classId && x.id === layoutId) ?? null);
  mockListeners.seatLayouts.get(key).add(emit);
  emit();
  return () => mockListeners.seatLayouts.get(key)?.delete(emit);
}

const GROUP_COLORS = ["#2563eb", "#16a34a", "#f97316", "#9333ea", "#dc2626", "#0891b2"];

function normalizeStudyGroups(groups = []) {
  const seen = new Set();
  return groups
    .slice(0, 6)
    .map((g, i) => {
      const index = Number(g.index ?? i + 1) || i + 1;
      const members = (g.members ?? [])
        .filter((m) => m?.uid && !seen.has(m.uid))
        .map((m) => {
          seen.add(m.uid);
          return {
            uid: m.uid,
            name: m.name || "이름 미설정",
            studentId: m.studentId || null,
            emoji: m.emoji || "🙂",
          };
        });
      return {
        id: g.id || `group_${index}`,
        index,
        name: (g.name || `${index}모둠`).trim(),
        color: g.color || GROUP_COLORS[(index - 1) % GROUP_COLORS.length],
        memberUids: members.map((m) => m.uid),
        members,
      };
    });
}

export async function saveStudyGroupAssignment(classId, groups, user) {
  if (!classId || !user?.uid) return null;
  const data = {
    classId,
    groups: normalizeStudyGroups(groups),
    updatedBy: user.uid,
    updatedAt: isFirebaseConfigured ? serverTimestamp() : new Date(),
  };
  if (isFirebaseConfigured) {
    await setDoc(doc(db, "classes", classId, "groupAssignments", "default"), data, { merge: true });
    return { id: "default", ...data };
  }
  if (!mock.groupAssignments) mock.groupAssignments = [];
  const idx = mock.groupAssignments.findIndex((x) => x.classId === classId && x.id === "default");
  const next = { id: "default", ...data };
  if (idx >= 0) mock.groupAssignments[idx] = { ...mock.groupAssignments[idx], ...next };
  else mock.groupAssignments.push(next);
  notifyGroupAssignment(classId);
  return next;
}

export function subscribeStudyGroupAssignment(classId, callback) {
  if (!classId) { callback(null); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      doc(db, "classes", classId, "groupAssignments", "default"),
      (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => callback(null)
    );
  }
  if (!mock.groupAssignments) mock.groupAssignments = [];
  if (!mockListeners.groupAssignments.has(classId)) mockListeners.groupAssignments.set(classId, new Set());
  const emit = () =>
    callback(mock.groupAssignments.find((x) => x.classId === classId && x.id === "default") ?? null);
  mockListeners.groupAssignments.get(classId).add(emit);
  emit();
  return () => mockListeners.groupAssignments.get(classId)?.delete(emit);
}

// [최고 관리자] 과일 보상 기록 1건 삭제 — 탈퇴 계정 정리 등 예외 처리용.
export async function deleteRewardRecord(rewardId) {
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "rewards", rewardId));
    return;
  }
  mock.rewards = (mock.rewards ?? []).filter((r) => r.id !== rewardId);
  mockListeners.rewards?.forEach((cb) => cb());
}

// =============================================================
// 누가기록(학생 관찰 기록) — 교사가 학생별로 남기는 append 메모
// -------------------------------------------------------------
// studentNotes/{autoId} = { studentUid, classId, teacherId, teacherName, text, createdAt }
//  · 교사만 읽기·쓰기(학생은 볼 수 없음). '멋진 순간'을 준 순간의 기록이나,
//    과일과 무관한 관찰 메모를 학생별로 누적합니다. 대시보드에서 확인.
// =============================================================
function notifyStudentNotes(studentUid) {
  mockListeners.studentNotes?.get(studentUid)?.forEach((cb) => cb());
}

// 특정 학생의 누가기록 구독 (최신순) — 교사 전용
export function subscribeStudentNotes(studentUid, callback) {
  if (!studentUid) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    // studentUid 단일 조건 + 클라 정렬(복합 색인 불필요)
    const q = query(collection(db, "studentNotes"), where("studentUid", "==", studentUid));
    return onSnapshot(
      q,
      (snap) => callback(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
      ),
      () => callback([])
    );
  }
  if (!mock.studentNotes) mock.studentNotes = [];
  if (!mockListeners.studentNotes) mockListeners.studentNotes = new Map();
  if (!mockListeners.studentNotes.has(studentUid)) {
    mockListeners.studentNotes.set(studentUid, new Set());
  }
  const emit = () =>
    callback(
      mock.studentNotes
        .filter((n) => n.studentUid === studentUid)
        .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
    );
  mockListeners.studentNotes.get(studentUid).add(emit);
  emit();
  return () => mockListeners.studentNotes.get(studentUid)?.delete(emit);
}

// [교사] 누가기록 추가 (append)
export async function addStudentNote(user, studentUid, { text, classId = null }) {
  const data = {
    studentUid,
    classId: classId ?? null,
    teacherId: user.uid,
    teacherName: user.displayName ?? "선생님",
    text,
  };
  if (isFirebaseConfigured) {
    await addDoc(collection(db, "studentNotes"), { ...data, createdAt: serverTimestamp() });
    return;
  }
  if (!mock.studentNotes) mock.studentNotes = [];
  mock.studentNotes.push({ id: `note${++mockSeq}_m`, ...data, createdAt: new Date() });
  notifyStudentNotes(studentUid);
}

// [교사] 누가기록 삭제
export async function deleteStudentNote(noteId, studentUid) {
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "studentNotes", noteId));
    return;
  }
  mock.studentNotes = (mock.studentNotes ?? []).filter((n) => n.id !== noteId);
  notifyStudentNotes(studentUid);
}

// =============================================================
// KWL — 저장마다 새 항목 생성 (append 모델)
// =============================================================
function notifyKwl(classId, date) {
  const key = `${classId}_${date}`;
  const entries = mock.kwl.filter((e) => e.classId === classId && e.date === date);
  mockListeners.kwl.get(key)?.forEach((cb) => cb([...entries]));
  mockListeners.kwl.get(`${classId}_*`)?.forEach((cb) => cb());
  // 사용자 단위(반 무관) 구독자 — 관리자 대시보드 학생별 KWL 조회용
  for (const [k, set] of mockListeners.kwl) {
    if (k.startsWith("userkwl_")) set.forEach((cb) => cb());
  }
  // 전체 구독자 — 관리자 공부방별 통계용
  mockListeners.kwl.get("__all__")?.forEach((cb) => cb());
}

// 오늘 내 KWL 항목 목록 구독 (배열 반환, 등록 순)
export function subscribeMyTodayKwl(classId, userId, date, callback) {
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "kwl"),
      where("classId", "==", classId),
      where("userId", "==", userId),
      where("date", "==", date),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  const key = `${classId}_${date}`;
  if (!mockListeners.kwl.has(key)) mockListeners.kwl.set(key, new Set());
  const wrapped = (allEntries) =>
    callback(allEntries.filter((e) => e.userId === userId));
  mockListeners.kwl.get(key).add(wrapped);
  wrapped(mock.kwl.filter((e) => e.classId === classId && e.date === date));
  return () => mockListeners.kwl.get(key)?.delete(wrapped);
}

// 교사용 — 해당 수업일 전체 학생 KWL 구독
export function subscribeAllKwl(classId, date, callback) {
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "kwl"),
      where("classId", "==", classId),
      where("date", "==", date)
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  const key = `${classId}_${date}`;
  if (!mockListeners.kwl.has(key)) mockListeners.kwl.set(key, new Set());
  mockListeners.kwl.get(key).add(callback);
  callback(mock.kwl.filter((e) => e.classId === classId && e.date === date));
  return () => mockListeners.kwl.get(key)?.delete(callback);
}

// subscribeAllKwl과 동일 조건으로 1회성 재조회 — 전체 화면의 '새로고침' 버튼용.
// (실시간 구독이 이미 켜져 있지만, 연결이 끊겼을 때도 확실히 최신화하기 위함)
export async function fetchAllKwlOnce(classId, date) {
  if (isFirebaseConfigured) {
    const snap = await getDocs(
      query(
        collection(db, "kwl"),
        where("classId", "==", classId),
        where("date", "==", date)
      )
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return mock.kwl.filter((e) => e.classId === classId && e.date === date);
}

// 내 전체 KWL 기록 구독 (최신순)
export function subscribeMyAllKwl(classId, userId, callback) {
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "kwl"),
      where("classId", "==", classId),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  const key = `${classId}_*`;
  if (!mockListeners.kwl.has(key)) mockListeners.kwl.set(key, new Set());
  const cb = () =>
    callback(
      [...mock.kwl]
        .filter((e) => e.classId === classId && e.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    );
  mockListeners.kwl.get(key).add(cb);
  cb();
  return () => mockListeners.kwl.get(key)?.delete(cb);
}

// 특정 학생의 전체 KWL 기록 구독 (반 무관) — 관리자 대시보드 학생별 조회용
export function subscribeUserKwl(userId, callback) {
  if (!userId) {
    callback([]);
    return () => {};
  }
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "kwl"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  const key = `userkwl_${userId}`;
  if (!mockListeners.kwl.has(key)) mockListeners.kwl.set(key, new Set());
  const cb = () =>
    callback(
      [...mock.kwl]
        .filter((e) => e.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    );
  mockListeners.kwl.get(key).add(cb);
  cb();
  return () => mockListeners.kwl.get(key)?.delete(cb);
}

// 전체 KWL 구독 (모든 반·사용자) — 관리자 공부방별 통계용
export function subscribeKwlAll(callback) {
  if (isFirebaseConfigured) {
    const q = query(collection(db, "kwl"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  const key = "__all__";
  if (!mockListeners.kwl.has(key)) mockListeners.kwl.set(key, new Set());
  const cb = () =>
    callback([...mock.kwl].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  mockListeners.kwl.get(key).add(cb);
  cb();
  return () => mockListeners.kwl.get(key)?.delete(cb);
}

// 여러 반의 KWL을 반별 구독으로 나눠 합쳐 반환 (일반 교사: 소유 반만).
// 규칙상 교사는 전체 kwl을 나열할 수 없으므로 반별(where classId==)로 나눕니다.
export function subscribeKwlForClasses(classIds, callback) {
  const ids = [...new Set((classIds || []).filter(Boolean))];
  if (ids.length === 0) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const byClass = {};
    const emit = () => {
      const all = Object.values(byClass).flat();
      all.sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt));
      callback(all);
    };
    const unsubs = ids.map((cid) =>
      onSnapshot(
        query(collection(db, "kwl"), where("classId", "==", cid)),
        (snap) => { byClass[cid] = snap.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); },
        () => { byClass[cid] = []; emit(); }
      )
    );
    return () => unsubs.forEach((u) => u());
  }
  const key = "__all__";
  if (!mockListeners.kwl.has(key)) mockListeners.kwl.set(key, new Set());
  const cb = () =>
    callback(
      [...mock.kwl]
        .filter((e) => ids.includes(e.classId))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    );
  mockListeners.kwl.get(key).add(cb);
  cb();
  return () => mockListeners.kwl.get(key)?.delete(cb);
}

// KWL 저장 — 하루 1개. 문서 ID를 uid_classId_date로 고정해, 같은 날 다시
// 저장하면 새로 만들지 않고 덮어씁니다(upsert). (중복 생성 방지)
export async function addKwl(classId, user, date, values = {}) {
  const id = `${user.uid}_${classId}_${date}`;
  const answers = {
    ...emptyKwlsAnswers(),
    ...(values.answers ?? {}),
    know: values.answers?.know ?? values.K ?? "",
    want: values.answers?.want ?? values.W ?? "",
    learned: values.answers?.learned ?? values.L ?? "",
    still: values.answers?.still ?? values.S ?? "",
  };
  const data = {
    classId,
    userId: user.uid,
    date,
    answers,
    ...kwlsLegacyFieldsFromAnswers(answers),
    authorName: user.displayName ?? "나",
    authorEmoji: user.emoji ?? "🙂",
  };
  if (isFirebaseConfigured) {
    await setDoc(
      doc(db, "kwl", id),
      { ...data, createdAt: serverTimestamp() },
      { merge: true }
    );
    return;
  }
  const existing = mock.kwl.find((e) => e.id === id);
  if (existing) Object.assign(existing, data);
  else mock.kwl.push({ id, ...data, createdAt: new Date() });
  notifyKwl(classId, date);
}

// KWL 삭제 (중복 정리·삭제용)
export async function deleteKwl(entry) {
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "kwl", entry.id));
    return;
  }
  mock.kwl = mock.kwl.filter((e) => e.id !== entry.id);
  notifyKwl(entry.classId, entry.date);
}

// KWL 항목 수정 (저장 후 내용 편집). entry는 { id, classId, date }를 포함.
export async function updateKwl(entry, values = {}) {
  const answers = {
    ...emptyKwlsAnswers(),
    ...(values.answers ?? {}),
    know: values.answers?.know ?? values.K ?? "",
    want: values.answers?.want ?? values.W ?? "",
    learned: values.answers?.learned ?? values.L ?? "",
    still: values.answers?.still ?? values.S ?? "",
  };
  const legacyFields = kwlsLegacyFieldsFromAnswers(answers);
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "kwl", entry.id), {
      answers,
      ...legacyFields,
      updatedAt: serverTimestamp(),
    });
    return;
  }
  const target = mock.kwl.find((e) => e.id === entry.id);
  if (target) Object.assign(target, { answers, ...legacyFields });
  notifyKwl(target?.classId ?? entry.classId, target?.date ?? entry.date);
}

// ─── 사용자 디렉터리 (실명·이메일) — 교사/관리자 전용 조회 ──────────
// 실명·이메일 같은 식별 정보(PII)는 게시물 문서에 넣지 않고 users/{uid}에만
// 둡니다(게시물은 모든 학생이 읽으므로). 교사 화면은 이 디렉터리로
// uid→실명/이메일을 조회합니다. 보안 규칙이 users 읽기를 "본인+교사"로
// 제한하므로, 학생이 호출하면 거부됩니다(그래서 학생 화면에선 호출하지 않음).
const _userDirectory = new Map(); // uid -> { uid, realName, email, displayName, emoji, studentId }

// 동기 조회용 — AuthorBadge·StudyCard 등이 렌더 시점에 실명을 찾습니다.
export function getDirectoryUser(uid) {
  return uid ? _userDirectory.get(uid) ?? null : null;
}
export function getDirectoryRealName(uid) {
  return getDirectoryUser(uid)?.realName || null;
}

function setDirectory(list) {
  _userDirectory.clear();
  list.forEach((e) => e.uid && _userDirectory.set(e.uid, e));
}

// 데모 모드: 단일 출처(users)가 없으므로 게시물의 author 정보로 디렉터리를 흉내냅니다.
function buildMockDirectory() {
  const map = new Map();
  const add = (item) => {
    if (!item?.authorId) return;
    const prev = map.get(item.authorId) ?? { uid: item.authorId };
    map.set(item.authorId, {
      ...prev,
      realName: item.authorRealName ?? prev.realName ?? "",
      email: item.authorEmail ?? prev.email ?? "",
      displayName: item.authorName ?? prev.displayName ?? "",
      emoji: item.authorEmoji ?? prev.emoji ?? "🙂",
      studentId: item.authorStudentId ?? prev.studentId ?? null,
    });
  };
  mock.questions.forEach(add);
  Object.values(mock.answers).forEach((arr) => arr.forEach(add));
  (mock.studyCards ?? []).forEach(add);
  return [...map.values()];
}

// 교사 전용: users 컬렉션을 구독해 uid→프로필 디렉터리를 만듭니다.
export function subscribeUserDirectory(callback) {
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "users"),
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data();
          // 예전 가입 계정: 실명 칸에 "21031홍길동"(워크스페이스 계정 이름)이
          // 통째로 남아 있으면 표시 시점에 학번·이름으로 분리
          const ws = !data.studentId ? splitWorkspaceName(data.realName) : null;
          return {
            uid: d.id,
            realName: ws ? ws.realName : data.realName ?? "",
            email: data.email ?? "",
            displayName: data.displayName ?? "",
            emoji: data.emoji ?? "🙂",
            studentId: data.studentId ?? (ws ? ws.studentId : null),
            role: data.role ?? "student",
            requestedRole: data.requestedRole ?? null, // '선생님' 승인 대기 표시
            withdrawRequested: data.withdrawRequested ?? false, // 탈퇴 신청 대기 표시
          };
        });
        setDirectory(list);
        callback(list);
      },
      () => callback([]) // 권한 거부 등은 빈 목록으로 (학생이 잘못 구독한 경우)
    );
  }
  const list = buildMockDirectory();
  setDirectory(list);
  callback(list);
  return () => {};
}

// ─── 본인 프로필 수정 (프로필 메뉴) ─────────────────────────────
// 규칙상 학생 본인은 email·emoji·fcmTokens·requestedRole만 변경 가능
// (닉네임·실명·학번은 교사만 수정). 교사는 본인 실명 수정에 사용합니다.
export async function updateMyProfile(uid, patch) {
  if (isFirebaseConfigured) {
    await setDoc(doc(db, "users", uid), patch, { merge: true });
    return;
  }
  // 데모 모드: 세션 기반 테스트 유저라 저장할 프로필 문서가 없음 — 생략
}

// ─── 관리자 전용: 학생 프로필 수정 ───────────────────────────────
// 실명·이메일은 users/{uid}(단일 출처)에만 저장하고, 게시물에는 비식별
// 정보(닉네임·이모지)만 전파합니다. 카드는 collectionGroup("cards")로 조회.
export async function updateStudentProfile(uid, { name, emoji, realName, email, studentId }) {
  if (isFirebaseConfigured) {
    // 식별 정보(실명·이메일·학번)는 users/{uid}에만 — 이 저장이 핵심이며,
    // 아래 게시물 닉네임 동기화는 best-effort(부분 실패 허용)로 진행합니다.
    const profilePatch = { displayName: name, emoji, realName, email: email ?? "" };
    if (studentId !== undefined) profilePatch.studentId = studentId || null;
    await setDoc(doc(db, "users", uid), profilePatch, { merge: true });

    // 게시물에는 비식별 정보만 갱신 (피드 닉네임/아바타 동기화용).
    // batch(전부-아니면-실패) 대신 개별 갱신 — 규칙상 일부 문서(타 교사 반
    // 카드 등)가 거부되어도 나머지 동기화와 프로필 저장은 유지됩니다.
    const patch = { authorName: name, authorEmoji: emoji };
    const updates = [];
    try {
      const qSnap = await getDocs(query(collection(db, "questions"), where("authorId", "==", uid)));
      qSnap.docs.forEach((d) => updates.push(updateDoc(d.ref, patch)));
    } catch (e) {
      console.warn("[updateStudentProfile] 질문 동기화 건너뜀:", e?.message);
    }
    try {
      const aSnap = await getDocs(query(collectionGroup(db, "answers"), where("authorId", "==", uid)));
      aSnap.docs.forEach((d) => updates.push(updateDoc(d.ref, patch)));
    } catch (e) {
      console.warn("[updateStudentProfile] 답변 동기화 건너뜀:", e?.message);
    }
    try {
      const cSnap = await getDocs(query(collectionGroup(db, "cards"), where("authorId", "==", uid)));
      cSnap.docs.forEach((d) => updates.push(updateDoc(d.ref, patch)));
    } catch (e) {
      console.warn("[updateStudentProfile] 카드 동기화 건너뜀:", e?.message);
    }
    await Promise.allSettled(updates);
    return;
  }
  // 데모: PII 분리가 의미 없으므로 게시물에 함께 갱신(디렉터리도 여기서 파생)
  const patch = { authorName: name, authorEmoji: emoji, authorRealName: realName, authorEmail: email ?? "" };
  if (studentId !== undefined) patch.authorStudentId = studentId || null;
  mock.questions = mock.questions.map((q) =>
    q.authorId === uid ? { ...q, ...patch } : q
  );
  Object.keys(mock.answers).forEach((qid) => {
    mock.answers[qid] = mock.answers[qid].map((a) =>
      a.authorId === uid ? { ...a, ...patch } : a
    );
  });
  mock.studyCards = (mock.studyCards ?? []).map((c) =>
    c.authorId === uid ? { ...c, ...patch } : c
  );
  notifyQuestions();
}

// ─── 관리자 전용: 역할(교사/관리자) 부여 ──────────────────────────
// Cloud Functions(setUserRole)를 호출해 커스텀 클레임을 부여합니다.
// 역할은 클라이언트가 스스로 바꿀 수 없고(보안 규칙), 이 경로로만 바뀝니다.
// (데모 모드에는 실제 인증·클레임이 없어 지원하지 않습니다)
export async function assignUserRole(uid, role) {
  const fn = httpsCallable(functions, "setUserRole");
  const result = await fn({ uid, role });
  return result.data;
}

// ─── 관리자 전용: 선생님 가입 신청 승인/거절 ─────────────────────
// 승인: teacher 클레임 부여 + 대기 표시(requestedRole) 해제.
// 거절: 대기 표시만 해제(학생으로 유지).
export async function approveTeacherRequest(uid) {
  await assignUserRole(uid, "teacher");
  if (isFirebaseConfigured) {
    // 대기 표시 해제 + 표시 이름을 '선생님'으로 고정(닉네임 미적용)
    await setDoc(
      doc(db, "users", uid),
      { requestedRole: null, displayName: "선생님", emoji: "🧑‍🏫" },
      { merge: true }
    );
  }
}
export async function dismissTeacherRequest(uid) {
  if (isFirebaseConfigured) {
    await setDoc(doc(db, "users", uid), { requestedRole: null }, { merge: true });
  }
}

// ─── 회원 탈퇴 신청 (본인) ───────────────────────────────────────
// 즉시 삭제하지 않고 '신청' 표시만 남깁니다. 학생의 신청은 선생님이,
// 선생님의 신청은 최고 관리자가 확인 후 deleteStudent()로 최종 처리합니다.
export async function requestWithdrawal(uid) {
  if (isFirebaseConfigured) {
    await setDoc(
      doc(db, "users", uid),
      { withdrawRequested: true, withdrawRequestedAt: serverTimestamp() },
      { merge: true }
    );
  }
}

// 신청 취소(본인) 또는 거절(교사/관리자) — 계정은 유지하고 신청 표시만 해제
export async function dismissWithdrawalRequest(uid) {
  if (isFirebaseConfigured) {
    await setDoc(doc(db, "users", uid), { withdrawRequested: false }, { merge: true });
  }
}

// ─── 교사·관리자: 학생 탈퇴 처리 ────────────────────────────────
// 계정 삭제와 데이터 파기를 서버 함수(deleteStudentAccount) 한 번에 맡깁니다.
//  · 담당 교사인지 서버가 검사합니다(예전엔 교사면 아무 반 학생이나 삭제 가능).
//  · 계정을 먼저 지워 되살아나는 일을 막고, 데이터는 멱등하게 파기합니다.
//  · 일부만 지워졌으면 warnings로 돌려받아 화면에 알립니다(조용한 실패 금지).
//
// 함수가 아직 배포되지 않은 과도기에는 예전 클라이언트 경로로 물러섭니다.
// (규칙에서 users 삭제를 관리자에게만 열어 두면 이 폴백도 자연히 막힙니다)
export async function deleteStudent(uid) {
  if (isFirebaseConfigured) {
    try {
      const res = await httpsCallable(functions, "deleteStudentAccount")({ uid });
      const warnings = res?.data?.warnings ?? [];
      if (warnings.length > 0) {
        const err = new Error(`일부 자료를 지우지 못했어요:\n· ${warnings.join("\n· ")}`);
        err.partial = true;
        throw err;
      }
      return;
    } catch (e) {
      // 함수 미배포(not-found/internal)일 때만 예전 경로로. 권한 거부·부분 실패는
      // 그대로 올려보내 교사가 결과를 알 수 있게 합니다.
      const code = e?.code || "";
      const missing = code.includes("not-found") || code.includes("unimplemented");
      if (!missing) throw e;
      console.warn("[deleteStudent] 서버 함수를 찾지 못해 예전 경로로 처리합니다:", code);
    }

    // ── 이하 폴백(구 경로) — 함수 배포 후에는 실행되지 않습니다 ──
    // 1) 본인이 올린 질문 + 그 질문의 답변(첨부 포함) 삭제
    const qSnap = await getDocs(query(collection(db, "questions"), where("authorId", "==", uid)));
    await Promise.all(qSnap.docs.map(async (d) => {
      const aSnap = await getDocs(collection(db, "questions", d.id, "answers"));
      await Promise.all([
        deleteAttachedFiles(d.data()),
        ...aSnap.docs.map((a) => deleteAttachedFiles(a.data())),
      ]);
      await Promise.all(aSnap.docs.map((a) => deleteDoc(a.ref)));
      await deleteDoc(d.ref);
    }));

    // 2~4) 남의 글에 단 답변·카드·KWL은 best-effort로 정리합니다.
    //   collectionGroup 색인이 아직 없어도(예외) 탈퇴(프로필 삭제)는 계속 진행되도록
    //   각 단계를 개별 try/catch로 감쌉니다. (색인 생성 후엔 완전 정리)
    try {
      const aSnap = await getDocs(query(collectionGroup(db, "answers"), where("authorId", "==", uid)));
      await Promise.all(aSnap.docs.map((d) => deleteAttachedFiles(d.data())));
      await Promise.all(aSnap.docs.map((d) => deleteDoc(d.ref)));
    } catch (e) {
      console.warn("[deleteStudent] answers 정리 건너뜀(색인 필요할 수 있음):", e?.message);
    }
    try {
      const cSnap = await getDocs(query(collectionGroup(db, "cards"), where("authorId", "==", uid)));
      await Promise.all(cSnap.docs.map((d) => deleteAttachedFiles(d.data())));
      await Promise.all(cSnap.docs.map((d) => deleteDoc(d.ref)));
    } catch (e) {
      console.warn("[deleteStudent] cards 정리 건너뜀:", e?.message);
    }
    try {
      const kSnap = await getDocs(query(collection(db, "kwl"), where("userId", "==", uid)));
      await Promise.all(kSnap.docs.map((d) => deleteDoc(d.ref)));
    } catch (e) {
      console.warn("[deleteStudent] kwl 정리 건너뜀:", e?.message);
    }

    // 5) 소속(memberships)·과일 보상(rewards) 정리 — 안 지우면 탈퇴 후에도
    //    교사 반 명단·'멋진 순간' 패널에 "이름 미설정"으로 계속 남습니다.
    try {
      const memSnap = await getDocs(query(collection(db, "memberships"), where("uid", "==", uid)));
      await Promise.all(memSnap.docs.map((d) => deleteDoc(d.ref)));
    } catch (e) {
      console.warn("[deleteStudent] memberships 정리 건너뜀:", e?.message);
    }
    try {
      const rwSnap = await getDocs(query(collection(db, "rewards"), where("uid", "==", uid)));
      await Promise.all(rwSnap.docs.map((d) => deleteDoc(d.ref)));
    } catch (e) {
      console.warn("[deleteStudent] rewards 정리 건너뜀:", e?.message);
    }

    // 6) 프로필(PII) 문서 삭제
    await deleteDoc(doc(db, "users", uid));

    // 7) 로그인 계정(Authentication) 삭제 — 서버(Cloud Function)에서만 가능.
    //    같은 이메일 재가입 허용 + 남은 역할 클레임 제거. 함수 미배포 시엔
    //    데이터 삭제는 이미 끝났으므로 best-effort로 넘어갑니다.
    try {
      await httpsCallable(functions, "deleteAuthUser")({ uid });
    } catch (e) {
      console.warn("[deleteStudent] 로그인 계정 삭제 건너뜀(함수 배포 필요할 수 있음):", e?.message);
    }
    return;
  }
  const qids = mock.questions.filter((q) => q.authorId === uid).map((q) => q.id);
  mock.questions = mock.questions.filter((q) => q.authorId !== uid);
  qids.forEach((id) => delete mock.answers[id]);
  Object.keys(mock.answers).forEach((qid) => {
    mock.answers[qid] = (mock.answers[qid] ?? []).filter((a) => a.authorId !== uid);
  });
  mock.studyCards = (mock.studyCards ?? []).filter((c) => c.authorId !== uid);
  mock.kwl = (mock.kwl ?? []).filter((e) => e.userId !== uid);
  if (mock.memberships) mock.memberships = mock.memberships.filter((m) => m.uid !== uid);
  if (mock.rewards) mock.rewards = mock.rewards.filter((r) => r.uid !== uid);
  notifyQuestions();
  mockListeners.classMembers?.forEach((cb) => cb());
  mockListeners.rewards?.forEach((cb) => cb());
}

// =============================================================
// 수업 자료 (수업하기 모드) — 슬라이드 이미지 + 장별 메모
// -------------------------------------------------------------
// lessons/{lessonId} = { title, ownerId, ownerName, slides[], createdAt }
//   slides: [{ imageUrl, note }] — 배열 순서가 곧 슬라이드 순서
//
// · 특정 반이 아니라 '만든 선생님'에게 귀속됩니다 — 같은 과목을 여러 반에
//   가르칠 때 자료 하나로 모든 반에서 수업할 수 있게.
// · 학생은 이 컬렉션을 읽지 않습니다. 수업 중 보이는 슬라이드는 방송
//   문서(broadcasts)에 담긴 현재 장 이미지 URL 하나뿐입니다.
// · 슬라이드가 많아도 장당 URL+메모라 문서 1MB 제한에 여유가 큽니다.
// =============================================================
function notifyLessons() {
  mockListeners.lessons?.forEach((cb) => cb([...(mock.lessons ?? [])]));
}

// 내가 만든 수업 자료 구독 (최신순)
export function subscribeMyLessons(uid, callback) {
  if (!uid) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    // ownerId 단일 조건 + 클라 정렬(복합 색인 불필요)
    const q = query(collection(db, "lessons"), where("ownerId", "==", uid));
    return onSnapshot(
      q,
      (snap) => callback(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
      ),
      (e) => {
        console.warn("[수업하기] 자료 목록을 읽지 못했어요:", e?.code, e?.message);
        callback([]);
      }
    );
  }
  if (!mock.lessons) mock.lessons = [];
  if (!mockListeners.lessons) mockListeners.lessons = new Set();
  const emit = () => callback([...mock.lessons]);
  mockListeners.lessons.add(emit);
  emit();
  return () => mockListeners.lessons.delete(emit);
}

// 새 수업을 만들 때 기본으로 넣어 두는 활동 안내 예시.
// (지금은 안내 문구 목록일 뿐입니다 — 활동 기능은 나중에 다듬을 예정)
export const DEFAULT_LESSON_ACTIVITIES = [
  "짝과 함께 오늘 배운 것을 한 문장으로 말해 보기",
  "공부방에 활동 결과물을 카드로 남기기",
  "질문방에 아직 궁금한 점 올리기",
];

// [교사] 수업 자료 만들기 — slides는 이미 업로드된 [{ imageUrl, note }]
export async function addLesson(user, { title, slides = [], activities }) {
  const data = {
    title: title || "새 수업",
    ownerId: user.uid,
    ownerName: user.realName || user.displayName || "선생님",
    slides,
    activities: activities ?? [...DEFAULT_LESSON_ACTIVITIES],
  };
  if (isFirebaseConfigured) {
    const ref = await addDoc(collection(db, "lessons"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }
  if (!mock.lessons) mock.lessons = [];
  const id = `lesson${++mockSeq}_m`;
  mock.lessons.unshift({ id, ...data, createdAt: new Date() });
  notifyLessons();
  return id;
}

// [교사] 수업 자료 수정 (제목·장별 메모)
export async function updateLesson(lessonId, patch) {
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "lessons", lessonId), patch);
    return;
  }
  const l = (mock.lessons ?? []).find((x) => x.id === lessonId);
  if (l) Object.assign(l, patch);
  notifyLessons();
}

// [교사] 수업 자료 삭제 — 슬라이드 이미지도 Storage에서 함께 정리
export async function deleteLesson(lessonId, slides = []) {
  if (isFirebaseConfigured) {
    await deleteAttachedFiles({ images: slides.map((s) => s.imageUrl) });
    await deleteDoc(doc(db, "lessons", lessonId));
    return;
  }
  mock.lessons = (mock.lessons ?? []).filter((x) => x.id !== lessonId);
  notifyLessons();
}

// =============================================================
// 발표 강제 전환(방송) — 교사가 발표 모드·크게 보기를 켜면 그 반 학생
// 전원의 화면이 자동으로 그 슬라이드로 바뀝니다(교사 화면은 그대로).
// -------------------------------------------------------------
// broadcasts/{classId} — 반마다 문서 1개. 문서가 있으면 방송 중, 없으면
// 방송 중이 아님(별도 active 플래그 없이 존재 여부로 판단).
//  · mode: 'carousel'(보드 캐러셀) | 'single'(카드 크게 보기)
//  · 이미지는 담지 않고 텍스트만(첨부·이미지 없이 슬라이드로 보여주는
//    발표 화면 설계와 동일한 이유 — 학생 화면에 그대로 밀어 보내므로
//    더더욱 텍스트만 담아야 합니다).
// =============================================================
function notifyBroadcast(classId) {
  mockListeners.broadcasts?.get(classId)?.forEach((cb) => cb(mock.broadcasts?.[classId] ?? null));
}

// [끊긴 방송 자동 해제]
// 방송은 문서가 '있으면 켜짐'이라, 교사 PC가 강제 종료되면 지우는 코드가
// 실행되지 못해 학생 화면이 계속 발표 상태로 묶였습니다.
// 그래서 방송 중에는 교사 쪽에서 주기적으로 문서를 건드리고(하트비트),
// 학생 쪽은 그 신호가 끊기면 방송이 끝난 것으로 보고 화면을 되돌립니다.
const BROADCAST_BEAT_MS = 45 * 1000;   // 교사: 45초마다 살아 있음을 표시
const BROADCAST_STALE_MS = 150 * 1000; // 학생: 2분 30초 동안 소식 없으면 해제
// 이미 오래된 문서(교사가 죽은 뒤 뒤늦게 접속한 학생)는 바로 무시합니다.
// 기기 시계 오차를 감안해 넉넉히 잡습니다.
const BROADCAST_DEAD_MS = 10 * 60 * 1000;

const broadcastBeats = new Map(); // classId → setInterval id

function startBroadcastBeat(classId) {
  if (!isFirebaseConfigured || broadcastBeats.has(classId)) return;
  const id = setInterval(async () => {
    try {
      await updateDoc(doc(db, "broadcasts", classId), { updatedAt: serverTimestamp() });
    } catch {
      // 문서가 이미 지워졌거나 권한이 없으면 하트비트를 멈춥니다.
      stopBroadcastBeat(classId);
    }
  }, BROADCAST_BEAT_MS);
  broadcastBeats.set(classId, id);
}

function stopBroadcastBeat(classId) {
  const id = broadcastBeats.get(classId);
  if (id) clearInterval(id);
  broadcastBeats.delete(classId);
}

// 반의 방송 상태 구독 — 문서 없으면 null
export function subscribeBroadcast(classId, callback) {
  if (!classId) { callback(null); return () => {}; }
  if (isFirebaseConfigured) {
    let timer = null;
    const clearTimer = () => { if (timer) clearTimeout(timer); timer = null; };
    const unsub = onSnapshot(
      doc(db, "broadcasts", classId),
      (snap) => {
        clearTimer();
        if (!snap.exists()) { callback(null); return; }
        const data = { id: snap.id, ...snap.data() };
        const t = data.updatedAt?.toMillis?.() ?? 0;
        // 서버 시각이 아직 확정되지 않은 순간(내 쓰기 직후)엔 그대로 두고
        // 다음 스냅샷을 기다립니다.
        if (!t) { callback(data); return; }
        if (Date.now() - t > BROADCAST_DEAD_MS) { callback(null); return; }
        callback(data);
        // 하트비트가 오면 스냅샷이 다시 와서 이 타이머가 초기화됩니다.
        // 오지 않으면 방송이 끊긴 것이므로 학생 화면을 원래대로 되돌립니다.
        // (시계 오차와 무관하게 '받은 시점'부터 재므로 안전합니다)
        timer = setTimeout(() => callback(null), BROADCAST_STALE_MS);
      },
      () => { clearTimer(); callback(null); }
    );
    return () => { clearTimer(); unsub(); };
  }
  if (!mock.broadcasts) mock.broadcasts = {};
  if (!mockListeners.broadcasts) mockListeners.broadcasts = new Map();
  if (!mockListeners.broadcasts.has(classId)) mockListeners.broadcasts.set(classId, new Set());
  const emit = (v) => callback(v);
  mockListeners.broadcasts.get(classId).add(emit);
  emit(mock.broadcasts[classId] ?? null);
  return () => mockListeners.broadcasts.get(classId)?.delete(emit);
}

// [교사] 방송 시작/내용 갱신 — 매번 전체 덮어쓰기(merge 없이)라 이전 필드가 남지 않음
export async function startBroadcast(user, classId, payload) {
  const data = { classId, startedBy: user.uid, updatedAt: serverTimestamp(), ...payload };
  if (isFirebaseConfigured) {
    await setDoc(doc(db, "broadcasts", classId), data);
    // 방송이 살아 있음을 주기적으로 알립니다 — 교사 PC가 갑자기 꺼지면
    // 이 신호가 끊기고, 학생 화면은 스스로 발표 상태에서 빠져나옵니다.
    startBroadcastBeat(classId);
    return;
  }
  if (!mock.broadcasts) mock.broadcasts = {};
  mock.broadcasts[classId] = { id: classId, ...data, updatedAt: new Date() };
  notifyBroadcast(classId);
}

// [교사] 방송 종료 — 문서를 지워 학생 화면이 즉시 원래대로 돌아가게 함
export async function stopBroadcast(classId) {
  if (!classId) return;
  stopBroadcastBeat(classId);
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "broadcasts", classId));
    return;
  }
  if (mock.broadcasts) delete mock.broadcasts[classId];
  notifyBroadcast(classId);
}

// =============================================================
// 학생 참여 상태 (Presence) — 발표 중 학생 화면이 실제로 보이는지
// -------------------------------------------------------------
// presence/{uid}_{classId} = { classId, uid, visible, updatedAt }
//  · 학생: 발표(방송) 중일 때만 올립니다. 브라우저 탭이 가려지면
//    visible=false, 다시 보이면 true. 20초마다 살아 있음도 함께 알립니다.
//  · 교사: 그 반의 상태를 실시간으로 읽어 '전광판'에 표시합니다.
//  · 60초 넘게 소식이 없으면 접속이 끊긴 것으로 봅니다(회색).
//    방송과 같은 이유 — PC가 갑자기 꺼지면 지우는 코드가 못 돕니다.
// =============================================================
export const PRESENCE_BEAT_MS = 20 * 1000;
export const PRESENCE_STALE_MS = 60 * 1000;

function notifyPresence(classId) {
  const list = Object.values(mock.presence ?? {}).filter((p) => p.classId === classId);
  mockListeners.presence?.get(classId)?.forEach((cb) => cb(list));
}

// [학생] 내 화면이 보이는지 알립니다(본인 문서만 씀).
export async function reportPresence(user, classId, visible) {
  if (!user?.uid || !classId) return;
  const id = `${user.uid}_${classId}`;
  const data = { classId, uid: user.uid, visible: !!visible };
  if (isFirebaseConfigured) {
    // 실패해도 수업 진행에는 지장이 없으므로 조용히 넘어갑니다.
    try {
      await setDoc(doc(db, "presence", id), { ...data, updatedAt: serverTimestamp() });
    } catch { /* 권한·네트워크 오류 무시 */ }
    return;
  }
  if (!mock.presence) mock.presence = {};
  mock.presence[id] = { id, ...data, updatedAt: new Date() };
  notifyPresence(classId);
}

// [교사] 반 학생들의 참여 상태 구독 → [{ uid, visible, updatedAt }]
export function subscribePresence(classId, callback) {
  if (!classId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const q = query(collection(db, "presence"), where("classId", "==", classId));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => callback([])
    );
  }
  if (!mock.presence) mock.presence = {};
  if (!mockListeners.presence) mockListeners.presence = new Map();
  if (!mockListeners.presence.has(classId)) mockListeners.presence.set(classId, new Set());
  const emit = (v) => callback(v);
  mockListeners.presence.get(classId).add(emit);
  emit(Object.values(mock.presence).filter((p) => p.classId === classId));
  return () => mockListeners.presence.get(classId)?.delete(emit);
}

// =============================================================
// 언제든 질문하기 — 학생 손들기 신호
// -------------------------------------------------------------
// classes/{classId}/questionSignals/{uid}
//   = { classId, uid, name, studentId, emoji, createdAt, updatedAt }
// 학생은 자기 문서를 만들거나 지우고, 교사는 반 전체 목록을 봅니다.
// =============================================================
function notifyQuestionSignals(classId) {
  const list = Object.values(mock.questionSignals ?? {}).filter((s) => s.classId === classId);
  mockListeners.questionSignals?.get(classId)?.forEach((cb) => cb(list));
}

function signalIdentity(user) {
  return {
    name: user.realName || user.displayName || "이름 미설정",
    studentId: user.studentId || null,
    emoji: user.emoji || "🙂",
  };
}

function sortQuestionSignals(list) {
  return [...list].sort((a, b) => toDate(a.createdAt) - toDate(b.createdAt));
}

// [교사] 현재 반에서 손든 학생 목록 구독
export function subscribeQuestionSignals(classId, callback) {
  if (!classId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const q = collection(db, "classes", classId, "questionSignals");
    return onSnapshot(
      q,
      (snap) => callback(sortQuestionSignals(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      (e) => { console.warn("[질문하기] 손든 학생 목록을 읽지 못했어요:", e?.code, e?.message); callback([]); }
    );
  }
  if (!mock.questionSignals) mock.questionSignals = {};
  if (!mockListeners.questionSignals.has(classId)) mockListeners.questionSignals.set(classId, new Set());
  const emit = () =>
    callback(sortQuestionSignals(Object.values(mock.questionSignals).filter((s) => s.classId === classId)));
  mockListeners.questionSignals.get(classId).add(emit);
  emit();
  return () => mockListeners.questionSignals.get(classId)?.delete(emit);
}

// [학생] 내 손들기 상태만 구독
export function subscribeMyQuestionSignal(classId, uid, callback) {
  if (!classId || !uid) { callback(null); return () => {}; }
  const id = `${uid}_${classId}`;
  if (isFirebaseConfigured) {
    return onSnapshot(
      doc(db, "classes", classId, "questionSignals", uid),
      (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (e) => { console.warn("[질문하기] 내 손들기 상태를 읽지 못했어요:", e?.code, e?.message); callback(null); }
    );
  }
  if (!mock.questionSignals) mock.questionSignals = {};
  if (!mockListeners.questionSignals.has(classId)) mockListeners.questionSignals.set(classId, new Set());
  const emit = () => callback(mock.questionSignals[id] ?? null);
  mockListeners.questionSignals.get(classId).add(emit);
  emit();
  return () => mockListeners.questionSignals.get(classId)?.delete(emit);
}

// [학생] 손들기 켜기/끄기
export async function setQuestionSignal(classId, user, active) {
  if (!classId || !user?.uid) return;
  const id = `${user.uid}_${classId}`;
  if (isFirebaseConfigured) {
    const ref = doc(db, "classes", classId, "questionSignals", user.uid);
    if (!active) {
      await deleteDoc(ref);
      return;
    }
    const prev = await getDoc(ref);
    await setDoc(
      ref,
      {
        classId,
        uid: user.uid,
        ...signalIdentity(user),
        createdAt: prev.exists() ? prev.data().createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }
  if (!mock.questionSignals) mock.questionSignals = {};
  if (active) {
    const prev = mock.questionSignals[id];
    mock.questionSignals[id] = {
      id,
      classId,
      uid: user.uid,
      ...signalIdentity(user),
      createdAt: prev?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
  } else {
    delete mock.questionSignals[id];
  }
  notifyQuestionSignals(classId);
}

// -------------------------------------------------------------
// 표시용 시간 포맷 ("방금 전", "5분 전" 등)
// -------------------------------------------------------------
export function formatTime(value) {
  const date = toDate(value);
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}일 전`;
  return date.toLocaleDateString("ko-KR");
}

// =============================================================
// 책방 — 닿소리 채우기 활동 (모둠 협동)
// -------------------------------------------------------------
// bookActivities/{actId}                          — 활동 (반별)
//   classId, title, topic(주제어/도서명), groupMode, maxPerGroup,
//   locked, createdBy
// bookActivities/{actId}/groups/{groupId}         — 모둠 메타 (문서ID=group_N)
//   groupIndex, groupName, memberUids[], members[], leaderUid
// bookActivities/{actId}/groups/{groupId}/words/{wordId}  — 단어 1개
//   cellKey('c0'~'c13'), text, authorId, authorName, createdAt
//
// [모둠 메타와 단어를 나눈 이유]
// 모둠 대시보드에는 전체 모둠 카드가 보여야 하지만(누가 어느 모둠인지),
// 활동 중 남의 모둠 '단어'는 보이면 안 됩니다. 한 문서에 같이 두면 카드를
// 읽는 순간 단어까지 딸려오므로, 읽기 권한을 따로 걸 수 있게 분리했습니다.
// 단어를 문서 1건씩 쪼갠 덕분에 한 모둠에서 동시에 입력해도 충돌이 없습니다.
//
// [모둠 구성 방식] groupMode
//   'teacher' — 교사가 사전 배정 (GroupComposer 직접 구성)
//   'random'  — 무작위 균등 배정 (GroupComposer 자동 구성)
//   'free'    — 학생이 빈 모둠에 스스로 참여 (교사는 모둠 수만 지정)
// =============================================================
export const BOOK_GROUP_MODES = ["teacher", "random", "free"];

// 활동 종류 — 'consonant'는 모둠 협동, 나머지는 개인 활동입니다.
// 개인 활동(paratext·raft·kwls·mindmap)은 모둠 대신 학생 1명당 문서 1개
// (entries/{uid})를 씁니다. 담기는 answers의 모양만 다를 뿐 저장 위치와
// 규칙은 같습니다(마인드맵은 칸 맵이 아니라 { layout, nodes }를 담습니다).
export const BOOK_ACTIVITY_TYPES = ["consonant", "paratext", "raft", "kwls", "mindmap"];
export const BOOK_SOLO_TYPES = ["paratext", "raft", "kwls", "mindmap"];

function ensureMockBooks() {
  if (!mock.bookActivities) mock.bookActivities = [];
  if (!mock.bookGroups) mock.bookGroups = [];
  if (!mock.bookWords) mock.bookWords = [];
  if (!mock.bookEntries) mock.bookEntries = [];
  if (!mockListeners.bookActivities) mockListeners.bookActivities = new Set();
  if (!mockListeners.bookGroups) mockListeners.bookGroups = new Map();
  if (!mockListeners.bookWords) mockListeners.bookWords = new Map();
  if (!mockListeners.bookEntries) mockListeners.bookEntries = new Map();
}
function notifyBookActivities() {
  ensureMockBooks();
  mockListeners.bookActivities.forEach((cb) => cb());
}
function notifyBookGroups(actId) {
  ensureMockBooks();
  mockListeners.bookGroups.get(actId)?.forEach((cb) => cb());
}
function notifyBookWords(actId, groupId) {
  ensureMockBooks();
  mockListeners.bookWords.get(`${actId}_${groupId}`)?.forEach((cb) => cb());
}
function notifyBookEntries(actId) {
  ensureMockBooks();
  mockListeners.bookEntries.get(actId)?.forEach((cb) => cb());
}

// ─── 활동 ────────────────────────────────────────────────────
// 반의 활동 목록 구독 (최신순)
export function subscribeBookActivities(classId, callback) {
  if (!classId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const q = query(collection(db, "bookActivities"), where("classId", "==", classId));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt));
        callback(list);
      },
      (e) => { console.warn("[책방] 활동 목록을 읽지 못했어요:", e?.code, e?.message); callback([]); }
    );
  }
  ensureMockBooks();
  const emit = () => callback(mock.bookActivities.filter((a) => a.classId === classId));
  mockListeners.bookActivities.add(emit);
  emit();
  return () => mockListeners.bookActivities.delete(emit);
}

// [교사] 활동 만들기 — 모둠을 한 번에 만들어 둡니다.
// groupNames를 주면 그 이름으로, 없으면 '1모둠, 2모둠…'으로 붙습니다.
// 교사 배정·무작위 모드에서도 미리 만들어 두면 모둠 구성 때 이름이 유지됩니다.
export async function addBookActivity(
  user,
  {
    classId,
    type = "consonant",
    title,
    topic,
    bookUrl = "",
    groupMode = "teacher",
    groupCount = 4,
    maxPerGroup = 6,
    groupNames = [],
    baseGroups = [],
  }
) {
  // 개인 활동(곁텍스트 읽기·RAFT·KWLS·마인드맵)은 모둠을 만들지 않습니다.
  const kind = BOOK_ACTIVITY_TYPES.includes(type) ? type : "consonant";
  if (BOOK_SOLO_TYPES.includes(kind)) groupCount = 0;

  const defaultTitle =
    {
      paratext: "곁텍스트 읽기",
      raft: "RAFT 글쓰기",
      kwls: "KWLS로 성찰하기",
      mindmap: "마인드맵",
    }[kind] ?? "닿소리 채우기";
  const initialGroups = BOOK_SOLO_TYPES.includes(kind) ? [] : normalizeStudyGroups(baseGroups);
  if (initialGroups.length > 0) groupCount = initialGroups.length;
  const nameAt = (i) => (groupNames[i - 1] || "").trim() || `${i}모둠`;
  const data = {
    classId,
    type: kind,
    title: (title || "").trim() || defaultTitle,
    topic: (topic || "").trim(),
    // 교사가 준 도서 정보 사이트 주소 (학생 화면의 '도서 정보' 버튼)
    bookUrl: (bookUrl || "").trim(),
    groupMode: BOOK_GROUP_MODES.includes(groupMode) ? groupMode : "teacher",
    groupSetName: `${((topic || "").trim() || (title || "").trim() || defaultTitle)} 활동 모둠`,
    maxPerGroup,
    locked: false,
    createdBy: user.uid,
  };
  if (isFirebaseConfigured) {
    const ref = await addDoc(collection(db, "bookActivities"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    if (groupCount > 0) {
      const batch = writeBatch(db);
      for (let i = 1; i <= groupCount; i++) {
        const baseGroup = initialGroups[i - 1] ?? null;
        batch.set(doc(db, "bookActivities", ref.id, "groups", `group_${i}`), {
          activityId: ref.id,
          groupIndex: i,
          groupName: baseGroup?.name || nameAt(i),
          groupSetName: data.groupSetName,
          memberUids: baseGroup?.memberUids ?? [],
          members: baseGroup?.members ?? [],
          leaderUid: null,
          retired: false,
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
    return ref.id;
  }
  ensureMockBooks();
  const id = `ba${++mockSeq}_m`;
  mock.bookActivities.unshift({ id, ...data, createdAt: new Date() });
  for (let i = 1; i <= groupCount; i++) {
    const baseGroup = initialGroups[i - 1] ?? null;
    mock.bookGroups.push({
      id: `group_${i}`, activityId: id, groupIndex: i,
      groupName: baseGroup?.name || nameAt(i), groupSetName: data.groupSetName,
      memberUids: baseGroup?.memberUids ?? [], members: baseGroup?.members ?? [], leaderUid: null, retired: false,
    });
  }
  notifyBookActivities();
  return id;
}

// [교사] 활동 수정 (주제어 변경, 잠금 토글 등)
export async function updateBookActivity(actId, patch) {
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "bookActivities", actId), patch);
    return;
  }
  ensureMockBooks();
  const target = mock.bookActivities.find((a) => a.id === actId);
  if (target) Object.assign(target, patch);
  notifyBookActivities();
}

// [교사] 활동 삭제 — 모둠·단어·개인 기록까지 함께 정리
export async function deleteBookActivity(actId) {
  if (isFirebaseConfigured) {
    const groups = await getDocs(collection(db, "bookActivities", actId, "groups"));
    for (const g of groups.docs) {
      const words = await getDocs(collection(g.ref, "words"));
      await Promise.all(words.docs.map((w) => deleteDoc(w.ref)));
      await deleteDoc(g.ref);
    }
    // 곁텍스트 읽기(개인 활동)의 학생 기록
    const entries = await getDocs(collection(db, "bookActivities", actId, "entries"));
    await Promise.all(entries.docs.map((e) => deleteDoc(e.ref)));
    await deleteDoc(doc(db, "bookActivities", actId));
    return;
  }
  ensureMockBooks();
  mock.bookActivities = mock.bookActivities.filter((a) => a.id !== actId);
  mock.bookGroups = mock.bookGroups.filter((g) => g.activityId !== actId);
  mock.bookWords = mock.bookWords.filter((w) => w.activityId !== actId);
  mock.bookEntries = mock.bookEntries.filter((e) => e.activityId !== actId);
  notifyBookActivities();
  notifyBookGroups(actId);
  notifyBookEntries(actId);
}

// ─── 모둠 ────────────────────────────────────────────────────
// 활동의 모둠 목록 구독 — 대시보드에서 전체 모둠 카드를 보여줍니다.
export function subscribeBookGroups(actId, callback) {
  if (!actId) { callback([]); return () => {}; }
  const sortAndSend = (list) => {
    callback(
      list
        .filter((g) => !g.retired)
        .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0))
    );
  };
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "bookActivities", actId, "groups"),
      (snap) => sortAndSend(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => { console.warn("[책방] 모둠 목록을 읽지 못했어요:", e?.code, e?.message); callback([]); }
    );
  }
  ensureMockBooks();
  if (!mockListeners.bookGroups.has(actId)) mockListeners.bookGroups.set(actId, new Set());
  const emit = () => sortAndSend(mock.bookGroups.filter((g) => g.activityId === actId));
  mockListeners.bookGroups.get(actId).add(emit);
  emit();
  return () => mockListeners.bookGroups.get(actId)?.delete(emit);
}

// [교사] 모둠 구성 — GroupComposer가 넘겨준 배열을 저장.
// 재구성해도 이미 입력한 단어(words 하위 컬렉션)는 그대로 남습니다.
export async function composeBookGroups(user, actId, groups, options = {}) {
  const groupSetName = options.groupSetName || groups[0]?.groupSetName || "활동 모둠";
  if (isFirebaseConfigured) {
    const snap = await getDocs(collection(db, "bookActivities", actId, "groups"));
    const existingIds = snap.docs.map((d) => d.id);
    const batch = writeBatch(db);
    groups.forEach((g) => {
      const id = `group_${g.index}`;
      const fields = {
        activityId: actId,
        groupIndex: g.index,
        groupName: g.name,
        groupSetName,
        memberUids: g.memberUids,
        members: g.members,
        leaderUid: g.leaderUid ?? null,
        retired: false,
        updatedAt: serverTimestamp(),
      };
      const ref = doc(db, "bookActivities", actId, "groups", id);
      if (existingIds.includes(id)) batch.set(ref, fields, { merge: true });
      else batch.set(ref, { ...fields, createdAt: serverTimestamp() });
    });
    const keep = new Set(groups.map((g) => `group_${g.index}`));
    existingIds.filter((id) => !keep.has(id)).forEach((id) => {
      batch.set(doc(db, "bookActivities", actId, "groups", id), { retired: true }, { merge: true });
    });
    await batch.commit();
    return;
  }
  ensureMockBooks();
  const keep = new Set(groups.map((g) => `group_${g.index}`));
  mock.bookGroups.forEach((g) => {
    if (g.activityId === actId && !keep.has(g.id)) g.retired = true;
  });
  groups.forEach((g) => {
    const id = `group_${g.index}`;
    const existing = mock.bookGroups.find((x) => x.activityId === actId && x.id === id);
    const fields = {
      groupIndex: g.index, groupName: g.name, groupSetName, memberUids: g.memberUids,
      members: g.members, leaderUid: g.leaderUid ?? null, retired: false,
    };
    if (existing) Object.assign(existing, fields);
    else mock.bookGroups.push({ id, activityId: actId, ...fields });
  });
  notifyBookGroups(actId);
}

// [학생] 자유 구성 모드에서 모둠 참여 — 자기 정보만 명단에 넣습니다.
export async function joinBookGroup(actId, groupId, user) {
  const me = { uid: user.uid, name: user.realName || user.displayName, emoji: user.emoji ?? "🙂" };
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "bookActivities", actId, "groups", groupId), {
      memberUids: arrayUnion(user.uid),
      members: arrayUnion(me),
    });
    return;
  }
  ensureMockBooks();
  const g = mock.bookGroups.find((x) => x.activityId === actId && x.id === groupId);
  if (g && !g.memberUids.includes(user.uid)) {
    g.memberUids = [...g.memberUids, user.uid];
    g.members = [...g.members, me];
  }
  notifyBookGroups(actId);
}

// [학생] 모둠에서 나가기 — 저장된 객체와 같아야 지워지므로 명단에서 찾아 넘깁니다.
export async function leaveBookGroup(actId, groupId, user, storedMember = null) {
  if (isFirebaseConfigured) {
    const patch = { memberUids: arrayRemove(user.uid) };
    if (storedMember) patch.members = arrayRemove(storedMember);
    await updateDoc(doc(db, "bookActivities", actId, "groups", groupId), patch);
    return;
  }
  ensureMockBooks();
  const g = mock.bookGroups.find((x) => x.activityId === actId && x.id === groupId);
  if (g) {
    g.memberUids = g.memberUids.filter((u) => u !== user.uid);
    g.members = g.members.filter((m) => m.uid !== user.uid);
  }
  notifyBookGroups(actId);
}

// ─── 단어 ────────────────────────────────────────────────────
// 한 모둠의 단어 구독 (자기 모둠 판 / 교사 집계 화면 공통)
export function subscribeGroupWords(actId, groupId, callback) {
  if (!actId || !groupId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "bookActivities", actId, "groups", groupId, "words"),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => { console.warn("[책방] 단어를 읽지 못했어요:", e?.code, e?.message); callback([]); }
    );
  }
  ensureMockBooks();
  const key = `${actId}_${groupId}`;
  if (!mockListeners.bookWords.has(key)) mockListeners.bookWords.set(key, new Set());
  const emit = () =>
    callback(mock.bookWords.filter((w) => w.activityId === actId && w.groupId === groupId));
  mockListeners.bookWords.get(key).add(emit);
  emit();
  return () => mockListeners.bookWords.get(key)?.delete(emit);
}

// 단어 추가 — 문서 1건이라 같은 모둠에서 동시에 입력해도 서로 덮어쓰지 않습니다.
export async function addConsonantWord(actId, groupId, { cellKey, text }, user) {
  const data = {
    activityId: actId,
    groupId,
    cellKey,
    text: text.trim(),
    authorId: user.uid,
    authorName: user.realName || user.displayName,
  };
  if (isFirebaseConfigured) {
    await addDoc(collection(db, "bookActivities", actId, "groups", groupId, "words"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return;
  }
  ensureMockBooks();
  mock.bookWords.push({ id: `bw${++mockSeq}_m`, ...data, createdAt: new Date() });
  notifyBookWords(actId, groupId);
}

export async function deleteConsonantWord(actId, groupId, wordId) {
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "bookActivities", actId, "groups", groupId, "words", wordId));
    return;
  }
  ensureMockBooks();
  mock.bookWords = mock.bookWords.filter((w) => w.id !== wordId);
  notifyBookWords(actId, groupId);
}

// ─── 곁텍스트 읽기 — 개인 기록 ────────────────────────────────
// bookActivities/{actId}/entries/{uid} — 학생 1명당 문서 1개
//   문서 ID를 학생 uid로 두어 '한 사람이 여러 장을 만드는 일'을 막습니다
//   (닿소리 활동의 모둠 카드가 문서ID=uid인 것과 같은 방식).
//   answers는 lib/paratext.js가 정한 칸 키를 그대로 담는 한 겹 맵입니다.

// [교사] 이 활동에 들어온 학생 기록 전체 — 학생별 카드에 진행 상황을 표시합니다.
export function subscribeParatextEntries(actId, callback) {
  if (!actId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "bookActivities", actId, "entries"),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => {
        console.warn("[책방] 곁텍스트 기록을 읽지 못했어요:", e?.code, e?.message);
        callback([]);
      }
    );
  }
  ensureMockBooks();
  if (!mockListeners.bookEntries.has(actId)) mockListeners.bookEntries.set(actId, new Set());
  const emit = () => callback(mock.bookEntries.filter((e) => e.activityId === actId));
  mockListeners.bookEntries.get(actId).add(emit);
  emit();
  return () => mockListeners.bookEntries.get(actId)?.delete(emit);
}

// [학생] 내 기록 하나 — 없으면 null. 입력 화면이 처음 열릴 때 불러옵니다.
export function subscribeMyParatextEntry(actId, uid, callback) {
  if (!actId || !uid) { callback(null); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      doc(db, "bookActivities", actId, "entries", uid),
      (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (e) => {
        console.warn("[책방] 내 곁텍스트 기록을 읽지 못했어요:", e?.code, e?.message);
        callback(null);
      }
    );
  }
  ensureMockBooks();
  if (!mockListeners.bookEntries.has(actId)) mockListeners.bookEntries.set(actId, new Set());
  const emit = () =>
    callback(
      mock.bookEntries.find((e) => e.activityId === actId && e.authorId === uid) ?? null
    );
  mockListeners.bookEntries.get(actId).add(emit);
  emit();
  return () => mockListeners.bookEntries.get(actId)?.delete(emit);
}

// [학생] 내 기록 저장 — 같은 문서에 덮어씁니다(merge). 자동 저장이라 자주 불립니다.
export async function saveParatextEntry(actId, user, answers) {
  const data = {
    activityId: actId,
    authorId: user.uid,
    // 교사 화면에서 누구 것인지 보여야 하므로 실명을 함께 둡니다
    // (곁텍스트는 익명 게시물이 아니라 제출물이라 학생 본인·교사만 읽습니다)
    authorName: user.realName || user.displayName || "이름 미설정",
    answers,
  };
  if (isFirebaseConfigured) {
    await setDoc(
      doc(db, "bookActivities", actId, "entries", user.uid),
      { ...data, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return;
  }
  ensureMockBooks();
  const found = mock.bookEntries.find(
    (e) => e.activityId === actId && e.authorId === user.uid
  );
  if (found) Object.assign(found, data, { updatedAt: new Date() });
  else mock.bookEntries.push({ id: user.uid, ...data, updatedAt: new Date() });
  notifyBookEntries(actId);
}

