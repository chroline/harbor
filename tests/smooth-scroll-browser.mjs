// Run: ego-browser nodejs < tests/smooth-scroll-browser.mjs
// Prepend globalThis.HARBOR_QA_SPACE = <id> to reuse a QA task space.
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(
  globalThis.HARBOR_QA_SPACE ?? "Harbor smooth scroll QA",
);
const page = task.page("p1");
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1180,
  height: 800,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.cdp("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
});
await page.goto("http://127.0.0.1:1420/tests/ui.html");
await page.waitForSelector('[aria-label="Describe a new task"]');
await page.fill(
  '[aria-label="Describe a new task"]',
  "Smooth streaming scroll",
);
await page.click('loc=role:button[name="Start task"]');
await page.waitForSelector('[aria-label="Message your agent"]');
await page.evaluate(async () => {
  await window.__harborFixture.chunk(
    "\n\n" +
      Array.from(
        { length: 24 },
        (_, i) => `Paragraph ${i + 1}: Follow generated output.`,
      ).join("\n\n"),
  );
});

async function waitForBottom() {
  await page.waitForFunction(() => {
    const viewport = document.querySelector(
      '[data-slot="message-scroller-viewport"]',
    );
    return (
      viewport.scrollTop > 100 &&
      viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 1 &&
      !viewport.hasAttribute("data-autoscrolling")
    );
  });
}

async function measureGrowth(update) {
  await waitForBottom();
  return page.evaluate(async (update) => {
    const viewport = document.querySelector(
      '[data-slot="message-scroller-viewport"]',
    );
    const before = viewport.scrollTop;
    await window.__harborFixture.update(update);
    const samples = [before];
    for (let i = 0; i < 100; i++) {
      await new Promise(requestAnimationFrame);
      samples.push(viewport.scrollTop);
    }
    const movements = samples.slice(1).map((top, i) => top - samples[i]);
    return {
      distance: samples.at(-1) - before,
      movingFrames: movements.filter((delta) => delta > 0).length,
      largestStep: Math.max(...movements),
      remaining:
        viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop,
    };
  }, update);
}

const assistant = await measureGrowth({
  sessionUpdate: "agent_message_chunk",
  content: { type: "text", text: "\n\nAssistant output follows smoothly." },
});
assert.ok(
  assistant.distance > 10,
  "The new paragraph must increase the scroll position",
);
assert.ok(
  assistant.movingFrames >= 4,
  `New output must animate across frames: ${JSON.stringify(assistant)}`,
);
assert.ok(
  assistant.largestStep < assistant.distance / 2,
  "A new line must ease into view instead of jumping most of its height",
);
assert.ok(assistant.remaining < 1, "The animation must reach the bottom");

await page.evaluate(async () => {
  await window.__harborFixture.status("working");
  await window.__harborFixture.update({
    sessionUpdate: "agent_thought_chunk",
    content: { type: "text", text: "Inspecting the scroll behavior." },
  });
});
await page.waitForSelector('[aria-label="View reasoning"]');
const reasoning = await measureGrowth({
  sessionUpdate: "agent_thought_chunk",
  content: { type: "text", text: "\n\nReasoning also follows smoothly." },
});
assert.ok(
  reasoning.movingFrames >= 4,
  `Reasoning must animate: ${JSON.stringify(reasoning)}`,
);
assert.ok(reasoning.remaining < 1);

// Finish the transition out of the reasoning panel before measuring a new
// tool row; that transition can shrink the existing content.
await page.evaluate(async () =>
  window.__harborFixture.tool({
    toolCallId: "smooth-scroll-first-tool",
    title: "Read scroll configuration",
    kind: "read",
    status: "in_progress",
  }),
);
await page.waitForSelector('text="Read scroll configuration"');
const tool = await measureGrowth({
  sessionUpdate: "tool_call",
  toolCallId: "smooth-scroll-tool",
  title: "Inspect scrolling behavior",
  kind: "read",
  status: "in_progress",
});
assert.ok(
  tool.movingFrames >= 4,
  `New tool calls must animate: ${JSON.stringify(tool)}`,
);
assert.ok(tool.remaining < 1);

const newMessage = await measureGrowth({
  sessionUpdate: "agent_message_chunk",
  content: {
    type: "text",
    text: Array.from(
      { length: 8 },
      (_, i) => `New assistant paragraph ${i + 1}.`,
    ).join("\n\n"),
  },
});
assert.ok(
  newMessage.distance > 100 && newMessage.movingFrames >= 4,
  `New assistant messages must keep following: ${JSON.stringify(newMessage)}`,
);
assert.ok(newMessage.remaining < 1);

// Real upward wheel input must stop following, even as more content arrives.
await page.mouse.move(850, 400);
await page.mouse.wheel(0, -400, { label: "Pause following generated output" });
await page.waitForFunction(() => {
  const viewport = document.querySelector(
    '[data-slot="message-scroller-viewport"]',
  );
  return viewport.getAttribute("data-scrollable")?.includes("end");
});
await page.evaluate(async () => {
  const viewport = document.querySelector(
    '[data-slot="message-scroller-viewport"]',
  );
  let previous = viewport.scrollTop,
    stable = 0;
  for (let i = 0; i < 120 && stable < 8; i++) {
    await new Promise(requestAnimationFrame);
    stable = viewport.scrollTop === previous ? stable + 1 : 0;
    previous = viewport.scrollTop;
  }
});
const paused = await page.evaluate(async () => {
  const viewport = document.querySelector(
    '[data-slot="message-scroller-viewport"]',
  );
  const before = viewport.scrollTop;
  await window.__harborFixture.chunk(
    "\n\nOutput continues while you read earlier content.",
  );
  for (let i = 0; i < 100; i++) await new Promise(requestAnimationFrame);
  return { before, after: viewport.scrollTop };
});
assert.equal(
  paused.after,
  paused.before,
  "Reading earlier output must preserve the scroll position",
);

await page.click('button[aria-label="Scroll to latest"]');
await waitForBottom();
const burst = await page.evaluate(async () => {
  const viewport = document.querySelector(
    '[data-slot="message-scroller-viewport"]',
  );
  const before = viewport.scrollTop;
  const samples = [];
  for (let i = 0; i < 180; i++) {
    if (i < 72 && i % 6 === 0)
      await window.__harborFixture.chunk(`\n\nStreamed line ${i / 6 + 1}.`);
    await new Promise(requestAnimationFrame);
    samples.push(viewport.scrollTop);
  }
  return {
    distance: viewport.scrollTop - before,
    movingFrames: samples.slice(1).filter((top, i) => top > samples[i]).length,
    remaining:
      viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop,
  };
});
assert.ok(
  burst.distance > 100 && burst.movingFrames > 12,
  `Continuous output must keep moving: ${JSON.stringify(burst)}`,
);
assert.ok(
  burst.remaining < 1,
  "Continuous updates must settle at the latest content",
);

await page.cdp("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
const reduced = await measureGrowth({
  sessionUpdate: "agent_message_chunk",
  content: { type: "text", text: "\n\nReduced motion stays immediate." },
});
assert.ok(
  reduced.distance > 10 && reduced.movingFrames <= 2,
  `Reduced motion must skip the animation: ${JSON.stringify(reduced)}`,
);
assert.ok(reduced.remaining < 1);
await page.cdp("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
});
console.log(
  "Passed: smooth assistant text, reasoning, tool calls, new messages, continuous streaming, pause/resume, and reduced motion.",
  { assistant, reasoning, tool, newMessage, burst, reduced },
);
if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
