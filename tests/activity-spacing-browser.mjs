// With Vite running: ego-browser nodejs < tests/activity-spacing-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace("Harbor activity spacing regression");
const page = task.page("p1");
await page.goto("http://127.0.0.1:1420/tests/activity-spacing.html");
await page.waitForSelector('button[aria-label="Working..."]');
const gaps = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-slot="trace-title"]')]
    .map((element) => element.getBoundingClientRect());
  return rows.slice(1).map((row, index) => row.top - rows[index].bottom);
});
assert.equal(gaps.length, 4);
assert.deepEqual(gaps, [16, 16, 16, 16]);
console.log({ gaps, result: "All four activity gaps match" });
await task.finish({ keep: [] });
