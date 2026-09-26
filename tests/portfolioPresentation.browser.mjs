import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = process.cwd();
const output = path.join(root, "artifacts", `portfolio-presentation-${Date.now()}`);
const fixture = path.join(output, "fixture");
const report = { checks: [], screenshots: [], errors: [], passed: false };
let server;
let browser;
let page;
let logs = "";

async function freePort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function waitForServer() {
  const until = Date.now() + 120000;
  while (!logs.includes("Ready in")) {
    if (server.exitCode !== null || Date.now() > until) throw new Error(logs);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function setupFixture() {
  await mkdir(path.join(fixture, "app"), { recursive: true });
  for (const dir of ["components", "lib"]) await cp(path.join(root, dir), path.join(fixture, dir), { recursive: true });
  for (const name of ["package.json", "jsconfig.json"]) await cp(path.join(root, name), path.join(fixture, name));
  for (const name of ["globals.css", "book-sidebar.css"]) await cp(path.join(root, "app", name), path.join(fixture, "app", name));
  await cp(path.join(root, "tests/fixtures/PortfolioPresentationPage.jsx"), path.join(fixture, "app/page.jsx"));
  const storeFile = path.join(fixture, "lib/store.js");
  let store = await readFile(storeFile, "utf8");
  const startMarker = '  const activeSessionId = sessionId || crypto.randomUUID();';
  assert(store.includes(startMarker));
  store = store.replace(startMarker, '  if (globalThis.__portfolioFailures?.start > 0) { globalThis.__portfolioFailures.start--; throw new Error("Simulated publication failure"); }' + String.fromCharCode(10) + startMarker);
  for (const [name, marker] of [
    ["stop", "export async function stopBookPortfolioBroadcast(classId, sessionId) {"],
    ["load", "export async function loadBookPortfolioBroadcast(broadcast, { signal } = {}) {"],
  ]) {
    assert(store.includes(marker));
    store = store.replace(marker, marker + String.fromCharCode(10) + '  if (globalThis.__portfolioFailures?.' + name + ' > 0) { globalThis.__portfolioFailures.' + name + '--; throw new Error("Simulated transport failure"); }');
  }
  await writeFile(storeFile, store);
  await writeFile(path.join(fixture, "lib/firebase.js"), "export const isFirebaseConfigured=false; export const db=null; export const auth=null; export const storage=null;");
  await writeFile(path.join(fixture, "app/layout.jsx"), 'import "./globals.css";import "./book-sidebar.css";export default function Layout({children}){return <html lang="ko"><body>{children}</body></html>}');
  await writeFile(path.join(fixture, "next.config.mjs"), "export default {devIndicators:false};");
}

async function capture(name) {
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(output, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  report.screenshots.push(file);
}

async function assertNoHorizontalOverflow(label) {
  const overflow = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map((node) => ({
      label: node.getAttribute("aria-label") || node.getAttribute("aria-labelledby") || "",
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    })),
  }));
  assert(overflow.documentWidth <= overflow.viewport + 1, `${label}: document has no horizontal overflow`);
  assert(overflow.bodyWidth <= overflow.viewport + 1, `${label}: body has no horizontal overflow`);
  assert(overflow.dialogs.every((dialog) => dialog.scrollWidth <= dialog.clientWidth + 1), `${label}: dialogs fit their width`);
}

async function waitForTeacherReport() {
  const dialog = page.getByRole("dialog", { name: "학생별 차시 보고서", exact: true });
  await dialog.waitFor();
  const frame = page.frameLocator('iframe[title="학생별 차시 보고서 미리보기"]');
  await frame.getByRole("heading", { name: "1차시 보고서", exact: true }).waitFor();
  await frame.getByText("학교에서 해결하고 싶은 문제를 정의했습니다.").waitFor();
  await frame.getByText("https://example.com/solution").waitFor();
  return dialog;
}

async function waitForAudienceReport() {
  const overlay = page.getByRole("dialog", { name: "선생님이 보여주는 포트폴리오", exact: true });
  await overlay.waitFor();
  await page.frameLocator('iframe[title="공개된 학생 포트폴리오"]').getByText("프롬프트와 해결 방안을 정리했습니다.").waitFor();
  return overlay;
}

try {
  await setupFixture();
  const port = await freePort();
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: fixture, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (data) => { logs += data; });
  server.stderr.on("data", (data) => { logs += data; });
  await writeFile(path.join(output, "server-pid.json"), JSON.stringify({pid:server.pid,port}));
  await waitForServer();

  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_PATH ? undefined : "chrome", executablePath: process.env.PLAYWRIGHT_PATH, headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}`, { timeout: 120000 });
  await context.route("https://example.com/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Linked student result</h1>" }));
  const openReport = async () => {
    await page.getByRole("button", {name:"교사 보고서 열기", exact:true}).click();
    return waitForTeacherReport();
  };
  const audience = async visible => {
    await page.evaluate(value => window.portfolioPresentationQA.setAudienceVisible(value), visible);
    if (visible) return waitForAudienceReport();
    await page.getByRole("dialog", {name:"선생님이 보여주는 포트폴리오", exact:true}).waitFor({state:"hidden"});
  };
  const teacherScroll = async top => {
    await page.evaluate(value => {
      const doc=document.querySelector('iframe[title="학생별 차시 보고서 미리보기"]').contentDocument;
      doc.scrollingElement.scrollTo({top:value,behavior:"instant"}); doc.dispatchEvent(new Event("scroll"));
    }, top);
  };
  const failNext = (kind) => page.evaluate(key => { globalThis.__portfolioFailures = {[key]:key === "load" ? 100 : 1}; }, kind);
  let dialog = await openReport();
  for (const width of [1280,768,375]) {
    await page.setViewportSize({width,height:900});
    await dialog.getByRole("button", {name:"발표 모드",exact:true}).waitFor();
    await assertNoHorizontalOverflow("teacher " + width); await capture("teacher-" + width);
  }
  await page.setViewportSize({width:1280,height:900});
  await failNext("start");
  await dialog.getByRole("button", {name:"발표 모드",exact:true}).click();
  await dialog.getByRole("alert").filter({hasText:"포트폴리오를 공개하지 못했어요"}).waitFor();
  assert.equal(await page.evaluate(() => window.portfolioPresentationQA.broadcast),null);
  await dialog.getByRole("button", {name:"다시 시도",exact:true}).click();
  await dialog.getByRole("button", {name:"발표 종료",exact:true}).waitFor();
  await page.waitForFunction(() => window.portfolioPresentationQA.broadcast?.portfolioChunkCount > 1);
  report.checks.push("Failed publication retries; prepared report over 1 MiB publishes as multiple chunks");
  await failNext("load");
  await page.evaluate(() => window.portfolioPresentationQA.setAudienceVisible(true));
  const overlay = page.getByRole("dialog", {name:"선생님이 보여주는 포트폴리오",exact:true});
  await overlay.getByRole("alert").waitFor();
  await page.evaluate(() => { globalThis.__portfolioFailures = {}; });
  await overlay.getByRole("button", {name:"다시 시도",exact:true}).click();
  await waitForAudienceReport();
  const studentFrame = page.frameLocator('iframe[title="공개된 학생 포트폴리오"]');
  assert.equal(await studentFrame.locator("img").count(),2);
  assert.equal(await studentFrame.locator("img").evaluateAll(images => images.every(image => image.complete && image.naturalWidth === 400)),true);
  assert.equal(await overlay.getByRole("button").count(),0);
  report.checks.push("Audience retries loading and renders two real capture images with no teacher controls");
  const [popup] = await Promise.all([context.waitForEvent("page"), studentFrame.locator('a[href="https://example.com/solution"]').click()]);
  await popup.waitForLoadState();
  assert.equal(popup.url(),"https://example.com/solution"); await popup.close();
  report.checks.push("Student result URL opens its destination in a new tab");
  await teacherScroll(800);
  await page.waitForFunction(() => (window.portfolioPresentationQA.broadcast?.scrollPosition?.ratio ?? 0)>0.2);
  await page.waitForFunction(() => document.querySelector('iframe[title="공개된 학생 포트폴리오"]').contentDocument.scrollingElement.scrollTop>0);
  report.checks.push("Teacher scrolling synchronizes the student viewport");
  await teacherScroll(0);
  await page.waitForFunction(() => window.portfolioPresentationQA.broadcast?.scrollPosition?.ratio === 0);
  for (const width of [1280,768,375]) {
    await page.setViewportSize({width,height:900}); await waitForAudienceReport();
    await page.waitForFunction(() => document.querySelector('iframe[title="공개된 학생 포트폴리오"]').contentDocument.scrollingElement.scrollTop === 0);
    await assertNoHorizontalOverflow("audience " + width); await capture("audience-" + width);
  }
  await audience(false); await page.setViewportSize({width:1280,height:900});
  await failNext("stop");
  await dialog.getByRole("button", {name:"차시 보고서 닫기",exact:true}).click();
  await dialog.getByRole("alert").filter({hasText:"발표를 종료하지 못했어요"}).waitFor();
  assert.equal(await dialog.isVisible(),true);
  assert.equal(await page.evaluate(() => window.portfolioPresentationQA.broadcast.mode),"bookPortfolio");
  await dialog.getByRole("button", {name:"다시 시도",exact:true}).click();
  await page.waitForFunction(() => window.portfolioPresentationQA.broadcast == null);
  await dialog.getByRole("button", {name:"차시 보고서 닫기",exact:true}).click(); await dialog.waitFor({state:"hidden"});
  report.checks.push("Failed stop keeps report open; retry safely ends broadcast");
  dialog=await openReport();
  await dialog.getByRole("button", {name:"발표 모드",exact:true}).click();
  await dialog.getByRole("button", {name:"발표 종료",exact:true}).waitFor();
  await audience(true); await audience(false);
  await dialog.getByRole("button", {name:"발표 종료",exact:true}).click();
  await page.waitForFunction(() => window.portfolioPresentationQA.broadcast == null);
  report.checks.push("Teacher stop restores the student screen");
  await dialog.getByRole("button", {name:"발표 모드",exact:true}).click();
  await dialog.getByRole("button", {name:"발표 종료",exact:true}).waitFor();
  await page.evaluate(() => window.portfolioPresentationQA.replaceBroadcast());
  await dialog.getByRole("button", {name:"발표 모드",exact:true}).waitFor();
  await dialog.getByRole("button", {name:"차시 보고서 닫기",exact:true}).click(); await dialog.waitFor({state:"hidden"});
  assert.equal(await page.evaluate(() => window.portfolioPresentationQA.broadcast.mode),"single");
  report.checks.push("Closing an older report does not stop its replacement broadcast");
  await page.evaluate(() => window.portfolioPresentationQA.setRole("student"));
  dialog=await openReport();
  assert.equal(await dialog.getByRole("button", {name:"발표 모드",exact:true}).count(),0);
  report.checks.push("Student own-report dialog has no publication control");
  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log("PASS", report.checks);
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  if (page) await capture("portfolio-presentation-failure").catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) await promisify(execFile)("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).catch(() => {});
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "server.log"), logs);
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log("Report:", path.join(output, "report.json"));
}
