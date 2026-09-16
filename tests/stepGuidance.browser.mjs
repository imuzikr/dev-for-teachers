import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = process.cwd();
const output = path.join(root, "artifacts", `step-guidance-${Date.now()}`);
const fixture = path.join(output, "fixture");
const report = { cases: [], externalRequests: [], errors: [] };
const multiline = "먼저 활동과 자료를 확인하세요.\n\n두 번째 줄에서 준비 순서를 확인합니다.\nhttps://example.test/" + "preparation".repeat(30);
const literalHtml = '<b>활동 안내</b> <img src="https://example.test/no-request" onerror="window.guidanceExecuted=true">';
let server, browser, page, logs = "";

function tabs() { return page.locator(".books-step-tabs:visible"); }
function guidance() { return page.locator('.book-step-guidance[aria-label="Step 안내"]:visible'); }
async function selectedStep(number) {
  await page.waitForFunction(expected => [...document.querySelectorAll('.books-step-tabs button[aria-pressed="true"]')].filter(node => node.getClientRects().length).map(node => node.textContent.trim()).join() === `STEP ${expected}`, number);
  assert.equal(await tabs().getByRole("button", { name: `STEP ${number}`, exact: true }).getAttribute("aria-pressed"), "true");
}
async function description(value) {
  await guidance().waitFor();
  await page.waitForFunction(expected => [...document.querySelectorAll(".book-step-guidance")].find(node => node.getClientRects().length)?.textContent === expected, value);
}
async function capture(name, role) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll(".book-personal-dashboard, .book-personal-selected-view").forEach(node => { node.scrollTop = 0; });
  });
  const metrics = await page.evaluate(() => {
    const visible = selector => [...document.querySelectorAll(selector)].find(node => node.getClientRects().length);
    const bounds = node => { const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }; };
    const note = visible(".book-step-guidance");
    const cards = visible(".book-personal-activity-card");
    return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, main: bounds(visible(".book-library-main")), tabs: bounds(visible(".books-step-tabs")), guidance: bounds(note), cards: cards ? bounds(cards) : null, whiteSpace: getComputedStyle(note).whiteSpace };
  });
  assert(metrics.guidance.height >= 24, `${name}: guidance retains blank space`);
  assert(metrics.documentWidth <= metrics.viewport, `${name}: document does not overflow horizontally`);
  assert(metrics.guidance.scrollWidth <= metrics.guidance.clientWidth + 1, `${name}: guidance text must wrap`);
  assert(metrics.guidance.x >= metrics.main.x - 1 && metrics.guidance.right <= metrics.main.right + 1, `${name}: guidance fits main column`);
  assert(metrics.guidance.x >= -1 && metrics.guidance.right <= metrics.viewport + 1, `${name}: guidance fits viewport`);
  assert(metrics.guidance.y >= metrics.tabs.bottom - 1, `${name}: guidance follows Step tabs`);
  assert(metrics.cards, `${name}: activity cards are rendered`);
  assert(metrics.guidance.bottom <= metrics.cards.y + 1, `${name}: guidance precedes activity cards`);
  assert.equal(metrics.whiteSpace, "pre-wrap", `${name}: intentional line breaks are preserved`);
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
  report.cases.push({ name, role, metrics });
}
async function openEditor() {
  await page.getByRole("button", { name: "프로젝트 편집", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "프로젝트 편집", exact: true });
  await editor.waitFor();
  await editor.locator(".book-step-flow-trigger").first().click();
  await editor.getByRole("textbox", { name: "Step 1 안내", exact: true }).waitFor();
  return editor;
}
async function saveEditor(editor) {
  await editor.getByRole("button", { name: "프로젝트 저장", exact: true }).last().click();
  await editor.waitFor({ state: "hidden" });
}
async function newPage(origin, role, width, query = "") {
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
  await page.goto(`${origin}?role=${role}${query}`, { timeout: 120000 });
  await page.locator('[data-fixture-ready="true"]').waitFor();
  return context;
}

try {
  await mkdir(path.join(fixture, "app"), { recursive: true });
  for (const dir of ["components", "lib"]) await cp(path.join(root, dir), path.join(fixture, dir), { recursive: true });
  await mkdir(path.join(fixture, "tests/fixtures"), { recursive: true });
  for (const file of ["package.json", "jsconfig.json", "app/globals.css", "app/book-sidebar.css", "tests/fixtures/StepGuidancePage.jsx"])
    await cp(path.join(root, file), path.join(fixture, file));
  await writeFile(path.join(fixture, "lib/firebase.js"), "export const isFirebaseConfigured = false; export const db = null; export const auth = null; export const storage = null;");
  await writeFile(path.join(fixture, "next.config.mjs"), "export default { devIndicators: false };");
  await writeFile(path.join(fixture, "app/page.jsx"), 'export { default } from "@/tests/fixtures/StepGuidancePage";');
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
  for (const role of ["teacher", "student"]) for (const width of [375, 768, 1280]) {
    const context = await newPage(origin, role, width);
    const name = `${role}-${width}`;
    await selectedStep(1);
    await description("1반 활동을 시작하기 전에 준비물을 확인하세요.\n설치 자료를 읽고 첫 번째 활동을 진행합니다.");
    await capture(`${name}-populated`, role);
    await tabs().getByRole("button", { name: "STEP 2", exact: true }).click();
    await selectedStep(2);
    await page.evaluate(() => window.__stepGuidance.updateDescription("shared-step-2", "실시간으로 수정한 두 번째 단계 안내"));
    await description("실시간으로 수정한 두 번째 단계 안내");
    await selectedStep(2);
    await page.locator(".class-select").selectOption("guidance-b");
    await selectedStep(1);
    await description("2반 활동을 시작하기 전에 준비물을 확인하세요.\n설치 자료를 읽고 첫 번째 활동을 진행합니다.");
    await tabs().getByRole("button", { name: "STEP 2", exact: true }).click();
    await page.locator(".class-select").selectOption("guidance-a");
    await selectedStep(1);
    await tabs().getByRole("button", { name: "STEP 2", exact: true }).click();
    await page.reload();
    await selectedStep(1);
    await tabs().getByRole("button", { name: "STEP 3", exact: true }).click();
    await description("");
    await capture(`${name}-legacy-empty`, role);
    await tabs().getByRole("button", { name: "STEP 1", exact: true }).click();
    if (role === "teacher") {
      let editor = await openEditor();
      const field = editor.getByRole("textbox", { name: "Step 1 안내", exact: true });
      await field.fill(multiline);
      await field.focus();
      await page.keyboard.press("Tab");
      assert(await editor.evaluate(node => node.contains(document.activeElement)), `${name}: editor keyboard focus remains in dialog`);
      assert(await editor.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${name}: editor fits viewport`);
      const editorBounds = await editor.boundingBox(), fieldBounds = await field.boundingBox();
      assert(fieldBounds.x >= editorBounds.x && fieldBounds.x + fieldBounds.width <= editorBounds.x + editorBounds.width + 1, `${name}: guidance textarea fits editor`);
      await field.evaluate(node => { node.scrollTop = 0; });
      await page.screenshot({ path: path.join(output, `${name}-editor.png`) });
      report.cases.push({ name: `${name}-editor`, role, editorBounds, fieldBounds });
      await saveEditor(editor);
      await description(multiline);
      await capture(`${name}-multiline`, role);
      assert.equal(await page.evaluate(async () => (await window.__stepGuidance.stored()).steps[0].description), multiline);
      await page.reload();
      await selectedStep(1);
      await description(multiline);
      editor = await openEditor();
      assert.equal(await editor.getByRole("textbox", { name: "Step 1 안내", exact: true }).inputValue(), multiline);
      await editor.getByRole("textbox", { name: "Step 1 안내", exact: true }).fill("");
      await saveEditor(editor);
      await description("");
      await capture(`${name}-cleared`, role);
      editor = await openEditor();
      assert.equal(await editor.getByRole("textbox", { name: "Step 1 안내", exact: true }).inputValue(), "");
      await saveEditor(editor);
      await page.reload();
      await selectedStep(1);
      await description("");
    } else {
      await page.getByRole("button", { name: "← 개인 카드", exact: true }).click();
      await page.locator(".book-student-step-grid:visible").waitFor();
      await page.evaluate(() => window.__stepGuidance.updateDescription("shared-step-1", "개인 카드 선택 중 변경한 안내"));
      assert.equal(await tabs().locator('[aria-pressed="true"]').count(), 0, `${name}: live project update preserves explicit personal card choice`);
      assert.equal(await guidance().count(), 0);
      await page.locator(".class-select").selectOption("guidance-b");
      await selectedStep(1);
      await page.evaluate(value => window.__stepGuidance.updateDescription("shared-step-1", value), multiline);
      await description(multiline);
      await capture(`${name}-multiline`, role);
      await page.evaluate(() => window.__stepGuidance.updateDescription("shared-step-1", ""));
      await description("");
      await capture(`${name}-cleared`, role);
    }
    await page.evaluate(value => window.__stepGuidance.updateDescription("shared-step-1", value), literalHtml);
    await description(literalHtml);
    assert.equal(await guidance().locator("b, img, script").count(), 0, `${name}: HTML is displayed literally`);
    assert.equal(await page.evaluate(() => window.guidanceExecuted), undefined);
    report.cases.push({ name: `${name}-behavior`, role, verified: ["initial Step 1", "same-ID class switch and return", "refresh Step 1", "live update preserves Step 2", "legacy empty", "literal HTML", role === "teacher" ? "editor save, reopen, clear, reload" : "explicit personal card choice"] });
    await context.close();
    page = null;
  }
  for (const role of ["teacher", "student"]) {
    const context = await newPage(origin, role, 1280, "&delayed=1");
    assert.equal(await tabs().locator("button").count(), 0);
    await page.evaluate(() => window.__stepGuidance.load());
    await selectedStep(1);
    await description("1반 활동을 시작하기 전에 준비물을 확인하세요.\n설치 자료를 읽고 첫 번째 활동을 진행합니다.");
    report.cases.push({ name: `${role}-async-project`, verified: "project absent on mount then loaded selects Step 1" });
    await context.close();
    page = null;
  }
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.errors, []);
  report.result = "PASS";
  console.log(`PASS: ${report.cases.length} Step guidance cases; evidence ${output}`);
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
