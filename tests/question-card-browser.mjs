// Run as a module: ego-browser nodejs -e 'await import("file:///absolute/path/to/tests/question-card-browser.mjs")'
const assert = (await import("node:assert/strict")).default;
const fs = await import("node:fs/promises");
const task = await taskSpace(
  globalThis.HARBOR_QA_SPACE ?? "Harbor Fluid question component",
);
const page = task.page("p1");
const root = (await import("node:url"))
  .fileURLToPath(new URL("..", import.meta.url))
  .replace(/\/$/, "");
const evidence = `${root}/screenshots/questions`;
await fs.mkdir(evidence, { recursive: true });
await page.goto("http://127.0.0.1:1420/tests/ui.html");
await page.waitForFunction(
  () =>
    document.querySelector('[aria-label="Describe a new task"]') ||
    document.querySelector(".settings-page"),
);
if (
  !(await page.evaluate(
    () => !!document.querySelector('[aria-label="Describe a new task"]'),
  ))
)
  await page.click('button:has-text("New task")');
await page.fill(
  '[aria-label="Describe a new task"]',
  "Question UI verification",
);
await page.click('loc=role:button[name="Start task"]');
await page.waitForSelector(".chat-transcript");
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1380,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
const setTheme = (theme) =>
  page.evaluate((theme) => {
    for (const element of [
      document.documentElement,
      ...document.querySelectorAll(".skyline-scene"),
    ]) {
      element.classList.toggle("dark", theme === "dark");
      element.classList.toggle("light", theme === "light");
    }
    document.documentElement.dataset.theme = theme;
  }, theme);
// Wait for the measured region and moving selection surfaces after navigation/resize.
const settleQuestion = () => page.waitForFunction(() => {
  const region = document.querySelector('[data-slot="question-region"]');
  const content = document.querySelector('[data-slot="question-content"]');
  if (!region || !content || Math.abs(region.getBoundingClientRect().height - content.getBoundingClientRect().height) > 1) return false;
  const group = content.querySelector('[role="radiogroup"], [role="group"]');
  if (!group) return true;
  const selected = [...group.querySelectorAll('[data-fluid-hover-index][aria-checked="true"]')];
  if (!selected.length) return true;
  const backgrounds = [...group.querySelectorAll(':scope > .absolute.bg-active')];
  if (!backgrounds.length) return false;
  const bounds = group.getBoundingClientRect();
  return backgrounds.every((el) => {
    const r = el.getBoundingClientRect();
    return Math.abs(r.left - bounds.left) < 1 && Math.abs(r.right - bounds.right) < 1 && r.top >= bounds.top - 1 && r.bottom <= bounds.bottom + 1;
  });
});
await setTheme("dark");
await page.evaluate(
  await fs.readFile(`${root}/node_modules/axe-core/axe.min.js`, "utf8"),
);
await page.evaluate(() => window.__harborFixture.showPlan("codex"));
await page.waitForSelector('[data-slot="plan-card"]');
const cardStyles = () =>
  page.evaluate(() => {
    const card =
      document.querySelector('[data-slot="question-card"]') ??
      document.querySelector('[data-slot="plan-card"]');
    const styles = (element, keys) => {
      const s = getComputedStyle(element);
      return Object.fromEntries(keys.map((key) => [key, s[key]]));
    };
    return {
      surface: styles(card, [
                "backgroundColor",
        "boxShadow",
        "borderRadius",
        "borderWidth",
        "borderColor",
        "color",
      ]),
    };
  });
const planStyles = { dark: await cardStyles() };
await setTheme("light");
planStyles.light = await cardStyles();
await setTheme("dark");
for (const provider of ["codex", "claude", "grok"]) {
  await page.evaluate(
    (provider) => window.__harborFixture.showQuestion(provider),
    provider,
  );
  if (await page.evaluate(() => !!document.querySelector('.harbor-toaster .ui-tsc__toast[data-type="error"]:not([data-removing])')))
    await page.click('.harbor-toaster .ui-tsc__toast[data-type="error"]:not([data-removing]) .ui-tsc__close');
  await page.waitForSelector('[data-slot="question-card"]');
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector("[data-fluid-questions]"),
    ),
    true,
  );
  assert.deepEqual(
    await cardStyles(),
    planStyles.dark,
    "Question outer surface matches the plan card",
  );
  await page.press('[role="radio"][aria-label="Blue"]', "2");
  assert.equal(
    await page.evaluate(
      () =>
        document
          .querySelector('[role="radio"][aria-label="Green"]')
          .getAttribute("aria-checked") === "true",
    ),
    true,
  );
  const controls = await page.evaluate(() => {
    const card = document.querySelector('[data-slot="question-card"]');
    const button = card.querySelector('[data-slot="question-submit"]');
    const keycap = getComputedStyle(button.querySelector('kbd'));
    const selected = getComputedStyle(card.querySelector('[role="radio"][aria-checked="true"] [data-slot="question-number"]'));
    const unselected = getComputedStyle(card.querySelector('[role="radio"][aria-checked="false"] [data-slot="question-number"]'));
    return {
      label: button.innerText.split("\n")[0],
      keycapContrast: keycap.color === getComputedStyle(button).color,
      keycapUsesComponentFont: keycap.fontFamily === getComputedStyle(button).fontFamily,
      selectedIsFilled: selected.backgroundColor === getComputedStyle(card).color,
      unselectedIsOutlined: unselected.borderWidth === "1px",
    };
  });
  assert.deepEqual(controls, {label:"Continue", keycapContrast:true, keycapUsesComponentFont:true, selectedIsFilled:true, unselectedIsOutlined:true});
  await page.fill(
    'textarea[aria-label^="Something else"]',
    "Navy, specifically",
  );
  await settleQuestion();
  await page.screenshot({ path: `${evidence}/${provider}-dark.png` });
  assert.deepEqual(
    await page.evaluate(async () =>
      (
        await axe.run(document.querySelector('[data-slot="question-card"]'), {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        })
      ).violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.failureSummary),
      })),
    ),
    [],
  );
  await page.evaluate(() =>
    window.__harborFixture.failNext(
      "answer_request",
      "Question transport unavailable",
    ),
  );
  await page.click('[data-slot="question-submit"]');
  await page.waitForSelector(".question-card-error");
  assert.deepEqual(
    await page.evaluate(() => ({
      checked:
        document
          .querySelector('[role="radio"][aria-label="Green"]')
          .getAttribute("aria-checked") === "true",
      note: document.querySelector('textarea[aria-label^="Something else"]')
        .value,
    })),
    { checked: true, note: "Navy, specifically" },
  );
  await page.evaluate(() => window.__harborFixture.pauseNext("answer_request"));
  await page.press('textarea[aria-label^="Something else"]', "Meta+Enter");
  await page.waitForSelector('.harbor-question-card[aria-busy="true"]');
  assert.equal(
    await page.evaluate(
      () => document.querySelector("[data-fluid-questions]").inert,
    ),
    true,
  );
  await page.evaluate(() => window.__harborFixture.resume("answer_request"));
  await page.waitForSelector('[data-slot="question-card"]', {
    state: "hidden",
  });
  const result = await page.evaluate(
    () =>
      window.__harborFixture
        .snapshot()
        .calls.filter((c) => c.command === "answer_request")
        .at(-1).args,
  );
  const field = provider === "codex" ? "color" : "question_0";
  const custom = provider === "codex" ? "color_note" : "question_0_custom";
  assert.equal(result.requestId, 0);
  assert.deepEqual(result.result, {
    action: "accept",
    content: { [field]: "Green", [custom]: "Navy, specifically" },
  });
}
// Long, mixed question set: bounds, editing, validation, keyboard and back navigation.
await page.evaluate(() =>
  window.__harborFixture.request(
    "elicitation/create",
    {
      mode: "form",
      message: "Choose how to verify the implementation.",
      requestedSchema: {
        type: "object",
        required: ["checks", "count"],
        properties: {
          checks: {
            type: "array",
            title: "Which checks should run before this change is ready?",
            minItems: 1,
            maxItems: 2,
            items: {
              anyOf: [
                {
                  const: "unit",
                  title: "Unit checks",
                  description:
                    "Verify the provider response, including typed values and request identity.",
                },
                {
                  const: "browser",
                  title:
                    "Browser checks with a deliberately long label that wraps at narrow widths",
                  description:
                    "Check the selected state, keyboard focus, retry behavior, and custom answers in the rendered interface.",
                },
              ],
            },
          },
          count: {
            type: "integer",
            title: "How many runs?",
            minimum: 1,
            maximum: 3,
          },
        },
      },
    },
    41,
  ),
);
await page.waitForSelector('[data-slot="question-progress"]');
if (await page.evaluate(() => !!document.querySelector('.harbor-toaster .ui-tsc__toast[data-type="error"]:not([data-removing])')))
  await page.click('.harbor-toaster .ui-tsc__toast[data-type="error"]:not([data-removing]) .ui-tsc__close');
await page.press('[role="checkbox"][aria-label="Unit checks"]', "1");
await page.press('[role="checkbox"][aria-label="Unit checks"]', "2");
await page.click('[data-slot="question-submit"]');
await page.fill('[data-slot="question-input"] :is(input, textarea)', "2");
await page.click('loc=role:button[name="Previous question"]');
assert.equal(
  await page.evaluate(() =>
    [
      ...document.querySelectorAll('[data-fluid-hover-index][role="checkbox"]'),
    ].every((input) => input.getAttribute("aria-checked") === "true"),
  ),
  true,
);
for (const theme of ["dark", "light"]) {
  await setTheme(theme);
  assert.deepEqual(await cardStyles(), planStyles[theme]);
  assert.deepEqual(
    await page.evaluate(() => {
      const body = getComputedStyle(
        document.querySelector('[data-slot="question-content"]'),
      );
      return {
        background: body.backgroundColor,
        shadow: body.boxShadow,
        border: body.borderWidth,
      };
    }),
    { background: "rgba(0, 0, 0, 0)", shadow: "none", border: "0px" },
    "Answers have no inner box",
  );
  assert.equal(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('[data-slot="question-card"]'))
          .colorScheme,
    ),
    theme,
  );
  for (const [width, height] of [
    [1380, 900],
    [900, 620],
    [600, 760],
  ]) {
    await page.cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.waitForFunction(
      ({ width, height }) => innerWidth === width && innerHeight === height,
      { width, height },
    );
    if (
      width === 600 &&
      (await page.evaluate(
        () =>
          document.querySelector(
            '[data-state="expanded"][data-collapsible]',
          ) !== null,
      ))
    )
      await page.click('[aria-label="Toggle Sidebar"]');
    if (
      width !== 600 &&
      (await page.evaluate(
        () =>
          document.querySelector(
            '[data-state="collapsed"][data-collapsible]',
          ) !== null,
      ))
    )
      await page.click('[aria-label="Toggle Sidebar"]');
    await page.evaluate(() =>
      document
        .querySelector('[data-slot="question-card"]')
        .scrollIntoView({ block: "start", behavior: "instant" }),
    );
    await page.waitForFunction(() => {
      const card = document.querySelector('[data-slot="question-card"]');
      const heading = card.querySelector("h3").getBoundingClientRect();
      return (
        card.clientWidth > 0 && heading.top >= 0 && heading.top < innerHeight
      );
    });
    const bounds = await page.evaluate(() => {
      const card = document.querySelector('[data-slot="question-card"]');
      return {
        width: card.clientWidth,
        scrollWidth: card.scrollWidth,
        pageWidth: document.documentElement.clientWidth,
        pageScrollWidth: document.documentElement.scrollWidth,
      };
    });
    assert.ok(bounds.scrollWidth <= bounds.width + 1, JSON.stringify(bounds));
    assert.ok(
      bounds.pageScrollWidth <= bounds.pageWidth + 1,
      JSON.stringify(bounds),
    );
    await settleQuestion();
    await page.screenshot({
      path: `${evidence}/multiple-${theme}-${width}.png`,
    });
    await page.focus('[data-slot="question-submit"]');
    await page.screenshot({
      path: `${evidence}/multiple-${theme}-${width}-footer.png`,
    });
  }
  await page.evaluate(
    await fs.readFile(`${root}/node_modules/axe-core/axe.min.js`, "utf8"),
  );
  const violations = await page.evaluate(async () =>
    (
      await axe.run(document.querySelector('[data-slot="question-card"]'), {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      })
    ).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.failureSummary),
    })),
  );
  assert.deepEqual(violations, []);
}
await page.click('[data-slot="question-submit"]');
await page.press(
  '[data-slot="question-input"] :is(input, textarea)',
  "Meta+Enter",
);
await page.waitForSelector('[data-slot="question-card"]', { state: "hidden" });
const result = await page.evaluate(
  () =>
    window.__harborFixture
      .snapshot()
      .calls.filter((c) => c.command === "answer_request")
      .at(-1).args.result,
);
assert.deepEqual(result, {
  action: "accept",
  content: { checks: ["unit", "browser"], count: 2 },
});
console.log(
  "PASS: all provider forms, request ID 0, keyboard choice, notes, submission retry, busy state, typed multi-question flow, light/dark and 600/900/1380px layouts.",
);
console.log({ evidence });
