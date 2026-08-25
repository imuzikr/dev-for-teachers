"use client";

import { toDate } from "@/lib/store";

const WEEKS = 52;
const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function activityLevel(count) {
  if (!count) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

export default function ActivityHeatmap({ events = [] }) {
  const today = new Date();
  const activity = events.reduce((counts, value) => {
    const date = toDate(value);
    const key = dayKey(date);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const start = new Date();
  start.setDate(start.getDate() - start.getDay() - (WEEKS - 1) * 7);
  start.setHours(0, 0, 0, 0);

  const weeks = Array.from({ length: WEEKS }, (_, weekIndex) => {
    const days = Array.from({ length: 7 }, (_, dayIndex) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + weekIndex * 7 + dayIndex);
      const future = date > today;
      return { date, future, count: future ? 0 : activity[dayKey(date)] ?? 0 };
    });
    const month = days[0].date.getMonth();
    const previousMonth = weekIndex > 0
      ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + (weekIndex - 1) * 7).getMonth()
      : -1;
    return { days, monthLabel: month !== previousMonth ? MONTH_NAMES[month] : "" };
  });
  const activeDays = Object.values(activity).filter(Boolean).length;

  return (
    <section className="heatmap-panel" aria-label="사용자 활동 히트맵">
      <div className="admin-panel-head">
        <h2>활동 기록</h2>
        <span>{events.length}건 · {activeDays}일 활동</span>
      </div>
      <div className="heatmap-body">
        <div className="heatmap-day-col" aria-hidden="true">
          {DAY_LABELS.map((label, index) => (
            <span className="heatmap-day-label" key={label}>{index % 2 ? label : ""}</span>
          ))}
        </div>
        <div className="heatmap-right">
          <div className="heatmap-month-row" aria-hidden="true">
            {weeks.map((week, index) => (
              <span className="heatmap-month-cell" key={index}>{week.monthLabel}</span>
            ))}
          </div>
          <div className="heatmap-grid">
            {weeks.map((week, weekIndex) => (
              <div className="heatmap-week" key={weekIndex}>
                {week.days.map((day) => (
                  <span
                    className={`heatmap-cell ${day.future ? "is-future" : `level-${activityLevel(day.count)}`}`}
                    key={day.date.toISOString()}
                    title={day.future ? "" : `${day.date.getMonth() + 1}/${day.date.getDate()}: ${day.count}건`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="heatmap-legend-row" aria-label="활동량 범례">
            <span className="heatmap-legend-text">적음</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <span className={`heatmap-legend-swatch level-${level}`} key={level} />
            ))}
            <span className="heatmap-legend-text">많음</span>
          </div>
        </div>
      </div>
    </section>
  );
}
