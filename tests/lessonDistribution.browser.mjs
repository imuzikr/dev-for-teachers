import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = process.cwd();
const output = path.join(root, "artifacts", `lesson-distribution-${Date.now()}`);
const fixture = path.join(output, "fixture");
const report = { checks: [], layouts: [], screenshots: [], errors: [], externalRequests: [], issues: [] };
let server, browser, page, logs = "";
const firstName = "과학 탐구 활동지.txt";
const longName = "우리 반 함께하는 과학 탐구 활동과 관찰 결과를 기록하는 아주 긴 이름의 학습 자료.html";
const firstContent = "local distribution fixture: original text";

async function freePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}
async function role(value) { await page.getByLabel("테스트 역할").selectOption(value); }
async function switchClass(value) {
  // The parent can change scope while a modal is open; its background control is inert to pointer input.
  await page.getByLabel("테스트 반").selectOption(value, { force: true });
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}
async function openTeacher() { await page.getByRole("button", { name: "수업 준비", exact: true }).click(); }
async function closeModal() { await page.getByRole("button", { name: "닫기", exact: true }).click(); }
async function save() {
  await page.getByRole("button", { name: "배포 목록 저장", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "배포 목록을 저장했습니다." }).waitFor();
  assert(await page.getByRole("button", { name: "배포 목록 저장", exact: true }).isDisabled());
}
async function capture(kind) {
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.locator(".lesson-file-manager").evaluate(modal => {
      const bounds = modal.getBoundingClientRect();
      const rows = [...modal.querySelectorAll(".lesson-file-row")];
      return {
        overflow: modal.scrollWidth > modal.clientWidth + 1,
        outsideViewport: bounds.left < -1 || bounds.right > innerWidth + 1,
        rows: rows.map(row => {
          const identity = row.querySelector(".lesson-file-identity").getBoundingClientRect();
          const actions = row.querySelector(".lesson-row-actions").getBoundingClientRect();
          return { overflow: row.scrollWidth > row.clientWidth + 1, stacked: actions.top >= identity.bottom - 1 };
        }),
        buttons: [...modal.querySelectorAll(".lesson-row-actions button, .lesson-distribution-toolbar button")].map(button => ({
          text: button.textContent, height: button.getBoundingClientRect().height,
          clipped: button.scrollWidth > button.clientWidth + 1,
        })),
      };
    });
    const file = path.join(output, `${kind}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    report.screenshots.push(file);
    report.layouts.push({ kind, width, ...metrics });
    assert(!metrics.overflow && !metrics.outsideViewport, `${kind} ${width}: modal overflow`);
    assert(metrics.rows.every(row => !row.overflow), `${kind} ${width}: row overflow`);
    assert(metrics.buttons.every(button => button.height >= 43 && !button.clipped), `${kind} ${width}: button size or clipping`);
    if (width === 375) assert(metrics.rows.every(row => row.stacked), `${kind}: mobile commands must stack`);
  }
}

try {
  await mkdir(path.join(fixture, "app"), { recursive: true });
  await access(path.join(root, "lib/lessonDownloads.js"));
  for (const dir of ["components", "lib"]) await cp(path.join(root, dir), path.join(fixture, dir), { recursive: true });
  await mkdir(path.join(fixture, "tests/fixtures"), { recursive: true });
  for (const file of ["package.json", "jsconfig.json", "app/globals.css", "app/book-sidebar.css", "tests/fixtures/LessonDistributionPage.jsx"])
    await cp(path.join(root, file), path.join(fixture, file));
  await writeFile(path.join(fixture, "lib/firebase.js"), "export const isFirebaseConfigured = false; export const db = null; export const auth = null; export const storage = null;");
  await writeFile(path.join(fixture, "next.config.mjs"), "export default { devIndicators: false };");
  await writeFile(path.join(fixture, "app/page.jsx"), 'export { default } from "@/tests/fixtures/LessonDistributionPage";');
  await writeFile(path.join(fixture, "app/layout.jsx"), 'import "./globals.css"; import "./book-sidebar.css"; export default function Layout({children}) { return <html lang="ko"><body>{children}</body></html>; }');
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  report.origin = origin;
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
  for (const key of Object.keys(env)) if (/FIREBASE|FIRESTORE|GCLOUD_PROJECT/.test(key)) delete env[key];
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: fixture, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", value => { logs += value; });
  server.stderr.on("data", value => { logs += value; });
  const deadline = Date.now() + 120000;
  while (!logs.includes("Ready in")) {
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  console.log(`Mock browser fixture: ${origin}`);
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, serviceWorkers: "block" });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (["blob:", "data:"].includes(url.protocol) || url.origin === origin) return route.continue();
    report.externalRequests.push(url.origin);
    return route.abort();
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => report.errors.push(error.message));
  await page.goto(origin, { timeout: 120000 });
  await page.getByLabel("테스트 역할").waitFor();
  assert.equal(await page.getByRole("button", { name: "자료 내려받기", exact: true }).count(), 0);
  report.checks.push("student entry hidden before publication");

  await role("teacher");
  await openTeacher();
  await page.getByLabel("자료 파일", { exact: true }).setInputFiles([
    { name: firstName, mimeType: "text/plain", buffer: Buffer.from(firstContent) },
    { name: longName, mimeType: "text/html", buffer: Buffer.from("<h1>Local original</h1>") },
  ]);
  await page.getByRole("status").filter({ hasText: "2개 파일을 저장했습니다." }).waitFor();
  const firstSelection = page.getByRole("checkbox", { name: firstName + " 배포 선택", exact: true });
  await firstSelection.check();
  await closeModal();
  const discardDialog = page.getByRole("alertdialog", { name: "배포 변경 취소" });
  await discardDialog.waitFor();
  await discardDialog.getByRole("button", { name: "취소", exact: true }).click();
  assert(await firstSelection.isChecked());
  if (!await page.getByRole("dialog").evaluate(modal => modal.contains(document.activeElement))) {
    report.issues.push("Canceling the dirty-selection confirmation loses focus outside the lesson modal; immediate Escape does not reopen the guard.");
    await firstSelection.focus();
  }
  await page.keyboard.press("Escape");
  await discardDialog.waitFor();
  await discardDialog.getByRole("button", { name: "변경 취소하고 닫기", exact: true }).click();
  await openTeacher();
  assert.equal(await firstSelection.isChecked(), false);
  report.checks.push("dirty close guard: cancel retains selection, Escape prompts, confirm discards");
  await firstSelection.check();
  await page.getByRole("checkbox", { name: longName + " 배포 선택", exact: true }).check();
  await save();
  await capture("teacher");
  await closeModal();
  await openTeacher();
  assert(await firstSelection.isChecked());
  assert(await page.getByRole("button", { name: firstName + " 삭제", exact: true }).isDisabled());
  report.checks.push("selection requires save, persists on reopen, shared file deletion disabled");

  await firstSelection.uncheck();
  await switchClass("qa-class-b");
  await openTeacher();
  assert.equal(await firstSelection.isChecked(), false);
  await firstSelection.check();
  await save();
  await switchClass("qa-class-a");
  await openTeacher();
  assert(await firstSelection.isChecked());
  assert(await page.getByRole("checkbox", { name: longName + " 배포 선택", exact: true }).isChecked());
  await closeModal();
  report.checks.push("class switch closes teacher modal and discards pending edits without leaking selections");

  await role("student");
  await page.getByRole("button", { name: "자료 내려받기", exact: true }).click();
  assert.equal(await page.locator(".lesson-file-row").count(), 2);
  assert(await page.getByRole("button", { name: "선택 내려받기 (0)", exact: true }).isDisabled());
  await page.getByRole("checkbox", { name: "전체 선택", exact: true }).check();
  assert(await page.getByRole("button", { name: "선택 내려받기 (2)", exact: true }).isEnabled());
  const downloads = [];
  const collect = download => downloads.push(download);
  page.on("download", collect);
  await page.getByRole("button", { name: "선택 내려받기 (2)", exact: true }).click();
  const downloadDeadline = Date.now() + 15000;
  while (downloads.length < 2 && Date.now() < downloadDeadline) await new Promise(resolve => setTimeout(resolve, 100));
  page.off("download", collect);
  assert.equal(downloads.length, 2);
  const expected = new Map([[firstName, firstContent], [longName, "<h1>Local original</h1>"]]);
  for (const item of downloads) {
    assert(expected.has(item.suggestedFilename()));
    assert.equal(await readFile(await item.path(), "utf8"), expected.get(item.suggestedFilename()));
    expected.delete(item.suggestedFilename());
  }
  assert.equal(expected.size, 0);
  report.checks.push("multi-selection downloads both original files with exact names and bytes");
  await page.getByRole("checkbox", { name: "전체 선택", exact: true }).uncheck();
  await capture("student");
  const downloadEvent = page.waitForEvent("download");
  await page.locator(".lesson-file-row").filter({ hasText: firstName }).getByRole("button", { name: "다운로드", exact: true }).click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), firstName);
  assert.equal(await readFile(await download.path(), "utf8"), firstContent);
  report.checks.push("student selection controls and single download preserve filename and bytes");
  await switchClass("qa-class-b");
  await page.getByRole("button", { name: "자료 내려받기", exact: true }).click();
  assert.equal(await page.locator(".lesson-file-row").count(), 1);
  assert.equal(await page.getByText(longName, { exact: true }).count(), 0);
  await switchClass("qa-class-empty");
  assert.equal(await page.getByRole("button", { name: "자료 내려받기", exact: true }).count(), 0);
  report.checks.push("student class switch closes modal, scopes files, and hides empty-class entry");

  await switchClass("qa-class-b");
  await role("teacher");
  await openTeacher();
  await firstSelection.uncheck();
  await save();
  await closeModal();
  await role("student");
  assert.equal(await page.getByRole("button", { name: "자료 내려받기", exact: true }).count(), 0);
  await switchClass("qa-class-a");
  await page.getByRole("button", { name: "자료 내려받기", exact: true }).click();
  assert.equal(await page.locator(".lesson-file-row").count(), 2);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  report.checks.push("unpublishing affects only its class; Escape closes student modal");
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.issues, [], "UI findings recorded in report.json");
  report.result = "PASS";
  console.log(`PASS: ${report.checks.join("; ")}. Screenshots: ${output}`);
} catch (error) {
  report.result = "FAIL";
  report.failure = error.stack;
  if (page) await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) await new Promise(resolve => spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).on("close", resolve));
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "server.log"), logs);
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
}
