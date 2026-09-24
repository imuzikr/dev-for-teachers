import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const execute = promisify(execFile);
const root = process.cwd();
const output = path.join(root, "artifacts/teacher-activity-demo", String(Date.now()));
const fixture = path.join(output, "fixture");
let server, browser, page, logs = "";
const errors = [];
const checks = [];

async function freePort() {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}
async function clipboardFails(fail) {
  await page.evaluate(fail => Object.defineProperty(navigator.clipboard, "writeText", {
    configurable: true, value: async text => { if (fail) throw new Error("denied"); window.copiedText = text; },
  }), fail);
}
const card = title => page.locator(".book-project-flow-detail-list > article").filter({ hasText: title });
async function open(title) { await card(title).getByRole("button", { name: title, exact: true }).click(); }
const modal = () => page.getByRole("dialog");
async function close() { await modal().getByRole("button", { name: "닫기", exact: true }).click(); }
async function save() {
  await modal().getByRole("button", { name: "저장", exact: true }).click();
  await modal().waitFor({ state: "hidden" });
}

try {
  await mkdir(path.join(fixture, "app"), { recursive: true });
  for (const dir of ["components", "lib", "tests/fixtures"]) await cp(path.join(root, dir), path.join(fixture, dir), { recursive: true });
  for (const file of ["package.json", "jsconfig.json", "app/globals.css", "app/book-sidebar.css"]) await cp(path.join(root, file), path.join(fixture, file));
  await writeFile(path.join(fixture, "lib/firebase.js"), "export const isFirebaseConfigured = false; export const db = null; export const auth = null; export const storage = null;");
  for (const [file, marker] of [["lib/store.js", "export async function saveBookDashboardText(actId, user, dashboardText, urls) {"], ["lib/bookConfirmations.js", "export async function saveBookConfirmation(input = {}) {"]]) {
    const source = await readFile(path.join(fixture, file), "utf8");
    assert(source.includes(marker), `Student write instrumentation is available in ${file}`);
    await writeFile(path.join(fixture, file), source.replace(marker, `${marker}\n  window.studentWrites = (window.studentWrites || 0) + 1;`));
  }
  await writeFile(path.join(fixture, "next.config.mjs"), "export default {devIndicators:false};");
  await writeFile(path.join(fixture, "app/page.jsx"), 'export { default } from "@/tests/fixtures/TeacherActivityDemoPage";');
  await writeFile(path.join(fixture, "app/layout.jsx"), 'import "./globals.css"; import "./book-sidebar.css"; export default function Layout({children}) { return <html lang="ko"><body>{children}</body></html>; }');
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: fixture, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", value => { logs += value; });
  server.stderr.on("data", value => { logs += value; });
  const deadline = Date.now() + 120000;
  while (!logs.includes("Ready in")) {
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  console.log(`Fixture ready: ${origin}`);
  if (process.env.AGENT_BROWSER_CLI) {
    const session = `teacher-demo-${port}`;
    const agent = (...args) => execute(process.execPath, [process.env.AGENT_BROWSER_CLI, "--session", session, ...args], { windowsHide: true, timeout: 60000 });
    try {
      await agent("open", origin);
      console.log((await agent("snapshot", "-i")).stdout);
      await agent("screenshot", path.join(output, "initial.png"));
      assert(!(await agent("errors")).stdout.trim(), "Initial browser page errors");
    } finally { await agent("close"); }
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(120000);
  await page.goto(origin);
  await clipboardFails(false);
  await card("복사 자료").getByRole("button", { name: "자료 복사", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "복사했습니다." }).waitFor();
  assert.equal(await page.evaluate(() => window.copiedText), "복사 자료\n학생에게 보여줄 내용");
  await clipboardFails(true);
  await card("복사 자료").getByRole("button", { name: "자료를 복사했습니다", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "복사하지 못했어요" }).waitFor();
  await clipboardFails(false);
  checks.push("teacher resource copy reports success and permission failure");

  await open("답변 활동");
  await modal().getByLabel("답변 내용").fill("교사가 작성한 시연 답변");
  await save();
  await open("답변 활동");
  assert.equal(await modal().getByLabel("답변 내용").inputValue(), "교사가 작성한 시연 답변");
  await close();
  await card("답변 활동").getByRole("button", { name: "활동 전", exact: true }).click();
  const teacherPanel = page.locator(".teacher-active-detail");
  assert.equal(await teacherPanel.getByLabel("답변 내용").inputValue(), "교사가 작성한 시연 답변");
  await teacherPanel.getByLabel("답변 내용").fill("패널에서 수정한 시연 답변");
  await teacherPanel.getByRole("button", { name: "저장", exact: true }).click();
  checks.push("answer edits/save are shared by teacher card and active sidebar");

  await open("템플릿 활동");
  await modal().getByLabel("학교", { exact: true }).fill("시연학교");
  await modal().getByLabel("이름", { exact: true }).fill("김선생");
  await modal().getByRole("button", { name: "복사하기", exact: true }).click();
  assert.equal(await page.evaluate(() => window.copiedText), "시연학교에서 김선생과 활동합니다.");
  await save();
  await open("템플릿 자료");
  await modal().getByLabel("주제", { exact: true }).fill("환경 보호");
  await modal().getByRole("button", { name: "모두 체크하기", exact: true }).click();
  await save();
  assert.equal(await page.evaluate(() => window.studentWrites || 0), 0, "Teacher demos must not write student records");
  await page.reload();
  await open("답변 활동");
  assert.equal(await modal().getByLabel("답변 내용").inputValue(), "패널에서 수정한 시연 답변");
  await close();
  await open("템플릿 활동");
  assert.equal(await modal().getByLabel("학교", { exact: true }).inputValue(), "시연학교");
  assert.equal(await modal().getByLabel("이름", { exact: true }).inputValue(), "김선생");
  await close();
  await open("템플릿 자료");
  assert.equal(await modal().getByLabel("주제", { exact: true }).inputValue(), "환경 보호");
  assert(await modal().getByRole("checkbox").isChecked());
  checks.push("answers, activity/resource template values and checklists survive reload");
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: path.join(output, `teacher-template-${width}.png`), fullPage: true });
    assert(await modal().evaluate(el => el.scrollWidth <= el.clientWidth + 1), "Expanded content must not overflow horizontally");
  }
  await close();
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const switchLabel of ["교사 계정 전환", "반 전환"]) {
    await page.getByRole("button", { name: switchLabel, exact: true }).click();
    await open("템플릿 활동");
    assert.equal(await modal().getByLabel("학교", { exact: true }).inputValue(), "");
    await close();
    await page.getByRole("button", { name: switchLabel, exact: true }).click();
    await open("템플릿 활동");
    assert.equal(await modal().getByLabel("학교", { exact: true }).inputValue(), "시연학교");
    await close();
  }
  checks.push("teacher accounts and classes have independent saved demo values");

  await page.getByRole("button", { name: "학생 하나 개인 카드 열기", exact: true }).click();
  await page.locator(".book-personal-detail-list > article").filter({ hasText: "답변 활동" }).getByRole("button", { name: "활동 확대", exact: true }).click();
  assert.equal(await modal().getByLabel("답변 내용").count(), 0);
  await close();
  await page.getByRole("button", { name: "학생 보기", exact: true }).click();
  const studentCards = page.locator(".book-personal-detail-list > article");
  await studentCards.filter({ hasText: "템플릿 활동" }).getByRole("button", { name: "패널에서 열기", exact: true }).click();
  const studentPanel = page.getByRole("complementary", { name: "선택한 활동과 자료" });
  assert.equal(await studentPanel.getByLabel("학교", { exact: true }).inputValue(), "");
  await clipboardFails(false);
  await studentCards.filter({ hasText: "복사 자료" }).getByRole("button", { name: "자료 복사", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "복사했습니다." }).waitFor();
  await clipboardFails(true);
  await studentCards.filter({ hasText: "복사 자료" }).getByRole("button", { name: "자료를 복사했습니다", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "복사하지 못했어요" }).waitFor();
  await studentCards.filter({ hasText: "답변 활동" }).getByRole("button", { name: "패널에서 열기", exact: true }).click();
  await studentPanel.getByLabel("답변 내용").fill("학생의 실제 답변");
  await studentPanel.getByRole("button", { name: "저장", exact: true }).click();
  await studentCards.filter({ hasText: "답변 활동" }).getByRole("button", { name: "확인됨", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.studentWrites), 2);
  checks.push("student records remain read-only for teachers; student copy feedback and answer saving work");
  assert.deepEqual(errors, []);
  console.log(`PASS: ${checks.join("; ")}`);
} catch (error) {
  if (page) await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) await execute("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).catch(() => {});
  await writeFile(path.join(output, "server.log"), logs);
  await writeFile(path.join(output, "report.json"), JSON.stringify({ checks, errors }, null, 2));
}
