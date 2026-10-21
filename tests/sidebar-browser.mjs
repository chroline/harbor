// Run with Vite running: ego-browser nodejs < tests/sidebar-browser.mjs
// Set globalThis.HARBOR_QA_SPACE to reuse the current QA space.
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(
  globalThis.HARBOR_QA_SPACE ?? "Harbor Fluid sidebar QA",
);
const page = task.page("p1");
console.log({ spaceId: task.spaceId });
const desktopSidebar = "loc=css:#harbor-sidebar";
const trigger = 'loc=css:[data-sidebar="trigger"]';
const nav = (text) =>
  `${desktopSidebar} [data-sidebar="menu-button"]:has-text("${text}")`;
const setViewport = async (width, height) =>
  page.cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
const preference = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("harbor.sidebar.v1")));
const expanded = () => {
  const panel = document.querySelector("#harbor-sidebar");
  const width = JSON.parse(localStorage.getItem("harbor.sidebar.v1")).width;
  return (
    panel.dataset.state === "expanded" &&
    Math.abs(panel.getBoundingClientRect().width - width) < 0.1
  );
};
const collapsed = () => {
  const panel = document.querySelector("#harbor-sidebar");
  return (
    panel.dataset.state === "collapsed" &&
    panel.getBoundingClientRect().width < 0.1
  );
};
const closeDialog = async () => {
  await page.keyboard.press("Escape");
  await page.waitForSelector('loc=css:[role="dialog"]', { state: "detached" });
};
const noOverflow = async () =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
const resize = async (target, fromTopbar = false) => {
  const selector = fromTopbar
    ? '.topbar-divider [data-sidebar="rail"]'
    : '#harbor-sidebar [data-sidebar="rail"]';
  await page.waitForFunction(expanded);
  await page.hover(`loc=css:${selector}`);
  const pos = await page.evaluate((selector) => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return {
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
      width: document.querySelector("#harbor-sidebar").getBoundingClientRect()
        .width,
    };
  }, selector);
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  await page.waitForFunction(
    (selector) => document.querySelector(selector).hasPointerCapture(1),
    selector,
  );
  await page.mouse.move(pos.x + target - pos.width, pos.y);
  await page.waitForFunction(
    (expected) => {
      const sidebar = document
        .querySelector("#harbor-sidebar")
        .getBoundingClientRect();
      const topbar = document
        .querySelector(".topbar-left")
        .getBoundingClientRect();
      const divider = document
        .querySelector(".topbar-divider")
        .getBoundingClientRect();
      const main = document
        .querySelector(".main-shell")
        .getBoundingClientRect();
      const title = document
        .querySelector(".topbar-title")
        .getBoundingClientRect();
      const lastIcon = [
        ...document.querySelectorAll(".topbar-history button svg"),
      ]
        .filter((icon) => icon.getClientRects().length)
        .at(-1);
      const iconBox = lastIcon.getBoundingClientRect();
      const ink = lastIcon.getBBox();
      const stroke = parseFloat(getComputedStyle(lastIcon).strokeWidth);
      const iconRight =
        iconBox.left + ((ink.x + ink.width + stroke / 2) * iconBox.width) / 24;
      const rail = document.querySelector(
        '#harbor-sidebar [data-sidebar="rail"]',
      );
      const railRect = rail.getBoundingClientRect();
      const hairline = getComputedStyle(rail, "::after");
      const lineLeft =
        railRect.right -
        parseFloat(hairline.right) -
        parseFloat(hairline.width);
      return (
        Math.abs(sidebar.width - expected) < 0.5 &&
        Math.abs(topbar.right - sidebar.right) < 0.5 &&
        Math.abs(divider.left - lineLeft) < 0.1 &&
        Math.abs(divider.width - parseFloat(hairline.width)) < 0.1 &&
        Math.abs(divider.right - main.left) < 0.5 &&
        Math.abs(title.left - divider.right - 18) < 0.5 &&
        Math.abs(divider.left - iconRight - 18) < 0.5
      );
    },
    Math.max(160, Math.min(360, target)),
  );
  await page.mouse.up();
  await page.waitForFunction(
    (target) =>
      Math.abs(
        document.querySelector("#harbor-sidebar").getBoundingClientRect()
          .width - target,
      ) < 1,
    Math.max(160, Math.min(360, target)),
  );
};
await setViewport(1380, 900);
await page.goto("http://127.0.0.1:1420/tests/ui.html");
await page.waitForSelector(trigger);
const nativeLightInset = await page.evaluate(async () => {
  const config = await (await fetch("/src-tauri/tauri.conf.json")).json();
  return config.app.windows[0].trafficLightPosition.x;
});
const originalPreference = await page.evaluate(() =>
  localStorage.getItem("harbor.sidebar.v1"),
);
await page.evaluate(() => localStorage.removeItem("harbor.sidebar.v1"));
await page.reload();
await page.waitForSelector(trigger);
assert.equal((await preference()).width, 256);
assert.equal(
  await page.evaluate(() => {
    const header = document.querySelector(".topbar").getBoundingClientRect();
    const center = header.top + header.height / 2;
    return [...document.querySelectorAll(".topbar button svg")]
      .filter((icon) => icon.getClientRects().length)
      .every((icon) => {
        const r = icon.getBoundingClientRect();
        return (
          Math.abs(r.top + r.height / 2 - center) < 0.1 &&
          r.width === 18 &&
          r.height === 18
        );
      });
  }),
  true,
);
assert.equal(
  await page.evaluate(() => {
    const firstRow = document
      .querySelector('#harbor-sidebar [data-sidebar="menu-button"]')
      .getBoundingClientRect();
    const frame = document.querySelector(".main-shell").getBoundingClientRect();
    return Math.abs(firstRow.top - frame.top) < 0.5;
  }),
  true,
);
await page.hover(trigger);
await page.waitForSelector('loc=css:[role="tooltip"]');
assert.match(
  await page.evaluate(
    () => document.querySelector('[role="tooltip"]').textContent,
  ),
  /⌘ B|Ctrl B/,
);
await page.mouse.move(700, 500);
console.log("Checking desktop shortcut");
await page.keyboard.press("Meta+b");
await page.waitForFunction(collapsed);
await page.click(trigger);
await page.waitForFunction(expanded);
console.log("Checking integrated rail resize bounds");
await resize(800);
await resize(160, true);
await resize(800, true);
assert.equal((await preference()).width, 360);
await resize(160);
assert.equal((await preference()).width, 160);
// Measure the painted SVG edge, rather than the trigger's larger hit target.
assert.equal(
  await page.evaluate((inset) => {
    const icon = document.querySelector('[data-sidebar="trigger"] svg');
    const box = icon.getBoundingClientRect();
    const ink = icon.getBBox();
    const scale = box.width / icon.viewBox.baseVal.width;
    const stroke = Number(icon.getAttribute("stroke-width"));
    const iconLeft = box.left + (ink.x - stroke / 2) * scale;
    // AppKit's three 14px lights have 9px gaps.
    const greenRight = inset + 3 * 14 + 2 * 9;
    return Math.abs(iconLeft - greenRight - inset) < 0.5;
  }, nativeLightInset),
  true,
);
assert.equal(
  await page.evaluate(() => {
    const track = document
      .querySelector(".topbar-left")
      .getBoundingClientRect();
    return (
      Math.abs(
        track.width -
          document.querySelector("#harbor-sidebar").getBoundingClientRect()
            .width,
      ) < 0.5 &&
      [...document.querySelectorAll(".topbar-left button")].every(
        (button) => button.getBoundingClientRect().right <= track.right + 0.5,
      )
    );
  }),
  true,
);
await noOverflow();
await resize(280, true);
const rail = await page.evaluate(() => {
  const r = document
    .querySelector('.topbar-divider [data-sidebar="rail"]')
    .getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.move(rail.x, rail.y);
await page.mouse.down();
await page.mouse.move(90, rail.y);
await page.waitForFunction(collapsed);
await page.mouse.move(rail.x, rail.y);
await page.waitForFunction(expanded);
await page.mouse.up();
await page.click('loc=css:.topbar-divider [data-sidebar="rail"]');
await page.waitForFunction(collapsed);
assert.equal(
  await page.evaluate(() =>
    document.querySelector('.topbar-divider [data-sidebar="rail"]'),
  ),
  null,
);
await page.click(trigger);
await page.waitForFunction(expanded);
await page.reload();
await page.waitForSelector(trigger);
assert.equal((await preference()).width, 280);

console.log("Checking navigation and actions");
// Existing section/row actions still invoke Harbor features.
await page.click(
  'loc=css:#harbor-sidebar [data-sidebar="group-action"][aria-label="Create project"]',
);
await page.waitForSelector('loc=role:dialog[name="Create project"]');
await closeDialog();
assert.equal(
  await page.evaluate(
    () =>
      document.querySelectorAll('#harbor-sidebar [data-sidebar="menu-action"]')
        .length,
  ),
  0,
);
await page.click('loc=css:#harbor-sidebar [aria-label="UI test repository"]', {
  button: "right",
});
await page.waitForSelector(
  'loc=role:menu[name="Actions for UI test repository"]',
);
await page.click('loc=role:menuitem[name="Edit project…"]');
await page.waitForSelector('loc=role:dialog[name="Edit project"]');
const projectName =
  "A long project name that must truncate inside the narrow Fluid sidebar";
await page.fill('loc=role:textbox[name="Project name"]', projectName);
await page.click('loc=role:button[name="Save changes"]');
await page.waitForSelector('loc=role:dialog[name="Edit project"]', {
  state: "detached",
});
assert.equal(
  await page.evaluate(
    () => window.__harborFixture.snapshot().data.projects[0].name,
  ),
  projectName,
);
await page.click(nav("Search"));
await page.waitForSelector('loc=css:[role="dialog"]');
await closeDialog();
await page.click(nav("Worktrees"));
await page.waitForFunction(
  () => document.querySelector(".topbar-title").textContent === "Worktrees",
);
await page.focus(nav("No workspace"));
await page.keyboard.press("Shift+F10");
await page.waitForSelector('loc=role:menu[name="Actions for No workspace"]');
await page.keyboard.press("ArrowDown");
assert.equal(
  await page.evaluate(() => document.activeElement.getAttribute("role")),
  "menuitem",
);
await page.keyboard.press("Enter");
await page.waitForSelector(
  'loc=css:textarea[aria-label="Describe a new task"]',
);
await page.waitForFunction(
  () =>
    document.activeElement.getAttribute("aria-label") === "Describe a new task",
);
await page.fill(
  'loc=css:textarea[aria-label="Describe a new task"]',
  "Fluid sidebar regression conversation",
);
await page.click('loc=role:button[name="Start task"]');
await page.waitForSelector('loc=css:textarea[aria-label="Message your agent"]');
await page.evaluate(async () => window.__harborFixture.sidebarSessions());
await page.waitForFunction(
  () =>
    document.querySelectorAll(
      '#harbor-sidebar [data-sidebar="menu-sub-button"]',
    ).length >= 46,
);
const workspace = nav("No workspace");
await page.click(workspace);
await page.waitForFunction(
  () =>
    document.querySelector("#workspace-chats-none").dataset.state === "closed",
);
await page.click(workspace);
await page.waitForFunction(
  () =>
    document.querySelector("#workspace-chats-none").dataset.state === "open",
);
const firstChat =
  'loc=css:#harbor-sidebar [data-sidebar="menu-sub-button"]:has-text("Fluid sidebar regression conversation")';
await page.focus(firstChat);
await page.keyboard.press("ArrowDown");
assert.equal(
  await page.evaluate(
    () =>
      document.activeElement.matches('[data-sidebar="menu-sub-button"]') &&
      document.activeElement.textContent.includes("Sidebar conversation 1"),
  ),
  true,
);
await page.click(firstChat, { button: "right" });
await page.waitForSelector(
  'loc=role:menu[name="Actions for Fluid sidebar regression conversation"]',
);
assert.equal(
  await page.evaluate(
    () => document.querySelectorAll('[role="menuitem"]').length,
  ),
  3,
);
await page.click('loc=role:menuitem[name="Pin conversation"]');
await page.waitForSelector('loc=css:#harbor-sidebar [aria-label="Pinned"]');
const pinnedChat =
  'loc=css:#harbor-sidebar [aria-label="Pinned"] [data-sidebar="menu-button"]:text-is("Fluid sidebar regression conversation")';
await page.focus(pinnedChat);
await page.keyboard.press("Shift+F10");
await page.waitForSelector('loc=role:menuitem[name="Unpin conversation"]');
await page.click('loc=role:menuitem[name="Unpin conversation"]');
await page.waitForSelector('loc=css:#harbor-sidebar [aria-label="Pinned"]', {
  state: "detached",
});
await page.click(firstChat, { button: "right" });
await page.waitForSelector('loc=role:menuitem[name="Archive conversation…"]');
await page.click('loc=role:menuitem[name="Archive conversation…"]');
await page.waitForSelector('loc=css:[role="dialog"]');
await page.click('loc=role:button[name="Archive and delete"]');
await page.waitForSelector('loc=css:[role="dialog"]', { state: "detached" });
assert.equal(
  await page.evaluate(
    () => window.__harborFixture.snapshot().data.sessions[0].archived,
  ),
  true,
);
const scroll = await page.evaluate(() => {
  const v = document.querySelector(
    '#harbor-sidebar [data-slot="scroll-area-viewport"]',
  );
  return { height: v.clientHeight, total: v.scrollHeight };
});
assert.ok(scroll.total > scroll.height);
const scrollPoint = await page.evaluate(() => {
  const r = document
    .querySelector('#harbor-sidebar [data-slot="scroll-area-viewport"]')
    .getBoundingClientRect();
  return { x: r.x + 30, y: r.y + 100 };
});
await page.mouse.move(scrollPoint.x, scrollPoint.y);
await page.mouse.wheel(0, 1600);
await page.waitForFunction(
  () =>
    document.querySelector('#harbor-sidebar [data-slot="scroll-area-viewport"]')
      .scrollTop > 500,
);
assert.equal(
  await page.evaluate(() => {
    const footer = document
      .querySelector('#harbor-sidebar [data-sidebar="footer"]')
      .getBoundingClientRect();
    return footer.bottom <= innerHeight && footer.top > 0;
  }),
  true,
);

console.log("Checking themes and desktop minimum dimensions");
// Both desktop limits, themes, and reduced motion retain readable chrome.
await page.click(nav("Settings"));
await page.click('loc=role:radio[name="Light"]');
await page.waitForFunction(() =>
  document.documentElement.classList.contains("light"),
);
await page.cdp("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
await setViewport(900, 620);
await resize(160);
await noOverflow();
console.log({
  lightMinimum: await page.screenshot({
    path: "/tmp/harbor-fluid-sidebar-light-min.png",
  }),
});
await resize(360);
await noOverflow();
await page.click('loc=role:radio[name="Dark"]');
await page.waitForFunction(() =>
  document.documentElement.classList.contains("dark"),
);
console.log({
  darkMaximum: await page.screenshot({
    path: "/tmp/harbor-fluid-sidebar-dark-max.png",
  }),
});

console.log("Checking mobile drawer");
// Mobile opens independent of desktop preferences and restores its opener.
await setViewport(480, 800);
await page.click(trigger);
await page.waitForSelector('loc=css:[role="dialog"][data-mobile="true"]');
await page.waitForFunction(
  () =>
    Math.abs(
      document.querySelector('[data-mobile="true"]').getBoundingClientRect().x,
    ) < 1,
);
await page.cdp("Emulation.setTouchEmulationEnabled", {
  enabled: true,
  maxTouchPoints: 1,
});
const touchPoint = await page.evaluate(() => {
  const row = document
    .querySelector('[data-mobile="true"] [data-slot="context-menu-trigger"]')
    .getBoundingClientRect();
  return { x: row.left + 30, y: row.top + row.height / 2 };
});
await page.cdp("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [touchPoint],
});
await page.waitForSelector(
  'loc=css:[data-mobile="true"] [data-slot="context-menu-content"]',
);
await page.cdp("Input.dispatchTouchEvent", {
  type: "touchEnd",
  touchPoints: [],
});
assert.equal(
  await page.evaluate(
    () => document.querySelector(".topbar-title").textContent,
  ),
  "Settings",
);
await page.keyboard.press("Escape");
await page.waitForSelector('loc=css:[data-slot="context-menu-content"]', {
  state: "detached",
});
assert.equal(
  await page.evaluate(() =>
    document.querySelector('[data-mobile="true"]').getAttribute("data-state"),
  ),
  "open",
);
await page.cdp("Emulation.setTouchEmulationEnabled", { enabled: false });
await page.keyboard.press("Tab");
assert.equal(
  await page.evaluate(
    () => !!document.activeElement.closest('[data-mobile="true"]'),
  ),
  true,
);
console.log({
  mobile: await page.screenshot({
    path: "/tmp/harbor-fluid-sidebar-mobile.png",
  }),
});
await closeDialog();
await page.waitForFunction(() =>
  document.activeElement.matches('[data-sidebar="trigger"]'),
);
assert.equal((await preference()).open, true);
await page.keyboard.press("Meta+b");
await page.waitForSelector('loc=css:[data-mobile="true"]');
await page.mouse.click(460, 500);
await page.waitForSelector('loc=css:[data-mobile="true"]', {
  state: "detached",
});
await page.waitForFunction(() =>
  document.activeElement.matches('[data-sidebar="trigger"]'),
);
await noOverflow();

await setViewport(900, 620);
await page.goto("http://127.0.0.1:1420/tests/ui.html?empty");
await page.waitForSelector(
  'loc=css:#harbor-sidebar [aria-label="Projects"] .sidebar-empty',
);
assert.match(
  await page.evaluate(
    () =>
      document.querySelector(
        '#harbor-sidebar [aria-label="Projects"] .sidebar-empty',
      ).textContent,
  ),
  /No projects added/,
);
await page.evaluate((original) => {
  if (original === null) localStorage.removeItem("harbor.sidebar.v1");
  else localStorage.setItem("harbor.sidebar.v1", original);
}, originalPreference);
console.log(
  "Passed: Fluid sizing/collapse, persistence, shortcut tooltip, section and row actions, navigation, nested keyboard focus, long labels, scrolling/footer, both themes, reduced motion, mobile focus/dismissal, and empty states.",
);
if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
