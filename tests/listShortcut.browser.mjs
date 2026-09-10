import assert from "node:assert/strict";

export default async function verifyListShortcut(page, baseUrl) {
  await page.goto(`${baseUrl}/qa-list-shortcut`);
  const editor = page.getByRole("textbox", { name: "서식 입력", exact: true });
  const reset = async () => { await page.getByRole("button", { name: "초기화", exact: true }).click(); await editor.click(); };
  for (const prefix of ["", "이전 문단\n"]) {
    await reset();
    if (prefix) { await page.keyboard.insertText("이전 문단"); await page.keyboard.press("Enter"); }
    await page.keyboard.type("- ");
    await page.keyboard.insertText("목록 내용");
    assert.equal(await editor.locator("ul > li").last().textContent(), "목록 내용");
    assert((await page.getByTestId("html").textContent()).includes("<ul>"));
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("다음 항목");
    assert.equal(await editor.locator("ul > li").count(), 2);
  }
  await reset();
  await page.keyboard.type("text - ");
  assert.equal(await editor.locator("ul").count(), 0);
  await reset();
  await page.keyboard.insertText("이전 줄");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("- ");
  assert.equal(await editor.locator("ul").count(), 1);
  assert(!(await editor.locator("ul").textContent()).includes("이전 줄"));
  await reset();
  await page.getByRole("button", { name: "코드 블록", exact: true }).click();
  await page.keyboard.type("- ");
  assert.equal(await editor.locator("ul").count(), 0);
  assert((await editor.locator("pre").textContent()).startsWith("-"));
  await reset();
  await page.getByRole("button", { name: "글머리 기호", exact: true }).click();
  await page.keyboard.type("- ");
  assert.equal(await editor.locator("ul ul").count(), 0);
  assert((await editor.locator("li").textContent()).startsWith("-"));
  await reset();
  await page.keyboard.type("-");
  await editor.dispatchEvent("keydown", { key: " ", isComposing: true });
  assert.equal(await editor.locator("ul").count(), 0);
  return "Hyphen-space shortcut, paragraphs, soft breaks, continuation, code/list exclusions and composition passed";
}
