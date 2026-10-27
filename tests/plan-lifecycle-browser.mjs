// Run in the existing task space with a launched fixture chat.
const assert=(await import('node:assert/strict')).default;
const task=await taskSpace(globalThis.HARBOR_QA_SPACE),p=task.page('p1');
const root=(await import('node:url')).fileURLToPath(new URL('..',import.meta.url));
const pending='[data-slot="plan-card"][data-state="pending"]';
const resolved='[data-slot="plan-card"][data-state="resolved"]';
await p.cdp('Emulation.setDeviceMetricsOverride',{width:1380,height:900,deviceScaleFactor:1,mobile:false});
const before=await p.evaluate(()=>document.querySelectorAll('[data-slot="plan-card"]').length);
for(const [index,provider] of ['codex','claude','grok'].entries()) {
  await p.evaluate(provider=>window.__harborFixture.showPlan(provider),provider);
  await p.waitForSelector(pending,{state:'visible'});
  const planId=await p.evaluate(()=>document.querySelector('[data-state="pending"][data-slot="plan-card"]').closest('[data-row-id]')?.getAttribute('data-row-id'));
  await p.click(`${pending} button:has-text("Implement plan")`);
  await p.waitForSelector(pending,{state:'hidden'});
  await p.waitForFunction(expected=>document.querySelectorAll('[data-slot="plan-card"][data-state="resolved"]').length===expected,before+index+1);
  assert.equal(await p.evaluate(()=>document.querySelectorAll('.transcript-assistant .markdown h1').length),0);
  const card=`${resolved} >> nth=${before+index}`;
  await p.hover(card);
  await p.screenshot({path:`${root}/screenshots/ui-craft/final-plan-approved-${provider}.png`});
  await p.click(`${resolved} [aria-label="Review plan"] >> nth=${before+index}`);
  await p.waitForSelector('[data-slot="sheet-content"]',{state:'visible'});
  assert.equal(await p.evaluate(()=>!!document.querySelector('.plan-review-body h1')),true);
  assert.equal(await p.evaluate(()=>[...document.querySelectorAll('[data-slot="sheet-content"] button')].some(b=>b.textContent==='Implement plan'||b.textContent==='Keep planning')),false);
  await p.keyboard.press('Escape');
  await p.waitForSelector('[data-slot="sheet-content"]',{state:'hidden'});
  await p.evaluate(()=>window.__harborFixture.chunk('Implementation continues after approval.'));
  await p.waitForFunction(()=>document.querySelector('[role="log"]')?.textContent.includes('Implementation continues after approval.'));
  assert.equal(await p.evaluate(()=>document.querySelectorAll('[data-slot="plan-card"]').length),before+index+1);
  assert.equal(await p.evaluate(()=>document.querySelectorAll('.transcript-assistant .markdown h1').length),0);
}
// A fresh frontend/store reads the same durable event log from get_events.
const saved=await p.evaluate(()=>window.__harborFixture.snapshot());
await p.reload();
await p.waitForSelector('[aria-label="Describe a new task"]',{state:'visible'});
await p.evaluate(saved=>window.__harborFixture.restore(saved),saved);
await p.click('#harbor-sidebar button:has-text("Plan lifecycle verification")');
await p.waitForFunction(expected=>document.querySelectorAll('[data-slot="plan-card"][data-state="resolved"]').length===expected,before+3);
assert.equal(await p.evaluate(()=>document.querySelectorAll('[data-slot="plan-card"][data-state="pending"]').length),0);
assert.equal(await p.evaluate(()=>document.querySelectorAll('.transcript-assistant .markdown h1').length),0);
assert.equal(await p.evaluate(()=>[...document.querySelectorAll('.harbor-plan-card-status')].every(e=>e.textContent==='Approved for implementation')),true);
await p.hover(`${resolved} >> nth=${before+2}`);
await p.screenshot({path:`${root}/screenshots/ui-craft/final-plan-approved-replayed.png`});
console.log('PASS: approved cards persist for Claude/Codex/Grok, no raw-plan fallback, execution text remains separate, history sheets are read-only, fresh store replay retains cards and outcomes.');
