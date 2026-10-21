// Run with Vite: ego-browser nodejs < tests/model-menu-motion-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(
  globalThis.HARBOR_QA_SPACE ?? "Harbor model menu motion",
);
console.log({ spaceId: task.spaceId });
const page = task.page("p1");
await page.cdp("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
});
await page.goto("http://127.0.0.1:1420/tests/ui.html?empty");
await page.waitForFunction(() => {
  const button = document.querySelector(".model-menu-trigger");
  return button && !button.disabled;
});
await page.evaluate(() => {
  window.__modelMenuSamples = [];
  const sample = () => {
    const el = document.querySelector(
      '[aria-label="Model and agent settings"]',
    );
    if (!el) return;
    const style = getComputedStyle(el);
    window.__modelMenuSamples.push({
      state: el.dataset.state,
      opacity: Number(style.opacity),
      scaleY: new DOMMatrixReadOnly(style.transform).d,
      inert: el.inert,
    });
  };
  window.__modelMenuObserver = new MutationObserver(sample);
  window.__modelMenuObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["style", "data-state", "inert"],
  });
  const frame = () => {
    sample();
    window.__modelMenuFrame = requestAnimationFrame(frame);
  };
  window.__modelMenuFrame = requestAnimationFrame(frame);
});
await page.click('loc=role:button[name="Choose model and reasoning"]');
await page.waitForFunction(() => {
  const el = document.querySelector('[aria-label="Model and agent settings"]');
  return (
    el &&
    getComputedStyle(el).opacity === "1" &&
    getComputedStyle(el).transform === "none"
  );
});
await page.keyboard.press("Escape");
await page.waitForSelector('[aria-label="Model and agent settings"]', {
  state: "detached",
});
await page.waitForFunction(
  () =>
    document.activeElement?.getAttribute("aria-label") ===
    "Choose model and reasoning",
);
const samples = await page.evaluate(() => {
  cancelAnimationFrame(window.__modelMenuFrame);
  window.__modelMenuObserver.disconnect();
  return window.__modelMenuSamples;
});
assert.ok(
  samples.some((s) => s.state === "open" && s.opacity < 1 && s.scaleY < 1),
  "menu fades and grows on entry",
);
assert.ok(
  samples.some(
    (s) =>
      s.state === "closed" && s.opacity > 0 && s.opacity < 1 && s.scaleY < 1,
  ),
  "menu stays mounted through its fade and shrink exit",
);
assert.ok(
  samples.filter((s) => s.state === "closed").every((s) => s.inert),
  "closing menu cannot receive input",
);
console.log({
  entryFrames: samples.filter((s) => s.state === "open" && s.opacity < 1)
    .length,
  exitFrames: samples.filter((s) => s.state === "closed" && s.opacity > 0)
    .length,
});
console.log(
  "Passed: shared entry/exit motion, deferred unmount, inert exit, and trigger focus restoration.",
);
if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
