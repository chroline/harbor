// Run with Vite: ego-browser nodejs < tests/ui-polish-browser.mjs
// Set globalThis.HARBOR_QA_SPACE to reuse an existing inspection space.
const assert = (await import('node:assert/strict')).default;
const fs = await import('node:fs/promises');
const task = await taskSpace(globalThis.HARBOR_QA_SPACE ?? 'Harbor UI craft regression');
const page = task.page('p1');
const root = globalThis.HARBOR_QA_ROOT ?? (await import('node:url')).fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const evidence = `${root}/screenshots/ui-craft`;
const checks = [];
const size = async (width, height) => {
  await page.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await page.waitForFunction(({width,height}) => innerWidth===width && innerHeight===height, {width,height});
};
const shot = async (name) => {
  await page.evaluate(()=>document.fonts.ready.then(()=>true));
  await page.screenshot({path:`${evidence}/${name}.png`});
};
const noOverflow = async () => assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
const axeSource = await fs.readFile(`${root}/node_modules/axe-core/axe.min.js`,'utf8');
const accessibility = async (name, selector='#root') => {
  await page.evaluate(axeSource);
  const violations=await page.evaluate(async(selector)=>{
    const result=await axe.run(document.querySelector(selector),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});
    return result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
  },selector);
  checks.push({name,violations});
  assert.deepEqual(violations,[],name);
};
await page.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
await page.goto('http://localhost:1420/tests/ui.html?showcase');
await page.waitForSelector('#harbor-sidebar',{state:'visible'});
for(const theme of ['light','dark']) {
  await page.click('#harbor-sidebar button:has-text("Settings")');
  await page.click(`[role="radio"][aria-label="${theme==='light'?'Light':'Dark'}"]`);
  await page.waitForFunction(theme=>document.documentElement.classList.contains(theme),theme);
  for(const [width,height] of [[1380,900],[1100,720],[900,620]]) {
    await size(width,height);
    await page.click('#harbor-sidebar [data-sidebar="menu-button"]:has-text("New task")');
    await page.waitForFunction(()=>document.querySelector('.home-landscape img')?.complete && getComputedStyle(document.querySelector('.home-page')).opacity==='1');
    await page.fill('[role="textbox"][aria-label="Describe a new task"]','Verify the composer remains reachable');
    await page.waitForFunction(()=>!document.querySelector('.task-composer-action').disabled);
    assert.equal(await page.evaluate(()=>{const b=document.querySelector('.task-composer-action'),r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
    await page.fill('[role="textbox"][aria-label="Describe a new task"]','');
    assert.equal(await page.evaluate(()=>document.querySelector('.task-composer-action').disabled),true);
    await noOverflow();
    await shot(`final-home-${theme}-${width}`);
    await page.click('#harbor-sidebar button:has-text("Settings")');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.settings-page')).opacity==='1');
    assert.equal(await page.evaluate(()=>new Set([...document.querySelectorAll('.theme-choices > [role="radio"]')].map(e=>Math.round(e.getBoundingClientRect().y))).size),1);
    await noOverflow();
    await shot(`final-settings-${theme}-${width}`);
  }
  await accessibility(`settings-${theme}`);
}
await page.click('input[placeholder="Select agent"]');
await page.click('loc=role:option[name="Grok Build"]');
assert.equal(await page.evaluate(()=>document.body.innerText.includes('Custom agent')),false);
await page.fill('input[aria-label="Executable"]','/Applications/Grok/bin/grok');
await page.click('button:has-text("Advanced")');
await page.fill('textarea[aria-label="Arguments"]','--transport\nstdio');
await page.evaluate(()=>{window.__harborFixture.pauseNext('save_provider');window.__harborFixture.failNext('save_provider','Could not save the agent configuration. Your changes are still here; try saving again.');});
await page.click('text="Save changes"');
await page.waitForSelector('.provider-editor[aria-busy="true"]',{state:'visible'});
await page.evaluate(()=>document.querySelector('.provider-editor').scrollIntoView({block:'start'}));
await shot('final-provider-pending');
await page.evaluate(()=>window.__harborFixture.resume('save_provider'));
await page.waitForSelector('.provider-editor [role="alert"]',{state:'visible'});
await shot('final-provider-error');
await accessibility('provider-error');
await page.click('text="Save and check"');
await page.waitForSelector('.probe-result',{state:'visible'});
await page.evaluate(()=>document.querySelector('.probe-result').scrollIntoView({block:'center'}));
await shot('final-provider-check');
await accessibility('provider-check');
await page.click('.provider-editor-cancel');
await page.waitForSelector('.provider-editor',{state:'hidden'});
await page.click('#harbor-sidebar [data-sidebar="menu-button"]:has-text("New task")');
await page.fill('[role="textbox"][aria-label="Describe a new task"]','Audit retry handling and explain interrupted requests');
await page.click('button[aria-label="Start task"]');
await page.waitForFunction(()=>document.body.innerText.includes('Ready for review.'));
await page.fill('[role="textbox"][aria-label="Message your agent"]','Check duplicate submissions');
await page.click('button[aria-label="Send message"]');
await page.waitForFunction(()=>document.querySelectorAll('.transcript-turn').length===2 && !document.querySelector('button[aria-label="Stop response"]'));
await shot('final-chat-dark-compact');
await accessibility('chat-dark');
await page.click('button[aria-label="Choose model and reasoning"]');
await page.click('button[aria-label="Choose model"]');
await page.waitForFunction(()=>{
  const list=document.querySelector('.model-menu-list');
  const bounds=list?.getBoundingClientRect();
  return bounds && bounds.top>0 && bounds.bottom<innerHeight && getComputedStyle(list.closest('.model-menu-view')).opacity==='1';
});
await shot('final-model-menu');
await page.click('.model-menu-list button:has-text("GPT-6 Astra")');
await page.keyboard.press('Escape');
await page.waitForFunction(()=>document.querySelector('button[aria-label="Choose model and reasoning"]').textContent.includes('GPT-6 Astra'));
await page.click('button[aria-label^="Mode:"]');
await page.waitForFunction(()=>{const menu=document.querySelector('[role="menu"]');return menu && getComputedStyle(menu).opacity==='1' && menu.getBoundingClientRect().bottom<innerHeight;});
await shot('final-mode-menu');
await page.click('[role="menuitemradio"]:has-text("Plan")');
await page.waitForSelector('button[aria-label="Mode: Plan"]',{state:'visible'});
await page.click('#harbor-sidebar button:has-text("Search")');
await page.fill('input[placeholder="Search workspaces and conversations…"]','Audit retry');
await page.waitForFunction(()=>document.querySelector('[data-slot="command-menu"]').getBoundingClientRect().height<160);
await shot('final-search-results');
await page.fill('input[placeholder="Search workspaces and conversations…"]','zz-no-results');
await page.waitForSelector('text=No matching workspaces or conversations.',{state:'visible'});
await shot('final-search-empty');
await accessibility('search-empty','[role="dialog"]');
await page.keyboard.press('Escape');
await page.waitForSelector('[role="dialog"]',{state:'hidden'});
await page.waitForFunction(()=>document.activeElement.textContent.includes('Search'));
await page.click('button[aria-label="Create project"]');
await page.waitForSelector('[role="dialog"] input',{state:'visible'});
assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('placeholder')),'New Project');
for(let i=0;i<9;i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(()=>!!document.activeElement.closest('[role="dialog"]')),true); }
await shot('final-project-dark-compact');
await accessibility('project-dialog','[role="dialog"]');
await page.keyboard.press('Escape');
await page.waitForSelector('[role="dialog"]',{state:'hidden'});
await page.waitForFunction(()=>document.activeElement.getAttribute('aria-label')==='Create project');
await noOverflow();
await fs.writeFile(`${evidence}/browser-checks.json`,JSON.stringify({viewports:[[1380,900],[1100,720],[900,620]],checks,passed:['composer pointer reachability','disabled empty composer','horizontal theme choices','provider pending failure retry','create and follow-up clicks','model menu visibility and selection','mode selection','search no-results and focus return','project focus entry containment and return','page overflow']},null,2));
console.log('UI craft browser regression passed', {spaceId:task.spaceId,checks:checks.length});
if(globalThis.HARBOR_QA_SPACE===undefined) await task.finish({keep:[]});
