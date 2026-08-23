# 배움나눔 — 학생 질문/답변 웹 앱

학생들이 공부하다 이해하기 어려운 내용을 서로 질문하고 답변하는 학습 커뮤니티입니다.
질문 게시판(반 공유) + 반별 공부방 + KWL 성찰 + 관리자 대시보드로 구성됩니다.

## 실행 방법

```bash
npm install
npm run dev   # http://localhost:3000
npm run build # 프로덕션 빌드
```

## 동작 모드

앱은 `lib/firebase.js`의 설정 유무에 따라 두 모드로 동작합니다.

- **실서비스 모드** (Firebase 설정됨 · 현재 상태): Firebase Authentication으로
  실제 로그인/회원가입하고, 데이터는 Firestore에 저장됩니다. 권한은
  Firestore 보안 규칙과 Cloud Functions가 서버에서 강제합니다.
- **데모 모드** (Firebase 미설정): 브라우저 메모리에 임시 저장(새로고침 시
  초기화)되고, 테스트 유저로 자동 입장합니다. 화면·기능을 빠르게 확인할 때만
  쓰입니다. (`lib/user.js`의 `TEST_USER`)

## 인증과 권한

- **로그인**: 이메일/비밀번호 + Google 로그인 (`lib/auth.js`). 로그인 시
  `users/{uid}` 프로필을 보장하고, 학생은 접속 세션마다 새 익명 닉네임을 받습니다.
- **역할 구조**: 최고 관리자(1명) → 선생님(중간 관리자) → 학생.
  - **최고 관리자**: 부트스트랩 이메일로 지정(코드에 하드코딩). 역할 부여·
    선생님 승인/탈퇴 등 최상위 권한.
  - **선생님**: 회원가입 시 "선생님"으로 신청 → 최고 관리자 승인 시 부여.
    대시보드·공지·학생 관리 등 대부분의 관리 권한.
  - **학생**: 기본 역할. 질문/답변, 공부방 카드, KWL 작성.
- **권한 부여**: 클라이언트가 스스로 못 바꾸며, Cloud Functions `setUserRole`이
  커스텀 클레임으로만 부여합니다. 보안 규칙은 `request.auth.token.role`을
  검사합니다. 화면의 `isAdmin(user)`는 UI 노출용일 뿐, 실제 강제는 규칙입니다.

## 배포

- **프론트엔드**: Vercel — `main`에 push하면 자동 배포됩니다.
- **Firebase(규칙·색인·함수·Storage 규칙)**: 저장소 파일을 원본으로 삼아
  CLI로 배포합니다(콘솔에서 직접 수정하지 마세요).

```bash
firebase deploy --only firestore,storage,functions
# 또는 개별: firestore:rules / firestore:indexes / storage / functions
```

- `firestore.rules` / `storage.rules` — 보안 규칙
- `firestore.indexes.json` — 복합 색인 + collectionGroup 필드 오버라이드
- `functions/index.js` — Cloud Functions (아래)
- Cloud Functions 배포에는 **Blaze(종량제)** 요금제가 필요합니다(대부분 무료 한도 내).

## Cloud Functions (`functions/index.js`)

- `setUserRole` — 역할(커스텀 클레임) 부여 (관리자만 호출)
- `deleteAuthUser` — 탈퇴 시 로그인 계정 삭제 (관리자/교사)
- `onAnswerCreated` / `onAnswerDeleted` — answerCount 서버 집계 + 새 답변 알림
- `weeklyTopAnswerers` — 매주 월요일 09시 주간 답변왕 공지

## Firestore 데이터 구조

식별 정보(실명·이메일·학번)는 `users/{uid}`에만 저장하고, 게시물·카드에는
익명 정보(닉네임·이모지)만 넣습니다.

```
users/{uid}          프로필 (email, realName, displayName, role, requestedRole ...)
questions            질문 (authorId, keyword, resolved, meTooIds[] ...)
  └ answers          답변 (하위 컬렉션)
notices              공지 (교사만 작성)
keywords             과목 키워드 (교사만 생성/수정)
classes              반 / joinCodes 입장 코드 / memberships 소속
studyBoards          공부방 보드
  └ cards            공부방 카드 (반 멤버 격리)
kwl                  KWL 성찰 (본인 + 교사만 열람)
```

## 폴더 구조

```
app/page.js          랜딩 + 로그인/회원가입(역할 선택)
app/board/page.js    질문 게시판 (키워드 | 질문 | 공지)
app/study/page.js    반별 공부방
app/admin/page.js    관리자 대시보드
app/report/page.js   학생 학습 리포트
lib/firebase.js      Firebase 초기화 (config)
lib/auth.js          인증 (이메일/구글) + 프로필/역할
lib/user.js          현재 사용자 캐시 + 역할 헬퍼
lib/store.js         데이터 레이어 (Firestore ↔ 데모 모드 자동 전환)
functions/index.js   Cloud Functions (서버 코드)
```

자세한 아키텍처·규칙 세부는 `CLAUDE.md`를 참고하세요.
