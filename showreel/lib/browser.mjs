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

const HERE = dirname(fileURLToPath(import.meta.url));
const CANVAS_SRC = readFileSync(join(HERE, '..', 'scripts', 'annotate-canvas.js'), 'utf8');

// Wrap a no-arg arrow-fn STRING so page.evaluate CALLS it (a bare string is
// evaluated as an expression -> would return the fn, not its result).
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
  }

  async setContent(html) {
    await this.page.setContent(html, { waitUntil: 'domcontentloaded' });
  }

  async freeze() {
    return this.page.evaluate(callFn(FREEZE_FN));
  }

  // Pixel-exact geometry from the DOM: the target box, the neighbor boxes the
  // callout must avoid, and the viewport. Throws if the selector is missing.
  async measure(selector) {
    const geo = await this.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { error: 'selector not found: ' + sel };
      const round = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
      const target = round(el.getBoundingClientRect());
      // neighbors = visible siblings of the target and of its ancestors that
      // intersect the viewport — the things a callout must not cover.
      const vpw = window.innerWidth, vph = window.innerHeight;
      const visible = (n) => {
        const s = getComputedStyle(n);
        if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < vpw && r.top < vph;
      };
      const set = new Map();
      let node = el;
      while (node && node !== document.body && node.parentElement) {
        const sibs = node.parentElement.children;
        for (let i = 0; i < sibs.length; i++) {
          const c = sibs[i];
          if (c === node || c.contains(el)) continue;
          if (!visible(c)) continue;
          const r = round(c.getBoundingClientRect());
          set.set(r.x + ':' + r.y + ':' + r.w + ':' + r.h, r);
          if (set.size >= 40) break;
        }
        node = node.parentElement;
      }
      return { target, neighbors: [...set.values()], viewport: { w: vpw, h: vph } };
    }, selector);
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
    return this.page.evaluate((sel) => {
      const target = document.querySelector(sel);
      const viewportWidth = window.innerWidth, viewportHeight = window.innerHeight;
      const boxes = [];
      const seenKeys = new Set();
      const textNodes = document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,a,button,td,th,li,label,code,b,strong,em,span,small');
      for (const node of textNodes) {
        if (boxes.length >= 50) break;
        if (target && (node === target || target.contains(node) || node.contains(target))) continue;
        if (!(node.textContent || '').trim()) continue;
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || +style.opacity === 0) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) continue;
        if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= viewportWidth || rect.top >= viewportHeight) continue;
        const box = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
        const key = box.x + ':' + box.y + ':' + box.w + ':' + box.h;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        boxes.push(box);
      }
      return boxes;
    }, selector);
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
