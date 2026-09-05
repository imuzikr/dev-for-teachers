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
- `book-workspace`: 교사 책방 홈 전체를 브라우저 높이의 좌우 분할 화면으로 구성한다. 왼쪽 고정 폭 활동·자료 카드 패널은 화면 왼쪽 끝부터 전체 높이를 사용하고, 오른쪽 유동 폭 본문 안에 상단 내비게이션·책방 제목·프로젝트 흐름·개인 카드 대시보드를 쌓는다. 학생 확인 진척도는 개인 카드와 개인 카드 섹션 헤더 안에서 확인하며 별도 오른쪽 진척도 서랍은 사용하지 않는다. 학생 책방 홈에서는 교사용 왼쪽 패널을 제거해 본문을 전체 폭으로 사용한다. 사용자 프로필이 개인 카드의 단일 출처이며 별도 카드 문서를 중복 생성하지 않는다.
- `book-library-side`: 참고 앱의 사이드바처럼 현재 작업 맥락을 압축해 보여 주는 책방 내비게이션 패널이다. 접기/펼치기 명령은 패널 오른쪽 상단의 작은 원형 아이콘 버튼으로 제공하고, 열린 상태에서는 왼쪽으로 접히는 `«`, 접힌 상태에서는 다시 오른쪽으로 펼치는 `»` 방향을 표시한다. 접힌 상태에서는 48px 세이지 레일 상단에 아이콘만 남긴다. 펼친 상태에서는 프로젝트 전체 Step·활동·자료·참여자 수 요약과 Step 아코디언 흐름을 제공하며, 별도의 빠른 이동 목록과 별도의 Step 상세 목록을 이원화하지 않는다.
- `book-project-builder`: 책방 상단의 프로젝트 만들기 명령으로 열리는 왼쪽 패널 편집기. 저장 명령과 프로젝트 이름은 패널 최상단에 두고, Step 편집은 별도 바로가기 목록과 별도 카드 목록으로 나누지 않는다. 각 Step 항목을 누르면 같은 위치에서 제목·활동·자료 입력이 아코디언으로 펼쳐지고 다시 접힌다. Step 추가 명령은 항상 마지막 Step 아래에 놓는다.
- `book-project-step`: 활동과 자료를 같은 Step 안의 하나의 배치 흐름으로 담는 아코디언 카드. 저장된 Step 헤더에는 해당 Step을 바로 여는 편집 명령을 둔다. 펼친 Step에서는 활동은 제목 자체를 내용으로 표시하고, 자료는 제목과 본문을 표시한다. 편집 중인 Step 제목은 아코디언 헤더에서 바로 수정하고 같은 헤더에서 Step을 삭제할 수 있다. 본문 하단에는 활동 추가와 자료 추가 명령을 나란히 두고, 입력을 확정하는 Step 저장 명령을 제공한다. 각 자료 박스는 제목을 수정하는 헤더와 별도 내용·URL 입력 영역을 사용하며, 활동은 별도 본문 없이 한 줄 입력값과 선택 링크를 활동 내용으로 저장한다. 활동과 자료는 Step 내부에서 드래그 앤 드롭으로 순서를 바꿀 수 있어야 한다.
- `book-step-preview-modal`: 한 Step의 활동과 자료를 저장 순서대로 묶어 전체 내용을 읽는 모달. 이전·다음 명령은 같은 Step 안에서 순환하며, 활동 실행과 자료 링크 명령은 항목 종류에 맞게 제공한다.
- `book-project-item-actions`: 저장된 활동·자료의 열기·확대·수정·삭제 명령은 항목 카드 오른쪽 위의 작은 아이콘 버튼으로 정렬하고, 잠김 상태는 제목 위의 작은 상태 배지로 표시한다. 제목은 그 아래 한 줄로 말줄임 처리해 버튼 때문에 중간 줄바꿈되지 않게 한다. 열기는 선택한 항목을 큰 모달로 표시하고, 확대는 같은 Step의 항목을 이전·다음으로 탐색할 수 있는 큰 모달을 표시한다. 자료 링크가 있으면 카드 본문 아래에 출처 요약 링크를 표시해 새 탭으로 이동할 수 있게 한다. 자료 복사 명령도 같은 오른쪽 위 아이콘 묶음에 두며 본문과 URL을 함께 클립보드에 담는다. 삭제는 확인 절차를 거친다.
- `book-project-flow-overview`: 개인 카드 목록 위에 전체 프로젝트 흐름을 Step별로 요약하는 얇은 정보 밴드. 각 Step은 제목과 활동·자료 수를 표시하고, 내부 항목은 `A1`, `R2` 같은 작은 알약 상태 표시로 한 줄 흐름을 만든다. Step 아코디언은 초기에는 모두 닫힌 상태로 시작하고, 한 번에 하나만 열리며, 다른 Step을 열면 가장 최근에 연 Step만 남긴다. 프로젝트 편집 중에는 저장 전 draft Step도 같은 본문 미리보기에 즉시 반영한다. 비어 있거나 활동 문서 동기화가 아직 끝나지 않은 Step도 전체 흐름에서는 숨기지 않는다. 잠긴 활동은 알약 안에 작은 잠김 상태를 함께 표시하고, 자료는 잠금 대상이 아니므로 잠금 아이콘이나 잠금 토글을 표시하지 않는다.
- `book-personal-card`: 학교명, 이름, 활동 진행률을 표시한다. 교사는 모든 참여자 카드를 열어 개별 진행 상황을 확인할 수 있고, 일반 사용자는 자신의 카드만 열 수 있다. 개인 카드 섹션 헤더에는 프로젝트 항목별 확인 상태바를 표시한다. 교사는 학급 평균을 보고, 학생은 자신의 전체 진행 상황을 같은 조각 바 구조로 본다. 상태바는 `개인 카드` 제목 오른쪽 공간을 최대 3개 Step 그룹으로 균등하게 나누고, 각 Step 그룹 안에는 최대 7개의 활동·자료 조각 중 실제 생성된 항목 수만 표시한다. 항목이 없는 Step도 세 번째 그룹 위치를 잃지 않도록 빈 그룹 자리를 유지한다. 칸 내부 채움 비율은 교사용에서는 해당 항목을 확인한 학생 수를 전체 참여자 수로 나눈 값으로, 학생용에서는 본인 확인 여부로 표현한다. 평균 상태바와 개인 카드 내부 조각 색은 Step 1/2/3 순서로 연한 초록색, 연한 주황색, 연한 보라색을 사용한다.
- `book-personal-detail`: 교사는 선택한 참여자 카드에서, 일반 사용자는 본인 카드에서 진입하는 오른쪽 영역의 개인 프로젝트 상세 화면. 교사가 준비한 활동과 자료를 Step별 섹션으로 나누고, 한 Step 안의 활동·자료는 동일한 크기의 가로 카드 행으로 배치한다. 다음 Step은 새 줄의 별도 섹션으로 내려간다. 활동 카드에는 교사의 안내사항과 학생 답변 입력 영역을 두며 일반 사용자는 자신의 답변을 저장하고 활동·자료마다 확인 버튼을 누를 수 있다. 확인 버튼은 카드 높이를 늘리지 않고 기존 카드 푸터 안에 배치한다. 교사는 선택 학생의 답변과 활동·자료 확인 상태를 읽기 전용으로 확인한다. 교사가 활동을 열기 전까지 일반 사용자의 활동 입력과 활동 확인은 잠김 상태로 표시한다. 자료 카드는 같은 Step 행 안에서 제목·교사 입력 본문·링크·복사 명령과 확인 상태를 표시하고, 교사 입력 본문은 테두리 있는 읽기 전용 영역으로 구분한다. 학생 작성·편집 영역은 두지 않는다. 개인 카드 답변은 최상위 `dashboardText` 필드에 저장한다. 뒤로 명령으로 개인 카드 목록으로 돌아간다.
- 일반 사용자는 참여 코드 입력 없이 첫 번째 운영 중인 반에 자동으로 연결된다.

## 5. States

- Inputs keep visible focus rings using the existing primary color.
- Start and admin login controls use real buttons, preserve keyboard submission, and do not rely on placeholder-only labeling.
- On mobile, the entry controls wrap into a two-column grid with full-width buttons so Korean labels do not clip.
- 관리자 화면은 모바일에서 사용자 목록이 위쪽 밴드로 전환되고 히트맵은 셀 크기를 유지한 채 가로 스크롤한다.
- 책방 홈은 넓은 화면과 좁은 브라우저 폭 모두 왼쪽 활동 패널과 오른쪽 본문이 100dvh 높이를 공유하는 분할 작업 화면을 유지한다. 좁은 화면에서는 최소 작업 폭을 두고 가로 스크롤을 허용해 활동 카드와 상태 버튼의 텍스트가 잘리지 않아야 한다.
- 책방 왼쪽 패널은 접기 상태를 브라우저에 기억한다. 접히면 48px 세로 레일로 남고 오른쪽 대시보드가 넓어진다.
- 교사용 진척도 정보는 개인 카드 목록과 개인 카드 섹션 헤더의 평균 상태바에만 표시한다. 별도 오른쪽 서랍 패널이나 접힌 오른쪽 레일은 표시하지 않는다.
- Step 아코디언 항목은 44px 이상의 터치 영역, 현재 Step 강조, 활동·자료 개수 배지를 제공한다. 새로고침하거나 기본 화면에 진입했을 때는 왼쪽 패널과 오른쪽 메인 화면 모두 모든 Step이 닫힌 상태로 시작한다. 항목을 누르면 같은 자리에서 활동과 자료가 펼쳐지고 다시 접힌다. 긴 한글 제목은 말줄임 처리하되 버튼 내부 텍스트가 겹치거나 잘리지 않아야 한다.
- 개인 프로젝트 상세 화면은 Step마다 새 행을 만들고, 각 행의 활동·자료 카드는 동일한 폭과 높이를 유지하며 가로 스크롤로 탐색한다. 답변 입력 영역과 저장 명령은 최소 44px 터치 영역을 제공하고, 고정 높이 카드의 하단 테두리가 잘리지 않아야 한다.
- 프로젝트 편집기는 모바일에서도 입력과 추가·삭제 명령을 한 열로 유지하고, Step 흐름 항목과 저장 버튼은 최소 44px 터치 영역을 제공한다. Step이 많아지면 왼쪽 프로젝트 패널 안에서 세로 스크롤하되, 같은 Step을 가리키는 별도 목록과 별도 상세 카드가 동시에 나타나지 않아야 한다.
- 일반 사용자 화면에는 출석 기록·출석부 명령을 노출하지 않는다. 교사용 개발자실 헤더에서도 별도 출석부 보기 버튼은 두지 않고, 수업 방송 흐름 안에서 필요한 출석 정보만 유지한다.
- 저장된 프로젝트에서도 편집 명령과 마지막 Step 아래의 Step 추가 명령을 유지한다. Step 추가는 기존 내용을 보존한 편집기를 열고 새 Step만 펼친다.
