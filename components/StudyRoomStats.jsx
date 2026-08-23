"use client";

// =============================================================
// 공부방(클래스)별 통계 (교사용) — 반별 카드 제출률·KWL 참여.
// 공부방 카드는 "보드당 학생 1개"가 보장되므로, 제출 카드 수를
// (보드 수 × 참여 학생 수)로 나누면 의미 있는 제출률이 됩니다.
// =============================================================
function isStudent(id) {
  return id && !String(id).startsWith("teacher_");
}

function EmptyPanel({ children }) {
  return <div className="admin-empty">{children}</div>;
}

export default function StudyRoomStats({ classes = [], boards = [], cardsByBoard = {}, kwl = [], classId = null }) {
  const nameById = new Map(classes.map((c) => [c.id, c.name]));

  // 특정 반이 선택되면 그 반만, 아니면 전체 반
  const scopedBoards = classId ? boards.filter((b) => b.classId === classId) : boards;
  const scopedKwl = classId ? kwl.filter((e) => e.classId === classId) : kwl;

  // 학생용 보드만(공지 제외) 반별로 그룹화
  const boardsByClass = new Map();
  scopedBoards
    .filter((b) => b.type !== "notice")
    .forEach((b) => {
      const cid = b.classId ?? "기타";
      if (!boardsByClass.has(cid)) boardsByClass.set(cid, []);
      boardsByClass.get(cid).push(b);
    });

  const kwlByClass = new Map();
  scopedKwl.forEach((e) => {
    if (!isStudent(e.userId)) return;
    if (!kwlByClass.has(e.classId)) kwlByClass.set(e.classId, []);
    kwlByClass.get(e.classId).push(e);
  });

  const rows = [...boardsByClass.entries()].map(([cid, classBoards]) => {
    const cards = classBoards.flatMap((b) => (cardsByBoard[b.id] ?? []).filter((c) => isStudent(c.authorId)));
    const submitters = new Set(cards.map((c) => c.authorId));
    const kwlEntries = kwlByClass.get(cid) ?? [];
    const kwlAuthors = new Set(kwlEntries.map((e) => e.userId));
    // 참여 학생 = 카드 제출자 ∪ KWL 작성자
    const participants = new Set([...submitters, ...kwlAuthors]);
    const boardCount = classBoards.length;
    const cardCount = cards.length;
    const denom = boardCount * participants.size;
    const submitRate = denom > 0 ? Math.round((cardCount / denom) * 100) : 0;
    const kwlRate = participants.size > 0 ? Math.round((kwlAuthors.size / participants.size) * 100) : 0;
    return {
      cid,
      name: nameById.get(cid) ?? cid,
      boardCount,
      participants: participants.size,
      cardCount,
      submitRate,
      kwlAuthors: kwlAuthors.size,
      kwlCount: kwlEntries.length,
      kwlRate,
    };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, "ko"));

  return (
    <section className="admin-activity-panel">
      <div className="admin-panel-head">
        <h2>🧩 공부방(반)별 활동</h2>
        <span>{rows.length}개 반</span>
      </div>

      {rows.length === 0 ? (
        <EmptyPanel>공부방 활동이 없습니다.</EmptyPanel>
      ) : (
        <table className="overview-table study-stats-table">
          <thead>
            <tr>
              <th>반</th>
              <th>보드</th>
              <th>참여 학생</th>
              <th>제출 카드</th>
              <th>카드 제출률</th>
              <th>KWL 참여</th>
              <th>KWL 건수</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cid}>
                <td className="ov-name">{r.name}</td>
                <td>{r.boardCount}</td>
                <td>{r.participants}</td>
                <td>{r.cardCount}</td>
                <td>
                  <div className="rate-cell">
                    <div className="rate-track">
                      <div className="rate-fill" style={{ width: `${r.submitRate}%` }} />
                    </div>
                    <span>{r.submitRate}%</span>
                  </div>
                </td>
                <td>
                  <div className="rate-cell">
                    <div className="rate-track">
                      <div className="rate-fill kwl" style={{ width: `${r.kwlRate}%` }} />
                    </div>
                    <span>{r.kwlAuthors}/{r.participants}</span>
                  </div>
                </td>
                <td>{r.kwlCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
