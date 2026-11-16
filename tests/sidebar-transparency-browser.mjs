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
    document.querySelectorAll(".home-page").forEach((el) => {
      el.classList.remove("light", "dark");
      el.classList.add(theme);
    });
  }, theme);
  const layers = await page.evaluate(() => {
    const style = (selector) =>
      getComputedStyle(document.querySelector(selector));
    return {
      body: style("body").backgroundColor,
      bodyBlur: style("body").backdropFilter,
      rootWash: style("#root").backgroundColor,
      sidebar: style("#harbor-sidebar").backgroundColor,
      titlebar: style(".topbar").backgroundColor,
      sidebarContent: style('#harbor-sidebar [data-sidebar="sidebar"]').backgroundColor,
      sidebarContentBlur: style('#harbor-sidebar [data-sidebar="sidebar"]').backdropFilter,
      homeComposer: style(".home-message-card .task-composer").backgroundColor,
      homeComposerBlur: style(".home-message-card .task-composer").backdropFilter,
      root: style(".app-shell").backgroundColor,
      rootBlur: style(".app-shell").backdropFilter,
      frame: style(".workspace-frame").backgroundColor,
    };
  });
  console.log({ theme, layers });
  const cardAlpha = theme === "light" ? /0\.84\)$/ : /0\.72\)$/;
  const cardBlur = "blur(16px) saturate(1.2)";
  assert.equal(layers.sidebar, "rgba(0, 0, 0, 0)");
  assert.equal(layers.titlebar, "rgba(0, 0, 0, 0)");
  assert.equal(layers.bodyBlur, "none");
  assert.equal(layers.rootBlur, "none");
  assert.equal(layers.sidebarContentBlur, cardBlur);
  assert.equal(layers.homeComposerBlur, cardBlur);
  assert.equal(
    layers.body,
    "rgba(0, 0, 0, 0)",
  );
  assert.equal(
    layers.rootWash,
    theme === "light" ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.42)",
  );
  assert.match(
    layers.root,
    theme === "light" ? /0\.42\)$/ : /0\.36\)$/,
  );
  assert.match(layers.sidebarContent, cardAlpha);
  assert.equal(layers.homeComposer, layers.sidebarContent);
  assert.equal(layers.frame, "rgba(0, 0, 0, 0)");
  console.log(
    await page.screenshot({
      path: `/tmp/harbor-sidebar-transparent-${theme}.png`,
    }),
  );
}
await page.fill('[aria-label="Describe a new task"]', "Approve");
await page.click('loc=role:button[name="Start task"]');
await page.waitForFunction(() =>
  document.querySelector('.transcript-user [data-slot="bubble-content"]'),
);
await page.waitForSelector('.task-tab[data-state="active"] > span.absolute[aria-hidden]');
await page.evaluate(async () =>
  window.__harborFixture.longTranscript({ image: false }),
);
await page.waitForFunction(
  () =>
    document.querySelectorAll(
      '[data-slot="message-scroller-viewport"] .transcript-turn',
    ).length > 10,
);
await page.evaluate(async () => {
  const vp = document.querySelector('[data-slot="message-scroller-viewport"]');
  const turns = vp.querySelectorAll(".transcript-turn");
  const turn = turns[turns.length - 3];
  vp.scrollTo({
    top: vp.scrollTop + turn.getBoundingClientRect().top - vp.getBoundingClientRect().top + 72,
    behavior: "instant",
  });
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
});
for (const theme of ["light", "dark"]) {
  await page.evaluate((theme) => {
    document.documentElement.classList.add("theme-changing");
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
  }, theme);
  // The chat scene syncs its own theme class a moment after the root.
  await page.waitForFunction(
    (theme) =>
      !!document.querySelector(".transcript-user")?.closest(".dark") ===
      (theme === "dark"),
    theme,
  );
  const elevated = await page.evaluate(() => {
    const style = (selector) =>
      getComputedStyle(document.querySelector(selector));
    const bubble = document.querySelector(
      '.transcript-user [data-slot="bubble-content"]',
    );
    return {
      sidebar: style('#harbor-sidebar [data-sidebar="sidebar"]').backgroundColor,
      sidebarBlur: style('#harbor-sidebar [data-sidebar="sidebar"]').backdropFilter,
      userMessage: getComputedStyle(bubble).backgroundColor,
      userMessageBlur: getComputedStyle(bubble).backdropFilter,
      userMessageImage: getComputedStyle(bubble).backgroundImage,
      userHeader: getComputedStyle(bubble.closest(".transcript-prompt-header"))
        .position,
      composer: style(".chat-composer-wrap .task-composer").backgroundColor,
      composerBlur: style(".chat-composer-wrap .task-composer").backdropFilter,
      activeTab: style('.task-tab[data-state="active"] > span.absolute[aria-hidden]').backgroundColor,
      activeTabBlur: style('.task-tab[data-state="active"] > span.absolute[aria-hidden]').backdropFilter,
    };
  });
  const cardAlpha = theme === "light" ? /0\.84\)$/ : /0\.72\)$/;
  const cardBlur = "blur(16px) saturate(1.2)";
  assert.match(elevated.sidebar, cardAlpha);
  assert.equal(elevated.userMessage, elevated.sidebar);
  assert.equal(elevated.userHeader, "static");
  assert.equal(elevated.composer, elevated.sidebar);
  assert.equal(elevated.activeTab, elevated.sidebar);
  assert.equal(elevated.userMessageImage, "none");
  assert.equal(elevated.sidebarBlur, cardBlur);
  assert.equal(elevated.userMessageBlur, cardBlur);
  assert.equal(elevated.composerBlur, cardBlur);
  assert.equal(elevated.activeTabBlur, cardBlur);
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
  cardBlur: getComputedStyle(
    document.querySelector('#harbor-sidebar [data-sidebar="sidebar"]'),
  ).backdropFilter,
}));
assert.equal(fallback.sidebar, "rgba(0, 0, 0, 0)");
assert.equal(fallback.root, "oklch(0.205 0 none)");
assert.equal(fallback.cardBlur, "none");
console.log({ reducedTransparency: fallback });
console.log(
  "Passed: sidebar and titlebar share the native window layer, with a reduced-transparency fallback.",
);
if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
