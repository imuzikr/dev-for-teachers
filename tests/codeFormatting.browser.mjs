export default async function verifyCodeFormatting(page, baseUrl = "http://localhost:3027") {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const normalize = (text) => text.replace(/\r\n/g, "\n");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${baseUrl}/qa-code`);
  const display = page.locator('[data-testid="display"]');
  const copy = display.getByRole("button", { name: "코드 복사", exact: true });
  await copy.waitFor();
  assert(!await display.locator("pre").isVisible(), "Student code must be collapsed into a copy row");
  assert(await page.locator('[data-testid="teacher"] pre').isVisible(), "Teacher code must remain expanded");
  await display.getByRole("checkbox").check();
  await copy.click();
  assert(normalize(await page.evaluate(() => navigator.clipboard.readText())) === "rules_version = '2';\n  allow read: if x < 10 && y > 0;", "Code copy must preserve whitespace and literal HTML characters");
  assert(await display.getByRole("checkbox").isChecked(), "Copy must preserve checklist state");
  await page.locator('[data-testid="template"]').getByRole("button", { name: "코드 복사", exact: true }).click();
  assert(!await page.locator('[data-testid="template"] pre').isVisible(), "Template code must use the compact student row");
  assert(normalize(await page.evaluate(() => navigator.clipboard.readText())) === "const value = 1;\n  console.log(value);", "Template code must copy substituted values");
  const editor = page.getByRole("textbox", { name: "서식 입력" });
  await editor.fill("");
  await page.getByRole("button", { name: "코드 블록", exact: true }).click();
  await page.keyboard.type("const a = 1;");
  await page.keyboard.press("Enter");
  await page.keyboard.type("  const b = 2;");
  await page.getByRole("button", { name: "코드 밖으로", exact: true }).click();
  await page.keyboard.type("Outside code");
  assert(await page.getByRole("button", { name: "코드 밖으로", exact: true }).isDisabled(), "Exit control must disable outside code");
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
  await editor.evaluate((area) => {
    area.innerHTML = '<ul class="rte-checklist"><li><label><input type="checkbox"><span class="rte-checklist-text">Code task<pre><code>const nested = 1;</code></pre></span></label></li></ul>';
    area.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  await editor.locator("pre").click();
  await page.getByRole("button", { name: "코드 밖으로", exact: true }).click();
  await page.getByRole("button", { name: "체크리스트", exact: true }).click();
  await page.keyboard.type("Next task");
  assert(await editor.locator('input[type="checkbox"]').count() === 2, "Exiting nested code must preserve the original checklist when adding a new task");
  assert(await editor.locator("pre").textContent() === "const nested = 1;", "Exiting nested code must preserve its content");
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflow at ${width}px`);
  }
  return "Code formatting, copying, templates, checklist preservation, permission recovery and responsive checks passed";
}
