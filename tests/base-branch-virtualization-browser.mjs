// Run with Vite using ego-browser nodejs < tests/base-branch-virtualization-browser.mjs.
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(globalThis.HARBOR_QA_SPACE ?? "Harbor virtualized base branches");
const page = task.page("p1");
await page.goto("http://127.0.0.1:1420/tests/ui.html?empty");
await page.waitForSelector('loc=role:button[name="Workspace for new task"]');
await page.evaluate(() => window.__harborFixture.branches(5000));
await page.click('loc=role:button[name="Workspace for new task"]', { label: "open workspace list" });
await page.click('loc=role:menuitemradio[name="repository"]', { label: "select test repository" });
await page.click('loc=role:button[name="Working directory"]', { label: "open working directory" });
await page.click('loc=role:menuitemradio[name="New worktree"]', { label: "configure new worktree" });
await page.click('loc=role:button[name="Base branch or commit"]', { label: "open virtual branch list" });
await page.waitForSelector('loc=role:menuitemradio[name="branch-0000"]');
const listState = () => page.evaluate(() => {
  const list = document.querySelector('[data-slot="base-branch-list"]');
  const viewport = list.closest('[data-slot="scroll-area-viewport"]');
  const rows = [...list.querySelectorAll('[data-base-branch-index]')];
  const rect = viewport.getBoundingClientRect();
  return {
    count: rows.length,
    first: Number(rows[0].dataset.baseBranchIndex),
    last: Number(rows.at(-1).dataset.baseBranchIndex),
    totalHeight: list.offsetHeight,
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
});
const initial = await listState();
assert.ok(initial.count < 30, `only visible rows and overscan mount: ${initial.count}`);
assert.equal(initial.totalHeight, 5001 * 28);
await page.mouse.move(initial.x, initial.y, { label: "point at branch list" });
await page.mouse.wheel(0, 3000, { label: "scroll through branch window" });
await page.waitForFunction(() => Number(document.querySelector('[data-base-branch-index]').dataset.baseBranchIndex) > 50);
const scrolled = await listState();
assert.ok(scrolled.count < 30);
assert.ok(scrolled.first > 50);
await page.focus('loc=role:searchbox[name="Search base branches"]');
for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowDown");
assert.equal(await page.evaluate(() => document.activeElement.dataset.baseBranchIndex), "39");
await page.keyboard.press("End");
assert.equal(await page.evaluate(() => document.activeElement.dataset.baseBranchIndex), "5000");
assert.ok((await listState()).count < 30);
await page.keyboard.press("ArrowDown");
assert.equal(await page.evaluate(() => document.activeElement.getAttribute("role")), "searchbox");
await page.keyboard.press("ArrowUp");
assert.equal(await page.evaluate(() => document.activeElement.dataset.baseBranchIndex), "5000");
await page.keyboard.press("Home");
assert.equal(await page.evaluate(() => document.activeElement.dataset.baseBranchIndex), "0");
await page.fill('loc=role:searchbox[name="Search base branches"]', "branch");
await page.waitForFunction(() =>
  document.querySelector('[role="searchbox"]').getAttribute("value") === "branch" &&
  !document.querySelector('[data-slot="base-branch-list"] [aria-label="HEAD"]'),
);
await page.keyboard.press("ArrowUp");
assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Use “branch”");
await page.keyboard.press("ArrowUp");
assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "branch-4999");
console.log({ initial, scrolled, end: await listState() });
console.log(await page.screenshot({ path: "/tmp/harbor-virtual-base-branches.png" }));
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector('[aria-label="Base branch or commit"]').textContent.includes("branch-4999"));
assert.ok(await page.evaluate(() => !!document.querySelector('[aria-label="Working directory settings"]')));
console.log("Virtualized branch scrolling, search, keyboard navigation, and selection passed.");
if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
