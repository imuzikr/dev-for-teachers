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
const output = path.join(root, "artifacts", `student-autosave-${Date.now()}`);
const fixture = path.join(output, "fixture");
const report = { checks: [], screenshots: [], geometry: [], errors: [], passed: false };
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
  for (const file of ["package.json", "jsconfig.json"]) await cp(path.join(root, file), path.join(fixture, file));
  for (const name of ["globals.css", "book-sidebar.css"]) await cp(path.join(root, "app", name), path.join(fixture, "app", name));
  await cp(path.join(root, "tests/fixtures/StudentAutosavePage.jsx"), path.join(fixture, "app/page.jsx"));
  await writeFile(path.join(fixture, "lib/firebase.js"), "export const isFirebaseConfigured=false; export const db=null; export const auth=null; export const storage=null;");
  await writeFile(path.join(fixture, "app/layout.jsx"), 'import "./globals.css";import "./book-sidebar.css";export default function Layout({children}){return <html lang="ko"><body>{children}</body></html>}');
  await writeFile(path.join(fixture, "next.config.mjs"), "export default {devIndicators:false};");
}

async function capture(name, locator = null) {
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(output, `${name}.png`);
  await page.locator('[aria-label="자동 저장 검증 제어"]').evaluateAll((nodes) => nodes.forEach((node) => { node.style.visibility = "hidden"; }));
  if (locator) await locator.screenshot({ path: file });
  else await page.screenshot({ path: file, fullPage: true });
  await page.locator('[aria-label="자동 저장 검증 제어"]').evaluateAll((nodes) => nodes.forEach((node) => { node.style.visibility = "visible"; }));
  report.screenshots.push(file);
  return file;
}

async function captureStatus(name, container) {
  const status = container.locator(".student-autosave-status").last();
  await status.scrollIntoViewIfNeeded();
  return capture(name, container);
}

function sidebar() {
  return page.locator(".student-activity-side:not(.is-collapsed)");
}

function detail(title) {
  return page.locator(".student-activity-detail").filter({ hasText: title }).first();
}

function expanded(title) {
  return page.getByRole("dialog", { name: title, exact: true });
}

async function configure(patch) {
  await page.evaluate((value) => window.__studentAutosave.configure(value), patch);
}

async function entryForTitle(title) {
  return page.evaluate((value) => window.__studentAutosave.entryForTitle(value), title);
}

async function recordForTitle(kind, title) {
  return page.evaluate(([itemKind, value]) => window.__studentAutosave.recordForTitle(itemKind, value), [kind, title]);
}

async function waitSaved(text) {
  await page.getByText("자동 저장됨", { exact: true }).waitFor({ timeout: 10000 });
  if (text) {
    await page.waitForFunction((needle) => JSON.stringify(window.__studentAutosave.entries()).includes(needle), text);
  }
}

async function openPanel(title) {
  const card = page.locator("article.book-personal-activity-card").filter({ hasText: title }).first();
  await card.getByRole("button", { name: "패널에서 열기", exact: true }).click();
  await detail(title).waitFor();
  return detail(title);
}

async function openExpanded(title) {
  const card = page.locator("article.book-personal-activity-card").filter({ hasText: title }).first();
  await card.getByRole("button", { name: /확대$/ }).click();
  await expanded(title).waitFor();
  return expanded(title);
}

async function tinyImageFile() {
  const file = path.join(output, "autosave-upload.png");
  const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  await writeFile(file, Buffer.from(base64, "base64"));
  return file;
}

async function assertNoCompletionTitle(title) {
  const completed = await page.evaluate((value) => {
    const itemId = window.__studentAutosave.itemIdForTitle(value);
    return window.__studentAutosave.records().some((record) => record.itemId === itemId && record.confirmed);
  }, title);
  assert.equal(completed, false, "Autosave must not mark the activity complete");
}

async function assertPortfolioFullscreenAndFlushes() {
  await page.getByRole("button", { name: "STEP 1 선택", exact: true }).click();
  const panel = await openPanel("해결 방안 정리");
  await panel.getByRole("textbox", { name: "답변 내용", exact: true }).fill("포트폴리오 버튼이 저장해야 하는 최신 초안");
  await panel.locator(".student-activity-urls input").first().fill("https://autosave.example.test/portfolio-flush");
  await page.getByRole("button", { name: "김학생 포트폴리오 만들기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "학생별 차시 보고서", exact: true });
  await dialog.waitFor();
  const box = await dialog.boundingBox();
  assert(box, "Portfolio dialog is measurable");
  const viewport = page.viewportSize();
  assert(Math.abs(box.x) <= 1 && Math.abs(box.y) <= 1, "Portfolio starts at viewport origin");
  assert(Math.abs(box.width - viewport.width) <= 1, "Portfolio fills viewport width");
  assert(Math.abs(box.height - viewport.height) <= 1, "Portfolio fills viewport height");
  const frame = page.frameLocator('iframe[title="학생별 차시 보고서 미리보기"]');
  await frame.getByText("포트폴리오 버튼이 저장해야 하는 최신 초안").waitFor({ timeout: 15000 });
  await frame.locator('a[href="https://autosave.example.test/portfolio-flush"]').waitFor();
  await frame.getByText("문제: 불편한 점을 찾기").waitFor();
  await frame.getByText("해결: 작은 웹 앱 만들기").waitFor();
  await capture("portfolio-fullscreen-flush");
  await dialog.getByRole("button", { name: "차시 보고서 닫기", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  report.checks.push("Portfolio opens fullscreen and flushes dirty student drafts before rendering");
}

try {
  await setupFixture();
  const port = await freePort();
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: fixture, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (data) => { logs += data; });
  server.stderr.on("data", (data) => { logs += data; });
  await waitForServer();

  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_PATH ? undefined : "chrome", executablePath: process.env.PLAYWRIGHT_PATH, headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}`, { timeout: 120000 });
  await page.getByRole("button", { name: "STEP 1", exact: true }).waitFor();
  await page.getByRole("button", { name: "STEP 1", exact: true }).click();

  const firstPanel = await openPanel("문제 정의 작성");
  await firstPanel.getByRole("textbox", { name: "답변 내용", exact: true }).fill("자동 저장으로 남는 문제 정의");
  await waitSaved("자동 저장으로 남는 문제 정의");
  await assertNoCompletionTitle("문제 정의 작성");
  await captureStatus("autosave-status-1280", firstPanel);
  await page.setViewportSize({ width: 375, height: 812 });
  await captureStatus("autosave-status-375", firstPanel);
  await page.setViewportSize({ width: 1280, height: 900 });
  report.checks.push("Sidebar answer autosaves without using the completion button");

  const solutionPanel = await openPanel("해결 방안 정리");
  await solutionPanel.locator(".student-activity-urls input").first().fill("https://autosave.example.test/solution");
  const imageFile = await tinyImageFile();
  await solutionPanel.locator('input[aria-label="첨부 이미지 선택"]').setInputFiles(imageFile);
  await solutionPanel.getByRole("img", { name: "첨부 이미지 1", exact: true }).waitFor();
  await page.waitForFunction(() => window.__studentAutosave.entryForTitle("해결 방안 정리")?.urls?.includes("https://autosave.example.test/solution"));
  await page.waitForFunction(() => (window.__studentAutosave.entryForTitle("해결 방안 정리")?.images ?? []).length === 1);
  let stored = await entryForTitle("해결 방안 정리");
  assert.deepEqual(stored.urls, ["https://autosave.example.test/solution"]);
  assert.equal(stored.images.length, 1);
  await assertNoCompletionTitle("해결 방안 정리");
  report.checks.push("Sidebar URLs and capture images autosave without completion");

  const modal = await openExpanded("문제 정의 작성");
  await modal.getByRole("textbox", { name: "답변 내용", exact: true }).fill("확대 모달에서 자동 저장한 답변");
  await waitSaved("확대 모달에서 자동 저장한 답변");
  await modal.getByRole("button", { name: "닫기", exact: true }).click();
  await modal.waitFor({ state: "hidden" });
  assert.equal((await entryForTitle("문제 정의 작성")).dashboardText, "확대 모달에서 자동 저장한 답변");
  report.checks.push("Expanded modal answer autosaves into the same student record");

  await page.getByRole("button", { name: "STEP 2 선택", exact: true }).click();
  const templatePanel = await openPanel("프롬프트 만들기");
  await templatePanel.getByLabel("문제 정의").fill("불편한 점을 찾기");
  await templatePanel.getByLabel("해결 방안").fill("작은 웹 앱 만들기");
  await waitSaved("작은 웹 앱 만들기");
  const activityTemplateEntry = await entryForTitle("프롬프트 만들기");
  assert.deepEqual(activityTemplateEntry.templateValues, { "문제 정의": "불편한 점을 찾기", "해결 방안": "작은 웹 앱 만들기" });
  assert(activityTemplateEntry.dashboardText.includes("문제: 불편한 점을 찾기"), "Activity template autosave stores filled dashboard text");
  assert(activityTemplateEntry.dashboardText.includes("해결: 작은 웹 앱 만들기"), "Activity template autosave stores filled solution text");
  await assertNoCompletionTitle("프롬프트 만들기");
  const resourcePanel = await openPanel("자료 템플릿");
  await resourcePanel.getByLabel("발표 제목").fill("자동 저장 발표");
  await resourcePanel.getByLabel("핵심 문장").fill("복사할 자료 템플릿 값");
  await resourcePanel.locator(".student-autosave-status").getByText("자동 저장됨", { exact: true }).waitFor({ timeout: 10000 });
  await page.waitForFunction(() => JSON.stringify(window.__studentAutosave.records()).includes("복사할 자료 템플릿 값"));
  assert.deepEqual((await recordForTitle("resource", "자료 템플릿")).templateValues, { "발표 제목": "자동 저장 발표", "핵심 문장": "복사할 자료 템플릿 값" });
  report.checks.push("Activity and resource template values autosave and persist");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "STEP 1", exact: true }).waitFor();
  await page.getByRole("button", { name: "STEP 1", exact: true }).click();
  const restored = await openPanel("해결 방안 정리");
  assert.equal(await restored.locator(".student-activity-urls input").first().inputValue(), "https://autosave.example.test/solution");
  await restored.getByRole("img", { name: "첨부 이미지 1", exact: true }).waitFor();
  report.checks.push("Autosaved URL and image survive refresh through stored student entries");

  await configure({ failNext: 1 });
  const failing = await openPanel("문제 정의 작성");
  await failing.getByRole("textbox", { name: "답변 내용", exact: true }).fill("실패 후에도 남는 초안");
  await failing.locator(".student-autosave-status.is-failed").waitFor();
  await failing.getByRole("button", { name: "다시 저장", exact: true }).waitFor();
  assert.equal(await failing.getByRole("textbox", { name: "답변 내용", exact: true }).inputValue(), "실패 후에도 남는 초안");
  await configure({ failNext: 0 });
  await failing.getByRole("button", { name: "다시 저장", exact: true }).click();
  await waitSaved("실패 후에도 남는 초안");
  report.checks.push("Failed autosave preserves draft and retry saves it");

  await configure({ delayMs: 900 });
  await failing.getByRole("textbox", { name: "답변 내용", exact: true }).fill("느린 저장의 이전 값");
  await page.waitForFunction(() => window.__studentAutosave.calls().some((call) => call.dashboardText === "느린 저장의 이전 값"));
  await failing.getByRole("textbox", { name: "답변 내용", exact: true }).fill("느린 저장 중 입력한 최신 값");
  await configure({ delayMs: 0 });
  await waitSaved("느린 저장 중 입력한 최신 값");
  assert.equal((await entryForTitle("문제 정의 작성")).dashboardText, "느린 저장 중 입력한 최신 값");
  report.checks.push("Delayed older save acknowledgements do not clobber newer drafts");

  await assertPortfolioFullscreenAndFlushes();

  await page.getByRole("button", { name: "교사 보기", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-fixture-role]")?.dataset.fixtureRole === "teacher");
  const beforeCalls = await page.evaluate(() => window.__studentAutosave.calls().length);
  const teacherPanel = await openPanel("문제 정의 작성");
  assert.equal(await teacherPanel.getByRole("textbox", { name: "답변 내용", exact: true }).count(), 0);
  assert.equal(await teacherPanel.locator(".student-activity-urls input").count(), 0);
  assert.equal(await teacherPanel.locator('input[aria-label="첨부 이미지 선택"]').count(), 0);
  await page.waitForTimeout(850);
  assert.equal(await page.evaluate(() => window.__studentAutosave.calls().length), beforeCalls);
  report.checks.push("Teacher review surface is read-only and does not write autosaves");

  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log("PASS", report.checks);
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  if (page) {
    report.runtimeState = await page.evaluate(() => ({
      calls: window.__studentAutosave?.calls?.() ?? [],
      entries: window.__studentAutosave?.entries?.() ?? [],
      records: window.__studentAutosave?.records?.() ?? [],
      role: document.querySelector("[data-fixture-role]")?.dataset.fixtureRole ?? "",
      statusText: [...document.querySelectorAll(".student-autosave-status")].map((node) => node.textContent?.trim()),
      templateInputs: [...document.querySelectorAll(".activity-template input")].map((input) => ({ label: input.closest("label")?.querySelector("span")?.textContent ?? "", value: input.value })),
    })).catch((stateError) => ({ error: stateError instanceof Error ? stateError.message : String(stateError) }));
  }
  if (page) await capture("student-autosave-failure").catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) await promisify(execFile)("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).catch(() => {});
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "server.log"), logs);
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log("Report:", path.join(output, "report.json"));
}
