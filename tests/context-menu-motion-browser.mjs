// Run against Vite with ego-browser nodejs < tests/context-menu-motion-browser.mjs.
const assert = (await import('node:assert/strict')).default;
const task = await taskSpace(globalThis.HARBOR_QA_SPACE ?? 'Sidebar cursor-origin motion');
console.log({spaceId:task.spaceId});
const page = task.page('p1');
await page.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
await page.goto('http://127.0.0.1:1420/tests/ui.html');
const row='loc=css:button[aria-label="UI test repository"]';
const popup='loc=css:[data-slot="context-menu-content"]';
await page.waitForSelector(row);
await page.evaluate(()=>{
 window.__menuSamples=[];
 document.addEventListener('contextmenu',e=>{window.__menuCursor={x:e.clientX,y:e.clientY}},true);
 const sample=()=>{
  const p=document.querySelector('[data-slot="context-menu-content"]');if(!p)return;
  const c=getComputedStyle(p),m=new DOMMatrixReadOnly(c.transform),r=p.parentElement.getBoundingClientRect();
  const origin=c.transformOrigin.split(' ').map(parseFloat);
  window.__menuSamples.push({name:c.animationName,duration:c.animationDuration,running:p.getAnimations().some(a=>a.playState==='running'),opacity:Number(c.opacity),scaleX:m.a,scaleY:m.d,origin:{x:r.x+origin[0],y:r.y+origin[1]},cursor:window.__menuCursor,closing:p.hasAttribute('data-closed')});
 };
 window.__menuObserver=new MutationObserver(sample);
 window.__menuObserver.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style','data-open','data-closed']});
 const frame=()=>{sample();window.__menuFrame=requestAnimationFrame(frame)};
 window.__menuFrame=requestAnimationFrame(frame);
});
await page.click(row,{button:'right'});
await page.waitForFunction(()=>{
 const p=document.querySelector('[data-slot="context-menu-content"]');
 return p&&getComputedStyle(p).opacity==='1'&&getComputedStyle(p).transform==='none';
});
await page.keyboard.press('Escape');await page.waitForSelector(popup,{state:'detached'});
const samples=await page.evaluate(()=>{cancelAnimationFrame(window.__menuFrame);window.__menuObserver.disconnect();return window.__menuSamples});
assert.ok(samples.some(s=>s.name==='enter'&&s.scaleX<1&&s.scaleY<1),'entry must grow in both dimensions');
assert.ok(samples.some(s=>s.name==='exit'&&s.closing&&s.running&&s.duration==='0.1s'),'exit remains mounted with the upstream 100ms animation running');
const anchored=samples.find(s=>s.cursor&&s.name==='enter'&&s.opacity>0);
assert.ok(anchored,'pointer anchor captured');
assert.ok(Math.abs(anchored.origin.x-anchored.cursor.x)<1,'horizontal growth origin follows cursor');
assert.ok(Math.abs(anchored.origin.y-anchored.cursor.y-4)<1,'vertical growth origin follows cursor with upstream 4px align offset');
console.log({cursor:anchored.cursor,origin:anchored.origin,entryScales:samples.filter(s=>s.name==='enter'&&s.scaleX<1).map(s=>[s.scaleX,s.scaleY])});
await page.click(row,{button:'right'});
await page.click('loc=role:menuitem[name*="Edit project"]');
await page.waitForSelector('loc=role:dialog[name="Edit project"]');
assert.equal(await page.evaluate(()=>!!document.activeElement.closest('[role="dialog"]')),true);
await page.keyboard.press('Escape');await page.waitForSelector('loc=role:dialog[name="Edit project"]',{state:'detached'});
await page.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
await page.reload();await page.waitForSelector(row);await page.click(row,{button:'right'});await page.waitForSelector(popup);
assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('[data-slot="context-menu-content"]')).animationName),'none');
await page.keyboard.press('Escape');await page.waitForSelector(popup,{state:'detached'});
console.log('Passed: cursor-origin growth on both axes, retained exit, menu-to-dialog focus, and reduced motion.');
if(!globalThis.HARBOR_QA_SPACE)await task.finish({keep:[]});
