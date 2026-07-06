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

import { readFileSync } from 'node:fs';
import { loadChromium } from './rec-page.mjs';
import {
  validateSteps, auditScenes, auditRosterLive, makeAuditBridge, offlineMotionConflicts,
} from './rec-steps.mjs';

const argv = process.argv.slice(2);
const strict = argv.includes('--strict');
const flagVal = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : def;
};
// MUST match the render viewport or the reach/off-screen checks lie: a panel
// that fits 1600x900 but not 1280x676 would pass here and BLOCK at render.
// Default to rec.mjs's 16:9 capture so CI and a local render agree.
const VW = flagVal('--width', 1280);
const VH = flagVal('--height', 720);
const VALUE_FLAGS = new Set(['--width', '--height']);
const positionals = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { if (VALUE_FLAGS.has(argv[i])) i++; continue; }
  positionals.push(argv[i]);
}
const [url, rosterPath] = positionals;
if (!url || !rosterPath) {
  console.error('usage: node scripts/audit-roster.mjs <url> <roster.json> [--width N] [--height N] [--strict]');
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
const page = await (await browser.newContext({ viewport: { width: VW, height: VH } })).newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(350);
const bridge = makeAuditBridge(page, VW, VH);
const { errors, warnings: liveWarnings } = await auditRosterLive(steps, bridge);
warnings.push(...liveWarnings);
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
