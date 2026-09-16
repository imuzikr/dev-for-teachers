import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = process.cwd();
const visualSupplement = process.argv.includes("--visual-supplement");
const output = path.join(root, "artifacts", `card-delete-${visualSupplement ? "visual-" : ""}${Date.now()}`);
const fixture = path.join(output, "fixture");
const report = { cases: [], captures: [], externalRequests: [], errors: [] };
const resourceTitle = "학습지원 소프트웨어 심의 관련 자료";
const activityTitle = "Antigravity 설치하기";
let server, browser, page, logs = "";

const cards = () => page.locator(".book-personal-activity-card:visible");
const card = title => cards().filter({ hasText: title }).first();
const dialog = () => page.getByRole("alertdialog");
const state = () => page.evaluate(() => window.__cardDelete.state());
const stored = () => page.evaluate(() => window.__cardDelete.stored());
const configure = patch => page.evaluate(value => window.__cardDelete.configure(value), patch);
const record = (name, details = {}) => report.cases.push({ name, ...details });

async function captureMetrics() {
  return page.evaluate(() => {
    const visible = selector => [...document.querySelectorAll(selector)].filter(node => node.getClientRects().length);
    const rect = node => {
      const bounds = node.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, right: bounds.right, bottom: bounds.bottom };
    };
    return {
      viewport: innerWidth, viewportHeight: innerHeight, documentWidth: document.documentElement.scrollWidth,
      media: { coarse: matchMedia("(pointer: coarse)").matches, fine: matchMedia("(pointer: fine)").matches,
        noHover: matchMedia("(hover: none)").matches, touchPoints: navigator.maxTouchPoints },
      cards: visible(".book-personal-activity-card").map(node => ({ ...rect(node), header: rect(node.querySelector("header")),
        actions: [...node.querySelectorAll(".book-personal-card-head-actions > *")].map(action => ({ ...rect(action), label: action.getAttribute("aria-label") })) })),
      dialog: visible('[role="alertdialog"]').map(node => ({ ...rect(node), scrollWidth: node.scrollWidth, clientWidth: node.clientWidth })),
    };
  });
}

async function capture(name) {
  await page.evaluate(() => document.fonts.ready);
  let metrics = await captureMetrics();
  let settledFrames = 0;
  for (let attempt = 0; attempt < 50 && settledFrames < 3; attempt++) {
    await page.waitForTimeout(100);
    const next = await captureMetrics();
    settledFrames = JSON.stringify(next) === JSON.stringify(metrics) ? settledFrames + 1 : 0;
    metrics = next;
  }
  assert.equal(settledFrames, 3, `${name}: layout settles before capture`);
  assert(metrics.documentWidth <= metrics.viewport, `${name}: document fits viewport`);
  for (const item of metrics.cards) for (const action of item.actions) {
    assert(action.x >= item.x - 1 && action.right <= item.right + 1, `${name}: card action ${action.label} fits card`);
  }
  for (const modal of metrics.dialog) {
    assert(modal.x >= 0 && modal.right <= metrics.viewport, `${name}: dialog fits viewport`);
    assert(modal.scrollWidth <= modal.clientWidth + 1, `${name}: dialog content wraps`);
  }
  const fullPage = !metrics.media.coarse;
  const screenshot = await page.screenshot({ path: path.join(output, `${name}.png`), fullPage });
  const afterScreenshot = await captureMetrics();
  assert.deepEqual(afterScreenshot, metrics, `${name}: screenshot preserves media and rendered geometry`);
  const imageSize = { width: screenshot.readUInt32BE(16), height: screenshot.readUInt32BE(20) };
  if (!fullPage) assert.deepEqual(imageSize, { width: metrics.viewport, height: metrics.viewportHeight });
  report.captures.push({ name, metrics, afterScreenshot, fullPage, imageSize });
}

async function newPage(origin, role = "teacher", width = 1280) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 1280, serviceWorkers: "block" });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ["data:", "blob:"].includes(url.protocol)) return route.continue();
    report.externalRequests.push(url.href);
    return route.abort();
  });
  await context.addInitScript(() => {
    localStorage.setItem("book_library_panel_collapsed", "1");
    localStorage.setItem("book_help_drawer_collapsed", "1");
  });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", error => report.errors.push(error.message));
  await page.goto(`${origin}?role=${role}`, { timeout: 120000 });
  await page.locator('[data-fixture-ready="true"]').waitFor();
  await card(resourceTitle).waitFor();
  await page.evaluate(() => {
    const original = console.error;
    window.__expectedFixtureErrors = [];
    console.error = (...args) => {
      if (args[0] === "[책방] 프로젝트 항목 삭제 실패:" && args[1] instanceof Error
        && ["Fixture project save failure", "Fixture activity cleanup failure"].includes(args[1].message)) {
        window.__expectedFixtureErrors.push(args[1].message);
        return;
      }
      original(...args);
    };
  });
  return context;
}

async function openDelete(title, kind) {
  await card(title).getByRole("button", { name: `${kind === "activity" ? "활동" : "자료"} 삭제`, exact: true }).click();
  await dialog().waitFor();
  assert.equal(await dialog().locator(".confirm-preview").textContent(), `"${title}"`);
}

async function requestFor(kind) {
  return page.evaluate(async itemKind => {
    const project = await window.__cardDelete.stored();
    const step = project.steps[0];
    return { classId: project.classId, projectId: project.id, stepId: step.id, kind: itemKind,
      item: step[itemKind === "activity" ? "activities" : "resources"][0] };
  }, kind);
}

function withoutTarget(project, target) {
  return project.steps.map(step => step.id !== target.stepId ? step : {
    ...step,
    [target.kind === "activity" ? "activities" : "resources"]: step[target.kind === "activity" ? "activities" : "resources"].filter(item => item.id !== target.item.id),
    itemOrder: step.itemOrder.filter(item => item.kind !== target.kind || item.id !== target.item.id),
  });
}

function contentSteps(project) {
  return JSON.parse(JSON.stringify(project.steps, (key, value) => ["createdAt", "updatedAt", "resourceOrder", "activityOrder"].includes(key) ? undefined : value));
}

try {
  await mkdir(path.join(fixture, "app"), { recursive: true });
  for (const dir of ["components", "lib"]) await cp(path.join(root, dir), path.join(fixture, dir), { recursive: true });
  await mkdir(path.join(fixture, "tests/fixtures"), { recursive: true });
  for (const file of ["package.json", "jsconfig.json", "app/globals.css", "app/book-sidebar.css", "tests/fixtures/CardDeletePage.jsx"])
    await cp(path.join(root, file), path.join(fixture, file));
  await writeFile(path.join(fixture, "lib/firebase.js"), "export const isFirebaseConfigured = false; export const db = null; export const auth = null; export const storage = null;");
  await writeFile(path.join(fixture, "next.config.mjs"), "export default { devIndicators: false };");
  await writeFile(path.join(fixture, "app/page.jsx"), 'export { default } from "@/tests/fixtures/CardDeletePage";');
  await writeFile(path.join(fixture, "app/layout.jsx"), 'import "./globals.css"; import "./book-sidebar.css"; export default function Layout({children}) { return <html lang="ko"><body>{children}</body></html>; }');
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  report.origin = origin;
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
  for (const key of Object.keys(env)) if (/FIREBASE|FIRESTORE|GCLOUD_PROJECT/.test(key)) delete env[key];
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: fixture, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", data => { logs += data; });
  server.stderr.on("data", data => { logs += data; });
  const deadline = Date.now() + 120000;
  while (!logs.includes("Ready in")) {
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });

  if (visualSupplement) {
    for (const width of [375, 768]) {
      const context = await newPage(origin, "teacher", width);
      const initial = await captureMetrics();
      assert.equal(initial.media.coarse, true);
      assert.equal(initial.media.noHover, true);
      for (const action of initial.cards[0].actions) {
        assert.equal(action.width, 44);
        assert.equal(action.height, 44);
      }
      await capture(`teacher-${width}-coarse-cards`);
      await openDelete(resourceTitle, "resource");
      await dialog().getByRole("button", { name: "취소", exact: true }).click();
      await dialog().waitFor({ state: "hidden" });
      assert.equal((await state()).saveCalls.length, 0);
      record(`teacher-${width}-coarse-touch-capture-and-cancel`);
      await context.close(); page = null;
    }
    for (const failure of ["save", "cleanup"]) {
      const context = await newPage(origin, "teacher", 375);
      const before = await stored();
      await configure(failure === "save" ? { failSave: 1 } : { failCleanup: 1 });
      await openDelete(activityTitle, "activity");
      await dialog().getByRole("button", { name: "삭제", exact: true }).click();
      await dialog().getByRole("alert").waitFor();
      assert.equal((await state()).saveCalls.length, 1);
      if (failure === "save") {
        assert.deepEqual((await stored()).steps, before.steps);
        assert.equal((await state()).cleanupCalls.length, 0);
      } else {
        assert.equal((await state()).cleanupCalls.length, 1);
        assert.equal(await dialog().getByRole("button", { name: "취소", exact: true }).isDisabled(), true);
      }
      await capture(`teacher-375-${failure}-error-clean`);
      assert.deepEqual(await page.evaluate(() => window.__expectedFixtureErrors), [failure === "save" ? "Fixture project save failure" : "Fixture activity cleanup failure"]);
      await dialog().getByRole("button", { name: "다시 시도", exact: true }).click();
      await dialog().waitFor({ state: "hidden" });
      assert.equal((await state()).saveCalls.length, failure === "save" ? 2 : 1);
      assert.equal((await state()).cleanupCalls.length, failure === "save" ? 1 : 2);
      record(`${failure}-error-clean-capture-and-retry`);
      await context.close(); page = null;
    }
  } else {
  for (const role of ["teacher", "student"]) for (const width of [375, 768, 1280]) {
    const context = await newPage(origin, role, width);
    const name = `${role}-${width}`;
    const before = await stored();
    if (role === "teacher") {
      assert.equal(await page.locator(".book-card-delete-btn:visible").count(), 4);
      assert.equal(await card(resourceTitle).getByRole("button", { name: "자료 수정", exact: true }).count(), 1);
      assert.equal(await card(resourceTitle).getByRole("button", { name: "자료 복사", exact: true }).count(), 1);
      assert.equal(await card(resourceTitle).getByRole("img", { name: "첨부 이미지 1장", exact: true }).count(), 1);
      assert.equal(await card(resourceTitle).getByRole("button", { name: "자료 확대", exact: true }).count(), 1);
      await capture(`${name}-cards`);
      await card(resourceTitle).getByRole("button", { name: "자료 삭제", exact: true }).focus();
      await capture(`${name}-trash-focus`);
      await openDelete(resourceTitle, "resource");
      await capture(`${name}-confirm-resource`);
      await dialog().getByRole("button", { name: "취소", exact: true }).click();
      await dialog().waitFor({ state: "hidden" });
      await openDelete(activityTitle, "activity");
      await capture(`${name}-confirm-activity`);
      await dialog().getByRole("button", { name: "취소", exact: true }).click();
      await dialog().waitFor({ state: "hidden" });
      assert.deepEqual((await stored()).steps, before.steps);
      assert.equal((await state()).saveCalls.length, 0);
      record(`${name}-teacher-controls-and-cancel`);
    } else {
      assert.equal(await page.locator(".book-card-delete-btn").count(), 0);
      for (const kind of ["activity", "resource"]) {
        const request = await requestFor(kind);
        assert.equal(await page.evaluate(value => window.__cardDelete.request(value), request), false);
        assert.equal(await page.evaluate(() => window.__cardDelete.confirm()), false);
      }
      assert.equal(await dialog().count(), 0);
      assert.equal((await state()).requests.length, 0);
      assert.equal((await state()).saveCalls.length, 0);
      assert.equal((await state()).cleanupCalls.length, 0);
      assert.deepEqual((await stored()).steps, before.steps);
      await capture(`${name}-cards`);
      record(`${name}-student-hidden-and-denied`);
    }
    await context.close(); page = null;
  }

  for (const kind of ["resource", "activity"]) {
    const context = await newPage(origin);
    const title = kind === "resource" ? resourceTitle : activityTitle;
    const before = await stored();
    const target = await requestFor(kind);
    await openDelete(title, kind);
    const forwarded = (await state()).requests[0];
    assert.deepEqual(forwarded, target);
    await dialog().getByRole("button", { name: "삭제", exact: true }).click();
    await dialog().waitFor({ state: "hidden" });
    await card(title).waitFor({ state: "hidden" });
    const after = await stored();
    assert.deepEqual(contentSteps(after), withoutTarget({ steps: contentSteps(before) }, target));
    assert.equal(after.title, before.title);
    assert.equal((await state()).saveCalls.length, 1);
    assert.equal((await state()).cleanupCalls.length, kind === "activity" ? 1 : 0);
    if (kind === "activity") assert.equal(await page.evaluate(id => window.__cardDelete.activities().some(item => item.id === id), target.item.id), false);
    await capture(`teacher-1280-deleted-${kind}`);
    record(`${kind}-confirm-persists-only-target-and-preserves-order`);
    await context.close(); page = null;
  }

  {
    const context = await newPage(origin);
    await configure({ holdSave: true });
    await openDelete(resourceTitle, "resource");
    await page.evaluate(() => { window.__cardDelete.confirm(); window.__cardDelete.confirm(); });
    await dialog().getByRole("button", { name: "삭제 중...", exact: true }).waitFor();
    assert.equal(await dialog().getByRole("button", { name: "삭제 중...", exact: true }).isDisabled(), true);
    assert.equal(await dialog().getByRole("button", { name: "취소", exact: true }).isDisabled(), true);
    assert.equal((await state()).saveCalls.length, 1);
    await page.evaluate(() => window.__cardDelete.close());
    assert.equal(await dialog().count(), 1);
    await capture("teacher-1280-pending");
    await page.evaluate(() => window.__cardDelete.releaseSave());
    await dialog().waitFor({ state: "hidden" });
    assert.equal((await state()).saveCalls.length, 1);
    record("pending-blocks-double-submit-and-close");
    await context.close(); page = null;
  }

  for (const failure of ["save", "cleanup"]) {
    const context = await newPage(origin, "teacher", 375);
    const before = await stored();
    await configure(failure === "save" ? { failSave: 1 } : { failCleanup: 1 });
    await openDelete(activityTitle, "activity");
    await dialog().getByRole("button", { name: "삭제", exact: true }).click();
    await dialog().getByRole("alert").waitFor();
    assert.equal((await state()).saveCalls.length, 1);
    if (failure === "save") {
      assert.deepEqual((await stored()).steps, before.steps);
      assert.equal((await state()).cleanupCalls.length, 0);
      assert.equal(await dialog().getByRole("button", { name: "취소", exact: true }).isDisabled(), false);
    } else {
      assert.equal((await state()).cleanupCalls.length, 1);
      assert.equal(await dialog().getByRole("button", { name: "취소", exact: true }).isDisabled(), true);
    }
    await capture(`teacher-375-${failure}-error`);
    await dialog().getByRole("button", { name: "다시 시도", exact: true }).click();
    await dialog().waitFor({ state: "hidden" });
    await card(activityTitle).waitFor({ state: "hidden" });
    assert.equal((await state()).saveCalls.length, failure === "save" ? 2 : 1);
    assert.equal((await state()).cleanupCalls.length, failure === "save" ? 1 : 2);
    record(`${failure}-failure-retained-and-retry${failure === "cleanup" ? "-without-resave" : ""}`);
    await context.close(); page = null;
  }

  for (const change of ["role", "class"]) {
    const context = await newPage(origin);
    const before = await stored();
    await openDelete(resourceTitle, "resource");
    if (change === "role") await page.evaluate(() => window.__cardDelete.role("student"));
    else await page.locator(".class-select").selectOption("delete-b");
    await dialog().waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => window.__cardDelete.confirm()), false);
    assert.equal((await state()).saveCalls.length, 0);
    assert.deepEqual(await page.evaluate(() => window.__cardDelete.stored("delete-a").then(project => project.steps)), before.steps);
    if (change === "role") assert.equal(await page.locator(".book-card-delete-btn").count(), 0);
    record(`${change}-change-invalidates-confirmation`);
    await context.close(); page = null;
  }

  {
    const context = await newPage(origin);
    const target = await requestFor("activity");
    const otherBefore = await page.evaluate(() => window.__cardDelete.stored("delete-b"));
    await configure({ holdSave: true });
    await openDelete(activityTitle, "activity");
    await dialog().getByRole("button", { name: "삭제", exact: true }).click();
    await dialog().getByRole("button", { name: "삭제 중...", exact: true }).waitFor();
    await page.locator(".class-select").selectOption("delete-b");
    await dialog().waitFor({ state: "hidden" });
    await page.evaluate(() => window.__cardDelete.releaseSave());
    await page.waitForFunction(() => !window.__cardDelete.state().pending);
    assert.equal((await state()).saveCalls.length, 1);
    assert.deepEqual((await state()).cleanupCalls, [target.item.id]);
    assert.deepEqual((await stored()).steps, otherBefore.steps);
    assert.equal(await page.evaluate(id => window.__cardDelete.activities("delete-a").some(item => item.id === id), target.item.id), false);
    assert.equal((await state()).toasts.length, 0);
    record("class-switch-during-save-completes-captured-cleanup-only");
    await context.close(); page = null;
  }

  {
    const context = await newPage(origin);
    await configure({ failCleanup: 1 });
    await openDelete(activityTitle, "activity");
    await dialog().getByRole("button", { name: "삭제", exact: true }).click();
    await dialog().getByRole("alert").waitFor();
    await page.locator(".class-select").selectOption("delete-b");
    await dialog().waitFor({ state: "hidden" });
    await page.locator(".class-select").selectOption("delete-a");
    await dialog().getByRole("alert").waitFor();
    assert.equal((await state()).saveCalls.length, 1);
    await dialog().getByRole("button", { name: "다시 시도", exact: true }).click();
    await dialog().waitFor({ state: "hidden" });
    assert.equal((await state()).saveCalls.length, 1);
    assert.equal((await state()).cleanupCalls.length, 2);
    record("cleanup-failure-survives-class-return-without-resave");
    await context.close(); page = null;
  }

  }
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.errors, []);
  report.result = "PASS";
  console.log(`PASS: ${report.cases.length} card deletion cases, ${report.captures.length} captures; evidence ${output}`);
} catch (error) {
  report.result = "FAIL";
  report.failure = error.stack;
  await page?.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
  console.error(`FAIL: ${error.message}; evidence ${output}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    if (process.platform === "win32") await new Promise(resolve => spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).on("close", resolve));
    else server.kill("SIGTERM");
  }
  await writeFile(path.join(output, "server.log"), logs);
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
}
