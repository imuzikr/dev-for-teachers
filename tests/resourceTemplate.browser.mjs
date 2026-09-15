import assert from "node:assert/strict";

export default async function verifyResourceTemplate(page, output) {
  await page.getByRole("button", { name: "교사 보기", exact: true }).click();
  const resource = page.locator('.book-project-flow-detail-list > article[data-reorder-key="resource:resource-1"]');
  await resource.getByRole("button", { name: "자료 수정", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("템플릿 사용", { exact: true }).check();
  await modal.getByLabel("자료 내용", { exact: true }).fill("{{학교}}의 {{이름}}입니다.");
  await modal.getByRole("button", { name: "자료 저장", exact: true }).click();
  await modal.waitFor({ state: "hidden" });
  await resource.getByRole("button", { name: "자료 수정", exact: true }).click();
  assert(await modal.getByLabel("템플릿 사용", { exact: true }).isChecked());
  await modal.getByRole("button", { name: "닫기", exact: true }).last().click();
  await page.getByRole("button", { name: "학생 보기", exact: true }).click();
  const studentResource = page.locator(".book-personal-resource-card").filter({ hasText: "체크리스트 자료" }).first();
  await studentResource.getByRole("button", { name: "패널에서 열기", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "선택한 활동과 자료" });
  await panel.getByLabel("학교", { exact: true }).fill("테스트중학교");
  assert(await panel.getByRole("button", { name: "복사하기", exact: true }).isDisabled());
  await panel.getByLabel("이름", { exact: true }).fill("학생 하나");
  await page.evaluate(() => {
    window.copiedTemplate = null;
    Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: async text => { window.copiedTemplate = text; } });
  });
  await panel.getByRole("button", { name: "복사하기", exact: true }).click();
  assert.equal(await page.evaluate(() => window.copiedTemplate), "테스트중학교의 학생 하나입니다.");
  await panel.getByRole("button", { name: "확대", exact: true }).click();
  assert.equal(await modal.getByLabel("학교", { exact: true }).inputValue(), "테스트중학교");
  await modal.getByLabel("이름", { exact: true }).fill("학생 둘");
  await modal.getByRole("button", { name: "복사하기", exact: true }).click();
  assert.equal(await page.evaluate(() => window.copiedTemplate), "테스트중학교의 학생 둘입니다.");
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `${output}/resource-template-${width}.png`, fullPage: true });
  }
  await modal.getByRole("button", { name: "닫기", exact: true }).click();
  assert.equal(await panel.getByLabel("이름", { exact: true }).inputValue(), "학생 둘");
  await page.getByRole("button", { name: "교사 보기", exact: true }).click();
  await resource.getByRole("button", { name: "자료 수정", exact: true }).click();
  await modal.getByRole("button", { name: "활동으로 변환", exact: true }).click();
  await modal.getByLabel("템플릿 사용", { exact: true }).uncheck();
  await modal.getByRole("button", { name: "답변 받기", exact: true }).click();
  await modal.getByLabel("템플릿 사용", { exact: true }).check();
  await modal.getByRole("button", { name: "활동 저장", exact: true }).click();
  await modal.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "학생 보기", exact: true }).click();
  const converted = page.locator(".book-personal-detail-list > article").filter({ hasText: "체크리스트 자료" }).first();
  await converted.getByRole("button", { name: "패널에서 열기", exact: true }).click();
  await panel.getByLabel("학교", { exact: true }).waitFor();
  assert.equal(await panel.getByRole("textbox", { name: "답변 내용" }).count(), 0, "Template activities must not display a separate answer field after conversion");
  await panel.getByRole("button", { name: "확대", exact: true }).click();
  assert.equal(await modal.getByRole("textbox", { name: "답변 내용" }).count(), 0);
  assert.equal(await modal.getByRole("button", { name: "저장", exact: true }).count(), 0);
  await page.screenshot({ path: `${output}/converted-template-confirm.png`, fullPage: true });
  await modal.getByRole("button", { name: "확인", exact: true }).click();
  await modal.waitFor({ state: "hidden" });
  await converted.getByRole("button", { name: "확인됨", exact: true }).waitFor();
}
