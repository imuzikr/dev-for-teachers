"use client";

import { backdropClose } from "@/lib/modal";
import { IconTrash } from "./StatusIcons";

export default function ConfirmModal({
  icon,
  title,
  preview,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  danger = false,
  onConfirm,
  onClose,
}) {
  const iconNode = icon !== undefined ? icon : <IconTrash size={40} />;

  return (
    <div
      className="modal-backdrop confirm-backdrop"
      {...backdropClose(onClose)}
    >
      <div
        className="confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-icon-wrap">
          <span className="confirm-icon">{iconNode}</span>
        </div>

        <h3 id="confirm-title" className="confirm-title">{title}</h3>

        {preview && (
          <p className="confirm-preview">"{preview}"</p>
        )}

        <p className="confirm-desc">{description}</p>

        <div className="confirm-actions">
          <button
            type="button"
            className="btn-ghost confirm-cancel"
            onClick={onClose}
            autoFocus
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-confirm${danger ? " danger" : ""}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
