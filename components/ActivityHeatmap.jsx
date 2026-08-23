"use client";

import { toDate } from "@/lib/store";
import ActivityOverview from "./ActivityOverview";

const WEEKS = 52;
const LEVEL_COLORS = ["#ebe9e2", "#c8e6ca", "#8ec892", "#5c9e68", "#3a7a48"];
const FUTURE_COLOR = "#f5f4ef";
const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const MONTH_NAMES = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

function getLevel(count) {
  if (!count) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export default function ActivityHeatmap({ questions = [], answerEvents = [], overviewValues }) {
  const today = new Date();

  const activity = {};
  questions.forEach((q) => {
    const k = dayKey(toDate(q.createdAt));
    activity[k] = (activity[k] ?? 0) + 1;
  });
  answerEvents.forEach((e) => {
    const k = dayKey(toDate(e.answer.createdAt));
    activity[k] = (activity[k] ?? 0) + 1;
  });

  const start = new Date();
  start.setDate(start.getDate() - start.getDay() - (WEEKS - 1) * 7);
  start.setHours(0, 0, 0, 0);

  const weeks = Array.from({ length: WEEKS }, (_, w) => {
    const days = Array.from({ length: 7 }, (_, d) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      const isFuture = date > today;
      const k = dayKey(date);
      return {
        date,
        count: isFuture ? null : (activity[k] ?? 0),
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        isFuture,
      };
    });
    const firstMonth = days[0].date.getMonth();
    const prevFirstMonth = w > 0
      ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + (w - 1) * 7).getMonth()
      : -1;
    return { days, monthLabel: firstMonth !== prevFirstMonth ? MONTH_NAMES[firstMonth] : null };
  });

  const activeDays = Object.values(activity).filter(Boolean).length;
  const totalCount = Object.values(activity).reduce((s, v) => s + v, 0);

  return (
    <div className="heatmap-panel">
      <div className="admin-panel-head">
        <h2>학습 활동 기록</h2>
        <span>{totalCount}건 · {activeDays}일 활동</span>
      </div>
      <div className="heatmap-outer">
        <div className="heatmap-body">
          <div className="heatmap-day-col">
            {DAY_LABELS.map((label, i) => (
              <span key={i} className="heatmap-day-label">
                {i % 2 !== 0 ? label : ""}
              </span>
            ))}
          </div>
          <div className="heatmap-right">
            <div className="heatmap-month-row">
              {weeks.map((week, wi) => (
                <span key={wi} className="heatmap-month-cell">
                  {week.monthLabel ?? ""}
                </span>
              ))}
            </div>
            <div className="heatmap-grid">
              {weeks.map((week, wi) => (
                <div key={wi} className="heatmap-week">
                  {week.days.map((day, di) => (
                    <div
                      key={di}
                      className="heatmap-cell"
                      style={{
                        background: day.isFuture
                          ? FUTURE_COLOR
                          : LEVEL_COLORS[getLevel(day.count)],
                      }}
                      title={day.isFuture ? "" : `${day.label}: ${day.count}건`}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="heatmap-legend-row">
              <span className="heatmap-legend-text">적음</span>
              {LEVEL_COLORS.map((color, i) => (
                <span key={i} className="heatmap-legend-swatch" style={{ background: color }} />
              ))}
              <span className="heatmap-legend-text">많음</span>
            </div>
          </div>
        </div>

        {overviewValues && (
          <ActivityOverview values={overviewValues} />
        )}
      </div>
    </div>
  );
}
