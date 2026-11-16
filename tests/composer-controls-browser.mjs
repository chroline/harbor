// Run with Vite: ego-browser nodejs < tests/composer-controls-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(
  globalThis.HARBOR_QA_SPACE ?? "Harbor Fluid composer controls",
);
const page = task.page("p1");
const measureControls = () => {
  const root = document.querySelector(".task-composer-layout");
  const workspace = root.querySelector(".workspace-picker-trigger");
  const names = {
    workspace,
    mode: root.querySelector(".mode-picker-trigger"),
    model: root.querySelector(".model-menu-trigger"),
    send: root.querySelector(".task-composer-action"),
  };
  return Object.fromEntries(
    Object.entries(names).map(([name, el]) => {
      const text =
        name === "model" ? el.querySelector(".model-trigger-content") : el;
      const style = getComputedStyle(text);
      const icon = el.querySelector(".provider-brand-mark, svg");
      return [
        name,
        {
          height: el.getBoundingClientRect().height,
          font: style.fontSize,
          lineHeight: style.lineHeight,
          icon: icon?.getBoundingClientRect().height,
        },
      ];
    }),
  );
};
await page.cdp("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1380,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.goto("http://127.0.0.1:1420/tests/ui.html?empty");
await page.waitForSelector("loc=css:.model-menu-trigger");
await page.waitForFunction(() => {
  const mode = document.querySelector(".mode-picker-trigger");
  return mode && !mode.disabled;
});
console.log(await page.snapshot());
for (const width of [1380, 900]) {
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height: width === 900 ? 620 : 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(theme);
    }, theme);
    const controls = await page.evaluate(measureControls);
    console.log({ width, theme, controls });
    for (const [name, control] of Object.entries(controls)) {
      assert.ok(Math.abs(control.height - 28) < 0.1);
      if (name !== "send") {
        assert.equal(control.font, "12px");
        // Fluid fields retain a taller line box for the caret.
        assert.equal(control.lineHeight, "18px");
      }
      assert.ok(Math.abs(control.icon - 14) < 0.1);
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.equal(
      await page.evaluate(() => {
        const box = document
          .querySelector(".task-composer")
          .getBoundingClientRect();
        const toolbar = document
          .querySelector(".task-composer-context")
          .getBoundingClientRect();
        const model = document
          .querySelector(".model-menu-trigger")
          .getBoundingClientRect();
        const mode = document
          .querySelector(".mode-picker-trigger")
          .getBoundingClientRect();
        const send = document
          .querySelector(".task-composer-action")
          .getBoundingClientRect();
        return (
          toolbar.bottom <= box.top &&
          model.left < box.left + box.width / 2 &&
          model.left >= box.left &&
          model.right < send.left &&
          send.right <= box.right &&
          model.top >= box.top &&
          model.bottom <= box.bottom
        );
      }),
      true,
    );
    assert.equal(
      await page.evaluate(() => {
        const box = document
          .querySelector(".task-composer")
          .getBoundingClientRect();
        const mode = document
          .querySelector(".mode-picker-trigger")
          .getBoundingClientRect();
        const model = document
          .querySelector(".model-menu-trigger")
          .getBoundingClientRect();
        return (
          mode.top >= box.top &&
          mode.bottom <= box.bottom &&
          mode.left >= model.right
        );
      }),
      true,
    );
    console.log(
      await page.screenshot({
        path: `/tmp/harbor-fluid-composer-${theme}-${width}.png`,
      }),
    );
  }
}
await page.click('loc=role:button[name="Workspace for new task"]', {
  label: "open workspace picker",
});
await page.waitForSelector("loc=css:.workspace-picker-menu");
await page.waitForFunction(
  () =>
    document.activeElement?.getAttribute("aria-label") === "Search workspaces",
);
await page.fill(
  'loc=role:searchbox[name="Search workspaces"]',
  "/fixture/notes",
);
await page.waitForSelector('loc=role:menuitemradio[name="notes"]');
assert.equal(
  await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '.workspace-picker-menu [role="menuitemradio"]',
      ),
    ].some((row) => row.getAttribute("title") === "/fixture/repository"),
  ),
  false,
);
await page.fill('loc=role:searchbox[name="Search workspaces"]', "");
await page.waitForSelector('loc=role:menuitemradio[name="repository"]');
const workspaceMenu = await page.evaluate(() => {
  const r = document
    .querySelector(".workspace-picker-menu")
    .getBoundingClientRect();
  return { width: r.width, left: r.left, right: r.right, viewport: innerWidth };
});
assert.ok(Math.abs(workspaceMenu.width - 352) < 0.1);
assert.ok(
  workspaceMenu.left >= 0 && workspaceMenu.right <= workspaceMenu.viewport,
);
await page.click('loc=role:menuitemradio[name="repository"]', {
  label: "select Git workspace",
});
await page.waitForSelector('loc=role:button[name="Working directory"]');
assert.ok(
  Math.abs(
    (await page.evaluate(
      () =>
        document
          .querySelector('[aria-label="Working directory"]')
          .getBoundingClientRect().height,
    )) - 28,
  ) < 0.1,
);
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
await page.click('loc=role:button[name="Working directory"]', {
  label: "open worktree options",
});
await page.waitForSelector(
  'loc=role:dialog[name="Working directory settings"]',
);
await page.waitForSelector('loc=role:menuitemradio[name="New worktree"]');
const embeddedMenuChrome = await page.evaluate(() => {
  const menu = document.querySelector('.worktree-picker-menu [role="group"]');
  const style = getComputedStyle(menu);
  return { shadow: style.boxShadow, radius: style.borderRadius, background: style.backgroundColor };
});
assert.equal(embeddedMenuChrome.shadow, "none");
assert.equal(embeddedMenuChrome.radius, "0px");
assert.equal(embeddedMenuChrome.background, "rgba(0, 0, 0, 0)");
assert.equal(await page.evaluate(() => !!document.querySelector('.worktree-picker-view[data-active="true"] input')), false);
await page.click('loc=role:menuitemradio[name="New worktree"]', { label: "open branch settings pane" });
await page.waitForSelector('loc=role:textbox[name="Branch name"]');
assert.equal(
  await page.evaluate(
    () => !!document.querySelector('.worktree-picker-view[data-active="true"] input'),
  ),
  true,
);
await page.fill('loc=role:textbox[name="Branch name"]', "harbor/check-layout");
await page.click('loc=role:button[name="Base branch or commit"]', { label: "open searchable base branches" });
await page.waitForSelector('loc=role:searchbox[name="Search base branches"]');
await page.fill('loc=role:searchbox[name="Search base branches"]', "main");
await page.waitForSelector('loc=role:menuitemradio[name="main"]');
await page.click('loc=role:menuitemradio[name="main"]', { label: "choose base branch" });
await page.waitForSelector('loc=css:.base-branch-menu', { state: "detached" });
assert.equal(await page.evaluate(() => document.querySelector('button[aria-label="Base branch or commit"]').textContent.trim()), "main");
await page.click('loc=role:textbox[name="Branch name"]', { label: "return to branch settings" });
const worktreeSize = await page.evaluate(() => {
  const panel = document.querySelector(".worktree-picker-menu");
  const rect = panel.getBoundingClientRect();
  return { width: rect.width, height: rect.height, radios: panel.querySelectorAll('[role="radio"]').length };
});
assert.equal(worktreeSize.width, 288);
assert.ok(worktreeSize.height <= 150, JSON.stringify(worktreeSize));
assert.equal(worktreeSize.radios, 0);
const worktreeTypography = await page.evaluate(() => {
  const panel = document.querySelector('.worktree-picker-view[data-active="true"]');
  return [...panel.querySelectorAll('[role="menuitemradio"] > span, .grid > span, input, button[aria-label="Base branch or commit"]')].map((el) => {
    const style = getComputedStyle(el);
    return { text: el.getAttribute("aria-label") || el.textContent || el.value,
      font: style.fontSize, leading: style.lineHeight,
      placeholder: el.matches("input") ? getComputedStyle(el, "::placeholder").fontSize : null };
  });
});
for (const item of worktreeTypography) {
  assert.equal(item.font, "12px", JSON.stringify(item));
  assert.equal(item.leading, "18px", JSON.stringify(item));
  if (item.placeholder) assert.equal(item.placeholder, "12px");
}
console.log({ worktreeTypography });
console.log(await page.screenshot({ path: "/tmp/harbor-worktree-branch-pane.png" }));
await page.click('loc=role:button[name="Back to working directory choices"]', { label: "return to directory choices" });
await page.waitForSelector('loc=role:menuitemradio[name="New worktree"]');
assert.equal(await page.evaluate(() => !!document.querySelector('.worktree-picker-view[data-active="true"] input')), false);
console.log(await page.screenshot({ path: "/tmp/harbor-worktree-choice-pane.png" }));
await page.keyboard.press("Enter");
await page.waitForSelector('loc=role:textbox[name="Branch name"]');
assert.equal(await page.evaluate(() => document.querySelector('.worktree-picker-view[data-active="true"] input').value), "harbor/check-layout");
await page.keyboard.press("Escape");
await page.waitForSelector('loc=role:menuitemradio[name="New worktree"]');
await page.keyboard.press("Enter");
await page.waitForSelector('loc=role:textbox[name="Branch name"]');
await page.keyboard.press("Enter");
await page.waitForSelector(
  'loc=role:dialog[name="Working directory settings"]',
  { state: "detached" },
);
assert.equal(
  await page.evaluate(
    () => document.querySelectorAll(".launch-worktree-settings").length,
  ),
  0,
);
await page.click('loc=role:button[name="Mode: Default"]', {
  label: "open Fluid mode menu",
});
console.log(await page.snapshot());
await page.waitForSelector('loc=role:menuitemradio[name="Plan"]');
const modeMenuWidth = await page.evaluate(
  () =>
    document.querySelector(".mode-picker-menu").getBoundingClientRect().width,
);
assert.ok(Math.abs(modeMenuWidth - 180) < 0.1);
assert.ok(workspaceMenu.width > modeMenuWidth);
console.log({ workspaceMenuWidth: workspaceMenu.width, modeMenuWidth });
await page.click('loc=role:menuitemradio[name="Plan"]', {
  label: "select plan mode",
});
await page.waitForSelector('loc=role:button[name="Mode: Plan"]');
await page.waitForSelector('loc=role:menuitemradio[name="Plan"]', {
  state: "detached",
});
await page.click('loc=role:button[name="Choose model and reasoning"]', {
  label: "open model settings",
});
await page.waitForSelector('loc=role:button[name="Choose model"]');
await page.keyboard.press("Escape");
await page.fill(
  'loc=css:[role="textbox"][aria-label="Describe a new task"]',
  "Verify consistent Fluid controls",
);
await page.click('loc=role:button[name="Start task"]', {
  label: "start workspace task",
});
await page.waitForSelector('loc=css:[role="textbox"][aria-label="Message your agent"]');
const chat = await page.evaluate(() => {
  return {
    repositoryDetails: !!document.querySelector(".task-location"),
    modeInside: document
      .querySelector(".task-composer")
      .contains(document.querySelector(".mode-picker-trigger")),
    branchSettings: !!document.querySelector(".launch-worktree-settings"),
    modelOnLeft:
      document.querySelector(".model-menu-trigger").getBoundingClientRect()
        .left <
      document.querySelector(".task-composer").getBoundingClientRect().left +
        document.querySelector(".task-composer").getBoundingClientRect().width /
          2,
    mode: document.querySelector(".mode-picker-trigger").getBoundingClientRect()
      .height,
    model: document.querySelector(".model-menu-trigger").getBoundingClientRect()
      .height,
    send: document
      .querySelector(".task-composer-action")
      .getBoundingClientRect().height,
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
});
assert.equal(chat.repositoryDetails, false);
assert.equal(chat.modeInside, true);
assert.equal(chat.branchSettings, false);
assert.equal(chat.overflow, false);
assert.equal(chat.modelOnLeft, true);
for (const name of ["mode", "model", "send"])
  assert.ok(Math.abs(chat[name] - 28) < 0.1);
console.log({ chat });
console.log(
  await page.screenshot({ path: "/tmp/harbor-fluid-composer-chat.png" }),
);
console.log(
  "Passed: native Fluid sizes, light/dark, wide/narrow, menus and workspace chat launch.",
);
if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
