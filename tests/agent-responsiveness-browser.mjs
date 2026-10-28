// Run with Vite: ego-browser nodejs < tests/agent-responsiveness-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(
  globalThis.HARBOR_QA_SPACE ?? "Harbor streaming responsiveness QA",
);
const page = task.page("p1");
await page.goto("http://127.0.0.1:1420/tests/ui.html");
await page.waitForSelector('[aria-label="Describe a new task"]');
await page.fill(
  '[aria-label="Describe a new task"]',
  "Streaming responsiveness",
);
await page.click('loc=role:button[name="Start task"]');
await page.waitForSelector('[aria-label="Message your agent"]');
await page.evaluate(async () => {
  const fixture = window.__harborFixture;
  await fixture.status("working");
  for (let i = 0; i < 180; i++) {
    await fixture.update({
      sessionUpdate: "tool_call",
      toolCallId: `stress-${i}`,
      title: `Inspect file ${i}`,
      kind: "read",
      status: "completed",
      rawInput: { path: `/tmp/stress-${i}.ts` },
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: Array.from(
              { length: 80 },
              (_, j) => `export const item${j} = "output ${i}";`,
            ).join("\n"),
          },
        },
      ],
    });
  }
  await fixture.update({
    sessionUpdate: "tool_call",
    toolCallId: "stress-live",
    title: "Working",
    kind: "execute",
    status: "in_progress",
  });
});
await page.waitForFunction(
  () =>
    document.querySelectorAll('button[aria-label="View details"]').length ===
    181,
);
assert.equal(
  await page.evaluate(
    () => document.querySelectorAll('[data-slot="file-diff"]').length,
  ),
  0,
);
// Keep emitting while pointer and keyboard input use the real browser paths.
await page.evaluate(() => {
  window.__responsiveness = { chunks: 0, typing: [] };
  window.__responsivenessTimer = setInterval(() => {
    const state = window.__responsiveness;
    void window.__harborFixture.update({
      sessionUpdate: "tool_call_update",
      toolCallId: "stress-live",
      status: "in_progress",
      rawOutput: `chunk ${++state.chunks}`,
    });
  }, 50);
  document
    .querySelector('[aria-label="Message your agent"]')
    .addEventListener("beforeinput", () => {
      const start = performance.now();
      requestAnimationFrame(() =>
        window.__responsiveness.typing.push(performance.now() - start),
      );
    });
});
try {
  for (let i = 0; i < 5; i++) {
    await page.hover('[aria-label="Attach files"]');
    await page.hover('[aria-label="Choose model and reasoning"]');
  }
  const draft = "Typing while the agent runs stays responsive.";
  await page.focus('[aria-label="Message your agent"]');
  await page.keyboard.type(draft);
  await page.waitForFunction(
    () =>
      window.__responsiveness.chunks >= 10 &&
      window.__responsiveness.typing.length >= 40,
  );
  const result = await page.evaluate(() => {
    const times = window.__responsiveness.typing.sort((a, b) => a - b);
    return {
      chunks: window.__responsiveness.chunks,
      typingP95: times[Math.floor(times.length * 0.95)],
      nodes: document.querySelectorAll("*").length,
      draft: document.querySelector('[aria-label="Message your agent"]')
        .textContent,
    };
  });
  assert.equal(result.draft, draft);
  assert.ok(
    result.nodes < 7000,
    `Collapsed tool output inflated DOM to ${result.nodes} nodes`,
  );
  assert.ok(
    result.typingP95 < 100,
    `Input-to-frame p95 was ${result.typingP95}ms`,
  );
  console.log(result);
} finally {
  await page.evaluate(() => clearInterval(window.__responsivenessTimer));
}
await page.click('css=button[aria-label="View details"] >> nth=0');
await page.waitForSelector('[data-slot="file-diff"]');
await page.click('css=button[aria-label="View details"] >> nth=0');
await page.waitForFunction(
  () => document.querySelectorAll('[data-slot="file-diff"]').length === 0,
);
await task.finish({ keep: [] });
