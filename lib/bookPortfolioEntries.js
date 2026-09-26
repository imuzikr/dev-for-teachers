import { doc, getDocFromServer } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import { isTeacher } from "./user";

export async function loadBookPortfolioEntries({ project, classId, participantUid, user, entriesByActivity = {}, signal }) {
  if (!user?.uid || !participantUid || (!isTeacher(user) && participantUid !== user.uid)) {
    throw new Error("본인 또는 조회 권한이 있는 학생의 기록만 만들 수 있어요.");
  }
  if (!project?.id || !project.steps?.length) throw new Error("저장된 프로젝트가 필요해요.");
  if (!classId || (project.classId || project.id) !== classId) {
    throw new Error("선택한 차시의 프로젝트를 불러온 후 다시 시도해 주세요.");
  }
  const activityIds = [...new Set(project.steps.flatMap(step => (step.activities ?? []).map(activity => activity.id)).filter(Boolean))];
  const entries = {};
  for (let index = 0; index < activityIds.length; index += 6) {
    signal?.throwIfAborted();
    await Promise.all(activityIds.slice(index, index + 6).map(async activityId => {
      const snapshot = isFirebaseConfigured
        ? await getDocFromServer(doc(db, "bookActivities", activityId, "entries", participantUid))
        : null;
      signal?.throwIfAborted();
      const entry = isFirebaseConfigured
        ? snapshot.exists() ? snapshot.data() : null
        : (entriesByActivity[activityId] ?? []).find(item => item.authorId === participantUid) ?? null;
      if (entry && (entry.authorId !== participantUid || entry.activityId !== activityId)) {
        throw new Error("학생 기록의 소유 정보를 확인하지 못했어요. 다시 불러와 주세요.");
      }
      entries[activityId] = entry;
    }));
  }
  return entries;
}
