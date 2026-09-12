import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const fixture = `"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ClassJoinPanel from "@/components/ClassJoinPanel";
import ClassManagerModal from "@/components/ClassManagerModal";
import { useAutomaticClassMembership, useVisibleClassMemberships } from "@/lib/useAutomaticClassMembership";
import { getSelectedClassId, setSelectedClassId } from "@/lib/classroom";

const activeClass = { id: "qa-active", name: "QA class", archived: false, accessVersion: 2, joinEnabled: true };
function Workspace() {
  const [draft, setDraft] = useState("");
  return <div data-testid="selected-data">Private class activity
    <textarea aria-label="Activity draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
  </div>;
}
export default function ClassAccessFixture() {
  const [classes, setClasses] = useState([activeClass]);
  const callbacks = useRef(new Map());
  const starts = useRef(new Map());
  const staleCallbacks = useRef([]);
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const subscribe = useCallback((uid, callback, ids) => {
    if (ids.length !== 1) throw new Error("Expected one retained listener per class");
    const id = ids[0];
    callbacks.current.set(id, callback);
    starts.current.set(id, (starts.current.get(id) ?? 0) + 1);
    setSubscriptionVersion((value) => value + 1);
    callback([]);
    return () => {
      callbacks.current.delete(id);
      staleCallbacks.current.push(callback);
    };
  }, []);
  const [role, setRole] = useState("student");
  const [uid, setUid] = useState("qa-user");
  const [attempts, setAttempts] = useState(0);
  const [selected, setSelected] = useState(null);
  const [manager, setManager] = useState(false);
  const user = { uid, role };
  const activeClassIds = useMemo(() => classes.map((item) => item.id), [classes]);
  const { memberships, ready, resolvedClassIds } = useVisibleClassMemberships({
    user, isOperator: role === "admin", activeClassIds, subscribe,
  });
  useEffect(() => {
    const sync = () => setSelected(getSelectedClassId());
    sync();
    window.addEventListener("class-change", sync);
    return () => window.removeEventListener("class-change", sync);
  }, []);
  useAutomaticClassMembership({ user, isOperator: role === "admin", classes, memberships, ready, resolvedClassIds });
  const visibleClass = classes.find((item) => item.archived === false && item.accessVersion === 2
    && memberships.some((membership) => membership.classId === item.id));
  const selectedData = visibleClass?.id === selected;
  return <>
    <div aria-label="QA controls">
      <output data-testid="attempts">{attempts}</output>
      <output data-testid="selected">{selected ?? "none"}</output>
      <output data-testid="active-starts" data-version={subscriptionVersion}>{starts.current.get(activeClass.id) ?? 0}</output>
      <button onClick={() => setClasses([])}>Archive</button>
      <button onClick={() => setClasses([activeClass])}>Restore class</button>
      <button onClick={() => callbacks.current.get(activeClass.id)?.([{ classId: activeClass.id }])}>Confirm membership</button>
      <button onClick={() => setClasses([activeClass, { ...activeClass, id: "qa-other" }])}>Add unrelated class</button>
      <button onClick={() => callbacks.current.get("qa-other")?.([])}>Resolve unrelated class</button>
      <button onClick={() => setClasses([activeClass])}>Archive unrelated class</button>
      <button onClick={() => callbacks.current.get(activeClass.id)?.([])}>Delete membership</button>
      <button onClick={() => staleCallbacks.current.forEach((callback) => callback([{ classId: activeClass.id }]))}>Replay stale callbacks</button>
      <button onClick={() => setUid("qa-other-user")}>Switch user</button>
      <button onClick={() => { setRole("admin"); setSelectedClassId(activeClass.id); }}>Admin role</button>
      <button onClick={() => setRole("student")}>Student role without membership</button>
      <button onClick={() => setManager(true)}>Manager</button>
    </div>
    {selectedData ? <Workspace key={uid + ":" + role + ":" + selected} /> :
      <ClassJoinPanel joining={false} onJoin={async (code) => {
        setAttempts((value) => value + 1);
        if (code !== "654321") return false;
        callbacks.current.get(activeClass.id)?.([{ classId: activeClass.id }]);
        setSelectedClassId(activeClass.id);
        return true;
      }} />}
    {manager && <ClassManagerModal user={user} classes={[
      { ...activeClass, joinCode: "654321" },
      { id: "qa-archived", name: "Archived class", archived: true }
    ]} onClose={() => setManager(false)} />}
  </>;
}
`;

export default async function verifyClassAccessUi(page, baseUrl, outputDir) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => sessionStorage.removeItem("study_class_id"));
  for (const [name, width, height] of [["desktop", 1280, 900], ["mobile", 375, 812]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${baseUrl}/qa-class-access`);
    await page.getByRole("heading", { name: "우리 반 참여 코드로 들어가세요" }).waitFor();
    await page.getByLabel("참여 코드", { exact: true }).fill("123");
    await page.getByRole("button", { name: "참여하기", exact: true }).click();
    await page.getByText("6자리 숫자 코드를 입력해 주세요.", { exact: true }).waitFor();
    assert.equal(await page.getByTestId("attempts").textContent(), "0");
    assert.equal(await page.getByTestId("selected").textContent(), "none");
    assert.equal(await page.getByText("자동 연결", { exact: false }).count(), 0);
    const geometry = await page.locator(".class-join-code-row").evaluate((row) => {
      const input = row.querySelector("input").getBoundingClientRect();
      const button = row.querySelector("button").getBoundingClientRect();
      const panel = document.querySelector(".class-join-card").getBoundingClientRect();
      return { inViewport: panel.left >= 0 && panel.right <= innerWidth,
        separate: input.right <= button.left || input.bottom <= button.top,
        inputFits: input.width > 0, buttonFits: button.width >= 44 && button.height >= 44 };
    });
    assert.deepEqual(geometry, { inViewport: true, separate: true, inputFits: true, buttonFits: true });
    const headingWordLines = await page.locator("#class-join-title").evaluate((heading) => {
      const text = heading.firstChild;
      const start = text.textContent.lastIndexOf("들어가세요");
      const tops = Array.from("들어가세요", (_, offset) => {
        const range = document.createRange();
        range.setStart(text, start + offset);
        range.setEnd(text, start + offset + 1);
        return Math.round(range.getBoundingClientRect().top);
      });
      return new Set(tops).size;
    });
    assert.equal(headingWordLines, 1, "The final Korean word must remain on one line");
    await page.locator(".class-join-main").screenshot({ path: path.join(outputDir, `join-${name}.png`) });
    await page.getByLabel("참여 코드", { exact: true }).fill("654321");
    await page.getByRole("button", { name: "참여하기", exact: true }).click();
    await page.getByTestId("selected-data").waitFor();
    assert.equal(await page.getByTestId("attempts").textContent(), "1");
    await page.getByLabel("Activity draft").fill("Unsaved draft must survive unrelated classes");
    const activeStarts = await page.getByTestId("active-starts").textContent();
    await page.evaluate(() => { window.qaWorkspace = document.querySelector('[data-testid="selected-data"]'); });
    for (const action of ["Add unrelated class", "Resolve unrelated class", "Archive unrelated class"]) {
      await page.getByRole("button", { name: action, exact: true }).click();
      assert.equal(await page.getByLabel("Activity draft").inputValue(), "Unsaved draft must survive unrelated classes");
      assert.equal(await page.getByTestId("active-starts").textContent(), activeStarts);
      assert(await page.evaluate(() => window.qaWorkspace === document.querySelector('[data-testid="selected-data"]')));
    }
    await page.getByRole("button", { name: "Delete membership", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="selected"]').textContent === "none");
    assert.equal(await page.getByTestId("selected-data").count(), 0);
    await page.getByRole("button", { name: "Confirm membership", exact: true }).click();
    await page.getByTestId("selected-data").waitFor();
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="selected"]').textContent === "none");
    assert.equal(await page.getByTestId("selected-data").count(), 0);
    await page.getByRole("button", { name: "Replay stale callbacks", exact: true }).click();
    assert.equal(await page.getByTestId("selected-data").count(), 0);
    await page.getByRole("button", { name: "Restore class", exact: true }).click();
    await page.getByRole("button", { name: "Confirm membership", exact: true }).click();
    await page.getByTestId("selected-data").waitFor();
    await page.getByRole("button", { name: "Admin role", exact: true }).click();
    await page.getByRole("button", { name: "Student role without membership", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="selected"]').textContent === "none");
    assert.equal(await page.getByTestId("selected-data").count(), 0);
    await page.getByRole("button", { name: "Replay stale callbacks", exact: true }).click();
    assert.equal(await page.getByTestId("selected-data").count(), 0);
    await page.getByRole("button", { name: "Confirm membership", exact: true }).click();
    await page.getByTestId("selected-data").waitFor();
    await page.getByRole("button", { name: "Switch user", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="selected"]').textContent === "none");
    await page.getByRole("button", { name: "Replay stale callbacks", exact: true }).click();
    assert.equal(await page.getByTestId("selected-data").count(), 0);
    await page.getByRole("button", { name: "Manager", exact: true }).click();
    assert.equal(await page.locator(".class-mgr-join-controls").count(), 0);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Admin role", exact: true }).click();
  await page.locator(".class-mgr-join-controls").waitFor();
  await page.getByRole("button", { name: "복원", exact: true }).waitFor();
  await page.getByRole("button", { name: "보기", exact: true }).waitFor();
  await page.locator(".modal-class-manager").screenshot({ path: path.join(outputDir, "admin-manager.png") });
  assert.deepEqual(errors, []);
  return { passed: true, viewports: [1280, 375], cases: ["single-class explicit join", "invalid code", "unrelated class additions and archive retain listener and draft", "resolved deletion removes membership", "archive clears selection and data", "role and UID switches clear selection and data", "stale callbacks ignored", "admin-only manager", "archive view and restore"], screenshots: ["join-desktop.png", "join-mobile.png", "admin-manager.png"] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const route = path.join(root, "app", "qa-class-access");
  const outputDir = path.resolve(process.env.CLASS_ACCESS_UI_OUTPUT ?? path.join(root, "artifacts", "class-access-ui"));
  const port = Number(process.env.CLASS_ACCESS_UI_PORT ?? 3147);
  const baseUrl = `http://127.0.0.1:${port}`;
  const require = createRequire(import.meta.url);
  const { chromium } = process.env.CLASS_ACCESS_PLAYWRIGHT
    ? require(process.env.CLASS_ACCESS_PLAYWRIGHT) : require("playwright");
  await mkdir(route);
  let server;
  let browser;
  let logs = "";
  try {
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(route, "page.jsx"), fixture);
    server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--port", String(port), "--hostname", "127.0.0.1"], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout.on("data", (data) => { logs += data; });
    server.stderr.on("data", (data) => { logs += data; });
    const deadline = Date.now() + 120000;
    while (!logs.includes("Ready in")) {
      if (server.exitCode !== null || Date.now() > deadline) throw new Error(`Dev server failed: ${logs}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage();
    const result = await verifyClassAccessUi(page, baseUrl, outputDir);
    await writeFile(path.join(outputDir, "results.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally {
    await browser?.close();
    if (server && server.exitCode === null) {
      if (process.platform === "win32") {
        await new Promise((resolve) => spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).on("close", resolve));
      } else server.kill("SIGTERM");
    }
    const source = await readFile(path.join(route, "page.jsx"), "utf8").catch(() => null);
    if (source === fixture) {
      await rm(path.join(route, "page.jsx"));
      await rmdir(route);
    }
    await writeFile(path.join(outputDir, "dev-server.log"), logs);
    console.log("QA dev server stopped; temporary route removed.");
  }
}
