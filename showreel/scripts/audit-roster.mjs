#!/usr/bin/env node
// audit-roster.mjs — standalone pre-flight audit for a showreel roster. Runs the
// same safeguards rec.mjs enforces (off-screen, screen-breaker, arbitrary-
// primitive, random-camera) PLUS a feature-coverage report, against a roster
// rendered on a real page. Use it in CI or before authoring a take.
//
//   node scripts/audit-roster.mjs <url> <roster.json>
//
// Exit 0 = clean (errors are zero). Exit 1 = hard errors (off-screen/broken/
// missing). Warnings (arbitrary-primitive, random-camera) print but don't fail
// unless --strict. Coverage prints which primitives/features the roster uses.

import { readFileSync } from 'fs';
import { loadChromium } from './rec-page.mjs';
import {
  validateSteps, auditScenes, auditRosterLive, offlineMotionConflicts,
  STEP_KEYS,
} from './rec-steps.mjs';

const argv = process.argv.slice(2);
const strict = argv.includes('--strict');
const [url, rosterPath] = argv.filter((a) => !a.startsWith('--'));
if (!url || !rosterPath) {
  console.error('usage: node scripts/audit-roster.mjs <url> <roster.json> [--strict]');
  process.exit(2);
}

const steps = JSON.parse(readFileSync(rosterPath, 'utf8'));

// 0. shape
const v = validateSteps(steps);
if (!v.ok) { v.errors.forEach((e) => console.error('  [invalid] ' + e)); process.exit(2); }

// 1. static scene audit (arbitrary-primitive, random-camera)
const { warnings } = auditScenes(steps);

// 2. live audit (off-screen, screen-breaker) — drives state as it walks
const chromium = await loadChromium();
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(350);
const bridge = {
  measure: (sel) => page.evaluate((q) => {
    const el = document.querySelector(q); if (!el) return null;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    const visible = cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity || '1') > 0.02;
    return { w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2, visible };
  }, sel),
  click: (sel) => page.evaluate((q) => { const el = document.querySelector(q); if (el) el.click(); }, sel),
  fill: (sel, t) => page.evaluate(({ q, t }) => { const el = document.querySelector(q); if (el) { el.value = t; el.dispatchEvent(new Event('input', { bubbles: true })); } }, { q: sel, t }),
  select: (sel, o) => page.evaluate(({ q, o }) => { const el = document.querySelector(q); if (el) { const x = [...el.options].find((p) => p.text.trim() === o || p.value === o); if (x) { el.value = x.value; el.dispatchEvent(new Event('change', { bubbles: true })); } } }, { q: sel, o }),
  settle: (ms) => page.waitForTimeout(ms),
};
const { errors } = await auditRosterLive(steps, bridge);
await browser.close();

// 3. offline conflicts (informational unless the take is offline)
const offline = offlineMotionConflicts(steps);

// 4. coverage report
const used = new Set();
for (const s of steps) for (const k of Object.keys(s)) used.add(k);
const PRIMS = ['pulse', 'marks', 'spotlight', 'blur', 'redact', 'highlight', 'shake', 'countdown', 'orbit', 'trail', 'glow', 'progress', 'typeon', 'checkmark', 'flash', 'ripple', 'sparkline', 'countup', 'reveal', 'confetti', 'kenburns', 'hide', 'inset'];
const FEATS = ['camera', 'follow', 'fill', 'select', 'glide', 'screen', 'modal', 'glossary', 'stagger', 'accent'];
const missPrims = PRIMS.filter((p) => !used.has(p));
const missFeats = FEATS.filter((f) => !used.has(f));

// ── report
console.log('── showreel roster audit ──');
console.log(`roster: ${rosterPath}  (${steps.length} steps)`);
console.log(`coverage: ${PRIMS.length - missPrims.length}/${PRIMS.length} primitives, ${FEATS.length - missFeats.length}/${FEATS.length} features`);
if (missPrims.length) console.log(`  unused primitives: ${missPrims.join(', ')}`);
if (missFeats.length) console.log(`  unused features:   ${missFeats.join(', ')}`);
if (offline.length) console.log(`offline-incompatible (if --offline): ${offline.map((o) => `step ${o.step} ${o.key}`).join(', ')}`);
warnings.forEach((w) => console.log(`WARN  step ${w.step} [${w.kind}]: ${w.message}`));
errors.forEach((e) => console.error(`ERROR step ${e.step} [${e.kind}]: ${e.message}`));
console.log(errors.length ? `\n✗ ${errors.length} hard error(s)` : '\n✓ no off-screen / broken-anchor errors');

const fail = errors.length > 0 || (strict && warnings.length > 0);
process.exit(fail ? 1 : 0);
