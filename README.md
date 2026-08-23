# 교사 개발자 — 선생님들의 수업 연구 작업실

선생님들이 학교 이름과 이름만 입력해 바로 들어가고, 수업 자료·활동 아이디어·책방 마인드맵을 정리하는 협업 공간입니다.
관리자만 별도 회원가입/로그인으로 권한과 설정을 관리합니다.

## 실행 방법

```bash
npm install
npm run dev   # http://localhost:3000
npm run build # 프로덕션 빌드
```

## 동작 모드

앱은 `lib/firebase.js`의 설정 유무에 따라 두 모드로 동작합니다.

- **실서비스 모드** (Firebase 설정됨 · 현재 상태): 일반 선생님은 학교 이름과
  이름 입력 후 익명 Firebase 세션으로 입장하고, 데이터는 Firestore에
  저장됩니다. 관리자만 Firebase Authentication 로그인/회원가입을 사용합니다.
  권한은 Firestore 보안 규칙이 서버에서 강제합니다.
- **데모 모드** (Firebase 미설정): 브라우저 메모리에 임시 저장(새로고침 시
  초기화)되고, 테스트 유저로 자동 입장합니다. 화면·기능을 빠르게 확인할 때만
  쓰입니다. (`lib/user.js`의 `TEST_USER`)

## 인증과 권한

- **일반 선생님 입장**: 학교 이름과 이름을 입력하면 익명 세션을 만들고
  `/study`로 이동합니다. 민감 데이터 저장을 전제로 하지 않는 빠른 입장 흐름입니다.
- **관리자 로그인**: 이메일/비밀번호 + Google 로그인 (`lib/auth.js`). 로그인 시
  `users/{uid}` 프로필을 보장하고, 관리자 기능은 별도 권한으로 제한합니다.
- **역할 구조**: 관리자 → 일반 선생님.
  - **최고 관리자**: 부트스트랩 이메일로 지정(코드에 하드코딩). 역할 부여·
    선생님 승인/탈퇴 등 최상위 권한.
  - **일반 선생님**: 학교 이름과 이름만 입력해 익명 세션으로 입장합니다.
- **권한 부여**: 역할은 `users/{uid}.role` 프로필에 저장하고, 보안 규칙은
  해당 프로필을 읽어 관리자 권한을 검사합니다. 화면의 `isAdmin(user)`는
  UI 노출용일 뿐, 실제 강제는 규칙입니다.

## 배포

- **프론트엔드**: Vercel — `main`에 push하면 자동 배포됩니다.
- **Firebase(규칙·색인)**: 저장소 파일을 원본으로 삼아
  CLI로 배포합니다(콘솔에서 직접 수정하지 마세요).

```bash
firebase deploy --only firestore
# 또는 개별: firestore:rules / firestore:indexes
```

- `firestore.rules` — 보안 규칙
- `firestore.indexes.json` — 복합 색인 + collectionGroup 필드 오버라이드

## Firestore 데이터 구조

식별 정보(실명·이메일·학번)는 `users/{uid}`에만 저장하고, 게시물·카드에는
익명 정보(닉네임·이모지)만 넣습니다.

```
users/{uid}          프로필 (email, realName, displayName, role, requestedRole ...)
classes              반 / joinCodes 입장 코드 / memberships 소속
studyBoards          공부방 보드
  └ cards            공부방 카드 (반 멤버 격리)
bookActivities       책방 활동
  └ entries          책방 마인드맵 기록 (본인 + 교사만 열람)
lessons              수업 자료와 발표 방송
```

## 폴더 구조

```
app/page.js          랜딩 + 일반 선생님 시작 + 관리자 로그인/회원가입
app/study/page.js    반별 공부방
app/books/page.js    책방 활동
lib/firebase.js      Firebase 초기화 (config)
lib/auth.js          인증 (익명 입장, 이메일/구글) + 프로필/역할
lib/user.js          현재 사용자 캐시 + 일반 선생님 세션 + 역할 헬퍼
lib/store.js         데이터 레이어 (Firestore ↔ 데모 모드 자동 전환)
```

자세한 아키텍처·규칙 세부는 `CLAUDE.md`를 참고하세요.
