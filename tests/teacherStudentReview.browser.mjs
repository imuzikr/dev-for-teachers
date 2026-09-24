import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const execute = promisify(execFile);
const root = process.cwd();
const sourceRoot = process.env.REVIEW_SOURCE_ROOT ? path.resolve(process.env.REVIEW_SOURCE_ROOT) : root;
const output = path.join(root, "artifacts/teacher-student-review", `${process.env.REVIEW_RUN_LABEL || "run"}-${Date.now()}`);
const fixture = path.join(output, "fixture");
const report = { sourceRoot, checks: [], screenshots: [], layout: [], errors: [], sourceHashes: {}, passed: false };
let server, browser, page, logs = "";
const panel = () => page.getByRole("complementary", { name: "선택한 활동과 자료" });
const modal = () => page.getByRole("dialog");
const personalCard = title => page.locator(".book-personal-detail-list > article").filter({ hasText: title });
const flowCard = title => page.locator(".book-project-flow-detail-list > article").filter({ hasText: title });
const response = (student, activity) => `${student}의 ${activity} 답변`;

async function freePort() {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}
async function capture(name) {
  const file = path.join(output, `${name}.png`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  report.layout.push({ name, ...await page.evaluate(() => ({
    viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth,
    panels: [...document.querySelectorAll(".student-activity-detail, .book-personal-expand-modal")].map(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth })),
    savedLinks: [...document.querySelectorAll(".book-item-url-link")].map(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth })),
    detailHeaders: [...document.querySelectorAll(".book-personal-detail--teacher .book-personal-detail-head")].map(el => ({
      containerWidth: el.closest(".book-library-main").clientWidth,
      columns: getComputedStyle(el).gridTemplateColumns.split(" ").length,
      titleWordBreak: getComputedStyle(el.querySelector("h2")).wordBreak,
      width: el.clientWidth, scrollWidth: el.scrollWidth,
    })),
  })) });
  await page.screenshot({ path: file, fullPage: true });
  report.screenshots.push(file);
}
async function readonlyAnswer(container, expected, slug) {
  await container.locator(".book-personal-expand-response").filter({ hasText: expected }).waitFor();
  assert.equal(await container.locator("textarea, input:not([type=checkbox]), [contenteditable=true]").count(), 0, "Review has no answer, URL, or template editors");
  assert.equal(await container.getByRole("button", { name: "저장", exact: true }).count(), 0, "Review has no save action");
  assert.equal(await container.getByRole("button", { name: "모두 체크하기", exact: true }).count(), 0);
  assert.match(await container.locator(".book-personal-expand-head").innerText(), new RegExp(expected.split("의")[0]));
  for (const checkbox of await container.getByRole("checkbox").all()) assert(await checkbox.isDisabled(), "Review checklist is read-only");
  if (slug.endsWith("/first")) assert.equal(await container.getByRole("checkbox").isChecked(), slug.startsWith("1/"), "Review displays this student's saved checklist");
  const links = container.getByRole("group", { name: "저장한 URL", exact: true }).getByRole("link");
  assert.equal(await links.count(), 2);
  assert.equal(await links.first().getAttribute("href"), `https://example.org/student/${slug}`);
  for (const link of await links.all()) {
    assert.equal(await link.getAttribute("target"), "_blank");
    assert.match(await link.getAttribute("rel"), /noopener/);
    assert.match(await link.getAttribute("rel"), /noreferrer/);
  }
}
async function closeModal() { await modal().getByRole("button", { name: "닫기", exact: true }).click(); }
async function followSavedLink(container, expected) {
  const originalUrl = page.url();
  const popupPromise = page.waitForEvent("popup");
  await container.getByRole("group", { name: "저장한 URL", exact: true }).getByRole("link").first().click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  assert.equal(popup.url(), expected);
  assert.equal(page.url(), originalUrl);
  assert.equal(await popup.evaluate(() => window.opener === null), true);
  await popup.close();
}
async function openStudent(name) { await page.getByRole("button", { name: `${name} 개인 카드 열기`, exact: true }).click(); }
async function back() { await page.getByRole("button", { name: "← 개인 카드", exact: true }).click(); }
async function openActivity(title, byTitle = false) {
  await personalCard(title).getByRole("button", { name: byTitle ? title : "패널에서 열기", exact: true }).click();
  await panel().getByRole("heading", { name: title, exact: true }).waitFor();
}

try {
  await mkdir(path.join(fixture, "app"), { recursive: true });
  for (const dir of ["components", "lib"]) await cp(path.join(sourceRoot, dir), path.join(fixture, dir), { recursive: true });
  await mkdir(path.join(fixture, "tests/fixtures"), { recursive: true });
  await cp(path.join(root, "tests/fixtures/TeacherStudentReviewPage.jsx"), path.join(fixture, "tests/fixtures/TeacherStudentReviewPage.jsx"));
  for (const file of ["package.json", "jsconfig.json"]) await cp(path.join(root, file), path.join(fixture, file));
  for (const name of ["globals.css", "book-sidebar.css"]) await cp(path.join(sourceRoot, sourceRoot === root ? "app" : "", name), path.join(fixture, "app", name));
  for (const file of ["components/BookWorkspace.jsx", "components/BookPersonalDashboard.jsx", "components/BookPersonalDetail.jsx", "components/BookPersonalDetailCards.jsx", "components/BookPersonalItemViewModal.jsx", "components/StudentActivityPanel.jsx", "components/TeacherActivityDemo.jsx", "components/useStudentChecklist.js", "components/RichTextDisplay.jsx", "components/BookItemUrlList.jsx", "app/globals.css", "app/book-sidebar.css"]) {
    report.sourceHashes[file] = createHash("sha256").update(await readFile(path.join(fixture, file))).digest("hex");
  }
  await writeFile(path.join(fixture, "lib/firebase.js"), "export const isFirebaseConfigured = false; export const db = null; export const auth = null; export const storage = null;");
  for (const [file, markers] of [
    ["lib/store.js", ["export async function saveBookDashboardText(actId, user, dashboardText, urls) {", "export async function saveBookEntry(actId, user, answers) {"]],
    ["lib/bookConfirmations.js", ["export async function saveBookConfirmation(input = {}) {"]],
  ]) {
    let source = await readFile(path.join(fixture, file), "utf8");
    for (const marker of markers) {
      assert(source.includes(marker), `Student write instrumentation exists: ${marker}`);
      source = source.replace(marker, `${marker}\n  if (!window.reviewSeeding) window.reviewStudentWrites = (window.reviewStudentWrites || 0) + 1;`);
    }
    await writeFile(path.join(fixture, file), source);
  }
  await writeFile(path.join(fixture, "next.config.mjs"), "export default {devIndicators:false};");
  await writeFile(path.join(fixture, "app/page.jsx"), 'export { default } from "@/tests/fixtures/TeacherStudentReviewPage";');
  await writeFile(path.join(fixture, "app/layout.jsx"), 'import "./globals.css"; import "./book-sidebar.css"; export default function Layout({children}) { return <html lang="ko"><body>{children}</body></html>; }');
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: fixture, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  report.serverPid = server.pid;
  report.origin = origin;
  server.stdout.on("data", value => { logs += value; });
  server.stderr.on("data", value => { logs += value; });
  const deadline = Date.now() + 120000;
  while (!logs.includes("Ready in")) {
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  console.log(`Fixture ready: ${origin}; output: ${output}`);
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.fulfill({ status: 200, contentType: "text/html", body: "<title>Saved student link</title>" }));
  page = await context.newPage();
  page.on("pageerror", error => report.errors.push(error.message));
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(120000);
  await page.goto(origin);
  await page.locator(".teacher-active-detail").getByLabel("답변 내용").fill("교사의 보존할 시연 답변");
  await page.locator(".teacher-active-detail").getByRole("button", { name: "저장", exact: true }).click();
  await flowCard("두 번째 답변 활동").getByRole("button", { name: "활동중", exact: true }).waitFor();
  await openStudent("학생 하나");
  await readonlyAnswer(panel(), response("학생 하나", "첫 번째"), "1/first");
  assert.equal(await page.locator(".teacher-active-detail").count(), 0, "Teacher demo is replaced during review");
  await capture("student-one-first-1280");
  report.checks.push("student card opens first activity of selected step despite resource order and a different active broadcast");

  await followSavedLink(panel(), "https://example.org/student/1/first");
  report.checks.push("saved HTTP(S) links open a separate tab without an opener");

  await openActivity("두 번째 답변 활동", true);
  await readonlyAnswer(panel(), response("학생 하나", "두 번째"), "1/second");
  await page.getByRole("button", { name: "외부 방송 변경", exact: true }).click();
  await readonlyAnswer(panel(), response("학생 하나", "두 번째"), "1/second");
  await capture("student-one-second-1280");
  await panel().getByRole("button", { name: "확대", exact: true }).click();
  await readonlyAnswer(modal(), response("학생 하나", "두 번째"), "1/second");
  await capture("student-one-panel-expanded-1280");
  await followSavedLink(modal(), "https://example.org/student/1/second");
  await closeModal();
  await personalCard("두 번째 답변 활동").getByRole("button", { name: "활동 확대", exact: true }).click();
  await readonlyAnswer(modal(), response("학생 하나", "두 번째"), "1/second");
  await closeModal();
  await openActivity("첫 번째 답변 활동");
  await readonlyAnswer(panel(), response("학생 하나", "첫 번째"), "1/first");
  await personalCard("첫 번째 답변 활동").getByRole("button", { name: "활동 확대", exact: true }).click();
  await readonlyAnswer(modal(), response("학생 하나", "첫 번째"), "1/first");
  await closeModal();
  report.checks.push("title/button choose activities independently; card and panel expansion show matching read-only answers and URLs");

  await personalCard("검토 참고 자료").getByRole("button", { name: "패널에서 열기", exact: true }).click();
  await panel().getByRole("heading", { name: "검토 참고 자료", exact: true }).waitFor();
  for (const checkbox of await panel().getByRole("checkbox").all()) assert(await checkbox.isDisabled());
  assert(await panel().getByRole("checkbox").isChecked(), "Resource review shows student's saved checklist");
  assert.equal(await panel().locator(".book-personal-expand-response").count(), 0);
  assert.equal(await panel().getByRole("button", { name: "저장", exact: true }).count(), 0);
  await capture("student-resource-1280");

  await back();
  await openStudent("학생 둘");
  await readonlyAnswer(panel(), response("학생 둘", "첫 번째"), "2/first");
  await personalCard("첫 번째 답변 활동").getByRole("button", { name: "활동 확대", exact: true }).click();
  await readonlyAnswer(modal(), response("학생 둘", "첫 번째"), "2/first");
  await closeModal();
  assert.equal(await page.getByText(response("학생 하나", "첫 번째"), { exact: true }).count(), 0);
  await page.getByRole("button", { name: "STEP 2", exact: true }).click();
  await readonlyAnswer(panel(), response("학생 둘", "마무리"), "2/final");
  await capture("student-two-step-two-1280");
  await openActivity("아직 작성하지 않은 활동");
  await panel().getByText("아직 입력한 내용이 없습니다.", { exact: true }).waitFor();
  assert.equal(await panel().getByRole("group", { name: "저장한 URL", exact: true }).count(), 0);
  await openActivity("마무리 답변 활동");
  await personalCard("마무리 답변 활동").getByRole("button", { name: "활동 확대", exact: true }).click();
  await page.getByRole("button", { name: "반 전환", exact: true }).evaluate(el => el.click());
  await modal().waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "학생 하나 개인 카드 열기", exact: true }).waitFor();
  assert.equal(await page.getByText(response("학생 둘", "마무리"), { exact: true }).count(), 0);
  await openStudent("학생 하나");
  await panel().getByText("아직 입력한 내용이 없습니다.", { exact: true }).waitFor();
  assert.equal(await panel().getByRole("group", { name: "저장한 URL", exact: true }).count(), 0);
  await capture("other-class-empty-1280");
  report.checks.push("student, step, empty activity, and class switches clear stale responses, links, and expanded dialogs");
  report.checks.push("activity and resource review use the selected student's saved checklist; student check values differ in panel and modal");

  await back();
  await page.getByRole("button", { name: "반 전환", exact: true }).click();
  assert.equal(await page.locator(".teacher-active-detail").getByLabel("답변 내용").inputValue(), "교사의 보존할 시연 답변");
  report.checks.push("leaving review restores the saved teacher demo");
  await openStudent("학생 하나");
  await openActivity("두 번째 답변 활동");
  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await readonlyAnswer(panel(), response("학생 하나", "두 번째"), "1/second");
    await panel().scrollIntoViewIfNeeded();
    await capture(`student-panel-${width}`);
    const narrowHeaders = report.layout.at(-1).detailHeaders.filter(header => header.containerWidth <= 420);
    if (width === 768) assert(narrowHeaders.length > 0, "Tablet captures exercise the narrow teacher detail header");
    for (const header of narrowHeaders) {
      assert.equal(header.columns, 1, "Narrow teacher header places the back button above the student title");
      assert.equal(header.titleWordBreak, "keep-all", "Narrow teacher title preserves Korean words");
      assert(header.scrollWidth <= header.width + 1, "Narrow teacher header must not overflow");
    }
    assert(await panel().locator(".student-activity-detail").evaluate(el => el.scrollWidth <= el.clientWidth + 1), "Review panel content must not overflow");
    await panel().getByRole("button", { name: "확대", exact: true }).click();
    await readonlyAnswer(modal(), response("학생 하나", "두 번째"), "1/second");
    await capture(`student-modal-${width}`);
    assert(await modal().evaluate(el => el.scrollWidth <= el.clientWidth + 1), "Expanded review content must not overflow");
    await closeModal();
  }
  report.checks.push("read-only panels and expanded views work at 375, 768, and 1280 pixels with long saved URLs");
  report.checks.push("narrow teacher detail headers use one column, preserve Korean words, and fit their container");
  assert(report.layout.every(state => state.savedLinks.every(link => link.scrollWidth <= link.width + 1)), "Saved URLs stay within their link bounds");
  report.studentWrites = await page.evaluate(() => window.reviewStudentWrites || 0);
  report.broadcastActivations = await page.evaluate(() => window.reviewActivations || 0);
  assert.equal(report.studentWrites, 0, "Review must not write student records");
  assert.equal(report.broadcastActivations, 0, "Review must not activate a broadcast item");
  assert.deepEqual(report.errors, []);
  report.checks.push("zero student writes, broadcast activation calls, and page errors");
  report.passed = true;
  console.log(`PASS: ${report.checks.join("; ")}`);
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  if (page) {
    await capture("failure").catch(() => {});
    await writeFile(path.join(output, "failure.html"), await page.content()).catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    try { report.cleanup = (await execute("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true })).stdout.trim(); }
    catch (error) { report.cleanup = error.message; }
    if (server.exitCode === null && server.signalCode === null) await new Promise(resolve => { server.once("exit", resolve); setTimeout(resolve, 2000); });
  }
  report.serverStopped = !server || server.exitCode !== null || server.signalCode !== null;
  await writeFile(path.join(output, "server.log"), logs);
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Report: ${path.join(output, "report.json")}`);
}
