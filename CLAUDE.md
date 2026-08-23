# class-peer-qna — 프로젝트 컨텍스트

수업 중 학생 질문·답변을 실시간으로 공유하는 교실용 Q&A 웹앱.

## 기술 스택

- **프레임워크**: Next.js 15.5 App Router, React 18 (Client Components)
- **DB**: Firebase Firestore (실서비스) / 브라우저 인메모리 Mock (데모 모드)
- **스타일**: 단일 CSS 파일 `app/globals.css` (CSS Variables + Flexbox)
- **배포**: Vercel

## 실행

```bash
npm run dev        # 개발 서버 (http://localhost:3000)
npm run build      # 프로덕션 빌드
npm run test:rules # Firestore 보안 규칙 테스트 (에뮬레이터, Java 필요)
```

규칙 테스트는 `tests/rules/`에 있고 최초 1회 `cd tests/rules && npm install`이
필요합니다. 루트와 분리한 이유·작성 시 주의점은 `tests/rules/README.md` 참고.
**`firestore.rules`를 고치면 반드시 이 테스트를 돌리고 배포하세요.**

Firebase 미설정 시 자동으로 **데모 모드**로 동작 (새로고침 시 데이터 초기화).
실서비스 전환: `lib/firebase.js`의 `firebaseConfig`에 Firebase 콘솔 값 입력.

## 주요 페이지

| 경로 | 설명 |
|------|------|
| `/` | 랜딩 — 수업 코드 입력 |
| `/board` | 질문 게시판 (3단 레이아웃: 키워드·피드·공지) |
| `/study` | 공부방 (Trello형 보드 + KWL 패널) |
| `/admin` | 관리자 대시보드 |
| `/report` | 학생 학습 리포트 |

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `lib/store.js` | Firestore CRUD + Mock Store + 구독(subscribe) 함수 전체 |
| `lib/user.js` | `getCurrentUser()`, `isAdmin()` — 세션 기반 사용자 |
| `lib/firebase.js` | Firebase 초기화. `isFirebaseConfigured` 플래그로 모드 분기 |
| `app/globals.css` | 전체 스타일. 모바일 반응형은 파일 하단 `@media (max-width: 768px)` |
| `components/QuestionModal.jsx` | 질문 상세 모달 (2열 데스크톱 / 단일스크롤 모바일) |
| `components/RichTextEditor.jsx` | 서식 입력 에디터 (variant: full/chat) |
| `components/KwlPanel.jsx` | KWL 사이드 패널 (오늘 탭 + 기록 탭) |
| `components/ActivityHeatmap.jsx` | 52주 잔디 히트맵 + ActivityOverview 통합 패널 |
| `components/ActivityOverview.jsx` | 오각형 레이더 차트 + 막대 요약 (학습 균형) |
| `components/PythonRunner.jsx` | Python 코드 실행기 (코드 복사 버튼 포함) |

## 모바일 레이아웃 핵심 패턴

### QuestionModal (모바일)
- `modal-wide`: `height: 100dvh`, `overflow: hidden`, flex-column
- `qa-grid`: 단일 스크롤 컨테이너 (`overflow-y: auto`)
- `qa-mobile-header`: `position: sticky; top: 0; z-index: 2` — 스크롤해도 제목 탭 고정
- `qa-right`: `display: contents` → 자식(chat-head/chat-scroll/chat-compose)이 qa-grid 플렉스 아이템으로 편입
- `chat-scroll`: `flex: none; overflow-y: visible; min-height: 50vh` — 독립 스크롤 없음
- 자동 스크롤: `scrollRef`(qa-grid, 모바일) + `chatScrollRef`(chat-scroll, 데스크톱) 이중 처리

### 공부방
- 수평 스냅 스크롤: `scroll-snap-type: x mandatory`
- KWL 모바일: FAB 버튼(`kwl-fab`) → `kwl-panel--open` 클래스로 오버레이 패널

## 역할 구분

- **교사(isTeacher)**: 공지 작성, 전체 학생 카드 열람, 보드 설정, 정렬
- **학생**: 질문 1개 작성, 보드당 카드 1개 작성, KWL 작성
- **관리자(isAdmin)**: 실명 확인, 답변 이해 표시, 회고 현황 확인

역할 전환 (개발용): `RoleSwitcher` 컴포넌트 (`role-switch` CSS 클래스, 모바일에서 숨김)

## 데이터 모델 (Firestore 컬렉션)

- `questions` — 질문 (keyword, authorId, resolved, meTooIds[], reflection) — 익명 닉네임만(authorName/authorEmoji)
- `answers` — 답변 (questionId, authorId, understood)
- `studyBoards` — 공부방 보드 (classId, type, viewMode, editMode, keywords[])
- `studyBoards/{boardId}/cards` — 공부방 카드 **서브컬렉션** (boardId, authorId, authorName, authorEmoji)
  - 문서 ID = 작성자 uid → 보드당 카드 1개 보장. 전체 조회는 `collectionGroup("cards")` 사용
  - (데모 모드 mock은 평면 배열 `mock.studyCards`로 흉내 — Firebase는 서브컬렉션)
- `kwl` — KWL 기록 (classId, userId, date, K, W, L) — append 모델 (저장마다 새 문서)
- `users` — 사용자 프로필 (uid, email, displayName(익명), realName, studentId, role)
  - **식별 정보(실명·이메일·학번)는 여기에만** 저장. 게시물·카드엔 익명 정보만 넣음.
  - 읽기 규칙: 본인+교사. 교사 화면은 `subscribeUserDirectory`로 uid→실명/학번 조회.

## 시각화 컴포넌트 구조 (admin/report 공통)

### 차트 레이아웃 (2행)
- **1행**: `.admin-charts { display: grid; grid-template-columns: repeat(4, 1fr) }` — 도넛/막대 차트 4개
- **2행**: `<ActivityHeatmap>` — 52주 히트맵 + 레이더 오버뷰 풀 폭

### ActivityHeatmap 레이아웃 패턴 (중요)
- `.heatmap-outer`: flex row, `gap: 0` — 히트맵 영역 + ActivityOverview 나란히
- `.heatmap-body`: `flex: 1; overflow-x: auto` — 히트맵 전체 폭 차지
- `.heatmap-day-col`: 요일 레이블 컬럼 (고정 폭)
- `.heatmap-right`: `flex: 1; min-width: 0; display: flex; flex-direction: column` — 내부 column flex
- `.heatmap-week`: **`flex: 1; min-width: 13px`** — 주 컬럼이 가용 폭을 균등 분할 (고정 폭 아님)
- `.heatmap-cell`: **width 없음** — 부모 week 폭에 맞게 자동 확장 (고정 폭이면 그리드가 패널 폭을 못 채움)
- `.heatmap-legend-swatch`: 범례 스와치는 **별도 클래스**, `width: 15px` 고정 (heatmap-cell과 혼용 금지)
- `.activity-overview`: `flex-shrink: 0; width: 350px; border-left; margin-left: 20px; padding-left: 20px` — 구분선 양쪽 20px 대칭

### ActivityOverview 값 계산
- **관리자**: 클래스 내 최대값 기준으로 정규화 (`Math.min(value / classMax, 1)`)
- **학생 리포트**: 고정 기준 (질문·답변 10개=100%, 공감 15개=100%)

### PythonRunner 복사 버튼
- `.py-copy-btn` — `py-head-actions` 안, '전체 화면' 버튼 왼쪽에 위치
- 복사 후 2초간 초록 체크 아이콘으로 교체 (`copied` state)

## 주의 사항

- `store.js`의 Mock 구현과 Firebase 구현을 **항상 동기화**할 것
  (함수 추가 시 두 분기 모두 작성)
- `saveKwl` (upsert)은 제거됨 — `addKwl` (append)만 사용
- `subscribeMyKwl` (단일 반환)은 제거됨 — `subscribeMyTodayKwl` (배열 반환)만 사용
- CSS `@media (max-width: 760px)` 블록이 별도 존재함 — 768px 블록에서 필요 시 덮어쓸 것
- 채팅 입력: Enter 단독은 줄바꿈, **Ctrl/⌘+Enter는 전송** (전송 버튼도 유지)
- **pdf.js는 반드시 `legacy` 빌드**를 쓸 것 (`pdfjs-dist/legacy/build/…`).
  기본 빌드는 `Map.prototype.getOrInsertComputed` 등 최신 문법을 써서
  Chromium 141에서도 `render()`가 실패함(실측). `lib/pdfSlides.js`의 import와
  `scripts/copy-pdf-worker.mjs`가 복사하는 워커는 **항상 같은 빌드로** 맞출 것
- pdf.js 워커는 CSP(`worker-src 'self'`) 때문에 CDN 불가 — `public/`에 복사해
  같은 출처에서 서빙 (prebuild·predev에서 자동 실행, 생성물이라 git 제외)
