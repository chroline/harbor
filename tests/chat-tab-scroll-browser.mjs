// Run: ego-browser nodejs < tests/chat-tab-scroll-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace("Harbor chat tab scrolling QA");
const page = task.page("p1");
await page.goto(globalThis.HARBOR_QA_URL ?? "http://127.0.0.1:1420/tests/ui.html");
await page.waitForSelector('[aria-label="Describe a new task"]');
await page.fill(
  '[aria-label="Describe a new task"]',
  "Chat tab scroll regression",
);
await page.click('button[aria-label="Start task"]');
await page.waitForSelector('[aria-label="Message your agent"]');
await page.evaluate(async () => {
  await window.__harborFixture.longTranscript();
  await window.__harborFixture.update(
    {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "\n\n" + "Worker detail. ".repeat(1200) },
    },
    "wire-child",
  );
});
async function bottom() {
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-slot="message-scroller-viewport"]');
    return (
      v &&
      v.clientHeight > 0 &&
      !v.hasAttribute("data-pending-scroll") &&
      Math.abs(v.scrollHeight - v.clientHeight - v.scrollTop) < 2
    );
  });
}
async function leaveBottom() {
  await page.press('[data-slot="message-scroller-viewport"]', "Home");
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-slot="message-scroller-viewport"]');
    return v.scrollHeight - v.clientHeight - v.scrollTop > 100;
  });
}
await page.click('loc=role:tab[name="Lighthouse"]');
await page.waitForSelector('[aria-label="Message Lighthouse"]');
await page.click('[role="tab"][title="Parent conversation"]');
await page.waitForSelector('[aria-label="Message your agent"]');
await bottom();
await leaveBottom();
await page.click('loc=role:tab[name="Lighthouse"]');
await page.waitForSelector('[aria-label="Message Lighthouse"]');
await bottom();
await leaveBottom();
await page.click('[role="tab"][title="Parent conversation"]');
await page.waitForSelector('[aria-label="Message your agent"]');
await bottom();
await page.click('loc=role:tab[name="Lighthouse"]');
await page.waitForSelector('[aria-label="Message Lighthouse"]');
await bottom();
await page.click('[role="tab"][title="Parent conversation"]');
await page.waitForSelector('[aria-label="Message your agent"]');
await leaveBottom();
await page.click('[aria-label="New terminal tab"]');
await page.waitForSelector(".shell-terminal-pane .xterm");
await page.click('[role="tab"][title="Parent conversation"]');
await page.waitForSelector('[aria-label="Message your agent"]');
await bottom();
await leaveBottom();
await page.keyboard.press("Meta+n");
await page.waitForSelector('[aria-label="Describe a new task"]');
await page.click('loc=role:button[name="Chat tab scroll regression"]');
await page.waitForSelector('[aria-label="Message your agent"]');
await bottom();
assert.ok(
  await page.evaluate(
    () =>
      document.querySelector('[data-slot="message-scroller-viewport"]')
        .scrollTop > 100,
  ),
);
console.log(
  "PASS: parent/worker switches, return from terminal, and reopening a chat all go to the bottom",
);
await task.finish({ keep: [] });
