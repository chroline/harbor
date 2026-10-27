// Run: ego-browser nodejs < tests/message-preview-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(
  globalThis.HARBOR_QA_SPACE ?? "Harbor message preview QA",
);
const page = task.page("p1");
await page.goto("http://127.0.0.1:1420/tests/ui.html");
await page.waitForSelector('[aria-label="Describe a new task"]');
await page.fill(
  '[aria-label="Describe a new task"]',
  "Review these tickets:\n\n" +
    "- First ticket covers the platform findings.\n" +
    "- Second ticket covers the input validation findings.\n" +
    "- Third ticket covers the remaining authorization findings.\n\n" +
    "Keep all of this message readable when expanded.\n\n" +
    "Additional details. ".repeat(80),
);
await page.click('loc=role:button[name="Start task"]');
await page.waitForSelector('.transcript-user .typeset');
await page.evaluate(() => document.fonts.ready);

for (const width of [1500, 600]) {
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height: 850,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const preview = await page.evaluate(() => {
    const text = document.querySelector(".transcript-user .typeset");
    const bounds = text.getBoundingClientRect();
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    const lines = new Map();
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      for (const rect of range.getClientRects()) {
        if (rect.top >= bounds.top && rect.top < bounds.bottom) {
          lines.set(rect.top, rect.bottom <= bounds.bottom + 0.5);
        }
      }
    }
    return {
      lines: lines.size,
      completeLines: [...lines.values()].every(Boolean),
      clamp: getComputedStyle(text).webkitLineClamp,
      truncated: text.scrollHeight > text.clientHeight,
      height: bounds.height,
    };
  });
  assert.equal(preview.lines, 3, `Three lines at ${width}px`);
  assert.equal(preview.completeLines, true, `No cut-off text at ${width}px`);
  assert.equal(preview.clamp, "3");
  assert.equal(preview.truncated, true);

  await page.click('loc=role:button[name="Expand message"]');
  await page.evaluate(async () => {
    await window.__harborFixture.update({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "The response continues." },
    });
  });
  const expanded = await page.evaluate(() => {
    const text = document.querySelector(".transcript-user .typeset");
    return {
      expanded: text.closest("[aria-expanded]").getAttribute("aria-expanded"),
      clamp: getComputedStyle(text).webkitLineClamp,
      height: text.clientHeight,
      scrollHeight: text.scrollHeight,
    };
  });
  assert.equal(expanded.expanded, "true", "Stays open during streaming");
  assert.equal(expanded.clamp, "none");
  assert.equal(expanded.height, expanded.scrollHeight, "All text is visible");
  assert.ok(expanded.height > preview.height);
  await page.press('loc=role:button[name="Collapse message"]', "Space");
  assert.equal(
    await page.evaluate(() =>
      document.querySelector('.transcript-user [aria-expanded]')
        .getAttribute("aria-expanded"),
    ),
    "false",
  );
}
console.log("Passed: three complete preview lines, native ellipsis, full expansion, streaming persistence, and keyboard collapse at wide and narrow widths.");
if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
