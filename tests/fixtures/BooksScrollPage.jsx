const steps = Array.from({ length: 9 }, (_, index) => index + 1);
const cards = Array.from({ length: 18 }, (_, index) => index + 1);

export default function BooksScrollPage() {
  return (
    <div className="board-shell books-board-shell">
      <main className="books-main books-main--split" data-qa="books-scroll-root">
        <div className="book-library-layout">
          <aside className="book-library-side" aria-label="프로젝트 Step">
            <button type="button" className="book-library-collapse" aria-label="왼쪽 패널 접기">
              <span aria-hidden="true">«</span>
            </button>
            <div className="book-library-content">
              <div className="book-side-tools">
                <div className="book-side-summary">
                  <span><strong>9</strong><small>Steps</small></span>
                  <span><strong>18</strong><small>Cards</small></span>
                  <span><strong>6</strong><small>학생</small></span>
                  <span><strong>3</strong><small>자료</small></span>
                </div>
                <nav className="book-step-nav" aria-label="Step 목록">
                  <div className="book-step-nav-head"><strong>프로젝트 흐름</strong><small>내부 목록 스크롤</small></div>
                  {steps.map((step) => (
                    <button className={`book-step-nav-item${step === 1 ? " is-active" : ""}`} type="button" key={step}>
                      <span>STEP {step}</span>
                      <strong>긴 활동 제목 {step}</strong>
                      <small>활동 2 · 자료 1</small>
                      <i aria-hidden="true">›</i>
                    </button>
                  ))}
                </nav>
              </div>
            </div>
          </aside>

          <section className="book-library-main">
            <header className="topbar">
              <div className="topbar-left">
                <strong className="logo">교사 개발자</strong>
                <span className="topbar-divider" />
                <span className="books-class-name">모바일 스크롤 QA</span>
              </div>
            </header>
            <div className="books-content-head">
              <div className="books-head">
                <div className="books-head-main">
                  <h1>개발자실</h1>
                  <span className="books-class-name">인증 없는 레이아웃 fixture</span>
                </div>
              </div>
              <div className="books-step-tabs" aria-label="프로젝트 Step 선택">
                {steps.slice(0, 6).map((step) => (
                  <button type="button" className={step === 1 ? "is-active" : ""} key={step}>STEP {step}</button>
                ))}
              </div>
            </div>
            <section className="book-personal-dashboard" aria-label="참여자 개인 카드">
              <div className="book-dashboard-head">
                <div className="book-dashboard-head-copy">
                  <h2>개인 카드</h2>
                  <p>모바일에서는 이 전체 화면이 문서 스크롤로 끝까지 내려가야 합니다.</p>
                </div>
                <span>18개</span>
              </div>
              <div className="book-personal-grid">
                {cards.map((card) => (
                  <article className="book-personal-card is-openable" key={card}>
                    <button type="button" className="book-personal-card-trigger">
                      <header>
                        <span className="book-personal-avatar" aria-hidden="true">·</span>
                        <span>
                          <strong>학생 {card}</strong>
                          <small>테스트 학교</small>
                        </span>
                        <em>{card % 5}/5</em>
                      </header>
                      <div className="book-personal-progress" aria-label="활동 확인">
                        <span style={{ width: `${(card % 5) * 20}%` }} />
                      </div>
                      <p className="book-personal-card-hint">활동 진행 현황</p>
                    </button>
                  </article>
                ))}
              </div>
              <p className="book-dashboard-empty" data-qa="mobile-scroll-end">모바일 전체 페이지 스크롤 마지막 지점</p>
            </section>
          </section>

          <aside className="book-help-drawer" aria-label="도움 글">
            <button type="button" className="book-help-toggle">도움 글</button>
            <div className="book-help-content">
              <div className="book-help-detail">
                <strong>상위 도움 글 제목</strong>
                <p className="book-help-text">상위 제목과 URL은 별도 영역에 있고, 아래 children만 들여쓰기됩니다.</p>
                <div className="book-help-sections" data-qa="help-child-sections">
                  <section className="book-help-section">
                    <div className="book-help-section-head"><h4>하위 섹션</h4></div>
                    <p className="book-help-text">child indentation check</p>
                  </section>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
