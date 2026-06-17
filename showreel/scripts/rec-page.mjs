// rec-page.mjs — browser/page setup glue for the recorder: deps loader,
// offline launch flags, page-look sampling, and the injected-snippet readers.
// Extracted from rec.mjs (stage 4). State-free.

import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDeps, depsEnv, playwrightSpecifier } from './ensure-deps.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export const cursorSnippet = () =>
  execFileSync('node', [join(HERE, 'cursor-inject.mjs')], { encoding: 'utf8' }).trim();
export const endCardSnippet = () =>
  execFileSync('node', [join(HERE, 'end-card-inject.mjs')], { encoding: 'utf8' }).trim();

export async function detectPageLook(page) {
  try {
    const { decodePNG } = await import('./pngread.mjs');
    const png = decodePNG(await page.screenshot({ type: 'png' }));
    let sum = 0, n = 0;
    const ch = png.channels || 4;
    const stepX = Math.max(1, png.width >> 5), stepY = Math.max(1, png.height >> 5);
    for (let y = 0; y < png.height; y += stepY)
      for (let x = 0; x < png.width; x += stepX) {
        const i = (y * png.width + x) * ch;
        sum += png.data[i] * 0.2126 + png.data[i + 1] * 0.7152 + png.data[i + 2] * 0.0722;
        n++;
      }
    const rs = [], gs = [], bs = [];
    const px = (x, y) => {
      const i = (y * png.width + x) * ch;
      rs.push(png.data[i]); gs.push(png.data[i + 1]); bs.push(png.data[i + 2]);
    };
    for (let x = 0; x < png.width; x += stepX) { px(x, 1); px(x, png.height - 2); }
    for (let y = 0; y < png.height; y += stepY) { px(1, y); px(png.width - 2, y); }
    const med = (arr) => arr.sort((a, b) => a - b)[arr.length >> 1] | 0;
    const hx = (v) => v.toString(16).padStart(2, '0');
    return { theme: sum / n < 118 ? 'dark' : 'light', bg: '0x' + hx(med(rs)) + hx(med(gs)) + hx(med(bs)) };
  } catch { return { theme: 'light', bg: null }; }
}

// Cheap LIVE theme read for per-step adaptation (no screenshot): luminance of
// the body background. Generic — keyed on pixels, never a page-specific class
// like `.light`. Returns 'dark' | 'light', or null when the bg is transparent /
// unparseable so the caller can fall back to the load-time seed.
export async function readLiveTheme(page) {
  try {
    return await page.evaluate(() => {
      const bg = getComputedStyle(document.body).backgroundColor;
      const m = bg && bg.match(/[\d.]+/g);
      if (!m || (m[3] !== undefined && Number(m[3]) === 0)) return null; // transparent
      const L = (0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2]) / 255;
      return L < 0.5 ? 'dark' : 'light';
    });
  } catch { return null; }
}

// the canvas so nothing overlaps inside the strip.

export async function loadChromium() {
  ensureDeps({ quiet: true, needGif: true });
  Object.assign(process.env, { PLAYWRIGHT_BROWSERS_PATH: depsEnv().PLAYWRIGHT_BROWSERS_PATH });
  const { chromium } = await import(playwrightSpecifier());
  return chromium;
}

// Compositor-thread animations (transform/opacity) ignore the renderer's
// virtual time budget — without these flags the camera would finish on the
// compositor's wall clock while everything else ran virtual. Offline forces

export const OFFLINE_ARGS = [
  '--disable-threaded-animation',
  '--disable-threaded-scrolling',
  '--run-all-compositor-stages-before-draw',
  '--disable-checker-imaging',
  '--disable-new-content-rendering-timeout',
];
