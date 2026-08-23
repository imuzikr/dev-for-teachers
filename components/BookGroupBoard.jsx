"use client";

// =============================================================
// 독서 활동 작업 화면
// -------------------------------------------------------------
// 교사 — 세 칸으로 나뉩니다.
//     왼쪽   모둠 목록(세로). 고르면 가운데가 그 모둠의 판이 됩니다.
//     가운데 고른 모둠의 판 — 모둠원이 넣은 낱말을 사람 색으로 구분.
//     오른쪽 그 모둠의 진행 상황(채운 칸·낱말 수·모둠원별 낱말 수).
//   머리말의 '전체 보기'로 반 전체 집계 화면으로 넘어갑니다.
//
// 학생 — 모둠이 없을 때만 이 화면을 봅니다(자유 구성에서 모둠 고르기).
//   모둠이 정해지면 곧바로 자기 판으로 들어가므로 여기를 거치지 않습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import {
  subscribeBookGroups,
  subscribeGroupWords,
  composeBookGroups,
  joinBookGroup,
  leaveBookGroup,
} from "@/lib/store";
import { CELL_COUNT, CONSONANT_LABELS, heatOpacity, cellKey } from "@/lib/consonants";
import { memberLegend } from "@/lib/bookColors";
import GroupComposer from "./GroupComposer";
import ConsonantCanvas from "./ConsonantCanvas";
import { IconPeople, IconLock } from "./StatusIcons";

export default function BookGroupBoard({
  activity,
  className = "",
  user,
  isTeacher,
  roster = [],
  baseGroupAssignment = null,
  onOpenAll,
  onBack,
  onToast,
}) {
  const [groups, setGroups] = useState([]);
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickedId, setPickedId] = useState(null); // 교사가 고른 모둠

  useEffect(() => subscribeBookGroups(activity.id, setGroups), [activity.id]);

  const freeMode = activity.groupMode === "free";
  const maxPerGroup = activity.maxPerGroup ?? 6;

  // 내가 속한 모둠 (자유 구성에서 '이미 참여했는지' 판단에도 씁니다)
  const myGroup = useMemo(
    () => groups.find((g) => (g.memberUids ?? []).includes(user?.uid)),
    [groups, user?.uid]
  );

  // 교사가 활동에 처음 들어오면 아직 어느 모둠도 고르지 않은 상태입니다.
  // 임의로 첫 모둠을 열어 두면 마치 교사가 그 모둠을 고른 것처럼 보이므로,
  // 실제로 고르기 전까지 가운데 칸은 비워 둡니다.
  const picked = groups.find((g) => g.id === pickedId) ?? null;

  async function handleJoin(group) {
    if (busy) return;
    setBusy(true);
    try {
      if (myGroup && myGroup.id !== group.id) {
        onToast?.("이미 다른 모둠에 있어요. 먼저 나온 뒤에 참여해 주세요.");
        return;
      }
      await joinBookGroup(activity.id, group.id, user);
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave(group) {
    if (busy) return;
    setBusy(true);
    try {
      const stored = (group.members ?? []).find((m) => m.uid === user.uid) ?? null;
      await leaveBookGroup(activity.id, group.id, user, stored);
    } finally {
      setBusy(false);
    }
  }

  const head = (
    <div className="books-head">
      <div className="books-head-main">
        <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
        <h1 className="book-group-title">
          {activity.title}
          <span className="book-group-topic">{activity.topic}</span>
          {/* 이 활동이 어느 반 것인지 — 학생에게 안 보이면 반이 다른 경우가 많아 표시 */}
          {className && <span className="book-group-class">{className}</span>}
        </h1>
        {isTeacher && (
          <button type="button" className="btn-primary book-allview-btn" onClick={onOpenAll}>
            전체 보기
          </button>
        )}
      </div>
      {isTeacher && !freeMode && (
        <div className="book-head-actions">
          <button className="btn-ghost" onClick={() => setComposing(true)}>
            <IconPeople size={15} /> 활동 모둠
          </button>
        </div>
      )}
    </div>
  );

  const composer = composing && (
    <GroupComposer
      board={{ id: activity.id, title: activity.title }}
      roster={roster}
      cards={groups.map((g) => ({
        groupId: g.id,
        groupIndex: g.groupIndex,
        title: g.groupName,
        groupName: g.groupName,
        members: g.members ?? [],
        leaderUid: g.leaderUid,
        retired: g.retired,
      }))}
      onCompose={composeBookGroups}
      keepEmpty
      baseGroups={baseGroupAssignment?.groups ?? []}
      groupSetName={activity.groupSetName || `${activity.topic || activity.title || "독서 활동"} 활동 모둠`}
      onClose={() => setComposing(false)}
      onSaved={() => onToast?.("모둠을 구성했어요.")}
    />
  );

  // ── 학생(모둠 없음) — 예전처럼 카드를 늘어놓고 고르게 합니다 ──
  if (!isTeacher) {
    return (
      <main className="books-main">
        {head}
        {activity.locked && (
          <p className="book-locked-note">
            <IconLock size={15} /> 지금은 잠겨 있어 새 단어를 넣을 수 없어요.
          </p>
        )}
        {groups.length === 0 ? (
          <p className="empty-note">아직 모둠이 만들어지지 않았어요. 잠시 기다려 주세요.</p>
        ) : (
          <>
            {freeMode && !myGroup && (
              <p className="book-free-hint">함께할 모둠을 골라 ‘참여하기’를 눌러 주세요.</p>
            )}
            <div className="book-group-grid">
              {groups.map((g) => {
                const members = g.members ?? [];
                const mine = g.id === myGroup?.id;
                const full = members.length >= maxPerGroup;
                return (
                  <div key={g.id} className={`book-group-card${mine ? " mine" : ""}`}>
                    <div className="book-group-card-head">
                      <strong>{g.groupName || `${g.groupIndex}모둠`}</strong>
                      <span className="book-group-count">
                        {members.length}
                        {freeMode && ` / ${maxPerGroup}`}명
                      </span>
                    </div>
                    {members.length === 0 ? (
                      <p className="book-group-empty">아직 모둠원이 없어요</p>
                    ) : (
                      <ul className="book-group-members">
                        {members.map((m) => (
                          <li key={m.uid} className={m.uid === user?.uid ? "me" : ""}>
                            {m.uid === g.leaderUid && "👑 "}
                            {m.name}
                          </li>
                        ))}
                      </ul>
                    )}
                    {freeMode && (
                      <div className="book-group-card-actions">
                        {mine ? (
                          <button type="button" className="btn-ghost" onClick={() => handleLeave(g)} disabled={busy}>
                            나가기
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => handleJoin(g)}
                            disabled={busy || full || !!myGroup}
                          >
                            {full ? "자리 참" : "참여하기"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    );
  }

  // ── 교사 — 왼쪽 모둠 목록 · 가운데 모둠 판 · 오른쪽 진행 ──
  return (
    <main className="books-main book-workspace-main">
      {head}

      {activity.locked && (
        <p className="book-locked-note">
          <IconLock size={15} /> 지금은 잠겨 있어 새 단어를 넣을 수 없어요.
        </p>
      )}

      {groups.length === 0 ? (
        <p className="empty-note">
          아직 모둠이 없어요. ‘모둠 구성’으로 모둠을 만들어 주세요.
        </p>
      ) : (
        <div className="book-workspace">
          {/* 왼쪽 — 모둠 목록(세로) */}
          <aside className="book-group-rail">
            {groups.map((g) => {
              const members = g.members ?? [];
              const on = g.id === picked?.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  className={`book-rail-card${on ? " on" : ""}`}
                  onClick={() => setPickedId(g.id)}
                  aria-pressed={on}
                >
                  <span className="book-rail-head">
                    <strong>{g.groupName || `${g.groupIndex}모둠`}</strong>
                    <span className="book-group-count">{members.length}명</span>
                  </span>
                  {members.length === 0 ? (
                    <span className="book-group-empty">아직 모둠원이 없어요</span>
                  ) : (
                    <span className="book-rail-members">
                      {members.map((m) => m.name).join(" · ")}
                    </span>
                  )}
                </button>
              );
            })}
          </aside>

          {/* 가운데 — 고른 모둠의 판 */}
          <div className="book-workspace-center">
            {picked ? (
              <ConsonantCanvas
                key={picked.id}
                activity={activity}
                groupId={picked.id}
                user={user}
                isTeacher
                viewMode="group"
                embedded
              />
            ) : (
              <p className="empty-note">왼쪽에서 모둠을 골라 주세요.</p>
            )}
          </div>

          {/* 오른쪽 — 그 모둠의 진행 상황 */}
          {picked && <GroupProgress activity={activity} group={picked} />}
        </div>
      )}

      {composer}
    </main>
  );
}

// 오른쪽 패널 — 모둠 전체가 아니라 '학생 개인'이 어디까지 했는지.
// 전체 집계 화면의 히트맵과 같은 생김새로, 모둠원 한 명당 한 줄(이름 + 칸별 히트맵)씩
// 보여 줍니다 — 누가 아직 못 채웠는지 한눈에 비교할 수 있게.
function GroupProgress({ activity, group }) {
  const [words, setWords] = useState([]);
  useEffect(
    () => subscribeGroupWords(activity.id, group.id, setWords),
    [activity.id, group.id]
  );

  const legend = memberLegend(group);

  // 학생별 칸 채움 현황 — 자음 14칸 순서 그대로(그 학생이 그 칸에 넣은 낱말 수)
  const rows = useMemo(
    () =>
      legend.map((m) => {
        const mine = words.filter((w) => w.authorId === m.uid);
        const cellCounts = Array.from(
          { length: CELL_COUNT },
          (_, i) => mine.filter((w) => w.cellKey === cellKey(i)).length
        );
        return { ...m, cellCounts, filled: cellCounts.filter((n) => n > 0).length, total: mine.length };
      }),
    [legend, words]
  );

  return (
    <aside className="dash-side book-group-progress">
      <h3>모둠원별 진행</h3>
      {rows.length === 0 ? (
        <p className="dash-side-empty">아직 모둠원이 없어요.</p>
      ) : (
        <ul className="dash-progress-list">
          {rows.map((m) => (
            <li key={m.uid}>
              <span className="dash-progress-name">
                <i className="dash-dot" style={{ background: m.color.border }} />
                {m.name}
              </span>
              <span className="dash-progress-num">
                {m.filled}/{CELL_COUNT}칸
                <span className="dash-progress-words"> · 낱말 {m.total}개</span>
              </span>
              <span className="dash-heat">
                {m.cellCounts.map((n, i) => (
                  <i
                    key={i}
                    className="dash-heat-cell"
                    style={n > 0 ? { background: m.color.border, opacity: heatOpacity(n) } : undefined}
                    title={`${CONSONANT_LABELS[i]} · 낱말 ${n}개`}
                  />
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
