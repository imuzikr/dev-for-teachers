"use client";

import { getClassPurposeLabel } from "@/lib/classPurpose";
import { IconDeveloperRoom } from "./IconDeveloperRoom";

export default function ClassroomCatalog({ classes, currentClass, isTeacher, classPurpose, disabled, tools, onOpen, onJoin }) {
  return (
    <div className="classroom-catalog-layout">
      <aside className="classroom-catalog-rail" aria-label="클래스 안내">
        <h2><IconDeveloperRoom size={22} /> 클래스</h2>
        <div className="classroom-catalog-summary">
          <span className="classroom-catalog-purpose">{getClassPurposeLabel(classPurpose)}</span>
          <strong>{isTeacher ? "함께 만드는 수업 공간" : "나의 배움과 기록"}</strong>
          <p>{isTeacher ? "클래스를 만들고 활동과 자료를 준비하세요." : "참여한 클래스를 열어 활동을 이어가세요."}</p>
        </div>
        <div className="classroom-catalog-current" aria-current="page">내 클래스 <span>{classes.length}</span></div>
        <div className="classroom-catalog-tools">{tools}</div>
        {!isTeacher && onJoin && <button type="button" className="btn-primary" disabled={disabled} onClick={onJoin}>참여 코드로 클래스 참여</button>}
      </aside>
      <section className="classroom-catalog-content" aria-labelledby="classroom-catalog-title">
        <header className="classroom-catalog-heading">
          <div><p className="classroom-catalog-eyebrow">{getClassPurposeLabel(classPurpose)} · 교사 개발자</p><h1 id="classroom-catalog-title">내 클래스</h1>
            <p>{isTeacher ? "수업을 준비하거나 진행할 클래스를 선택하세요." : "클래스를 선택하면 STEP별 활동과 자료를 볼 수 있어요."}</p></div>
          <span className="classroom-catalog-count">전체 {classes.length}개</span>
        </header>
        {classes.length > 0 ? <ul className="classroom-catalog-list">
          {classes.map((item) => <li key={item.id}>
            <button type="button" className="classroom-card" disabled={disabled} onClick={() => onOpen(item.id)} aria-label={`${item.name} 클래스 열기`}>
              <span className="classroom-card-icon" aria-hidden="true"><IconDeveloperRoom size={28} /></span>
              <span className="classroom-card-copy"><span className="classroom-card-meta">{getClassPurposeLabel(item.purpose)} · {isTeacher ? "관리 클래스" : "참여 클래스"}</span>
                <strong>{item.name}</strong><span className="classroom-card-description">{currentClass?.id === item.id ? "최근 선택한 클래스" : "활동과 자료를 확인하세요"}</span></span>
              <span className="classroom-card-open" aria-hidden="true">클래스 열기 <span>→</span></span>
            </button>
          </li>)}
        </ul> : <div className="classroom-catalog-empty"><IconDeveloperRoom size={40} /><h2>{isTeacher ? "첫 클래스를 만들어 보세요" : "참여한 클래스가 없어요"}</h2>
          <p>{isTeacher ? "클래스 관리에서 새 클래스를 만든 뒤 프로젝트를 구성할 수 있어요." : "선생님이 알려준 6자리 참여 코드로 클래스에 참여하세요."}</p>
          {!isTeacher && onJoin && <button type="button" className="btn-primary" disabled={disabled} onClick={onJoin}>클래스 참여하기</button>}
        </div>}
      </section>
    </div>
  );
}
