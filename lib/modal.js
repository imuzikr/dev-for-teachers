// =============================================================
// 모달 배경 클릭으로 닫기 — 단, "누른 지점"과 "뗀 지점"이 모두 배경일 때만.
// -------------------------------------------------------------
// click 이벤트는 mousedown/mouseup의 공통 조상에서 발생하므로,
// 입력창 안에서 누르고(모달 내부) 배경에서 떼면(텍스트 드래그 선택)
// 배경의 onClick이 실행되어 모달이 닫히는 문제가 있습니다.
// mousedown이 배경 자신에서 시작됐을 때만 닫도록 해 이를 방지합니다.
//
// 사용:  <div className="modal-backdrop" {...backdropClose(onClose)}>
//   내부 .modal 은 기존처럼 onClick={(e)=>e.stopPropagation()} 유지.
// =============================================================
export function backdropClose(onClose) {
  return {
    onMouseDown: (e) => {
      if (e.target === e.currentTarget) e.currentTarget.dataset.downSelf = "1";
      else if (e.currentTarget.dataset.downSelf) delete e.currentTarget.dataset.downSelf;
    },
    onClick: (e) => {
      if (e.target === e.currentTarget && e.currentTarget.dataset.downSelf === "1") {
        delete e.currentTarget.dataset.downSelf;
        onClose();
      }
    },
  };
}
