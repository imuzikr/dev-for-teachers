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
import { isAdmin, isTeacher } from "@/lib/user";
import { getSelectedClassId, setSelectedClassId } from "@/lib/classroom";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useRequireAuth } from "@/lib/useRequireAuth";
import TopNav from "@/components/TopNav";
import Toast from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";
import BookActivityForm from "@/components/BookActivityForm";
import MindmapBoard from "@/components/MindmapBoard";
import MindmapForm from "@/components/MindmapForm";
import BookWorkspace from "@/components/BookWorkspace";
import { IconBook } from "@/components/StatusIcons";

const SUPPORTED_ACTIVITY_TYPES = new Set(["mindmap"]);

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
  const openActivityId = searchParams.get("activity");

  function goToGrid() { router.push("/books"); }
  function goToActivity(activity) { router.push(`/books?activity=${activity.id}`); }

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
          schoolName: d.schoolName || "",
        };
      })
      .sort((a, b) => (a.studentId || a.name).localeCompare(b.studentId || b.name, "ko"));
  }, [memberUids, directory]);

  const visibleActivities = useMemo(
    () => activities.filter((a) => SUPPORTED_ACTIVITY_TYPES.has(a.type)),
    [activities]
  );
  const activeActivity = openActivityId
    ? visibleActivities.find((a) => a.id === openActivityId) ?? null
    : null;
  const activeClassId = activeActivity?.classId ?? classId;
  const activeClassName = classes.find((c) => c.id === activeClassId)?.name ?? "";
  const isMindmap = activeActivity?.type === "mindmap";

  const participants = useMemo(() => {
    if (admin) return roster;
    if (!user) return [];
    return [{
      uid: user.uid,
      name: user.realName || user.displayName,
      schoolName: user.schoolName || "",
      emoji: user.emoji,
    }];
  }, [admin, roster, user]);

  async function handleCreate(form) {
    await addBookActivity(user, { classId, ...form });
    setCreatingType(null);
    setToast("활동을 만들었어요.");
  }

  async function handleDelete() {
    const target = confirmDelete;
    setConfirmDelete(null);
    await deleteBookActivity(target.id);
    if (openActivityId === target.id) goToGrid();
    setToast("활동을 삭제했어요.");
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
          onBack={goToGrid}
        />
      ) : isMindmap ? (
        <MindmapForm
          activity={activeActivity}
          user={user}
          onBack={goToGrid}
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
          </div>

          <p className="books-intro">
            책을 읽으며 떠올린 생각을 마인드맵으로 정리하고{" "}
            <span className="keep-together">함께 살펴볼 수 있어요.</span>
          </p>

          <BookWorkspace
            activities={visibleActivities}
            participants={participants}
            user={user}
            isTeacher={admin}
            hasClass={!!classId}
            onAdd={() => setCreatingType("mindmap")}
            onOpen={goToActivity}
            onDelete={setConfirmDelete}
            onToggleLock={(activity) => updateBookActivity(activity.id, { locked: !activity.locked })}
          />
        </main>
      )}

      {creatingType && (
        <BookActivityForm
          initialType={creatingType}
          fixedType
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
