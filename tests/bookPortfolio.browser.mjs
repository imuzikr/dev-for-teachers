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
const output = path.join(root, "artifacts", `portfolio-${Date.now()}`);
const fixture = path.join(output, "fixture");
const report = { checks: [], screenshots: [], geometry: [], errors: [], downloads: [], passed: false };
let server;
let browser;
let page;
let logs = "";

async function capture(name, fullPage = true) {
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(output, `${name}.png`);
  await page.locator('[aria-label="포트폴리오 검증 제어"]').evaluateAll(nodes => nodes.forEach(node => node.style.visibility = "hidden"));
  await page.screenshot({ path: file, fullPage });
  await page.locator('[aria-label="포트폴리오 검증 제어"]').evaluateAll(nodes => nodes.forEach(node => node.style.visibility = "visible"));
  report.screenshots.push(file);
  return file;
}

async function waitForServer() {
  const until = Date.now() + 120000;
  while (!logs.includes("Ready in")) {
    if (server.exitCode !== null || Date.now() > until) throw new Error(logs);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function freePort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function setupFixture() {
  await mkdir(path.join(fixture, "app"), { recursive: true });
  for (const dir of ["components", "lib"]) await cp(path.join(root, dir), path.join(fixture, dir), { recursive: true });
  for (const name of ["package.json", "jsconfig.json"]) await cp(path.join(root, name), path.join(fixture, name));
  for (const name of ["globals.css", "book-sidebar.css"]) await cp(path.join(root, "app", name), path.join(fixture, "app", name));
  await cp(path.join(root, "tests/fixtures/BookPortfolioPage.jsx"), path.join(fixture, "app/page.jsx"));
  await writeFile(path.join(fixture, "lib/firebase.js"), "export const isFirebaseConfigured=false; export const db=null; export const auth=null; export const storage=null;");
  await cp(path.join(root, "lib/bookPortfolioEntries.js"), path.join(fixture, "lib/bookPortfolioEntriesActual.js"));
  await writeFile(path.join(fixture, "lib/bookPortfolioEntries.js"), `import { loadBookPortfolioEntries as load } from "./bookPortfolioEntriesActual";
export async function loadBookPortfolioEntries(args) {
  if (window.portfolioFailLoads) throw new Error("fixture source failure");
  return load(args);
}`);
  await writeFile(path.join(fixture, "app/layout.jsx"), 'import "./globals.css";import "./book-sidebar.css";export default function Layout({children}){return <html lang="ko"><body>{children}</body></html>}');
  await writeFile(path.join(fixture, "next.config.mjs"), "export default {devIndicators:false};");
}

async function openPortfolioForStudent(waitReady = true) {
  await clickFinalStep();
  const trigger = page.getByRole("button", { name: "김학생 포트폴리오 만들기", exact: true });
  await trigger.waitFor();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "학생별 차시 보고서", exact: true });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "HTML 내려받기", exact: true }).waitFor({ state: "visible" });
  if (waitReady) await assertReadyFrame();
  return dialog;
}

async function clickFinalStep() {
  const tabs = page.locator(".books-step-tabs button:not(.book-portfolio-trigger)");
  await tabs.last().click();
}

async function assertPortfolioTabRow(accessibleName, screenshotPrefix) {
  const tabs = page.locator(".books-step-tabs:has(.book-portfolio-trigger)").first();
  await tabs.waitFor();
  const trigger = tabs.locator(".book-portfolio-trigger").first();
  await trigger.waitFor();
  assert.equal(await trigger.textContent(), "포트폴리오 만들기", "Portfolio visible label matches requested text");
  assert.equal(await page.getByRole("button", { name: accessibleName, exact: true }).count(), 1, `Portfolio accessible name is ${accessibleName}`);
  const order = await tabs.locator("button").evaluateAll((buttons) => buttons.map((button) => ({
    label: button.textContent?.trim(),
    isPortfolio: button.classList.contains("book-portfolio-trigger"),
    y: button.getBoundingClientRect().top,
  })));
  assert(order.length >= 2, "Step row includes at least one Step and the portfolio action");
  assert.equal(order.at(-1)?.isPortfolio, true, "Portfolio action is the final button in the Step row");
  assert(order.slice(0, -1).every((button) => !button.isPortfolio && button.label?.startsWith("STEP")), "Only real Step buttons appear before portfolio action");
  assert(Math.max(...order.map((button) => button.y)) - Math.min(...order.map((button) => button.y)) < 8, "Portfolio action stays aligned with Step buttons");
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 920 });
    await tabs.waitFor();
    await trigger.scrollIntoViewIfNeeded();
    const layout = await tabs.evaluate(row => {
      const box = row.getBoundingClientRect();
      const buttons = [...row.querySelectorAll("button")].map(button => button.getBoundingClientRect());
      const final = buttons.at(-1);
      return { left: box.left, right: box.right, finalLeft: final.left, finalRight: final.right, tops: buttons.map(button => button.top) };
    });
    assert(layout.finalLeft >= layout.left - 1 && layout.finalRight <= layout.right + 1, "Portfolio pill is fully reachable at " + width);
    assert(Math.max(...layout.tops) - Math.min(...layout.tops) < 8, "All Step pills remain in one row at " + width);
    const file = path.join(output, `${screenshotPrefix}-step-tabs-${width}.png`);
    await tabs.screenshot({ path: file });
    report.screenshots.push(file);
  }
  await page.setViewportSize({ width: 1280, height: 920 });
  report.checks.push(`${screenshotPrefix} Step row keeps portfolio action after the final Step`);
}

async function saveStudentCaptureThroughPanel() {
  await clickFinalStep();
  const card = page.locator("article.book-personal-activity-card").filter({ hasText: "최종 캡처 활동" });
  await card.getByRole("button", { name: "패널에서 열기", exact: true }).click();
  const panel = page.locator(".student-activity-panel-content").filter({ hasText: "최종 캡처 활동" });
  await panel.getByRole("textbox", { name: "답변 내용", exact: true }).fill("브라우저에서 저장한 캡처 설명\nreload 이후에도 유지되어야 합니다.");
  const imageFile = path.join(output, "upload-source.png");
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 540;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fbfaf3";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#2f6f3e";
    context.fillRect(48, 48, 864, 92);
    context.fillStyle = "#e6f1ea";
    context.fillRect(72, 188, 816, 260);
    context.fillStyle = "#1f2e25";
    context.font = "bold 44px sans-serif";
    context.fillText("학생 캡처 예시", 88, 112);
    context.font = "28px sans-serif";
    context.fillText("앱 화면 구성과 결과 설명", 108, 270);
    context.fillText("960 × 540 테스트 이미지", 108, 330);
    context.strokeStyle = "#2f6f3e";
    context.lineWidth = 8;
    context.strokeRect(72, 188, 816, 260);
    return canvas.toDataURL("image/png");
  });
  await writeFile(imageFile, Buffer.from(dataUrl.split(",")[1], "base64"));
  await panel.locator('input[aria-label="첨부 이미지 선택"]').setInputFiles(imageFile);
  await panel.getByRole("img", { name: "첨부 이미지 1", exact: true }).waitFor();
  await panel.getByRole("button", { name: "저장", exact: true }).click();
  await expectSavedText("브라우저에서 저장한 캡처 설명");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "STEP 1", exact: true }).waitFor();
  await clickFinalStep();
  const reloadedCard = page.locator("article.book-personal-activity-card").filter({ hasText: "최종 캡처 활동" });
  await reloadedCard.getByRole("button", { name: "패널에서 열기", exact: true }).click();
  await page.locator(".student-activity-panel-content").getByRole("img", { name: "첨부 이미지 1", exact: true }).waitFor();
  report.checks.push("Student image upload saves through the real panel and survives reload");
}

async function expectSavedText(text) {
  await page.waitForFunction((expected) => {
    const state = window.portfolioQA;
    return JSON.stringify(state?.entries ?? {}).includes(expected);
  }, text);
}

async function assertReadyFrame() {
  const frameLocator = page.frameLocator('iframe[title="학생별 차시 보고서 미리보기"]');
  await frameLocator.getByRole("heading", { name: "1차시 문제 발견 보고서" }).waitFor();
  await frameLocator.getByText("학교 포트폴리오 프로젝트").waitFor();
  await frameLocator.getByText("긴 한글 계획 활동").waitFor();
  await frameLocator.getByText("<img src=x onerror=alert(1)>").waitFor();
  await frameLocator.getByText("긴 프롬프트 원문을 그대로 보존합니다").last().waitFor();
  return frameLocator;
}

async function assertLessonTwoFrame() {
  const frameLocator = page.frameLocator('iframe[title="학생별 차시 보고서 미리보기"]');
  await frameLocator.getByRole("heading", { name: "2차시 해결 방안 보고서" }).waitFor();
  await frameLocator.getByText("학교 포트폴리오 프로젝트").waitFor();
  const bodyText = await frameLocator.locator("body").textContent();
  assert(bodyText.includes("2차시에서만 작성한 해결 방안입니다."), "Second lesson body includes its own answer");
  assert(bodyText.includes("https://example.org/lesson-two"), "Second lesson body includes its own URL");
  assert(!bodyText.includes("브라우저에서 저장한 캡처 설명"), "Second lesson body excludes first lesson capture text");
  assert(!bodyText.includes("긴 한글 계획 활동"), "Second lesson body excludes first lesson activity title");
  return frameLocator;
}

async function downloadPortfolio(dialog) {
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "HTML 내려받기", exact: true }).click();
  const download = await downloadPromise;
  const file = path.join(output, await download.suggestedFilename());
  await download.saveAs(file);
  report.downloads.push(file);
  return file;
}

async function htmlText(file) {
  return await readFile(file, "utf8");
}

async function assertOfflineHtml(file) {
  const html = await htmlText(file);
  assert(html.includes("&lt;img src=x onerror=alert(1)&gt;"), "Hostile markup is escaped in HTML");
  assert(!html.includes("javascript:alert"), "Unsafe javascript URL is excluded");
  assert(html.includes("교내용 · 학생별 차시 보고서"), "Report label identifies teacher lesson report");
  assert(html.includes("<h1>1차시 문제 발견 보고서</h1>"), "Downloaded HTML uses lesson name as cover title");
  assert(html.includes("portfolio-project-title\">학교 포트폴리오 프로젝트"), "Project title is separate from lesson report title");
  assert(html.includes("https://example.org/student-safe"), "Scheme-less student URL is normalized safely");
  assert(html.includes("긴 프롬프트 원문을 그대로 보존합니다. ".repeat(22).trim()), "Long prompt body is preserved in full");
  assert(html.includes("브라우저에서 저장한 캡처 설명"), "Student-saved capture text is exported");
  assert(html.includes("data:image/jpeg;base64,"), "Downloaded HTML embeds capture data");
  assert(!html.includes("다른 학생 기록은 섞이면 안 됩니다."), "Other student data is isolated");
  const offlineContext = await browser.newContext({ viewport: { width: 1280, height: 1000 }, offline: true });
  await offlineContext.route(/^https?:\/\//, (route) => route.abort());
  const offline = await offlineContext.newPage();
  await offline.goto(`file://${file.replaceAll("\\", "/")}`);
  await offline.getByRole("heading", { name: "1차시 문제 발견 보고서" }).waitFor();
  await offline.screenshot({ path: path.join(output, "portfolio-offline-html.png"), fullPage: true });
  const linkProtocols = await offline.locator("a").evaluateAll((links) => links.map((link) => new URL(link.href).protocol));
  assert(linkProtocols.every((protocol) => protocol === "https:"), "Offline links remain safe HTTP(S) links");
  const imageSizes = await offline.locator("img").evaluateAll((images) => images.map((image) => ({ width: image.naturalWidth, height: image.naturalHeight })));
  assert(imageSizes.length > 0 && imageSizes.every((image) => image.width > 0 && image.height > 0), "Offline embedded images decode");
  await offlineContext.close();
  report.screenshots.push(path.join(output, "portfolio-offline-html.png"));
}

async function printDownloadedHtml(file) {
  const printed = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await printed.goto(`file://${file.replaceAll("\\", "/")}`);
  await printed.emulateMedia({ media: "print" });
  await printed.screenshot({ path: path.join(output, "portfolio-print-preview.png"), fullPage: true });
  const pdfPath = path.join(output, "portfolio-print.pdf");
  await printed.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true });
  report.screenshots.push(path.join(output, "portfolio-print-preview.png"));
  report.downloads.push(pdfPath);
  let pdfjs = null;
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch (error) {
    report.pdf = { warning: error instanceof Error ? error.message : String(error) };
  }
  if (pdfjs) {
    const data = new Uint8Array(await readFile(pdfPath));
    const document = await pdfjs.getDocument({ data, disableWorker: true }).promise;
    const first = await document.getPage(1);
    const texts = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const pdfPage = await document.getPage(number);
      const text = await pdfPage.getTextContent();
      texts.push(text.items.map(item => item.str).join(" "));
    }
    const strings = texts.join(" ");
    const { createCanvas } = require("@napi-rs/canvas");
    for (let number = 1; number <= document.numPages; number += 1) {
      const pdfPage = await document.getPage(number);
      const viewport = pdfPage.getViewport({ scale: 1.2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const png = path.join(output, "pdf-page-" + number + ".png");
      await writeFile(png, canvas.toBuffer("image/png"));
      report.screenshots.push(png);
    }
    const viewBox = first.getViewport({ scale: 1 }).viewBox;
    report.pdf = { pages: document.numPages, firstPage: viewBox, includesTitle: strings.includes("1차시 문제 발견 보고서"), includesLongPromptTail: strings.replace(/\s+/g, "").includes("긴프롬프트원문을그대로보존합니다.".repeat(22)) };
    assert(report.pdf.includesTitle, "PDF text contains lesson report title");
    assert(report.pdf.includesLongPromptTail, "PDF includes prompt beyond first page");
    assert(strings.replace(/\s+/g, "").includes("reload이후에도유지되어야합니다."), "PDF includes final activity text");
    assert(Math.abs(viewBox[2] - 595) < 8 && Math.abs(viewBox[3] - 842) < 8, "PDF first page is A4-sized");
  }
  await printed.close();
}

async function assertResponsiveModal(dialog, screenshotPrefix = "portfolio-modal") {
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 920 });
    await dialog.waitFor();
    const box = await dialog.boundingBox();
    assert(box, `Modal is measurable at ${width}`);
    const overflow = await dialog.evaluate((element) => ({
      modal: element.getBoundingClientRect().toJSON(),
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      toolbar: element.querySelector(".book-portfolio-toolbar")?.getBoundingClientRect().toJSON(),
      frame: element.querySelector("iframe")?.getBoundingClientRect().toJSON(),
    }));
    assert(Math.abs(box.x) <= 1, `Modal starts at viewport left edge ${width}`);
    assert(Math.abs(box.y) <= 1, `Modal starts at viewport top edge ${width}`);
    assert(Math.abs(box.width - width) <= 1, `Modal fills viewport width ${width}`);
    assert(Math.abs(box.height - 920) <= 1, `Modal fills viewport height ${width}`);
    assert(overflow.scrollWidth <= overflow.clientWidth + 1, `Modal has no horizontal overflow ${width}`);
    const frameWidth = await dialog.locator('iframe[title="학생별 차시 보고서 미리보기"]').evaluate((frame) => ({
      scrollWidth: frame.contentDocument?.documentElement.scrollWidth ?? 0,
      clientWidth: frame.contentDocument?.documentElement.clientWidth ?? 0,
    }));
    assert(frameWidth.scrollWidth <= frameWidth.clientWidth + 1, `Iframe document has no horizontal overflow ${width}`);
    report.geometry.push({ width, box, overflow });
    await capture(`${screenshotPrefix}-${width}`, true);
  }
}

async function assertNativePrint(dialog) {
  await page.evaluate(() => {
    const frame = document.querySelector('iframe[title="학생별 차시 보고서 미리보기"]');
    frame.contentWindow.__portfolioPrintCalls = [];
    frame.contentWindow.print = () => frame.contentWindow.__portfolioPrintCalls.push("print");
    frame.contentWindow.focus = () => frame.contentWindow.__portfolioPrintCalls.push("focus");
  });
  await dialog.getByRole("button", { name: "PDF로 저장", exact: true }).click();
  const calls = await page.evaluate(() => {
    const frame = document.querySelector('iframe[title="학생별 차시 보고서 미리보기"]');
    return frame.contentWindow.__portfolioPrintCalls ?? [];
  });
  assert(calls.includes("print"), "Print button calls iframe print");
  report.checks.push("Native PDF button reaches the preview iframe print path");
}

try {
  await setupFixture();
  const port = await freePort();
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: fixture, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (data) => { logs += data; });
  server.stderr.on("data", (data) => { logs += data; });
  await waitForServer();

  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_PATH ? undefined : "chrome", executablePath: process.env.PLAYWRIGHT_PATH, headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 920 }, acceptDownloads: true });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}`, { timeout: 120000 });

  await page.getByRole("button", { name: "STEP 1", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "김학생 포트폴리오 만들기", exact: true }).count(), 1, "Portfolio button is visible from Step 1");
  await assertPortfolioTabRow("김학생 포트폴리오 만들기", "portfolio-student");
  await page.getByRole("button", { name: "목적 전환", exact: true }).click();
  await page.getByRole("button", { name: "STEP 3", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "김학생 포트폴리오 만들기", exact: true }).count(), 0, "Training classes hide portfolio export");
  await page.getByRole("button", { name: "목적 전환", exact: true }).click();
  report.checks.push("Portfolio action sits beside Step tabs for internal classes and hides for training classes");

  await page.getByRole("button", { name: "마지막 Step 추가", exact: true }).click();
  await page.getByRole("button", { name: "STEP 3", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "김학생 포트폴리오 만들기", exact: true }).count(), 1, "Portfolio remains available after appending a Step");
  await page.getByRole("button", { name: "STEP 4", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "김학생 포트폴리오 만들기", exact: true }).count(), 1, "Dynamically appended final Step keeps portfolio export");
  await page.getByRole("button", { name: "마지막 Step 재정렬", exact: true }).click();
  await page.getByRole("button", { name: "STEP 3", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "김학생 포트폴리오 만들기", exact: true }).count(), 1, "Portfolio remains available after Step reorder");
  await page.getByRole("button", { name: "STEP 4", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "김학생 포트폴리오 만들기", exact: true }).count(), 1, "Reordered final Step keeps portfolio export");
  await assertPortfolioTabRow("김학생 포트폴리오 만들기", "portfolio-student-reordered");
  report.checks.push("Dynamic append and reorder keep portfolio action as the last Step-row item");

  await saveStudentCaptureThroughPanel();
  await page.evaluate(() => { window.portfolioFailLoads = true; });
  const retryDialog = await openPortfolioForStudent(false);
  await retryDialog.getByText("기록을 불러오지 못했어요.").waitFor();
  assert.equal(await retryDialog.getByRole("button", { name: "HTML 내려받기", exact: true }).isDisabled(), true, "Failed source read disables download");
  await page.evaluate(() => { window.portfolioFailLoads = false; });
  await retryDialog.getByRole("button", { name: "다시 시도", exact: true }).click();
  await assertReadyFrame();
  await retryDialog.getByRole("button", { name: "차시 보고서 닫기", exact: true }).click();
  report.checks.push("Failed portfolio reads show retry and do not download empty HTML");

  const dialog = await openPortfolioForStudent();
  await assertResponsiveModal(dialog);
  await assertNativePrint(dialog);
  const htmlFile = await downloadPortfolio(dialog);
  assert.equal(path.basename(htmlFile), "차시보고서-1차시 문제 발견-김학생-학교 포트폴리오 프로젝트.html");
  await assertOfflineHtml(htmlFile);
  await printDownloadedHtml(htmlFile);

  await page.frameLocator('iframe[title="학생별 차시 보고서 미리보기"]').getByRole("link").first().focus();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("button", { name: "김학생 포트폴리오 만들기", exact: true }).evaluate(node => node === document.activeElement), true, "Iframe Escape returns focus to trigger");
  report.checks.push("Escape from inside preview restores focus to the portfolio trigger");

  await page.getByRole("button", { name: "2차시 선택", exact: true }).click();
  await page.waitForFunction(() => window.portfolioQA.classItem.id === "portfolio-lesson-two");
  const staleLessonButton = page.getByRole("button", { name: "김학생 포트폴리오 만들기", exact: true });
  await staleLessonButton.waitFor();
  assert.equal(await staleLessonButton.isDisabled(), true, "Mismatched selected lesson and project disables report generation");
  await page.getByRole("button", { name: "2차시 전환", exact: true }).click();
  await page.waitForFunction(() => window.portfolioQA.project.classId === "portfolio-lesson-two");
  const lessonTwoDialog = await openPortfolioForStudent(false);
  await assertLessonTwoFrame();
  await assertResponsiveModal(lessonTwoDialog, "portfolio-lesson-two-modal");
  const lessonTwoHtml = await downloadPortfolio(lessonTwoDialog);
  assert.equal(path.basename(lessonTwoHtml), "차시보고서-2차시 해결 방안-김학생-학교 포트폴리오 프로젝트.html");
  const lessonTwoMarkup = await htmlText(lessonTwoHtml);
  assert(lessonTwoMarkup.includes("2차시에서만 작성한 해결 방안입니다."), "Second lesson export contains its own answer");
  assert(!lessonTwoMarkup.includes("브라우저에서 저장한 캡처 설명"), "Second lesson export excludes first lesson capture");
  assert.notEqual(path.basename(htmlFile), path.basename(lessonTwoHtml), "Lesson report filenames differ by lesson");
  await capture("portfolio-lesson-two-report");
  await lessonTwoDialog.getByRole("button", { name: "차시 보고서 닫기", exact: true }).click();
  await lessonTwoDialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "1차시 전환", exact: true }).click();
  await page.waitForFunction(() => window.portfolioQA.project.classId === "portfolio-lesson-one");
  await openPortfolioForStudent();
  await assertReadyFrame();
  await page.keyboard.press("Escape");
  report.checks.push("Lesson reports stay scoped to the selected class session and use lesson-specific filenames");

  await page.getByRole("button", { name: "역할 전환", exact: true }).click();
  await clickFinalStep();
  const disabledTeacherButton = page.getByRole("button", { name: "포트폴리오 만들기", exact: true });
  await disabledTeacherButton.waitFor();
  assert.equal(await disabledTeacherButton.isDisabled(), true, "Teacher portfolio is disabled before selecting a student");
  await assertPortfolioTabRow("포트폴리오 만들기", "portfolio-teacher-disabled");
  await page.getByRole("button", { name: "김학생 개인 카드 열기", exact: true }).click();
  const teacherCard = page.locator("article.book-personal-activity-card").filter({ hasText: "최종 캡처 활동" });
  await teacherCard.getByRole("button", { name: "패널에서 열기", exact: true }).click();
  const teacherImages = page.locator('.student-activity-panel-content [aria-label="학생 첨부 이미지"]');
  await teacherImages.waitFor();
  assert.equal(await page.locator('.student-activity-panel-content input[type="file"]').count(), 0);
  await capture("portfolio-teacher-capture-readonly");
  await assertPortfolioTabRow("김학생 포트폴리오 만들기", "portfolio-teacher-selected");
  await page.getByRole("button", { name: "김학생 포트폴리오 만들기", exact: true }).click();
  await assertReadyFrame();
  await capture("portfolio-teacher-selected");
  assert.equal(await page.locator(".book-item-images button").count(), 0, "Teacher review does not expose image editing controls");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "김학생 포트폴리오 만들기", exact: true }).waitFor();
  report.checks.push("Teacher export requires selected student, uses that student's records, and image view is read-only");
  await page.getByRole("button", { name: "← 개인 카드", exact: true }).click();
  await page.getByRole("button", { name: "이학생 개인 카드 열기", exact: true }).click();
  await page.getByRole("button", { name: "이학생 포트폴리오 만들기", exact: true }).click();
  const otherFrame = page.frameLocator('iframe[title="학생별 차시 보고서 미리보기"]');
  await otherFrame.getByText("다른 학생 기록은 섞이면 안 됩니다.", { exact: true }).waitFor();
  assert.equal(await otherFrame.getByText("브라우저에서 저장한 캡처 설명", { exact: false }).count(), 0);
  assert((await otherFrame.getByText("저장된 내용이 아직 없어요.", { exact: true }).count()) > 0);
  await capture("portfolio-missing-entries");
  await page.getByRole("button", { name: "목적 전환", exact: true }).click();
  await page.getByRole("dialog", { name: "학생별 차시 보고서", exact: true }).waitFor({ state: "hidden" });
  report.checks.push("Changing selected student isolates content; missing entries remain visible and class switch closes old report");

  await page.getByRole("button", { name: "역할 전환", exact: true }).click();
  await page.getByRole("button", { name: "빈 프로젝트", exact: true }).click();
  await page.waitForFunction(() => window.portfolioQA.project.steps.length === 0);
  assert.equal(await page.locator(".book-portfolio-trigger").count(), 0, "Empty project has no portfolio export action");
  report.checks.push("Empty projects do not expose a misleading portfolio export");

  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log("PASS", report.checks);
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  if (page) await capture("portfolio-failure").catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) await promisify(execFile)("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).catch(() => {});
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "server.log"), logs);
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log("Report:", path.join(output, "report.json"));
}
