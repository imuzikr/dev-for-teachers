// =============================================================
// Cloud Functions — 서버에서 동작하는 코드
// -------------------------------------------------------------
// 클라이언트(브라우저)는 조작될 수 있으므로, 아래 세 종류의 작업은
// Firebase 서버에서 실행됩니다.
//
//   [1] 데이터 무결성  : 답변 생성/삭제 시 answerCount를 서버가 집계
//   [2] 역할 부여      : 관리자/교사/학생 역할을 커스텀 클레임으로 지정
//   [3] 알림          : 새 답변 알림 발송
//
// 배포: 프로젝트 루트에서
//   npm install -g firebase-tools
//   firebase login
//   cd functions && npm install && cd ..
//   firebase deploy --only functions
// ※ Cloud Functions는 Blaze(종량제) 요금제에서만 배포됩니다.
//   학급 규모 사용량은 대부분 무료 한도 안에서 처리됩니다.
// (런타임 nodejs22 — firebase.json 참고)
// =============================================================
const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted,
} = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { purgeClassData } = require("./purgeClass");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// 서울 리전에서 실행
setGlobalOptions({ region: "asia-northeast3" });

// 역할 종류와 최초 관리자 이메일
// (첫 관리자는 아직 admin 클레임이 없으므로, 이 이메일로 로그인한
//  계정에 한해 스스로 역할을 부여할 수 있게 허용합니다.)
const ROLES = ["admin", "teacher", "student"];
const INITIAL_ADMIN_EMAIL = "iseoul72@gmail.com";

// =============================================================
// [1] 데이터 무결성 — answerCount 서버 집계
// -------------------------------------------------------------
// 클라이언트가 직접 카운트를 올리면 조작·동시성 문제가 생기므로,
// answers 하위 컬렉션에 문서가 생기고/지워질 때 서버가 집계합니다.
// (이 함수를 배포한 뒤에는 lib/store.js의 addAnswer 안에 있는
//  updateDoc(... increment(1)) 부분을 삭제하세요. 중복 집계 방지)
// =============================================================
exports.onAnswerCreated = onDocumentCreated(
  "questions/{questionId}/answers/{answerId}",
  async (event) => {
    const { questionId } = event.params;
    const answer = event.data.data();
    const questionRef = db.doc(`questions/${questionId}`);

    // 1) 답변 수 +1 (서버에서만 수행 → 조작 불가, 동시 답변에도 안전)
    await questionRef.update({
      answerCount: admin.firestore.FieldValue.increment(1),
    });

    // 2) [3-알림] 질문 작성자에게 인앱 알림 (자기 질문에 단 답변은 제외)
    //    클라이언트가 users/{uid}/notifications를 구독하면 상단바 알림
    //    벨(NotificationBell)에 표시됩니다.
    const questionSnap = await questionRef.get();
    if (!questionSnap.exists) return;
    const question = questionSnap.data();
    if (question.authorId === answer.authorId) return;

    await db.collection(`users/${question.authorId}/notifications`).add({
      type: "new_answer",
      questionId,
      questionTitle: question.title,
      answerAuthorName: answer.authorName,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
);

// 질문자가 "이해됐어요"로 답변을 채택하면, 그 답변을 쓴 학생에게 인앱 알림
exports.onAnswerUnderstood = onDocumentUpdated(
  "questions/{questionId}",
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    const answerId = after.understoodAnswerId;
    // 새로 채택된 경우에만(이미 채택돼 있던 것과 같으면 스킵)
    if (!answerId || answerId === before.understoodAnswerId) return;

    const { questionId } = event.params;
    const answerSnap = await db.doc(`questions/${questionId}/answers/${answerId}`).get();
    if (!answerSnap.exists) return;
    const answer = answerSnap.data();
    // 자기 질문에 자기가 단 답변을 채택한 경우는 알림 불필요
    if (!answer.authorId || answer.authorId === after.authorId) return;

    await db.collection(`users/${answer.authorId}/notifications`).add({
      type: "answer_understood",
      questionId,
      questionTitle: after.title,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
);

// 답변이 삭제되면 카운트 -1
exports.onAnswerDeleted = onDocumentDeleted(
  "questions/{questionId}/answers/{answerId}",
  async (event) => {
    await db
      .doc(`questions/${event.params.questionId}`)
      .update({ answerCount: admin.firestore.FieldValue.increment(-1) })
      .catch(() => {}); // 질문이 함께 삭제된 경우는 무시
  }
);

// =============================================================
// [2] 역할 부여 — 커스텀 클레임 (admin / teacher / student)
// -------------------------------------------------------------
// 역할은 클라이언트가 스스로 정할 수 없고, 이 함수를 통해서만
// 부여됩니다. 부여된 클레임은 Firestore 보안 규칙에서
// request.auth.token.role 로 검사할 수 있습니다.
//   예) notices 쓰기: request.auth.token.role in ['admin', 'teacher']
//
// 클라이언트 호출 예시:
//   import { getFunctions, httpsCallable } from "firebase/functions";
//   const fn = httpsCallable(getFunctions(undefined, "asia-northeast3"), "setUserRole");
//   await fn({ uid: "대상_유저_uid", role: "teacher" });
// =============================================================
exports.setUserRole = onCall({ enforceAppCheck: true }, async (request) => {
  // 로그인 필수
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  // 호출 권한: 이미 admin이거나, 최초 관리자 이메일 본인
  const callerIsAdmin = request.auth.token.role === "admin";
  const callerIsInitialAdmin =
    request.auth.token.email === INITIAL_ADMIN_EMAIL &&
    request.auth.token.email_verified === true;
  if (!callerIsAdmin && !callerIsInitialAdmin) {
    throw new HttpsError("permission-denied", "역할을 부여할 권한이 없습니다.");
  }

  // 입력 검증
  const { uid, role } = request.data || {};
  if (typeof uid !== "string" || !ROLES.includes(role)) {
    throw new HttpsError(
      "invalid-argument",
      `uid와 role(${ROLES.join("/")})을 올바르게 전달해 주세요.`
    );
  }

  // 1) 인증 토큰에 역할 기록 (보안 규칙에서 사용)
  await admin.auth().setCustomUserClaims(uid, { role });

  // 2) 화면 표시용으로 사용자 문서에도 기록
  await db.doc(`users/${uid}`).set({ role }, { merge: true });

  return { ok: true, uid, role };
});

// =============================================================
// 탈퇴 공통 헬퍼 — 권한 판정과 데이터 파기
// =============================================================

// 호출한 교사가 "그 학생을 맡고 있는지" — 학생이 속한 반 중 하나라도
// 호출자가 개설한 반이면 담당 교사로 봅니다.
async function callerOwnsStudent(callerUid, targetUid) {
  const mems = await db.collection("memberships").where("uid", "==", targetUid).get();
  if (mems.empty) return false;
  const classIds = [...new Set(mems.docs.map((d) => d.data().classId).filter(Boolean))];
  const classes = await Promise.all(
    classIds.map((id) => db.doc(`classes/${id}`).get().catch(() => null))
  );
  return classes.some((c) => c && c.exists && c.data().createdBy === callerUid);
}

// 쿼리에 걸린 문서를 모두 삭제 (배치 상한 500 고려)
async function deleteByQuery(query, warnings, label) {
  try {
    const snap = await query.get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    return snap.size;
  } catch (e) {
    // 색인 미생성 등으로 실패해도 나머지 파기는 계속 — 대신 반드시 보고합니다.
    warnings.push(`${label}: ${e && e.message}`);
    return 0;
  }
}

// 학생이 남긴 모든 흔적을 지웁니다. 여러 번 실행해도 안전(멱등)합니다.
// 실패한 항목은 warnings에 모아 호출자에게 그대로 돌려줍니다 — 일부만
// 지워졌는데 성공으로 보고하는 일이 없도록.
async function purgeStudentData(uid, warnings) {
  // 1) 본인이 올린 질문 + 그 질문에 달린 답변(남이 단 것 포함)
  try {
    const qs = await db.collection("questions").where("authorId", "==", uid).get();
    for (const d of qs.docs) {
      const subs = await d.ref.collection("answers").get();
      await Promise.all(subs.docs.map((s) => s.ref.delete()));
      await d.ref.delete();
    }
  } catch (e) {
    warnings.push(`질문: ${e && e.message}`);
  }

  // 2) 남의 글에 단 답변 · 공부방 카드 · KWL
  await deleteByQuery(db.collectionGroup("answers").where("authorId", "==", uid), warnings, "답변");
  await deleteByQuery(db.collectionGroup("cards").where("authorId", "==", uid), warnings, "공부방 카드");
  await deleteByQuery(db.collection("kwl").where("userId", "==", uid), warnings, "KWL");

  // 3) 보상(과일) · 누가기록
  await deleteByQuery(db.collection("rewards").where("uid", "==", uid), warnings, "과일 기록");
  await deleteByQuery(db.collection("studentNotes").where("studentUid", "==", uid), warnings, "누가기록");

  // 4) 책방 — 낱말에는 실명(authorName)이 들어 있어 반드시 지웁니다.
  await deleteByQuery(db.collectionGroup("words").where("authorId", "==", uid), warnings, "책방 낱말");
  // 모둠 명단에서도 빼냅니다(members에 실명 보관).
  try {
    const groups = await db
      .collectionGroup("groups")
      .where("memberUids", "array-contains", uid)
      .get();
    await Promise.all(
      groups.docs.map((g) => {
        const d = g.data();
        const patch = {
          memberUids: admin.firestore.FieldValue.arrayRemove(uid),
          members: (d.members || []).filter((m) => m && m.uid !== uid),
        };
        if (d.leaderUid === uid) patch.leaderUid = null;
        return g.ref.update(patch);
      })
    );
  } catch (e) {
    warnings.push(`책방 모둠 명단: ${e && e.message}`);
  }

  // 5) 업로드한 파일 전부 (uploads/{uid}/ 아래)
  try {
    await admin.storage().bucket().deleteFiles({ prefix: `uploads/${uid}/` });
  } catch (e) {
    warnings.push(`첨부 파일: ${e && e.message}`);
  }

  // 6) 소속 → 프로필 순서로 마지막에. 소속을 먼저 지우면 재시도할 때
  //    담당 교사 판정이 불가능해지므로 이 순서를 지킵니다.
  await deleteByQuery(db.collection("memberships").where("uid", "==", uid), warnings, "반 소속");
  try {
    await db.doc(`users/${uid}`).delete();
  } catch (e) {
    warnings.push(`프로필: ${e && e.message}`);
  }
}

// =============================================================
// [2-b] 탈퇴 — 로그인 계정(Authentication) 삭제
// -------------------------------------------------------------
// 클라이언트는 "남의 계정"을 지울 수 없으므로(구글 정책), 계정 삭제는
// 서버에서만 수행합니다. Firestore 데이터 삭제는 앱(deleteStudent)이
// 규칙 아래에서 처리하고, 이 함수는 로그인 계정 자체를 제거해
// 재가입(같은 이메일)이 가능하도록 하고 남아 있는 역할 클레임도 없앱니다.
//
// 권한 계층:
//  · 최고 관리자: 누구나 삭제(단, 최고 관리자 계정 자신은 보호)
//  · 선생님(중간 관리자): 학생 계정만 삭제 (다른 선생님/관리자 삭제 불가)
// =============================================================
exports.deleteAuthUser = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const callerRole = request.auth.token.role;
  const callerIsAdmin =
    callerRole === "admin" ||
    (request.auth.token.email === INITIAL_ADMIN_EMAIL &&
      request.auth.token.email_verified === true);
  const callerIsTeacher = callerRole === "teacher" || callerIsAdmin;
  if (!callerIsTeacher) {
    throw new HttpsError("permission-denied", "탈퇴 처리 권한이 없습니다.");
  }

  const { uid } = request.data || {};
  if (typeof uid !== "string" || !uid) {
    throw new HttpsError("invalid-argument", "uid를 올바르게 전달해 주세요.");
  }

  // 대상 계정 확인 (이미 없으면 성공으로 간주)
  const target = await admin.auth().getUser(uid).catch(() => null);
  if (!target) return { ok: true, alreadyGone: true };

  // 최고 관리자 계정은 삭제 불가
  if (target.email === INITIAL_ADMIN_EMAIL) {
    throw new HttpsError("permission-denied", "최고 관리자 계정은 삭제할 수 없습니다.");
  }
  // 선생님/관리자 계정 삭제는 최고 관리자만
  const targetRole = target.customClaims && target.customClaims.role;
  const targetIsStaff = targetRole === "teacher" || targetRole === "admin";
  if (targetIsStaff && !callerIsAdmin) {
    throw new HttpsError("permission-denied", "선생님 계정은 최고 관리자만 탈퇴 처리할 수 있습니다.");
  }
  // 담당 교사만 — 예전에는 교사이기만 하면 아무 반 학생이나 지울 수 있었습니다.
  if (!callerIsAdmin && !(await canDeleteStudent(request.auth.uid, uid))) {
    throw new HttpsError("permission-denied", "담당하는 반의 학생만 탈퇴 처리할 수 있습니다.");
  }

  await admin.auth().deleteUser(uid);
  return { ok: true, uid };
});

// 교사가 이 학생을 탈퇴 처리해도 되는가.
//  · 담당 교사(같은 반)면 언제나 가능
//  · 그 외 교사는 학생 본인이 탈퇴를 신청한 경우에만 가능
//    (당직 교사가 신청 건을 처리하는 기존 운영 방식을 유지하기 위함)
async function canDeleteStudent(callerUid, targetUid) {
  if (await callerOwnsStudent(callerUid, targetUid)) return true;
  const prof = await db.doc(`users/${targetUid}`).get().catch(() => null);
  return !!(prof && prof.exists && prof.data().withdrawRequested === true);
}

// =============================================================
// [2-c] 탈퇴 — 계정과 데이터를 한 번에 파기 (권장 경로)
// -------------------------------------------------------------
// 예전에는 앱이 Firestore를 지운 뒤 계정 삭제를 따로 호출하고, 그 실패를
// 조용히 넘겼습니다. 그러면 계정과 교사 클레임이 살아남아 다음 로그인에
// 프로필이 되살아납니다. 이제 서버에서 한 번에 처리합니다.
//
// 순서: 로그인 계정 먼저 → 데이터. 중간에 실패해도 최소한 다시 로그인해
// 되살아나는 일은 없고, 같은 요청을 다시 보내면 남은 것만 마저 지웁니다.
exports.deleteStudentAccount = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

  const callerRole = request.auth.token.role;
  const callerIsAdmin =
    callerRole === "admin" ||
    (request.auth.token.email === INITIAL_ADMIN_EMAIL &&
      request.auth.token.email_verified === true);
  if (!(callerRole === "teacher" || callerIsAdmin)) {
    throw new HttpsError("permission-denied", "탈퇴 처리 권한이 없습니다.");
  }

  const { uid } = request.data || {};
  if (typeof uid !== "string" || !uid) {
    throw new HttpsError("invalid-argument", "uid를 올바르게 전달해 주세요.");
  }
  if (uid === request.auth.uid) {
    throw new HttpsError("invalid-argument", "본인 계정은 이 경로로 처리할 수 없습니다.");
  }

  const target = await admin.auth().getUser(uid).catch(() => null);
  if (target && target.email === INITIAL_ADMIN_EMAIL) {
    throw new HttpsError("permission-denied", "최고 관리자 계정은 삭제할 수 없습니다.");
  }
  const targetRole = target && target.customClaims && target.customClaims.role;
  if ((targetRole === "teacher" || targetRole === "admin") && !callerIsAdmin) {
    throw new HttpsError("permission-denied", "선생님 계정은 최고 관리자만 탈퇴 처리할 수 있습니다.");
  }
  if (!callerIsAdmin && !(await canDeleteStudent(request.auth.uid, uid))) {
    throw new HttpsError("permission-denied", "담당하는 반의 학생만 탈퇴 처리할 수 있습니다.");
  }

  const warnings = [];
  if (target) {
    // 계정을 먼저 없애 되살아날 여지를 차단합니다(클레임도 함께 사라짐).
    await admin.auth().deleteUser(uid);
  }
  await purgeStudentData(uid, warnings);

  return { ok: warnings.length === 0, uid, warnings };
});

// Firebase Storage 다운로드 URL(https://firebasestorage.googleapis.com/...)에서
// 버킷 내부 경로를 뽑아냅니다. 클라이언트(deleteUploadedFile)는 SDK의 ref(storage,
// url)이 이 변환을 대신해 주지만, Admin SDK는 경로를 직접 받아야 합니다.
function storagePathFromUrl(url) {
  if (typeof url !== "string") return null;
  const m = url.match(/\/o\/([^?]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}
async function deleteAttachedFilesAdmin(cardData) {
  const urls = [
    cardData.imageUrl,
    ...(cardData.images || []),
    ...(cardData.attachments || []).map((a) => a && a.dataUrl),
  ].filter(Boolean);
  const bucket = admin.storage().bucket();
  await Promise.all(
    urls.map(async (url) => {
      const path = storagePathFromUrl(url);
      if (!path) return;
      await bucket.file(path).delete().catch(() => {
        /* 이미 삭제됨·권한 없음 등 — 무시 (best-effort) */
      });
    })
  );
}

// =============================================================
// [2-d] 반 삭제 — 보관된 반만, 완전히 삭제(되돌릴 수 없음)
// -------------------------------------------------------------
// 보안 규칙상 반이 보관(archived) 상태면 그 반의 자식 문서(보드·카드·
// 소속 등)는 소유 교사도 쓰기(삭제 포함)가 막힙니다 — "삭제는 보관을
// 거친 뒤에만" 이라는 요구와, "그 삭제 작업 자체가 자식 문서 삭제를
// 필요로 한다"는 사실이 클라이언트 순차 삭제로는 동시에 성립할 수
// 없어, Admin 권한으로 규칙을 우회해 서버에서 한 번에 처리합니다.
// =============================================================
exports.deleteClass = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const callerRole = request.auth.token.role;
  const callerIsAdmin =
    callerRole === "admin" ||
    (request.auth.token.email === INITIAL_ADMIN_EMAIL &&
      request.auth.token.email_verified === true);
  const callerIsTeacher = callerRole === "teacher" || callerIsAdmin;
  if (!callerIsTeacher) {
    throw new HttpsError("permission-denied", "반 삭제 권한이 없습니다.");
  }

  const { classId } = request.data || {};
  if (typeof classId !== "string" || !classId) {
    throw new HttpsError("invalid-argument", "classId를 올바르게 전달해 주세요.");
  }

  const classRef = db.doc(`classes/${classId}`);
  const classSnap = await classRef.get();
  if (!classSnap.exists) return { ok: true, alreadyGone: true };
  const cls = classSnap.data();

  if (!callerIsAdmin && cls.createdBy !== request.auth.uid) {
    throw new HttpsError("permission-denied", "본인이 개설한 반만 삭제할 수 있습니다.");
  }
  if (cls.archived !== true) {
    throw new HttpsError("failed-precondition", "먼저 반을 보관한 뒤에 삭제할 수 있습니다.");
  }

  // 반에 딸린 데이터는 purgeClass.js가 한곳에서 관리합니다.
  // 무엇을 지우는지·빠뜨린 게 없는지는 tests/rules/deleteClass.test.mjs가
  // 에뮬레이터에서 실제로 심어 보고 확인합니다.
  const warnings = await purgeClassData(db, classId, deleteAttachedFilesAdmin);

  return { ok: warnings.length === 0, classId, warnings };
});

