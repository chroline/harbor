// Run with Vite: ego-browser nodejs < tests/unified-command-picker-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(globalThis.HARBOR_QA_SPACE ?? "Harbor unified command picker");
const page = task.page("p1");
const home = 'loc=role:textbox[name="Describe a new task"]';
const chat = 'loc=role:textbox[name="Message your agent"]';
const draft = () => page.evaluate(() => document.querySelector(".command-editor").textContent);
async function checkKeyboardNavigation(input) {
  await page.fill(input, "/");
  await page.waitForSelector('[role="option"][aria-selected="true"]');
  const names = await page.evaluate(() => [...document.querySelectorAll('[role="option"]')].map(row => row.getAttribute("aria-label")));
  for (const [key, index] of [["ArrowDown", 1], ["ArrowUp", 0], ["ArrowUp", names.length - 1], ["ArrowDown", 0]]) {
    await page.keyboard.press(key);
    const state = await page.evaluate(() => {
      const input = document.querySelector(".command-editor"), selected = document.querySelector('[role="option"][aria-selected="true"]');
      return {selected:selected?.getAttribute("aria-label"), active:input.getAttribute("aria-activedescendant"), id:selected?.id, focused:document.activeElement===input, text:input.textContent,
        autocorrect:input.getAttribute("autocorrect"), capitalize:input.closest("[autocapitalize]")?.getAttribute("autocapitalize"), spelling:input.getAttribute("spellcheck")};
    });
    assert.equal(state.selected, names[index]);
    assert.equal(state.active, state.id);
    assert.equal(state.focused, true);
    assert.equal(state.text, "/");
    assert.equal(state.autocorrect, "off");
    assert.equal(state.capitalize, "off");
    assert.equal(state.spelling, "false");
  }
  await page.keyboard.press("Tab");
  assert.ok((await draft()).endsWith(" "));
  assert.equal(await page.evaluate(() => document.querySelector('[role="listbox"]')), null);
}
await page.cdp("Emulation.setEmulatedMedia", {features:[{name:"prefers-reduced-motion",value:"reduce"}]});
await page.goto("http://127.0.0.1:1420/tests/ui.html?empty&picker");
await page.waitForSelector(home);
await checkKeyboardNavigation(home);
for (const width of [1380, 900]) {
  await page.cdp("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:false});
  for (const theme of ["light","dark"]) {
    await page.evaluate(theme=>{document.documentElement.classList.remove("light","dark");document.documentElement.classList.add(theme);},theme);
    await page.fill(home,"/");
    await page.waitForSelector('loc=role:option[name="Status /status"]');
    const slash=await page.evaluate(()=>[...document.querySelectorAll('[data-slot="command-menu-item"]')].map(row=>row.getAttribute("aria-label")));
    await page.fill(home,"$");
    const dollar=await page.evaluate(()=>[...document.querySelectorAll('[data-slot="command-menu-item"]')].map(row=>row.getAttribute("aria-label")));
    assert.deepEqual(dollar,slash);
    assert.equal(slash.length,12);
    const sizes=await page.evaluate(()=>{
      const menu=document.querySelector(".command-menu"),row=menu.querySelector('[data-slot="command-menu-item"]');
      return {radius:getComputedStyle(menu).borderRadius,width:menu.getBoundingClientRect().width,height:menu.getBoundingClientRect().height,rowRadius:getComputedStyle(row).borderRadius,rowHeight:row.getBoundingClientRect().height,font:getComputedStyle(row).fontSize};
    });
    assert.equal(sizes.radius,"12px"); assert.equal(sizes.rowRadius,"8px"); assert.equal(sizes.rowHeight,28); assert.equal(sizes.font,"12px");
    assert.ok(sizes.width<=448 && sizes.height<=257);
    console.log({width,theme,...sizes});
  }
}
await page.fill(home,"/ai-e");
await page.waitForSelector('loc=role:option[name="Ai Elements $ai-elements"]');
await page.keyboard.press("Tab");
assert.equal(await draft(),"$ai-elements ");
await page.fill(home,"$stat");
await page.keyboard.press("Enter");
assert.equal(await draft(),"/status ");
await page.fill(home,"$status use /ai-elements");
assert.equal(await page.evaluate(()=>document.querySelectorAll('.command-editor .command-reference').length),2);
await page.click('loc=role:button[name="Start task"]');
await page.waitForSelector(chat);
await checkKeyboardNavigation(chat);
await page.waitForFunction(()=>document.querySelectorAll('.transcript-user .command-reference').length===2);
assert.equal(await page.evaluate(()=>window.__harborFixture.snapshot().calls.find(c=>c.command==="send_prompt").args.text),"/status use $ai-elements");
await page.fill(chat,"/ai-elements");
await page.keyboard.press("ControlOrMeta+Enter");
await page.waitForFunction(()=>window.__harborFixture.snapshot().calls.filter(c=>c.command==="send_prompt").length===2);
assert.equal(await page.evaluate(()=>window.__harborFixture.snapshot().calls.filter(c=>c.command==="send_prompt").at(-1).args.text),"$ai-elements");
await page.goto("http://127.0.0.1:1420/tests/ui.html?launch=1&picker");
await page.waitForSelector('loc=role:textbox[name="Task"]');
await checkKeyboardNavigation('loc=role:textbox[name="Task"]');
await page.fill('loc=role:textbox[name="Task"]',"$status");
await page.click('loc=role:button[name="Connect"]');
await page.waitForSelector('loc=role:button[name="Start task"]');
await page.waitForSelector('.command-editor .command-reference');
await page.click('loc=role:button[name="Start task"]');
await page.waitForFunction(()=>window.__harborFixture.snapshot().calls.some(c=>c.command==="send_prompt"));
assert.equal(await page.evaluate(()=>window.__harborFixture.snapshot().calls.find(c=>c.command==="send_prompt").args.text),"/status");
console.log("Passed: both prefixes share the catalog, aliases highlight and execute natively in all inputs, and the menu uses compact Fluid rows and surfaces in both themes.");
