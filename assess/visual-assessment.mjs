import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const OUTPUT = join(ROOT, 'assess', 'output');
const VIEWPORT = { width: 1600, height: 1000 };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

function log(message) {
  process.stdout.write(`${message}\n`);
}

function buildApp() {
  log('[assess] building production bundle...');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['run', 'build'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`vite build failed with exit code ${result.status}`);
  }
}

function startStaticServer() {
  const server = createServer((request, response) => {
    const urlPath = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const filePath = normalize(join(DIST, relative));
    if (!filePath.startsWith(DIST) || !existsSync(filePath)) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(filePath).pipe(response);
  });

  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolveServer({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

function imageMetrics(buffer) {
  const png = PNG.sync.read(buffer);
  let count = 0;
  let sum = 0;
  let sumSq = 0;
  let bright = 0;
  let colorful = 0;
  const colors = new Set();

  for (let y = 0; y < png.height; y += 2) {
    for (let x = 0; x < png.width; x += 2) {
      const index = (png.width * y + x) << 2;
      const r = png.data[index];
      const g = png.data[index + 1];
      const b = png.data[index + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      count += 1;
      sum += luma;
      sumSq += luma * luma;
      if (luma > 80) bright += 1;
      if (max - min > 18 && max > 55) colorful += 1;
      if (colors.size < 6000) {
        colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
      }
    }
  }

  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  return {
    width: png.width,
    height: png.height,
    meanLuma: Number(mean.toFixed(2)),
    lumaVariance: Number(variance.toFixed(2)),
    brightFraction: Number((bright / count).toFixed(4)),
    colorfulFraction: Number((colorful / count).toFixed(4)),
    quantizedColors: colors.size,
  };
}

function imageDifference(bufferA, bufferB) {
  const pngA = PNG.sync.read(bufferA);
  const pngB = PNG.sync.read(bufferB);
  if (pngA.width !== pngB.width || pngA.height !== pngB.height) {
    return { changedFraction: 1, note: 'dimension mismatch' };
  }
  let changed = 0;
  let total = 0;
  for (let y = 0; y < pngA.height; y += 2) {
    for (let x = 0; x < pngA.width; x += 2) {
      const index = (pngA.width * y + x) << 2;
      const delta =
        Math.abs(pngA.data[index] - pngB.data[index]) +
        Math.abs(pngA.data[index + 1] - pngB.data[index + 1]) +
        Math.abs(pngA.data[index + 2] - pngB.data[index + 2]);
      total += 1;
      if (delta > 18) changed += 1;
    }
  }
  return { changedFraction: Number((changed / total).toFixed(4)) };
}

function saveImage(name, buffer) {
  const file = join(OUTPUT, name);
  writeFileSync(file, buffer);
  return file;
}

async function run() {
  mkdirSync(OUTPUT, { recursive: true });
  buildApp();

  const { server, url } = await startStaticServer();
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  const checks = [];
  const consoleErrors = [];
  const pageErrors = [];
  const report = {
    startedAt: new Date().toISOString(),
    viewport: VIEWPORT,
    url,
    checks,
    screenshots: {},
    metrics: {},
    consoleErrors,
    pageErrors,
  };

  const check = (name, pass, detail) => {
    checks.push({ name, pass: Boolean(pass), detail });
    log(`[${pass ? 'PASS' : 'FAIL'}] ${name} — ${detail}`);
  };

  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(18_000);
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__HELMINTH_READY__ === true);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(450);

    const title = await page.title();
    check('page title', title.includes('HELMINTH'), title);

    const startButton = page.locator('[data-testid="start-button"]');
    check('start button visible', await startButton.isVisible(), await startButton.innerText());

    const arena = page.locator('[data-testid="arena"]');
    const arenaBox = await arena.boundingBox();
    check(
      'arena has usable geometry',
      Boolean(arenaBox && arenaBox.width > 500 && arenaBox.height > 500),
      arenaBox ? `${Math.round(arenaBox.width)}×${Math.round(arenaBox.height)}` : 'missing',
    );

    const canvas = page.locator('[data-testid="arena"] canvas');
    check('WebGL canvas present', (await canvas.count()) === 1, 'three.js canvas found');

    const standby = await page.screenshot({ fullPage: true });
    report.screenshots.standby = saveImage('01-standby.png', standby);
    const standbyMetrics = imageMetrics(standby);
    report.metrics.standby = standbyMetrics;
    check(
      'standby frame is visually populated',
      standbyMetrics.lumaVariance > 100 && standbyMetrics.quantizedColors > 500,
      `variance=${standbyMetrics.lumaVariance}, colors=${standbyMetrics.quantizedColors}`,
    );

    await page.locator('[data-speed="8"]').click();
    await startButton.click();
    await page.waitForFunction(() => window.__HELMINTH__.getState().phase === 'running');
    await page.waitForTimeout(2600);

    const running = await page.screenshot({ fullPage: true });
    report.screenshots.running = saveImage('02-selection-live.png', running);
    const runningMetrics = imageMetrics(running);
    report.metrics.running = runningMetrics;
    const standbyDiff = imageDifference(standby, running);
    report.metrics.standbyToRunningDiff = standbyDiff;
    check(
      'selection visibly changes the frame',
      standbyDiff.changedFraction > 0.015,
      `changed=${(standbyDiff.changedFraction * 100).toFixed(1)}%`,
    );

    const arenaA = await canvas.screenshot();
    report.screenshots.arenaA = saveImage('03-arena-motion-a.png', arenaA);
    await page.waitForTimeout(420);
    const arenaB = await canvas.screenshot();
    report.screenshots.arenaB = saveImage('04-arena-motion-b.png', arenaB);
    const arenaDiff = imageDifference(arenaA, arenaB);
    report.metrics.arenaMotionDiff = arenaDiff;
    check(
      'ecosystem motion is visible inside the WebGL canvas',
      arenaDiff.changedFraction > 0.002,
      `changed=${(arenaDiff.changedFraction * 100).toFixed(2)}%`,
    );

    const stateWhileRunning = await page.evaluate(() => window.__HELMINTH__.getState());
    check(
      'simulation time is advancing',
      stateWhileRunning.elapsed > 2 || stateWhileRunning.generation > 1,
      `elapsed=${stateWhileRunning.elapsed.toFixed(1)}s at ${stateWhileRunning.generation} generation(s)`,
    );
    check(
      'chomper patrol is present',
      stateWhileRunning.chompers === 3,
      `${stateWhileRunning.chompers} chompers active`,
    );

    const sensoryState = await page.evaluate(() => {
      const leader = window.__HELMINTH__.getEvolution().leader;
      const kinds = [...new Set(leader.substrate.inputLayout.map((node) => node.kind))];
      return { sensors: leader.worm.sensorValues.length, kinds };
    });
    check(
      'worms sense food, rivals, chompers and their own body',
      sensoryState.sensors === 24 &&
        ['food', 'hazard', 'worm', 'chomper', 'self'].every((kind) =>
          sensoryState.kinds.includes(kind),
        ),
      `${sensoryState.sensors} sensors: ${sensoryState.kinds.join(', ')}`,
    );

    await page.waitForFunction(
      () => window.__HELMINTH__.getState().phase === 'intermission',
      null,
      { timeout: 60_000 },
    );
    await page.waitForTimeout(180);
    const scoredState = await page.evaluate(() => window.__HELMINTH__.getState());
    const scored = await page.screenshot({ fullPage: true });
    report.screenshots.scored = saveImage('05-cohort-scored.png', scored);
    check(
      'first cohort receives a fitness score',
      scoredState.history.length >= 1 && scoredState.history[0].best > 0,
      `history=${scoredState.history.length}, best=${Math.round(scoredState.history[0]?.best ?? 0)}`,
    );
    check(
      'generation completes only after every worm dies',
      scoredState.alive === 0,
      `${scoredState.alive} worms alive at intermission`,
    );

    await page.waitForFunction(
      () => window.__HELMINTH__.getState().generation >= 2,
      null,
      { timeout: 8_000 },
    );
    await page.waitForFunction(() => window.__HELMINTH__.getState().phase === 'running');
    await page.waitForTimeout(500);
    const generationTwo = await page.screenshot({ fullPage: true });
    report.screenshots.generationTwo = saveImage('06-generation-two.png', generationTwo);
    const generationTwoState = await page.evaluate(() => window.__HELMINTH__.getState());
    check(
      'genetic algorithm advances to the next cohort',
      generationTwoState.generation >= 2,
      `generation=${generationTwoState.generation}, history=${generationTwoState.history.length}`,
    );

    await startButton.click();
    await page.waitForFunction(() => window.__HELMINTH__.getState().running === false);
    await page.waitForTimeout(260);
    const pausedLabel = await page.locator('#startLabel').innerText();
    const pausedStatus = await page.locator('[data-testid="run-status"]').innerText();
    check(
      'pause control pauses the simulation',
      pausedLabel.toLowerCase().includes('resume') && pausedStatus.includes('OBSERVATION HOLD'),
      `${pausedLabel} / ${pausedStatus.replace(/\s+/g, ' ')}`,
    );
    const paused = await page.screenshot({ fullPage: true });
    report.screenshots.paused = saveImage('07-paused.png', paused);

    const chart = page.locator('#fitnessCanvas');
    const chartBuffer = await chart.screenshot();
    report.screenshots.fitnessChart = saveImage('08-fitness-chart.png', chartBuffer);
    const chartMetrics = imageMetrics(chartBuffer);
    report.metrics.fitnessChart = chartMetrics;
    check(
      'fitness chart is rendered',
      chartMetrics.meanLuma > 0.5,

      `colorful=${(chartMetrics.colorfulFraction * 100).toFixed(2)}%, luma=${chartMetrics.meanLuma}`,
    );

    check(
      'generation metric in DOM agrees with simulation',
      (await page.locator('[data-testid="generation"]').innerText()) ===
        String(generationTwoState.generation).padStart(2, '0'),
      `DOM=${await page.locator('[data-testid="generation"]').innerText()}`,
    );

    const compactPage = await context.newPage();
    compactPage.on('pageerror', (error) => pageErrors.push(error.message));
    await compactPage.setViewportSize({ width: 1440, height: 900 });
    await compactPage.goto(url, { waitUntil: 'networkidle' });
    await compactPage.waitForFunction(() => window.__HELMINTH_READY__ === true);
    await compactPage.evaluate(() => document.fonts.ready);
    await compactPage.waitForTimeout(400);
    const compact = await compactPage.screenshot({ fullPage: true });
    report.screenshots.compact = saveImage('09-compact-1440x900.png', compact);
    const compactArena = await compactPage.locator('[data-testid="arena"]').boundingBox();
    const compactLayout = await compactPage.evaluate(() => {
      const clipped = [...document.querySelectorAll('.panel, .side-panel')]
        .filter((element) => element.scrollHeight > element.clientHeight + 2)
        .map((element) => element.classList[0]);
      return {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        width: window.innerWidth,
        height: window.innerHeight,
        rightPanel: getComputedStyle(document.querySelector('.right-panel')).display,
        clipped,
      };
    });
    check(
      'compact desktop layout remains composed',
      Boolean(compactArena && compactArena.width > 660 && compactArena.height > 610) &&
        compactLayout.rightPanel !== 'none' &&
        compactLayout.scrollHeight <= compactLayout.height + 2 &&
        compactLayout.scrollWidth <= compactLayout.width + 2 &&
        compactLayout.clipped.length === 0,
      `arena=${Math.round(compactArena?.width ?? 0)}×${Math.round(compactArena?.height ?? 0)}, document=${compactLayout.scrollWidth}×${compactLayout.scrollHeight}, clipped=${compactLayout.clipped.join(',') || 'none'}`,
    );

    check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | ') || 'none');
    report.finishedAt = new Date().toISOString();
    report.state = await page.evaluate(() => window.__HELMINTH__.getState());
  } catch (error) {
    report.error = error.stack || String(error);
    checks.push({ name: 'assessment completed', pass: false, detail: error.message });
    log(`[FAIL] assessment error — ${error.message}`);
  } finally {
    await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }

  const failed = checks.filter((entry) => !entry.pass);
  report.passed = failed.length === 0;
  writeFileSync(join(OUTPUT, 'report.json'), JSON.stringify(report, null, 2));

  log('');
  log(`[assess] screenshots: ${OUTPUT}`);
  log(`[assess] ${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) {
    log(`[assess] FAILED: ${failed.map((entry) => entry.name).join(', ')}`);
    process.exitCode = 1;
  } else {
    log('[assess] PASS');
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
