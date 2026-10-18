import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(process.env.CLASSROOM_QA_OUTPUT ?? path.join(root, "artifacts/classroom-redesign", `run-${Date.now()}`));
const fixture = path.join(output, `fixture-${process.pid}-${Date.now()}`);
const port = Number(process.env.CLASSROOM_QA_PORT ?? 3186);
const baseURL = `http://127.0.0.1:${port}`;
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const evidence = { fixture, baseURL, checks: [], screenshots: [], errors: [] };
let browser;
let server;
let logs = "";
let activePage;

async function capture(page, name, width = 1280, height = 900) {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {}))));
  const layout = await page.evaluate(() => {
    const selectors = [".books-main", ".book-library-main", ".classroom-detail-region", ".classroom-student-detail", ".student-activity-side", ".student-activity-panel-content", ".student-activity-panel-item", ".student-activity-detail", ".student-activity-detail .book-personal-expand-body", ".classroom-lesson-navigation"];
    return selectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden").map(node => {
      const rect = node.getBoundingClientRect(); const style = getComputedStyle(node);
      return { selector, left: rect.left, right: rect.right, width: rect.width, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, scrollLeft: node.scrollLeft, padding: style.padding, minWidth: style.minWidth };
    }));
  });
  (evidence.layout ??= []).push({ name, width, documentScrollLeft: await page.evaluate(() => document.scrollingElement.scrollLeft), elements: layout });
  if (name.startsWith("student-detail-") || name === "student-mobile-footer-375") {
    const detailRegion = layout.find(row => row.selector === ".classroom-detail-region");
    const body = layout.find(row => row.selector === ".student-activity-detail .book-personal-expand-body");
    assert.ok(detailRegion && body, `${name}: visible student detail region/body required`);
    const outerPanel = layout.find(row => row.selector === ".classroom-student-detail");
    assert.ok(body.width >= outerPanel.width - 4, `${name}: student content fails to fill panel ${body.width}/${outerPanel.width}`);
    if (width >= 1024) assert.ok(body.width >= Math.min(detailRegion.width, 1200) * 0.8, `${name}: student content too narrow ${body.width}/${detailRegion.width}`);
    for (const row of layout.filter(row => [".books-main", ".book-library-main", ".classroom-detail-region", ".classroom-lesson-navigation"].includes(row.selector))) {
      assert.ok(row.scrollWidth <= row.clientWidth + 2, `${name}: internal horizontal overflow ${JSON.stringify(row)}`);
      assert.ok(Math.abs(row.scrollLeft) < 1, `${name}: internal horizontal scroll ${JSON.stringify(row)}`);
    }
    const footer = layout.find(row => row.selector === ".classroom-lesson-navigation");
    assert.ok(footer.left >= -1 && footer.right <= width + 1, `${name}: navigation clipped ${JSON.stringify(footer)}`);
    assert.equal(await page.evaluate(() => document.scrollingElement.scrollLeft), 0);
  }
  (evidence.nextIssues ??= []).push({ name, text: await page.evaluate(() => [...document.querySelectorAll("nextjs-portal")].map(portal => { return [...(portal.shadowRoot?.querySelectorAll("button") ?? [])].map(button => button.textContent).join(" / "); }).join(" | ")) });
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
  assert.ok(overflow.scroll <= overflow.width + 1, `${name}: page overflow ${JSON.stringify(overflow)}`);
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, caret: "initial" });
  evidence.screenshots.push(`${name}.png`);
}

async function openClass(page, name = "3학년 1반") {
  await page.getByRole("button", { name: `${name} 클래스 열기`, exact: true }).click();
  await page.locator(".classroom-workspace").waitFor();
  await page.locator(".classroom-outline").waitFor();
}

async function selectOutline(page, title) {
  const toggle = page.getByRole("button", { name: "수업 차례 펼치기", exact: true });
  if (await toggle.isVisible()) await toggle.click();
  if (await page.locator('.classroom-outline[aria-label="STEP 목록"]').count()) {
    const steps = page.locator(".classroom-step-trigger");
    for (let index = 0; index < await steps.count(); index += 1) {
      await steps.nth(index).click();
      const row = page.locator(".classroom-overview-row").filter({ hasText: title });
      if (await row.count()) { await row.first().click(); return; }
      if (await toggle.isVisible()) await toggle.click();
    }
    throw new Error(`Teacher overview item missing: ${title}`);
  }
  await page.locator(".classroom-outline-item").filter({ hasText: title }).first().click();
}


async function verifyTeacherOutline(page) {
  await page.goto("/qa-classroom");
  await page.locator(".classroom-catalog").waitFor();
  await openClass(page);
  const outline = page.locator('.classroom-outline[aria-label="STEP 목록"]');
  assert.equal(await outline.locator(".classroom-step-trigger").count(), 2);
  assert.equal(await outline.locator(".classroom-outline-item").count(), 0);
  assert.equal(await outline.getByText(/개 항목/).count(), 0);
  for (const width of [1900, 1280, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    const toggle = page.getByRole("button", { name: "수업 차례 펼치기", exact: true });
    if (await toggle.isVisible()) await toggle.click();
    await capture(page, `teacher-step-only-${width}`, width);
    await outline.locator(".classroom-step-trigger").nth(1).click();
    await page.locator(".classroom-overview-row").filter({ hasText: "동료 피드백을 반영한 최종 기획서" }).click();
    await page.locator(".classroom-teacher-detail .student-activity-detail").waitFor();
    assert.equal(await page.locator(".classroom-overview-row").count(), 2);
    await page.locator('.classroom-overview-row[aria-current="page"]').filter({ hasText: "동료 피드백을 반영한 최종 기획서" }).waitFor();
    if (width >= 1100) {
      const list = await page.locator(".classroom-overview-items").boundingBox();
      const detail = await page.getByRole("region", { name: "활동·자료 상세", exact: true }).boundingBox();
      assert.ok(list.x + list.width <= detail.x && Math.abs(list.y - detail.y) < 2, "list and selected detail share two columns");
      const content = await page.locator(".classroom-detail-content").boundingBox();
      const region = await page.locator(".classroom-detail-region").boundingBox();
      assert.ok(content.width >= region.width - 2, "teacher content uses full available width");
    }
    await page.locator(".classroom-overview-row").filter({ hasText: "발표와 상호 점검 안내" }).click();
    await page.locator('.classroom-overview-row[aria-current="page"]').filter({ hasText: "발표와 상호 점검 안내" }).waitFor();
    await page.locator(".classroom-teacher-detail").getByRole("heading", { name: /발표와 상호 점검 안내/ }).waitFor();
    assert.equal(await outline.locator('.classroom-step-trigger[aria-current="step"]').count(), 1);
    assert.equal(await outline.locator(".classroom-outline-item").count(), 0);
    if (await toggle.isVisible()) await toggle.click();
    await outline.locator(".classroom-step-trigger").nth(0).click();
    await page.locator(".classroom-overview-row").filter({ hasText: "안전한 도구 설계 체크리스트" }).click();
    await page.locator(".classroom-teacher-detail").waitFor();
    if (await toggle.isVisible()) await toggle.click();
    assert.ok(await page.locator(".classroom-overview-row").first().evaluate(node => node.getBoundingClientRect().height >= 88), "item rows have STEP-card height");
    const palette = await page.locator(".classroom-item-detail").evaluate(node => ({ green: getComputedStyle(node).getPropertyValue("--primary").trim(), orange: getComputedStyle(node).getPropertyValue("--teacher-orange").trim() }));
    assert.deepEqual(palette, { green: "#2f6f3e", orange: "#b45b20" });
    const actionColors = await page.locator(".classroom-item-tools .book-teacher-card-actions > button").evaluateAll(buttons => buttons.map(button => ({ background: getComputedStyle(button).backgroundColor, color: getComputedStyle(button).color })));
    assert.deepEqual(actionColors, Array.from({ length: 2 }, () => ({ background: "rgb(237, 246, 237)", color: "rgb(36, 85, 47)" })));
    await capture(page, `teacher-step-selected-detail-${width}`, width);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "클래스 목록", exact: true }).click();
  await page.getByRole("button", { name: "학생", exact: true }).click();
  await openClass(page);
  assert.ok(await page.locator(".classroom-outline-item").count() > 0);
  await selectOutline(page, "우리 수업의 문제 정의 작성");
  await page.locator(".student-activity-detail").waitFor();
  await capture(page, "student-outline-preserved-1280");
  assert.deepEqual(evidence.errors, []);
  evidence.checks.push("teacher outline has only STEP buttons, keeps current STEP selected for activity/resource details, works at 375/768/1280; student item navigation preserved");
}

async function verifyLanding(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "관리자 로그인", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  for (const width of [375, 768, 1280, 1900]) {
    await capture(page, `landing-hydrated-${width}`, width);
    const layout = await page.locator(".landing").evaluate(landing => {
      const hero = landing.querySelector(".hero");
      const card = hero.querySelector(".hero-glass").getBoundingClientRect();
      return {
        background: getComputedStyle(landing).backgroundImage,
        size: getComputedStyle(landing).backgroundSize,
        alignment: getComputedStyle(hero).textAlign,
        extraImage: getComputedStyle(hero, "::after").content,
        center: card.x + card.width / 2,
        viewportCenter: innerWidth / 2,
        backgroundBottom: landing.getBoundingClientRect().bottom,
        viewportHeight: innerHeight,
      };
    });
    assert.match(layout.background, /teacher-collaboration-hero.png/);
    assert.equal(layout.size, "cover");
    assert.ok(layout.backgroundBottom >= layout.viewportHeight, `background reaches viewport bottom at ${width}px`);
    assert.equal(layout.alignment, "center");
    assert.equal(layout.extraImage, "none");
    assert.ok(Math.abs(layout.center - layout.viewportCenter) <= 1, `centered landing copy at ${width}px`);
  }
  evidence.checks.push("landing illustration fills background and copy stays centered at 375/768/1280/1900px");
  evidence.visibleIssueBadges = await page.evaluate(() => [...document.querySelectorAll("nextjs-portal")].flatMap(portal => [...(portal.shadowRoot?.querySelectorAll("button") ?? [])]).filter(button => button.checkVisibility() && /[1-9]\d*\s*Issues?/i.test(button.textContent)).length);
  assert.equal(evidence.visibleIssueBadges, 0);
  assert.deepEqual(evidence.consoleIssues ?? [], []);
  evidence.checks.push("landing actual administrator modal opens/closes after hydration; caret-preserving screenshots produce no hydration errors or issue badge");
}

async function verifyPortfolioAndHelp(page) {
  await page.goto("/qa-portfolio");
  await openClass(page, "1차시 문제 발견");
  await page.getByRole("button", { name: "김학생 포트폴리오 만들기", exact: true }).click();
  const report = page.getByRole("dialog", { name: "학생별 차시 보고서", exact: true });
  const downloadButton = report.getByRole("button", { name: "HTML 내려받기", exact: true });
  await downloadButton.waitFor();
  await page.waitForFunction(() => ![...document.querySelectorAll("button")].find(button => button.textContent.trim() === "HTML 내려받기")?.disabled);
  const downloadEvent = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadEvent;
  await download.saveAs(path.join(output, "student-portfolio.html"));
  assert.match(await readFile(path.join(output, "student-portfolio.html"), "utf8"), /김학생/);
  await capture(page, "portfolio-student-1280");
  await report.getByRole("button", { name: "차시 보고서 닫기", exact: true }).click();
  await page.getByRole("button", { name: "역할 전환", exact: true }).click();
  await page.getByRole("button", { name: "참여자 활동 보기", exact: true }).click();
  await page.getByRole("button", { name: "김학생 개인 카드 열기", exact: true }).click();
  await page.getByRole("button", { name: "김학생 포트폴리오 만들기", exact: true }).click();
  await report.getByRole("button", { name: "차시 보고서 닫기", exact: true }).click();
  await page.goto("/qa-broadcast");
  await page.getByRole("button", { name: "교사 보고서 열기", exact: true }).click();
  await report.getByRole("button", { name: "발표 모드", exact: true }).click();
  await report.getByRole("button", { name: "발표 종료", exact: true }).waitFor();
  await page.getByTestId("broadcast-state").getByText("broadcasting", { exact: true }).waitFor();
  await capture(page, "portfolio-teacher-broadcast-1280");
  await report.getByRole("button", { name: "발표 종료", exact: true }).click();
  await page.getByTestId("broadcast-state").getByText("idle", { exact: true }).waitFor();
  await report.getByRole("button", { name: "차시 보고서 닫기", exact: true }).click();
  evidence.checks.push("student portfolio actual HTML download; teacher participant review and portfolio broadcast start/stop");
  await page.goto("/qa-help");
  await page.getByRole("button", { name: "학생 화면", exact: true }).click();
  await page.getByRole("button", { name: "Vercel 확대", exact: true }).click();
  const help = page.getByRole("dialog");
  await help.getByText("질문을 선택하면 답변이 표시됩니다.", { exact: true }).waitFor();
  await capture(page, "help-empty-1280");
  await help.getByRole("button", { name: /배포 제한/ }).click();
  await help.getByText("하루 배포 수: 100회", { exact: true }).waitFor();
  assert.equal(await help.locator('a[href="https://vercel.com/"]').count(), 1);
  await capture(page, "help-selected-1280");
  await capture(page, "help-selected-375", 375);
  await help.getByRole("button", { name: "기존 내용", exact: true }).click();
  await help.getByText("배포당 빌드 시간: 최대 45분", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Vercel 확대", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Vercel 확대", exact: true }).evaluate(node => node === document.activeElement), true);
  evidence.checks.push("read-only help question selection, parent URL, close and responsive layout");
  await page.setViewportSize({ width: 1280, height: 900 });
}

async function run(page) {
  await page.goto("/qa-classroom");
  await page.locator(".classroom-catalog").waitFor();
  for (const width of [375, 768, 1280, 1900]) await capture(page, `catalog-${width}`, width);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openClass(page);
  await page.getByText("1반 · 함께 만드는 AI 수업 도구", { exact: true }).first().waitFor({ state: "attached" });
  await capture(page, "teacher-overview-1280");
  await page.locator(".classroom-step-trigger").nth(1).click();
  await selectOutline(page, "동료 피드백을 반영한 최종 기획서");
  await page.locator(".classroom-teacher-detail").waitFor();
  await capture(page, "teacher-activity-1280");
  await page.locator(".classroom-item-tools").getByRole("button", { name: "발표 모드", exact: true }).click();
  const presentation = page.getByRole("alertdialog", { name: /발표 모드/ });
  await presentation.waitFor();
  await presentation.getByRole("button", { name: "다음", exact: true }).click();
  await capture(page, "teacher-presentation-1280");
  await presentation.getByRole("button", { name: "발표 종료", exact: true }).click();
  await presentation.waitFor({ state: "detached" });
  evidence.checks.push("teacher STEP and item navigation plus presentation open/next/close");
  await page.getByRole("button", { name: "클래스 목록", exact: true }).click();
  await openClass(page, "3학년 2반");
  await page.getByText("2반 · 함께 만드는 AI 수업 도구", { exact: true }).first().waitFor({ state: "attached" });
  assert.equal(await page.getByText("1반 · 함께 만드는 AI 수업 도구", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "클래스 목록", exact: true }).click();
  await openClass(page);
  evidence.checks.push("catalog open/back/class switch preserves correct project");
  await page.getByText("프로젝트 관리 · 순서 편집 · 휴지통", { exact: true }).click();
  await page.getByRole("button", { name: "프로젝트 편집", exact: true }).click();
  await page.getByPlaceholder("예: 우리 동네 생태 탐구").waitFor();
  await capture(page, "teacher-project-editor-1280");
  await page.getByRole("button", { name: "프로젝트 저장", exact: true }).first().click();
  await page.getByPlaceholder("예: 우리 동네 생태 탐구").waitFor({ state: "detached" });
  evidence.checks.push("teacher project editor opens and saves");
  await page.getByRole("button", { name: "반 관리하기", exact: true }).click();
  await page.locator(".class-mgr-create input").fill("디자인 검증반");
  await capture(page, "teacher-class-manager-1280");
  await page.locator(".class-mgr-create button[type=submit]").click();
  await page.locator(".modal-class-manager").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "클래스 목록", exact: true }).click();
  await page.getByRole("button", { name: "디자인 검증반 클래스 열기", exact: true }).waitFor();
  evidence.checks.push("teacher class creation persisted and listed");
  await page.getByRole("button", { name: "학생", exact: true }).click();
  await page.locator(".classroom-catalog").waitFor();
  await openClass(page);
  await page.getByRole("button", { name: "나의 STEP 카드", exact: true }).click();
  await page.locator(".classroom-participants-view").waitFor();
  await page.locator(".book-student-step-card-trigger").first().click();
  await page.locator(".classroom-lesson-navigation").waitFor();
  evidence.checks.push("student STEP cards entry and exit");
  await selectOutline(page, "안전한 도구 설계 체크리스트");
  const detail = page.locator(".student-activity-detail");
  await detail.waitFor();
  await detail.getByRole("button", { name: "확인", exact: true }).click();
  await page.getByRole("alertdialog", { name: "미완료 할 일" }).waitFor();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await detail.getByRole("button", { name: "모두 체크하기", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll(".student-activity-detail input[type=checkbox]")].every(input => input.checked));
  await detail.getByRole("button", { name: "확인", exact: true }).click();
  evidence.checks.push("student incomplete checklist blocked; checked checklist saves and confirms");
  await selectOutline(page, "우리 수업의 문제 정의 작성");
  const answer = detail.getByRole("textbox", { name: "답변 내용", exact: true });
  await answer.fill("학생들이 도움을 요청할 때 사용할 안전한 질문 안내 도구를 만들겠습니다.");
  await page.waitForFunction(() => window.__classroomQA.entries("cl1-activity-1").some((entry) => entry.dashboardText?.includes("안전한 질문 안내")));
  await selectOutline(page, "안전한 도구 설계 체크리스트");
  await selectOutline(page, "우리 수업의 문제 정의 작성");
  assert.match(await answer.inputValue(), /안전한 질문 안내/);
  evidence.checks.push("real student input auto-saved to mock store and restored on item revisit");
  for (const width of [1900, 1280, 768, 375]) await capture(page, `student-detail-${width}`, width);
  const sequence = page.getByLabel("수업 순서 이동", { exact: true });
  await sequence.getByRole("button", { name: "다음 →", exact: true }).click();
  await sequence.getByRole("button", { name: "← 이전", exact: true }).click();
  await capture(page, "student-mobile-footer-375", 375);
  evidence.checks.push("375px real next/previous buttons remain clickable with help pill");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/qa-workflow");
  await page.locator(".classroom-lesson").waitFor();
  await capture(page, "workflow-student-1280");
  await selectOutline(page, "생각 정리 활동");
  await page.getByRole("button", { name: "원격 자료 활성화", exact: true }).click();
  await page.locator(".student-activity-detail").getByRole("heading", { name: "체크리스트 자료", exact: true }).waitFor();
  await page.locator(".classroom-outline-item.is-selected").filter({ hasText: "체크리스트 자료" }).waitFor();
  evidence.checks.push("student remote active item updates outline and detail");
  await page.getByRole("button", { name: "교사 보기", exact: true }).click();
  await page.getByTestId("mode").getByText("teacher").waitFor();
  await capture(page, "workflow-teacher-1280");
  await page.getByRole("button", { name: "참여자 활동 보기", exact: true }).click();
  await page.getByRole("button", { name: "학생 하나 개인 카드 열기", exact: true }).click();
  await selectOutline(page, "두 번째 자료");
  await page.locator(".student-activity-detail").getByRole("heading", { name: "두 번째 자료", exact: true }).waitFor();
  await page.locator(".classroom-step-trigger.is-selected").nth(0).waitFor();
  await capture(page, "teacher-cross-step-resource-review-1280");
  evidence.checks.push("teacher participant review cross-STEP resource stays selected in right detail");
  evidence.checks.push("existing BookWorkflowPage renders both teacher and student lesson shell");
  await verifyPortfolioAndHelp(page);
  await page.goto("/");
  for (const width of [1280, 375]) await capture(page, `landing-${width}`, width);
  await page.evaluate(() => { sessionStorage.setItem("dev_role_override", "admin"); window.dispatchEvent(new Event("role-change")); });
  await page.goto("/admin");
  await page.locator(".admin-main").waitFor();
  const firstUser = page.locator(".student-row-main").first();
  if (await firstUser.count()) await firstUser.click();
  for (const width of [1280, 375]) await capture(page, `admin-${width}`, width);
  evidence.checks.push("landing and admin responsive page geometry");
  const issue = page.locator("nextjs-portal").getByRole("button", { name: /Issue/i }).first();
  if (await issue.count()) {
    await issue.click();
    await page.screenshot({ path: path.join(output, "next-issue-diagnostic.png"), fullPage: true, caret: "initial" });
    evidence.issueDiagnostic = await page.locator("nextjs-portal").innerText().catch(() => "");
  }
  assert.deepEqual(evidence.errors, []);
}

try {
  await mkdir(output, { recursive: true });
  await mkdir(fixture, { recursive: true });
  await Promise.all(["app", "components", "lib", "public", "tests/fixtures"].map((entry) => cp(path.join(root, entry), path.join(fixture, entry), { recursive: true })));
  await Promise.all(["package.json", "jsconfig.json"].map((entry) => cp(path.join(root, entry), path.join(fixture, entry))));
  await writeFile(path.join(fixture, "lib/firebase.js"), "export const isFirebaseConfigured = false;\nexport const db = null;\nexport const auth = null;\nexport const storage = null;\n");
  const config = await readFile(path.join(root, "next.config.mjs"), "utf8");
  await writeFile(path.join(fixture, "next.config.mjs"), config.replace("reactStrictMode: true,", "reactStrictMode: true, devIndicators: false,"));
  for (const [route, component] of [["qa-classroom", "ClassroomRedesignPage"], ["qa-workflow", "BookWorkflowPage"], ["qa-portfolio", "BookPortfolioPage"], ["qa-help", "HelpSectionsPage"], ["qa-broadcast", "PortfolioPresentationPage"]]) {
    await mkdir(path.join(fixture, "app", route), { recursive: true });
    await writeFile(path.join(fixture, "app", route, "page.jsx"), `export { default } from "@/tests/fixtures/${component}";\n`);
  }
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--port", String(port), "--hostname", "127.0.0.1"], { cwd: fixture, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (chunk) => { logs += chunk; });
  server.stderr.on("data", (chunk) => { logs += chunk; });
  const deadline = Date.now() + 120000;
  while (!logs.includes("Ready in")) {
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(`Dev server failed: ${logs}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ baseURL });
  await context.route(/https?:\/\/[^/]*(googleapis|firebaseio|firebaseapp)\./, (route) => route.abort());
  activePage = await context.newPage();
  activePage.setDefaultTimeout(10000);
  activePage.setDefaultNavigationTimeout(120000);
  activePage.on("console", message => { if (["warning", "error"].includes(message.type())) (evidence.consoleIssues ??= []).push({ type: message.type(), text: message.text(), url: activePage.url() }); });
  activePage.on("pageerror", (error) => evidence.errors.push(error.message));
  if (process.env.CLASSROOM_QA_FOCUS === "landing") await verifyLanding(activePage);
  else if (process.env.CLASSROOM_QA_FOCUS === "teacher-outline") await verifyTeacherOutline(activePage);
  else if (process.env.CLASSROOM_QA_FOCUS === "extra") await verifyPortfolioAndHelp(activePage);
  else await run(activePage);
  evidence.status = "passed";
} catch (error) {
  evidence.status = "failed";
  evidence.failure = error.stack;
  if (activePage) {
    evidence.drawerGeometry = await activePage.locator(".book-help-drawer").evaluateAll(nodes => nodes.map(node => { const rect = node.getBoundingClientRect(); const style = getComputedStyle(node); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, padding: style.padding, minWidth: style.minWidth, minHeight: style.minHeight }; })).catch(() => []);
    await activePage.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
    await writeFile(path.join(output, "failure.html"), await activePage.content().catch(() => ""));
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    if (process.platform === "win32") await new Promise((resolve) => spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).on("close", resolve));
    else server.kill("SIGTERM");
  }
  const sourceFiles = ["app/layout.js", "app/globals.css", "app/book-sidebar.css", "app/classroom-theme.css", "app/classroom-workspace.css", "app/classroom-catalog.css", "components/BooksHome.jsx", "components/BookWorkspace.jsx", "components/ClassroomLesson.jsx", "components/ClassroomOutline.jsx", "components/ClassroomLessonOverview.jsx", "components/StudentActivityPanel.jsx", "components/BookPersonalDashboard.jsx", "components/ClassroomHelpReader.jsx", "components/BookHelpNoteModal.jsx"];
  evidence.sourceHashes = [];
  for (const name of sourceFiles) {
    const [source, copied] = await Promise.all([readFile(path.join(root, name)), readFile(path.join(fixture, name))]);
    const hash = (value) => createHash("sha256").update(value).digest("hex");
    evidence.sourceHashes.push({ name, source: hash(source), fixture: hash(copied), matches: hash(source) === hash(copied) });
  }
  if (evidence.sourceHashes.some((entry) => !entry.matches)) { evidence.status = "failed"; evidence.staleSource = true; process.exitCode = 1; }
  if (process.env.CLASSROOM_QA_KEEP_FIXTURE !== "1") {
    const relative = path.relative(output, fixture);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Unsafe fixture cleanup: ${fixture}`);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try { await rm(fixture, { recursive: true, force: true }); evidence.fixtureRemoved = true; break; }
      catch (error) { if (attempt === 9) evidence.cleanupError = error.message; else await new Promise(resolve => setTimeout(resolve, 500)); }
    }
  }
  await writeFile(path.join(output, "dev-server.log"), logs);
  await writeFile(path.join(output, "results.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
}
