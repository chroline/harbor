// Run with Vite: ego-browser nodejs < tests/tool-terminal-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace("Harbor terminal error display QA");
console.log({ spaceId: task.spaceId });
const page = task.page("p1");
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1400,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.goto("http://127.0.0.1:1420/tests/ui.html");
await page.waitForSelector('[aria-label="Describe a new task"]');
await page.fill(
  '[aria-label="Describe a new task"]',
  "Inspect a failed command",
);
await page.click('loc=role:button[name="Start task"]');
await page.waitForSelector('[aria-label="Message your agent"]');
await page.evaluate(async () => {
  const fixture = window.__harborFixture;
  await fixture.tool({
    toolCallId: "failed-terminal",
    kind: "execute",
    status: "in_progress",
    title:
      "git show origin/main:services/api/src/domains/traces/service/core.ts | rg -n -C 4 issue ".repeat(
        5,
      ),
    content: [{ type: "terminal", terminalId: "failed-terminal" }],
    _meta: { terminal_info: { terminal_id: "failed-terminal" } },
  });
  await fixture.update({
    sessionUpdate: "tool_call_update",
    toolCallId: "failed-terminal",
    _meta: {
      terminal_output: {
        terminal_id: "failed-terminal",
        data: "fatal: invalid object name ",
      },
    },
  });
  await fixture.update({
    sessionUpdate: "tool_call_update",
    toolCallId: "failed-terminal",
    status: "failed",
    _meta: {
      terminal_output: {
        terminal_id: "failed-terminal",
        data: "'origin/main'.\n",
      },
      terminal_exit: { terminal_id: "failed-terminal", exit_code: 128 },
    },
  });
});
await page.click('button[aria-label="View details"]', {
  label: "Inspect failed command output",
});
await page.waitForFunction(() =>
  document
    .querySelector(".tool-detail pre")
    ?.textContent.includes("fatal: invalid object name 'origin/main'."),
);
for (const width of [1400, 650]) {
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const result = await page.evaluate(() => {
    const title = [
      ...document.querySelectorAll('[data-slot="trace-title"]'),
    ].find((el) => el.textContent.startsWith("git show"));
    const style = getComputedStyle(title);
    const detail = document.querySelector(".tool-detail");
    return {
      whiteSpace: style.whiteSpace,
      overflow: style.textOverflow,
      singleLine: title.clientHeight <= parseFloat(style.lineHeight),
      clipped: title.scrollWidth > title.clientWidth,
      error: detail.textContent.includes(
        "fatal: invalid object name 'origin/main'.",
      ),
      exitCode: detail.textContent.includes("Exit code 128"),
      rawTerminalJson: detail.textContent.includes('"terminalId"'),
    };
  });
  assert.deepEqual(result, {
    whiteSpace: "nowrap",
    overflow: "ellipsis",
    singleLine: true,
    clipped: true,
    error: true,
    exitCode: false,
    rawTerminalJson: false,
  });
  console.log({ width, ...result });
}
console.log(await page.screenshot({ path: "/tmp/harbor-terminal-error.png" }));
await task.finish({ keep: [] });
