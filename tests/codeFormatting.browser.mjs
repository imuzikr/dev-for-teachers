export default async function verifyCodeFormatting(page, baseUrl = "http://localhost:3027") {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const normalize = (text) => text.replace(/\r\n/g, "\n");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${baseUrl}/qa-code`);
  const display = page.locator('[data-testid="display"]');
  const copy = display.getByRole("button", { name: "코드 복사", exact: true });
  await copy.waitFor();
  await display.getByRole("checkbox").check();
  await copy.click();
  assert(normalize(await page.evaluate(() => navigator.clipboard.readText())) === "rules_version = '2';\n  allow read: if x < 10 && y > 0;", "Code copy must preserve whitespace and literal HTML characters");
  assert(await display.getByRole("checkbox").isChecked(), "Copy must preserve checklist state");
  await page.locator('[data-testid="template"]').getByRole("button", { name: "코드 복사", exact: true }).click();
  assert(normalize(await page.evaluate(() => navigator.clipboard.readText())) === "const value = 1;\n  console.log(value);", "Template code must copy substituted values");
  const editor = page.getByRole("textbox", { name: "서식 입력" });
  await editor.fill("");
  await page.getByRole("button", { name: "코드 블록", exact: true }).click();
  await page.keyboard.type("const a = 1;");
  await page.keyboard.press("Enter");
  await page.keyboard.type("  const b = 2;");
  await page.keyboard.press("Control+Enter");
  await page.keyboard.type("Outside code");
  await copy.click();
  assert(normalize(await page.evaluate(() => navigator.clipboard.readText())) === "const a = 1;\n  const b = 2;", "Copy must exclude prose after code block");
  await page.evaluate(() => {
    window.savedClipboardWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = async () => { throw new Error("Permission denied"); };
  });
  await copy.click();
  assert((await display.getByRole("status").textContent()).includes("실패"), "Denied clipboard permission must be reported");
  await page.evaluate(() => { navigator.clipboard.writeText = window.savedClipboardWrite; });
  await copy.click();
  await display.getByText("복사됨", { exact: true }).waitFor();
  assert(await display.getByRole("status").textContent() === "복사됨", "Copy must recover after failure");
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflow at ${width}px`);
  }
  return "Code formatting, copying, templates, checklist preservation, permission recovery and responsive checks passed";
}
