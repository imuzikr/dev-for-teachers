export default async function verifySidebarItemEdit(page, baseUrl = "http://localhost:3045") {
  await page.goto(`${baseUrl}/qa-item-edit`);
  await page.locator(".book-step-flow-trigger").first().click();
  const savedProject = async () => JSON.parse(await page.getByTestId("saved-project").textContent());
  const initial = await savedProject();
  for (const [label, collection] of [["활동", "activities"], ["자료", "resources"]]) {
    await page.getByRole("button", { name: `${label} 수정`, exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    if (await page.getByTestId("step-edits").textContent() !== "0") throw new Error("Pencil opened full Step editor");
    if (await dialog.getByRole("textbox", { name: `${label} 제목`, exact: true }).count() !== 1) throw new Error("Must edit one item only");
    await dialog.getByRole("textbox", { name: `${label} 제목`, exact: true }).fill(`${label} 단독 수정`);
    await dialog.getByRole("textbox", { name: `${label} 내용`, exact: true }).fill(`${label} 변경 내용`);
    await dialog.getByRole("textbox", { name: `${label} 링크 URL`, exact: true }).fill("https://example.com/edited");
    await dialog.getByRole("button", { name: `${label} 저장`, exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    const project = await savedProject();
    const item = project.steps[0][collection][0];
    if (item.title !== `${label} 단독 수정` || !item.content.includes(`${label} 변경 내용`) || item.url !== "https://example.com/edited") throw new Error("Item edits not saved");
    if (JSON.stringify(project.steps[1]) !== JSON.stringify(initial.steps[1]) || JSON.stringify(project.steps[0].activities[1]) !== JSON.stringify(initial.steps[0].activities[1]) || JSON.stringify(project.steps[0].itemOrder) !== JSON.stringify(initial.steps[0].itemOrder)) throw new Error("Unrelated items or order changed");
  }
  const beforeFailure = await savedProject();
  await page.getByLabel("저장 실패").check();
  await page.getByRole("button", { name: "활동 수정", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "활동 제목", exact: true }).fill("실패 후 유지할 입력");
  await dialog.getByRole("button", { name: "활동 저장", exact: true }).click();
  await page.waitForTimeout(300);
  if (!await dialog.isVisible() || await dialog.getByRole("textbox", { name: "활동 제목", exact: true }).inputValue() !== "실패 후 유지할 입력") throw new Error("Failed save discarded input");
  await dialog.getByRole("button", { name: "닫기", exact: true }).last().click();
  if (JSON.stringify(await savedProject()) !== JSON.stringify(beforeFailure)) throw new Error("Failed or cancelled edit changed project");
  await page.getByRole("button", { name: "Step 편집", exact: true }).click();
  if (await page.getByTestId("step-edits").textContent() !== "1") throw new Error("Explicit Step editor command changed");
  return "Activity/resource pencil, isolated saves, failure retention, cancellation, and Step command passed";
}
