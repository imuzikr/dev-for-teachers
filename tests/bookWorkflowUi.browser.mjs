import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function removeWithRetry(target) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await rm(target, { force: true, recursive: true });
      return true;
    } catch (error) {
      if (error?.code !== "EBUSY" || attempt === 29) return false;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return true;
}

function assertInsideDirectory(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to remove path outside fixture output directory: ${child}`);
  }
}

function cardWithText(page, selector, text) {
  return page.locator(selector).filter({ hasText: text }).first();
}

async function assertFooterButtons(card, expectedNames) {
  const buttons = await card.locator("footer button").evaluateAll((items) => items.map((item) => item.textContent.trim()));
  assert.deepEqual(buttons, expectedNames);
}

async function assertTeacherActiveButton(card, expected) {
  const label = expected ? "활동중" : "비활동";
  await assertFooterButtons(card, [label, "발표 모드"]);
  assert.equal(await card.getByRole("button", { name: label, exact: true }).getAttribute("aria-pressed"), expected ? "true" : "false");
  await assertCurrentActivity(card, expected);
}

async function clickTeacherActivation(card, expected) {
  await card.getByRole("button", { name: expected ? "활동중" : "비활동", exact: true }).click();
}

async function assertCurrentActivity(card, expected) {
  assert.equal(await card.evaluate((element) => element.classList.contains("is-current-activity")), expected);
  assert.equal(await card.getAttribute("aria-current"), expected ? "true" : null);
  if (expected) {
    const style = await card.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { borderColor: computed.borderColor, boxShadow: computed.boxShadow };
    });
    assert.notEqual(style.boxShadow, "none");
    assert.match(style.boxShadow, /inset/);
    assert.notEqual(style.borderColor, "rgba(0, 0, 0, 0)");
  }
}

async function assertTeacherFooterGeometry(card, { withinViewport = false } = {}) {
  const buttons = await card.locator("footer.book-teacher-card-actions button").evaluateAll((items) => items.map((button) => {
    const rect = button.getBoundingClientRect();
    return {
      text: button.textContent.trim(),
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
    };
  }));
  assert.equal(buttons.length, 2);
  const [active, presentation] = buttons;
  assert.ok(["비활동", "활동중"].includes(active.text));
  assert.equal(presentation.text, "발표 모드");
  assert.ok(Math.abs(active.width - presentation.width) <= 2);
  assert.ok(Math.abs(active.top - presentation.top) <= 2);
  assert.ok(active.right <= presentation.left || presentation.right <= active.left);
  if (withinViewport) {
    const viewport = await card.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    for (const button of buttons) {
      assert.ok(button.left >= 0, `${button.text} left edge is outside viewport`);
      assert.ok(button.right <= viewport.width, `${button.text} right edge is outside viewport`);
      assert.ok(button.top >= 0, `${button.text} top edge is outside viewport`);
      assert.ok(button.bottom <= viewport.height, `${button.text} bottom edge is outside viewport`);
    }
  }
}

async function assertTeacherFootersEqualGeometry(page, options = {}) {
  const footers = await page.locator("footer.book-teacher-card-actions").all();
  for (const footer of footers) {
    const card = footer.locator("xpath=ancestor::article[1]");
    await assertTeacherFooterGeometry(card, options);
  }
}

async function assertNoButtonOverlap(page) {
  const geometry = await page.locator(".book-personal-card-actions").evaluateAll((footers) => footers.map((footer) => {
    const buttons = Array.from(footer.querySelectorAll("button")).map((button) => {
      const rect = button.getBoundingClientRect();
      return { text: button.textContent.trim(), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height };
    });
    const overlaps = [];
    for (let i = 0; i < buttons.length; i += 1) {
      for (let j = i + 1; j < buttons.length; j += 1) {
        const a = buttons[i];
        const b = buttons[j];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps.push([a.text, b.text]);
      }
    }
    return { overlaps, minHeight: Math.min(...buttons.map((button) => button.height)) };
  }));
  assert.deepEqual(geometry.flatMap((item) => item.overlaps), []);
}

async function screenshotApp(page, screenshotPath) {
  const toolbar = page.locator(".qa-workflow-toolbar");
  await toolbar.evaluate((element) => {
    element.dataset.previousDisplay = element.style.display;
    element.style.display = "none";
  });
  try {
    await page.locator(".books-main").screenshot({ path: screenshotPath });
  } finally {
    await toolbar.evaluate((element) => {
      element.style.display = element.dataset.previousDisplay ?? "";
      delete element.dataset.previousDisplay;
    });
  }
}

async function collapseTeacherSidebars(page) {
  const libraryToggle = page.getByRole("button", { name: "개발자실 패널 접기", exact: true });
  if (await libraryToggle.count()) await libraryToggle.click();
  const helpToggle = page.getByRole("button", { name: "도움 글 패널 접기", exact: true });
  if (await helpToggle.count()) await helpToggle.click();
}

function reorderCard(page, key) {
  return page.locator(`.book-project-flow-detail-list > article[data-reorder-key="${key}"]`).first();
}

function reorderHandle(page, title) {
  return page.getByRole("button", { name: `${title} 순서 이동`, exact: true });
}

async function detailOrderKeys(page) {
  return page.locator(".book-project-flow-detail-list > article[data-reorder-key]").evaluateAll((cards) => (
    cards.map((card) => card.dataset.reorderKey)
  ));
}

async function detailOrderTitles(page) {
  return page.locator(".book-personal-detail-list:visible > article.book-personal-activity-card").evaluateAll((cards) => (
    cards.map((card) => card.querySelector(".book-personal-activity-copy strong")?.textContent.trim())
  ));
}

async function assertDetailOrder(page, expectedKeys, expectedTitles) {
  assert.deepEqual(await detailOrderKeys(page), expectedKeys);
  assert.deepEqual(await detailOrderTitles(page), expectedTitles);
}

async function assertSidebarOrder(page, stepTitle, expectedTitles) {
  const nav = page.getByRole("navigation", { name: "프로젝트 Step 흐름", exact: true });
  const stepButton = nav.getByRole("button", { name: new RegExp(stepTitle) }).first();
  await stepButton.waitFor();
  if (await stepButton.getAttribute("aria-expanded") !== "true") await stepButton.click({ position: { x: 20, y: 20 } });
  const list = page.getByRole("list", { name: `${stepTitle} 활동과 자료 순서`, exact: true }).first();
  await list.waitFor();
  const titles = await list.locator("li strong").evaluateAll((items) => items.map((item) => item.textContent.trim()));
  assert.deepEqual(titles, expectedTitles);
}

async function assertStudentHasNoReorderControls(page) {
  assert.equal(await page.locator(".book-card-order-handle").count(), 0);
  assert.equal(await page.locator(".book-project-flow-detail-list > article[data-reorder-key]").count(), 0);
}

async function dragByHandleToCard(page, title, targetKey) {
  await reorderHandle(page, title).dragTo(reorderCard(page, targetKey));
}

async function pointerMoveHandleToCard(page, title, targetKey) {
  const handle = reorderHandle(page, title);
  const target = reorderCard(page, targetKey);
  await handle.evaluate((button) => button.scrollIntoView({ block: "center", inline: "center" }));
  const handleBox = await handle.boundingBox();
  const targetBox = await target.boundingBox();
  assert.ok(handleBox, `Missing handle box for ${title}`);
  assert.ok(targetBox, `Missing target box for ${targetKey}`);
  const client = await page.context().newCDPSession(page);
  const start = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 };
  const end = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...start, id: 1 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...end, id: 1 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await client.detach();
}

async function showTouchDropIndicator(page, title, targetKey) {
  const handle = reorderHandle(page, title);
  const target = reorderCard(page, targetKey);
  await handle.evaluate((button) => button.scrollIntoView({ block: "center", inline: "center" }));
  const handleBox = await handle.boundingBox();
  const targetBox = await target.boundingBox();
  assert.ok(handleBox, `Missing handle box for ${title}`);
  assert.ok(targetBox, `Missing target box for ${targetKey}`);
  const client = await page.context().newCDPSession(page);
  const start = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  };
  const point = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  };
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...start, id: 2 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...point, id: 2 }] });
  assert.equal(await target.getAttribute("data-drop-target"), "true");
  return async () => {
    await client.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await client.detach();
  };
}

async function attemptCrossStepDrop(page) {
  await page.getByRole("button", { name: "Step 열기", exact: true }).click();
  await assertDetailOrder(page, ["activity:activity-1", "resource:resource-1"], ["생각 정리 활동", "체크리스트 자료"]);
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  try {
    await reorderHandle(page, "체크리스트 자료").dispatchEvent("dragstart", { dataTransfer });
    await page.getByRole("button", { name: "Step 2 열기", exact: true }).click();
    await reorderCard(page, "activity:activity-2").dispatchEvent("dragover", { dataTransfer });
    await reorderCard(page, "activity:activity-2").dispatchEvent("drop", { dataTransfer });
  } finally {
    await dataTransfer.dispose();
  }
  await assertDetailOrder(page, ["activity:activity-2", "resource:resource-2"], ["두 번째 활동", "두 번째 자료"]);
  await page.getByRole("button", { name: "Step 열기", exact: true }).click();
  await assertDetailOrder(page, ["activity:activity-1", "resource:resource-1"], ["생각 정리 활동", "체크리스트 자료"]);
}

async function captureVisibleSidebarConfirm(page, screenshotRoot, name, width, height) {
  await page.setViewportSize({ width, height });
  const confirm = page.locator(".student-activity-detail").getByRole("button", { name: "확인", exact: true });
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
  await confirm.scrollIntoViewIfNeeded();
  await confirm.evaluate(button => button.scrollIntoView({ block: "center", behavior: "instant" }));
  const geometry = await confirm.evaluate((button) => {
    const buttonRect = button.getBoundingClientRect();
    const panel = button.closest(".student-activity-panel-content");
    const panelRect = panel.getBoundingClientRect();
    return {
      button: { top: buttonRect.top, bottom: buttonRect.bottom, left: buttonRect.left, right: buttonRect.right },
      panel: { top: panelRect.top, bottom: panelRect.bottom, left: panelRect.left, right: panelRect.right },
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  assert.ok(geometry.button.top >= geometry.panel.top, `${name} confirm top is clipped by panel`);
  assert.ok(geometry.button.bottom <= geometry.panel.bottom, `${name} confirm bottom is clipped by panel`);
  assert.ok(geometry.button.left >= geometry.panel.left, `${name} confirm left is clipped by panel`);
  assert.ok(geometry.button.right <= geometry.panel.right, `${name} confirm right is clipped by panel`);
  assert.ok(geometry.button.top >= 0 && geometry.button.bottom <= geometry.viewport.height, `${name} confirm is outside viewport vertically: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.button.left >= 0 && geometry.button.right <= geometry.viewport.width, `${name} confirm is outside viewport horizontally`);
  await screenshotApp(page, path.join(screenshotRoot, name));
}

export default async function verifyBookWorkflowUi(page, baseUrl) {
  const errors = [];
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);
  page.on("pageerror", (error) => errors.push(error.message));
  const screenshotRoot = process.env.BOOK_WORKFLOW_UI_OUTPUT ?? "artifacts/book-workflow-ui";

  async function capture(name, width, height, options = {}) {
    await page.setViewportSize({ width, height });
    await assertNoButtonOverlap(page);
    await assertTeacherFootersEqualGeometry(page, { withinViewport: options.teacherControls === true });
    await screenshotApp(page, path.join(screenshotRoot, name));
  }

  await page.goto(`${baseUrl}/qa-book-workflow`);
  await page.getByRole("heading", { name: "책방 최종 행동" }).waitFor();
  const resourceCard = cardWithText(page, ".book-personal-resource-card", "체크리스트 자료");
  const activityCard = cardWithText(page, ".book-personal-activity-card:not(.book-personal-resource-card)", "생각 정리 활동");
  await assertFooterButtons(resourceCard, ["확인", "패널에서 열기"]);
  await assertFooterButtons(activityCard, ["확인", "패널에서 열기"]);
  assert.equal(await page.getByRole("button", { name: "활동중", exact: true }).count(), 0);
  assert.equal(await page.locator(".is-current-activity").count(), 0);
  await resourceCard.getByRole("button", { name: "자료 복사" }).click();
  await resourceCard.getByRole("button", { name: "자료를 복사했습니다" }).waitFor();
  const copiedText = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
  assert.equal(copiedText, "체크리스트 자료\n자료를 읽고 체크하세요. 핵심 개념 확인 친구에게 설명 준비\nhttps://example.com/resource");
  await capture("student-main-1280.png", 1280, 900);
  await capture("student-main-768.png", 768, 900);
  await capture("student-main-375.png", 375, 812);

  await resourceCard.getByRole("button", { name: "확인", exact: true }).click();
  await page.getByRole("alertdialog", { name: "미완료 할 일" }).waitFor();
  assert.equal(await resourceCard.getByRole("button", { name: "확인", exact: true }).isVisible(), true);
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await resourceCard.getByRole("button", { name: "패널에서 열기", exact: true }).click();
  await page.locator(".student-activity-detail").getByText("체크리스트 자료").waitFor();
  await page.locator(".student-activity-detail").getByRole("button", { name: "모두 체크하기" }).click();
  await page.locator(".student-activity-detail").getByText("자동 저장됨").waitFor();
  await captureVisibleSidebarConfirm(page, screenshotRoot, "student-sidebar-controls-768.png", 768, 900);
  await captureVisibleSidebarConfirm(page, screenshotRoot, "student-sidebar-controls-375.png", 375, 812);
  await page.locator(".student-activity-detail").getByRole("button", { name: "확인", exact: true }).click();
  await resourceCard.getByRole("button", { name: "확인됨", exact: true }).waitFor();
  assert.equal(await resourceCard.getByRole("button", { name: "확인됨", exact: true }).isDisabled(), true);
  await capture("student-sidebar-1280.png", 1280, 900);
  await capture("student-sidebar-768.png", 768, 900);
  await capture("student-sidebar-375.png", 375, 812);

  await activityCard.getByRole("button", { name: "패널에서 열기", exact: true }).click();
  await page.locator(".student-activity-detail").getByText("생각 정리 활동").waitFor();
  await page.locator(".student-activity-detail").getByRole("button", { name: "확인", exact: true }).click();
  await activityCard.getByRole("button", { name: "확인됨", exact: true }).waitFor();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "교사 보기" }).click();
  await page.getByTestId("mode").getByText("teacher").waitFor();
  const teacherResource = cardWithText(page, ".book-personal-resource-card", "체크리스트 자료");
  const teacherActivity = cardWithText(page, ".book-personal-activity-card:not(.book-personal-resource-card)", "생각 정리 활동");
  await assertTeacherActiveButton(teacherResource, false);
  await assertTeacherActiveButton(teacherActivity, false);
  await assertTeacherFooterGeometry(teacherResource);
  await assertTeacherFooterGeometry(teacherActivity);
  await clickTeacherActivation(teacherActivity, false);
  const teacherPanel = page.getByRole("complementary", { name: "선생님이 준비한 활동과 자료" });
  await teacherPanel.locator(".teacher-active-detail").getByRole("heading", { name: "생각 정리 활동", exact: true }).waitFor();
  for (const width of [1280, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await teacherPanel.locator(".teacher-active-detail").scrollIntoViewIfNeeded();
    await screenshotApp(page, path.join(screenshotRoot, `teacher-auto-open-${width}.png`));
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.equal(await teacherPanel.getByRole("button", { name: "개발자실 패널 접기", exact: true }).getAttribute("aria-expanded"), "true");
  await teacherPanel.getByRole("button", { name: "개발자실 패널 접기", exact: true }).click();
  await assertTeacherActiveButton(teacherActivity, true);
  await assertTeacherActiveButton(teacherResource, false);
  await clickTeacherActivation(teacherResource, false);
  await teacherPanel.locator(".teacher-active-detail").getByRole("heading", { name: "체크리스트 자료", exact: true }).waitFor();
  await teacherPanel.locator(".teacher-active-detail").getByRole("button", { name: "확대", exact: true }).click();
  await page.getByRole("dialog", { name: "체크리스트 자료", exact: true }).getByRole("button", { name: "닫기", exact: true }).click();
  await assertTeacherActiveButton(teacherResource, true);
  await assertTeacherActiveButton(teacherActivity, false);
  await page.getByRole("button", { name: "다음 활동중 저장 실패" }).click();
  await clickTeacherActivation(teacherResource, true);
  await page.getByTestId("toast").getByText("활성 상태를 저장하지 못했습니다. 다시 시도해 주세요.").waitFor();
  await assertTeacherActiveButton(teacherResource, true);
  await assertTeacherActiveButton(teacherActivity, false);
  await teacherResource.getByRole("button", { name: "자료 복사" }).waitFor();
  for (const card of [teacherResource, teacherActivity]) {
    assert.equal(await card.getByRole("button", { name: /잠그기|잠금 해제/ }).count(), 0);
    assert.equal(await card.getByRole("img", { name: /잠김|열림/ }).count(), 0);
  }
  await assertDetailOrder(page, ["activity:activity-1", "resource:resource-1"], ["생각 정리 활동", "체크리스트 자료"]);
  await assertSidebarOrder(page, "최종 행동 확인", ["생각 정리 활동", "체크리스트 자료"]);
  assert.equal(await reorderHandle(page, "생각 정리 활동").getAttribute("draggable"), "true");
  assert.equal(await reorderHandle(page, "체크리스트 자료").getAttribute("draggable"), "true");
  assert.equal(await reorderCard(page, "activity:activity-1").getAttribute("data-drop-target"), null);
  await attemptCrossStepDrop(page);
  await dragByHandleToCard(page, "체크리스트 자료", "activity:activity-1");
  await assertDetailOrder(page, ["resource:resource-1", "activity:activity-1"], ["체크리스트 자료", "생각 정리 활동"]);
  await assertSidebarOrder(page, "최종 행동 확인", ["체크리스트 자료", "생각 정리 활동"]);
  await assertTeacherActiveButton(teacherResource, true);
  await assertTeacherActiveButton(teacherActivity, false);
  await reorderHandle(page, "체크리스트 자료").press("ArrowDown");
  await assertDetailOrder(page, ["activity:activity-1", "resource:resource-1"], ["생각 정리 활동", "체크리스트 자료"]);
  await assertSidebarOrder(page, "최종 행동 확인", ["생각 정리 활동", "체크리스트 자료"]);
  await assertTeacherActiveButton(teacherResource, true);
  await pointerMoveHandleToCard(page, "체크리스트 자료", "activity:activity-1");
  await assertDetailOrder(page, ["resource:resource-1", "activity:activity-1"], ["체크리스트 자료", "생각 정리 활동"]);
  await assertSidebarOrder(page, "최종 행동 확인", ["체크리스트 자료", "생각 정리 활동"]);
  const cancelDropIndicator = await showTouchDropIndicator(page, "체크리스트 자료", "activity:activity-1");
  await capture("teacher-drop-indicator-375.png", 375, 812);
  await cancelDropIndicator();
  assert.equal(await reorderCard(page, "activity:activity-1").getAttribute("data-drop-target"), null);
  await assertDetailOrder(page, ["resource:resource-1", "activity:activity-1"], ["체크리스트 자료", "생각 정리 활동"]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "다음 프로젝트 저장 실패" }).click();
  await dragByHandleToCard(page, "체크리스트 자료", "activity:activity-1");
  await page.getByTestId("toast").getByText("활동과 자료 순서를 저장하지 못했어요. 다시 시도해 주세요.").waitFor();
  await assertDetailOrder(page, ["resource:resource-1", "activity:activity-1"], ["체크리스트 자료", "생각 정리 활동"]);
  await assertSidebarOrder(page, "최종 행동 확인", ["체크리스트 자료", "생각 정리 활동"]);
  await capture("teacher-main-1280.png", 1280, 900);
  await capture("teacher-main-768.png", 768, 900);
  await capture("teacher-main-375.png", 375, 812);
  await capture("teacher-reorder-1280.png", 1280, 900);
  await capture("teacher-reorder-768.png", 768, 900);
  await capture("teacher-reorder-375.png", 375, 812);
  await collapseTeacherSidebars(page);
  await capture("teacher-controls-1280.png", 1280, 900, { teacherControls: true });
  await capture("teacher-controls-768.png", 768, 900, { teacherControls: true });
  await capture("teacher-controls-375.png", 375, 812, { teacherControls: true });
  await teacherResource.getByRole("button", { name: "발표 모드" }).click();
  await page.getByRole("alertdialog", { name: /체크리스트 자료 발표 모드/ }).waitFor();
  await page.getByRole("button", { name: "발표 종료", exact: true }).click();

  await page.getByRole("button", { name: "Step 2 열기", exact: true }).click();
  const teacherStepTwoActivity = cardWithText(page, ".book-personal-activity-card:not(.book-personal-resource-card)", "두 번째 활동");
  const teacherStepTwoResource = cardWithText(page, ".book-personal-resource-card", "두 번째 자료");
  await clickTeacherActivation(teacherStepTwoActivity, false);
  await assertTeacherActiveButton(teacherStepTwoActivity, true);
  await assertTeacherActiveButton(teacherStepTwoResource, false);
  await page.getByRole("button", { name: "Step 열기", exact: true }).click();
  await assertTeacherActiveButton(teacherResource, false);
  await clickTeacherActivation(teacherResource, false);
  await assertTeacherActiveButton(teacherResource, true);
  await clickTeacherActivation(teacherResource, true);
  await assertTeacherActiveButton(teacherResource, false);
  await assertTeacherActiveButton(teacherActivity, false);
  await page.getByRole("button", { name: "Step 2 열기", exact: true }).click();
  await assertTeacherActiveButton(teacherStepTwoActivity, false);
  await page.getByRole("button", { name: "Step 열기", exact: true }).click();
  await page.getByRole("button", { name: "학생 보기" }).click();
  await page.getByTestId("mode").getByText("student").waitFor();
  await assertStudentHasNoReorderControls(page);
  assert.deepEqual(await detailOrderTitles(page), ["체크리스트 자료", "생각 정리 활동"]);
  await assertCurrentActivity(resourceCard, false);
  await assertCurrentActivity(activityCard, false);
  await page.getByRole("button", { name: "교사 보기" }).click();
  await page.getByTestId("mode").getByText("teacher").waitFor();
  await clickTeacherActivation(teacherResource, false);
  await assertTeacherActiveButton(teacherResource, true);
  await collapseTeacherSidebars(page);
  await capture("teacher-controls-1280.png", 1280, 900, { teacherControls: true });
  await capture("teacher-controls-768.png", 768, 900, { teacherControls: true });
  await capture("teacher-controls-375.png", 375, 812, { teacherControls: true });

  await page.getByRole("button", { name: "Step 2 열기", exact: true }).click();
  await page.getByRole("button", { name: "다음 활동중 저장 실패" }).click();
  await clickTeacherActivation(teacherStepTwoResource, false);
  await page.getByTestId("toast").getByText("활성 상태를 저장하지 못했습니다. 다시 시도해 주세요.").waitFor();
  await assertTeacherActiveButton(teacherStepTwoActivity, false);
  await assertTeacherActiveButton(teacherStepTwoResource, false);

  await page.getByRole("button", { name: "Step 열기", exact: true }).click();
  await page.getByRole("button", { name: "학생 보기" }).click();
  await page.getByTestId("mode").getByText("student").waitFor();
  await assertStudentHasNoReorderControls(page);
  assert.deepEqual(await detailOrderTitles(page), ["체크리스트 자료", "생각 정리 활동"]);
  await assertCurrentActivity(resourceCard, true);
  await assertCurrentActivity(activityCard, false);
  await assertFooterButtons(resourceCard, ["확인됨", "패널에서 열기"]);
  await assertFooterButtons(activityCard, ["확인됨", "패널에서 열기"]);
  await capture("student-active-1280.png", 1280, 900);
  await capture("student-active-768.png", 768, 900);
  await capture("student-active-375.png", 375, 812);
  await page.getByRole("button", { name: "원격 활동 활성화", exact: true }).click();
  const livePanel = page.getByRole("complementary", { name: "선택한 활동과 자료", exact: true });
  await livePanel.getByRole("heading", { name: "생각 정리 활동", exact: true }).waitFor();
  await livePanel.getByRole("button", { name: "활동 패널 접기", exact: true }).click();
  await page.getByRole("button", { name: "원격 자료 활성화", exact: true }).click();
  await livePanel.getByRole("heading", { name: "체크리스트 자료", exact: true }).waitFor();
  assert.equal(await livePanel.getByRole("button", { name: "활동 패널 접기", exact: true }).getAttribute("aria-expanded"), "true");
  await capture("student-auto-open-375.png", 375, 812);
  await page.getByRole("button", { name: "교사 보기" }).click();
  await page.getByRole("button", { name: "이전 활동 잠금 재현", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await teacherActivity.getByRole("button", { name: "활동 수정", exact: true }).click();
  const editDialog = page.locator(".book-item-edit-modal");
  for (const width of [1280, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await editDialog.getByRole("button", { name: "자료로 변환", exact: true }).scrollIntoViewIfNeeded();
    await screenshotApp(page, path.join(screenshotRoot, `item-kind-activity-${width}.png`));
  }
  await editDialog.getByRole("button", { name: "자료로 변환", exact: true }).click();
  await editDialog.getByRole("textbox", { name: "자료 링크 URL", exact: true }).fill("https://example.com/converted");
  await editDialog.getByRole("button", { name: "자료 저장", exact: true }).waitFor();
  for (const width of [1280, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await editDialog.getByRole("button", { name: "활동으로 변환", exact: true }).scrollIntoViewIfNeeded();
    await screenshotApp(page, path.join(screenshotRoot, `item-kind-conversion-${width}.png`));
  }
  await editDialog.getByRole("button", { name: "자료 저장", exact: true }).click();
  await editDialog.waitFor({ state: "detached" });
  const converted = cardWithText(page, ".book-personal-resource-card", "생각 정리 활동");
  const copyBorder = () => converted.getByRole("button", { name: "자료 복사", exact: true }).evaluate(button => getComputedStyle(button).borderTopWidth);
  assert.equal(await copyBorder(), "0px");
  await page.getByRole("button", { name: "학생 보기", exact: true }).click();
  assert.equal(await copyBorder(), "0px");
  assert.equal(await converted.getByRole("button", { name: "자료 복사", exact: true }).isEnabled(), true);
  assert.equal(await converted.getByRole("img", { name: "잠김", exact: true }).count(), 0);
  await converted.getByRole("button", { name: "자료 복사", exact: true }).click();
  await converted.getByRole("button", { name: "자료를 복사했습니다", exact: true }).waitFor();
  assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes("생각 정리 활동"));
  await capture("converted-resource-copy-375.png", 375, 900);
  await page.getByRole("button", { name: "교사 보기", exact: true }).click();
  await converted.getByRole("button", { name: "자료 수정", exact: true }).click();
  assert.equal(await editDialog.getByRole("textbox", { name: "자료 링크 URL", exact: true }).inputValue(), "https://example.com/converted");
  await editDialog.getByRole("button", { name: "활동으로 변환", exact: true }).click();
  await editDialog.getByRole("button", { name: "활동 저장", exact: true }).click();
  await editDialog.waitFor({ state: "detached" });
  await teacherActivity.getByRole("button", { name: "활동 수정", exact: true }).waitFor();
  assert.deepEqual(await detailOrderTitles(page), ["체크리스트 자료", "생각 정리 활동"]);
  await page.getByRole("button", { name: "다음 프로젝트 저장 실패", exact: true }).click();
  await teacherActivity.getByRole("button", { name: "활동 수정", exact: true }).click();
  await editDialog.getByRole("button", { name: "자료로 변환", exact: true }).click();
  await editDialog.getByRole("button", { name: "자료 저장", exact: true }).click();
  await editDialog.getByRole("alert").getByText("저장하지 못했어요. 입력 내용은 유지됩니다. 다시 저장해 주세요.").waitFor();
  await editDialog.locator(".book-item-edit-footer").getByRole("button", { name: "닫기", exact: true }).click();
  await teacherActivity.getByRole("button", { name: "활동 수정", exact: true }).waitFor();
  await page.getByRole("button", { name: "Step 2 열기", exact: true }).click();
  await page.getByRole("button", { name: "추가하기", exact: true }).click();
  const typeDialog = page.getByRole("dialog", { name: "항목 추가", exact: true });
  await typeDialog.waitFor();
  assert.equal(await typeDialog.getByRole("textbox").count(), 0);
  await page.screenshot({ path: path.join(screenshotRoot, "add-item-type-375.png") });
  await typeDialog.getByRole("radio", { name: "자료", exact: true }).click();
  await editDialog.getByRole("textbox", { name: "자료 제목", exact: true }).fill("새로 추가한 자료");
  assert.equal(await editDialog.getByRole("group", { name: "학생 답변 설정" }).count(), 0);
  await editDialog.getByRole("button", { name: "자료 추가", exact: true }).click();
  await editDialog.waitFor({ state: "detached" });
  await cardWithText(page, ".book-personal-resource-card", "새로 추가한 자료").waitFor();
  await page.getByRole("button", { name: "추가하기", exact: true }).click();
  await typeDialog.getByRole("radio", { name: "활동", exact: true }).click();
  await editDialog.getByRole("textbox", { name: "활동 제목", exact: true }).fill("새로 추가한 활동");
  await editDialog.getByRole("group", { name: "학생 답변 설정" }).waitFor();
  await editDialog.getByRole("button", { name: "활동 추가", exact: true }).click();
  await editDialog.waitFor({ state: "detached" });
  await cardWithText(page, ".book-personal-activity-card", "새로 추가한 활동").waitFor();
  assert.deepEqual(await detailOrderTitles(page), ["두 번째 활동", "두 번째 자료", "새로 추가한 자료", "새로 추가한 활동"]);
  for (const width of [1280, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "추가하기", exact: true }).scrollIntoViewIfNeeded();
    const addButton = page.getByRole("button", { name: "추가하기", exact: true });
    assert.equal(await addButton.evaluate(button => button === button.parentElement.lastElementChild), true);
    assert.equal(await addButton.evaluate(button => getComputedStyle(button).borderTopStyle), "dashed");
    await addButton.click();
    await typeDialog.getByRole("button", { name: "닫기", exact: true }).click();
    await addButton.focus();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(screenshotRoot, `main-add-item-${width}.png`), animations: "disabled" });
  }
  await page.getByRole("button", { name: "Step 열기", exact: true }).click();
  await page.getByRole("button", { name: "학생 하나 개인 카드 열기", exact: true }).click();
  await activityCard.getByRole("img", { name: "확인됨", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  return {
    passed: true,
    cases: [
      "student main cards expose confirm and panel buttons",
      "student cards do not expose teacher activation controls",
      "main checklist warning gates confirmation",
      "panel check-all enables main confirmation",
      "sidebar confirmation still works",
      "student resource copy icon works",
      "teacher card footer exposes active and presentation actions",
      "teacher active item switches activity to resource per step",
      "teacher active item clears selections in every other step",
      "failed active item save keeps the previous selection and shows a toast",
      "student selected active card is marked current while confirmations remain",
      "teacher activity and resource headers omit lock controls",
    ],
    screenshots: [
      "student-main-1280.png",
      "student-main-768.png",
      "student-main-375.png",
      "student-sidebar-1280.png",
      "student-sidebar-768.png",
      "student-sidebar-375.png",
      "student-sidebar-controls-768.png",
      "student-sidebar-controls-375.png",
      "teacher-main-1280.png",
      "teacher-main-768.png",
      "teacher-main-375.png",
      "teacher-controls-1280.png",
      "teacher-controls-768.png",
      "teacher-controls-375.png",
      "student-active-1280.png",
      "student-active-768.png",
      "student-active-375.png",
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outputDir = path.resolve(process.env.BOOK_WORKFLOW_UI_OUTPUT ?? path.join(root, "artifacts", "book-workflow-ui"));
  const testRoot = path.join(outputDir, `next-app-${process.pid}-${Date.now()}`);
  const route = path.join(testRoot, "app", "qa-book-workflow");
  const port = Number(process.env.BOOK_WORKFLOW_UI_PORT ?? 3153);
  const baseUrl = `http://127.0.0.1:${port}`;
  const require = createRequire(import.meta.url);
  const { chromium } = process.env.BOOK_WORKFLOW_PLAYWRIGHT
    ? require(process.env.BOOK_WORKFLOW_PLAYWRIGHT)
    : require("playwright");
  let server;
  let serverExited = Promise.resolve();
  let browser;
  let logs = "";
  try {
    await mkdir(route, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    await Promise.all([
      cp(path.join(root, "components"), path.join(testRoot, "components"), { recursive: true }),
      cp(path.join(root, "lib"), path.join(testRoot, "lib"), { recursive: true }),
      cp(path.join(root, "tests", "fixtures"), path.join(testRoot, "tests", "fixtures"), { recursive: true }),
      cp(path.join(root, "public"), path.join(testRoot, "public"), { recursive: true }),
      cp(path.join(root, "app", "globals.css"), path.join(testRoot, "app", "globals.css")),
      cp(path.join(root, "app", "book-sidebar.css"), path.join(testRoot, "app", "book-sidebar.css")),
      cp(path.join(root, "package.json"), path.join(testRoot, "package.json")),
      cp(path.join(root, "jsconfig.json"), path.join(testRoot, "jsconfig.json")),
    ]);
    await writeFile(path.join(testRoot, "lib", "firebase.js"), "export const isFirebaseConfigured = false;\nexport const db = null;\nexport const auth = null;\nexport const storage = null;\n");
    await writeFile(path.join(testRoot, "next.config.mjs"), "/** @type {import('next').NextConfig} */\nconst nextConfig = { devIndicators: false };\nexport default nextConfig;\n");
    await writeFile(path.join(testRoot, "app", "layout.js"), 'import "../app/globals.css";\nimport "../app/book-sidebar.css";\nexport default function RootLayout({ children }) { return <html lang="ko"><body>{children}</body></html>; }\n');
    await writeFile(path.join(route, "page.jsx"), 'export { default } from "@/tests/fixtures/BookWorkflowPage";\n');
    await mkdir(path.join(testRoot, "app", "qa-scroll"), { recursive: true });
    await writeFile(path.join(testRoot, "app", "qa-scroll", "page.jsx"), 'export { default } from "@/tests/fixtures/BookScrollPage";\n');
    server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--port", String(port), "--hostname", "127.0.0.1"], {
      cwd: testRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverExited = new Promise((resolve) => server.on("close", resolve));
    server.stdout.on("data", (data) => { logs += data; });
    server.stderr.on("data", (data) => { logs += data; });
    const deadline = Date.now() + 120000;
    while (!logs.includes("Ready in")) {
      if (server.exitCode !== null || Date.now() > deadline) throw new Error(`Dev server failed: ${logs}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], baseURL: baseUrl });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
    const page = await context.newPage();
    const result = await verifyBookWorkflowUi(page, baseUrl);
    const teacherPage = await context.newPage();
    const studentPage = await context.newPage();
    const mobilePage = await context.newPage();
    await teacherPage.setViewportSize({ width: 1280, height: 900 });
    await studentPage.setViewportSize({ width: 1024, height: 768 });
    await mobilePage.setViewportSize({ width: 375, height: 812 });
    await studentPage.goto(`${baseUrl}/qa-scroll`);
    await mobilePage.goto(`${baseUrl}/qa-scroll`);
    await teacherPage.goto(`${baseUrl}/qa-scroll?teacher=1`);
    await teacherPage.getByRole("button", { name: "스크롤 방송 시작" }).click();
    await studentPage.locator(".book-presentation-body").waitFor();
    await mobilePage.locator(".book-presentation-body").waitFor();
    await teacherPage.locator(".book-presentation-body").evaluate(body => { body.scrollTop = 1000; });
    await studentPage.waitForFunction(() => document.querySelector(".book-presentation-body")?.scrollTop > 400);
    assert.equal(await mobilePage.locator(".book-presentation-body").evaluate(body => body.scrollTop), 0);
    await mobilePage.locator(".book-presentation-body").evaluate(body => { body.scrollTop = 200; });
    await teacherPage.locator(".book-presentation-body").evaluate(body => { body.scrollTop = 1600; });
    await studentPage.waitForFunction(() => document.querySelector(".book-presentation-body")?.scrollTop > 900);
    const teacherAnchor = await teacherPage.locator(".book-presentation-body").evaluate(body => {
      const top = body.getBoundingClientRect().top;
      return [...body.querySelectorAll(".book-presentation-rich > *")].findLastIndex(block => block.getBoundingClientRect().top <= top + 1);
    });
    await studentPage.waitForFunction(expected => {
      const body = document.querySelector(".book-presentation-body");
      const top = body.getBoundingClientRect().top;
      return [...body.querySelectorAll(".book-presentation-rich > *")].findLastIndex(block => block.getBoundingClientRect().top <= top + 1) === expected;
    }, teacherAnchor);
    assert.equal(await mobilePage.locator(".book-presentation-body").evaluate(body => body.scrollTop), 200);
    await studentPage.screenshot({ path: path.join(outputDir, "desktop-scroll-follow.png") });
    await mobilePage.screenshot({ path: path.join(outputDir, "mobile-independent-scroll.png") });
    await teacherPage.getByRole("button", { name: "발표 종료", exact: true }).click();
    await studentPage.locator(".book-presentation-body").waitFor({ state: "detached" });
    await mobilePage.locator(".book-presentation-body").waitFor({ state: "detached" });
    await writeFile(path.join(outputDir, "results.json"), JSON.stringify({ ...result, fixtureUrl: `${baseUrl}/qa-book-workflow` }, null, 2));
    console.log(JSON.stringify({ ...result, fixtureUrl: `${baseUrl}/qa-book-workflow` }));
  } finally {
    await browser?.close();
    if (server && server.exitCode === null) {
      if (process.platform === "win32") {
        await new Promise((resolve) => spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).on("close", resolve));
      } else {
        server.kill("SIGTERM");
      }
      await Promise.race([serverExited, new Promise((resolve) => setTimeout(resolve, 5000))]);
    }
    await writeFile(path.join(outputDir, "dev-server.log"), logs);
    assertInsideDirectory(testRoot, outputDir);
    const cleaned = await removeWithRetry(testRoot);
    if (!cleaned) await writeFile(path.join(outputDir, `cleanup-${path.basename(testRoot)}.txt`), `Could not remove locked fixture directory: ${testRoot}\n`);
    console.log("Book workflow QA dev server stopped; temporary route removed.");
  }
  process.exit(0);
}
