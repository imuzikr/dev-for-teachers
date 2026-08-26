# 교사 개발자 Design Contract

## 1. Direction

교사 개발자는 밝은 흰 배경 위에 3D 교육 일러스트, 부드러운 유리 질감, 포레스트 그린 CTA와 세이지 톤 표면을 얹는 친근한 교사 협업 도구다. 첫 화면은 선생님들이 연구하고 대화하는 장면을 크게 보여 주고, 중앙에는 짧은 브랜드 메시지만 남겨 앱의 시작점이 바로 보이게 한다.

## 2. Tokens

- Brand name: `교사 개발자`
- Background image: `/teacher-collaboration-hero.png`
- Palette: forest `#2f6f3e`, deep forest `#24552f`, sage `#e6f1ea`, sage card `#f4faf3`, warm paper `#fbfaf3`, lime accent `#cde85b`
- Surface glass: `rgba(246, 249, 241, 0.2)` with blur and soft green shadow
- Surface glass token: `--landing-glass-bg`, `--landing-glass-border`, `--landing-shadow`
- Control tokens: `--landing-control-bg`, `--landing-control-border`, `--landing-outline-bg`, `--landing-outline-border`
- Error tokens: `--landing-error-bg`, `--landing-error-border`, `--auth-error-bg`, `--auth-error-border`
- Layout tokens: `--landing-top-gap`, `--landing-form-gap`, `--landing-control-height`, `--landing-header-height`, `--landing-hero-card-padding`, `--landing-hero-radius`
- Primary action: existing `var(--primary)` / `var(--primary-dark)` / `var(--primary-light)` mapped to forest green, deep forest, and pale sage
- Text: existing `var(--dark)`, `var(--text)`, `var(--text-sub)`
- Radius: `var(--radius-btn)` for controls, `28px` for the hero glass panel
- Spacing unit: existing 4px-based app spacing; landing controls use compact 8-12px gaps

## 3. Typography

- Logo and hero title use the existing serif display face.
- Buttons and form controls use the existing UI sans stack.
- Korean text must avoid cramped containers that force single-syllable orphan lines.

## 4. Components

- `landing-top`: white app bar with logo on the left and compact entry controls on the right; it stays in normal document flow above the illustration and never overlays it.
- `landing`: desktop hero preserves the source illustration ratio so the top of the artwork begins directly below the app bar without cropping.
- `landing-quick-start`: school/name inputs, start button, and admin login button in one responsive row.
- `hero-glass`: centered compact translucent panel containing only the brand title and tagline.
- `modal-auth`: Google-only sign-in dialog; the first successful Google login claims administration.
- `admin-layout`: 관리자 전용 2열 작업 화면. 왼쪽에는 검색 가능한 사용자 디렉터리와 탈퇴 명령을 유지하고, 오른쪽에는 선택 사용자의 52주 활동 히트맵만 표시한다.
- `heatmap-panel`: 5단계 세이지-포레스트 활동 밀도와 미래 날짜 중립 상태를 사용하는 가로 스크롤 가능 잔디 히트맵.
- `book-workspace`: 왼쪽 고정 폭 활동·자료 카드 패널과 오른쪽 유동 폭 개인 카드 대시보드로 구성한다. 사용자 프로필이 개인 카드의 단일 출처이며 별도 카드 문서를 중복 생성하지 않는다.
- `book-project-builder`: 책방 상단의 프로젝트 만들기 명령으로 열리는 왼쪽 패널 편집기. 저장 명령은 패널 최상단에 두고, Step 카드는 8px 이하 모서리와 명확한 펼침 상태를 사용한다. Step 추가 명령은 항상 마지막 Step 아래에 놓는다.
- `book-project-step`: 활동과 자료를 구획으로 분리해 각각 복수로 담는 아코디언 카드. 저장된 Step 헤더에는 해당 Step을 바로 여는 편집 명령을 둔다. 펼친 Step에서는 활동·자료의 제목과 본문을 직접 표시하고 각 항목에 전체보기 명령을 제공한다. 편집 중인 Step 제목은 아코디언 헤더에서 바로 수정하고 같은 헤더에서 Step을 삭제할 수 있다. 본문 하단에는 활동 추가와 자료 추가 명령을 나란히 두고, 입력을 확정하는 Step 저장 명령을 제공한다. 각 활동·자료 박스는 제목을 수정하는 헤더와 별도 입력 영역을 사용하며, 활동은 활동 내용, 자료는 자료 내용과 선택 URL을 입력한다.
- `book-step-preview-modal`: 한 Step의 활동과 자료를 저장 순서대로 묶어 전체 내용을 읽는 모달. 이전·다음 명령은 같은 Step 안에서 순환하며, 활동 실행과 자료 링크 명령은 항목 종류에 맞게 제공한다.
- `book-personal-card`: 학교명, 이름, 활동 진행률과 활동별 상태를 표시한다. 교사는 참여자 전체를 보고 일반 사용자는 자신의 카드만 본다.
- 일반 사용자는 참여 코드 입력 없이 첫 번째 운영 중인 반에 자동으로 연결된다.

## 5. States

- Inputs keep visible focus rings using the existing primary color.
- Start and admin login controls use real buttons, preserve keyboard submission, and do not rely on placeholder-only labeling.
- On mobile, the entry controls wrap into a two-column grid with full-width buttons so Korean labels do not clip.
- 관리자 화면은 모바일에서 사용자 목록이 위쪽 밴드로 전환되고 히트맵은 셀 크기를 유지한 채 가로 스크롤한다.
- 책방은 모바일에서 활동 패널이 위쪽, 개인 카드가 아래쪽으로 쌓이며 활동 카드와 상태 버튼의 텍스트가 잘리지 않아야 한다.
- 프로젝트 편집기는 모바일에서도 입력과 추가·삭제 명령을 한 열로 유지하고, 아코디언 헤더와 저장 버튼은 최소 44px 터치 영역을 제공한다. Step이 많아지면 왼쪽 프로젝트 패널 안에서 세로 스크롤한다.
- 일반 사용자 화면에는 출석 기록·출석부 명령을 노출하지 않는다. 교사용 출석부와 수업 방송 흐름은 유지한다.
- 저장된 프로젝트에서도 편집 명령과 마지막 Step 아래의 Step 추가 명령을 유지한다. Step 추가는 기존 내용을 보존한 편집기를 열고 새 Step만 펼친다.
