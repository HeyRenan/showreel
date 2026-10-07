// browser.mjs — self-contained headless browser motor for proof capture.
// Drives Playwright's isolated Chromium from scripts/.deps (NO MCP). Any agent
// with Bash can use it. Reuses the proven FREEZE_FN + ANNOTATE in-page.
//
//   import { Browser } from '../lib/browser.mjs'
//   const b = await Browser.launch({ width, height, dpr })
//   await b.open(url)            // or await b.setContent(html)
//   await b.freeze()
//   const geo = await b.measure('.sel')   // {target,neighbors,viewport,dpr}
//   const png = await b.screenshot({ path, clip })
//   await b.close()

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ensureDeps, depsEnv, playwrightSpecifier } from '../scripts/ensure-deps.mjs';
import { FREEZE_FN } from '../scripts/annotate.mjs';
import { wrapLabel } from './autoplace.mjs';
import { measureInPage, textNeighborsInPage } from './page-measure.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CANVAS_SRC = readFileSync(join(HERE, '..', 'scripts', 'annotate-canvas.js'), 'utf8');

// Wrap a no-arg arrow-fn STRING so page.evaluate CALLS it (a bare string is
// evaluated as an expression -> would return the fn, not its result).
// Same font stack the canvas pill draws with — measuring with anything else
// reserves a box the drawn label does not fill.
const CANVAS_FONT = /var FONT = '([^']+)'/.exec(CANVAS_SRC)[1];
const PILL_PAD_X = 14, PILL_PAD_Y = 10, PILL_LINE_HEIGHT = 1.3; // callout pill() args

function callFn(fnString) {
  return '(' + fnString + ')()';
}

export class Browser {
  constructor(pw, browser, page, opts) {
    this._pw = pw; this._browser = browser; this.page = page; this.opts = opts;
  }

  static async launch({ width = 900, height = 1400, dpr = 1 } = {}) {
    ensureDeps({ quiet: true });
    // make Playwright find the isolated browser
    Object.assign(process.env, { PLAYWRIGHT_BROWSERS_PATH: depsEnv().PLAYWRIGHT_BROWSERS_PATH });
    const { chromium } = await import(playwrightSpecifier());
    const browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: dpr,
    });
    return new Browser(chromium, browser, page, { width, height, dpr });
  }

  async open(url) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    // fonts decide text width, so every box measured later depends on them
    await this.page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  }

  // Drive the page into the state worth capturing — the elements that only
  // exist AFTER a click, a fill or a route change. Steps run in order:
  //   {click:sel} {hover:sel} {fill:sel, value:text} {press:key} {wait:ms}
  //   {waitFor:sel}   (waitFor also gates on the element holding still)
  async prepare(steps = []) {
    for (const [i, step] of steps.entries()) {
      const label = 'step ' + (i + 1) + ' ' + JSON.stringify(step);
      try {
        if (step.click) await this.page.click(step.click, { timeout: 5000 });
        else if (step.hover) await this.page.hover(step.hover, { timeout: 5000 });
        else if (step.fill) await this.page.fill(step.fill, String(step.value ?? ''), { timeout: 5000 });
        else if (step.press) await this.page.keyboard.press(step.press);
        else if (step.wait) await this.page.waitForTimeout(step.wait);
        else if (step.waitFor) await this.settle(step.waitFor);
        else throw new Error('unknown step (use click|hover|fill|press|wait|waitFor)');
      } catch (e) {
        throw new Error('prepare: ' + label + ' failed: ' + String(e.message || e).split('\n')[0]);
      }
    }
  }

  // Wait until the selector exists, is visible, and stopped moving (same rect
  // on two consecutive frames) — a modal mid-fade or a list mid-render would
  // otherwise be measured at the wrong place.
  async settle(selector, timeout = 5000) {
    try {
      await this.page.waitForFunction((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const key = [r.x, r.y, r.width, r.height, s.opacity].join(':');
        const stable = window.__srLast === sel + key;
        window.__srLast = sel + key;
        return stable;
      }, selector, { timeout, polling: 'raf' });
    } catch {
      throw new Error('selector never appeared or never settled: ' + selector);
    }
  }

  async setContent(html) {
    await this.page.setContent(html, { waitUntil: 'domcontentloaded' });
  }

  async freeze() {
    return this.page.evaluate(callFn(FREEZE_FN));
  }

  // Exact box of a callout pill: wraps the label to maxWidth and measures it
  // with the real canvas font, so autoplace reserves precisely what gets drawn.
  async measureLabel(text, size, maxWidth) {
    const measureAll = (strings) => this.page.evaluate(({ font, size, strings }) => {
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = '600 ' + size + 'px ' + font;
      return strings.map((str) => ctx.measureText(str).width);
    }, { font: CANVAS_FONT, size, strings });

    const words = [...new Set(String(text).split(/\s+/).filter(Boolean))];
    const [spaceW, ...wordWidths] = await measureAll([' ', ...words]);
    const widthOf = new Map(words.map((w, i) => [w, wordWidths[i]]));
    const approx = (line) => {
      const parts = line.split(' ');
      return parts.reduce((sum, w) => sum + widthOf.get(w), 0) + spaceW * (parts.length - 1);
    };
    const wrapped = wrapLabel(text, maxWidth - PILL_PAD_X * 2, approx);
    const lines = wrapped.split('\n');
    const lineWidths = await measureAll(lines);
    return {
      text: wrapped,
      w: Math.ceil(Math.max(...lineWidths) + PILL_PAD_X * 2),
      h: Math.ceil(size * PILL_LINE_HEIGHT * lines.length + PILL_PAD_Y * 2),
    };
  }

  // Pixel-exact geometry from the DOM: the target box, the neighbor boxes the
  // callout must avoid, and the viewport. Throws if the selector is missing.
  async measure(selector) {
    const geo = await this.page.evaluate(measureInPage, selector);
    if (geo.error) throw new Error(geo.error);
    geo.dpr = this.opts.dpr;
    return geo;
  }

  // scale:'css' keeps the PNG in CSS pixels regardless of dpr — every measured
  // rect, annotation coordinate, crop region and vcheck box stays in one unit.
  async screenshot({ path, clip } = {}) {
    const buf = await this.page.screenshot(clip ? { path, clip, scale: 'css' } : { path, scale: 'css' });
    return buf;
  }

  // measure() that guarantees the target is inside the rendered viewport: on
  // pages taller than the fitToContent cap a below-the-fold selector would be
  // measured off-canvas; scroll it into view and re-measure.
  async measureVisible(selector) {
    await this.settle(selector);
    let geo = await this.measure(selector);
    const t = geo.target;
    if (t.y < 0 || t.y + t.h > geo.viewport.h) {
      await this.page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), selector);
      await this.page.waitForTimeout(150);
      geo = await this.measure(selector);
    }
    return geo;
  }

  // Visible text-bearing rects in the viewport (excluding the target and its
  // descendants) — extra autoplace obstacles so callouts and zoom insets never
  // land on page text that the sibling-only measure() misses.
  async textNeighbors(selector) {
    return this.page.evaluate(textNeighborsInPage, selector);
  }

  // Ancestor boxes innermost → outermost (up to body) — lets a tight crop snap to
  // a meaningful container instead of the bare element.
  async ancestorBoxes(selector) {
    return this.page.evaluate((sel) => {
      const target = document.querySelector(sel);
      const boxes = [];
      let node = target && target.parentElement;
      while (node) {
        const rect = node.getBoundingClientRect();
        boxes.push({ x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) });
        if (node === document.body) break;
        node = node.parentElement;
      }
      return boxes;
    }, selector);
  }

  // Shrink the viewport to the REAL content extent (the furthest visible bottom
  // edge), so a full-page shot has no dead space. scrollHeight is unreliable for
  // absolutely/fixed-positioned content, so we scan element rects.
  async fitToContent({ maxHeight = 4000, minHeight = 200, pad = 24 } = {}) {
    const bottom = await this.page.evaluate(() => {
      let max = 0;
      const els = document.body.getElementsByTagName('*');
      for (let i = 0; i < els.length; i++) {
        const s = getComputedStyle(els[i]);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        const r = els[i].getBoundingClientRect();
        if (r.width > 0 && r.height > 0) max = Math.max(max, r.bottom + window.scrollY);
      }
      return Math.ceil(Math.max(max, document.body.scrollHeight));
    });
    const height = Math.max(minHeight, Math.min(maxHeight, bottom + pad));
    await this.page.setViewportSize({ width: this.opts.width, height });
    this.opts.height = height;
    return { width: this.opts.width, height };
  }

  // Draw annotations onto a screenshot buffer using ANNOTATE in-page. Returns a
  // PNG Buffer. The image is loaded as a same-origin dataURL (canvas untainted).
  async annotate(pngBuffer, annotations) {
    const dataUrl = 'data:image/png;base64,' + Buffer.from(pngBuffer).toString('base64');
    const out = await this.page.evaluate(
      async ({ src, dataUrl, annotations }) => {
        // eslint-disable-next-line no-eval
        eval(src); // defines ANNOTATE
        // eslint-disable-next-line no-undef
        return await ANNOTATE({ imageB64: dataUrl, annotations });
      },
      { src: CANVAS_SRC, dataUrl, annotations }
    );
    return Buffer.from(out.split(',')[1], 'base64');
  }

  // Crop a PNG buffer to {x,y,w,h} using the in-page canvas. Returns a Buffer.
  async crop(pngBuffer, region) {
    const dataUrl = 'data:image/png;base64,' + Buffer.from(pngBuffer).toString('base64');
    const out = await this.page.evaluate(({ dataUrl, region }) => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const W = img.naturalWidth, H = img.naturalHeight;
        const x = Math.max(0, Math.round(region.x)), y = Math.max(0, Math.round(region.y));
        const w = Math.min(W - x, Math.round(region.w)), h = Math.min(H - y, Math.round(region.h));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
        res(cv.toDataURL('image/png'));
      };
      img.onerror = () => rej('crop load failed');
      img.src = dataUrl;
    }), { dataUrl, region });
    return Buffer.from(out.split(',')[1], 'base64');
  }

  // Composite a screenshot into a frame (browser window / card / minimal) on a
  // padded, optionally ratio-sized background. `layout` comes from frameLayout
  // (pure); this only draws pixels. Returns a PNG Buffer.
  async beautify(pngBuffer, layout, draw) {
    const dataUrl = 'data:image/png;base64,' + Buffer.from(pngBuffer).toString('base64');
    const out = await this.page.evaluate(({ dataUrl, L, D }) => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = L.canvasW; cv.height = L.canvasH;
        const ctx = cv.getContext('2d');

        // rounded-rect path with per-corner radii
        const path = (x, y, w, h, r) => {
          const tl = r.tl || 0, tr = r.tr || 0, br = r.br || 0, bl = r.bl || 0;
          ctx.beginPath();
          ctx.moveTo(x + tl, y);
          ctx.lineTo(x + w - tr, y); ctx.arcTo(x + w, y, x + w, y + tr, tr);
          ctx.lineTo(x + w, y + h - br); ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
          ctx.lineTo(x + bl, y + h); ctx.arcTo(x, y + h, x, y + h - bl, bl);
          ctx.lineTo(x, y + tl); ctx.arcTo(x, y, x + tl, y, tl);
          ctx.closePath();
        };

        // background — flat or vertical gradient
        const bg = (D.bg && D.bg.length) ? D.bg : ['#1e293b', '#0f172a'];
        if (bg.length > 1) {
          const g = ctx.createLinearGradient(0, 0, 0, L.canvasH);
          g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
          ctx.fillStyle = g;
        } else { ctx.fillStyle = bg[0]; }
        ctx.fillRect(0, 0, L.canvasW, L.canvasH);

        const rad = L.radius;
        const all = { tl: rad, tr: rad, br: rad, bl: rad };

        // drop shadow under the whole window (fill once to cast it, then reset)
        if (D.shadow !== false && L.frame !== 'minimal') {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,.38)';
          ctx.shadowBlur = Math.round(L.winW * 0.03);
          ctx.shadowOffsetY = Math.round(L.winW * 0.012);
          ctx.fillStyle = '#000';
          path(L.winX, L.winY, L.winW, L.winH, all); ctx.fill();
          ctx.restore();
        }

        // window body (also the chrome-bar background for the 'window' frame)
        ctx.fillStyle = L.frame === 'window' ? '#0d1117' : '#ffffff';
        path(L.winX, L.winY, L.winW, L.winH, all); ctx.fill();

        // chrome bar: traffic lights + url
        if (L.frame === 'window' && L.chromeH > 0) {
          const cy = L.winY + L.chromeH / 2;
          const dotR = Math.max(4, Math.round(L.chromeH * 0.16));
          const dots = ['#ff5f57', '#febc2e', '#28c840'];
          for (let i = 0; i < 3; i++) {
            ctx.fillStyle = dots[i];
            ctx.beginPath();
            ctx.arc(L.winX + L.chromeH * 0.5 + i * (dotR * 2 + 8), cy, dotR, 0, Math.PI * 2);
            ctx.fill();
          }
          if (D.url) {
            ctx.fillStyle = '#8b949e';
            ctx.font = Math.round(L.chromeH * 0.4) + 'px -apple-system,Segoe UI,Roboto,Arial,sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(String(D.url).slice(0, 80), L.winX + L.winW / 2, cy + 1);
            ctx.textAlign = 'left';
          }
        }

        // the screenshot — bottom corners rounded under a window bar, all corners
        // rounded for a bare card, square for minimal
        const imgR = L.frame === 'window'
          ? { tl: 0, tr: 0, br: rad, bl: rad }
          : all;
        ctx.save();
        path(L.imgX, L.imgY, L.imgW, L.imgH, imgR); ctx.clip();
        ctx.drawImage(img, L.imgX, L.imgY, L.imgW, L.imgH);
        ctx.restore();

        res(cv.toDataURL('image/png'));
      };
      img.onerror = () => rej('beautify: image failed to load');
      img.src = dataUrl;
    }), { dataUrl, L: layout, D: draw || {} });
    return Buffer.from(out.split(',')[1], 'base64');
  }

  // Inject a snippet (string) into the page, e.g. the cursor for rec.
  async inject(fnString, arg) {
    return this.page.evaluate(fnString, arg);
  }

  async close() {
    try { await this._browser.close(); } catch { /* ignore */ }
  }
}
