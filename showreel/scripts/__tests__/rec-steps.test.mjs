import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSteps, STEP_KEYS, MARK_KEYS, dwellMs, fillSpec, selectSpec, cameraSpec, offlineMotionConflicts, OFFLINE_INCOMPATIBLE } from '../rec.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEMO = join(HERE, '..', '..', '..', 'assets-src', 'demo', 'index.html');

test('every documented step key is accepted', () => {
  const step = {};
  for (const k of STEP_KEYS) {
    // live is mutually exclusive with annotation primitives by design (it has
    // its own dedicated tests); it cannot coexist in an all-keys step.
    if (k === 'live') continue;
    step[k] = k === 'marks' ? [{ sel: '.x', badge: '1.1', text: 'first card' }]
      : (k === 'topbar' || k === 'bottombar') ? 'bar text'
      : k === 'fill' ? 'input#iemail'
      : k === 'text' ? 'dana@company.com'
      : k === 'delay' ? 45
      : k === 'select' ? 'select#region'
      : k === 'option' ? 'São Paulo'
      : k === 'camera' ? '.stats'
      : k === 'zoom' ? 1.4
      : k === 'stagger' ? 300
      : k === 'accent' ? '#ec4899'
      : k === 'inset' ? '.stat'
      : k === 'fade' ? 300
      : k === 'speed' ? 0.5
      : k === 'sparkline' ? '.stat'
      : k === 'glow' ? '#cta'
      : k === 'typeon' ? '.hero'
      : k === 'reveal' ? '.hero'
      : k === 'progress' ? '#card'
      : k === 'trail' ? { from: '#a', to: '#b' }
      : k === 'countdown' ? 3
      : k === 'modal' ? 'Shipped to production.'
      : k === 'size' ? 1.2
      : k === 'dur' ? 1200
      : k === 'count' ? 4
      : k === 'intensity' ? 1.3
      : true;
  }
  const r = validateSteps([step]);
  assert.ok(r.ok, r.errors.join('; '));
});

test('dinamicidade knobs: shared keys + object forms accept valid, reject out-of-range', () => {
  // shared keys valid
  assert.ok(validateSteps([{ pulse: '#a', dur: 2000, count: 5, intensity: 1.4 }]).ok);
  // object form with knobs valid (target + selector effects)
  assert.ok(validateSteps([{ pulse: { sel: '#a', duration: 2000, count: 6, scale: 1.5, intensity: 1.2 } }]).ok);
  assert.ok(validateSteps([{ glow: { sel: '#cta', duration: 3000, count: 3 } }]).ok);
  assert.ok(validateSteps([{ orbit: { sel: '#a', count: 8, scale: 2 } }]).ok);
  assert.ok(validateSteps([{ kenburns: { sel: '.hero', duration: 3000, scale: 1.1 } }]).ok);
  assert.ok(validateSteps([{ confetti: { duration: 1400, count: 40 }, click: '#go' }]).ok);
  assert.ok(validateSteps([{ trail: { from: '#a', to: '#b', count: 20, scale: 1.3 } }]).ok);
  assert.ok(validateSteps([{ countdown: { n: 3, scale: 1.5, duration: 800 } }]).ok);
  // out-of-range rejected
  assert.ok(!validateSteps([{ dur: 50 }]).ok);
  assert.ok(!validateSteps([{ count: 0 }]).ok);
  assert.ok(!validateSteps([{ count: 1.5 }]).ok);
  assert.ok(!validateSteps([{ intensity: 5 }]).ok);
  assert.ok(!validateSteps([{ pulse: { sel: '#a', duration: 99999 } }]).ok);
  assert.ok(!validateSteps([{ pulse: { sel: '#a', count: 100 } }]).ok);
  assert.ok(!validateSteps([{ glow: { sel: '#a', scale: 9 } }]).ok);
  // unknown knob on an effect object rejected
  assert.ok(!validateSteps([{ pulse: { sel: '#a', wobble: 3 } }]).ok);
  // object form without sel + no click/glide target rejected for target effects
  assert.ok(!validateSteps([{ pulse: { duration: 1000 } }]).ok);
  // object form without sel but WITH a click target is fine (bursts from target)
  assert.ok(validateSteps([{ confetti: { count: 30 }, click: '#go' }]).ok);
});

test('unknown top-level key rejected with step number and known list', () => {
  const r = validateSteps([{ click: '.a' }, { badg: 1 }]);
  assert.ok(!r.ok);
  assert.match(r.errors[0], /step 2/);
  assert.match(r.errors[0], /badg/);
});

test('mark sub-keys validated: typo and missing sel rejected', () => {
  const r = validateSteps([{ scrollTo: '.s', marks: [{ sel: '.x', circl: true }, { badge: 2 }] }]);
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => /mark 1/.test(e) && /circl/.test(e)));
  assert.ok(r.errors.some((e) => /mark 2/.test(e) && /missing sel/.test(e)));
});

test('non-array steps and non-array marks rejected', () => {
  assert.ok(!validateSteps({}).ok);
  assert.ok(!validateSteps([{ marks: { sel: '.x' } }]).ok);
});

test('mark keys are exactly the renderer surface', () => {
  assert.deepEqual([...MARK_KEYS].sort(), ['badge', 'circle', 'rect', 'sel', 'text']);
});

test('glossary: true needs marks texts; object validates items/pos/width/title/stagger', () => {
  const v = (s) => validateSteps([s]);
  assert.ok(!v({ marks: [{ sel: '.a', badge: '1', text: 'x' }], glossary: true }).errors.length);
  assert.ok(v({ glossary: true }).errors.some((e) => /needs marks with text/.test(e)));
  assert.ok(!v({ glossary: { items: [{ badge: '1', text: 'one' }], pos: 'top-left', width: 360, title: 'Legend', stagger: 300 } }).errors.length);
  assert.ok(v({ glossary: { items: [] } }).errors.some((e) => /non-empty array/.test(e)));
  assert.ok(v({ glossary: { items: [{ badge: '1' }] } }).errors.some((e) => /needs badge and text/.test(e)));
  assert.ok(v({ glossary: { items: [{ badge: '1', text: 'x' }], pos: 'middle' } }).errors.some((e) => /glossary.pos/.test(e)));
  assert.ok(v({ glossary: { items: [{ badge: '1', text: 'x' }], width: 40 } }).errors.some((e) => /glossary.width/.test(e)));
});

test('inset: selector or {sel, zoom in (1,3]}', () => {
  const v = (s) => validateSteps([s]);
  assert.ok(!v({ inset: '.stat' }).errors.length);
  assert.ok(!v({ inset: { sel: '.stat', zoom: 2 } }).errors.length);
  assert.ok(v({ inset: '' }).errors.some((e) => /inset/.test(e)));
  assert.ok(v({ inset: { zoom: 2 } }).errors.some((e) => /inset.sel/.test(e)));
  assert.ok(v({ inset: { sel: '.x', zoom: 9 } }).errors.some((e) => /inset.zoom/.test(e)));
});

test('follow: true or (1,3] riding a cursor movement; fade bounded', () => {
  const v = (s) => validateSteps([s]);
  assert.ok(!v({ click: '.a', follow: true }).errors.length);
  assert.ok(!v({ glide: true, scrollTo: '.a', follow: 1.6 }).errors.length);
  assert.ok(v({ note: 'x', follow: true }).errors.some((e) => /rides a cursor movement/.test(e)));
  assert.ok(v({ click: '.a', follow: 9 }).errors.some((e) => /follow/.test(e)));
  assert.ok(!v({ rect: '.a', fade: 120 }).errors.length);
  assert.ok(v({ rect: '.a', fade: 10 }).errors.some((e) => /fade/.test(e)));
});

test('endCard: default none, gif|all|none accepted, junk rejected', () => {
  const base = { steps: [{ note: 'x' }], out: '/tmp/o.gif' };
  const d = validateBatch([{ ...base }], { url: 'http://x/' });
  assert.equal(d.takes[0].endCard, 'none');
  assert.ok(validateBatch([{ ...base, endCard: 'gif' }], { url: 'http://x/' }).ok);
  assert.ok(validateBatch([{ ...base, endCard: 'party' }], { url: 'http://x/' }).errors.some((e) => /endCard/.test(e)));
});

test('mp4-only: an .mp4 out skips the gif encode and becomes the mp4 target', () => {
  const t = validateBatch([{ steps: [{ note: 'x' }], out: '/tmp/o.mp4' }], { url: 'http://x/' }).takes[0];
  assert.equal(t.gif, false);
  assert.equal(t.mp4, '/tmp/o.mp4');
  const g = validateBatch([{ steps: [{ note: 'x' }], out: '/tmp/o.gif' }], { url: 'http://x/' }).takes[0];
  assert.notEqual(g.gif, false);
  assert.equal(g.mp4, null);
});

test('stagger rides marks or glossary only, non-negative', () => {
  const v = (s) => validateSteps([s]);
  assert.ok(!v({ marks: [{ sel: '.a', badge: '1' }], stagger: 200 }).errors.length);
  assert.ok(v({ note: 'x', stagger: 200 }).errors.some((e) => /only rides/.test(e)));
  assert.ok(v({ marks: [{ sel: '.a' }], stagger: -1 }).errors.some((e) => /non-negative/.test(e)));
});

import { modalLayout, screenPhase } from '../rec.mjs';

test('modalLayout: no anchor -> centered narration with backdrop', () => {
  const r = modalLayout('hello', null, { w: 1280, h: 900 });
  assert.equal(r.pos, 'center');
  assert.equal(r.backdrop, true);
  assert.equal(r.text, 'hello');
});

test('modalLayout: anchored -> corner farthest from the element, no backdrop', () => {
  const vp = { w: 1280, h: 900 };
  assert.equal(modalLayout({ text: 'x' }, { x: 1000, y: 50, w: 100, h: 40 }, vp).pos, 'bottom-left');
  assert.equal(modalLayout({ text: 'x' }, { x: 50, y: 50, w: 100, h: 40 }, vp).pos, 'bottom-right');
  assert.equal(modalLayout({ text: 'x' }, { x: 50, y: 800, w: 100, h: 40 }, vp).pos, 'top-right');
  assert.equal(modalLayout({ text: 'x' }, { x: 1000, y: 800, w: 100, h: 40 }, vp).pos, 'top-left');
  assert.equal(modalLayout({ text: 'x' }, { x: 1000, y: 50, w: 100, h: 40 }, vp).backdrop, false);
});

test('modalLayout: explicit position and backdrop honored', () => {
  const r = modalLayout({ text: 'x', position: 'top-right', backdrop: true }, { x: 0, y: 0, w: 10, h: 10 }, { w: 1280, h: 900 });
  assert.equal(r.pos, 'top-right');
  assert.equal(r.backdrop, true);
});

test('screenPhase: before without click, afterClick with click, null without screen', () => {
  assert.equal(screenPhase({ screen: 'Home' }), 'before');
  assert.equal(screenPhase({ screen: 'Home', click: '.a' }), 'afterClick');
  assert.equal(screenPhase({ click: '.a' }), null);
});

test('zoom: selector accepted', () => {
  const r = validateSteps([{ zoom: '.stats', note: 'KPIs' }]);
  assert.ok(r.ok, r.errors.join('; '));
});

test('zoom: "out" accepted', () => {
  const r = validateSteps([{ zoom: 'out', wait: 300 }]);
  assert.ok(r.ok, r.errors.join('; '));
});

test('zoom: true riding a click accepted', () => {
  const r = validateSteps([{ click: '#deploy', zoom: true, note: 'deploy' }]);
  assert.ok(r.ok, r.errors.join('; '));
});

test('zoom: true without click rejected with step number and the fix', () => {
  const r = validateSteps([{ zoom: true }]);
  assert.ok(!r.ok);
  assert.match(r.errors[0], /step 1/);
  assert.match(r.errors[0], /zoom:true/);
  assert.match(r.errors[0], /click/);
});

test('zoom: non-string non-true values rejected', () => {
  assert.ok(!validateSteps([{ zoom: 5 }]).ok);
  assert.ok(!validateSteps([{ zoom: '' }]).ok);
  assert.ok(!validateSteps([{ click: '.a', zoom: false }]).ok);
});

test('topbar/bottombar accept strings or false, reject empties and non-strings', () => {
  assert.equal(validateSteps([{ topbar: 'Checkout — Step 1', note: 'x', scrollTo: 'a' }]).ok, true);
  assert.equal(validateSteps([{ bottombar: 'build: webpack 92%', wait: 100 }]).ok, true);
  assert.equal(validateSteps([{ topbar: false, wait: 100 }]).ok, true);
  assert.equal(validateSteps([{ topbar: '' }]).ok, false);
  assert.equal(validateSteps([{ bottombar: 12 }]).ok, false);
});

test('fill: string form needs text; delay optional and numeric', () => {
  assert.ok(validateSteps([{ fill: 'input#iemail', text: 'dana@company.com' }]).ok);
  assert.ok(validateSteps([{ fill: 'input#iemail', text: 'dana@company.com', delay: 45 }]).ok);
  assert.ok(!validateSteps([{ fill: 'input#iemail' }]).ok);
  assert.ok(!validateSteps([{ fill: '' , text: 'x' }]).ok);
  assert.ok(!validateSteps([{ fill: 'input#iemail', text: 'x', delay: -5 }]).ok);
  assert.ok(!validateSteps([{ fill: 'input#iemail', text: 'x', delay: 'slow' }]).ok);
});

test('fill: object form {sel, value} accepted, missing parts rejected', () => {
  assert.ok(validateSteps([{ fill: { sel: '#iname', value: 'Dana Reeves' } }]).ok);
  assert.ok(!validateSteps([{ fill: { sel: '#iname' } }]).ok);
  assert.ok(!validateSteps([{ fill: { value: 'Dana' } }]).ok);
  assert.ok(!validateSteps([{ fill: 12 }]).ok);
});

test('text/delay only ride a fill step', () => {
  assert.ok(!validateSteps([{ text: 'lonely' }]).ok);
  assert.ok(!validateSteps([{ delay: 45, click: '.a' }]).ok);
});

test('select: string form needs option; object form {sel, value}', () => {
  assert.ok(validateSteps([{ select: 'select#region', option: 'São Paulo' }]).ok);
  assert.ok(validateSteps([{ select: { sel: '#region', value: 'São Paulo' } }]).ok);
  assert.ok(!validateSteps([{ select: 'select#region' }]).ok);
  assert.ok(!validateSteps([{ select: { sel: '#region' } }]).ok);
  assert.ok(!validateSteps([{ select: '' , option: 'x' }]).ok);
  assert.ok(!validateSteps([{ option: 'São Paulo' }]).ok);
});

test('camera: selector, "out", object form accepted; junk rejected', () => {
  assert.ok(validateSteps([{ camera: '.stats' }]).ok);
  assert.ok(validateSteps([{ camera: 'out' }]).ok);
  assert.ok(validateSteps([{ camera: { sel: '.invite' } }]).ok);
  assert.ok(validateSteps([{ camera: { sel: '.stats', zoom: 1.4 } }]).ok);
  assert.ok(!validateSteps([{ camera: '' }]).ok);
  assert.ok(!validateSteps([{ camera: {} }]).ok);
  assert.ok(!validateSteps([{ camera: 7 }]).ok);
  assert.ok(!validateSteps([{ camera: { sel: '.stats', zoom: 5 } }]).ok);
});

test('numeric zoom only rides camera, bounded (1, 3]', () => {
  assert.ok(validateSteps([{ camera: '.stats', zoom: 1.4 }]).ok);
  assert.ok(validateSteps([{ camera: '.stats', zoom: 3 }]).ok);
  assert.ok(!validateSteps([{ zoom: 1.4 }]).ok);
  assert.ok(!validateSteps([{ camera: '.stats', zoom: 1 }]).ok);
  assert.ok(!validateSteps([{ camera: '.stats', zoom: 3.5 }]).ok);
  assert.ok(!validateSteps([{ camera: '.stats', zoom: '.other' }]).ok);
  assert.ok(!validateSteps([{ camera: 'out', zoom: 1.4 }]).ok);
});

test('fillSpec/selectSpec/cameraSpec normalize both shapes', () => {
  assert.deepEqual(fillSpec({ fill: '#iemail', text: 'a@b.com' }), { sel: '#iemail', text: 'a@b.com', delay: 45 });
  assert.deepEqual(fillSpec({ fill: '#iemail', text: 'a@b.com', delay: 80 }).delay, 80);
  assert.deepEqual(fillSpec({ fill: { sel: '#iname', value: 'Dana' } }), { sel: '#iname', text: 'Dana', delay: 45 });
  assert.equal(fillSpec({ click: '.a' }), null);
  assert.deepEqual(selectSpec({ select: '#region', option: 'São Paulo' }), { sel: '#region', option: 'São Paulo' });
  assert.deepEqual(selectSpec({ select: { sel: '#region', value: 'São Paulo' } }), { sel: '#region', option: 'São Paulo' });
  assert.equal(selectSpec({}), null);
  assert.deepEqual(cameraSpec({ camera: 'out' }), { out: true });
  assert.deepEqual(cameraSpec({ camera: '.stats', zoom: 1.4 }), { sel: '.stats', zoom: 1.4 });
  assert.deepEqual(cameraSpec({ camera: { sel: '.stats', zoom: 1.4 } }), { sel: '.stats', zoom: 1.4 });
  assert.deepEqual(cameraSpec({ camera: { sel: '.invite' } }), { sel: '.invite', zoom: 0 });
  assert.equal(cameraSpec({ zoom: '.sel' }), null);
});

test('dwellMs: floor 4500 survives fast pace on short text', () => {
  assert.equal(dwellMs('Invite sent', 0.55), 4500);
  assert.equal(dwellMs('Invite sent', 1), 4500);
  assert.equal(dwellMs('', 1), 4500);
});

test('dwellMs: 20-word sentence reads at 7500ms', () => {
  const t = Array.from({ length: 20 }, (_, i) => 'w' + i).join(' ');
  assert.equal(dwellMs(t, 1), 7500);
  assert.equal(dwellMs(t, 0.55), 4500);
});

test('dwellMs: capped at 12000 no matter the wall of text', () => {
  const t = Array.from({ length: 80 }, (_, i) => 'w' + i).join(' ');
  assert.equal(dwellMs(t, 1), 12000);
});

import { validateBatch, TAKE_KEYS, stepLabel, parse, looksLikeHostCsv } from '../rec.mjs';

test('validateBatch: good takes normalized with CLI defaults; mp4/keepWebm/sheet true derive from out', () => {
  const r = validateBatch(
    [{ steps: [{ scrollTo: '.a', note: 'hi' }], out: '/tmp/a.gif', mp4: true, keepWebm: true, sheet: true },
     { steps: [{ click: '.b' }], out: '/tmp/b.gif', url: 'file:///other.html', gifWidth: 320, sheet: '/tmp/custom.png' }],
    { url: 'file:///demo.html', width: 800, height: 1200, gifWidth: 460, fps: 18, pace: 'fast' });
  assert.ok(r.ok, r.errors.join('; '));
  assert.equal(r.takes[0].url, 'file:///demo.html');
  assert.equal(r.takes[0].width, 800);
  assert.equal(r.takes[0].gifWidth, 460);
  assert.equal(r.takes[0].mp4, '/tmp/a.mp4');
  assert.equal(r.takes[0].keepWebm, '/tmp/a.webm');
  assert.equal(r.takes[0].pace, 'fast');
  // sheet is in TAKE_KEYS — it must be propagated (it was silently dropped before),
  // true derives <out>.png like mp4, an explicit path passes through, absent -> null
  assert.equal(r.takes[0].sheet, '/tmp/a.png');
  assert.equal(r.takes[1].url, 'file:///other.html');
  assert.equal(r.takes[1].gifWidth, 320);
  assert.equal(r.takes[1].mp4, null);
  assert.equal(r.takes[1].sheet, '/tmp/custom.png');
  // a take with no sheet key -> null (not undefined, not dropped)
  const noSheet = validateBatch([{ steps: [{ wait: 1 }], out: '/tmp/c.gif' }], { url: 'file:///d.html' }).takes[0];
  assert.equal(noSheet.sheet, null);
});

test('validateBatch: missing steps/out, bad step key inside a take, non-array all rejected', () => {
  assert.ok(!validateBatch({}).ok);
  assert.ok(!validateBatch([]).ok);
  const r = validateBatch(
    [{ out: 'x.gif' }, { steps: [{ clik: '.a' }], out: 'y.gif' }, { steps: [{ wait: 1 }] }],
    { url: 'file:///d.html' });
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => /take 1.*steps/.test(e)));
  assert.ok(r.errors.some((e) => /take 2.*clik/.test(e)));
  assert.ok(r.errors.some((e) => /take 3.*out/.test(e)));
});

test('validateBatch: url required somewhere; unknown take keys flagged', () => {
  const r = validateBatch([{ steps: [{ wait: 1 }], out: 'a.gif' }]);
  assert.ok(!r.ok && r.errors.some((e) => /url/.test(e)));
  const r2 = validateBatch([{ steps: [{ wait: 1 }], out: 'a.gif', url: 'file:///x', gifWdith: 9 }]);
  assert.ok(!r2.ok && r2.errors.some((e) => /gifWdith/.test(e)));
  assert.ok(TAKE_KEYS.has('keepWebm') && TAKE_KEYS.has('mp4'));
});

test('stepLabel: note wins, else first action key, else "step"', () => {
  assert.equal(stepLabel({ click: '.a', note: 'Open menu' }), 'Open menu');
  assert.equal(stepLabel({ fill: '#e', text: 'x' }), 'fill');
  assert.equal(stepLabel({}), 'step');
});

test('parse: mp4/keep-webm/batch/block-hosts flags', () => {
  const a = parse(['file:///d.html', '--steps', 's.json', '--mp4', 'o.mp4', '--keep-webm', 'o.webm', 'o.gif']);
  assert.equal(a.mp4, 'o.mp4');
  assert.equal(a.keepWebm, 'o.webm');
  assert.equal(a.out, 'o.gif');
  const b = parse(['--batch', 't.json', '--block-hosts', 'cdn.x.com,fonts.y.com']);
  assert.equal(b.batch, 't.json');
  assert.deepEqual(b.blockHosts, ['cdn.x.com', 'fonts.y.com']);
  const c = parse(['file:///d.html', '--steps', 's.json', '--block-hosts', 'o.gif']);
  assert.deepEqual(c.blockHosts, []);
  assert.equal(c.out, 'o.gif');
  assert.ok(looksLikeHostCsv('a.example.com'));
  assert.ok(!looksLikeHostCsv('--stamp'));
  assert.ok(!looksLikeHostCsv('path/to.thing'));
});

test('house rules: no literal control bytes in rec.mjs, demo path derivable', () => {
  const src = readFileSync(join(HERE, '..', 'rec.mjs'), 'latin1');
  assert.ok(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(src), 'literal control byte found in rec.mjs');
  assert.ok(existsSync(DEMO), 'bundled demo page missing at ' + DEMO);
});

import { padToRatio } from '../rec.mjs';

test('padToRatio: 16:9 default expr, custom ratio, free/invalid disable', () => {
  const p = padToRatio('16:9', '0xf1f5f9');
  assert.ok(p.includes("ih*16/9") && p.includes("iw*9/16") && p.includes('color=0xf1f5f9'));
  assert.ok(padToRatio('4:3', '0x000000').includes('ih*4/3'));
  assert.equal(padToRatio('free', '0x0'), '');
  assert.equal(padToRatio('wat', '0x0'), '');
  assert.equal(padToRatio('0:9', '0x0'), '');
});

test('take ratio/theme/accent normalize with 16:9 widescreen defaults', () => {
  const { ok, takes } = validateBatch([{ steps: [{ note: 'x' }], out: '/tmp/o.gif' }], { url: 'http://x/' });
  assert.ok(ok);
  assert.equal(takes[0].ratio, '16:9');
  assert.equal(takes[0].width, 1600);
  assert.equal(takes[0].height, 900);
  const bad = validateBatch([{ steps: [{ note: 'x' }], out: '/tmp/o.gif', ratio: 'nope' }], { url: 'http://x/' });
  assert.ok(bad.errors.some((e) => /ratio must be/.test(e)));
  assert.ok(TAKE_KEYS.has('ratio'));
});

import { deriveCaptureHeight } from '../rec.mjs';

test('deriveCaptureHeight: capture + lanes land exactly on the ratio', () => {
  assert.equal(deriveCaptureHeight(1600, '16:9', [], false), 900);
  assert.equal(deriveCaptureHeight(1600, '16:9', [{ topbar: 'Build' }], false), 856);
  assert.equal(deriveCaptureHeight(1600, '16:9', [{ topbar: 'Build' }, { bottombar: 'npm run deploy' }], false), 812);
  assert.equal(deriveCaptureHeight(1600, '16:9', [], true), 856);
  assert.equal(deriveCaptureHeight(1600, '16:9', [{ screen: 'Home' }], false), 856);
  assert.equal(deriveCaptureHeight(1600, 'free', [], false), 812);
  assert.equal(deriveCaptureHeight(1600, 'nope', [], false), 812);
  assert.equal(deriveCaptureHeight(1280, '16:9', [], false), 720);
  assert.equal(deriveCaptureHeight(1000, '1:1', [], false), 1000);
});

test('deriveCaptureHeight folds into batch normalization per take lanes', () => {
  const { takes } = validateBatch([
    { steps: [{ topbar: 'A' }, { bottombar: 'B' }], out: '/tmp/a.gif' },
    { steps: [{ note: 'x' }], out: '/tmp/b.gif', stamp: true },
    // explicit height that breaks the forced 16:9 is overridden to the ratio
    // height (no side bars) — see resolveCaptureHeight. width defaults to 1600,
    // no lanes -> 900.
    { steps: [{ note: 'x' }], out: '/tmp/c.gif', height: 700 },
    // ratio:free honors the explicit height.
    { steps: [{ note: 'x' }], out: '/tmp/d.gif', height: 700, ratio: 'free' },
  ], { url: 'http://x/' });
  assert.equal(takes[0].height, 812);
  assert.equal(takes[1].height, 856);
  assert.equal(takes[2].height, 900, 'off-ratio explicit height is forced to 16:9');
  assert.equal(takes[3].height, 700, 'ratio:free keeps the explicit height');
});

test('--offline parses; fps defaults to 15 offline unless explicit', async () => {
  const { parse, applyOfflineDefaults } = await import('../rec.mjs');
  const a = applyOfflineDefaults(parse(['file:///d.html', '--steps', 's.json', '--offline', 'o.gif']));
  assert.equal(a.offline, true);
  assert.equal(a.fps, 15);
  const b = applyOfflineDefaults(parse(['file:///d.html', '--steps', 's.json', '--offline', '--fps', '24', 'o.gif']));
  assert.equal(b.fps, 24);
  const c = applyOfflineDefaults(parse(['file:///d.html', '--steps', 's.json', 'o.gif']));
  assert.equal(c.offline, undefined);
  assert.equal(c.fps, 18);
});

test('hotHeadFor: fade-only, mark staggers, glossary items, click reaction', async () => {
  const { hotHeadFor } = await import('../rec.mjs');
  assert.equal(hotHeadFor({ note: 'x' }), 400);
  assert.equal(hotHeadFor({ note: 'x', fade: 800 }), 800);
  // 3 badges: 250 + 2*380 + 450 = 1460
  assert.equal(hotHeadFor({ marks: [{ sel: '.a', badge: 1 }, { sel: '.b', badge: 2 }, { sel: '.c', badge: 3 }] }), 1460);
  // explicit glossary items at custom stagger: 250 + 1*100 + 450 = 800
  assert.equal(hotHeadFor({ glossary: { items: [{ badge: 1, text: 'a' }, { badge: 2, text: 'b' }], stagger: 100 } }), 800);
  // click reaction floor
  assert.equal(hotHeadFor({ click: '#deploy' }), 900);
  assert.ok(hotHeadFor({ click: '#x', marks: [{ sel: '.a', badge: 1 }, { sel: '.b', badge: 2 }, { sel: '.c', badge: 3 }] }) === 1460);
});

test('camTransitionPlan: commits the FROM pose (transition:none + reflow) before arming the TO transition', async () => {
  const { camTransitionPlan } = await import('../rec.mjs');
  const from = { s: 1, tx: 0, ty: 0 };
  const to = { s: 3, tx: -432, ty: -184 };
  const plan = camTransitionPlan(from, to, 600);
  // ordered ops: from-pose with transition none, a reflow, then the to-pose with the timed transition
  assert.ok(Array.isArray(plan) && plan.length >= 3, 'plan is an ordered op list');
  const first = plan[0];
  assert.equal(first.transition, 'none', 'from-pose is committed with transition:none');
  assert.match(first.transform, /scale\(1\)/, 'from-pose carries the FROM scale');
  assert.match(first.transform, /translate\(0px,\s*0px\)/, 'from-pose carries the FROM translate');
  assert.ok(plan.some((o) => o.reflow), 'a reflow locks the from-value');
  const last = plan[plan.length - 1];
  assert.match(last.transition, /transform 600ms cubic-bezier/, 'to-pose arms the timed transition');
  assert.match(last.transform, /scale\(3\)/, 'to-pose carries the TO scale');
  assert.match(last.transform, /translate\(-432px,\s*-184px\)/, 'to-pose carries the TO translate');
  // the reflow must sit BETWEEN the from commit and the to arm
  const iReflow = plan.findIndex((o) => o.reflow);
  const iTo = plan.length - 1;
  assert.ok(iReflow > 0 && iReflow < iTo, 'reflow is between from-commit and to-arm');
});

test('clampRelease: reconciles transform to __cam then clears the residual transition', async () => {
  const { clampRelease } = await import('../rec.mjs');
  const cam = { s: 3, tx: -1056, ty: -1447 };
  const plan = clampRelease(cam);
  assert.ok(Array.isArray(plan) && plan.length >= 2, 'release is an ordered op list');
  const reassert = plan.find((o) => o.transform);
  assert.match(reassert.transform, /scale\(3\)/, 'transform reasserted from __cam scale');
  assert.match(reassert.transform, /translate\(-1056px,\s*-1447px\)/, 'transform reasserted from __cam translate');
  assert.equal(reassert.transition, 'none', 'reassert uses transition:none (instant)');
  assert.ok(plan.some((o) => o.reflow), 'reflow locks the reasserted pose');
  const last = plan[plan.length - 1];
  assert.equal(last.transition, '', 'ends with transition cleared — no residual none for __camTo to inherit');
});

test('resolveCaptureHeight: a forced ratio ALWAYS wins — explicit height that breaks 16:9 is overridden (no side bars)', async () => {
  const { resolveCaptureHeight } = await import('../rec.mjs');
  // 1440x900 = 1.6:1; under 16:9 the capture must be 1440x810 (derived), NOT 900 (which would pad to bars)
  const r = resolveCaptureHeight(1440, 900, '16:9', [], false);
  assert.equal(r.height, 810, '16:9 height for width 1440 is 810');
  assert.ok(r.warn, 'warns that the explicit height was overridden to honor the ratio');
});

test('resolveCaptureHeight: explicit height matching the ratio is kept silently', async () => {
  const { resolveCaptureHeight } = await import('../rec.mjs');
  const r = resolveCaptureHeight(1600, 900, '16:9', [], false); // 1600x900 IS 16:9
  assert.equal(r.height, 900);
  assert.ok(!r.warn, 'no warning when the explicit height already matches the ratio');
});

test('resolveCaptureHeight: null height derives the ratio height (the good default path)', async () => {
  const { resolveCaptureHeight } = await import('../rec.mjs');
  const r = resolveCaptureHeight(1600, null, '16:9', [], false);
  assert.equal(r.height, 900);
  assert.ok(!r.warn);
});

test('resolveCaptureHeight: ratio "free" honors explicit height (no forcing)', async () => {
  const { resolveCaptureHeight } = await import('../rec.mjs');
  const r = resolveCaptureHeight(1440, 900, 'free', [], false);
  assert.equal(r.height, 900, 'free ratio keeps the explicit height');
  assert.ok(!r.warn);
});

test('resolveCaptureHeight: forced ratio accounts for letterbox lanes', async () => {
  const { resolveCaptureHeight } = await import('../rec.mjs');
  // one lane (screen) under 16:9 at 1600 => 856 page + 44 lane = 900 total
  const r = resolveCaptureHeight(1600, 900, '16:9', [{ screen: 'X' }], false);
  assert.equal(r.height, 856);
});

test('autoAnnotateStep: a bare click gets a rect + note derived from the element label', async () => {
  const { autoAnnotateStep } = await import('../rec.mjs');
  const out = autoAnnotateStep({ click: '#deploy' }, 'Deploy to production');
  assert.equal(out.rect, '#deploy', 'rect anchors on the clicked element');
  assert.equal(out.note, 'Deploy to production', 'note is the element label');
});

test('autoAnnotateStep: respects an author-declared note/rect — never overrides', async () => {
  const { autoAnnotateStep } = await import('../rec.mjs');
  const out = autoAnnotateStep({ click: '#deploy', note: 'Ship it' }, 'Deploy to production');
  assert.equal(out.note, 'Ship it', 'author note wins');
  assert.ok(!('rect' in out) || out.rect === '#deploy', 'no clobber of intent');
  const out2 = autoAnnotateStep({ click: '#deploy', rect: '.card' }, 'Deploy');
  assert.equal(out2.rect, '.card', 'author rect wins — auto adds nothing visual');
});

test('autoAnnotateStep: fill and select are annotated from their selector', async () => {
  const { autoAnnotateStep } = await import('../rec.mjs');
  const f = autoAnnotateStep({ fill: '#iemail', text: 'a@b.com' }, 'Work email');
  assert.equal(f.rect, '#iemail');
  assert.equal(f.note, 'Work email');
  const s = autoAnnotateStep({ select: '#region', option: 'São Paulo' }, 'Region');
  assert.equal(s.rect, '#region');
});

test('autoAnnotateStep: non-interaction steps are untouched', async () => {
  const { autoAnnotateStep } = await import('../rec.mjs');
  const cam = { camera: '.hero', zoom: 1.3 };
  assert.deepEqual(autoAnnotateStep(cam, null), cam);
  const note = { note: 'just a caption', wait: 2000 };
  assert.deepEqual(autoAnnotateStep(note, 'x'), note);
});

test('autoAnnotateStep: no label means no note (still adds rect for the outline)', async () => {
  const { autoAnnotateStep } = await import('../rec.mjs');
  const out = autoAnnotateStep({ click: '#x' }, '');
  assert.equal(out.rect, '#x', 'outline still drawn');
  assert.ok(!out.note, 'no empty note');
});

test('spotlight: a documented step key, accepted as selector or true', () => {
  assert.ok(STEP_KEYS.has('spotlight'));
  assert.ok(validateSteps([{ spotlight: '#deploy', note: 'focus' }]).ok);
  assert.ok(validateSteps([{ click: '#deploy', spotlight: true }]).ok);
});

test('autoAnnotateStep: a step that already declares spotlight is left alone', async () => {
  const { autoAnnotateStep } = await import('../rec.mjs');
  const out = autoAnnotateStep({ click: '#deploy', spotlight: true }, 'Deploy');
  assert.equal(out.spotlight, true);
  assert.ok(!('rect' in out), 'auto adds no rect when spotlight is the author visual');
  assert.ok(!('note' in out), 'auto adds no note either');
});

test('offlineMotionConflicts flags confetti and sparkline, ignores flash/static', () => {
  const steps = [
    { wait: 300 },
    { confetti: '.stat:nth-child(1)' },
    { flash: true },
    { sparkline: '.stat:nth-child(2)' },
    { note: 'x', rect: '.card' },
  ];
  const hits = offlineMotionConflicts(steps);
  assert.deepEqual(hits, [
    { step: 2, key: 'confetti' },
    { step: 4, key: 'sparkline' },
  ]);
});

test('offlineMotionConflicts is empty for a static/text-only reel', () => {
  const steps = [{ wait: 400 }, { note: 'hello' }, { rect: '.card' }, { flash: '#16a34a' }];
  assert.equal(offlineMotionConflicts(steps).length, 0);
});

test('every OFFLINE_INCOMPATIBLE key is a real step key', () => {
  for (const k of OFFLINE_INCOMPATIBLE) assert.ok(STEP_KEYS.has(k), k + ' must be a known step key');
});

import { auditScenes, stepAnchors, stepCamera } from '../rec.mjs';

test('stepAnchors pulls selectors, skips bare-true and color literals', () => {
  assert.deepEqual(stepAnchors({ highlight: '#x', note: 'hi' }), ['#x']);
  assert.deepEqual(stepAnchors({ flash: '#16a34a' }), []);          // color, not selector
  assert.deepEqual(stepAnchors({ flash: 'red' }), []);              // NAMED color — not a selector either
  assert.deepEqual(stepAnchors({ flash: 'rgb(1,2,3)' }), []);       // rgb() color — full-screen wash, never anchors
  assert.deepEqual(stepAnchors({ confetti: 'true' }), []);          // bare true
  assert.deepEqual(stepAnchors({ inset: { sel: '.s', zoom: 2 } }), ['.s']);
  assert.deepEqual(stepAnchors({ trail: { from: '#a', to: '#b' } }), ['#a', '#b']);
  assert.deepEqual(stepAnchors({ marks: [{ sel: '.a' }, { sel: '.b' }] }), ['.a', '.b']);
  // arrow:"top"/"bottom" is an EDGE arrow (not anchored to an element) — it must
  // not become a selector, or the safeguard querySelector("top") false-rejects a
  // valid roster. A real arrow selector is still pulled.
  assert.deepEqual(stepAnchors({ arrow: 'top' }), []);
  assert.deepEqual(stepAnchors({ arrow: 'bottom' }), []);
  assert.deepEqual(stepAnchors({ arrow: '#cta' }), ['#cta']);
  assert.deepEqual(stepAnchors({ arrow: 'top', rect: '#x' }), ['#x']);
});

test('stepCamera reads selector / out / object form / none', () => {
  assert.equal(stepCamera({ camera: '#m' }), '#m');
  assert.equal(stepCamera({ camera: 'out' }), 'out');
  assert.equal(stepCamera({ camera: { sel: '.x', zoom: 2 } }), '.x');
  assert.equal(stepCamera({ note: 'x' }), null);
});

test('auditScenes flags a deploy-state primitive with no prior deploy click', () => {
  const w = auditScenes([
    { camera: { sel: '#pipeline' } },
    { checkmark: '#stage-deploy .badge' },
  ]).warnings;
  assert.equal(w.length, 1);
  assert.equal(w[0].kind, 'arbitrary-primitive');
});

test('auditScenes clears once the deploy click fired earlier (state persists across scenes)', () => {
  const w = auditScenes([
    { camera: { sel: '#deploy-panel' } },
    { click: '#deploy' },
    { camera: 'out' },
    { camera: { sel: '#stage-deploy' } },
    { checkmark: '#stage-deploy .badge' },
    { flash: '#stage-deploy .chip' },
  ]).warnings;
  assert.equal(w.length, 0, 'deploy clicked earlier legitimizes later payoff primitives');
});

test('auditScenes never flags always-on primitives (pulse/kenburns)', () => {
  const w = auditScenes([
    { camera: { sel: 'header' } },
    { pulse: '#live-dot' },
    { kenburns: '.artifact' },
  ]).warnings;
  assert.equal(w.length, 0);
});

import { auditRosterLive } from '../rec.mjs';

test('auditRosterLive gates a MISSING scrollTo target (silent-wrong-scene)', async () => {
  // a scroll target that resolves to no element renders a scene that never moves,
  // with no warning — only --dry caught it before. Now the render gate does too.
  // existence-only: a target below the fold (off-screen but PRESENT) must pass.
  const bridge = {
    measure: async (sel) => (sel === '#gone' ? null : { visible: true, w: 100, h: 30, cx: 50, cy: 9000 }),
    click: async () => {}, fill: async () => {}, select: async () => {}, settle: async () => {},
  };
  const miss = (await auditRosterLive([{ scrollTo: '#gone' }], bridge)).errors;
  assert.equal(miss.length, 1);
  assert.equal(miss[0].kind, 'missing');
  assert.match(miss[0].message, /scroll target/);
  // present-but-below-fold scroll target: no error (scrolling to it is the point)
  const ok = (await auditRosterLive([{ scrollTo: '#far-down' }], bridge)).errors;
  assert.equal(ok.length, 0);
  // scrollIn object form is gated too
  const miss2 = (await auditRosterLive([{ scrollIn: { sel: '#gone' } }], bridge)).errors;
  assert.equal(miss2.length, 1);
  // zoom-as-string is a camera frame (view-mover) — same existence gate, same
  // existence-only rule (framing a below-fold element is valid)
  const zmiss = (await auditRosterLive([{ zoom: '#gone' }], bridge)).errors;
  assert.equal(zmiss.length, 1);
  assert.match(zmiss[0].message, /zoom target/);
  assert.equal((await auditRosterLive([{ zoom: '#far-down' }], bridge)).errors.length, 0);
  assert.equal((await auditRosterLive([{ zoom: 'out' }], bridge)).errors.length, 0); // "out" is not a selector
});
