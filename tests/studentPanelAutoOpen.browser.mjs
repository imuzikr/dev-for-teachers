export default async function verifyStudentPanelAutoOpen(page, baseUrl = "http://localhost:3039") {
  await page.goto(`${baseUrl}/qa-panel-auto-open`);
  await page.evaluate(() => {
    localStorage.removeItem("student-panel:auto-open-fixture");
    localStorage.removeItem("student-panel:other-scope");
  });
  await page.reload();
  await page.getByRole("button", { name: "활동 패널 펼치기" }).waitFor();
  const initial = await page.evaluate(() => ({
    collapsed: document.querySelector(".student-activity-side")?.classList.contains("is-collapsed"),
    selected: document.querySelector('[aria-label="선택된 패널 항목"]')?.textContent,
    ready: document.querySelector('[aria-label="초기 준비"]')?.textContent,
  }));
  if (!initial.collapsed || initial.selected !== "none" || initial.ready !== "pending") {
    throw new Error(`Initial unlocked panel state changed: ${JSON.stringify(initial)}`);
  }

  await page.getByRole("button", { name: "초기 스냅샷 반영" }).click();
  await page.getByRole("button", { name: "초기 로딩 완료" }).click();
  const afterInitialReady = await page.evaluate(() => ({
    collapsed: document.querySelector(".student-activity-side")?.classList.contains("is-collapsed"),
    selected: document.querySelector('[aria-label="선택된 패널 항목"]')?.textContent,
    ready: document.querySelector('[aria-label="초기 준비"]')?.textContent,
  }));
  if (!afterInitialReady.collapsed || afterInitialReady.selected !== "none" || afterInitialReady.ready !== "ready") {
    throw new Error(`Initial snapshot reconciliation auto-opened the panel: ${JSON.stringify(afterInitialReady)}`);
  }

  await page.getByRole("button", { name: "자료 잠금 해제" }).click();
  await page.locator(".student-activity-detail").waitFor({ state: "visible" });
  const opened = await page.evaluate(() => ({
    collapsed: document.querySelector(".student-activity-side")?.classList.contains("is-collapsed"),
    selected: document.querySelector('[aria-label="선택된 패널 항목"]')?.textContent,
    detail: document.querySelector(".student-activity-detail h3")?.textContent,
    step: document.querySelector('[aria-label="현재 스텝"]')?.textContent,
  }));
  if (opened.collapsed || opened.selected !== "resource:r1" || opened.detail !== "자동 열린 자료" || opened.step !== "step-2") {
    throw new Error(`Live auto-open did not select and expand the resource: ${JSON.stringify(opened)}`);
  }

  await page.getByRole("button", { name: "활동 패널 접기" }).click();
  await page.getByRole("button", { name: "자료 제목 수정" }).click();
  const afterTitleChange = await page.evaluate(() => ({
    collapsed: document.querySelector(".student-activity-side")?.classList.contains("is-collapsed"),
    selected: document.querySelector('[aria-label="선택된 패널 항목"]')?.textContent,
    ariaHidden: document.querySelector(".student-activity-panel-content")?.getAttribute("aria-hidden"),
  }));
  if (!afterTitleChange.collapsed || afterTitleChange.selected !== "resource:r1" || afterTitleChange.ariaHidden !== "true") {
    throw new Error(`Consumed auto-open request replayed after item key refresh: ${JSON.stringify(afterTitleChange)}`);
  }

  await page.getByRole("button", { name: "다른 학습자 보기" }).click();
  const afterScopeSwitch = await page.evaluate(() => ({
    collapsed: document.querySelector(".student-activity-side")?.classList.contains("is-collapsed"),
    selected: document.querySelector('[aria-label="선택된 패널 항목"]')?.textContent,
    scope: document.querySelector('[aria-label="현재 스코프"]')?.textContent,
  }));
  if (!afterScopeSwitch.collapsed || afterScopeSwitch.selected !== "none" || afterScopeSwitch.scope !== "other-scope") {
    throw new Error(`Stale auto-open request crossed student scope: ${JSON.stringify(afterScopeSwitch)}`);
  }

  await page.getByRole("button", { name: "원래 학습자 보기" }).click();
  const afterScopeReturn = await page.evaluate(() => ({
    collapsed: document.querySelector(".student-activity-side")?.classList.contains("is-collapsed"),
    selected: document.querySelector('[aria-label="선택된 패널 항목"]')?.textContent,
    scope: document.querySelector('[aria-label="현재 스코프"]')?.textContent,
    ariaHidden: document.querySelector(".student-activity-panel-content")?.getAttribute("aria-hidden"),
  }));
  if (!afterScopeReturn.collapsed || afterScopeReturn.scope !== "auto-open-fixture" || afterScopeReturn.ariaHidden !== "true") {
    throw new Error(`Old auto-open request replayed after returning to original scope: ${JSON.stringify(afterScopeReturn)}`);
  }

  await page.getByRole("button", { name: "활동 잠금 해제" }).click();
  await page.getByLabel("답변 내용").fill("draft survives panel collapse");
  await page.locator('.student-activity-detail input[type="checkbox"]').first().check();
  await page.getByRole("button", { name: "활동 패널 접기" }).click();
  await page.getByRole("button", { name: "자료 제목 수정" }).click();
  await page.getByRole("button", { name: "활동 패널 펼치기" }).click();
  const preserved = await page.evaluate(() => ({
    collapsed: document.querySelector(".student-activity-side")?.classList.contains("is-collapsed"),
    selected: document.querySelector('[aria-label="선택된 패널 항목"]')?.textContent,
    answer: document.querySelector('[aria-label="답변 내용"]')?.value,
    checked: document.querySelector('.student-activity-detail input[type="checkbox"]')?.checked,
  }));
  if (preserved.collapsed || preserved.selected !== "activity:a2" || preserved.answer !== "draft survives panel collapse" || preserved.checked !== true) {
    throw new Error(`Activity panel draft/checklist state was not preserved: ${JSON.stringify(preserved)}`);
  }

  return { passed: true, initial, afterInitialReady, opened, afterTitleChange, afterScopeSwitch, afterScopeReturn, preserved };
}
