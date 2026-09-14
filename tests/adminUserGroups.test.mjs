import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/adminUserGroups.js", import.meta.url), "utf8");
const { groupUsersByClass } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("groups multi-class students once per class, including archived and unassigned", () => {
  const users = [{ uid: "a" }, { uid: "b" }, { uid: "c" }];
  const groups = groupUsersByClass(users, [{ id: "one", name: "1반" }, { id: "two", name: "2반", archived: true }], [
    { uid: "a", classId: "one" }, { uid: "a", classId: "one" },
    { uid: "a", classId: "two" }, { uid: "b", classId: "two" },
    { uid: "deleted", classId: "one" },
  ]);
  assert.deepEqual(groups.map((group) => group.users.map((entry) => entry.uid)), [["a"], ["a", "b"], ["c"]]);
  assert.equal(groups[1].archived, true);
  assert.equal(new Set(groups.flatMap((group) => group.users.map((entry) => entry.uid))).size, 3);
});

test("empty classes and filtered users retain correct group membership", () => {
  assert.deepEqual(groupUsersByClass([{ uid: "a" }], [], [])[0].users, [{ uid: "a" }]);
  const groups = groupUsersByClass([], [{ id: "one", name: "1반" }], [{ uid: "a", classId: "one" }]);
  assert.ok(groups.every((group) => group.users.length === 0));
});
