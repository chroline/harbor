// Run: ego-browser nodejs < tests/sticky-user-messages-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(
  globalThis.HARBOR_QA_SPACE ?? "Harbor sticky messages QA",
);
const page = task.page("p1");
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1500,
  height: 740,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.goto("http://127.0.0.1:1420/tests/ui.html");
await page.waitForSelector('[aria-label="Describe a new task"]');
await page.fill('[aria-label="Describe a new task"]', "Sticky prompts");
await page.click('loc=role:button[name="Start task"]');
await page.waitForSelector('[aria-label="Message your agent"]');
await page.evaluate(async () => window.__harborFixture.longTranscript());
await page.waitForFunction(
  () => document.querySelectorAll(".transcript-user").length === 100,
);
// Leave follow-output mode through the public navigation control.
await page.click('button[aria-label="Jump to: Review case 30"]');
await page.waitForFunction(() => {
  const viewport = document.querySelector(
    '[data-slot="message-scroller-viewport"]',
  );
  const row = [...document.querySelectorAll(".transcript-turn")].find(
    (row) =>
      row.querySelector(".transcript-user .typeset")?.textContent ===
      "Review case 30",
  );
  return (
    Math.abs(
      row.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top -
        20,
    ) < 1
  );
});

async function scrollIntoResponse(text) {
  const result = await page.evaluate((text) => {
    const viewport = document.querySelector(
      '[data-slot="message-scroller-viewport"]',
    );
    const message = [...document.querySelectorAll(".transcript-user")].find(
      (message) => message.querySelector(".typeset").textContent === text,
    );
    const row = message.closest(".transcript-turn");
    viewport.scrollTop +=
      row.getBoundingClientRect().top -
      viewport.getBoundingClientRect().top +
      110;
    // No animation frames or scroll events: the header must cover the top
    // gap and rounded corners in the same task that changes scroll position.
    const header = row.querySelector(".transcript-prompt-header");
    if (!header) return { headerExists: false };
    const top = viewport.getBoundingClientRect().top;
    const bounds = header.getBoundingClientRect();
    const prompt = message.getBoundingClientRect();
    const covers = (x, y) => header.contains(document.elementFromPoint(x, y));
    const background = getComputedStyle(header).backgroundColor;
    const color = document.createElement("canvas").getContext("2d");
    color.fillStyle = background;
    color.fillRect(0, 0, 1, 1);
    return {
      headerExists: true,
      nativeSticky: getComputedStyle(header).position === "sticky",
      coversViewportEdge: bounds.top <= top,
      bubbleInset: Math.abs(prompt.top - top - 8) < 1,
      opaque: color.getImageData(0, 0, 1, 1).data[3] === 255,
      preservesPaneTransparency:
        getComputedStyle(viewport.closest(".chat-main")).backgroundColor ===
        "rgba(0, 0, 0, 0)",
      fullWidth: Math.abs(bounds.width - row.getBoundingClientRect().width) < 1,
      coversTopGap: covers(bounds.left + bounds.width / 2, top + 2),
      coversFirstPixel: covers(bounds.left + bounds.width / 2, top + 0.25),
      coversBothCorners:
        covers(bounds.left + 1, bounds.bottom - 1) &&
        covers(bounds.right - 1, bounds.bottom - 1),
      showsResponseBelow: !!document
        .elementFromPoint(bounds.left + 20, bounds.bottom + 1)
        ?.closest(".transcript-responses"),
      noAnimatedClip: !row
        .querySelector(".transcript-responses")
        .getAnimations({ subtree: true })
        .some((animation) =>
          animation.effect.getKeyframes().some((frame) => "clipPath" in frame),
        ),
      rowStaysInFlow: row.getBoundingClientRect().top < top - 100,
    };
  }, text);
  assert.deepEqual(result, {
    headerExists: true,
    nativeSticky: true,
    coversViewportEdge: true,
    bubbleInset: true,
    opaque: true,
    preservesPaneTransparency: true,
    fullWidth: true,
    coversTopGap: true,
    coversFirstPixel: true,
    coversBothCorners: true,
    showsResponseBelow: true,
    noAnimatedClip: true,
    rowStaysInFlow: true,
  });
}

await scrollIntoResponse("Review case 30");
await scrollIntoResponse("Review case 31");
await scrollIntoResponse("Review case 30");

// Abrupt upward and downward jumps must expose response text immediately
// below the header without waiting for a clipping animation to catch up.
assert.deepEqual(
  await page.evaluate(() => {
    const viewport = document.querySelector(
      '[data-slot="message-scroller-viewport"]',
    );
    const row = [...document.querySelectorAll(".transcript-turn")].find(
      (row) =>
        row.querySelector(".transcript-user .typeset")?.textContent ===
        "Review case 30",
    );
    const header = row.querySelector(".transcript-prompt-header");
    return [90, -100, 70, -60].map((delta) => {
      viewport.scrollTop += delta;
      const bounds = header.getBoundingClientRect();
      const x = bounds.left + bounds.width / 2;
      return (
        header.contains(
          document.elementFromPoint(
            x,
            viewport.getBoundingClientRect().top + 2,
          ),
        ) &&
        !!document
          .elementFromPoint(x, bounds.bottom + 1)
          ?.closest(".transcript-responses")
      );
    });
  }),
  [true, true, true, true],
);

// Check paused streaming before wheel input, whose native momentum can still
// change scrollTop after the input call returns.
const before = await page.evaluate(
  () =>
    document.querySelector('[data-slot="message-scroller-viewport"]').scrollTop,
);
await page.evaluate(async () =>
  window.__harborFixture.update({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: " STICKY_STREAM_CHECK" },
  }),
);
await page.waitForFunction(() =>
  document.body.textContent.includes("STICKY_STREAM_CHECK"),
);
assert.equal(
  await page.evaluate(
    () =>
      document.querySelector('[data-slot="message-scroller-viewport"]')
        .scrollTop,
  ),
  before,
);
await scrollIntoResponse("Review case 30");

// Exercise real wheel input too, including handoff between adjacent turns.
await page.mouse.move(900, 250);
await page.mouse.wheel(0, 900, { label: "Scroll quickly down transcript" });
await page.mouse.wheel(0, -800, { label: "Scroll quickly up transcript" });
await scrollIntoResponse("Review case 30");

await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 600,
  height: 740,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.evaluate(() => {
  document.documentElement.classList.remove("dark");
  document.documentElement.classList.add("light");
});
await page.cdp("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
await scrollIntoResponse("Review case 40");
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);

await page.evaluate(() => {
  document.querySelector('[data-slot="message-scroller-viewport"]').scrollTop =
    0;
});
assert.equal(
  await page.evaluate(() => {
    const viewport = document.querySelector(
      '[data-slot="message-scroller-viewport"]',
    );
    return [...document.querySelectorAll(".transcript-user")].every(
      (message) =>
        message.getBoundingClientRect().top >
        viewport.getBoundingClientRect().top + 8,
    );
  }),
  true,
);
console.log(
  "Passed: opaque native sticky headers, no text above or through corners, immediate response visibility on fast upward/downward scrolling, turn handoff, stable streaming, narrow light layout, and reduced motion.",
);
if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
