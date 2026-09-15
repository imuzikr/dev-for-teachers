"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/user";
import { setSelectedClassId } from "@/lib/classroom";
import { CLASS_PURPOSE_INTERNAL, normalizeClassPurpose } from "@/lib/classPurpose";
import ClassManagerModal from "./ClassManagerModal";
import LessonManagerModal from "./LessonManagerModal";
import LessonDownloadsModal from "./LessonDownloadsModal";
import { subscribeClassLessonFiles } from "@/lib/lessonFiles";
import { lessonFileError } from "@/lib/lessonFilePolicy";

export default function BookClassroomTools({
  user, isTeacher, classId, currentClass, classes, allClasses,
  classPurpose, onSelectClass, onToast, onOpenProgress,
}) {
  const [classManagerOpen, setClassManagerOpen] = useState(false);
  const [lessonPicker, setLessonPicker] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [distribution, setDistribution] = useState({ scope: "", files: [], loading: true, error: "" });
  const scope = `${user?.uid}:${classId}`;
  const active = distribution.scope === scope ? distribution : { files: [], loading: true, error: "" };
  useEffect(() => {
    setLessonPicker(false); setDownloadsOpen(false);
    if (!user?.uid || !classId || currentClass?.archived) {
      setDistribution({ scope, files: [], loading: false, error: "" });
      return;
    }
    let mounted = true;
    const stop = subscribeClassLessonFiles(classId,
      files => { if (mounted) setDistribution({ scope, files, loading: false, error: "" }); },
      reason => { if (mounted) setDistribution({ scope, files: [], loading: false, error: lessonFileError(reason) }); });
    return () => { mounted = false; stop(); };
  }, [scope, user?.uid, classId, currentClass?.archived]);
  const unitLabel = normalizeClassPurpose(classPurpose) === CLASS_PURPOSE_INTERNAL ? "차시" : "반";

  function selectClass(id) {
    onSelectClass(id);
    setSelectedClassId(id);
    setClassManagerOpen(false);
  }

  return <>
    <div className="books-classroom-tools">
      {isTeacher && currentClass && !currentClass.archived && <button className="btn-ghost" onClick={() => setLessonPicker(true)}>수업 준비</button>}
      {!isTeacher && active.files.length > 0 && <button type="button" className="btn-outline" onClick={() => setDownloadsOpen(true)}>자료 내려받기</button>}
      {isTeacher && <button className="btn-ghost" onClick={() => setClassManagerOpen(true)}>{unitLabel} 관리하기</button>}
      {isTeacher && onOpenProgress && <button type="button" className="btn-ghost" disabled={!classId} onClick={onOpenProgress}>전체 진행률</button>}
    </div>
    {classManagerOpen && <ClassManagerModal classes={classes} allClasses={allClasses ?? classes}
      classPurpose={classPurpose} user={user ?? getCurrentUser()} onClose={() => setClassManagerOpen(false)}
      onCreated={selectClass} onViewClass={selectClass} onToast={onToast} />}
    {active.error && <span role="alert" className="lesson-error">{active.error}</span>}
    {lessonPicker && <LessonManagerModal key={scope} user={user} classId={classId} className={currentClass?.name} sharedFiles={active.files} distributionLoading={active.loading || !!active.error} onClose={() => setLessonPicker(false)} />}
    {downloadsOpen && <LessonDownloadsModal key={scope} files={active.files} className={currentClass?.name} onClose={() => setDownloadsOpen(false)} />}
  </>;
}
