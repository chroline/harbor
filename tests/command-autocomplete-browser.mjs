// Run with Vite: ego-browser nodejs < tests/command-autocomplete-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(globalThis.HARBOR_QA_SPACE ?? "Harbor commands and skills");
const page = task.page("p1");
const home = 'loc=role:textbox[name="Describe a new task"]';
const chat = 'loc=role:textbox[name="Message your agent"]';
const text = () => page.evaluate(() => document.querySelector(".command-editor").textContent);
await page.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await page.goto("http://127.0.0.1:1420/tests/ui.html?empty");
await page.waitForSelector(home);
for (const width of [1380, 680]) {
  await page.cdp("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: false });
  for (const theme of ["dark", "light"]) {
    await page.evaluate(theme => {
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(theme);
    }, theme);
    await page.fill(home, "/rev");
    await page.waitForSelector('loc=role:option[name*="/review"]');
    const menu = await page.evaluate(() => {
      const rect = document.querySelector(".command-menu").getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight, focus: document.activeElement.matches(".command-editor") };
    });
    assert.ok(menu.focus);
    assert.ok(menu.left >= 0 && menu.right <= menu.width && menu.top >= 0 && menu.bottom <= menu.height);
    await page.keyboard.press("Enter");
    assert.equal(await text(), "/review ");
    const token = await page.evaluate(() => {
      const token = document.querySelector(".command-editor .command-reference");
      return { text: token.textContent, weight: getComputedStyle(token).fontWeight, color: getComputedStyle(token).color, sends: window.__harborFixture.snapshot().calls.filter(c => c.command === "send_prompt").length };
    });
    assert.equal(token.text, "/review");
    assert.equal(token.weight, "700");
    assert.equal(token.sends, 0);
    console.log({ width, theme, tokenColor: token.color });
  }
}
await page.fill(home, "$bu");
await page.keyboard.press("Tab");
assert.equal(await text(), "$build ");
await page.keyboard.press("ControlOrMeta+z");
await page.waitForFunction(() => document.querySelector(".command-editor").textContent === "$bu");
await page.keyboard.press("ControlOrMeta+Shift+z");
await page.waitForFunction(() => document.querySelector(".command-editor").textContent === "$build ");
await page.fill(home, "use $build");
await page.keyboard.press("Home");
for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
await page.keyboard.press("Backspace");
assert.equal(await text(), "use$build");
assert.equal(await page.evaluate(() => document.querySelector(".command-editor .command-reference")), null);
await page.fill(home, "/reviews use $building https://example.com/$build");
assert.equal(await page.evaluate(() => document.querySelector(".command-editor .command-reference")), null);
await page.fill(home, "/review `$build` [link]($build)");
assert.equal(await page.evaluate(() => document.querySelectorAll(".command-editor .command-reference").length), 1);
await page.fill(home, "");
await page.keyboard.paste({text:"$build\nplain text",html:"<b>$build</b><br><i>plain text</i>"});
assert.equal(await page.evaluate(() => document.querySelector(".command-editor").innerText), "$build\nplain text");
assert.equal(await page.evaluate(() => document.querySelector(".command-editor i, .command-editor b")), null);
await page.fill(home, "/review use $build");
await page.click('loc=role:button[name="Start task"]');
await page.waitForSelector(chat);
await page.waitForFunction(() => document.querySelectorAll(".transcript-user .command-reference").length === 2);
assert.equal(await page.evaluate(() => window.__harborFixture.snapshot().calls.find(c => c.command === "send_prompt").args.text), "/review use $build");
await page.fill(chat, "$bu");
await page.waitForSelector('loc=role:option[name*="$build"]');
await page.keyboard.press("Escape");
assert.equal(await page.evaluate(() => document.querySelector(".command-menu")), null);
await page.keyboard.type("i");
await page.waitForSelector('loc=role:option[name*="$build"]');
await page.click('loc=role:option[name*="$build"]');
assert.equal(await text(), "$build ");
await page.fill(chat, "first line");
await page.keyboard.press("Enter");
await page.keyboard.type("$build");
await page.keyboard.press("Escape");
await page.keyboard.press("ControlOrMeta+Enter");
await page.waitForFunction(() => window.__harborFixture.snapshot().calls.filter(c => c.command === "send_prompt").length === 2);
assert.equal(await page.evaluate(() => window.__harborFixture.snapshot().calls.filter(c => c.command === "send_prompt").at(-1).args.text), "first line\n$build");
await page.goto("http://127.0.0.1:1420/tests/ui.html?launch=1");
await page.waitForSelector('loc=role:textbox[name="Task"]');
await page.fill('loc=role:textbox[name="Task"]', "/rev");
await page.waitForSelector('loc=role:option[name*="/review"]');
await page.click('loc=role:option[name*="/review"]');
assert.equal(await text(), "/review ");
assert.equal(await page.evaluate(() => window.__harborFixture.snapshot().calls.filter(c => c.command === "create_session").length), 0);
await page.fill('loc=role:textbox[name="Task"]', "/rev");
await page.waitForSelector('loc=role:listbox[name="Commands and skills"]');
const axeSource = await page.fetch("/node_modules/axe-core/axe.min.js");
await page.evaluate(axeSource.body);
const violations = await page.evaluate(async () => {
  const results = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
  return results.violations.filter(v => v.nodes.some(n => n.target.some(t => /command-editor|command-menu/.test(t)))).map(v => ({id:v.id, nodes:v.nodes.map(n=>n.failureSummary)}));
});
assert.deepEqual(violations, []);
console.log("Passed: home/chat/dialog autocomplete, native prefixes, blue bold text, keyboard/mouse selection, undo/redo, word-boundary edits, multiline submission, themes, menu bounds and composer accessibility.");
