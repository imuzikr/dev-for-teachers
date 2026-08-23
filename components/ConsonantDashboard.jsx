"use client";

// =============================================================
// 닿소리 집계 대시보드 (교사 전용) — 전자칠판 미러링용
// -------------------------------------------------------------
// 모든 모둠의 단어를 하나의 격자에 모아 실시간으로 보여 줍니다.
//  · 같은 단어는 한 줄에 모으고, 나온 횟수만큼 카드를 반복해 늘어놓습니다.
//    줄이 길수록 많이 나온 단어 — 막대그래프처럼 한눈에 비교됩니다.
//  · 카드 색은 그 단어를 낸 모둠 색이라 어느 모둠에서 나왔는지 보입니다.
//  · 자음 칸을 누르면 모달로 크게 볼 수 있습니다(칠판에 띄워 함께 보기).
//  · 오른쪽에 모둠별 진행률이 있어 막힌 모둠을 바로 찾을 수 있습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  subscribeBookGroups,
  subscribeGroupWords,
  startBroadcast,
  stopBroadcast,
} from "@/lib/store";
import {
  CONSONANT_LABELS,
  GRID_SLOTS,
  CELL_COUNT,
  cellKey,
  groupColorOf,
  heatOpacity,
} from "@/lib/consonants";

// [학생 화면에 중계]
// 학생은 보안 규칙상 '자기 모둠 낱말'만 읽을 수 있어서, 스스로는 반 전체
// 집계를 만들 수 없습니다. 그래서 집계 결과를 방송 문서(broadcasts/{반})에
// 실어 보냅니다 — 학생은 그 문서만 읽으면 되고, 규칙은 그대로 둡니다.
// 낱말이 바뀌거나 교사가 칸을 크게 열면 그 상태도 같이 실려 갑니다.
export default function ConsonantDashboard({
  activity,
  classId = null,
  user = null,
  onClose,
  embedded = false,
}) {
  const [groups, setGroups] = useState([]);
  const [wordsByGroup, setWordsByGroup] = useState({});
  const [zoomSlot, setZoomSlot] = useState(null); // 크게 보기 모달

  useEffect(() => subscribeBookGroups(activity.id, setGroups), [activity.id]);

  // 모둠이 바뀌면 각 모둠의 단어를 각각 구독합니다(모둠은 많아야 6개).
  const groupIdsKey = useMemo(() => groups.map((g) => g.id).sort().join(","), [groups]);
  useEffect(() => {
    if (!groupIdsKey) { setWordsByGroup({}); return; }
    const ids = groupIdsKey.split(",");
    const unsubs = ids.map((gid) =>
      subscribeGroupWords(activity.id, gid, (list) =>
        setWordsByGroup((prev) => ({ ...prev, [gid]: list }))
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [activity.id, groupIdsKey]);

  const colorOf = groupColorOf;
  // 툴팁에 '1모둠' 대신 교사가 지어 준 이름(나무·소리…)을 보여 줍니다.
  const groupNameOf = useMemo(() => {
    const byIndex = new Map(
      groups.map((g) => [g.groupIndex, g.groupName || `${g.groupIndex}모둠`])
    );
    return (i) => byIndex.get(i) ?? `${i}모둠`;
  }, [groups]);

  // 칸별 → 같은 단어끼리 묶되, 나온 횟수만큼 모둠 정보를 그대로 남깁니다.
  //   [{ text, count, from: [모둠번호, 모둠번호, …] }]  ← 많이 나온 단어가 위로
  const merged = useMemo(() => {
    const cells = {};
    groups.forEach((g) => {
      (wordsByGroup[g.id] ?? []).forEach((w) => {
        const key = (w.text ?? "").trim();
        if (!key) return;
        const bucket = (cells[w.cellKey] ??= new Map());
        const hit = bucket.get(key) ?? { text: key, from: [] };
        hit.from.push(g.groupIndex);
        bucket.set(key, hit);
      });
    });
    const out = {};
    Object.entries(cells).forEach(([k, bucket]) => {
      out[k] = [...bucket.values()]
        .map((w) => ({ ...w, count: w.from.length }))
        .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, "ko"));
    });
    return out;
  }, [groups, wordsByGroup]);

  // 모둠별 진행률 (몇 칸을 채웠는지)
  const progress = useMemo(
    () =>
      groups.map((g) => {
        const list = wordsByGroup[g.id] ?? [];
        // 자음 14칸 각각에 낱말이 몇 개 들어갔는지 (낱말 분포 히트맵용)
        const cellCounts = Array.from({ length: CELL_COUNT }, (_, i) =>
          list.filter((w) => w.cellKey === cellKey(i)).length
        );
        return {
          ...g,
          cellsFilled: new Set(list.map((w) => w.cellKey)).size,
          total: list.length,
          cellCounts,
        };
      }),
    [groups, wordsByGroup]
  );

  // 반 전체가 지금까지 모은 낱말 수 (칸 수와 별개로 활동량을 보여 줍니다)
  const totalWords = useMemo(
    () => Object.values(wordsByGroup).reduce((n, list) => n + (list?.length ?? 0), 0),
    [wordsByGroup]
  );

  const totalFilled = useMemo(
    () => Array.from({ length: CELL_COUNT }, (_, i) => (merged[cellKey(i)] ?? []).length > 0)
      .filter(Boolean).length,
    [merged]
  );

  // ── 학생 화면에 중계 ──────────────────────────────────────
  const [casting, setCasting] = useState(false);
  const canCast = !!(classId && user);

  // 지금 화면에 보이는 것을 그대로 담은 방송 꾸러미.
  // (낱말 문서를 통째로 보내지 않고, 이미 합쳐 놓은 결과만 담아 가볍습니다)
  const castPayload = useMemo(() => {
    const cells = {};
    Object.entries(merged).forEach(([k, list]) => {
      cells[k] = list.map((w) => ({
        text: w.text,
        count: w.count,
        from: w.from,
      }));
    });
    return {
      mode: "consonant",
      activityTitle: activity.title ?? "",
      topic: activity.topic ?? "",
      cells,
      groupNames: groups.map((g) => ({
        index: g.groupIndex,
        name: g.groupName || `${g.groupIndex}모둠`,
      })),
      zoomSlot: zoomSlot ?? null,
      totalFilled,
      totalWords,
      groupCount: groups.length,
    };
  }, [merged, groups, zoomSlot, totalFilled, totalWords, activity.title, activity.topic]);

  // 방송 중에는 화면이 바뀔 때마다 다시 보냅니다. 학생이 낱말을 넣을 때마다
  // 쓰기가 몰리지 않도록 0.8초 쉬었다가 한 번만 보냅니다.
  const payloadKey = JSON.stringify(castPayload);
  useEffect(() => {
    if (!casting || !canCast) return;
    const t = setTimeout(() => {
      startBroadcast(user, classId, castPayload).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casting, canCast, payloadKey]);

  // 화면을 벗어나면 방송도 반드시 종료 — 학생 화면이 갇히지 않게
  useEffect(() => {
    if (!casting || !canCast) return;
    return () => { stopBroadcast(classId).catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casting, canCast, classId]);

  async function toggleCast() {
    if (!canCast) return;
    if (casting) {
      setCasting(false);
      await stopBroadcast(classId).catch(() => {});
    } else {
      setCasting(true);
      await startBroadcast(user, classId, castPayload).catch(() => {});
    }
  }

  const Root = embedded ? "section" : "main";
  return (
    <Root className={`${embedded ? "dash-embed" : "canvas-main"} dash-root`}>
      <div className="canvas-head">
        {!embedded && (
          <button type="button" className="btn-ghost" onClick={onClose}>← 모둠</button>
        )}
        <div className="canvas-head-title">
          <strong>{embedded ? "집계 보기" : activity.topic}</strong>
          <span>
            모둠 {groups.length}개 · {totalFilled} / {CELL_COUNT}칸 · 낱말 {totalWords}개
          </span>
        </div>
        <div className="dash-head-actions">
          {canCast && (
            <button
              type="button"
              className={`btn-ghost dash-cast-btn${casting ? " on" : ""}`}
              onClick={toggleCast}
              title={
                casting
                  ? "학생 화면을 원래대로 되돌립니다"
                  : "이 집계 화면을 학생들 화면에 그대로 띄웁니다"
              }
            >
              {casting && <span className="broadcast-live-dot" aria-hidden="true" />}
              {casting ? "수업 종료" : "수업 시작"}
            </button>
          )}
        </div>
      </div>

      <div className="dash-body">
        <div className="consonant-grid dash-grid">
          {GRID_SLOTS.map((slot, pos) => {
            if (slot === null) {
              return (
                <div key={pos} className="consonant-cell consonant-center">
                  <span className="consonant-center-label">학습주제 · 도서명</span>
                  <strong className="consonant-center-topic">{activity.topic}</strong>
                </div>
              );
            }
            const list = merged[cellKey(slot)] ?? [];
            return (
              <button
                key={pos}
                type="button"
                className={`consonant-cell dash-cell${list.length ? " has-words" : ""}`}
                onClick={() => setZoomSlot(slot)}
              >
                <span className="consonant-label">{CONSONANT_LABELS[slot]}</span>
                <WordRows list={list} colorOf={colorOf} nameOf={groupNameOf} />
              </button>
            );
          })}
        </div>

        <aside className="dash-side">
          <h3>모둠별 진행</h3>
          {progress.length === 0 ? (
            <p className="dash-side-empty">아직 모둠이 없어요.</p>
          ) : (
            <ul className="dash-progress-list">
              {progress.map((g) => (
                <li key={g.id}>
                  <span className="dash-progress-name">
                    <i className="dash-dot" style={{ background: colorOf(g.groupIndex) }} />
                    {g.groupName || `${g.groupIndex}모둠`}
                  </span>
                  <span className="dash-progress-num">
                    {g.cellsFilled}/{CELL_COUNT}칸
                    <span className="dash-progress-words"> · 낱말 {g.total}개</span>
                  </span>
                  <span className="dash-progress-bar">
                    <b style={{ width: `${(g.cellsFilled / CELL_COUNT) * 100}%`, background: colorOf(g.groupIndex) }} />
                  </span>
                  {/* 낱말 분포 — 자음 14칸을 그대로 늘어놓고, 낱말이 많을수록 진하게.
                      막대(몇 칸을 건드렸나)와 달리 '어디에 얼마나 모였나'가 보입니다. */}
                  <span className="dash-heat">
                    {g.cellCounts.map((n, i) => (
                      <i
                        key={i}
                        className="dash-heat-cell"
                        style={
                          n > 0
                            ? { background: colorOf(g.groupIndex), opacity: heatOpacity(n) }
                            : undefined
                        }
                        title={`${CONSONANT_LABELS[i]} · 낱말 ${n}개`}
                      />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {/* 자음 한 칸 크게 보기 — 칠판에 띄워 함께 짚어 볼 때 */}
      {zoomSlot !== null && (
        <div className="modal-backdrop" {...backdropClose(() => setZoomSlot(null))}>
          <div className="modal dash-zoom-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>
                <span className="dash-zoom-label">{CONSONANT_LABELS[zoomSlot]}</span>
                <span className="dash-zoom-topic">{activity.topic}</span>
              </h3>
              <button
                type="button"
                className="btn-close"
                onClick={() => setZoomSlot(null)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="dash-zoom-body">
              {(merged[cellKey(zoomSlot)] ?? []).length === 0 ? (
                <p className="dash-side-empty">아직 이 칸에 나온 단어가 없어요.</p>
              ) : (
                <WordRows list={merged[cellKey(zoomSlot)]} colorOf={colorOf} nameOf={groupNameOf} big />
              )}
            </div>
            <p className="dash-zoom-hint">
              같은 단어는 한 줄에 모았어요. 줄이 길수록 여러 모둠에서 나온 단어입니다.
            </p>
          </div>
        </div>
      )}
    </Root>
  );
}

// 단어 한 줄 = 같은 단어. 나온 횟수만큼 카드를 반복해 늘어놓아
// 줄 길이만으로 어떤 단어가 많이 나왔는지 바로 보이게 합니다.
function WordRows({ list, colorOf, nameOf, big = false }) {
  return (
    <div className={`dash-rows${big ? " big" : ""}`}>
      {list.map((w) => (
        <div key={w.text} className="dash-word-row">
          {w.from.map((groupIndex, i) => (
            <span
              key={i}
              className="consonant-chip dash-chip"
              style={{ borderColor: colorOf(groupIndex), color: colorOf(groupIndex) }}
              // 폭이 고정돼 긴 낱말은 잘리므로, 전체 낱말을 툴팁으로 보여 줍니다.
              title={`${w.text} — ${nameOf(groupIndex)}`}
            >
              {w.text}
            </span>
          ))}
          {w.count > 1 && <em className="dash-row-count">{w.count}</em>}
        </div>
      ))}
    </div>
  );
}
