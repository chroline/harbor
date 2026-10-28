const assert = (await import("node:assert/strict")).default;
const task = await taskSpace("Harbor stacked queue studies");
const page = task.page("p1");
await page.goto("http://127.0.0.1:1420/labs/stacked-queuing.html");
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
const names = [
  "Quiet outline",
  "Connected stack",
  "Soft bubbles",
  "Order rail",
  "Next up",
  "Minimal list",
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
    for (let i = 0; i < 6; i++) {
      await page.click(`.ql-choice:nth-child(${i + 1})`);
      await page.selectOption("select[aria-label='Scenario']", "queued");
      const stats = await page.evaluate(() => ({
        bodyOverflow: document.documentElement.scrollWidth > innerWidth,
        windowOverflow:
          document.querySelector(".ql-window").scrollWidth >
          document.querySelector(".ql-window").clientWidth + 1,
        count: document.querySelectorAll(".prompt-queue-row").length,
        heading: document.querySelector(".ql-preview-top h2").textContent,
      }));
      assert.equal(stats.bodyOverflow, false);
      assert.equal(stats.windowOverflow, false);
      assert.equal(stats.count, 3);
      assert.equal(stats.heading, names[i]);
      await page.evaluate(() =>
        document
          .querySelector(".ql-preview-section")
          .scrollIntoView({ block: "start" }),
      );
      await page.screenshot({
        path: `/Users/colegawin/Desktop/harbor/artifacts/stacked-queuing/${i + 1}-${theme}-${narrow ? "narrow" : "wide"}.png`,
      });
      console.log({ name: names[i], theme, narrow, ...stats });
    }
  }
}
for (let i = 0; i < 6; i++) {
  await page.click(`.ql-choice:nth-child(${i + 1})`);
  await page.selectOption("select[aria-label='Scenario']", "queued");
  await page.click('[role="textbox"]');
  await page.keyboard.insertText("Next queued instruction");
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll(".prompt-queue-row").length,
    ),
    4,
  );
  await page.click('[role="textbox"]');
  await page.keyboard.insertText("Steer now");
  await page.keyboard.press("Meta+Enter");
  await page.waitForFunction(() =>
    document.querySelector(".ql-activity").textContent.includes("Steer now"),
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll(".prompt-queue-row").length,
    ),
    4,
  );
  await page.click("button[aria-label='Stop response']");
  assert.ok(
    (
      await page.evaluate(
        () => document.querySelector(".prompt-queue").textContent,
      )
    ).includes("Queue paused"),
  );
  await page.click(".prompt-queue-heading button");
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll(".prompt-queue-row").length,
    ),
    3,
  );
  await page.click(".prompt-queue-row button >> nth=0");
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll(".prompt-queue-row").length,
    ),
    2,
  );
  await page.click("loc=role:button[name='Simulate error']");
  assert.ok(
    (
      await page.evaluate(
        () => document.querySelector(".prompt-queue").textContent,
      )
    ).includes("disconnected"),
  );
  console.log("Interaction passed:", names[i]);
}
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
for (let i = 0; i < 6; i++) {
  await page.click(`.ql-choice:nth-child(${i + 1})`);
  await page.selectOption("select[aria-label='Scenario']", "queued");
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
    path: `/Users/colegawin/Desktop/harbor/artifacts/stacked-queuing/${i + 1}-mobile.png`,
  });
}
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1100,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.click(".ql-choice:first-child");
await page.selectOption("select[aria-label='Scenario']", "queued");
await page.click("loc=role:button[name='Wide']");
await task.finish({ keep: ["p1"] });
console.log("All stacked queue checks passed.");
