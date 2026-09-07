"use client";

import ClassManagerJoinControls from "./ClassManagerJoinControls";
import { IconPen, IconTrash } from "./StatusIcons";

export function ActiveClassRow({
  classItem,
  busy,
  renaming,
  renameDraft,
  onRenameDraft,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onToggleJoinAccess,
  onRefreshJoinCode,
  onSaveJoinCode,
  onToast,
  onArchive,
  onDelete,
}) {
  return (
    <li className="class-mgr-row">
      <div className="class-mgr-row-main">
        {renaming ? (
          <input
            type="text"
            className="class-mgr-rename-input"
            value={renameDraft}
            autoFocus
            onChange={(event) => onRenameDraft(event.target.value)}
            onBlur={() => onCommitRename(classItem)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onCommitRename(classItem);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onCancelRename();
              }
            }}
          />
        ) : (
          <span className="class-mgr-name">{classItem.name}</span>
        )}
        <ClassManagerJoinControls
          classItem={classItem}
          busy={busy}
          onToggleJoinAccess={onToggleJoinAccess}
          onRefreshJoinCode={onRefreshJoinCode}
          onSaveJoinCode={onSaveJoinCode}
          onToast={onToast}
        />
      </div>
      <div className="class-mgr-actions">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => onStartRename(classItem)}
          title="이름 수정"
        >
          <IconPen size={15} />
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => onArchive(classItem)}
          disabled={busy}
          title="보관하면 학생 접근이 막히고 목록에서 숨겨져요"
        >
          보관
        </button>
        <button
          type="button"
          className="btn-ghost class-mgr-delete"
          onClick={() => onDelete({ id: classItem.id, name: classItem.name })}
          disabled={busy}
          aria-label={`${classItem.name} 삭제`}
          title="완전히 삭제(되돌릴 수 없음)"
        >
          <IconTrash size={15} /> 삭제
        </button>
      </div>
    </li>
  );
}

export function ArchivedClassRow({
  classItem,
  busy,
  onViewClass,
  onUnarchive,
  onDelete,
}) {
  return (
    <li className="class-mgr-row class-mgr-row--archived">
      <span className="class-mgr-name">{classItem.name}</span>
      <div className="class-mgr-actions">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => onViewClass?.(classItem.id)}
          title="데이터를 보기 전용으로 확인합니다"
        >
          보기
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => onUnarchive(classItem)}
          disabled={busy}
          title="다시 운영 중인 반으로 되돌립니다"
        >
          복원
        </button>
        <button
          type="button"
          className="btn-ghost class-mgr-delete"
          onClick={() => onDelete({ id: classItem.id, name: classItem.name })}
          disabled={busy}
          aria-label={`${classItem.name} 삭제`}
          title="완전히 삭제(되돌릴 수 없음)"
        >
          <IconTrash size={15} /> 삭제
        </button>
      </div>
    </li>
  );
}
