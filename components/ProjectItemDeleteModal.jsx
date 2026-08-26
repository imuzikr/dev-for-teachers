"use client";

import ConfirmModal from "./ConfirmModal";

export default function ProjectItemDeleteModal({ target, onConfirm, onClose }) {
  if (!target) return null;
  const label = target.kind === "activity" ? "활동" : "자료";
  return (
    <ConfirmModal
      title={`${label} 삭제`}
      preview={target.item.title}
      description={target.kind === "activity"
        ? "이 활동과 학생들이 만든 내용이 모두 삭제됩니다.\n되돌릴 수 없습니다."
        : "이 자료가 프로젝트에서 삭제됩니다.\n되돌릴 수 없습니다."}
      confirmLabel="삭제"
      danger
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
