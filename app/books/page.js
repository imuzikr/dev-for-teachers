"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addBookActivity,
  deleteBookActivity,
  subscribeBookActivities,
  subscribeClassMembers,
  subscribeClasses,
  subscribeMyMemberships,
  subscribeUserDirectory,
  updateBookActivity,
} from "@/lib/store";
import { isFirebaseConfigured } from "@/lib/firebase";
import { isAdmin, isTeacher } from "@/lib/user";
import { getSelectedClassId, setSelectedClassId } from "@/lib/classroom";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useRequireAuth } from "@/lib/useRequireAuth";
import TopNav from "@/components/TopNav";
import ClassEntry from "@/components/ClassEntry";
import Toast from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";
import BookActivityForm from "@/components/BookActivityForm";
import MindmapBoard from "@/components/MindmapBoard";
import MindmapForm from "@/components/MindmapForm";
import { IconBook, IconTrash } from "@/components/StatusIcons";

const ACTIVITY_KINDS = [
  {
    key: "mindmap",
    label: "마인드맵",
    desc: "주제에서 가지를 뻗어 생각을 펼칩니다",
    addLabel: "마인드맵 추가하기",
  },
];

const ACTIVITY_KIND_BY_KEY = new Map(ACTIVITY_KINDS.map((k) => [k.key, k]));

function activityTime(activity) {
  const raw = activity?.createdAt;
  if (!raw) return 0;
  if (typeof raw.toMillis === "function") return raw.toMillis();
  if (typeof raw.toDate === "function") return raw.toDate().getTime();
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "number") return raw;
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function activityDateLabel(activity) {
  const time = activityTime(activity);
  if (!time) return "날짜 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(time));
}

export default function BooksPage() {
  return (
    <Suspense fallback={null}>
      <BooksPageInner />
    </Suspense>
  );
}

function BooksPageInner() {
  const user = useCurrentUser();
  useRequireAuth();
  const admin = user ? isTeacher(user) : false;
  const superAdmin = user ? isAdmin(user) : false;
  const router = useRouter();
  const searchParams = useSearchParams();
  const openKind = searchParams.get("kind");
  const openActivityId = searchParams.get("activity");

  function goToGrid() {
    router.push("/books");
  }
  function goToKind(kindKey) {
    router.push(kindKey ? `/books?kind=${kindKey}` : "/books");
  }
  function goToActivity(activity) {
    router.push(`/books?kind=${activity.type}&activity=${activity.id}`);
  }

  const [classes, setClasses] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [localSelectedId, setLocalSelectedId] = useState(null);
  const [teacherClassId, setTeacherClassId] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [memberUids, setMemberUids] = useState([]);
  const [activities, setActivities] = useState([]);
  const [creatingType, setCreatingType] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    function sync() {
      setLocalSelectedId(getSelectedClassId());
    }
    sync();
    window.addEventListener("class-change", sync);
    return () => window.removeEventListener("class-change", sync);
  }, []);

  useEffect(() => subscribeClasses(setClasses), []);

  useEffect(() => {
    if (!user || admin) {
      setMemberships([]);
      return;
    }
    return subscribeMyMemberships(user.uid, setMemberships);
  }, [user?.uid, admin]);

  useEffect(() => {
    if (!admin) {
      setDirectory([]);
      return;
    }
    return subscribeUserDirectory(setDirectory);
  }, [admin]);

  const myClasses = useMemo(
    () => (superAdmin ? classes : classes.filter((c) => c.createdBy === user?.uid)),
    [classes, superAdmin, user?.uid]
  );
  const membershipIds = useMemo(() => memberships.map((m) => m.classId), [memberships]);
  const studentClassId =
    localSelectedId && membershipIds.includes(localSelectedId)
      ? localSelectedId
      : membershipIds[0] ?? null;

  useEffect(() => {
    if (!admin || myClasses.length === 0) return;
    if (teacherClassId && myClasses.some((c) => c.id === teacherClassId)) return;
    const remembered =
      localSelectedId && myClasses.some((c) => c.id === localSelectedId)
        ? localSelectedId
        : myClasses[0].id;
    setTeacherClassId(remembered);
    if (localSelectedId !== remembered) setSelectedClassId(remembered);
  }, [admin, myClasses, teacherClassId, localSelectedId]);

  const classId = admin ? teacherClassId : studentClassId;
  const currentClass = (admin ? myClasses : classes).find((c) => c.id === classId) ?? null;

  useEffect(() => subscribeBookActivities(classId, setActivities), [classId]);

  useEffect(() => {
    if (!admin || !classId) {
      setMemberUids([]);
      return;
    }
    return subscribeClassMembers(classId, setMemberUids);
  }, [admin, classId]);

  const roster = useMemo(() => {
    const dir = new Map(directory.map((d) => [d.uid, d]));
    return memberUids
      .map((uid) => {
        const d = dir.get(uid) ?? {};
        return {
          uid,
          name: d.realName || d.studentId || "이름 미설정",
          studentId: d.studentId || null,
          emoji: d.emoji || "🙂",
        };
      })
      .sort((a, b) => (a.studentId || a.name).localeCompare(b.studentId || b.name, "ko"));
  }, [memberUids, directory]);

  const visibleActivities = useMemo(
    () => activities.filter((a) => ACTIVITY_KIND_BY_KEY.has(a.type)),
    [activities]
  );
  const activeActivity = openActivityId
    ? visibleActivities.find((a) => a.id === openActivityId) ?? null
    : null;
  const activeClassId = activeActivity?.classId ?? classId;
  const activeClassName = classes.find((c) => c.id === activeClassId)?.name ?? "";
  const openKindInfo = openKind ? ACTIVITY_KIND_BY_KEY.get(openKind) ?? null : null;
  const activitiesByKind = useMemo(() => {
    return ACTIVITY_KINDS.map((kind) => {
      const items = visibleActivities
        .filter((a) => a.type === kind.key)
        .sort((a, b) => activityTime(a) - activityTime(b));
      return { ...kind, items };
    });
  }, [visibleActivities]);
  const openKindActivities =
    activitiesByKind.find((kind) => kind.key === openKind)?.items ?? [];
  const isMindmap = activeActivity?.type === "mindmap";

  async function handleCreate(form) {
    await addBookActivity(user, { classId, ...form });
    setCreatingType(null);
    setToast("활동을 만들었어요.");
  }

  async function handleDelete() {
    const target = confirmDelete;
    setConfirmDelete(null);
    await deleteBookActivity(target.id);
    if (openActivityId === target.id) goToKind(target.type);
    setToast("활동을 삭제했어요.");
  }

  if (isFirebaseConfigured && !admin && user && membershipIds.length === 0) {
    return (
      <div className="board-shell">
        <TopNav active="books" />
        <ClassEntry />
      </div>
    );
  }

  return (
    <div className="board-shell">
      <TopNav active="books" />

      {isMindmap && admin ? (
        <MindmapBoard
          activity={activeActivity}
          className={activeClassName}
          classId={activeClassId}
          user={user}
          roster={roster}
          onBack={() => goToKind(activeActivity.type)}
        />
      ) : isMindmap ? (
        <MindmapForm
          activity={activeActivity}
          user={user}
          onBack={() => goToKind(activeActivity.type)}
        />
      ) : (
        <main className="books-main">
          <div className="books-head">
            <div className="books-head-main">
              <h1>
                <IconBook size={26} /> 책방
              </h1>
              {admin && myClasses.length > 0 && (
                <select
                  className="study-class-select"
                  value={classId ?? ""}
                  onChange={(e) => {
                    setTeacherClassId(e.target.value);
                    setSelectedClassId(e.target.value);
                  }}
                >
                  {myClasses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              {!admin && membershipIds.length > 1 ? (
                <select
                  className="study-class-select"
                  value={classId ?? ""}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                >
                  {membershipIds.map((cid) => (
                    <option key={cid} value={cid}>
                      {classes.find((c) => c.id === cid)?.name ?? "우리 반"}
                    </option>
                  ))}
                </select>
              ) : (
                !admin && currentClass && (
                  <span className="books-class-name">{currentClass.name}</span>
                )
              )}
            </div>
            {admin && classId && (
              <button className="btn-primary" onClick={() => setCreatingType("mindmap")}>
                ＋ 독서 활동 만들기
              </button>
            )}
          </div>

          <p className="books-intro">
            책을 읽으며 떠올린 생각을 마인드맵으로 정리하고{" "}
            <span className="keep-together">함께 살펴볼 수 있어요.</span>
          </p>

          {admin && myClasses.length === 0 ? (
            <p className="empty-note">
              아직 만든 반이 없어요. 공부방에서 반을 먼저 만들어 주세요.
            </p>
          ) : openKindInfo ? (
            <ActivityKindDashboard
              kind={openKindInfo}
              activities={openKindActivities}
              isTeacher={admin}
              onBack={goToGrid}
              onAdd={() => setCreatingType(openKindInfo.key)}
              onOpen={goToActivity}
              onDelete={setConfirmDelete}
              onToggleLock={(activity) =>
                updateBookActivity(activity.id, { locked: !activity.locked })
              }
            />
          ) : (
            <ActivityKindGrid kinds={activitiesByKind} onOpen={goToKind} />
          )}
        </main>
      )}

      {creatingType && (
        <BookActivityForm
          initialType={creatingType}
          fixedType={!!openKindInfo}
          onSave={handleCreate}
          onClose={() => setCreatingType(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="활동 삭제"
          preview={confirmDelete.title}
          description={"이 활동과 학생들이 만든 내용이 모두 삭제됩니다.\n되돌릴 수 없습니다."}
          confirmLabel="삭제"
          danger
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast("")} />}
    </div>
  );
}

function ActivityKindGrid({ kinds, onOpen }) {
  return (
    <div className="book-kind-grid">
      {kinds.map((kind) => {
        const latest = kind.items[kind.items.length - 1] ?? null;
        return (
          <button
            key={kind.key}
            type="button"
            className="book-kind-card"
            onClick={() => onOpen(kind.key)}
          >
            <span className="book-kind-count">{kind.items.length}개</span>
            <strong>{kind.label}</strong>
            <em>{kind.desc}</em>
            <span className="book-kind-meta">
              {latest ? `최근 활동 ${activityDateLabel(latest)}` : "아직 만든 활동 없음"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ActivityKindDashboard({
  kind,
  activities,
  isTeacher,
  onBack,
  onAdd,
  onOpen,
  onDelete,
  onToggleLock,
}) {
  return (
    <section className="book-kind-dashboard">
      <div className="book-kind-head">
        <button type="button" className="btn-ghost" onClick={onBack}>
          ← 활동 종류
        </button>
        <div>
          <h2>{kind.label}</h2>
          <p>{kind.desc}</p>
        </div>
        {isTeacher && (
          <button type="button" className="btn-primary" onClick={onAdd}>
            ＋ {kind.addLabel}
          </button>
        )}
      </div>

      {activities.length === 0 ? (
        <p className="empty-note">
          아직 만든 {kind.label} 활동이 없어요.
          {isTeacher ? ` ‘${kind.addLabel}’로 첫 활동을 열어 보세요.` : " 선생님이 활동을 열면 여기에 나타납니다."}
        </p>
      ) : (
        <div className="book-activity-grid">
          {activities.map((a) => (
            <ActivityCard
              key={a.id}
              activity={a}
              isTeacher={isTeacher}
              onOpen={() => onOpen(a)}
              onDelete={() => onDelete(a)}
              onToggleLock={() => onToggleLock(a)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ActivityCard({ activity, isTeacher, onOpen, onDelete, onToggleLock }) {
  return (
    <div className="book-activity-card">
      <button type="button" className="book-activity-open" onClick={onOpen}>
        <span className="book-activity-topic">{activity.topic || "주제 미정"}</span>
        <strong className="book-activity-title">{activity.title}</strong>
        <span className="book-activity-date">{activityDateLabel(activity)}</span>
        <span className="book-activity-meta">
          마인드맵 · 개인 활동{activity.locked && " · 잠김"}
        </span>
      </button>
      {isTeacher && (
        <div className="book-activity-actions">
          <button type="button" className="btn-ghost" onClick={onToggleLock}>
            {activity.locked ? "잠금 해제" : "잠그기"}
          </button>
          <button type="button" className="btn-ghost qa-delete" onClick={onDelete}>
            <IconTrash size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
