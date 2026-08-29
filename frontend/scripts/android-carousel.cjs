// Verify the real native horizontal carousel using observed Android bounds.
process.chdir(require('node:path').resolve(__dirname, '..'));
const fs = require('node:fs');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const run = promisify(execFile);
const adb = async args => (await run('adb', args, {encoding: 'utf8', maxBuffer: 5e6})).stdout;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function observe() {
  await adb(['shell', 'uiautomator', 'dump', '/sdcard/salford-carousel.xml']);
  const xml = await adb(['exec-out', 'cat', '/sdcard/salford-carousel.xml']);
  return [...xml.matchAll(/<node\b[^>]+/g)].map(match => Object.fromEntries(
    [...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(attribute => [attribute[1], attribute[2]])
  ));
}
const bounds = node => {
  if (!node) throw Error('Expected carousel or course is not visible');
  return node.bounds.match(/-?\d+/g).map(Number);
};
async function home() {
  await adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'salford://preview/1066', 'com.cscapp']);
  await delay(2500);
}
(async () => {
  await home();
  let nodes = await observe();
  const carousel = bounds(nodes.find(node => node['resource-id'] === 'carousel-1:1138'));
  const before = bounds(nodes.find(node => node['resource-id'] === 'node-1:1142'));
  const [x1, y1, x2, y2] = carousel;
  const y = Math.round((y1 + y2) / 2);
  await adb(['shell', 'input', 'swipe', String(x2 - 50), String(y), String(x1 + 50), String(y), '500']);
  await delay(800);
  nodes = await observe();
  const after = bounds(nodes.find(node => node['resource-id'] === 'node-1:1142'));
  if (after[0] >= before[0] - 20) throw Error('Second course did not move left after the swipe');
  const result = {name: 'Native Home carousel horizontal swipe', passed: true, before, after};
  fs.writeFileSync('artifacts/carousel-check.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  await adb(['shell', 'input', 'swipe', String(x1 + 50), String(y), String(x2 - 50), String(y), '500']);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
