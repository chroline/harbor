// Run: ego-browser nodejs < tests/typing-performance-browser.mjs
// Simulated IPC; measures actual contenteditable input through the next frame.
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(globalThis.HARBOR_QA_SPACE ?? "Harbor typing performance QA");
const page = task.page("p1");
await page.goto("http://127.0.0.1:1420/tests/ui.html");
await page.waitForSelector('[aria-label="Describe a new task"]');
await page.fill('[aria-label="Describe a new task"]', "Long chat typing performance");
await page.click('loc=role:button[name="Start task"]');
await page.waitForSelector('[aria-label="Message your agent"]');
await page.evaluate(async () => {
  await window.__harborFixture.longTranscript();
  await window.__harborFixture.status("idle");
});
await page.waitForFunction(() => document.querySelectorAll('[data-slot="message"]').length === 200);
await page.evaluate(() => {
  window.__typingFrames = [];
  document.querySelector('[aria-label="Message your agent"]').addEventListener("beforeinput", () => {
    const start = performance.now();
    requestAnimationFrame(() => window.__typingFrames.push(performance.now() - start));
  });
});
const draft = "Typing should stay responsive in a long conversation.";
await page.focus('[aria-label="Message your agent"]');
await page.keyboard.type(draft);
await page.waitForFunction(() => window.__typingFrames.length >= 50);
const result = await page.evaluate(() => {
  const frames = window.__typingFrames.slice().sort((a, b) => a - b);
  return {
    median: frames[Math.floor(frames.length * 0.5)],
    p95: frames[Math.floor(frames.length * 0.95)],
    draft: document.querySelector('[aria-label="Message your agent"]').textContent,
  };
});
assert.equal(result.draft, draft);
assert.ok(result.median < 35, `Typing median ${result.median}ms exceeds 35ms`);
assert.ok(result.p95 < 60, `Typing p95 ${result.p95}ms exceeds 60ms`);
await page.evaluate(async () => {
  await window.__harborFixture.update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "STREAM_STILL_UPDATES_814" } });
});
await page.waitForFunction(() => document.body.textContent.includes("STREAM_STILL_UPDATES_814"));
assert.equal(await page.evaluate(() => document.querySelector('[aria-label="Message your agent"]').textContent), draft);
console.log({ ...result, verified: "200 messages, responsive typing, preserved draft, streamed updates" });
await task.finish({ keep: [] });
