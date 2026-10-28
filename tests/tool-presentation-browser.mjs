// With Vite running: ego-browser nodejs < tests/tool-presentation-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace("Harbor tool presentation before and after");
console.log({ spaceId: task.spaceId });
const before = task.page("p1");
const pages = await task.pages();
const after =
  pages.find((page) => page.label === "p2") ?? (await task.newPage());
for (const [view, page] of [
  ["before", before],
  ["after", after],
]) {
  await page.goto(
    `http://127.0.0.1:1420/tests/tool-presentation.html?view=${view}`,
  );
  const group =
    view === "before"
      ? 'button[aria-label="Needs attention"]'
      : ".transcript-activity > button";
  await page.waitForSelector(group);
  if (view === "after")
    await page.click(group, { label: "Expand completed tool activity" });
  console.log(await page.snapshot());
  const count = await page.evaluate(
    () => document.querySelectorAll('button[aria-label="View details"]').length,
  );
  assert.equal(count, 11);
  for (let i = 0; i < count; i++) {
    const selector = `css=button[aria-label="View details"] >> nth=${i}`;
    const expanded = await page.evaluate(
      (index) =>
        document
          .querySelectorAll('button[aria-label="View details"]')
          [index].getAttribute("aria-expanded"),
      i,
    );
    if (expanded !== "true")
      await page.click(selector, { label: "Expand tool activity details" });
  }
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button[aria-label="View details"]')].every(
      (button) => button.getAttribute("aria-expanded") === "true",
    ),
  );
  for (const width of [1400, 650]) {
    await page.cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const result = await page.evaluate(() => {
      const main = document.querySelector("main");
      const text = main.innerText;
      return {
        fileHeaderSize: document.querySelector(
          '[data-mode="read"] figcaption > span',
        )
          ? getComputedStyle(
              document.querySelector('[data-mode="read"] figcaption > span'),
            ).fontSize
          : null,
        fileCards: [
          ...document.querySelectorAll(
            '[data-slot="file-diff"]:not([data-language="json"])',
          ),
        ].map((card) => ({
          header: card.querySelector("figcaption").getBoundingClientRect()
            .height,
          gutter: card
            .querySelector('[data-slot="file-diff-gutter"]')
            .getBoundingClientRect().width,
          codeInset:
            card.querySelector("pre").getBoundingClientRect().left -
            card.getBoundingClientRect().left,
        })),
        rowCount: document.querySelectorAll('button[aria-label="View details"]')
          .length,
        hasError: text.includes("fatal: invalid object name 'missing-ref'."),
        hasExitCode: text.includes("Exit code 128"),
        hasTruncation: text.includes("Earlier terminal output was truncated."),
        readCodeMetrics: (() => {
          const card = document.querySelector(
            '[data-mode="read"]:not([data-language="json"])',
          );
          if (!card) return null;
          const number = card.querySelector(".file-diff-line-number");
          const divider = number.parentElement;
          const token = card.querySelector("pre code > div > span");
          return {
            size: getComputedStyle(card.querySelector("pre")).fontSize,
            before:
              divider.getBoundingClientRect().right -
              parseFloat(getComputedStyle(divider).borderRightWidth) -
              number.getBoundingClientRect().right,
            after:
              token.getBoundingClientRect().left -
              divider.getBoundingClientRect().right,
          };
        })(),
        hasFullOutput: text.includes("Full output"),
        hasParameterTable: !!document.querySelector(".tool-fields"),
        jsonBlocks: document.querySelectorAll("pre > code.language-json")
          .length,
        hasRawInput: text.includes('"command":'),
        hasHarness: text.includes("harness re-invokes"),
        hasWorkerPlumbing: text.includes("outputFile"),
        hasCommand: text.includes("cat openwiki/quickstart.md | head -80"),
        hasReport: text.includes("Confirmation and severity run per issue"),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        outputCount: [
          ...document.querySelectorAll('pre[aria-label="Output"]'),
        ].filter((node) => node.textContent.includes("# Lemma Platform"))
          .length,
      };
    });
    assert.equal(result.rowCount, 11);
    assert.equal(result.hasError, true);
    assert.equal(result.hasExitCode, view === "before");
    assert.equal(result.hasTruncation, view === "before");
    assert.equal(result.hasCommand, true);
    assert.equal(result.horizontalOverflow, false);
    if (view === "after") {
      assert.deepEqual(result.readCodeMetrics, {
        size: "12px",
        before: 8,
        after: 8,
      });
      assert.equal(result.hasFullOutput, false);
      assert.equal(result.hasParameterTable, false);
      assert(result.jsonBlocks >= 2);
      assert.equal(result.fileHeaderSize, "12px");
      assert.equal(result.fileCards.length, 2);
      assert.equal(result.fileCards[0].header, result.fileCards[1].header);
      assert.equal(result.hasRawInput, false);
      // The full provider output remains inspectable behind its disclosure.
      assert.equal(result.hasHarness, false);
      assert.equal(result.hasWorkerPlumbing, false);
      assert.equal(result.hasReport, true);
      assert.equal(result.outputCount, 1);
    } else {
      assert.equal(result.hasRawInput, true);
      assert.equal(result.hasHarness, true);
      assert.equal(result.hasWorkerPlumbing, true);
    }
    console.log({ view, width, ...result });
    console.log(
      await page.screenshot({
        path: `/Users/colegawin/Desktop/harbor/screenshots/tool-activity-${view}-${width}.png`,
        fullPage: true,
      }),
    );
  }
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 1400,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.evaluate(() => scrollTo(0, 0));
}
// Leave the space active for visual inspection; finish it with both result tabs
// kept after reviewing the generated screenshots.
console.log({
  before: before.label,
  after: after.label,
  spaceId: task.spaceId,
});
