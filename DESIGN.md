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

## 5. States

- Inputs keep visible focus rings using the existing primary color.
- Start and admin login controls use real buttons, preserve keyboard submission, and do not rely on placeholder-only labeling.
- On mobile, the entry controls wrap into a two-column grid with full-width buttons so Korean labels do not clip.
