// Run with Vite using ego-browser nodejs < tests/worktree-pane-motion-browser.mjs.
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(globalThis.HARBOR_QA_SPACE ?? "Worktree picker pane motion");
console.log({ spaceId: task.spaceId });
const page = task.page("p1");
await page.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
await page.goto("http://127.0.0.1:1420/tests/ui.html?empty");
await page.waitForSelector('loc=role:button[name="Workspace for new task"]');
await page.click('loc=role:button[name="Workspace for new task"]', { label: "open test workspace list" });
await page.waitForSelector('loc=role:menuitemradio[name="repository"]');
await page.click('loc=role:menuitemradio[name="repository"]', { label: "select test repository" });
await page.waitForSelector('loc=role:button[name="Working directory"]');
await page.click('loc=role:button[name="Working directory"]', { label: "open worktree choice pane" });
await page.waitForSelector('loc=role:menuitemradio[name="New worktree"]');
await page.evaluate(() => {
  window.__pickerNodes = [...document.querySelectorAll(".worktree-picker-view")];
  window.__paneSamples = [];
  const sample = () => {
    const viewport = document.querySelector(".worktree-picker-viewport");
    const panes = [...document.querySelectorAll(".worktree-picker-view")];
    window.__paneSamples.push({ height: viewport.getBoundingClientRect().height,
      x: panes.map(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41) });
    window.__paneFrame = requestAnimationFrame(sample);
  };
  sample();
});
await page.click('loc=role:menuitemradio[name="New worktree"]', { label: "animate into branch pane" });
await page.waitForSelector('loc=role:textbox[name="Branch name"]');
await page.waitForFunction(() => {
  const pane = document.querySelector('.worktree-picker-view[data-active="true"]');
  return Math.abs(new DOMMatrixReadOnly(getComputedStyle(pane).transform).m41) < 0.01 &&
    Math.abs(pane.offsetHeight - pane.parentElement.getBoundingClientRect().height) < 0.1;
});
const forward = await page.evaluate(() => {
  cancelAnimationFrame(window.__paneFrame);
  return { retained: window.__pickerNodes.length === 2 && window.__pickerNodes.every(el => el.isConnected), samples: window.__paneSamples };
});
assert.equal(forward.retained, true, "both existing panes remain mounted");
assert.ok(forward.samples.length > 2, "capture the transition with motion enabled");
const finalHeight = forward.samples.at(-1).height;
for (let i = 1; i < forward.samples.length; i++) {
  assert.ok(forward.samples[i].height >= forward.samples[i - 1].height - 0.5, "height grows without bouncing backward");
  assert.ok(forward.samples[i].height <= finalHeight + 0.5, "height never overshoots");
  assert.ok(forward.samples[i].x[1] >= -0.5, "branch pane never overshoots its resting position");
}
await page.fill('loc=role:textbox[name="Branch name"]', "harbor/persistent-pane");
console.log(await page.screenshot({ path: "/tmp/harbor-matched-picker-motion.png" }));
await page.click('loc=role:button[name="Back to working directory choices"]', { label: "return to choice pane" });
await page.waitForSelector('loc=role:menuitemradio[name="New worktree"]');
await page.waitForFunction(() => {
  const pane = document.querySelector('.worktree-picker-view[data-active="true"]');
  return Math.abs(new DOMMatrixReadOnly(getComputedStyle(pane).transform).m41) < 0.01 &&
    Math.abs(pane.offsetHeight - pane.parentElement.getBoundingClientRect().height) < 0.1;
});
assert.equal(await page.evaluate(() => window.__pickerNodes.every(el => el.isConnected)), true);
await page.keyboard.press("Enter");
await page.waitForSelector('loc=role:textbox[name="Branch name"]');
assert.equal(await page.evaluate(() => document.querySelector('.worktree-picker-view[data-active="true"] input').value), "harbor/persistent-pane");
console.log({ frames: forward.samples.length, heights: [forward.samples[0].height, finalHeight], retained: forward.retained });
console.log("Passed: retained panes, animated height, no overshoot, back navigation and edit persistence with motion enabled.");
if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
