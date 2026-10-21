// Run with Vite: ego-browser nodejs < tests/sidebar-transparency-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(
  globalThis.HARBOR_QA_SPACE ?? "Harbor sidebar transparency",
);
const page = task.page("p1");
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1380,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.goto("http://127.0.0.1:1420/tests/ui.html?empty");
await page.waitForSelector("loc=css:.workspace-frame");
if (
  await page.evaluate(
    () =>
      document.querySelector("#harbor-sidebar").getBoundingClientRect().width <
      1,
  )
) {
  await page.click('loc=role:button[name="Toggle Sidebar"]', {
    label: "show translucent sidebar",
  });
}
for (const theme of ["light", "dark"]) {
  await page.evaluate((theme) => {
    document.documentElement.classList.add("theme-changing");
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
  }, theme);
  const layers = await page.evaluate(() => {
    const color = (selector) =>
      getComputedStyle(document.querySelector(selector)).backgroundColor;
    return {
      sidebar: color("#harbor-sidebar"),
      titlebar: color(".topbar"),
      sidebarContent: color('#harbor-sidebar [data-sidebar="sidebar"]'),
      root: color(".app-shell"),
      frame: color(".workspace-frame"),
    };
  });
  console.log({ theme, layers });
  assert.equal(layers.sidebar, "rgba(0, 0, 0, 0)");
  assert.equal(layers.titlebar, "rgba(0, 0, 0, 0)");
  assert.equal(layers.sidebarContent, "rgba(0, 0, 0, 0)");
  assert.match(layers.root, /rgba\(/);
  assert.notEqual(layers.frame, "rgba(0, 0, 0, 0)");
  console.log(
    await page.screenshot({
      path: `/tmp/harbor-sidebar-transparent-${theme}.png`,
    }),
  );
}
await page.cdp("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
});
assert.equal(
  await page.evaluate(
    () => matchMedia("(prefers-reduced-transparency: reduce)").matches,
  ),
  true,
);
const fallback = await page.evaluate(() => ({
  root: getComputedStyle(document.querySelector(".app-shell")).backgroundColor,
  sidebar: getComputedStyle(document.querySelector("#harbor-sidebar"))
    .backgroundColor,
}));
assert.equal(fallback.sidebar, "rgba(0, 0, 0, 0)");
assert.equal(fallback.root, "rgb(24, 24, 24)");
console.log({ reducedTransparency: fallback });
console.log(
  "Passed: sidebar and titlebar share the native window layer, with a reduced-transparency fallback.",
);
if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
