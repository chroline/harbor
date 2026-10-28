const assert = (await import("node:assert/strict")).default;
const t = await taskSpace(globalThis.HARBOR_QA_SPACE),
  p = t.page("p1");
const root = (await import("node:url")).fileURLToPath(
  new URL("..", import.meta.url),
);
const show = (provider) =>
  p.evaluate((provider) => window.__harborFixture.showPlan(provider), provider);
const selected = () =>
  p.evaluate(
    () =>
      window.__harborFixture
        .snapshot()
        .calls.filter((c) => c.command === "answer_request")
        .at(-1)?.args.result.outcome.optionId,
  );
await p.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1380,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
for (const provider of ["codex", "claude", "grok"]) {
  await show(provider);
  await p.waitForSelector('[data-slot="plan-card"][data-state="pending"]', { state: "visible" });
  const card = await p.evaluate(() => {
    const c = document.querySelector('[data-slot="plan-card"][data-state="pending"]'),
      v = c.querySelector(".harbor-plan-card-preview"),
      s = getComputedStyle(c);
    return {
      width: c.getBoundingClientRect().width,
      messageWidth: document
        .querySelector('.transcript-user [data-slot="bubble-content"]')
        .getBoundingClientRect().width,
      surfaceMatches:
        s.backgroundColor ===
          getComputedStyle(
            document.querySelector(
              '.transcript-user [data-slot="bubble-content"]',
            ),
          ).backgroundColor &&
        s.boxShadow ===
          getComputedStyle(
            document.querySelector(
              '.transcript-user [data-slot="bubble-content"]',
            ),
          ).boxShadow,
      padding: s.padding,
      radius: s.borderRadius,
      messageRadius: getComputedStyle(document.querySelector('.transcript-user [data-slot="bubble-content"]')).borderRadius,
      text: c.innerText,
      preview: v.clientHeight,
      overflow: v.scrollHeight > v.clientHeight,
      mask: getComputedStyle(v).maskImage,
    };
  });
  assert.equal(card.width, card.messageWidth);
  assert.equal(card.surfaceMatches, true);
  assert.equal(card.padding, "20px");
  assert.equal(card.radius, card.messageRadius);
  assert.equal(card.preview > 0 && card.preview <= 72,true);
  assert.match(card.mask, /linear-gradient/);
  assert.doesNotMatch(card.text, /To-dos/);
  assert.match(card.text, /greeting.txt/);
  await p.screenshot({
    path: `${root}/screenshots/ui-craft/final-plan-card-${provider}.png`,
  });
  await p.focus('[data-state="pending"] [aria-label="Review plan"]');
  await p.keyboard.press("Enter");
  await p.waitForSelector('[data-slot="sheet-content"]', { state: "visible" });
  assert.equal(
    await p.evaluate(() =>
      document
        .querySelector(".plan-review-body")
        .innerText.includes("Confirm that no other project files changed."),
    ),
    true,
  );
  await p.keyboard.press("Escape");
  await p.waitForSelector('[data-slot="sheet-content"]', { state: "hidden" });
  await p.evaluate(() => window.__harborFixture.pauseNext("answer_request"));
  await p.click('[data-slot="plan-card"][data-state="pending"] button:has-text("Implement plan")');
  assert.equal(
    await p.evaluate(() =>
      [...document.querySelectorAll('[data-slot="plan-card"][data-state="pending"] button')].every(
        (b) => b.disabled,
      ),
    ),
    true,
  );
  await p.evaluate(() => window.__harborFixture.resume("answer_request"));
  await p.waitForSelector('[data-slot="plan-card"][data-state="pending"]', { state: "hidden" });
  assert.equal(
    await selected(),
    { codex: "implement_plan", claude: "exit-plan-default", grok: "approved" }[
      provider
    ],
  );
}
await p.cdp("Emulation.setDeviceMetricsOverride", {
  width: 900,
  height: 620,
  deviceScaleFactor: 1,
  mobile: false,
});
await p.evaluate(() =>
  window.__harborFixture.showPlan(
    "claude",
    "# A detailed plan with a long title that should wrap naturally without pushing controls outside the card\n\n" +
      Array.from(
        { length: 40 },
        (_, i) =>
          `Step ${i + 1}: read the existing greeting, make the requested change, and verify the result.`,
      ).join("\n\n"),
  ),
);
await p.waitForSelector('[data-slot="plan-card"][data-state="pending"]', { state: "visible" });
assert.equal(
  await p.evaluate(() => {
    const c = document.querySelector('[data-slot="plan-card"][data-state="pending"]'),
      v = c.querySelector(".harbor-plan-card-preview");
    return (
      c.scrollWidth === c.clientWidth &&
      v.clientHeight === 72 &&
      v.scrollHeight > v.clientHeight
    );
  }),
  true,
);
await p.screenshot({
  path: `${root}/screenshots/ui-craft/final-plan-card-compact.png`,
});
await p.evaluate(() =>
  window.__harborFixture.failNext("answer_request", "Connection unavailable"),
);
await p.click('[data-slot="plan-card"][data-state="pending"] button:has-text("Implement plan")');
await p.waitForSelector('[data-slot="plan-card"][data-state="pending"] [role="alert"]', {
  state: "visible",
});
await p.click('[data-state="pending"] [aria-label="Review plan"]');
await p.waitForSelector('[data-slot="sheet-content"]', { state: "visible" });
await p.waitForSelector('.plan-review [role="alert"]', { state: "visible" });
await p.keyboard.press("Escape");
await p.waitForSelector('[data-slot="sheet-content"]', { state: "hidden" });
await p.click('[data-slot="plan-card"][data-state="pending"] button:has-text("Implement plan")');
await p.waitForSelector('[data-slot="plan-card"][data-state="pending"]', { state: "hidden" });
await p.click(".harbor-toaster .ui-tsc__toast[data-type=error]:not([data-removing]) .ui-tsc__close");
await show("codex");
await p.waitForSelector('[data-slot="plan-card"][data-state="pending"]', { state: "visible" });
await p.click('#harbor-sidebar button:has-text("Settings")');
await p.click('[role="radio"][aria-label="Light"]');
await p.waitForFunction(() =>
  document.documentElement.classList.contains("light"),
);
await p.click('button[aria-label="Back · ⌘ ["]');
await p.waitForSelector('[data-slot="plan-card"][data-state="pending"]', { state: "visible" });
// Skyline deliberately keeps its own appearance. Explicitly render light scene
// tokens for this component snapshot, independently of skyline/time selection.
await p.evaluate(() =>
  document.querySelectorAll(".skyline-scene.dark").forEach((e) => {
    e.classList.remove("dark");
    e.classList.add("light");
    e.setAttribute("data-card-theme-fixture", "");
  }),
);
await p.hover('[data-slot="plan-card"][data-state="pending"]');
await p.screenshot({
  path: `${root}/screenshots/ui-craft/final-plan-card-light.png`,
});
assert.equal(
  await p.evaluate(
    () =>
      getComputedStyle(document.querySelector('[data-slot="plan-card"][data-state="pending"]'))
        .backgroundColor,
  ),
  "rgb(252, 252, 252)",
);
await p.click('#harbor-sidebar button:has-text("Settings")');
await p.click('[role="radio"][aria-label="Dark"]');
await p.waitForFunction(() =>
  document.documentElement.classList.contains("dark"),
);
await p.click('button[aria-label="Back · ⌘ ["]');
await p.waitForSelector('[data-slot="plan-card"][data-state="pending"]', { state: "visible" });
await p.evaluate(() =>
  document.querySelectorAll("[data-card-theme-fixture]").forEach((e) => {
    e.classList.remove("light");
    e.classList.add("dark");
    e.removeAttribute("data-card-theme-fixture");
  }),
);
console.log(
  "PASS: full-column cards and matching message surfaces for all three providers; fading preview; keyboard full-plan access; exact inline approval IDs; pending/error/retry; long title and content at compact size; light rendering.",
);
