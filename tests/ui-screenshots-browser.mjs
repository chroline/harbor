// Screenshots of the main UI, seeded with tests/ui-fixtures.js.
//
// Run through the launcher, which supplies the repo path and server URL:
//   npm run screenshots              (needs Vite running on :1420)
//   npm run screenshots -- http://localhost:1431/
//
// Writes PNGs to screenshots/ui/ at 1440×900 and 2× resolution.
// ego-browser runs this with no file path or working directory of its own.
const fs = await import("node:fs/promises");
const root = globalThis.HARBOR_ROOT;
if (!root) throw new Error("Run through tests/ui-screenshots.mjs (npm run screenshots).");
const url = globalThis.HARBOR_UI_URL ?? "http://localhost:1420/";
const out = `${root}/screenshots/ui`;
await fs.mkdir(out, { recursive: true });
const fixtures = await fs.readFile(`${root}/tests/ui-fixtures.js`, "utf8");

const task = await taskSpace("Harbor UI screenshots");
const page = task.page("p1");
const viewport = { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false };
const written = [];

const shot = async (name) => {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  const path = `${out}/${name}.png`;
  await page.screenshot({ path });
  written.push(path);
};

// The fixtures replace the desktop bridge, so they must run before the app does.
// The app remembers the last view and caches transcripts, so start each theme
// on a fresh document and navigate explicitly.
const load = async (theme) => {
  await page.cdp("Emulation.setDeviceMetricsOverride", viewport);
  await page.cdp("Page.addScriptToEvaluateOnNewDocument", { source: fixtures });
  await page.goto(url);
  await page.evaluate((t) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("fixture.theme", t);
  }, theme);
  await page.reload();
  await page.waitForSelector("#fixture-stoplights", { timeout: 20000 });
};

// New task, then out of the composer so the default centered layout shows.
const home = async () => {
  await page.keyboard.press("Meta+n");
  await page.waitForSelector(".home-dashboard", { state: "visible", timeout: 15000 });
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.querySelector(".home-pager")?.hasAttribute("data-revealed"),
    undefined,
    { timeout: 5000 },
  );
  await page.waitForTimeout(1200);
};

const openChat = async () => {
  await page.click("loc=role:button[name='Open Add rate limiting to the public API']", {
    label: "open the fixture chat",
  });
  await page.waitForSelector("text=Rate limiting is in place", { state: "visible", timeout: 15000 });
  await page.waitForTimeout(1200);
};

try {
  for (const theme of ["light", "dark"]) {
    const suffix = theme === "dark" ? "-dark" : "";
    await load(theme);

    await home();
    await shot(`01-home${suffix}`);

    await page.click("loc=role:textbox[name='Describe a new task']", { label: "focus the composer" });
    await page.keyboard.type("Add pagination to the /v1/invoices endpoint");
    await page.waitForTimeout(1300);
    await shot(`02-composing${suffix}`);

    await page.click("loc=role:button[name='Choose model and reasoning']", { label: "open model menu" });
    await page.waitForSelector(".model-menu", { state: "visible" });
    await page.waitForTimeout(600);
    await shot(`03-model-menu${suffix}`);

    await page.click("loc=role:button[name='Choose model']", { label: "open model list" });
    await page.waitForTimeout(500);
    await page.hover("loc=role:button[name='6 Astra']", { label: "hover a model" });
    await page.waitForTimeout(300);
    await shot(`04-model-list${suffix}`);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    await page.click("loc=role:button[name='Agent settings']", { label: "open agent settings" });
    await page.waitForTimeout(600);
    await shot(`05-agent-settings${suffix}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    await home();
    await openChat();
    await shot(`06-chat${suffix}`);

    // Expand one group at a time: opening one shifts the next.
    for (const group of ["Worked for 48s", "Worked for 3m"]) {
      await page.click(`[aria-expanded="false"]:has-text("${group}")`, { label: `expand ${group}` });
      await page.waitForSelector(`[aria-expanded="true"]:has-text("${group}")`, { timeout: 5000 });
      await page.waitForTimeout(400);
    }
    await shot(`07-chat-tools${suffix}`);

    await page.click("loc=role:button[name='Settings']", { label: "open settings" });
    await page.waitForSelector("text=Agent connections", { state: "visible" });
    await page.waitForTimeout(900);
    await shot(`08-settings${suffix}`);
  }
} finally {
  await page.evaluate(() => localStorage.removeItem("fixture.theme")).catch(() => {});
}

console.log(written.join("\n"));
await task.finish({ keep: [] });
