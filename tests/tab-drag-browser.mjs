// Run with Vite: ego-browser nodejs < tests/tab-drag-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace("Harbor live tab motion");
const page = task.page("p1");
await page.goto("http://127.0.0.1:1420/tests/ui.html");
await page.waitForSelector('[aria-label="Describe a new task"]');
await page.fill('[aria-label="Describe a new task"]', "Drag tabs regression");
await page.click('[aria-label="Start task"]');
await page.waitForSelector('[aria-label="New terminal tab"]');
await page.click('[aria-label="New terminal tab"]');
await page.waitForFunction(() => !!document.querySelector('.native-terminal .xterm-helper-textarea'));
const geometry = await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('[data-task-tab-id]')];
  const first = tabs[0].getBoundingClientRect();
  const last = tabs.at(-1).getBoundingClientRect();
  return { first: { x: first.left + 20, y: first.top + first.height / 2 }, last: { x: last.left + 50, y: last.top + last.height / 2 }, id: tabs.at(-1).dataset.taskTabId };
});
await page.mouse.move(geometry.last.x, geometry.last.y);
await page.mouse.down();
await page.mouse.move(geometry.first.x, geometry.first.y);
// The actual tab follows the pointer; its neighbors animate before release.
const duringDrag = await page.evaluate((id) => {
  const wrapper = [...document.querySelectorAll('[data-task-tab-id]')].find((tab) => tab.dataset.taskTabId === id);
  const surface = wrapper.querySelector('.task-tab-surface');
  return {
    fixed: getComputedStyle(surface).position === 'fixed',
    transformed: surface.style.transform.includes('translate3d'),
    neighborsMoving: [...document.querySelectorAll('[data-task-tab-id]')].filter((tab) => tab !== wrapper).some((tab) => tab.style.transform && !tab.style.transform.startsWith('translate3d(0px')),
    tooltip: !!document.querySelector('.task-tab-drag-preview'),
    indicator: !!document.querySelector('[data-tab-drop]'),
  };
}, geometry.id);
assert.deepEqual(duringDrag, { fixed: true, transformed: true, neighborsMoving: true, tooltip: false, indicator: false });
console.log(await page.screenshot({ path: "/tmp/harbor-live-tab-motion.png" }));
await page.mouse.up();
await page.waitForFunction((id) => document.querySelector('[data-task-tab-id]').dataset.taskTabId === id, geometry.id);
await page.keyboard.press("Meta+n");
await page.waitForSelector('[aria-label="Describe a new task"]');
await page.click('loc=role:button[name="Drag tabs regression"]');
await page.waitForFunction((id) => document.querySelector('[data-task-tab-id]')?.dataset.taskTabId === id, geometry.id);
const point = await page.evaluate((id) => { const rect = [...document.querySelectorAll('[data-task-tab-id]')].find((el) => el.dataset.taskTabId === id).getBoundingClientRect(); return { x: rect.left + 50, y: rect.top + rect.height / 2 }; }, geometry.id);
await page.mouse.move(point.x, point.y);
await page.mouse.down();
await page.mouse.move(point.x + 100, point.y + 160);
// Window creation must already have started while the mouse is held down.
await page.waitForSelector('[role="tab"][title*="Open in standalone window"]');
assert.equal(await page.evaluate(() => window.__harborFixture.snapshot().calls.filter((call) => call.command === "detach_task_tab").length), 1);
await page.mouse.up();
assert.equal(await page.evaluate(() => document.querySelectorAll('.native-terminal').length), 0);
await page.click('[role="tab"][title*="Open in standalone window"]');
await page.waitForFunction(() => window.__harborFixture.snapshot().calls.some((call) => call.command === "focus_task_tab"));
const calls = await page.evaluate(() => window.__harborFixture.snapshot().calls);
assert.equal(calls.filter((call) => call.command === "create_shell_terminal").length, 1);
assert.equal(calls.filter((call) => call.command === "detach_task_tab").length, 1);
assert.equal(calls.find((call) => call.command === "detach_task_tab").args.tabId, geometry.id);
assert.equal(calls.filter((call) => call.command === "close_shell_terminal").length, 0);
console.log(await page.screenshot({ path: "/tmp/harbor-tab-drag-regression.png" }));
console.log("Passed actual-tab dragging, animated neighbors, persisted ordering, detachment before mouse release, placeholder focus, and preserving the shell.");
await task.finish({ keep: [] });
