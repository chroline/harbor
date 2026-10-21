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
await page.waitForSelector('textarea[aria-label="Describe a new task"]');
await page.evaluate(() => {
  window.__pageEntrances = [];
  document.addEventListener("animationstart", (event) => {
    if (event.animationName === "page-in")
      window.__pageEntrances.push(event.target.className);
  });
});
const entrance = async (selector, action) => {
  await page.evaluate(() => {
    window.__pageEntrances = [];
  });
  await action();
  await page.waitForSelector(selector);
  assert.equal(
    await page.evaluate(
      (selector) =>
        getComputedStyle(document.querySelector(selector)).animationName,
      selector,
    ),
    "page-in",
    `${selector} should use the shared page entrance`,
  );
  await page.waitForFunction(
    (selector) =>
      window.__pageEntrances.includes(
        document.querySelector(selector)?.className,
      ),
    selector,
  );
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
  await page.fill('textarea[aria-label="Describe a new task"]', title);
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
for (const [selector, action] of [
  [".chat-layout", () => openChat("First transition chat")],
  [".home-page", newTask],
]) {
  await action();
  await page.waitForSelector(selector);
  assert.equal(
    await page.evaluate(
      (selector) =>
        getComputedStyle(document.querySelector(selector)).animationName,
      selector,
    ),
    "none",
  );
}
console.log(
  "Passed: task creation, New Task ↔ chat, chat switching, back/forward, and reduced motion.",
);
if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
