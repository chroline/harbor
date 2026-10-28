// Run: ego-browser nodejs < tests/sticky-user-messages-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(
  globalThis.HARBOR_QA_SPACE ?? "Harbor sticky messages QA",
);
const page = task.page("p1");
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1500,
  height: 740,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.goto("http://127.0.0.1:1420/tests/ui.html");
await page.waitForSelector('[aria-label="Describe a new task"]');
await page.fill('[aria-label="Describe a new task"]', "Sticky prompts");
await page.click('loc=role:button[name="Start task"]');
await page.waitForSelector('[aria-label="Message your agent"]');
await page.evaluate(async () =>
  window.__harborFixture.longTranscript({ image: true }),
);
await page.waitForFunction(
  () =>
    document.querySelectorAll(
      '[data-slot="message-scroller-viewport"] .transcript-turn',
    ).length === 121,
);
// Leave follow-output mode through the public navigation control.
await page.click('button[aria-label="Jump to: Review case 30"]');
await page.waitForFunction(() => {
  const viewport = document.querySelector(
    '[data-slot="message-scroller-viewport"]',
  );
  const row = [...document.querySelectorAll(".transcript-turn")].find(
    (row) =>
      row.querySelector(".transcript-user .typeset")?.textContent ===
      "Review case 30",
  );
  return (
    Math.abs(
      row.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top -
        20,
    ) < 1
  );
});
await page.press('button[aria-label="Jump to: Review case 30"]', "Escape");
await page.mouse.move(1400, 600);
assert.equal(
  await page.evaluate(async () => {
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const viewport = document.querySelector(
      '[data-slot="message-scroller-viewport"]',
    );
    const prompt = [...viewport.querySelectorAll(".transcript-user")].find(
      (message) =>
        message.querySelector(".typeset").textContent === "Review case 30",
    );
    const bounds = prompt.getBoundingClientRect();
    return prompt.contains(
      document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + 5),
    );
  }),
  true,
  "Jumping to a turn must reveal its prompt, without an old pin covering it",
);

async function scrollIntoResponse(text) {
  const result = await page.evaluate(async (text) => {
    const viewport = document.querySelector(
      '[data-slot="message-scroller-viewport"]',
    );
    const message = [...document.querySelectorAll(".transcript-user")].find(
      (message) => message.querySelector(".typeset").textContent === text,
    );
    const row = message.closest(".transcript-turn");
    viewport.scrollTo({
      top:
        viewport.scrollTop +
        row.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top +
        110,
      behavior: "instant",
    });
    // Let native sticky positioning settle without replacing the prompt.
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const header = row.querySelector(":scope > .transcript-prompt-header");
    if (!header) return { headerExists: false };
    const top = viewport.getBoundingClientRect().top;
    const bounds = header.getBoundingClientRect();
    const prompt = header
      .querySelector(".transcript-user")
      .getBoundingClientRect();
    const image = header.querySelector("img");
    let imageStaysStill = !!image?.complete;
    for (let node = image; node && node !== header; node = node.parentElement) {
      const style = getComputedStyle(node);
      imageStaysStill &&= style.opacity === "1" && style.transform === "none";
    }
    const covers = (x, y) =>
      !document.elementFromPoint(x, y)?.closest(".transcript-responses");
    const backing = header.querySelector(".transcript-prompt-backdrop");
    const backingStyle = getComputedStyle(backing, "::before");
    const background = getComputedStyle(backing).backgroundColor;
    const scene = viewport.closest(".chat-scene");
    const sceneBounds = scene.getBoundingClientRect();
    const color = document.createElement("canvas").getContext("2d");
    color.fillStyle = background;
    color.fillRect(0, 0, 1, 1);
    return {
      headerExists: true,
      imageStaysStill,
      nativeSticky:
        viewport.contains(header) &&
        getComputedStyle(header).position === "sticky",
      noDuplicatePrompts:
        document.querySelectorAll(".transcript-user").length ===
        document.querySelectorAll(".transcript-turn").length,
      noViewportClip: getComputedStyle(viewport).clipPath === "none",
      messageShadowUnclipped:
        getComputedStyle(header).clipPath === "none" &&
        getComputedStyle(header).overflow === "visible" &&
        getComputedStyle(header.querySelector('[data-slot="bubble-content"]'))
          .boxShadow !== "none",
      coversViewportEdge: bounds.top <= top,
      bubbleInset: Math.abs(prompt.top - top - 8) < 1,
      seamlessBacking:
        color.getImageData(0, 0, 1, 1).data[3] === 255 &&
        backingStyle.position === "fixed" &&
        Math.abs(parseFloat(backingStyle.left) - sceneBounds.left) < 1 &&
        Math.abs(parseFloat(backingStyle.top) - sceneBounds.top) < 1 &&
        Math.abs(parseFloat(backingStyle.width) - sceneBounds.width) < 1 &&
        Math.abs(parseFloat(backingStyle.height) - sceneBounds.height) < 1,
      noMovingResponseLayer:
        getComputedStyle(row.querySelector(".transcript-responses"))
          .transform === "none",
      fullWidth: Math.abs(bounds.width - row.getBoundingClientRect().width) < 1,
      coversTopGap: covers(bounds.left + bounds.width / 2, top + 2),
      coversFirstPixel: covers(bounds.left + bounds.width / 2, top + 0.25),
      coversBothCorners:
        covers(bounds.left + 1, bounds.bottom - 1) &&
        covers(bounds.right - 1, bounds.bottom - 1),
      showsResponseBelow: !!document
        .elementFromPoint(bounds.left + bounds.width / 2, bounds.bottom + 1)
        ?.closest(".transcript-responses"),
      noClipPathAnimation: !row
        .getAnimations({ subtree: true })
        .some((animation) =>
          animation.effect.getKeyframes().some((frame) => "clipPath" in frame),
        ),
      rowStaysInFlow: row.getBoundingClientRect().top < top - 100,
    };
  }, text);
  assert.deepEqual(result, {
    headerExists: true,
    imageStaysStill: true,
    nativeSticky: true,
    noDuplicatePrompts: true,
    noViewportClip: true,
    messageShadowUnclipped: true,
    coversViewportEdge: true,
    bubbleInset: true,
    seamlessBacking: true,
    noMovingResponseLayer: true,
    fullWidth: true,
    coversTopGap: true,
    coversFirstPixel: true,
    coversBothCorners: true,
    showsResponseBelow: true,
    noClipPathAnimation: true,
    rowStaysInFlow: true,
  });
}

await scrollIntoResponse("Review case 30");

// Compare the pinned backing against the actual skyline at the same pixels.
// Hide only the bubble first, leaving response text beneath the backing; a
// translucent header, solid patch, or misaligned copy will differ from the scene.
async function assertSeamlessBacking(text) {
  const fs = await import("node:fs/promises");
  const crop = await page.evaluate((text) => {
    const header = [
      ...document.querySelectorAll(".transcript-prompt-header"),
    ].find((node) => node.textContent === text);
    const bounds = header.getBoundingClientRect();
    const viewport = header
      .closest('[data-slot="message-scroller-viewport"]')
      .getBoundingClientRect();
    header.querySelector(".transcript-user").style.visibility = "hidden";
    return {
      x: Math.ceil(bounds.left),
      y: Math.ceil(Math.max(viewport.top + 1, bounds.top)),
      width: Math.floor(bounds.width),
      height: Math.floor(bounds.height - 4),
    };
  }, text);
  const backingShot = await page.screenshot();
  await page.evaluate(
    () =>
      (document.querySelector(".chat-transcript").style.visibility = "hidden"),
  );
  const sceneShot = await page.screenshot();
  await page.evaluate(() => {
    document
      .querySelector(".chat-transcript")
      .style.removeProperty("visibility");
    document
      .querySelectorAll(".transcript-user")
      .forEach((node) => node.style.removeProperty("visibility"));
  });
  const comparison = await page.evaluate(
    async ({ backing, scene, crop }) => {
      const pixels = async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(crop.x, crop.y, crop.width, crop.height).data;
      };
      const a = await pixels(backing),
        b = await pixels(scene);
      let maximum = 0;
      for (let i = 0; i < a.length; i++)
        maximum = Math.max(maximum, Math.abs(a[i] - b[i]));
      return maximum;
    },
    {
      backing: `data:image/png;base64,${(await fs.readFile(backingShot)).toString("base64")}`,
      scene: `data:image/png;base64,${(await fs.readFile(sceneShot)).toString("base64")}`,
      crop,
    },
  );
  assert.ok(
    comparison <= 3,
    `Pinned backing must match the skyline without leaking text; maximum pixel difference: ${comparison}`,
  );
  console.log(`Pinned skyline pixel difference for ${text}: ${comparison}`);
}
await assertSeamlessBacking("Review case 30");
await scrollIntoResponse("Review case 31");
await scrollIntoResponse("Review case 30");

// The native header must cover responses immediately, without waiting for
// animation frames or an independently moving clipping layer.
assert.deepEqual(
  await page.evaluate(async () => {
    const viewport = document.querySelector(
      '[data-slot="message-scroller-viewport"]',
    );
    const row = [...document.querySelectorAll(".transcript-turn")].find(
      (row) =>
        row.querySelector(".transcript-user .typeset")?.textContent ===
        "Review case 30",
    );
    const header = row.querySelector(":scope > .transcript-prompt-header");
    const results = [];
    for (const delta of [90, -100, 70, -60]) {
      viewport.scrollTo({
        top: viewport.scrollTop + delta,
        behavior: "instant",
      });
      const bounds = header.getBoundingClientRect();
      const x = bounds.left + bounds.width / 2;
      results.push(
        !document
          .elementFromPoint(x, viewport.getBoundingClientRect().top + 0.25)
          ?.closest(".transcript-responses") &&
          !!document
            .elementFromPoint(x, bounds.bottom + 1)
            ?.closest(".transcript-responses"),
      );
    }
    return results;
  }),
  [true, true, true, true],
);

// Check paused streaming before wheel input, whose native momentum can still
// change scrollTop after the input call returns.
// Start the response before sampling: its first chunk can evict an old row
// from the bounded history and legitimately change the absolute scroll offset.
await page.evaluate(async () => {
  await window.__harborFixture.update({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "STICKY_STREAM_START" },
  });
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
});
await page.waitForFunction(() =>
  document.body.textContent.includes("STICKY_STREAM_START"),
);
await page.evaluate(async () => {
  const viewport = document.querySelector(
    '[data-slot="message-scroller-viewport"]',
  );
  let previous = viewport.scrollTop,
    stable = 0,
    frames = 0;
  await new Promise((resolve, reject) => {
    const sample = () => {
      stable = viewport.scrollTop === previous ? stable + 1 : 0;
      previous = viewport.scrollTop;
      if (stable >= 4) return resolve();
      if (++frames > 120)
        return reject(new Error("Initial streaming layout did not settle"));
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
});
const before = await page.evaluate(
  () =>
    document.querySelector('[data-slot="message-scroller-viewport"]').scrollTop,
);
await page.evaluate(async () =>
  window.__harborFixture.update({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: " STICKY_STREAM_CHECK" },
  }),
);
await page.waitForFunction(() =>
  document.body.textContent.includes("STICKY_STREAM_CHECK"),
);
assert.equal(
  await page.evaluate(
    () =>
      document.querySelector('[data-slot="message-scroller-viewport"]')
        .scrollTop,
  ),
  before,
);
await scrollIntoResponse("Review case 30");

// Exercise real wheel input too, including handoff between adjacent turns.
await page.mouse.move(900, 250);
await page.mouse.wheel(0, 900, { label: "Scroll quickly down transcript" });
await page.mouse.wheel(0, -800, { label: "Scroll quickly up transcript" });
await page.evaluate(async () => {
  const viewport = document.querySelector(
    '[data-slot="message-scroller-viewport"]',
  );
  await new Promise((resolve, reject) => {
    let previous = viewport.scrollTop;
    let stable = 0;
    let frames = 0;
    const sample = () => {
      stable = viewport.scrollTop === previous ? stable + 1 : 0;
      previous = viewport.scrollTop;
      if (stable >= 4) return resolve();
      if (++frames > 120)
        return reject(new Error("Wheel scrolling did not settle"));
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
});
await scrollIntoResponse("Review case 30");

await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 600,
  height: 740,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.evaluate(() => {
  document.documentElement.classList.remove("dark");
  document.documentElement.classList.add("light");
  const OriginalDate = Date;
  window.Date = class extends OriginalDate {
    constructor(...args) {
      super(...(args.length ? args : [2026, 9, 26, 12]));
    }
  };
  window.dispatchEvent(new Event("focus"));
});
await page.waitForSelector(".chat-scene.light", { state: "visible" });
await page.cdp("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
await scrollIntoResponse("Review case 40");
await assertSeamlessBacking("Review case 40");
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);

// A long final response must keep the native scroll bounds unchanged.
await page.evaluate(async () => {
  await window.__harborFixture.update({
    sessionUpdate: "agent_message_chunk",
    content: {
      type: "text",
      text: "\n\n" + "Long final response. ".repeat(700),
    },
  });
});
await page.click('button[aria-label="Scroll to latest"]');
await page.waitForFunction(() => {
  const viewport = document.querySelector(
    '[data-slot="message-scroller-viewport"]',
  );
  return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 2;
});
assert.equal(
  await page.evaluate(() => {
    const viewport = document.querySelector(
      '[data-slot="message-scroller-viewport"]',
    );
    return viewport.scrollHeight <= viewport.firstElementChild.offsetHeight + 1;
  }),
  true,
  "A long reply must not add blank space after the transcript",
);

await page.evaluate(async () => {
  document.querySelector('[data-slot="message-scroller-viewport"]').scrollTop =
    0;
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
});
assert.equal(
  await page.evaluate(() => {
    const viewport = document.querySelector(
      '[data-slot="message-scroller-viewport"]',
    );
    return [...document.querySelectorAll(".transcript-user")].every(
      (message) =>
        message.getBoundingClientRect().top >
        viewport.getBoundingClientRect().top + 8,
    );
  }),
  true,
);
console.log(
  "Passed: pixel-matched skyline backing with unclipped message shadows; native sticky prompts, immediate scroll reversals, stable streaming, long replies, narrow layout, and reduced motion.",
);
if (!globalThis.HARBOR_QA_SPACE) await task.finish({ keep: [] });
