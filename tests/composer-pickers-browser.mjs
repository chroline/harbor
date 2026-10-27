// Run with Vite: ego-browser nodejs < tests/composer-pickers-browser.mjs
const assert = (await import('node:assert/strict')).default;
const fs = await import('node:fs/promises');
const root = (await import('node:url')).fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const task = await taskSpace(globalThis.HARBOR_QA_SPACE ?? 'Harbor composer picker regression');
const p = task.page('p1');
const evidence = `${root}/screenshots/ui-craft`;
const axe = await fs.readFile(`${root}/node_modules/axe-core/axe.min.js`, 'utf8');
const checks = [];
await p.goto('http://localhost:1420/tests/ui.html?showcase');
await p.cdp('Emulation.setDeviceMetricsOverride',{width:900,height:620,deviceScaleFactor:1,mobile:false});
await p.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
await p.waitForSelector('button[aria-label="Choose model and reasoning"]',{state:'visible'});
if (await p.evaluate(()=>document.querySelector('.home-page').getBoundingClientRect().width>800)) await p.click('button[aria-label="Toggle Sidebar"]');
const shot = async name => { await p.evaluate(()=>document.fonts.ready.then(()=>true)); await p.screenshot({path:`${evidence}/final-pickers-${name}.png`}); };
const stable = async () => p.waitForFunction(()=>{
  const e=document.querySelector('.composer-picker-menu');
  if (!e) return false;
  const r=e.getBoundingClientRect();
  return r.top>=0 && r.bottom<=innerHeight && getComputedStyle(e.closest('[role="menu"],[role="dialog"]')).opacity==='1';
});
const inspect = async name => {
  await stable();
  const metrics=await p.evaluate(()=>{const e=document.querySelector('.composer-picker-menu'),s=getComputedStyle(e),r=e.getBoundingClientRect();return {width:r.width,bg:s.backgroundColor,shadow:s.boxShadow,radius:s.borderRadius,overflow:e.scrollWidth>e.clientWidth};});
  assert.equal(metrics.width,320,name);
  assert.equal(metrics.overflow,false,name);
  await p.evaluate(axe);
  const violations=await p.evaluate(async()=>{
    const panel=document.querySelector('.composer-picker-menu').closest('[role="menu"],[role="dialog"]');
    return (await axe.run(panel,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,details:v.nodes.map(n=>n.failureSummary)}));
  });
  // Existing searchable Dropdown semantics: searchbox is inside role=menu.
  // Record this known issue; fail on every other violation in these surfaces.
  const existingSearchIssue = name.endsWith('-workspace') && violations.length===1
    && violations[0].id==='aria-required-children'
    && violations[0].details.every(detail=>detail.includes('[role=searchbox]'));
  assert.deepEqual(existingSearchIssue ? [] : violations,[],name);
  checks.push({name,metrics,violations});
  await shot(name);
  return metrics;
};
const close = async () => {await p.keyboard.press('Escape');await p.waitForSelector('.composer-picker-menu',{state:'hidden'});};
for (const theme of ['dark','light']) {
  await p.click('#harbor-sidebar button:has-text("Settings")');
  await p.click(`[role="radio"][aria-label="${theme==='light'?'Light':'Dark'}"]`);
  await p.click('#harbor-sidebar [data-sidebar="menu-button"]:has-text("New task")');
  await p.click('button[aria-label="Workspace for new task"]');
  await p.click('[role="menuitemradio"]:has-text("harbor")');
  await p.waitForSelector('button[aria-label="Working directory"]',{state:'visible'});
  let baseline;
  for(const [name,trigger] of [
    ['model','button[aria-label="Choose model and reasoning"]'],
    ['effort','button[aria-label^="Effort:"]'],
    ['mode','button[aria-label^="Mode:"]'],
    ['workspace','button[aria-label="Workspace for new task"]'],
    ['worktree','button[aria-label="Working directory"]'],
  ]) {
    await p.click(trigger);
    const metrics=await inspect(`${theme}-${name}`);
    baseline ??= metrics;
    assert.deepEqual(metrics,baseline,`${theme} ${name} shares the composer menu surface`);
    if (name==='model') {
      await p.click('button[aria-label="Choose model"]');
      await p.waitForFunction(()=>getComputedStyle(document.querySelector('.model-menu-view[data-active="true"]')).opacity==='1');
      await inspect(`${theme}-model-list`);
      await p.fill('input[placeholder="Search models"]','no-such-model');
      await p.waitForSelector('text="No matching models"',{state:'visible'});
      await shot(`${theme}-model-empty`);
      await p.fill('input[placeholder="Search models"]','');
      await p.click('button[aria-label="Choose agent"]');
      await p.waitForFunction(()=>getComputedStyle(document.querySelector('.model-menu-view[data-active="true"]')).opacity==='1');
      await inspect(`${theme}-agents`);
      await p.keyboard.press('Escape');
      await p.keyboard.press('Escape');
    }
    if(name==='worktree') {
      await p.click('[role="menuitemradio"]:has-text("New worktree")');
      await p.waitForSelector('input[name="worktree-branch"]',{state:'visible'});
      await p.fill('input[name="worktree-branch"]','cole/consistent-composer-pickers');
      await inspect(`${theme}-worktree-branch`);
      await p.keyboard.press('Escape');
    }
    await close();
  }
}
// Keyboard-only effort selection and focus restoration after the menu closes.
await p.click('button[aria-label^="Effort:"]');
await stable();
await p.keyboard.press('Home');
await p.keyboard.press('Enter');
await p.waitForSelector('.composer-picker-menu',{state:'hidden'});
await p.waitForFunction(()=>document.activeElement.getAttribute('aria-label')?.startsWith('Effort:'));
assert.match(await p.evaluate(()=>document.activeElement.getAttribute('aria-label')),/medium/i);
await p.click('button[aria-label^="Mode:"]');
await p.click('[role="menuitemradio"]:has-text("Plan")');
await p.waitForSelector('button[aria-label="Mode: Plan"]',{state:'visible'});
// Expanded viewport keeps the same picker dimensions and clear composer controls.
await p.cdp('Emulation.setDeviceMetricsOverride',{width:1380,height:900,deviceScaleFactor:1,mobile:false});
await p.click('button[aria-label="Choose model and reasoning"]');
await inspect('light-wide-model');
await close();
await fs.writeFile(`${evidence}/picker-checks.json`,JSON.stringify(checks,null,2));
console.log(`Composer picker checks passed: ${checks.length} visual/accessibility states plus keyboard selection.`);
if(globalThis.HARBOR_QA_SPACE===undefined) await task.finish({keep:[]});
