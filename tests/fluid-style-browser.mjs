// Compare Fluid styling while keeping nested rows the same height as their parents.
// Run with Vite: ego-browser nodejs < tests/fluid-style-browser.mjs
const assert = (await import('node:assert/strict')).default;
const task = await taskSpace(globalThis.HARBOR_QA_SPACE ?? 'Fluid sidebar style parity');
const app = task.page('p1');
const source = globalThis.HARBOR_QA_SPACE ? task.page('p2') : await task.newPage();
await app.cdp('Emulation.setDeviceMetricsOverride', {width: 1380, height: 900, deviceScaleFactor: 1, mobile: false});
await app.goto('http://127.0.0.1:1420/tests/ui.html');
await app.waitForSelector('loc=css:#harbor-sidebar [data-sidebar="menu-sub-button"] >> nth=0');
await source.goto('https://www.fluidfunctionalism.com/docs/sidebar?preset=sa1FQfCxG4');
await source.waitForFunction(() => [...document.querySelectorAll('h2')].some(e => e.textContent === 'Nesting'));
const measure = (upstream) => {
  const scope = upstream
    ? [...document.querySelectorAll('h2')].find(e => e.textContent === 'Nesting').parentElement
    : document.querySelector('#harbor-sidebar');
  const row = scope.querySelector('[data-sidebar="group"] [data-sidebar="menu-button"]');
  const sub = scope.querySelector('[data-sidebar="menu-sub-button"]');
  const label = scope.querySelector('[data-sidebar="group-label"]');
  const rowStyle = el => {
    const c = getComputedStyle(el), text = getComputedStyle(el.querySelector('span'));
    return {height:el.getBoundingClientRect().height,paddingLeft:c.paddingLeft,paddingRight:c.paddingRight,radius:c.borderRadius,gap:c.gap,font:text.fontSize,lineHeight:text.lineHeight,fontFamily:text.fontFamily};
  };
  const c = getComputedStyle(label);
  return {parent:rowStyle(row),nested:rowStyle(sub),section:{font:c.fontSize,lineHeight:c.lineHeight}};
};
const upstream = await source.evaluate(measure, true);
const local = await app.evaluate(measure, false);
assert.equal(local.nested.height, local.parent.height);
assert.deepEqual(
  {...local, nested: {...local.nested, height: upstream.nested.height}},
  upstream,
);
console.log({upstream,harbor:local});
for (const theme of ['light','dark']) {
  for (const page of [app,source]) await page.evaluate(theme => {
    document.documentElement.classList.remove('light','dark');
    document.documentElement.classList.add(theme);
  },theme);
  const tokens = () => {
    const probe=document.createElement('div');document.body.append(probe);
    const resolved={};
    for (const token of ['foreground','muted-foreground','border','hover','active','destructive',...Array.from({length:8},(_,i)=>`surface-${i+1}`)]) {
      probe.style.color=`var(--${token})`;resolved[token]=getComputedStyle(probe).color;
    }
    probe.remove();return resolved;
  };
  assert.deepEqual(await app.evaluate(tokens),await source.evaluate(tokens));
  console.log(`Matched ${theme} semantic colors and all eight Fluid surfaces.`);
  console.log(await app.screenshot({path:`/tmp/harbor-fluid-style-${theme}.png`}));
}
console.log('Passed: sidebar proportions, typography, font family, and light/dark theme parity.');
if (!globalThis.HARBOR_QA_SPACE) await task.finish({keep:[]});
