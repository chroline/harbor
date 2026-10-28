// Run with Vite: ego-browser nodejs < tests/attachments-browser.mjs
const assert = (await import("node:assert/strict")).default;
const fs = await import("node:fs/promises");
const os = await import("node:os");
const path = await import("node:path");
const fixtureDir = await fs.mkdtemp(
  path.join(os.tmpdir(), "harbor-attachments-"),
);
const notesPath = path.join(fixtureDir, "harbor-attachment-notes.txt");
const imagePath = path.join(fixtureDir, "preview.png");
await fs.writeFile(notesPath, "Attachment smoke test: read this file.");
await fs.writeFile(
  imagePath,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);
const task = await taskSpace("Harbor file attachments QA");
const page = task.page("p1");
await page.goto("http://127.0.0.1:1420/tests/ui.html?empty");
await page.waitForSelector('loc=role:button[name="Attach files"]');
await page.setInputFiles('input[type="file"]', [notesPath, imagePath]);
await page.waitForSelector(
  'loc=role:button[name="Remove harbor-attachment-notes.txt"]',
  { state: "attached" },
);
await page.waitForFunction(
  () =>
    document.querySelector('button[aria-label="Start task"]')?.disabled ===
    false,
);
assert.equal(
  await page.evaluate(
    () => document.querySelectorAll(".task-composer img").length,
  ),
  1,
);
await page.evaluate(() => {
  const data = new DataTransfer();
  data.items.add(
    new File(["dropped content"], "dropped.json", { type: "application/json" }),
  );
  const editor = document.querySelector('[role="textbox"]');
  editor.dispatchEvent(
    new DragEvent("dragover", {
      bubbles: true,
      cancelable: true,
      dataTransfer: data,
    }),
  );
});
await page.waitForSelector('text="Drop files to attach"');
await page.evaluate(() => {
  const data = new DataTransfer();
  data.items.add(
    new File(["dropped content"], "dropped.json", { type: "application/json" }),
  );
  document.querySelector('[role="textbox"]').dispatchEvent(
    new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer: data,
    }),
  );
});
await page.waitForSelector('loc=role:button[name="Remove dropped.json"]', {
  state: "attached",
});
await page.waitForFunction(
  () => !document.body.textContent.includes("Drop files to attach"),
);
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 900,
  height: 620,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.waitForFunction(
  () => document.querySelector(".task-composer img")?.complete,
);
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
console.log(
  await page.screenshot({ path: "/tmp/harbor-attachments-composer.png" }),
);
await page.click('loc=role:button[name="Remove dropped.json"]', {
  label: "remove dropped attachment",
});
await page.waitForSelector('loc=role:button[name="Remove dropped.json"]', {
  state: "detached",
});
await page.click('loc=role:button[name="Start task"]', {
  label: "send attachment-only task",
});
await page.waitForSelector('loc=role:textbox[name="Message your agent"]');
await page.waitForSelector('loc=css:[aria-label="Attachments"] img[alt="preview.png"]');
assert.equal(
  await page.evaluate(
    () =>
      document.querySelectorAll('.task-composer [aria-label^="Remove "]')
        .length,
  ),
  0,
);
assert.equal(
  await page.evaluate(() =>
    !!document.querySelector('[aria-label="Attachments"] img[alt="preview.png"]'),
  ),
  true,
);
await page.evaluate(() => {
  const data = new DataTransfer();
  data.items.add(
    new File(["follow-up"], "follow-up.txt", { type: "text/plain" }),
  );
  document.querySelector('[role="textbox"]').dispatchEvent(
    new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer: data,
    }),
  );
});
await page.waitForSelector('loc=role:button[name="Remove follow-up.txt"]', {
  state: "attached",
});
await page.waitForFunction(
  () =>
    document.querySelector('button[aria-label="Send message"]')?.disabled ===
    false,
);
console.log(
  await page.screenshot({ path: "/tmp/harbor-attachments-chat.png" }),
);
console.log(
  "Passed: file input, image previews, drag overlay, drop on rich editor, removal, attachment-only task launch, transcript filenames, chat follow-up attachments, and narrow layout.",
);
// Other fixture capabilities can report a toast over the first attachment.
if (await page.evaluate(() => !!document.querySelector('.harbor-toaster .ui-tsc__toast:not([data-removing]) button[aria-label="Dismiss notification"]'))) {
  await page.click('.harbor-toaster .ui-tsc__toast:not([data-removing]) button[aria-label="Dismiss notification"]');
}
await page.click('[aria-label="Attachments"] button[data-slot="lightbox-photo"]');
await page.waitForSelector('[role="dialog"]');
await page.waitForSelector('[data-slot="lightbox-zoom"] img');
assert.equal(await page.evaluate(() => document.querySelector('[role="dialog"] img').alt), "preview.png");
await page.keyboard.press("Escape");
await page.waitForSelector('[role="dialog"]', { state: "detached" });
assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-slot")), "lightbox-photo");
await page.click('[aria-label="Attachments"] button[data-slot="lightbox-photo"]');
await page.waitForSelector('[role="dialog"]');
await page.click('loc=role:button[name="Close"]');
await page.waitForSelector('[role="dialog"]', { state: "detached" });
console.log("Passed: Kobra lightbox open, image identity, Escape dismissal, focus return, reopen and close control.");
await task.finish({ keep: [] });

await fs.rm(fixtureDir, { recursive: true, force: true });
