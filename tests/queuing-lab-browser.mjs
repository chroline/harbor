// Run against Vite: ego-browser nodejs < tests/queuing-lab-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace("Harbor queuing design lab");
const page = task.page("p1");
await page.goto("http://127.0.0.1:1420/labs/queuing.html");
await page.waitForSelector(".ql-choice");
await page.waitForFunction(
  () => getComputedStyle(document.body).overflow === "auto",
);
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1100,
  deviceScaleFactor: 1,
  mobile: false,
});
const variants = [
  "Stacked rows",
  "Queue tray",
  "Timeline entries",
  "Split action bar",
  "Side rail",
  "Next-message card",
];
for (const theme of ["dark", "light"]) {
  if (theme === "light")
    await page.click("button[aria-label='Switch to light theme']");
  for (const narrow of [false, true]) {
    await page.click(
      narrow
        ? "loc=role:button[name='Narrow']"
        : "loc=role:button[name='Wide']",
    );
    for (let index = 0; index < variants.length; index++) {
      console.log("Checking", theme, narrow, variants[index]);
      await page.click(`.ql-choice:nth-child(${index + 1})`);
      await page.selectOption("select[aria-label='Scenario']", "queued");
      await page.click("button[aria-label='Reset scenario']");
      await page.waitForFunction(
        ({ index }) =>
          document
            .querySelectorAll(".ql-choice")
            [index].getAttribute("aria-pressed") === "true",
        { index },
      );
      const metrics = await page.evaluate(() => ({
        bodyOverflow: document.documentElement.scrollWidth > innerWidth,
        windowOverflow:
          document.querySelector(".ql-window").scrollWidth >
          document.querySelector(".ql-window").clientWidth + 1,
        rows: document.querySelectorAll(".ql-window li").length,
        width: document.querySelector(".ql-window").getBoundingClientRect()
          .width,
      }));
      assert.equal(
        metrics.bodyOverflow,
        false,
        `${theme}/${narrow}/${index} page overflow`,
      );
      assert.equal(
        metrics.windowOverflow,
        false,
        `${theme}/${narrow}/${index} window overflow`,
      );
      assert.equal(metrics.rows, 3);
      if (narrow) assert.ok(metrics.width <= 401);
      await page.evaluate(() =>
        document
          .querySelector(".ql-preview-section")
          .scrollIntoView({ block: "start" }),
      );
      await page.screenshot({
        path: `/Users/colegawin/Desktop/harbor/artifacts/queuing/${index + 1}-${theme}-${narrow ? "narrow" : "wide"}.png`,
      });
      console.log({ variant: variants[index], theme, narrow, ...metrics });
    }
  }
}
// Exercise identical queue controls in every treatment.
for (let index = 0; index < variants.length; index++) {
  await page.click(`.ql-choice:nth-child(${index + 1})`);
  await page.click("button[aria-label='Reset scenario']");
  if (index === 3)
    await page.fill(
      "textarea[aria-label='Message your agent']",
      "New queued instruction",
    );
  else {
    await page.click("[role='textbox']");
    await page.keyboard.insertText("New queued instruction");
  }
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll(".ql-window li").length,
    ),
    4,
  );
  if (index === 3)
    await page.fill(
      "textarea[aria-label='Message your agent']",
      "Steer right now",
    );
  else {
    await page.click("[role='textbox']");
    await page.keyboard.insertText("Steer right now");
  }
  await page.keyboard.press("Meta+Enter");
  await page.waitForFunction(() =>
    document
      .querySelector(".ql-activity")
      .textContent.includes("Steer right now"),
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll(".ql-window li").length,
    ),
    4,
  );
  await page.click("button[aria-label='Stop response']");
  assert.ok(
    (
      await page.evaluate(() => document.querySelector(".ql-queue").textContent)
    ).includes("Queue paused"),
  );
  await page.click(
    index === 1
      ? ".ql-resume"
      : index === 0
        ? ".prompt-queue-heading button"
        : ".ql-queue-heading button",
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll(".ql-window li").length,
    ),
    3,
  );
  await page.click(".ql-window li button >> nth=0");
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll(".ql-window li").length,
    ),
    2,
  );
  await page.click("loc=role:button[name='Simulate error']");
  assert.ok(
    (
      await page.evaluate(
        () => document.querySelector(".ql-window").textContent,
      )
    ).includes("disconnected"),
  );
  console.log({ interactions: variants[index], passed: true });
}
// Actual narrow viewport, not only the narrow preview toggle.
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
for (let index = 0; index < variants.length; index++) {
  await page.click(`.ql-choice:nth-child(${index + 1})`);
  await page.click("button[aria-label='Reset scenario']");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.evaluate(() =>
    document
      .querySelector(".ql-preview-section")
      .scrollIntoView({ block: "start" }),
  );
  await page.screenshot({
    path: `/Users/colegawin/Desktop/harbor/artifacts/queuing/${index + 1}-mobile.png`,
  });
}
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1100,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.click(".ql-choice:first-child");
await page.click("button[aria-label='Reset scenario']");
await page.click("loc=role:button[name='Wide']");
await task.finish({ keep: ["p1"] });
console.log(
  "Queuing lab: 24 layout/theme checks, six interaction flows and six mobile checks passed.",
);
