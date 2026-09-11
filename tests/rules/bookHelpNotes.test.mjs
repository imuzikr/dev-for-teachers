import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { makeEnv, asTeacher, asStudent, seed } from "./helpers.mjs";

describe("Help note ordering", () => {
  let env;
  before(async () => { env = await makeEnv("demo-rules-help-order"); });
  after(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async db => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false });
      for (const id of ["one", "two"]) {
        await setDoc(doc(db, "bookHelpNotes", id), {
          classId: "cA", title: id, content: "", url: "", createdBy: "teacherA",
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      }
    });
  });
  it("allows the owner to reorder legacy notes atomically", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    const batch = writeBatch(db);
    batch.update(doc(db, "bookHelpNotes", "one"), { order: 1, updatedAt: serverTimestamp() });
    batch.update(doc(db, "bookHelpNotes", "two"), { order: 0, updatedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
  });
  it("denies student and other teacher reordering", async () => {
    for (const context of [asStudent(env, "studentA"), asTeacher(env, "teacherB")]) {
      await assertFails(updateDoc(doc(context.firestore(), "bookHelpNotes", "one"), { order: 0, updatedAt: serverTimestamp() }));
    }
  });
  it("rejects invalid order values and class reassignment", async () => {
    const ref = doc(asTeacher(env, "teacherA").firestore(), "bookHelpNotes", "one");
    for (const order of [-1, 0.5, "0"]) {
      await assertFails(updateDoc(ref, { order, updatedAt: serverTimestamp() }));
    }
    await assertFails(updateDoc(ref, { order: 0, classId: "other", updatedAt: serverTimestamp() }));
  });
  it("allows optional bounded sections on create and update while legacy notes stay valid", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(setDoc(doc(db, "bookHelpNotes", "withSections"), {
      classId: "cA",
      title: "With sections",
      content: "root",
      url: "",
      sections: [
        { id: "intro", title: "Intro", content: "section content", url: "https://example.test/intro" },
      ],
      createdBy: "teacherA",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(doc(db, "bookHelpNotes", "one"), {
      sections: [
        { id: "added", title: "Added", content: "", url: "" },
      ],
      updatedAt: serverTimestamp(),
    }));
  });
  it("rejects section arrays beyond limits or malformed fields", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    const base = {
      classId: "cA",
      title: "Bad sections",
      content: "",
      url: "",
      createdBy: "teacherA",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await assertFails(setDoc(doc(db, "bookHelpNotes", "tooMany"), {
      ...base,
      sections: Array.from({ length: 21 }, (_, index) => ({
        id: `section-${index}`,
        title: "Title",
        content: "",
        url: "",
      })),
    }));
    await assertFails(updateDoc(doc(db, "bookHelpNotes", "one"), {
      sections: [{ id: "empty-title", title: "", content: "", url: "" }],
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(db, "bookHelpNotes", "one"), {
      sections: [{ id: "long-url", title: "Title", content: "", url: "x".repeat(1001) }],
      updatedAt: serverTimestamp(),
    }));
  });
});
