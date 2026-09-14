# PIN 로그인 운영 설정

이 문서는 학생용 학교/이름/4자리 PIN 로그인을 운영에 올릴 때 필요한 실무 절차만 정리합니다. API는 Next App Router의 `POST /api/auth/pin`이고, Netlify에서는 이 라우트가 Netlify Function으로 실행됩니다. 별도 `netlify/functions` 파일을 만들지 않습니다.

## Netlify 환경 변수

Netlify 사이트 설정의 서버/Functions 환경 변수에 아래 3개를 한 번만 등록합니다. 브라우저로 내려가면 안 되므로 이름에 `NEXT_PUBLIC_`을 붙이지 않습니다.

- `FIREBASE_ADMIN_PROJECT_ID=dev-for-teachers`
- `FIREBASE_ADMIN_STORAGE_BUCKET=dev-for-teachers.firebasestorage.app`
- `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=<Firebase 서비스 계정 JSON 한 줄>`

서비스 계정 JSON은 Firebase Console의 프로젝트 설정 > 서비스 계정에서 새 비공개 키를 생성해 Netlify에만 붙여 넣습니다. 실제 키를 채팅, 문서, Git, 이슈, 로그에 넣지 않습니다. 설정이 없거나 프로젝트/버킷이 맞지 않으면 서버는 `503`을 반환하며, 안전하지 않은 대체 경로는 없습니다.

스토리지 버킷 값은 기존 `dev-for-teachers.firebasestorage.app` 그대로 사용합니다. PIN 로그인 때문에 Storage 버킷을 바꾸지 않습니다.

## 배포 순서

1. 학생들이 접속하지 않는 시간대를 잡습니다.
2. Firebase 보안 규칙을 먼저 배포합니다.
   - `firestore.rules`
   - `storage.rules`
3. Netlify에 위 3개 환경 변수가 들어 있는지 확인합니다.
4. 앱을 배포합니다.
5. 스테이징 또는 운영 점검 계정으로 `begin`, `register`, `login`, 기존 계정 등록, 관리자 reset을 확인합니다.

PIN 커스텀 토큰이 프로필의 교사 권한을 상속하지 않도록 두 규칙을 함께 수정했습니다. 규칙 배포는 앱 배포와 맞춰 진행해야 합니다.

## 계정 등록과 기존 계정

신규 학생은 학교 이름, 실명, 4자리 PIN으로 등록하면 서버가 Firebase Auth 사용자와 `users/{uid}` 학생 프로필을 만듭니다.

기존 익명/레거시 학생 프로필은 본인의 현재 Firebase ID 토큰으로만 PIN 등록할 수 있습니다. 이때 서버는 토큰 폐기 여부까지 확인합니다. 이미 폐기된 토큰으로는 등록할 수 없습니다.

교사/관리자/Google 제공자 계정은 PIN 대상이 아닙니다. `users/{uid}.role`이 없거나 `student`인 프로필만 PIN 등록, 로그인, 관리자 reset 대상이 됩니다. `teacher`, `admin`, `system/admin.uid`, Google 제공자, disabled Auth 사용자는 모두 거부됩니다.

학생 삭제로 `users/{uid}` 프로필은 없어졌지만 서버 전용 PIN 문서가 남아 있는 경우, `begin`과 `login`은 `auth/pin-orphaned-identity`와 HTTP `409`를 반환합니다. 서버는 삭제된 프로필을 되살리지 않고, 예전 UID의 커스텀 토큰도 발급하지 않습니다. 복구는 관리자가 서버 전용 PIN 문서를 정리한 뒤 학생이 다시 등록하는 방식으로 처리합니다.

## 관리자 PIN reset

관리자 reset은 교사가 본인의 Google 관리자 세션으로 실행합니다. 요청에는 대상 `uid`, 새 PIN, PIN 확인값만 사용하며, 대상 학생의 학교/이름은 클라이언트 값을 믿지 않고 서버가 `users/{uid}`에서 다시 읽습니다.

reset 성공 후 서버는 해당 UID의 Firebase refresh token을 폐기합니다. 이미 발급된 ID 토큰은 만료 시각까지 남을 수 있으므로, 즉시 강제 로그아웃을 보장하는 기능으로 이해하면 안 됩니다. 다음 토큰 갱신부터 새 인증 상태가 적용됩니다.

반 삭제 유지보수 잠금(`system/classDeletionLock.active == true`) 중에는 신규 등록과 reset을 막습니다.

## 제한 정책

학교/이름 identity별 PIN 로그인 시도는 Firestore에 저장되는 내구성 있는 카운터로 제한합니다. PIN 해시 확인 전에 모든 로그인 요청을 먼저 카운트하며, 15분에 5회까지만 허용합니다. 이 값이 실제 PIN 무차별 대입 방어선입니다.

Netlify가 제공하는 신뢰 가능한 `x-nf-client-connection-ip` 헤더가 있을 때만 IP 단위 보조 제한을 적용합니다. 교실 공유 NAT를 고려해 public `begin`, `register`, `login` 합산 15분에 300회까지 허용합니다. 운영에서 공격자가 조작할 수 있는 `x-forwarded-for`는 믿지 않습니다. 신뢰 헤더가 없으면 spoofable 헤더를 쓰지 않고 IP 제한을 건너뜁니다.

Netlify가 해당 IP 헤더를 제공한다는 [공식 안내](https://answers.netlify.com/t/upcoming-change-stripping-exposed-netlify-headers-from-function-and-proxy-requests/52665)를 참고할 수 있습니다.

## 서버 전용 컬렉션

아래 컬렉션은 클라이언트가 읽거나 쓰면 안 됩니다.

- `pinCredentials/{uid}`: salted async `scrypt` PIN 해시와 identity 메타데이터
- `pinIdentities/{identityHash}`: 정규화한 학교/이름 identity와 UID 매핑
- `pinLoginAttempts/{identity_*|ip_*}`: 15분 제한 윈도우

새 Firestore 규칙은 이 컬렉션에 대한 모든 직접 클라이언트 접근을 차단합니다.

## API 요약

`POST /api/auth/pin`

```json
{ "action": "begin|register|login|reset", "schoolName": "...", "realName": "...", "pin": "0000", "pinConfirm": "0000", "uid": "..." }
```

- `begin` -> `{ "mode": "register" | "login" | "enroll" }`
- `register`, `login` -> `{ "customToken": "..." }`
- `reset` -> `{ "ok": true }`
- 오류 -> `{ "code": "...", "message": "..." }`, HTTP `400`, `401`, `403`, `409`, `429`, `503`
