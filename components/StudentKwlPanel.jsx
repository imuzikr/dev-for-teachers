"use client";

// =============================================================
// 학생 KWLS 기록 패널 (관리자 대시보드) — 선택한 학생의 KWLS를 날짜별로 표시.
// =============================================================
import { KWLS_COLUMNS, kwlsAnswersFromEntry } from "@/lib/kwls";

function fmtDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}

export default function StudentKwlPanel({ entries = [] }) {
  const byDate = {};
  entries.forEach((e) => {
    (byDate[e.date] ??= []).push(e);
  });
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <section className="admin-activity-panel kwl-record-panel">
      <div className="admin-panel-head">
        <h2>📒 KWLS 기록</h2>
        <span>{dates.length}일 · {entries.length}건</span>
      </div>

      {dates.length === 0 ? (
        <div className="admin-empty">아직 KWLS 기록이 없습니다.</div>
      ) : (
        <div className="kwl-record-list">
          {dates.map((date) => (
            <div key={date} className="kwl-record-day">
              <div className="kwl-record-date">{fmtDate(date)}</div>
              {byDate[date].map((e) => (
                <div key={e.id} className="kwl-record-entry">
                  {KWLS_COLUMNS.map((c) => {
                    const answers = kwlsAnswersFromEntry(e);
                    return answers[c.key]?.trim() ? (
                      <div className="kwl-history-row" key={c.key}>
                        <span className={`kwl-badge kwl-badge-${c.letter.toLowerCase()}`}>{c.letter}</span>
                        <p>{answers[c.key]}</p>
                      </div>
                    ) : null;
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
