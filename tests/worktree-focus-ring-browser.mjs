// Run with Vite using ego-browser nodejs < tests/worktree-focus-ring-browser.mjs.
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(globalThis.HARBOR_QA_SPACE ?? "Worktree focus ring clipping");
const page = task.page("p1");
await page.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await page.goto("http://127.0.0.1:1420/tests/ui.html?empty");
await page.waitForSelector('loc=role:button[name="Workspace for new task"]');
await page.click('loc=role:button[name="Workspace for new task"]', { label: "open test workspace list" });
await page.waitForSelector('loc=role:menuitemradio[name="repository"]');
await page.click('loc=role:menuitemradio[name="repository"]', { label: "select test repository" });
await page.waitForSelector('loc=role:button[name="Working directory"]');
await page.focus('loc=role:button[name="Working directory"]');
await page.keyboard.press("Enter");
await page.waitForSelector('loc=role:menuitemradio[name="New worktree"]');
for (const theme of ["light", "dark"]) {
  await page.evaluate(theme => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
  }, theme);
  for (const key of ["Home", "End"]) {
    await page.keyboard.press(key);
    await page.waitForFunction(() => {
      const row = document.activeElement;
      const ring = [...document.querySelectorAll('.worktree-picker-menu [role="group"] > div')]
        .find(el => el.className.includes("var(--focus-ring"));
      if (!ring || row?.getAttribute("role") !== "menuitemradio") return false;
      const r = ring.getBoundingClientRect(), item = row.getBoundingClientRect();
      return Math.abs(r.top - item.top + 2) < 0.1;
    });
    const dimensions = await page.evaluate(() => {
      const viewport = document.querySelector(".worktree-picker-viewport").getBoundingClientRect();
      const ring = [...document.querySelectorAll('.worktree-picker-menu [role="group"] > div')]
        .find(el => el.className.includes("var(--focus-ring")).getBoundingClientRect();
      const panel = document.querySelector(".worktree-picker-menu").getBoundingClientRect();
      return { width: panel.width, height: panel.height,
        contained: ring.left >= viewport.left - 0.1 && ring.right <= viewport.right + 0.1 &&
          ring.top >= viewport.top - 0.1 && ring.bottom <= viewport.bottom + 0.1 };
    });
    assert.equal(dimensions.contained, true, `${theme} ${key}: entire ring fits inside clip`);
    assert.equal(dimensions.width, 288);
    assert.equal(dimensions.height, 64);
    console.log({ theme, key, ...dimensions });
  }
}
console.log(await page.screenshot({ path: "/tmp/harbor-complete-focus-ring.png" }));
if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
