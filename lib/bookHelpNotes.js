import { db, isFirebaseConfigured } from "./firebase";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, runTransaction, serverTimestamp, updateDoc, where, writeBatch } from "firebase/firestore";

const mockHelpNotes = [];
const mockHelpListeners = new Set();
let mockHelpSeq = 1;
const MAX_HELP_SECTIONS = 20;
const LEGACY_HELP_SECTION_ID = "legacy-content";
const LEGACY_HELP_SECTION_TITLE = "기존 내용";

function assertStringLimit(value, field, max, { required = false } = {}) {
  if (typeof value !== "string" && value != null) {
    throw new Error(`${field}은(는) 문자열이어야 해요.`);
  }
  const normalized = (value ?? "").trim();
  if (required && normalized.length === 0) {
    throw new Error(`${field}을(를) 입력해 주세요.`);
  }
  if (normalized.length > max) {
    throw new Error(`${field}은(는) ${max}자 이하로 입력해 주세요.`);
  }
  return normalized;
}

export function sanitizeHelpSection(section) {
  return { id: assertStringLimit(section?.id, "section.id", 100, { required: true }), title: assertStringLimit(section?.title, "section.title", 120, { required: true }), content: assertStringLimit(section?.content, "section.content", 5000), url: assertStringLimit(section?.url, "section.url", 1000) };
}

function sanitizeHelpSections(sections, { enforceMax = true } = {}) {
  if (sections == null) return [];
  if (!Array.isArray(sections)) throw new Error("도움 글 섹션 형식이 올바르지 않아요.");
  if (enforceMax && sections.length > MAX_HELP_SECTIONS) throw new Error("도움 글 섹션은 최대 20개까지 만들 수 있어요.");

  const seenIds = new Set();
  return sections.map((section) => {
    const normalized = sanitizeHelpSection(section);
    if (seenIds.has(normalized.id)) throw new Error("같은 섹션 ID를 중복해서 사용할 수 없어요.");
    seenIds.add(normalized.id);
    return normalized;
  });
}

function normalizeHelpSectionsForRead(sections) {
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((section) => {
    try {
      return [sanitizeHelpSection(section)];
    } catch {
      return [];
    }
  });
}

function hasLegacyHelpContent(data) {
  return typeof data?.content === "string" && data.content.trim().length > 0;
}

function legacyHelpSectionId(sections) {
  const ids = new Set(sections.map((section) => section.id));
  if (!ids.has(LEGACY_HELP_SECTION_ID)) return LEGACY_HELP_SECTION_ID;
  for (let index = 1; ; index += 1) {
    const candidate = `${LEGACY_HELP_SECTION_ID}-${index}`;
    if (candidate.length > 100) throw new Error("기존 도움 글 섹션 ID를 만들지 못했어요.");
    if (!ids.has(candidate)) return candidate;
  }
}

function virtualLegacyHelpSection(data, sections) {
  if (!hasLegacyHelpContent(data)) return [];
  return [{ id: legacyHelpSectionId(sections), title: LEGACY_HELP_SECTION_TITLE, content: data.content, url: "" }];
}

function sectionsWithLegacyForRead(data) {
  const sections = normalizeHelpSectionsForRead(data?.sections);
  return [...virtualLegacyHelpSection(data, sections), ...sections];
}

function sectionsWithLegacyForWrite(data) {
  const sections = sanitizeHelpSections(data?.sections, { enforceMax: false });
  return [...virtualLegacyHelpSection(data, sections), ...sections];
}

function assertHelpSectionCapacity(sections) {
  if (sections.length > MAX_HELP_SECTIONS) throw new Error("도움 글 섹션은 최대 20개까지 만들 수 있어요.");
}

function normalizeHelpNote(id, data) {
  return { id, classId: data?.classId ?? "", title: data?.title ?? "", content: "", url: data?.url ?? "", order: typeof data?.order === "number" ? data.order : null, createdBy: data?.createdBy ?? "", createdAt: data?.createdAt ?? null, updatedAt: data?.updatedAt ?? null, sections: sectionsWithLegacyForRead(data) };
}

function noteSortValue(note) {
  if (typeof note.order === "number" && Number.isFinite(note.order)) return note.order;
  return note.createdAt?.toMillis?.() ?? note.createdAt?.getTime?.() ?? 0;
}

function sortHelpNotes(notes) {
  return [...notes].sort((a, b) => {
    const byOrder = noteSortValue(a) - noteSortValue(b);
    if (byOrder !== 0) return byOrder;
    const left = a.createdAt?.toMillis?.() ?? a.createdAt?.getTime?.() ?? 0;
    const right = b.createdAt?.toMillis?.() ?? b.createdAt?.getTime?.() ?? 0;
    return left - right;
  });
}

function emitMockHelpNotes(classId, callback) {
  callback(sortHelpNotes(mockHelpNotes.filter((note) => note.classId === classId).map((note) => normalizeHelpNote(note.id, note))));
}

function sanitizeHelpDraft(draft, { defaultContent = false } = {}) {
  const data = { title: (draft?.title ?? "").trim(), url: (draft?.url ?? "").trim() };
  if (draft && Object.hasOwn(draft, "content")) {
    data.content = (draft.content ?? "").trim();
  } else if (defaultContent) {
    data.content = "";
  }
  if (draft && Object.hasOwn(draft, "sections")) {
    data.sections = sanitizeHelpSections(draft.sections);
  }
  return data;
}

function findMockHelpNote(noteId) {
  const target = mockHelpNotes.find((note) => note.id === noteId);
  if (!target) throw new Error("도움 글을 찾지 못했어요.");
  return target;
}

function upsertHelpSection(sections, section, create) {
  const normalized = sanitizeHelpSection(section);
  const existingIndex = sections.findIndex((item) => item.id === normalized.id);
  if (create) {
    if (existingIndex >= 0) throw new Error("이미 같은 ID의 도움 글 섹션이 있어요.");
    const nextSections = [...sections, normalized];
    assertHelpSectionCapacity(nextSections);
    return nextSections;
  }
  if (existingIndex < 0) throw new Error("수정할 도움 글 섹션을 찾지 못했어요.");
  const nextSections = sections.map((item, index) => (index === existingIndex ? normalized : item));
  assertHelpSectionCapacity(nextSections);
  return nextSections;
}

function removeHelpSection(sections, sectionId) {
  const normalizedId = assertStringLimit(sectionId, "sectionId", 100, { required: true });
  const nextSections = sections.filter((section) => section.id !== normalizedId);
  if (nextSections.length === sections.length) throw new Error("삭제할 도움 글 섹션을 찾지 못했어요.");
  assertHelpSectionCapacity(nextSections);
  return nextSections;
}

export function subscribeBookHelpNotes(classId, callback) {
  if (!classId) {
    callback([]);
    return () => {};
  }

  if (isFirebaseConfigured) {
    const helpQuery = query(collection(db, "bookHelpNotes"), where("classId", "==", classId));
    return onSnapshot(
      helpQuery,
      (snapshot) => {
        callback(sortHelpNotes(snapshot.docs.map((item) => normalizeHelpNote(item.id, item.data()))));
      },
      (error) => {
        console.warn("[책방] 도움 글을 읽지 못했어요:", error?.code, error?.message);
        callback([]);
      }
    );
  }

  const listener = () => emitMockHelpNotes(classId, callback);
  mockHelpListeners.add(listener);
  listener();
  return () => mockHelpListeners.delete(listener);
}

export async function addBookHelpNote(user, classId, draft) {
  const data = sanitizeHelpDraft(draft, { defaultContent: true });
  if (isFirebaseConfigured) {
    const noteRef = await addDoc(collection(db, "bookHelpNotes"), {
      classId, ...data, createdBy: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    return noteRef.id;
  }

  const id = `help${++mockHelpSeq}_m`;
  mockHelpNotes.push({
    id, classId, ...data, order: Date.now(), createdBy: user.uid, createdAt: new Date(), updatedAt: new Date(),
  });
  mockHelpListeners.forEach((listener) => listener());
  return id;
}

export async function updateBookHelpNote(noteId, draft) {
  const data = sanitizeHelpDraft(draft);
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "bookHelpNotes", noteId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const target = mockHelpNotes.find((note) => note.id === noteId);
  if (target) Object.assign(target, data, { updatedAt: new Date() });
  mockHelpListeners.forEach((listener) => listener());
}

export async function saveBookHelpSection(noteId, section, { create = false } = {}) {
  if (isFirebaseConfigured) {
    const noteRef = doc(db, "bookHelpNotes", noteId);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(noteRef);
      if (!snapshot.exists()) throw new Error("도움 글을 찾지 못했어요.");
      const data = snapshot.data();
      const sections = sectionsWithLegacyForWrite(data);
      transaction.update(noteRef, {
        sections: upsertHelpSection(sections, section, create),
        content: "",
        updatedAt: serverTimestamp(),
      });
    });
    return;
  }

  const target = findMockHelpNote(noteId);
  target.sections = upsertHelpSection(sectionsWithLegacyForWrite(target), section, create);
  target.content = "";
  target.updatedAt = new Date();
  mockHelpListeners.forEach((listener) => listener());
}

export async function deleteBookHelpSection(noteId, sectionId) {
  if (isFirebaseConfigured) {
    const noteRef = doc(db, "bookHelpNotes", noteId);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(noteRef);
      if (!snapshot.exists()) throw new Error("도움 글을 찾지 못했어요.");
      const data = snapshot.data();
      transaction.update(noteRef, {
        sections: removeHelpSection(sectionsWithLegacyForWrite(data), sectionId),
        content: "",
        updatedAt: serverTimestamp(),
      });
    });
    return;
  }

  const target = findMockHelpNote(noteId);
  target.sections = removeHelpSection(sectionsWithLegacyForWrite(target), sectionId);
  target.content = "";
  target.updatedAt = new Date();
  mockHelpListeners.forEach((listener) => listener());
}

export async function deleteBookHelpNote(noteId) {
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "bookHelpNotes", noteId));
    return;
  }

  const index = mockHelpNotes.findIndex((note) => note.id === noteId);
  if (index >= 0) mockHelpNotes.splice(index, 1);
  mockHelpListeners.forEach((listener) => listener());
}

export async function reorderBookHelpNotes(classId, orderedNotes) {
  if (!classId) return;

  const scopedNotes = orderedNotes.filter((note) => note.classId === classId);
  if (scopedNotes.length !== orderedNotes.length) {
    throw new Error("Cannot reorder help notes across classes.");
  }

  const noteIds = new Set(scopedNotes.map((note) => note.id));
  if (noteIds.size !== scopedNotes.length) {
    throw new Error("Cannot reorder help notes with duplicate ids.");
  }

  if (isFirebaseConfigured) {
    const batch = writeBatch(db);
    scopedNotes.forEach((note, index) => {
      batch.update(doc(db, "bookHelpNotes", note.id), {
        order: index,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
    return;
  }

  scopedNotes.forEach((note, index) => {
    const target = mockHelpNotes.find((item) => item.id === note.id && item.classId === classId);
    if (target) Object.assign(target, { order: index, updatedAt: new Date() });
  });
  mockHelpListeners.forEach((listener) => listener());
}
