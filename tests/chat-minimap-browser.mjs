// Run: ego-browser nodejs < tests/chat-minimap-browser.mjs
// Prepend globalThis.HARBOR_QA_SPACE = <id> to reuse a QA task space.
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(globalThis.HARBOR_QA_SPACE ?? "Harbor minimap QA");
const page = task.page("p1");
await page.goto("http://127.0.0.1:1420/tests/ui.html");
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1380,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.waitForSelector('textarea[aria-label="Describe a new task"]');
await page.fill(
  'textarea[aria-label="Describe a new task"]',
  "Minimap regression",
);
await page.click('loc=role:button[name="Start task"]');
await page.waitForSelector('textarea[aria-label="Message your agent"]');
assert.equal(
  await page.evaluate(
    () => !!document.querySelector('[data-slot="chat-minimap"]'),
  ),
  false,
  "A single turn needs no rail",
);
const columnBox = () =>
  page.evaluate(() => {
    const content = document.querySelector(".conversation-content");
    const composer = document.querySelector(".chat-composer-wrap");
    const contentStyle = getComputedStyle(content);
    const composerStyle = getComputedStyle(composer);
    return {
      paddingStart: contentStyle.paddingInlineStart,
      paddingEnd: contentStyle.paddingInlineEnd,
      composerPaddingStart: composerStyle.paddingInlineStart,
      contentWidth: Math.round(content.getBoundingClientRect().width),
      composerWidth: Math.round(composer.getBoundingClientRect().width),
    };
  });
await page.waitForSelector(".conversation-content");
const beforeRail = await columnBox();
await page.evaluate(async () => {
  await window.__harborFixture.longTranscript();
});
await page.waitForFunction(
  () =>
    document.querySelectorAll('[data-slot="chat-minimap-item"]').length ===
      100 &&
    !!document.querySelector('[data-slot="chat-minimap-item"][data-current]'),
);
assert.deepEqual(await columnBox(), beforeRail, "The rail must not resize the column");
assert.equal(
  await page.evaluate(
    () =>
      document
        .querySelector(".conversation-scroll-frame")
        .hasAttribute("data-minimap-overlaps"),
  ),
  false,
  "A wide pane leaves the floating rail in the gutter",
);
assert.equal(
  await page.evaluate(
    () => document.querySelectorAll('[data-slot="message"]').length,
  ),
  200,
);
const marker = 'button[aria-label="Jump to: Review case 30"]';
await page.click(marker);
await page.waitForFunction(() => {
  const current = document.querySelector(
    '[data-slot="chat-minimap-item"][data-current]',
  );
  const row = [...document.querySelectorAll("[data-message-id]")].find((el) =>
    el.textContent.includes("Review case 30"),
  );
  const viewport = document.querySelector(
    '[data-slot="message-scroller-viewport"]',
  );
  return (
    current?.getAttribute("aria-label") === "Jump to: Review case 30" &&
    Math.abs(
      row.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top -
        20,
    ) < 3
  );
});
await page.hover(marker);
await page.waitForSelector('[data-slot="chat-minimap-preview"]');
assert.ok(
  await page.evaluate(() =>
    document
      .querySelector('[data-slot="chat-minimap-preview"]')
      .textContent.includes("Case 30"),
  ),
);
assert.equal(
  await page.evaluate(
    () =>
      document.querySelector(
        'button[aria-label="Jump to: Review case 30"] span',
      ).style.width,
  ),
  "36px",
);
await page.focus(marker);
await page.press(marker, "ArrowDown");
assert.equal(
  await page.evaluate(() => document.activeElement.getAttribute("aria-label")),
  "Jump to: Review case 31",
);
await page.press('button[aria-label="Jump to: Review case 31"]', "Enter");
await page.waitForFunction(
  () =>
    document
      .querySelector('[data-slot="chat-minimap-item"][data-current]')
      ?.getAttribute("aria-label") === "Jump to: Review case 31",
);
await page.press('button[aria-label="Jump to: Review case 31"]', "Escape");
await page.waitForFunction(
  () => !document.querySelector('[data-slot="chat-minimap-preview"]'),
);
await page.focus('textarea[aria-label="Message your agent"]');
const before = await page.evaluate(
  () =>
    document.querySelector('[data-slot="message-scroller-viewport"]').scrollTop,
);
await page.evaluate(async () => {
  await window.__harborFixture.update({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: " MINIMAP_STREAM_740" },
  });
});
await page.waitForFunction(() =>
  document.body.textContent.includes("MINIMAP_STREAM_740"),
);
assert.equal(
  await page.evaluate(
    () =>
      document.querySelector('[data-slot="message-scroller-viewport"]')
        .scrollTop,
  ),
  before,
  "Streaming must leave the reader at the selected turn",
);
await page.cdp("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
await page.evaluate(() => {
  document.documentElement.classList.remove("dark");
  document.documentElement.classList.add("light");
});
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 720,
  height: 620,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.mouse.move(8, 8);
await page.waitForFunction(() => {
  const frame = document.querySelector(".conversation-scroll-frame");
  const rail = document.querySelector(".chat-minimap");
  const style = getComputedStyle(rail);
  return (
    frame.hasAttribute("data-minimap-overlaps") &&
    !frame.hasAttribute("data-minimap-gutter") &&
    Number(style.opacity) === 0 &&
    style.pointerEvents === "none"
  );
});
assert.equal(
  (await columnBox()).paddingStart,
  (await columnBox()).paddingEnd,
  "Overlap still must not pad the column",
);
const gutterPoint = () =>
  page.evaluate(() => {
    const box = document
      .querySelector(".conversation-scroll-frame")
      .getBoundingClientRect();
    return { x: box.left + 12, y: box.top + box.height / 2 };
  });
const enterGutter = async () => {
  const point = await gutterPoint();
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction(() => {
    const style = getComputedStyle(document.querySelector(".chat-minimap"));
    return style.opacity === "1" && style.pointerEvents !== "none";
  });
};
await enterGutter();
await page.mouse.move(8, 8);
await page.waitForFunction(
  () =>
    Number(getComputedStyle(document.querySelector(".chat-minimap")).opacity) ===
    0,
);
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 900,
  height: 620,
  deviceScaleFactor: 1,
  mobile: false,
});
await enterGutter();
await page.click('button[aria-label="Jump to: Review case 40"]');
await page.waitForFunction(
  () =>
    document
      .querySelector('[data-slot="chat-minimap-item"][data-current]')
      ?.getAttribute("aria-label") === "Jump to: Review case 40",
);
await page.hover('button[aria-label="Jump to: Review case 40"]');
await page.waitForSelector('[data-slot="chat-minimap-preview"]');
assert.deepEqual(
  await page.evaluate(() => {
    const preview = document
      .querySelector('[data-slot="chat-minimap-preview"]')
      .getBoundingClientRect();
    const marker = document.querySelector("[data-current] span");
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      previewFits: preview.left >= 0 && preview.right <= innerWidth,
      transition: getComputedStyle(marker).transitionDuration,
    };
  }),
  { overflow: false, previewFits: true, transition: "0s" },
);
console.log(
  "Passed: bounded turn index, smooth jumps, reading position, hover lens and preview, keyboard navigation, paused streaming, floating rail, gutter reveal, narrow light layout, and reduced motion.",
);
if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
