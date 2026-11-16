// Run with Vite: ego-browser nodejs < tests/project-orchestrators-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(globalThis.HARBOR_QA_SPACE ?? "Harbor project startup");
const page = task.page("p1");
const origin = globalThis.HARBOR_QA_URL ?? "http://127.0.0.1:1420";
await page.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await page.goto(`${origin}/tests/ui.html`);
await page.waitForSelector('loc=css:[aria-label="Projects"] button:has-text("UI test repository")');
await page.click('loc=css:[aria-label="Projects"] button:has-text("UI test repository")');
await page.waitForSelector('text="I\'m ready to help with UI test repository. What would you like to work on?"');
await page.waitForFunction(() => !document.querySelector(".mode-picker-trigger"));
const initial = await page.evaluate(() => window.__harborFixture.snapshot());
assert.equal(initial.calls.filter(c => c.command === "start_project").length,1);
assert.equal(initial.calls.filter(c => c.command === "send_prompt").length,0);
assert.equal(initial.events.filter(e => e.kind === "project_start").length,1);
assert.equal(initial.events.filter(e => e.kind === "user_message").length,0);
assert.equal(initial.data.sessions[0].isOrchestrator,true);
const original = initial.data.projects[0].activeOrchestratorSessionId;
assert.equal(await page.evaluate(() => [...document.querySelectorAll('[aria-label="Workspaces"] button')].some(b => b.textContent.includes("UI test repository"))),false);
await page.evaluate(() => window.__harborFixture.addProjectWorker("Billing investigator"));
await page.waitForSelector('loc=css:[aria-label="Projects"] button:has-text("Billing investigator")');
assert.equal(await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].some(b => b.textContent.includes("Billing investigator"))),false);
await page.click('loc=css:[aria-label="Projects"] button:has-text("Billing investigator")');
await page.waitForSelector('text="Saved project worker findings"');
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("harbor.last-view")).session),"sidebar-worker");

await page.click('loc=css:[aria-label="Projects"] button:has-text("UI test repository")');
assert.equal(await page.evaluate(() => window.__harborFixture.snapshot().calls.filter(c=>c.command === "start_project").length),1);
await page.click('loc=role:button[name="Context"]');
await page.click('loc=role:button[name="decisions.md"]');
await page.waitForSelector('text="Billing belongs to organizations. Source: user discussion."');
await page.click('loc=role:button[name="Open context document in editor"]');
assert.equal(await page.evaluate(() => window.__harborFixture.snapshot().calls.at(-1).command),"open_project_document");
for (const width of [1380,900]) {
  await page.cdp("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:false});
  for (const theme of ["dark","light"]) {
    await page.evaluate(theme => {document.documentElement.classList.remove("light","dark");document.documentElement.classList.add(theme);},theme);
    await page.screenshot({path:`/tmp/harbor-project-start-${width}-${theme}.png`});
  }
}
await page.click('loc=role:button[name="Close project context"]');
await page.press('loc=css:[aria-label="Projects"] button:has-text("UI test repository")',"Shift+F10");
await page.click('loc=role:menuitem[name="Start fresh conversation"]');
await page.waitForFunction(() => window.__harborFixture.snapshot().data.sessions.length === 3);
await page.waitForSelector('text="I\'m ready to help with UI test repository. What would you like to work on?"');
const fresh = await page.evaluate(() => window.__harborFixture.snapshot());
assert.notEqual(fresh.data.projects[0].activeOrchestratorSessionId,original);
assert.equal(fresh.data.sessions.find(s=>s.id === original).archived,false);
await page.click('loc=role:button[name="Create project"]');
await page.fill('loc=role:textbox[name="Project name"]',"Release");
await page.fill('loc=role:textbox[name="Project instructions"]',"Oversee release planning and remember our decisions.");
await page.click('loc=role:button[name="Choose workspace"]');
await page.click('loc=role:menuitemradio[name*="repository"]');
await page.click('loc=css:[role="dialog"] button[type="submit"]');
await page.waitForSelector('text="I\'m ready to help with Release. What would you like to work on?"');
assert.equal(await page.evaluate(() => window.__harborFixture.snapshot().data.projects.find(p=>p.name === "Release").instructions),"Oversee release planning and remember our decisions.");
await page.goto(`${origin}/tests/ui.html?unverified-project`);
await page.click('loc=css:[aria-label="Projects"] button:has-text("UI test repository")');
await page.waitForSelector('text="Error: Fixture provider support is unverified"');
assert.equal(await page.evaluate(() => window.__harborFixture.snapshot().data.sessions.length),0);
console.log("Project startup browser acceptance passed: instructions, immediate greeting, no synthetic user message, reopen without restart, fresh conversation, context, and provider error.");
await task.finish({keep:[]});
