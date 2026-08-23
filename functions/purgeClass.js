// =============================================================
// 반에 딸린 데이터 일괄 파기
// -------------------------------------------------------------
// Firestore는 부모 문서를 지워도 하위 컬렉션이 함께 사라지지 않습니다.
// 그래서 반 문서만 지우면 출석부·자리표·기본 모둠·손들기가 그대로 남고,
// 그 안에는 실명·학번이 들어 있습니다(개인정보 파기 누락).
//
// db를 주입받는 별도 모듈로 둔 이유는, 에뮬레이터에서 "정말 하나도 남지
// 않는지"를 테스트로 확인하기 위해서입니다. 컬렉션이 새로 늘어날 때
// 여기에 추가하는 것을 잊으면 그 테스트가 잡아 줍니다.
// =============================================================

// 반 문서 아래에 달리는 하위 컬렉션들. recursiveDelete가 알아서 훑지만,
// 무엇이 지워지는지 눈에 보이게 남겨 둡니다(테스트도 이 목록을 씁니다).
const CLASS_SUBCOLLECTIONS = [
  "attendanceRecords", // 출석부 — 실명·학번 포함
  "seatLayouts",       // 자리표(기본 + 날짜별 임시)
  "groupAssignments",  // 반 기본 모둠 — 실명·학번 포함
  "questionSignals",   // 손들기 — 실명·학번 포함
];

// classId 필드로 묶여 있는 최상위 컬렉션들.
// lessons는 반이 아니라 교사(ownerId)에 귀속되므로 여기 없습니다 —
// 반을 지워도 선생님의 수업 자료는 남아야 합니다.
const CLASS_SCOPED_COLLECTIONS = [
  { name: "rewards", label: "과일 보상" },
  { name: "studentNotes", label: "누가기록" },
  { name: "kwl", label: "KWL 기록" },
  { name: "presence", label: "참여 상태" },
  { name: "joinCodes", label: "입장 코드" },
  { name: "memberships", label: "반 소속" },
];

// 쿼리로 찾은 문서를 400개씩 나눠 지웁니다(배치 상한 회피).
async function deleteByQuery(db, query, warnings, label) {
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

// 쿼리로 찾은 문서들을 하위 컬렉션까지 통째로 지웁니다.
async function deleteMatchingDocsDeep(db, query, warnings, label) {
  try {
    const snap = await query.get();
    for (const d of snap.docs) {
      await db.recursiveDelete(d.ref);
    }
    return snap.size;
  } catch (e) {
    warnings.push(`${label}: ${e && e.message}`);
    return 0;
  }
}

/**
 * 반 하나에 딸린 모든 데이터를 지웁니다. 여러 번 실행해도 안전(멱등)합니다.
 *
 * @param db Firestore 인스턴스(admin SDK)
 * @param classId 지울 반
 * @param onCardAttachments 공부방 카드의 첨부 파일을 지우는 콜백(선택).
 *        Storage를 쓰지 않는 테스트에서는 넘기지 않습니다.
 * @returns warnings — 실패한 항목 목록. 비어 있어야 완전히 지워진 것입니다.
 */
async function purgeClassData(db, classId, onCardAttachments) {
  const warnings = [];

  // 1) 공부방 보드 — 카드 첨부 파일(Storage)을 먼저 지우고 보드를 통째로.
  //    recursiveDelete가 cards 하위 컬렉션까지 함께 정리합니다.
  try {
    const boardsSnap = await db.collection("studyBoards").where("classId", "==", classId).get();
    for (const boardDoc of boardsSnap.docs) {
      if (onCardAttachments) {
        const cardsSnap = await boardDoc.ref.collection("cards").get();
        for (const cardDoc of cardsSnap.docs) {
          await onCardAttachments(cardDoc.data());
        }
      }
      await db.recursiveDelete(boardDoc.ref);
    }
  } catch (e) {
    warnings.push(`공부방 보드: ${e && e.message}`);
  }

  // 2) 책방 활동 — groups/{gId}/words 와 entries 하위 컬렉션까지.
  //    entries에는 학생 실명과 제출물이 들어 있습니다.
  await deleteMatchingDocsDeep(
    db,
    db.collection("bookActivities").where("classId", "==", classId),
    warnings,
    "책방 활동"
  );

  // 3) classId 필드로 묶인 최상위 기록들
  for (const { name, label } of CLASS_SCOPED_COLLECTIONS) {
    await deleteByQuery(db, db.collection(name).where("classId", "==", classId), warnings, label);
  }

  // 4) 방송 문서 — 문서 ID가 곧 classId
  try {
    await db.doc(`broadcasts/${classId}`).delete();
  } catch (e) {
    warnings.push(`방송 상태: ${e && e.message}`);
  }

  // 5) 반 문서 — 하위 컬렉션(출석부·자리표·기본 모둠·손들기)까지 통째로.
  //    맨 마지막에 지웁니다. 중간에 실패하면 반 문서가 남아 있어야 교사가
  //    다시 삭제를 눌러 이어서 정리할 수 있습니다.
  try {
    await db.recursiveDelete(db.doc(`classes/${classId}`));
  } catch (e) {
    warnings.push(`반 문서: ${e && e.message}`);
  }

  return warnings;
}

module.exports = {
  purgeClassData,
  CLASS_SUBCOLLECTIONS,
  CLASS_SCOPED_COLLECTIONS,
};
