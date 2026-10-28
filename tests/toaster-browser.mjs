// Run with Vite: ego-browser nodejs < tests/toaster-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(globalThis.HARBOR_QA_SPACE ?? "Harbor Affect toaster QA");
const page = task.page("p1");
const main = async (fn) => (await page.cdp("Runtime.evaluate", {
  expression: `(${fn.toString()})()`, returnByValue: true, awaitPromise: true,
})).result.value;
await page.goto("http://127.0.0.1:1420/tests/ui.html?empty");
await page.waitForSelector('button[aria-label="Start task"]');
await main(() => window.__harborFixture.notification("Could not save workspace"));
await page.waitForSelector('.ui-tsc__toast[data-type="error"]');
assert.equal(await page.evaluate(() => document.querySelectorAll('.app-error-banner').length), 0);
const first = await page.evaluate(() => document.querySelector('.ui-tsc__toast').dataset.toastId);
await main(() => window.__harborFixture.notification("Could not reconnect to the agent"));
await page.waitForFunction(() => document.querySelector('.ui-tsc__copy:not(.ui-tsc__ghost)')?.textContent.includes("Could not reconnect"));
assert.equal(await page.evaluate(() => document.querySelectorAll('.ui-tsc__toast:not([data-removing])').length), 1);
assert.equal(await page.evaluate(() => document.querySelector('.ui-tsc__toast').dataset.toastId), first);
await page.fill('[role="textbox"][aria-label="Describe a new task"]', "Notification test chat");
await page.click('button[aria-label="Start task"]');
await page.waitForSelector('[role="textbox"][aria-label="Message your agent"]');
// Clear the fixture's unimplemented-command error, then check keyboard focus return.
await page.click('button[aria-label="Dismiss notification"]');
await page.waitForSelector('.ui-tsc__toast:not([data-removing])', {state:"detached"});
await page.focus('[role="textbox"][aria-label="Message your agent"]');
await main(() => window.__harborFixture.notification("Keyboard dismissal check"));
await page.waitForSelector('.ui-tsc__toast:not([data-removing])');
await page.keyboard.press("F8");
assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('ui-tsc__toast')), true);
await page.keyboard.press("Escape");
await page.waitForSelector('.ui-tsc__toast:not([data-removing])', {state:"detached"});
assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), "textbox");
await page.click('#harbor-sidebar [data-sidebar="menu-button"]:has-text("New task")');
await page.waitForSelector('[role="textbox"][aria-label="Describe a new task"]');
await main(async () => {
  const saved=window.__harborFixture.snapshot();
  saved.data.sessions[0].status="working";
  await window.__harborFixture.restore(saved);
});
await main(async () => {
  const saved=window.__harborFixture.snapshot();
  saved.data.sessions[0].status="needs_input";
  await window.__harborFixture.restore(saved);
});
await page.waitForSelector('.ui-tsc__toast[data-type="info"]');
await page.click('loc=role:button[name="Open chat"]');
await page.waitForSelector('[role="textbox"][aria-label="Message your agent"]');
assert.equal(await page.evaluate(() => document.querySelectorAll('.ui-tsc__toast[data-type="info"]:not([data-removing])').length), 0);
if (await page.evaluate(() => !!document.querySelector('.ui-tsc__toast[data-type="error"]:not([data-removing])'))) {
  await page.click('button[aria-label="Dismiss notification"]');
}
// Exercise the original public promise API in the real app's default stack.
await main(async () => {
  const {toast}=await import('/src/components/ui/toaster.tsx');
  toast.promise(new Promise(resolve => {window.__resolveToast=resolve;}), {
    loading:"Exporting report",success:"Report exported",error:"Export failed"
  }, {id:"qa-export",duration:Infinity});
});
await page.waitForSelector('.ui-tsc__toast[data-type="loading"]');
await main(() => window.__resolveToast());
await page.waitForSelector('.ui-tsc__toast[data-toast-id="qa-export"][data-type="success"]');
await main(async () => {
  const {toast}=await import('/src/components/ui/toaster.tsx');
  toast.info("Agent needs your input",{description:"Review the implementation plan",duration:Infinity});
  toast.error("Could not sync",{description:"The agent connection was interrupted",duration:Infinity});
});
await page.waitForFunction(() => document.querySelectorAll('.ui-tsc__toast:not([data-removing])').length === 3);
await page.hover('.ui-tsc__toast[data-type="error"]');
await page.waitForSelector('.ui-tsc[data-expanded]');
await page.cdp("Emulation.setDeviceMetricsOverride",{width:1100,height:760,deviceScaleFactor:1,mobile:false});
await page.hover('.ui-tsc__toast[data-type="error"]');
await page.waitForFunction(() => !document.querySelector('.ui-tsc').getAnimations({subtree:true}).some(a => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity));
console.log(await page.screenshot({path:"/tmp/harbor-affect-toaster-dark.png"}));
await main(() => {document.documentElement.classList.remove("dark");document.documentElement.classList.add("light");});
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.ui-tsc__card')).backgroundColor), "rgb(255, 255, 255)");
await page.hover('.ui-tsc__toast[data-type="error"]');
await page.waitForFunction(() => !document.querySelector('.ui-tsc').getAnimations({subtree:true}).some(a => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity));
console.log(await page.screenshot({path:"/tmp/harbor-affect-toaster-light.png"}));
await page.cdp("Emulation.setDeviceMetricsOverride",{width:390,height:760,deviceScaleFactor:1,mobile:false});
assert.equal(await page.evaluate(() => {
  const r=document.querySelector('.ui-tsc').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;
}),true);
console.log("Passed: app error replacement/dismissal, F8/Escape and focus return, background attention with Open chat, promise morph, stacking/expansion, light/dark colors, and narrow gutters.");
if (!globalThis.HARBOR_QA_SPACE) await task.finish({keep:[]});
