// Run against Vite: ego-browser nodejs < tests/terminal-tabs-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace("Harbor terminal tabs 2026-10-20");
console.log({ spaceId: task.spaceId });
const page = task.page("p1");
await page.goto("http://127.0.0.1:1420/tests/ui.html");
await page.waitForSelector('[aria-label="Describe a new task"]');
await page.fill('[aria-label="Describe a new task"]', "Terminal tabs QA");
await page.click('[aria-label="Start task"]');
await page.waitForSelector('[aria-label="New terminal tab"]');
await page.click('[aria-label="New terminal tab"]');
await page.waitForFunction(
  () => !!document.querySelector(".native-terminal .xterm-helper-textarea"),
);
const first = await page.evaluate(
  () =>
    window.__harborFixture
      .snapshot()
      .calls.find((c) => c.command === "terminal_snapshot").args.sessionId,
);
await page.evaluate(async (id) => {
  await window.__harborFixture.terminalOutput(id, "FIRST SESSION\r\n");
  window.__harborFixture.terminalStatus(id, "src — vim");
}, first);
await page.waitForSelector('[role="tab"][title="src — vim"]');
await page.keyboard.type("pwd");
await page.keyboard.press("Enter");
assert(
  await page.evaluate(
    (id) =>
      window.__harborFixture
        .snapshot()
        .calls.some(
          (c) =>
            c.command === "terminal_input" &&
            c.args.sessionId === id &&
            c.args.data.includes("p"),
        ),
    first,
  ),
);
await page.keyboard.press("Meta+t");
await page.waitForFunction(
  () => document.querySelectorAll(".native-terminal").length === 2,
);
const second = await page.evaluate(
  () =>
    window.__harborFixture
      .snapshot()
      .calls.filter((c) => c.command === "terminal_snapshot")
      .at(-1).args.sessionId,
);
assert.notEqual(first, second);
await page.evaluate(async (id) => {
  await window.__harborFixture.terminalOutput(
    id,
    "SECOND SESSION\r\n\x1b]2;Custom terminal title\x07",
  );
}, second);
await page.waitForSelector('[role="tab"][title="Custom terminal title"]');
assert.equal(
  await page.evaluate(() =>
    [...document.querySelectorAll(".native-terminal")]
      .filter((e) => getComputedStyle(e).display !== "none")[0]
      .textContent.includes("FIRST SESSION"),
  ),
  false,
);
await page.click('[role="tab"][title="src — vim"]');
await page.waitForFunction(() =>
  [...document.querySelectorAll(".native-terminal")].some(
    (e) =>
      getComputedStyle(e).display !== "none" &&
      e.textContent.includes("FIRST SESSION"),
  ),
);
await page.click('[role="tab"][title="Parent conversation"]');
await page.waitForSelector('[aria-label="Message your agent"]');
assert.equal(
  await page.evaluate(
    () => document.querySelectorAll(".native-terminal").length,
  ),
  2,
);
// Leaving and returning to the task restores shells through backend listing/replay.
await page.keyboard.press("Meta+n");
await page.waitForSelector('[aria-label="Describe a new task"]');
await page.click('loc=role:button[name="Terminal tabs QA"]');
await page.waitForSelector('[role="tab"][title="src — vim"]');
await page.click('[role="tab"][title="src — vim"]');
await page.waitForFunction(() =>
  [...document.querySelectorAll(".native-terminal")].some(
    (e) =>
      getComputedStyle(e).display !== "none" &&
      e.textContent.includes("FIRST SESSION"),
  ),
);
await page.evaluate(
  (id) =>
    window.__harborFixture.terminalStatus(
      id,
      "a-very-long-folder-name-to-check-title-truncation — sleep",
    ),
  first,
);
await page.waitForSelector('[role="tab"][title^="a-very-long-folder"]');
for (const width of [1462, 650]) {
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  assert(
    await page.evaluate(() => {
      const add = document
        .querySelector('[aria-label="New terminal tab"]')
        .getBoundingClientRect();
      const terminal = [...document.querySelectorAll(".native-terminal")]
        .find((e) => getComputedStyle(e).display !== "none")
        .getBoundingClientRect();
      return (
        add.left >= 0 &&
        add.right <= innerWidth &&
        terminal.width > 100 &&
        document.documentElement.scrollWidth <= innerWidth
      );
    }),
  );
}
console.log(
  await page.screenshot({ path: "/tmp/harbor-terminal-tabs-narrow.png" }),
);
await page.keyboard.press("Meta+w");
await page.waitForSelector('[aria-label="Message your agent"]');
assert.equal(
  await page.evaluate(() => document.querySelectorAll(".terminal-tab").length),
  1,
);
await page.click('[role="tab"][title="Custom terminal title"]');
await page.evaluate(
  (id) =>
    window.__harborFixture.terminalStatus(
      id,
      "repository — zsh (exited)",
      false,
    ),
  second,
);
await page.waitForSelector('[role="tab"][title="repository — zsh (exited)"]');
await page.waitForFunction(() =>
  document.body.textContent.includes("Shell exited."),
);
await page.click('[aria-label="Close repository — zsh (exited)"]');
await page.waitForSelector('[aria-label="Message your agent"]');
assert.equal(
  await page.evaluate(() => document.querySelectorAll(".terminal-tab").length),
  0,
);
console.log(
  "Passed creation, input routing, independent output, live process/OSC titles, switching, replay, narrow layout, shortcuts, closing and shell exit.",
);
await task.finish({ keep: [] });
