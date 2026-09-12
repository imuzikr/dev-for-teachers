import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("retired server route returns 410 without credentials or deletion dependencies", async () => {
  const source = await readFile(new URL("../../app/api/admin/classes/[classId]/deletion/route.js", import.meta.url), "utf8");
  const module = new vm.SourceTextModule(source, { context: vm.createContext({ Response }) });
  await module.link(() => { throw new Error("Retired route must not load deletion services"); });
  await module.evaluate();
  for (const method of ["GET", "POST"]) {
    const response = module.namespace[method]();
    assert.equal(response.status, 410);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).retryable, false);
  }
});
