import assert from "node:assert/strict";

export default async function verifyHelpSections(page, baseUrl) {
  await page.goto(`${baseUrl}/qa-help-sections`);
  const drawer = page.getByRole("complementary", { name: "도움 글", exact: true });
  await drawer.getByRole("button", { name: "01 Vercel", exact: true }).click();
  await drawer.getByRole("button", { name: "+ 항목 추가", exact: true }).click();
  await drawer.getByRole("button", { name: "항목 저장", exact: true }).click();
  assert.match(await drawer.getByRole("alert").textContent(), /제목/);
  await drawer.getByLabel("항목 제목", { exact: true }).fill("실행 제한");
  await drawer.getByRole("textbox", { name: "항목 내용", exact: true }).fill("x".repeat(5001));
  await drawer.getByRole("button", { name: "항목 저장", exact: true }).click();
  await drawer.getByRole("alert").waitFor();
  assert.equal(await drawer.getByLabel("항목 제목", { exact: true }).inputValue(), "실행 제한");
  await drawer.getByRole("textbox", { name: "항목 내용", exact: true }).fill("함수 실행 시간을 확인합니다.");
  await drawer.getByRole("button", { name: "항목 저장", exact: true }).click();
  await drawer.getByRole("heading", { name: "실행 제한", exact: true }).waitFor();
  const quota = drawer.getByRole("region", { name: "배포 제한", exact: true });
  await quota.getByRole("button", { name: "편집", exact: true }).click();
  await quota.getByLabel("항목 제목", { exact: true }).fill("배포 횟수");
  await quota.getByRole("button", { name: "항목 저장", exact: true }).click();
  await drawer.getByRole("heading", { name: "배포 횟수", exact: true }).waitFor();
  assert.equal(await drawer.getByRole("heading", { name: "실행 제한", exact: true }).count(), 1);
  await page.getByRole("button", { name: "학생 화면", exact: true }).click();
  await drawer.getByRole("button", { name: "01 Vercel", exact: true }).click();
  assert.equal(await drawer.getByRole("button", { name: "편집", exact: true }).count(), 0);
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `qa-help-sections-student-${width}.png`, fullPage: true });
    const expand = drawer.getByRole("button", { name: "Vercel 확대", exact: true });
    const indicator = drawer.locator(".book-help-content-indicator");
    const iconBox = await indicator.boundingBox();
    const expandBox = await expand.boundingBox();
    assert(expandBox.x > iconBox.x + iconBox.width);
    await expand.click();
    const modal = page.getByRole("dialog", { name: "Vercel", exact: true });
    await modal.waitFor();
    assert.match(await modal.textContent(), /시간·빌드·실행 제한/);
    assert.match(await modal.textContent(), /배포 횟수/);
    assert.match(await modal.textContent(), /실행 제한/);
    const box = await modal.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= width + 1);
    await page.screenshot({ path: `qa-help-sections-modal-${width}.png`, fullPage: true });
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await expand.evaluate((button) => document.activeElement === button), true);
  }
  await page.getByRole("button", { name: "교사 화면", exact: true }).click();
  await drawer.getByRole("button", { name: "01 Vercel", exact: true }).click();
  const execution = drawer.getByRole("region", { name: "실행 제한", exact: true });
  await execution.getByRole("button", { name: "삭제", exact: true }).click();
  await execution.getByRole("button", { name: "삭제 확인", exact: true }).click();
  assert.equal(await drawer.getByRole("heading", { name: "실행 제한", exact: true }).count(), 0);
  assert.equal(await drawer.getByRole("heading", { name: "배포 횟수", exact: true }).count(), 1);
  await drawer.getByRole("button", { name: "추가", exact: true }).click();
  const newNote = drawer.getByRole("region", { name: "새 도움 글", exact: true });
  await newNote.getByLabel("제목", { exact: true }).fill("GitHub");
  await newNote.getByRole("button", { name: "+ 항목 추가", exact: true }).click();
  await newNote.getByLabel("항목 제목", { exact: true }).fill("저장소 만들기");
  await newNote.getByRole("textbox", { name: "항목 내용", exact: true }).fill("x".repeat(5001));
  await newNote.getByRole("button", { name: "항목 저장", exact: true }).click();
  await newNote.getByRole("alert").waitFor();
  assert.equal(await newNote.getByLabel("항목 제목", { exact: true }).inputValue(), "저장소 만들기");
  await newNote.getByRole("textbox", { name: "항목 내용", exact: true }).fill("새 저장소를 만듭니다.");
  assert.equal(await newNote.getByRole("button", { name: "저장", exact: true }).isDisabled(), true);
  await newNote.getByRole("button", { name: "항목 저장", exact: true }).click();
  await newNote.getByRole("button", { name: "저장", exact: true }).click();
  await drawer.getByRole("heading", { name: "저장소 만들기", exact: true }).waitFor();
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `qa-help-sections-teacher-${width}.png`, fullPage: true });
  }
  await drawer.getByRole("region", { name: "저장소 만들기", exact: true }).getByRole("button", { name: "편집", exact: true }).click();
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({ path: "qa-help-sections-edit-375.png", fullPage: true });
  return "Help note section create/edit/delete, error retry, sibling preservation, student modal, focus restoration, and responsive checks passed";
}
