import assert from "node:assert/strict";

export default async function verifyMainCardEdit(page, baseUrl) {
  await page.goto(`${baseUrl}/qa-main-card-edit`);
  const main = page.getByRole("region", { name: "개발자실 메인 화면", exact: true });
  const savedProject = async () => JSON.parse(await page.getByTestId("saved-project").textContent());
  const original = await savedProject();
  await main.getByRole("button", { name: "자료 열기", exact: true }).click();
  await main.getByRole("button", { name: "자료 잠그기", exact: true }).waitFor();
  assert.equal((await savedProject()).steps[0].resources[0].locked, false);
  assert.deepEqual((await savedProject()).steps[0].activities, original.steps[0].activities);
  await main.getByRole("button", { name: "자료 잠그기", exact: true }).click();
  await main.getByRole("button", { name: "자료 열기", exact: true }).waitFor();
  assert.equal((await savedProject()).steps[0].resources[0].locked, true);
  for (const [label, collection] of [["활동", "activities"], ["자료", "resources"]]) {
    const pencil = main.getByRole("button", { name: `${label} 수정`, exact: true }).first();
    assert.equal(await pencil.evaluate((button) => button.previousElementSibling?.getAttribute("aria-label")), "잠김");
    await pencil.click();
    const modal = page.getByRole("dialog");
    await modal.waitFor();
    assert.equal(await modal.getByRole("textbox", { name: `${label} 제목`, exact: true }).count(), 1);
    await modal.getByRole("textbox", { name: `${label} 제목`, exact: true }).fill(`${label} 수정 완료`);
    await modal.getByRole("button", { name: `${label} 저장`, exact: true }).click();
    await modal.waitFor({ state: "detached" });
    const saved = await savedProject();
    assert.equal(saved.steps[0][collection][0].title, `${label} 수정 완료`);
    assert.deepEqual(saved.steps[0].activities[1], original.steps[0].activities[1]);
    assert.deepEqual(saved.steps[0].itemOrder, original.steps[0].itemOrder);
    assert.deepEqual(saved.steps[1], original.steps[1]);
  }
  await page.getByLabel("저장 실패", { exact: true }).check();
  await main.getByRole("button", { name: "활동 수정", exact: true }).first().click();
  const modal = page.getByRole("dialog");
  await modal.getByRole("textbox", { name: "활동 제목", exact: true }).fill("보존할 입력");
  await modal.getByRole("button", { name: "활동 저장", exact: true }).click();
  await modal.getByRole("alert").waitFor();
  assert.equal(await modal.getByRole("textbox", { name: "활동 제목", exact: true }).inputValue(), "보존할 입력");
  await modal.getByRole("button", { name: "닫기", exact: true }).last().click();
  await main.getByRole("button", { name: "활동 확대", exact: true }).first().click();
  assert.equal(await page.getByRole("dialog").getByRole("button", { name: "활동 저장", exact: true }).count(), 0);
  await page.getByRole("dialog").getByRole("button", { name: "닫기", exact: true }).first().click();
  await page.getByLabel("교사 화면", { exact: true }).uncheck();
  assert.equal(await main.getByRole("button", { name: /^(활동|자료) 수정$/ }).count(), 0);
  return "Main activity/resource edits, isolated saves, failure retention, expansion and teacher-only controls passed";
}
