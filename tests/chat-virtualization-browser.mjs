// Run: ego-browser nodejs < tests/chat-virtualization-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(
  globalThis.HARBOR_QA_SPACE ?? "Harbor chat virtualization QA",
);
const page = task.page("p1");
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1500,
  height: 740,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.goto(
  globalThis.HARBOR_QA_URL ?? "http://127.0.0.1:1420/tests/ui.html",
);
await page.waitForSelector('[aria-label="Describe a new task"]');
await page.fill('[aria-label="Describe a new task"]', "Virtualized chat");
await page.click('button[aria-label="Start task"]');
await page.waitForSelector('[aria-label="Message your agent"]');
await page.evaluate(async () =>
  window.__harborFixture.longTranscript({ image: true }),
);
const totalTurns = await page.evaluate(
  () =>
    window.__harborFixture
      .snapshot()
      .events.filter((e) => e.kind === "user_message" && !e.payload.childId)
      .length,
);
await page.waitForFunction(
  (totalTurns) =>
    document.querySelectorAll(".transcript-turn").length === totalTurns &&
    document.querySelectorAll(".transcript-user").length < 20,
  totalTurns,
);
const mounted = await page.evaluate(
  () => document.querySelectorAll(".transcript-user").length,
);
assert.ok(
  mounted < 20,
  `Only nearby turns should render (${mounted}/${totalTurns})`,
);
async function jump(title) {
  await page.click(`button[aria-label="Jump to: ${title}"]`);
  await page.waitForFunction(
    (title) => {
      const v = document.querySelector(
        '[data-slot="message-scroller-viewport"]',
      );
      const p = [...document.querySelectorAll(".transcript-user")].find(
        (e) => e.textContent === title,
      );
      return (
        p &&
        Math.abs(
          p.closest(".transcript-turn").getBoundingClientRect().top -
            v.getBoundingClientRect().top -
            20,
        ) < 2
      );
    },
    title,
    { timeout: 10000 },
  );
  assert.ok(
    await page.evaluate(
      () => document.querySelectorAll(".transcript-user").length < 25,
    ),
  );
}
await jump("Review case 30");
await page.evaluate(async () => {
  const v = document.querySelector('[data-slot="message-scroller-viewport"]');
  v.dispatchEvent(new WheelEvent("wheel", { deltaY: 110, bubbles: true }));
  v.scrollTop += 110;
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)),
  );
});
assert.ok(
  await page.evaluate(() => {
    const v = document.querySelector('[data-slot="message-scroller-viewport"]');
    const p = [...document.querySelectorAll(".transcript-user")].find(
      (e) => e.textContent === "Review case 30",
    );
    return (
      Math.abs(
        p.parentElement.getBoundingClientRect().top -
          v.getBoundingClientRect().top,
      ) < 3
    );
  }),
  "Prompt remains sticky inside a virtual turn",
);
const readingTop = await page.evaluate(
  () =>
    document.querySelector('[data-slot="message-scroller-viewport"]').scrollTop,
);
await page.evaluate(async () => {
  await window.__harborFixture.update({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: " VIRTUAL_STREAM_CHECK" },
  });
});
await page.waitForFunction(() =>
  document.body.textContent.includes("VIRTUAL_STREAM_CHECK"),
);
assert.equal(
  await page.evaluate(
    () =>
      document.querySelector('[data-slot="message-scroller-viewport"]')
        .scrollTop,
  ),
  readingTop,
  "Streaming must preserve the reader's position in virtualized history",
);
await jump("Review case 0");
await jump("Review case 119");
console.log(
  `PASS: ${mounted}/${totalTurns} turns initially mounted; distant jumps, sticky prompts, and streaming position hold`,
);
if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
