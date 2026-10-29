// Run with Vite running: ego-browser nodejs < tests/page-transitions-browser.mjs
// Set globalThis.HARBOR_QA_SPACE to reuse a QA task space.
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(
  globalThis.HARBOR_QA_SPACE ?? "Harbor page transition QA",
);
console.log({ spaceId: task.spaceId });
const page = task.page("p1");
await page.cdp("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
});
await page.goto("http://127.0.0.1:1420/tests/ui.html");
await page.waitForSelector('[role="textbox"][aria-label="Describe a new task"]');
if (!(await page.evaluate(() => document.querySelector("#harbor-sidebar")?.getBoundingClientRect().width > 0)))
  await page.click('button[aria-label="Toggle Sidebar"]');
// Use the page's main world so the wrapper observes calls from the app.
const main = async (fn) => (await page.cdp("Runtime.evaluate", {
  expression: `(${fn.toString()})()`, returnByValue: true, awaitPromise: true,
})).result.value;
await main(() => {
  window.__pageTransitions = [];
  const start = document.startViewTransition.bind(document);
  document.startViewTransition = (update) => {
    const transition = start(update);
    transition.ready.then(() => {
      const animations = document.getAnimations().filter((animation) =>
        ["page-blur-in", "page-blur-out"].includes(animation.animationName),
      );
      for (const animation of animations) {
        animation.pause();
        animation.currentTime = 210;
      }
      const sample = (side) => {
        const style = getComputedStyle(document.documentElement, `::view-transition-${side}(harbor-page)`);
        return { opacity: Number(style.opacity), filter: style.filter, duration: style.animationDuration };
      };
      const group = getComputedStyle(document.documentElement, "::view-transition-group(harbor-page)");
      window.__pageTransitions.push({
        old: sample("old"), new: sample("new"), count: animations.length,
        rootName: getComputedStyle(document.documentElement).viewTransitionName,
        overflow: group.overflow,
        radius: group.borderRadius,
        frameRadius: getComputedStyle(document.querySelector(".workspace-frame")).borderRadius,
      });
      document.documentElement.dataset.blurSampled = "true";
    }).catch((error) => { window.__pageTransitions.push({ error: String(error) }); document.documentElement.dataset.blurSampled = "true"; });
    return transition;
  };
});
const entrance = async (selector, action) => {
  await main(() => { window.__pageTransitions = []; delete document.documentElement.dataset.blurSampled; });
  await action();
  await page.waitForSelector(selector);
  await page.waitForFunction(() => document.documentElement.dataset.blurSampled === "true");
  const result = await main(() => window.__pageTransitions.at(-1));
  assert.equal(result.rootName, "none", "chrome must remain live outside the page snapshot");
  assert.equal(result.overflow, "hidden", "page blur must be clipped to the content frame");
  assert.equal(result.radius, result.frameRadius, "snapshot must follow the rounded content frame");
  assert.equal(result.count, 2, "both page snapshots should animate");
  for (const side of [result.old, result.new]) {
    assert.equal(side.duration, "0.42s");
    assert(side.opacity > 0 && side.opacity < 1, "both views should overlap");
    assert(parseFloat(side.filter.replace("blur(", "")) > 2, "both views should visibly blur");
  }
  await main(async () => {
    document.getAnimations().filter((animation) =>
      ["page-blur-in", "page-blur-out"].includes(animation.animationName) ||
      animation.animationName?.includes("view-transition"),
    ).forEach((animation) => animation.finish());
    await new Promise(requestAnimationFrame);
  });
};
const newTask = () =>
  page.click(
    '#harbor-sidebar [data-sidebar="menu-button"]:has-text("New task")',
  );
const openChat = (title) =>
  page.click(
    `#harbor-sidebar [data-sidebar="menu-sub-button"]:has-text("${title}")`,
  );
const createChat = async (title) => {
  await page.fill('[role="textbox"][aria-label="Describe a new task"]', title);
  await entrance(".chat-layout", () =>
    page.click('button[aria-label="Start task"]'),
  );
};
await createChat("First transition chat");
await entrance(".home-page", newTask);
await entrance(".chat-layout", () => openChat("First transition chat"));
await entrance(".home-page", newTask);
await createChat("Second transition chat");
await entrance(".chat-layout", () => openChat("First transition chat"));
await entrance(".home-page", newTask);
await entrance(".chat-layout", () =>
  page.click('button[aria-label="Back · ⌘ ["]'),
);
await entrance(".home-page", () =>
  page.click('button[aria-label="Forward · ⌘ ]"]'),
);
await page.cdp("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
const transitionCount = await main(() => window.__pageTransitions.length);
for (const [selector, action] of [
  [".chat-layout", () => openChat("First transition chat")],
  [".home-page", newTask],
]) {
  await action();
  await page.waitForSelector(selector);
  assert.equal(await main(() => window.__pageTransitions.length), transitionCount,
    "reduced motion should bypass snapshot animations");
}
console.log("Passed: overlapping blur in both directions, task creation, chat switching, back/forward, and reduced motion.");
if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
