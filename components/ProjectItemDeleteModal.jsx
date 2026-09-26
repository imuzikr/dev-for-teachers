"use client";

import ConfirmModal from "./ConfirmModal";

export default function ProjectItemDeleteModal({
  target, pending = false, error = "", cleanupPending = false, onConfirm, onClose,
}) {
  if (!target) return null;
  const label = target.kind === "activity" ? "활동" : "자료";
  return (
    <ConfirmModal
      title={`${label} 휴지통으로 이동`}
      preview={target.item.title}
      description={<>{target.kind === "activity"
        ? "이 활동은 프로젝트에서 숨겨지고 휴지통으로 이동합니다.\n나중에 복원할 수 있으며 학생 기록은 보존됩니다."
        : "이 자료는 프로젝트에서 숨겨지고 휴지통으로 이동합니다.\n나중에 복원할 수 있습니다."}
        {error && <>{"\n\n"}<span className="form-error" role="alert">{error}</span></>}
      </>}
      confirmLabel={pending ? "이동 중..." : error ? "다시 시도" : "휴지통으로 이동"}
      confirmDisabled={pending}
      cancelDisabled={pending || cleanupPending}
      danger
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
