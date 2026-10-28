// Run: ego-browser nodejs < tests/ai-elements-browser.mjs
// Prepend globalThis.HARBOR_QA_SPACE = <id> to reuse an existing QA task space.
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(
  globalThis.HARBOR_QA_SPACE ?? "Harbor AI Elements QA",
);
const page = task.page("p1");
await page.goto("http://127.0.0.1:1420/tests/ui.html");
await page.waitForSelector('loc=css:[aria-label="Describe a new task"]');
await page.fill(
  'loc=css:[aria-label="Describe a new task"]',
  "AI Elements browser regression",
);
await page.click('loc=role:button[name="Start task"]');
await page.waitForSelector('loc=css:[aria-label="Message your agent"]');
await page.evaluate(async () => {
  await window.__harborFixture.longTranscript();
});
await page.waitForFunction(
  () =>
    document.querySelectorAll(
      '[data-slot="message-scroller-viewport"] .transcript-turn',
    ).length === 121,
);
const settled = () => {
  const v = document.querySelector('[data-slot="message-scroller-viewport"]');
  return (
    v &&
    !v.hasAttribute("data-autoscrolling") &&
    !v.hasAttribute("data-pending-scroll")
  );
};
await page.waitForFunction(settled);
const top = () =>
  document.querySelector('[data-slot="message-scroller-viewport"]').scrollTop;
await page.waitForFunction(
  () =>
    !document
      .querySelector('[data-slot="message-scroller-viewport"]')
      .hasAttribute("data-pending-scroll"),
);
// Opening/restoration runs on animation frames; wait before sending a scroll key.
await page.evaluate(
  () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    ),
);
await page.press('loc=css:[data-slot="message-scroller-viewport"]', "Home");
await page.waitForFunction(
  () =>
    document.querySelector('[data-slot="message-scroller-viewport"]')
      .scrollTop === 0,
);
await page.evaluate(() => {
  document.querySelector('[data-slot="message-scroller-viewport"]').scrollTop =
    2000;
});
// Let the primitive observe the programmatic scroll before injecting a new event.
await page.waitForFunction(() =>
  document
    .querySelector('[data-slot="message-scroller-viewport"]')
    .dataset.scrollable?.includes("end"),
);
await page.waitForFunction(
  () =>
    document.querySelector('[data-slot="message-scroller-button"]').dataset
      .active === "true",
);
await page.evaluate(async () => {
  await window.__harborFixture.update({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "STREAMED_RESPONSE_739" },
  });
});
await page.waitForFunction(() =>
  document.body.textContent.includes("STREAMED_RESPONSE_739"),
);
// One older row can be evicted by the existing complete virtualized history. Continue the
// same stream for the strict position check, so no additional row is removed.
await page.waitForFunction(settled);
await page.waitForFunction(
  () =>
    !document
      .querySelector('[data-slot="message-scroller-viewport"]')
      .hasAttribute("data-pending-scroll"),
);
// Opening/restoration runs on animation frames; wait before sending a scroll key.
await page.evaluate(
  () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    ),
);
await page.press('loc=css:[data-slot="message-scroller-viewport"]', "Home");
await page.waitForFunction(
  () =>
    document.querySelector('[data-slot="message-scroller-viewport"]')
      .scrollTop === 0,
);
await page.evaluate(() => {
  document.querySelector('[data-slot="message-scroller-viewport"]').scrollTop =
    2000;
});
// Let the primitive observe the programmatic scroll before injecting a new event.
await page.waitForFunction(() =>
  document
    .querySelector('[data-slot="message-scroller-viewport"]')
    .dataset.scrollable?.includes("end"),
);
await page.evaluate(async () => {
  await window.__harborFixture.update({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: " STREAMED_RESPONSE_740" },
  });
});
await page.waitForFunction(() =>
  document.body.textContent.includes("STREAMED_RESPONSE_740"),
);
assert.equal(
  await page.evaluate(top),
  2000,
  "Streaming must preserve an earlier reading position",
);

await page.evaluate(async () => {
  await window.__harborFixture.request(
    "session/request_permission",
    {
      sessionId: "wire-child",
      _harborChildId: "wire-child",
      _harborRequestId: 0,
      toolCall: { title: "Run checks" },
      options: [
        {
          optionId: "allow-501",
          kind: "allow_once",
          name: "Run fixture checks",
        },
      ],
    },
    501,
  );
});
await page.waitForSelector('loc=css:[data-message-id="request:501"]');
assert.equal(
  await page.evaluate(top),
  2000,
  "A request must not pull a reader away from history",
);
await page.click('loc=role:button[name="Run fixture checks"]');
await page.waitForFunction(
  () => !document.querySelector('[data-message-id="request:501"]'),
);
assert.deepEqual(
  await page.evaluate(
    () =>
      window.__harborFixture
        .snapshot()
        .calls.filter((c) => c.command === "answer_request")
        .at(-1).args.requestId,
  ),
  { childId: "wire-child", requestId: 0 },
);

await page.evaluate(async () => {
  await window.__harborFixture.update(
    {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "\n\n" + "Worker detail. ".repeat(1200) },
    },
    "wire-child",
  );
});
await page.waitForFunction(
  () =>
    !document
      .querySelector('[data-slot="message-scroller-viewport"]')
      .hasAttribute("data-pending-scroll"),
);
// Opening/restoration runs on animation frames; wait before sending a scroll key.
await page.evaluate(
  () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    ),
);
await page.press('loc=css:[data-slot="message-scroller-viewport"]', "Home");
await page.waitForFunction(
  () =>
    document.querySelector('[data-slot="message-scroller-viewport"]')
      .scrollTop === 0,
);
await page.evaluate(() => {
  document.querySelector('[data-slot="message-scroller-viewport"]').scrollTop =
    2000;
});
// Let the primitive observe the programmatic scroll before injecting a new event.
await page.waitForFunction(() =>
  document
    .querySelector('[data-slot="message-scroller-viewport"]')
    .dataset.scrollable?.includes("end"),
);
await page.click('loc=role:tab[name="Lighthouse"]');
await page.waitForSelector('loc=css:[aria-label="Message Lighthouse"]');
await page.waitForFunction(
  () =>
    !document
      .querySelector('[data-slot="message-scroller-viewport"]')
      .hasAttribute("data-pending-scroll"),
);
// Opening/restoration runs on animation frames; wait before sending a scroll key.
await page.evaluate(
  () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    ),
);
await page.press('loc=css:[data-slot="message-scroller-viewport"]', "Home");
await page.waitForFunction(
  () =>
    document.querySelector('[data-slot="message-scroller-viewport"]')
      .scrollTop === 0,
);
await page.evaluate(() => {
  document.querySelector('[data-slot="message-scroller-viewport"]').scrollTop =
    400;
});
// Switching conversations always opens at the bottom, even after reading history.
const atBottom = () => {
  const v = document.querySelector('[data-slot="message-scroller-viewport"]');
  return v && Math.abs(v.scrollHeight - v.clientHeight - v.scrollTop) < 2;
};
await page.click('loc=css:[role="tab"][title="Parent conversation"]');
await page.waitForSelector('loc=css:[aria-label="Message your agent"]');
await page.waitForFunction(atBottom);
await page.click('loc=role:tab[name="Lighthouse"]');
await page.waitForSelector('loc=css:[aria-label="Message Lighthouse"]');
await page.waitForFunction(atBottom);
await page.click('loc=css:[role="tab"][title="Parent conversation"]');
await page.waitForSelector('loc=css:[aria-label="Message your agent"]');
await page.waitForFunction(atBottom);
await page.press('loc=css:[data-slot="message-scroller-viewport"]', "Home");
await page.waitForFunction(() => document.querySelector('[data-slot="message-scroller-viewport"]').scrollTop === 0);
await page.click('loc=role:tab[name="Lighthouse"]');
await page.waitForSelector('loc=css:[aria-label="Message Lighthouse"]');
await page.click('loc=css:[role="tab"][title="Parent conversation"]');
await page.waitForSelector('loc=css:[aria-label="Message your agent"]');
await page.waitForFunction(atBottom);
await page.press('loc=css:[data-slot="message-scroller-viewport"]', "Home");
await page.waitForFunction(() => document.querySelector('[data-slot="message-scroller-viewport"]').scrollTop === 0);

await page.click('loc=role:button[name="Scroll to latest"]');
await page.waitForFunction(() => {
  const v = document.querySelector('[data-slot="message-scroller-viewport"]');
  return Math.abs(v.scrollHeight - v.clientHeight - v.scrollTop) < 2;
});
await page.waitForFunction(settled);
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
console.log(
  "Passed: complete virtualized history, paused streaming, request routing, parent/worker tabs opening at the bottom, and jump to latest.",
);

if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
