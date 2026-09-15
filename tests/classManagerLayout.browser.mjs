import assert from "node:assert/strict";

export default async function verifyClassManagerLayout(page, output) {
  await page.goto("http://127.0.0.1:3251/qa-class");
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.locator(".class-mgr-row--active").evaluate(row => {
      const rect = selector => row.querySelector(selector).getBoundingClientRect();
      const name = rect(".class-mgr-name"), actions = rect(".class-mgr-actions"), header = rect(".class-mgr-row-main");
      const controls = [...row.querySelectorAll(".class-mgr-join-state, .class-mgr-join-code-form input, .class-mgr-join-controls button")].map(el => el.getBoundingClientRect());
      return { aligned: Math.abs(name.y + name.height / 2 - actions.y - actions.height / 2) < 1,
        rightAligned: Math.abs(actions.right - header.right) < 1,
        oneLine: Math.max(...controls.map(r => r.top)) < Math.min(...controls.map(r => r.bottom)),
        fits: row.getBoundingClientRect().right <= innerWidth };
    });
    assert(geometry.aligned && geometry.rightAligned, "Class actions must align with the name at the right edge");
    assert(geometry.oneLine && geometry.fits, "Join controls must share a single row without page overflow");
    await page.screenshot({ path: `${output}/class-manager-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "전체보기", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "가입 차단", exact: true }).click();
  await page.getByRole("button", { name: "가입 허용", exact: true }).waitFor();
  await page.getByRole("button", { name: "자동 생성", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".class-mgr-join-code-form input")?.value === "123456");
  assert.equal(await page.getByLabel("참여 코드", { exact: true }).inputValue(), "123456");
  await page.getByLabel("참여 코드", { exact: true }).fill("654321");
  await page.getByRole("button", { name: "코드 저장", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".class-mgr-join-code-form button")?.disabled === true);
  assert(await page.getByRole("button", { name: "코드 저장", exact: true }).isDisabled());
  await page.getByTitle("이름 수정", { exact: true }).click();
  assert.equal(await page.locator("output").textContent(), "rename");
}
