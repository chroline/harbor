// Run: ego-browser nodejs < tests/chat-loading-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(
  globalThis.HARBOR_QA_SPACE ?? "Harbor loading indicator QA",
);
const page = task.page("p1");
await page.goto(
  globalThis.HARBOR_QA_URL ?? "http://127.0.0.1:1420/tests/ui.html",
);
await page.waitForSelector('[aria-label="Describe a new task"]');
await page.fill('[aria-label="Describe a new task"]', "Blank while loading");
await page.click('button[aria-label="Start task"]');
await page.waitForSelector('[aria-label="Message your agent"]');
await page.evaluate(async () => window.__harborFixture.longTranscript());
const saved = await page.evaluate(() => window.__harborFixture.snapshot());
const totalTurns = saved.events.filter(
  (e) => e.kind === "user_message" && !e.payload.childId,
).length;
await page.reload();
await page.waitForSelector('[aria-label="Describe a new task"]');
await page.evaluate(async (saved) => {
  await window.__harborFixture.restore(saved);
  window.__harborFixture.pauseNext("get_events");
}, saved);
await page.click('loc=role:button[name="Blank while loading"]');
await page.waitForFunction(() =>
  window.__harborFixture
    .snapshot()
    .calls.some((c) => c.command === "get_events"),
);
assert.equal(
  await page.evaluate(
    () => !!document.querySelector(".chat-main .conversation-scroll"),
  ),
  false,
  "Loading indicator does not expose partial transcript text",
);
assert.equal(
  await page.evaluate(
    () => !!document.querySelector('[aria-label="Message your agent"]'),
  ),
  false,
  "Composer waits for the full conversation",
);
assert.ok(
  await page.evaluate(
    () =>
      !!document.querySelector(
        '[role="status"][aria-label="Loading conversation"]',
      ),
  ),
  "Loading indicator is visible",
);
await page.waitForFunction(() => {
  const shape = document.querySelector(
    ".chat-loading [data-slot=thinking-indicator-glyph]",
  );
  if (!shape) return false;
  const r = shape.getBoundingClientRect();
  return (
    r.width > 0 &&
    !!document
      .elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      ?.closest(".chat-loading")
  );
});
const initialPath = await page.evaluate(() =>
  document.querySelector(".chat-loading svg path")?.getAttribute("d"),
);
await page.waitForFunction(
  (initialPath) =>
    document.querySelector(".chat-loading svg path")?.getAttribute("d") !==
    initialPath,
  initialPath,
);
await page.cdp("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
const infinityPath =
  "M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z";
await page.waitForFunction(
  (infinityPath) =>
    document.querySelector(".chat-loading svg path")?.getAttribute("d") ===
    infinityPath,
  infinityPath,
);
assert.equal(
  await page.evaluate(
    () =>
      getComputedStyle(document.querySelector(".chat-loading .shimmer-text"))
        .animationName,
  ),
  "none",
  "Reduced motion uses a static glyph and label",
);
await page.cdp("Emulation.setEmulatedMedia", { features: [] });
await page.screenshot({ path: "/tmp/harbor-chat-loading-indicator.png" });
await page.evaluate(async () =>
  window.__harborFixture.update({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: " RECENT_PREVIEW_STREAM" },
  }),
);
assert.equal(
  await page.evaluate(
    () => !!document.querySelector(".chat-main .conversation-scroll"),
  ),
  false,
  "Incoming messages do not reveal a partial transcript",
);
await page.evaluate(() => window.__harborFixture.resume("get_events"));
await page.waitForFunction(
  (totalTurns) =>
    document.querySelectorAll('[data-slot="chat-minimap-item"]').length ===
    totalTurns,
  totalTurns,
);
await page.waitForFunction(() => {
  const v = document.querySelector('[data-slot="message-scroller-viewport"]');
  return Math.abs(v.scrollHeight - v.clientHeight - v.scrollTop) < 2;
});
assert.ok(
  await page.evaluate(() =>
    document.body.textContent.includes("RECENT_PREVIEW_STREAM"),
  ),
);
await page.click('button[aria-label="Jump to: Review case 0"]');
await page.waitForFunction(() =>
  [...document.querySelectorAll(".transcript-user")].some(
    (e) => e.textContent === "Review case 0",
  ),
);
assert.ok(
  await page.evaluate(
    () => document.querySelectorAll(".transcript-user").length < 25,
  ),
  "Entire history remains virtualized",
);
await page.click('button[aria-label="Jump to: Review case 119"]');
await page.waitForFunction(() =>
  [...document.querySelectorAll(".transcript-user")].some(
    (e) => e.textContent === "Review case 119",
  ),
);
assert.equal(
  await page.evaluate(() => !!document.querySelector(".chat-loading")),
  false,
  "Loading indicator disappears after loading",
);
console.log(
  "PASS: thinking indicator replaces partial chat until full hydration; live events are retained; full conversation opens at the bottom and earliest turns remain reachable with bounded rendering",
);
if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
