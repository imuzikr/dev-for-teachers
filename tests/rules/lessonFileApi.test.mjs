import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import * as firestore from "firebase/firestore";
import * as storage from "firebase/storage";

async function loadApi() {
  const context = createContext({ crypto, URL, console });
  const dependencies = {
    "firebase/firestore": firestore,
    "firebase/storage": storage,
    "./firebase": { db: null, storage: null, isFirebaseConfigured: false },
  };
  const policy = new SourceTextModule(readFileSync("lib/lessonFilePolicy.js", "utf8"), { context });
  await policy.link(() => { throw new Error("Unexpected policy dependency"); });
  await policy.evaluate();
  const module = new SourceTextModule(readFileSync("lib/lessonFiles.js", "utf8"), { context });
  await module.link(specifier => {
    if (specifier === "./lessonFilePolicy") return policy;
    const dependency = dependencies[specifier];
    if (!dependency) throw new Error(`Unexpected dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(dependency), function () {
      for (const [key, value] of Object.entries(dependency)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}

test("mock file API publishes references, isolates lists, and preserves originals on unlink", async () => {
  const api = await loadApi();
  const user = { uid: "teacher" };
  let library = [];
  let classA = [];
  let classB = [];
  const stops = [
    api.subscribeLessonFiles(user.uid, rows => { library = rows; }),
    api.subscribeClassLessonFiles("a", rows => { classA = rows; }),
    api.subscribeClassLessonFiles("b", rows => { classB = rows; }),
  ];
  try {
    await api.addLessonFile(user, new File(["original"], "lesson.txt"));
    const file = library[0];
    assert.equal(Object.keys(file.sharedClasses).length, 0);
    await api.setLessonFileDistribution(user, { classId: "a", className: "Class A", file, published: true });
    assert.equal(classA.length, 1);
    assert.equal(classB.length, 0);
    assert.equal(classA[0].id, file.id);
    assert.equal(classA[0].storagePath, file.storagePath);
    assert.equal("blob" in classA[0], false);
    assert.equal(library[0].sharedClasses.a, "Class A");
    assert.equal(await (await fetch(await api.lessonFileUrl(classA[0]))).text(), "original");
    await api.setLessonFileDistribution(user, { classId: "a", className: "Class A", file, published: true });
    assert.equal(classA.length, 1);
    await assert.rejects(api.deleteLessonFile(user, file), /배포/);
    await assert.rejects(api.setLessonFileDistribution({ uid: "other" }, { classId: "a", file, published: false }), /본인/);
    await api.setLessonFileDistribution(user, { classId: "b", className: "Class B", file, published: true });
    await api.setLessonFileDistribution(user, { classId: "a", file, published: false });
    assert.equal(classA.length, 0);
    assert.equal(library.length, 1);
    await assert.rejects(api.deleteLessonFile(user, file), /배포/);
    await api.setLessonFileDistribution(user, { classId: "b", file, published: false });
    const originalUrl = await api.lessonFileUrl(file);
    assert.equal(await (await fetch(originalUrl)).text(), "original");
    URL.revokeObjectURL(originalUrl);
    await api.deleteLessonFile(user, file);
    assert.equal(library.length, 0);
  } finally { stops.forEach(stop => stop()); }
});
