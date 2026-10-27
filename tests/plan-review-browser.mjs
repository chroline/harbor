// Run inside ego-browser nodejs, with a launched fixture chat in HARBOR_QA_SPACE.
const assert = (await import("node:assert/strict")).default;
const t = await taskSpace(globalThis.HARBOR_QA_SPACE),
  p = t.page("p1");
const evidence = `${(await import("node:url")).fileURLToPath(new URL("..", import.meta.url))}/screenshots/ui-craft`;
const popup = '[data-slot="sheet-content"]';
const open = async () => {
  await p.click('[data-state="pending"] button[aria-label="Review plan"]');
  await p.waitForFunction(() => {
    const d = document.querySelector('[data-slot="sheet-content"]');
    return (
      d &&
      !d.hasAttribute("data-starting-style") &&
      getComputedStyle(d).opacity === "1"
    );
  });
};
const closed = () => p.waitForSelector(popup, { state: "hidden" });
const answers = () =>
  p.evaluate(() =>
    window.__harborFixture
      .snapshot()
      .calls.filter((c) => c.command === "answer_request"),
  );
await p.keyboard.press("Escape");
await closed();
await p.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1380,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
for (const provider of ["codex", "claude", "grok"]) {
  await p.evaluate(
    (provider) => window.__harborFixture.showPlan(provider),
    provider,
  );
  const before = (await answers()).length;
  await open();
  const metrics = await p.evaluate(() => {
    const d = document.querySelector('[data-slot="sheet-content"]'),
      s = getComputedStyle(d),
      r = d.getBoundingClientRect();
    return {
      width: r.width,
      top: r.top,
      right: innerWidth - r.right,
      radius: s.borderRadius,
      duration: s.transitionDuration,
      focus: document.activeElement.textContent,
      title: document.querySelector(".plan-review-body h1").textContent,
    };
  });
  assert.equal(metrics.width, 440);
  assert.equal(metrics.top, 12);
  assert.equal(metrics.right, 12);
  assert.equal(metrics.radius, "16px");
  assert.equal(metrics.focus, "Review plan");
  assert.equal(metrics.title, "Update the greeting");
  for (let index=0; index<8; index++) {
    await p.keyboard.press("Tab");
    await p.waitForFunction(()=>document.querySelector('[data-slot="sheet-content"]')?.contains(document.activeElement));
  }
  await p.screenshot({ path: `${evidence}/final-plan-sheet-${provider}.png` });
  await p.keyboard.press("Escape");
  await closed();
  assert.equal((await answers()).length, before);
  assert.equal(
    await p.evaluate(() => document.activeElement.getAttribute("aria-label")),
    "Review plan",
  );
  await open();
  await p.click('button[aria-label="Close"]');
  await closed();
  assert.equal((await answers()).length, before);
  await open();
  await p.mouse.click(20, 100);
  await closed();
  assert.equal((await answers()).length, before);
  await open();
  if (provider === "claude") {
    await p.click('button:has-text("More options")');
    await p.waitForSelector('[role="menuitem"]', { state: "visible" });
    assert.equal(
      await p.evaluate(
        () =>
          document.querySelectorAll('.plan-review-menu [role="menuitem"]')
            .length,
      ),
      3,
    );
    await p.screenshot({ path: `${evidence}/final-plan-sheet-options.png` });
    await p.keyboard.press("Escape");
    await p.waitForSelector(".plan-review-menu", { state: "hidden" });
    assert.equal(
      await p.evaluate(
        () => !!document.querySelector('[data-slot="sheet-content"]'),
      ),
      true,
    );
  }
  await p.click('button:has-text("Keep planning")');
  await closed();
  assert.equal(
    (await answers()).at(-1).args.result.outcome.optionId,
    { codex: "revise_plan", claude: "reject", grok: "cancelled" }[provider],
  );
}
await p.evaluate(() => window.__harborFixture.showPlan("grok"));
await open();
await p.click('button:has-text("More options")');
await p.click('[role="menuitem"]:has-text("Leave Plan without executing")');
await closed();
assert.equal(
  (await answers()).at(-1).args.result.outcome.optionId,
  "abandoned",
);
await p.cdp("Emulation.setDeviceMetricsOverride", {
  width: 900,
  height: 620,
  deviceScaleFactor: 1,
  mobile: false,
});
await p.evaluate(() =>
  window.__harborFixture.showPlan(
    "claude",
    "# Long plan\n\n" +
      Array.from(
        { length: 30 },
        (_, i) => `## Step ${i + 1}\nRead, update, and verify the greeting.\n`,
      ).join("\n"),
  ),
);
await open();
const scroll = await p.evaluate(() => {
  const b = document.querySelector(".plan-review-body"),
    f = document.querySelector(".plan-review-footer");
  const top = f.getBoundingClientRect().top;
  b.scrollTop = b.scrollHeight;
  return {
    overflow: b.scrollHeight > b.clientHeight,
    footerStable: top === f.getBoundingClientRect().top,
    bottom: f.getBoundingClientRect().bottom,
  };
});
assert.equal(scroll.overflow, true);
assert.equal(scroll.footerStable, true);
assert.equal(scroll.bottom, 608);
await p.click('button:has-text("More options")');
await p.waitForSelector('[role="menuitem"]', { state: "visible" });
assert.equal(
  await p.evaluate(() => {
    const r = document
      .querySelector(".plan-review-menu")
      .getBoundingClientRect();
    const sheet = document.querySelector('[data-slot="sheet-content"]').getBoundingClientRect();
    return r.left >= sheet.left && r.right <= sheet.right && r.top >= 0;
  }),
  true,
);
await p.screenshot({ path: `${evidence}/final-plan-sheet-compact.png` });
await p.keyboard.press("Escape");
await p.waitForSelector(".plan-review-menu", { state: "hidden" });
assert.equal(
  await p.evaluate(() =>
    document
      .querySelector('[data-slot="sheet-content"]')
      ?.hasAttribute("data-open"),
  ),
  true,
);
await p.evaluate(() =>
  window.__harborFixture.failNext("answer_request", "Connection unavailable"),
);
await p.click('button:has-text("Implement plan")');
await p.waitForSelector('.plan-review [role="alert"]', { state: "visible" });
assert.match(
  await p.evaluate(
    () => document.querySelector('.plan-review [role="alert"]').textContent,
  ),
  /Connection unavailable/,
);
await p.evaluate(() => window.__harborFixture.pauseNext("answer_request"));
await p.click('button:has-text("Implement plan")');
assert.equal(
  await p.evaluate(() =>
    [...document.querySelectorAll(".plan-review-footer button")].every(
      (b) => b.disabled,
    ),
  ),
  true,
);
await p.evaluate(() => window.__harborFixture.resume("answer_request"));
await closed();
assert.equal(
  (await answers()).at(-1).args.result.outcome.optionId,
  "exit-plan-default",
);
await p.cdp("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
await p.evaluate(() => window.__harborFixture.showPlan("codex"));
await open();
assert.equal(
  await p.evaluate(
    () =>
      getComputedStyle(document.querySelector('[data-slot="sheet-content"]'))
        .transitionDuration,
  ),
  "0s",
);
await p.click('button:has-text("Implement plan")');
await closed();
assert.equal(
  (await answers()).at(-1).args.result.outcome.optionId,
  "implement_plan",
);
await p.evaluate(() => window.__harborFixture.showPlan("grok"));
await open();
await p.click('button:has-text("Implement plan")');
await closed();
assert.equal((await answers()).at(-1).args.result.outcome.optionId, "approved");
console.log(
  "PASS: all three sheets, recovered geometry, focus return, Escape/close/backdrop preserve approvals, nested menu, exact action IDs, long plan scrolling, fixed footer, errors/retry, pending controls, reduced motion.",
);
