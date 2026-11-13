// Regenerates the README visuals in docs/images/ from the dev page (fake API, no real Vinted
// data): mobile + desktop screenshots and an animated demo (GIF, needs ffmpeg).
//   npm run screenshots
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const OUT = 'docs/images';
const URL = 'http://localhost:8642/';
mkdirSync(OUT, { recursive: true });

const server = spawn('node', ['scripts/build.mjs', '--dev'], { stdio: 'ignore' });
const cleanup = () => server.kill();
process.on('exit', cleanup);

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(URL + 'vbs.js')).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('dev server did not start');
}

/** Types slowly so the demo is readable. */
const type = (locator, text) => locator.pressSequentially(text, { delay: 70 });

async function fillExample(page, { slow }) {
  const pause = (ms) => (slow ? page.waitForTimeout(ms) : Promise.resolve());
  await page.locator('.fab').click();
  await pause(600);
  const q1 = page.locator('.query').nth(0);
  await (slow
    ? type(q1.locator('input.grow'), 'playmobil police')
    : q1.locator('input.grow').fill('playmobil police'));
  await pause(300);
  for (let i = 0; i < 3; i++) {
    await q1.locator('.stepper button').last().click();
    await pause(150);
  }
  await q1.locator('.mini input.num').nth(1).fill('2');
  await pause(400);
  await page.getByText('+ Ajouter une requête').click();
  await pause(300);
  const q2 = page.locator('.query').nth(1);
  await (slow
    ? type(q2.locator('input.grow'), 'lego police')
    : q2.locator('input.grow').fill('lego police'));
  await q2.locator('.stepper button').last().click();
  await q2.locator('.chip.toggle', { hasText: 'Très bon état' }).click();
  await pause(800);
}

async function runAndWait(page) {
  await page.getByText('Lancer la recherche').click();
  await page.locator('.lot').first().waitFor({ timeout: 60_000 });
}

await waitForServer();
const browser = await chromium.launch();

// 1. Mobile screenshots (light theme)
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
    locale: 'fr-FR',
  });
  const page = await ctx.newPage();
  await page.goto(URL);
  await fillExample(page, { slow: false });
  await page.screenshot({ path: `${OUT}/editor-mobile.png` });
  await runAndWait(page);
  await page.screenshot({ path: `${OUT}/results-mobile.png` });
  await page.locator('.tab', { hasText: 'Historique' }).click();
  await page.screenshot({ path: `${OUT}/history-mobile.png` });
  await ctx.close();
}

// 2. Desktop screenshot (dark theme)
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    colorScheme: 'dark',
    locale: 'fr-FR',
  });
  const page = await ctx.newPage();
  await page.goto(URL);
  await fillExample(page, { slow: false });
  await runAndWait(page);
  await page.locator('.lot .link').first().click(); // show the "not counted" items
  await page.screenshot({ path: `${OUT}/results-desktop.png` });
  await ctx.close();
}

// 3. Animated demo (mobile): video → GIF
const videoDir = mkdtempSync(join(tmpdir(), 'vbs-video-'));
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
    locale: 'fr-FR',
    recordVideo: { dir: videoDir, size: { width: 390, height: 844 } },
  });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForTimeout(800);
  await fillExample(page, { slow: true });
  await runAndWait(page);
  await page.waitForTimeout(1200);
  await page.locator('.content').evaluate((el) => el.scrollBy({ top: 420, behavior: 'smooth' }));
  await page.waitForTimeout(1500);
  await page.locator('.tab', { hasText: 'Historique' }).click();
  await page.waitForTimeout(1800);
  await ctx.close();
}
await browser.close();

const video = join(
  videoDir,
  readdirSync(videoDir).find((f) => f.endsWith('.webm')),
);
const gif = `${OUT}/demo.gif`;
const filters =
  'setpts=0.7*PTS,fps=12,scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4';
execFileSync('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-i',
  video,
  '-vf',
  filters,
  '-loop',
  '0',
  gif,
]);
rmSync(videoDir, { recursive: true, force: true });

for (const f of readdirSync(OUT)) {
  console.log(`${OUT}/${f}  ${(statSync(join(OUT, f)).size / 1024).toFixed(0)} KiB`);
}
cleanup();
process.exit(0);
