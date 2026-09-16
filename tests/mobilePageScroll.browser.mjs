import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = process.cwd();
const output = path.join(root, "artifacts", `mobile-page-scroll-${Date.now()}`);
const fixture = path.join(output, "fixture");
const report = { cases: [], externalRequests: [], errors: [] };
const navigationLayout = process.env.NAVIGATION_LAYOUT === "1";
let server, browser, page, logs = "";
async function metrics() {
  return page.evaluate(() => {
    const root = document.scrollingElement;
    const dashboard = [...document.querySelectorAll(".book-personal-dashboard, .book-personal-selected-view")].find(node => !node.hidden);
    const header = document.querySelector(".topbar");
    return { documentTop: root.scrollTop, documentHeight: root.scrollHeight, viewport: innerHeight,
      dashboardTop: dashboard.scrollTop, dashboardHeight: dashboard.clientHeight, dashboardScrollHeight: dashboard.scrollHeight,
      headerTop: header.getBoundingClientRect().top,
      stepTop: document.querySelector(".books-step-tabs").getBoundingClientRect().top };
  });
}
try {
  await mkdir(path.join(fixture, "app"), { recursive: true });
  for (const dir of ["components", "lib"]) await cp(path.join(root, dir), path.join(fixture, dir), { recursive: true });
  await mkdir(path.join(fixture, "tests/fixtures"), { recursive: true });
  for (const file of ["package.json", "jsconfig.json", "app/globals.css", "app/book-sidebar.css", "tests/fixtures/MobilePageScrollPage.jsx"])
    await cp(path.join(root, file), path.join(fixture, file));
  // Never initialize the hardcoded production Firebase app in this fixture.
  await writeFile(path.join(fixture, "lib/firebase.js"), "export const isFirebaseConfigured = false; export const db = null; export const auth = null; export const storage = null;");
  await writeFile(path.join(fixture, "next.config.mjs"), "export default { devIndicators: false };");
  await writeFile(path.join(fixture, "app/page.jsx"), 'export { default } from "@/tests/fixtures/MobilePageScrollPage";');
  await writeFile(path.join(fixture, "app/layout.jsx"), 'import "./globals.css"; import "./book-sidebar.css"; export default function Layout({children}) { return <html lang="en"><body>{children}</body></html>; }');
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
  for (const role of ["teacher", "student"]) for (const [width, height, touch] of [[375, 900, true], [768, 900, true], [1280, 900, false], [1024, 600, true], [820, 1180, true], [1024, 1366, true]]) {
    if (process.env.SCROLL_VIEWPORT_WIDTH && width !== Number(process.env.SCROLL_VIEWPORT_WIDTH)) continue;
    if (navigationLayout && ![375, 768, 1280].includes(width)) continue;
    const name = `${role}-${width}x${height}${touch ? "-touch" : ""}`;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, serviceWorkers: "block" });
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
    page.on("pageerror", error => report.errors.push(error.message));
    await page.goto(`${origin}?role=${role}${navigationLayout ? "&published=1" : ""}`, { timeout: 120000 });
    if (navigationLayout && role === "student") {
      const navigation = page.locator(".book-student-navigation");
      await navigation.waitFor();
      assert.equal(await page.locator(".books-content-head .books-step-tabs").count(), 0);
      assert.equal(await page.locator(".books-step-tabs:visible").count(), 1);
      const change = page.getByRole("button", { name: "반 변경", exact: true });
      const downloads = page.getByRole("button", { name: "자료 내려받기", exact: true });
      await downloads.waitFor();
      const changeBox = await change.boundingBox(), downloadBox = await downloads.boundingBox();
      assert(Math.abs(changeBox.y - downloadBox.y) < 2 && downloadBox.x >= changeBox.x + changeBox.width, `${name}: downloads must sit immediately right of class change`);
      assert(downloadBox.x + downloadBox.width <= width + 1, `${name}: paired commands must fit`);
      const back = navigation.getByRole("button", { name: "← 개인 카드", exact: true });
      const tabs = navigation.locator(".books-step-tabs");
      const backBox = await back.boundingBox(), tabsBox = await tabs.boundingBox();
      assert(tabsBox.x >= backBox.x + backBox.width && Math.abs(tabsBox.y - backBox.y) < 4, `${name}: tabs must share personal-card row`);
      await page.screenshot({ path: path.join(output, `${name}-overview.png`) });
      await tabs.getByRole("button", { name: "STEP 24", exact: true }).click();
      assert(await tabs.evaluate(node => node.scrollLeft > 0), `${name}: last Step must be reachable through horizontal scrolling`);
      await page.locator(".book-personal-step-section:visible").filter({ hasText: "Step 24" }).waitFor();
      await page.screenshot({ path: path.join(output, `${name}-step24.png`) });
      await back.click();
      await page.locator(".book-student-step-grid:visible").waitFor();
      assert.equal(await page.locator(".books-step-tabs:visible").count(), 1);
      await downloads.click();
      const downloadModal = page.getByRole("dialog", { name: "자료 내려받기" });
      await downloadModal.getByText("학습 자료.txt", { exact: true }).waitFor();
      await page.screenshot({ path: path.join(output, `${name}-downloads.png`) });
      const event = page.waitForEvent("download");
      await downloadModal.getByRole("button", { name: "다운로드", exact: true }).click();
      assert.equal((await event).suggestedFilename(), "학습 자료.txt");
      await downloadModal.getByRole("button", { name: "닫기", exact: true }).click();
    } else if (navigationLayout) {
      await page.locator(".books-step-tabs--teacher").waitFor();
      assert.equal(await page.locator(".book-student-navigation").count(), 0);
      assert.equal(await page.locator(".books-content-head .books-step-tabs--teacher").count(), 1);
    }
    await page.locator(".books-step-tabs button").first().click();
    await page.locator(".book-personal-activity-card").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    if (role === "student") {
      const wordRects = await page.locator(".books-intro").evaluate(node => {
        const text = node.firstChild;
        const start = text.textContent.indexOf("자료로");
        if (start < 0) throw new Error("Missing intro regression word");
        const range = document.createRange();
        range.setStart(text, start);
        range.setEnd(text, start + 3);
        return [...range.getClientRects()].map(rect => ({ top: rect.top, bottom: rect.bottom }));
      });
      assert.equal(wordRects.length, 1, `${name}: Korean intro word must not split across lines`);
    }
    await page.screenshot({ path: path.join(output, `${name}-before.png`) });
    const before = await metrics();
    const dashboard = page.locator(".book-personal-dashboard:visible, .book-personal-selected-view:visible").first();
    const box = await dashboard.boundingBox();
    await page.mouse.move(Math.min(width - 20, box.x + box.width / 2), Math.min(height - 30, box.y + 100));
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(350);
    const after = await metrics();
    const mobile = width <= 768 || touch;
    report.cases.push({ name, mobile, before, after });
    await page.screenshot({ path: path.join(output, `${name}-after.png`) });
    if (mobile) {
      const delta = after.documentTop - before.documentTop;
      assert(delta > 100, `${name}: document must scroll`);
      assert.equal(after.dashboardTop, 0, `${name}: activities must not scroll independently`);
      assert(Math.abs(before.headerTop - after.headerTop - delta) < 2, `${name}: header must move with document`);
      assert(Math.abs(before.stepTop - after.stepTop - delta) < 2, `${name}: Step must move with document`);
    } else {
      assert.equal(after.documentTop, 0, `${name}: desktop document must stay fixed`);
      assert(after.dashboardTop > 100, `${name}: desktop activities must scroll`);
      assert.equal(after.headerTop, before.headerTop);
    }
    await page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll(".book-personal-dashboard, .book-personal-selected-view").forEach(node => { node.scrollTop = 0; }); });
    await page.getByRole("button", { name: "활동 확대", exact: true }).first().click();
    const modal = page.getByRole("dialog");
    await modal.waitFor();
    const modalBefore = await page.evaluate(() => document.scrollingElement.scrollTop);
    const modalBody = modal.locator(".book-personal-expand-body");
    await modalBody.evaluate(node => { node.scrollTop = 350; });
    const modalScroll = await modalBody.evaluate(node => ({ top: node.scrollTop, height: node.clientHeight, scrollHeight: node.scrollHeight }));
    assert(modalScroll.top > 0, `${name}: long modal must scroll`);
    await page.mouse.move(width - 3, 5);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => document.scrollingElement.scrollTop), modalBefore, `${name}: modal must lock document`);
    await page.screenshot({ path: path.join(output, `${name}-modal.png`) });
    await modal.getByRole("button", { name: "닫기", exact: true }).click();
    await modal.waitFor({ state: "hidden" });
    if (role === "student") await page.getByRole("button", { name: "패널에서 열기", exact: true }).first().click();
    else await page.locator(".book-library-collapse").click();
    const side = page.locator(".book-library-side");
    await page.waitForTimeout(500);
    const panelDocumentTop = await page.evaluate(() => document.scrollingElement.scrollTop);
    await side.evaluate(node => { node.scrollTop = 300; });
    const sideMetrics = await side.evaluate(node => ({ top: node.scrollTop, height: node.clientHeight, scrollHeight: node.scrollHeight }));
    assert(sideMetrics.height <= height + 1, `${name}: side panel must remain viewport bounded`);
    assert(sideMetrics.top > 0, `${name}: expanded side panel must scroll independently`);
    assert.equal(await page.evaluate(() => document.scrollingElement.scrollTop), panelDocumentTop, `${name}: panel scrolling must not move document`);
    await page.screenshot({ path: path.join(output, `${name}-panel.png`) });
    report.cases.at(-1).modal = modalScroll;
    report.cases.at(-1).panel = sideMetrics;
    await side.evaluate(node => { node.scrollTop = 0; });
    await page.locator(".book-library-collapse").click();
    const help = page.locator(".book-help-drawer");
    const helpToggle = help.locator(".book-help-toggle");
    await helpToggle.click();
    assert.equal(await helpToggle.getAttribute("aria-expanded"), "true");
    await page.waitForTimeout(500);
    assert.equal(await help.locator(".book-help-item").count(), 32);
    const helpDocumentTop = await page.evaluate(() => document.scrollingElement.scrollTop);
    await help.evaluate(node => { node.scrollTop = 300; });
    const helpMetrics = await help.evaluate(node => ({ top: node.scrollTop, height: node.clientHeight, scrollHeight: node.scrollHeight }));
    assert(helpMetrics.height <= height + 1, `${name}: right help drawer must remain viewport bounded`);
    assert(helpMetrics.top > 0, `${name}: right help drawer must scroll independently`);
    assert.equal(await page.evaluate(() => document.scrollingElement.scrollTop), helpDocumentTop, `${name}: help scrolling must not move document`);
    await page.screenshot({ path: path.join(output, `${name}-help.png`) });
    if (width === 375) {
      await help.evaluate(node => node.scrollIntoView({ block: "nearest", inline: "end" }));
      const revealed = await help.boundingBox();
      assert(revealed.x >= -1 && revealed.x + revealed.width <= width + 1, `${name}: right drawer must be fully reachable horizontally`);
      await page.screenshot({ path: path.join(output, `${name}-help-revealed.png`) });
      report.cases.at(-1).helpRevealed = revealed;
    }
    await help.evaluate(node => { node.scrollTop = 0; });
    await helpToggle.click();
    assert.equal(await helpToggle.getAttribute("aria-expanded"), "false");
    if (width === 375) {
      await page.evaluate(() => {
        document.querySelectorAll(".books-main--split, .books-board-shell").forEach(node => { node.scrollLeft = 0; });
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(500);
      const main = await page.locator(".book-library-main").boundingBox();
      assert(main.x >= -1 && main.x + main.width <= width + 1, `${name}: main workspace must remain reachable after closing help`);
      await page.screenshot({ path: path.join(output, `${name}-help-return.png`) });
    }
    report.cases.at(-1).help = helpMetrics;
    if (navigationLayout && role === "student") {
      await page.getByRole("button", { name: "반 변경", exact: true }).click();
      const changeModal = page.getByRole("dialog", { name: "반 변경", exact: true });
      await changeModal.getByLabel("새 반 참여 코드").fill("123456");
      await page.screenshot({ path: path.join(output, `${name}-class-change.png`) });
      await changeModal.getByRole("button", { name: "참여하기", exact: true }).click();
      await changeModal.waitFor({ state: "hidden" });
      await page.getByText("Next classroom", { exact: true }).waitFor();
      await page.getByRole("button", { name: "자료 내려받기", exact: true }).waitFor({ state: "hidden" });
      await page.locator(".book-student-navigation").getByRole("button", { name: "STEP 2", exact: true }).click();
      await page.locator(".book-personal-step-section:visible").filter({ hasText: "Step 2" }).waitFor();
      report.cases.at(-1).navigation = "overview, last Step, back, paired downloads, download modal, class change, Step after class change";
    }
    await context.close();
    page = null;
  }
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.errors, []);
  report.result = "PASS";
  console.log(`PASS: ${report.cases.length} layouts; evidence ${output}`);
} catch (error) {
  report.result = "FAIL";
  report.failure = error.stack;
  console.error(`FAIL: ${error.message}; evidence ${output}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) await new Promise(resolve => spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).on("close", resolve));
  await writeFile(path.join(output, "server.log"), logs);
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
}
