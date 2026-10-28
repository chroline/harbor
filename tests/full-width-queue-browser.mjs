// Run against Vite: ego-browser nodejs < tests/full-width-queue-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace("Harbor collapsed queue refinements");
const page = task.page("p1");
await page.goto("http://127.0.0.1:1420/labs/quiet-queue.html");
await page.waitForSelector(".prompt-queue-row");
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1100,
  deviceScaleFactor: 1,
  mobile: false,
});
for (const theme of ["dark", "light"]) {
  if (theme === "light")
    await page.click("button[aria-label='Switch to light theme']");
  for (const narrow of [false, true]) {
    await page.click(
      narrow
        ? "loc=role:button[name='Narrow']"
        : "loc=role:button[name='Wide']",
    );
    for (let index = 0; index < 6; index++) {
      await page.click(`.ql-choice:nth-child(${index + 1})`);
      await page.selectOption("select[aria-label='Scenario']", "queued");
      await page.evaluate(() =>
        document
          .querySelector(".ql-preview-section")
          .scrollIntoView({ block: "start" }),
      );
      const point = await page.evaluate(() => {
        const r = document
          .querySelector(".task-composer-layout")
          .getBoundingClientRect();
        return {
          x: r.x + r.width / 2,
          y: r.top - 5,
          top: r.top,
          width: r.width,
        };
      });
      await page.mouse.move(20, 20, { label: "Inspect collapsed stack" });
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".prompt-queue-row")].every(
          (row, i) =>
            Math.abs(
              new DOMMatrix(getComputedStyle(row).transform).a -
                (0.95 - i * 0.05),
            ) < 0.001,
        ),
      );
      const styles = await page.evaluate(() => {
        const props = [
          "backgroundColor",
          "borderRadius",
          "padding",
          "boxShadow",
          "fontSize",
          "lineHeight",
          "color",
        ];
        const read = (el) =>
          Object.fromEntries(props.map((p) => [p, getComputedStyle(el)[p]]));
        return {
          indexCount: document.querySelectorAll(".prompt-queue-index").length,
          headingHeight: document
            .querySelector(".prompt-queue-heading")
            .getBoundingClientRect().height,
          sent: read(
            document.querySelector(
              '.ql-transcript .transcript-user [data-slot="bubble-content"]',
            ),
          ),
          queued: read(
            document.querySelector(
              '.prompt-queue-row .transcript-user [data-slot="bubble-content"]',
            ),
          ),
        };
      });
      assert.deepEqual(styles.queued, styles.sent);
      assert.equal(styles.indexCount, 0);
      assert.ok(styles.headingHeight <= 1);
      const collapsed = await page.evaluate(() =>
        [...document.querySelectorAll(".prompt-queue-row")].map((e) => {
          const preview = e.querySelector(".transcript-message .typeset");
          const r = preview.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + 10, r.top + 8);
          return {
            width: e.offsetWidth,
            bottom: e.getBoundingClientRect().bottom,
            scale: new DOMMatrix(getComputedStyle(e).transform).a,
            text: preview.textContent.trim(),
            visible: hit?.closest(".prompt-queue-row") === e,
          };
        }),
      );
      assert.equal(collapsed.length, 3);
      assert.ok(Math.abs(point.top - collapsed[0].bottom + 8) < 1);
      collapsed.forEach((row, i) => {
        assert.ok(Math.abs(row.width - point.width) < 1);
        assert.ok(Math.abs(row.scale - (0.95 - i * 0.05)) < 0.002);
        assert.ok(row.text && row.visible, `Collapsed message ${i} is visible`);
      });
      await page.mouse.move(point.x, point.y, {
        label: "Expand queued messages",
      });
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".prompt-queue-row")].every(
          (e) =>
            Math.abs(new DOMMatrix(getComputedStyle(e).transform).a - 1) <
            0.001,
        ),
      );
      const expanded = await page.evaluate(() => ({
        top: document
          .querySelector(".task-composer-layout")
          .getBoundingClientRect().top,
        overflow: document.documentElement.scrollWidth > innerWidth,
        rows: [...document.querySelectorAll(".prompt-queue-row")].map((e) => {
          const r = e.getBoundingClientRect();
          return { x: r.x, top: r.top, bottom: r.bottom, width: r.width };
        }),
      }));
      assert.ok(Math.abs(expanded.top - point.top) < 1);
      assert.ok(Math.abs(expanded.top - expanded.rows[0].bottom - 10) < 1);
      assert.equal(expanded.overflow, false);
      for (const row of expanded.rows)
        assert.ok(Math.abs(row.width - point.width) < 1);
      for (let i = 1; i < expanded.rows.length; i++)
        assert.ok(expanded.rows[i].bottom <= expanded.rows[i - 1].top + 1);
      const gap = (expanded.rows[0].top + expanded.rows[1].bottom) / 2;
      await page.mouse.move(point.x, gap, {
        label: "Move between expanded messages",
      });
      assert.ok(
        await page.evaluate(() =>
          document.querySelector(".ql-queue").matches(":hover"),
        ),
      );
      await page.screenshot({
        path: `/Users/colegawin/Desktop/harbor/artifacts/full-width-queue/${index + 1}-${theme}-${narrow ? "narrow" : "wide"}.png`,
      });
      console.log({ index, theme, narrow, passed: true });
    }
  }
}
// Keyboard focus opens the stack and a longer message wraps without overlapping.
await page.click(".ql-choice:first-child");
await page.selectOption("select[aria-label='Scenario']", "queued");
await page.click('[role="textbox"]');
await page.keyboard.insertText(
  "Please review this longer queued instruction carefully, including all related changes and the full verification results before reporting the outcome.",
);
await page.keyboard.press("Enter");
await page.focus(".prompt-queue-row .ql-remove-message >> nth=0");
await page.waitForFunction(() =>
  [...document.querySelectorAll(".prompt-queue-row")].every(
    (e) => Math.abs(new DOMMatrix(getComputedStyle(e).transform).a - 1) < 0.001,
  ),
);
const detail = await page.evaluate(() => ({
  focused: document.querySelector(".ql-queue").matches(":focus-within"),
  rows: [...document.querySelectorAll(".prompt-queue-row")].map((e) => {
    const r = e.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height };
  }),
}));
assert.equal(detail.focused, true);
assert.equal(detail.rows.length, 4);
for (let i = 1; i < detail.rows.length; i++)
  assert.ok(detail.rows[i].bottom <= detail.rows[i - 1].top + 1);
await page.mouse.move(20, 20, { label: "Finish preview" });
await task.finish({ keep: [] });
console.log("All full-width queue checks passed.");
