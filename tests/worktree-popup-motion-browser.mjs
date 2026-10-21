// Run with Vite using ego-browser nodejs < tests/worktree-popup-motion-browser.mjs.
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(globalThis.HARBOR_QA_SPACE ?? "Worktree open and close animation");
const page = task.page("p1");
await page.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
await page.goto("http://127.0.0.1:1420/tests/ui.html?empty");
await page.waitForSelector('loc=role:button[name="Workspace for new task"]');
await page.click('loc=role:button[name="Workspace for new task"]', { label: "open test workspace list" });
await page.waitForSelector('loc=role:menuitemradio[name="repository"]');
await page.click('loc=role:menuitemradio[name="repository"]', { label: "select test repository" });
await page.waitForSelector('loc=role:button[name="Working directory"]');
await page.evaluate(() => {
  window.__popupSamples = [];
  const sample = () => {
    const el = document.querySelector('[aria-label="Working directory settings"]');
    if (!el) return;
    const style = getComputedStyle(el), transform = new DOMMatrixReadOnly(style.transform);
    window.__popupSamples.push({ state: el.dataset.state, opacity: Number(style.opacity), scaleY: transform.d, inert: el.inert });
  };
  window.__popupObserver = new MutationObserver(sample);
  window.__popupObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "data-state", "inert"] });
  const frame = () => { sample(); window.__popupFrame = requestAnimationFrame(frame); };
  window.__popupFrame = requestAnimationFrame(frame);
});
await page.click('loc=role:button[name="Working directory"]', { label: "animate worktree popup open" });
await page.waitForFunction(() => {
  const el = document.querySelector(".worktree-picker-motion");
  return el && getComputedStyle(el).opacity === "1" && getComputedStyle(el).transform === "none";
});
await page.keyboard.press("Escape");
await page.waitForSelector("loc=css:.worktree-picker-motion", { state: "detached" });
await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Working directory");
const samples = await page.evaluate(() => {
  cancelAnimationFrame(window.__popupFrame); window.__popupObserver.disconnect();
  return window.__popupSamples;
});
assert.ok(samples.some(s => s.state === "open" && s.opacity < 1 && s.scaleY < 1), "popup fades and grows on entry");
assert.ok(samples.some(s => s.state === "closed" && s.opacity > 0 && s.opacity < 1 && s.scaleY < 1), "popup remains mounted through its fade and shrink exit");
assert.ok(samples.filter(s => s.state === "closed").every(s => s.inert), "closing popup cannot receive input");
console.log({ entryFrames: samples.filter(s => s.state === "open" && s.opacity < 1).length, exitFrames: samples.filter(s => s.state === "closed" && s.opacity > 0).length });
console.log("Passed: entry and exit motion, deferred unmount, noninteractive exit and trigger focus restoration.");
if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
