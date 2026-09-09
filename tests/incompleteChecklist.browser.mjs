export default async function verifyIncompleteChecklist(page, baseUrl = "http://localhost:3035") {
  for (const panel of [false, true]) {
    await page.goto(`${baseUrl}/qa-confirm`);
    await page.getByRole("combobox", { name: "종류" }).selectOption("activity");
    await page.getByLabel("할 일 사용").check();
    if (panel) await page.getByLabel("패널", { exact: true }).check();
    await page.getByRole("button", { name: "직접 확인", exact: true }).click();
    if (await page.locator("output").textContent() !== "미확인") throw new Error("Hook must reject incomplete confirmation");
    await page.getByRole("button", { name: "열기", exact: true }).click();
    const detail = page.locator(panel ? ".student-activity-detail" : ".book-personal-expand-modal");
    const checks = detail.getByRole("checkbox");
    await checks.first().check();
    await detail.getByRole("button", { name: "확인", exact: true }).click();
    const warning = page.getByRole("alertdialog", { name: "미완료 할 일" });
    await warning.waitFor();
    const message = await warning.locator("p").innerText();
    if (message !== "완료되지 않은 할 일이 남아 있습니다.\n모든 할 일을 완료한 후 다시 확인을 눌러주세요.") throw new Error("Incorrect warning text");
    if (await page.locator("output").textContent() !== "미확인") throw new Error("Incomplete activity must not become confirmed");
    await page.keyboard.press("Escape");
    await warning.waitFor({ state: "detached" });
    if (!await detail.isVisible() || !await checks.first().isChecked() || await checks.nth(1).isChecked()) throw new Error("Warning dismissal must preserve detail and checkbox values");
    await checks.nth(1).check();
    await detail.getByRole("button", { name: "확인", exact: true }).click();
    await page.getByText("확인 완료", { exact: true }).waitFor();
    if (!panel) await detail.waitFor({ state: "detached" });
    else if (!await detail.isVisible()) throw new Error("Panel must remain open after success");
  }
  return "Incomplete checklist warning, completion guard, state preservation, and complete checklist confirmation passed in modal and panel";
}
