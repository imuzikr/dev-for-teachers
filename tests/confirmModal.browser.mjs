export default async function verifyConfirmationModal(page, baseUrl = "http://localhost:3033") {
  for (const kind of ["resource", "activity"]) {
    await page.goto(`${baseUrl}/qa-confirm`);
    await page.getByRole("combobox", { name: "종류" }).selectOption(kind);
    await page.getByRole("button", { name: "열기", exact: true }).click();
    await page.getByRole("button", { name: "확인", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    if (await page.locator("output").textContent() !== "확인 완료") throw new Error("Confirmation must complete before closing");
  }
  await page.getByLabel("저장 실패").check();
  await page.getByRole("button", { name: "열기", exact: true }).click();
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await page.getByRole("button", { name: "확인", exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.student-activity-detail-actions .btn-primary').disabled);
  if (!await page.getByRole("dialog").isVisible()) throw new Error("Failed saves must retain modal");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByLabel("저장 실패").uncheck();
  await page.getByLabel("패널", { exact: true }).check();
  await page.getByRole("button", { name: "열기", exact: true }).click();
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await page.getByRole("button", { name: "확인됨", exact: true }).waitFor();
  if (!await page.locator(".student-activity-detail").isVisible()) throw new Error("Panel must remain open after confirmation");
  return "Resource/activity confirmation closes modal; failures and panel confirmation retain content";
}
