# Firestore 보안 규칙 테스트

실제 `firestore.rules`를 Firestore 에뮬레이터에 올려, 학생·교사·다른 반 교사
입장에서 요청을 보내 보고 규칙이 의도대로 막고 여는지 확인합니다.

규칙은 눈으로 읽어서는 틀리기 쉽습니다. 실제로 이 저장소에서 나온 사례들:

- **없는 문서 읽기** — 읽기 규칙이 `resource.data.uid`를 참조하면, 문서가
  아직 없을 때 규칙 평가 자체가 거부됩니다. 출석하기가 첫 시도마다 실패하던
  원인이었습니다 (`attendance.test.mjs`에 회귀 테스트로 고정).
- **없는 필드 참조** — `.editMode`처럼 직접 접근하면 필드가 없는 문서에서
  평가 오류가 납니다 (`.get('editMode', 'open')`은 안전).
- **집합 비교의 허점** — `toSet()` 차집합만 검사하면 중복 원소가 든 배열을
  걸러내지 못합니다.

## 준비 (최초 1회)

```bash
cd tests/rules && npm install
```

루트 `package.json`과 분리해 둔 이유는, `firebase-tools`가 700개 넘는 패키지를
끌고 와서 Vercel 운영 빌드가 매번 느려지기 때문입니다. `functions/`와 같은 방식입니다.

## 실행

```bash
npm run test:rules      # 저장소 루트에서
npm test                # tests/rules 안에서
```

에뮬레이터는 `firebase emulators:exec`가 자동으로 띄우고 끝나면 정리합니다.
Java가 설치되어 있어야 합니다(에뮬레이터 요구사항). 운영 프로젝트에는 전혀
접속하지 않고, `demo-` 로 시작하는 가짜 프로젝트 ID만 씁니다.

## 구성

| 파일 | 다루는 규칙 |
|---|---|
| `helpers.mjs` | 에뮬레이터 연결, 학생/교사/관리자 로그인 컨텍스트, 사전 데이터 심기 |
| `attendance.test.mjs` | 공부방 출석부 (`classes/{cId}/attendanceRecords`) |
| `questionSignals.test.mjs` | 손들기 (`classes/{cId}/questionSignals`) |
| `studyCards.test.mjs` | 공부방 보드·카드 (잠금·선생님 보드 분기 포함) |
| `seatGroups.test.mjs` | 자리표·반 기본 모둠 (교사 전용 자산) |
| `bookEntries.test.mjs` | 개인 활동 제출물 (곁텍스트·RAFT·KWLS·마인드맵 공용) |

## 테스트를 쓸 때 주의할 점

**사전 데이터는 실제 앱이 쓰는 형태와 똑같이 만드세요.** 필드 하나를 빼먹으면
규칙이 평가 오류로 거부하는데, `assertFails` 테스트는 그래도 통과해 버려서
"막고 싶은 이유"가 아닌 엉뚱한 이유로 초록불이 켜집니다. 실제로 보드 시드에서
`editMode`를 빠뜨렸다가 이 함정을 만났습니다.

**허용/거부를 짝으로 확인하세요.** 거부 테스트만 있으면 규칙이 전부를 막고
있어도 통과합니다.
