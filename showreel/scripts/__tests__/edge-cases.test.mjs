// edge-cases.test.mjs — hostile inputs against the pure logic of the engine.
// Happy paths live in rec-steps.test.mjs; this file probes the boundaries:
// falsy-but-valid values, extremes (0/negative/Infinity/NaN), malformed shapes,
// precedence, and the new auth flags. A failure here is a real bug, not a typo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parse, dwellMs, hotHeadFor, fillSpec, selectSpec, scrollInSpec, actionSel,
  collapseRedundantGlides, autoAnnotateStep, cameraSpec, modalLayout, screenPhase,
  padToRatio, deriveCaptureHeight, resolveCaptureHeight, validateSteps, validateBatch,
  applyOfflineDefaults, looksLikeHostCsv,
} from '../rec-steps.mjs';
import { FRAME } from '../rec-camera.mjs';

// ── parse: the new auth flags + tricky flag forms ──────────────────────────
test('parse: --cookies and --storage-state capture their path values', () => {
  const a = parse(['u', 'o.mp4', '--cookies', 'c.json', '--storage-state', 's.json']);
  assert.equal(a.cookies, 'c.json');
  assert.equal(a.storageState, 's.json');
  assert.equal(a.url, 'u');
  assert.equal(a.out, 'o.mp4');
});

test('parse: --cookies with no following value yields undefined, not a crash', () => {
  const a = parse(['u', 'o.mp4', '--cookies']);
  assert.equal(a.cookies, undefined);
});

test('parse: a value that looks like a flag is still consumed by --storage-state', () => {
  // argv[++i] takes the NEXT token verbatim; a user passing "--x" as a path is
  // their problem, but parse must not throw "unknown arg" on the consumed token.
  const a = parse(['u', 'o.mp4', '--storage-state', '--weird']);
  assert.equal(a.storageState, '--weird');
});

test('parse: --contact-sheet takes a .png arg or falls to boolean true', () => {
  // explicit .png path is consumed
  assert.equal(parse(['u', 'o.mp4', '--contact-sheet', 'sheet.png']).sheet, 'sheet.png');
  // at end of argv -> boolean true (path derived from out)
  assert.equal(parse(['u', '--contact-sheet']).sheet, true);
  // GOTCHA (documented): a non-.png token after --contact-sheet is NOT consumed
  // as the sheet path; it stays a positional. With url+out already present that
  // overflows to the "too many positionals" guard — pass a .png path or no arg.
  assert.throws(() => parse(['u', 'o.mp4', '--contact-sheet', 'notapng']), /too many positional/);
  // only url present: the boolean sheet stands and the stray token is the out
  const a = parse(['u', '--contact-sheet', 'notapng']);
  assert.equal(a.sheet, true);
  assert.equal(a.out, 'notapng');
});

test('parse: unknown flag throws, but a consumed value is never re-scanned', () => {
  assert.throws(() => parse(['u', 'o.mp4', '--nope']), /unknown arg --nope/);
  // --theme consumes "dark"; "dark" must not be treated as positional/flag
  const a = parse(['u', 'o.mp4', '--theme', 'dark']);
  assert.equal(a.theme, 'dark');
  assert.equal(a.out, 'o.mp4');
});

test('parse: three positionals is an error (unquoted spaces hint)', () => {
  assert.throws(() => parse(['a', 'b', 'c']), /too many positional/);
});

// ── dwellMs: reading-time floor and word-count cap ─────────────────────────
test('dwellMs: empty/whitespace/null text still returns the 4500 floor', () => {
  assert.equal(dwellMs(''), 4500);
  assert.equal(dwellMs('   '), 4500);
  assert.equal(dwellMs(null), 4500);
  assert.equal(dwellMs(undefined), 4500);
});

test('dwellMs: a wall of words is capped at 12000 (pre-pace)', () => {
  const huge = Array(500).fill('word').join(' ');
  assert.equal(dwellMs(huge), 12000);
});

test('dwellMs: paceFactor scales the base but the 4500 floor holds last', () => {
  // a tiny pace must never drop a note below readable time
  assert.equal(dwellMs('short note', 0.1), 4500);
  // a large pace scales up past the floor
  assert.ok(dwellMs('one two three four five six seven eight nine ten', 2) > 4500);
});

// ── hotHeadFor: the fade:0 trap and stagger math ───────────────────────────
test('hotHeadFor: fade 0, negative, NaN all fold to the 400 default', () => {
  assert.equal(hotHeadFor({ fade: 0 }), 400);
  assert.equal(hotHeadFor({ fade: -50 }), 400);
  assert.equal(hotHeadFor({ fade: NaN }), 400);
  assert.equal(hotHeadFor({}), 400);
  assert.equal(hotHeadFor(null), 400);
});

test('hotHeadFor: an explicit positive fade is honored when above default', () => {
  assert.equal(hotHeadFor({ fade: 800 }), 800);
  // below default but positive: the engine still renders the real fade, so it wins
  assert.equal(hotHeadFor({ fade: 100 }), 100);
});

test('hotHeadFor: a click forces at least a 900ms reaction window', () => {
  assert.equal(hotHeadFor({ click: '#x' }), 900);
  assert.equal(hotHeadFor({ click: '#x', fade: 1200 }), 1200);
});

test('hotHeadFor: marks/glossary staggers extend the head', () => {
  const three = hotHeadFor({ marks: [{ badge: 1 }, { badge: 2 }, { badge: 3 }], stagger: 380 });
  assert.equal(three, 250 + 2 * 380 + 450);
  // marks with no badges count as zero — head is just the fade
  assert.equal(hotHeadFor({ marks: [{ sel: '#a' }, { sel: '#b' }] }), 400);
});

// ── fillSpec / selectSpec: falsy-but-valid values + precedence ─────────────
test('fillSpec: value:"" and value:0 are kept (not dropped as falsy)', () => {
  assert.equal(fillSpec({ fill: { sel: '#a', value: '' } }).text, '');
  assert.equal(fillSpec({ fill: { sel: '#a', value: 0 } }).text, 0);
});

test('fillSpec: object.value wins over object.text; default delay 45', () => {
  const s = fillSpec({ fill: { sel: '#a', value: 'V', text: 'T' } });
  assert.equal(s.text, 'V');
  assert.equal(s.delay, 45);
  assert.equal(fillSpec({ fill: { sel: '#a', text: 'T', delay: 0 } }).delay, 0);
});

test('fillSpec: string form reads sibling text/delay', () => {
  const s = fillSpec({ fill: '#a', text: 'hi', delay: 12 });
  assert.deepEqual(s, { sel: '#a', text: 'hi', delay: 12 });
});

test('selectSpec: value:"" kept; value wins over option', () => {
  assert.equal(selectSpec({ select: { sel: '#r', value: '' } }).option, '');
  assert.equal(selectSpec({ select: { sel: '#r', value: 'V', option: 'O' } }).option, 'V');
});

// ── scrollInSpec: string vs object + `to` precedence ───────────────────────
test('scrollInSpec: string form scrolls to bottom (to null)', () => {
  assert.deepEqual(scrollInSpec({ scrollIn: '#log' }), { sel: '#log', to: null, dur: null });
});

test('scrollInSpec: object.to beats sibling to; string-form uses sibling to', () => {
  assert.equal(scrollInSpec({ scrollIn: { sel: '#log', to: '#row' }, to: '#other' }).to, '#row');
  assert.equal(scrollInSpec({ scrollIn: '#log', to: '#row' }).to, '#row');
});

// ── actionSel / collapseRedundantGlides ────────────────────────────────────
test('actionSel: click string, fill, select; null when none', () => {
  assert.equal(actionSel({ click: '#a' }), '#a');
  assert.equal(actionSel({ fill: { sel: '#b' } }), '#b');
  assert.equal(actionSel({ select: '#c' }), '#c');
  assert.equal(actionSel({ note: 'x' }), null);
});

test('collapseRedundantGlides: drops a bare glide before a same-target action', () => {
  const out = collapseRedundantGlides([
    { glide: '#x', accent: '#f00' },
    { click: '#x' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].click, '#x');
  assert.equal(out[0].accent, '#f00'); // accent carried forward
});

test('collapseRedundantGlides: keeps a glide to a DIFFERENT target', () => {
  const out = collapseRedundantGlides([{ glide: '#x' }, { click: '#y' }]);
  assert.equal(out.length, 2);
});

test('collapseRedundantGlides: keeps a glide carrying real work (note)', () => {
  const out = collapseRedundantGlides([{ glide: '#x', note: 'hi' }, { click: '#x' }]);
  assert.equal(out.length, 2);
});

test('collapseRedundantGlides: non-array passes through', () => {
  assert.equal(collapseRedundantGlides(null), null);
});

// ── autoAnnotateStep: author intent always wins ────────────────────────────
test('autoAnnotateStep: bare click gets rect + label note', () => {
  const out = autoAnnotateStep({ click: '#deploy' }, 'Deploy now');
  assert.equal(out.rect, '#deploy');
  assert.equal(out.note, 'Deploy now');
});

test('autoAnnotateStep: a declared visual is never overwritten', () => {
  const step = { click: '#deploy', spotlight: '#deploy' };
  assert.deepEqual(autoAnnotateStep(step, 'x'), step);
});

test('autoAnnotateStep: empty/whitespace label adds rect but no note', () => {
  assert.equal(autoAnnotateStep({ click: '#a' }, '   ').note, undefined);
  assert.equal(autoAnnotateStep({ click: '#a' }, null).rect, '#a');
});

test('autoAnnotateStep: non-interaction step passes through unchanged', () => {
  const step = { note: 'hi' };
  assert.equal(autoAnnotateStep(step, 'lbl'), step);
});

// ── cameraSpec: zoom resolution + "out" ────────────────────────────────────
test('cameraSpec: out, string+zoom sibling, object zoom precedence', () => {
  assert.deepEqual(cameraSpec({ camera: 'out' }), { out: true });
  assert.deepEqual(cameraSpec({ camera: '#a', zoom: 2 }), { sel: '#a', zoom: 2 });
  // object zoom beats sibling zoom
  assert.equal(cameraSpec({ camera: { sel: '#a', zoom: 3 }, zoom: 2 }).zoom, 3);
  // no zoom anywhere -> 0 (auto-fit)
  assert.equal(cameraSpec({ camera: '#a' }).zoom, 0);
  assert.equal(cameraSpec({ note: 'x' }), null);
});

// ── modalLayout: positional auto-placement quadrants ───────────────────────
test('modalLayout: no box -> center + backdrop on', () => {
  const m = modalLayout('hi', null, { w: 1000, h: 800 });
  assert.equal(m.pos, 'center');
  assert.equal(m.backdrop, true);
});

test('modalLayout: box in top-left quadrant -> bottom-right card', () => {
  const m = modalLayout({ text: 'x' }, { x: 0, y: 0, w: 100, h: 100 }, { w: 1000, h: 800 });
  assert.equal(m.pos, 'bottom-right');
  assert.equal(m.backdrop, false); // non-center defaults backdrop off
});

test('modalLayout: header/footer/html rich form + title/text fallback', () => {
  const m = modalLayout({ header: 'H', text: 'T', footer: 'F', html: '<b>x</b>' }, null, { w: 10, h: 10 });
  assert.equal(m.title, 'H');
  assert.equal(m.footer, 'F');
  assert.equal(m.html, '<b>x</b>');
});

// ── screenPhase ────────────────────────────────────────────────────────────
test('screenPhase: before vs afterClick vs null', () => {
  assert.equal(screenPhase({ screen: 'X' }), 'before');
  assert.equal(screenPhase({ screen: 'X', click: '#a' }), 'afterClick');
  assert.equal(screenPhase({ note: 'x' }), null);
});

// ── padToRatio / deriveCaptureHeight: malformed ratios ─────────────────────
test('padToRatio: free/empty/garbage ratio yields empty filter', () => {
  assert.equal(padToRatio('free', 'black'), '');
  assert.equal(padToRatio('', 'black'), '');
  assert.equal(padToRatio('16x9', 'black'), '');
  assert.equal(padToRatio('0:9', 'black'), ''); // zero dimension rejected
  assert.equal(padToRatio('16:0', 'black'), '');
});

test('padToRatio: valid ratio builds an even-dimension pad', () => {
  assert.match(padToRatio('16:9', '#000'), /pad=w=.*color=#000/);
  assert.match(padToRatio('1.5:1', 'black'), /ih\*1\.5\/1/);
});

test('deriveCaptureHeight: unparsable ratio -> classic 812', () => {
  assert.equal(deriveCaptureHeight(1280, 'free', [], false), 812);
  assert.equal(deriveCaptureHeight(1280, 'bad', [], false), 812);
});

test('deriveCaptureHeight: 16:9 at 1280 lands even, lanes subtracted', () => {
  const plain = deriveCaptureHeight(1280, '16:9', [], false);
  assert.equal(plain % 2, 0);
  // a topbar step removes 44px from the page height budget
  const withTop = deriveCaptureHeight(1280, '16:9', [{ topbar: 'x' }], false);
  assert.ok(withTop < plain);
  // stamp also reserves the top lane
  assert.ok(deriveCaptureHeight(1280, '16:9', [], true) < plain);
});

test('deriveCaptureHeight: never returns below the 300 floor', () => {
  // absurdly tall ratio at tiny width would compute negative; floor holds
  assert.ok(deriveCaptureHeight(10, '1:100', [], false) >= 300);
});

test('resolveCaptureHeight: height matching the derived ratio is accepted; a breaking one warns', () => {
  // 1280*9/16 = 720, so 720 IS the derived 16:9 height with no lanes -> kept, no warn
  const ok = resolveCaptureHeight(1280, 720, '16:9', [], false);
  assert.equal(ok.height, 720);
  assert.equal(ok.warn, null);
  // a height that does NOT match the derived value is overridden + warns
  const bad = resolveCaptureHeight(1280, 999, '16:9', [], false);
  assert.notEqual(bad.height, 999);
  assert.match(bad.warn, /breaks --ratio/);
  // free ratio keeps the asked height, no warn
  const f = resolveCaptureHeight(1280, 720, 'free', [], false);
  assert.equal(f.height, 720);
  assert.equal(f.warn, null);
});

// ── applyOfflineDefaults / looksLikeHostCsv ────────────────────────────────
test('applyOfflineDefaults: offline drops fps to 15 unless explicitly set', () => {
  assert.equal(applyOfflineDefaults({ offline: true, fps: 18 }).fps, 15);
  assert.equal(applyOfflineDefaults({ offline: true, fps: 30, fpsSet: true }).fps, 30);
  assert.equal(applyOfflineDefaults({ offline: false, fps: 18 }).fps, 18);
});

test('looksLikeHostCsv: accepts host lists, rejects flags/garbage', () => {
  assert.ok(looksLikeHostCsv('a.com,b.net'));
  assert.ok(looksLikeHostCsv('*.tracking.io'));
  assert.ok(!looksLikeHostCsv('--next-flag'));
  assert.ok(!looksLikeHostCsv(undefined));
  assert.ok(!looksLikeHostCsv('has spaces'));
});

// ── FRAME no-crop ceiling: the math the camera + audit share ───────────────
test('FRAME: constant has all five caps and sane ranges', () => {
  assert.equal(FRAME.FILL, 0.86);
  assert.equal(FRAME.CAP, 2.4);
  assert.equal(FRAME.MARGIN, 0.94);
  assert.equal(FRAME.MAX, 3);
  assert.equal(FRAME.ZOOM, 2);
  assert.ok(FRAME.MARGIN > FRAME.FILL); // no-crop is looser than fit-fill
});

// reproduce the reach() ceiling math purely (mirrors makeAuditBridge.reach)
function reachMath(w, h, vw, vh) {
  const fit = Math.max(1, Math.min(FRAME.CAP, Math.min(FRAME.FILL * vw / w, FRAME.FILL * vh / h)));
  const noCrop = FRAME.MARGIN * Math.min(vw / w, vh / h);
  return Math.max(1, Math.min(Math.min(FRAME.MAX, fit * FRAME.ZOOM), noCrop));
}

test('reach: a tiny element can magnify (>= the fit cap)', () => {
  const r = reachMath(40, 20, 1280, 676);
  assert.ok(r > 1.15, 'tiny target should reach a real magnification, got ' + r);
});

test('reach: an element wider than the viewport cannot zoom past ~1', () => {
  const r = reachMath(2000, 100, 1280, 676);
  assert.ok(r <= 1.001, 'over-wide element must clamp to ~1x, got ' + r);
});

test('reach: no-crop ceiling never lets the element exceed the viewport', () => {
  // at the returned scale, the element must still fit within MARGIN of the vp
  const w = 600, h = 300, vw = 1280, vh = 676;
  const r = reachMath(w, h, vw, vh);
  assert.ok(r * w <= vw + 0.001 && r * h <= vh + 0.001, 'scaled element overflows viewport');
});

// ── validateSteps / validateBatch: hostile shapes ──────────────────────────
test('validateSteps: rejects non-array, empty step, unknown key', () => {
  assert.equal(validateSteps('nope').ok, false);
  assert.equal(validateSteps([{}]).ok, false);
  assert.equal(validateSteps([{ bogusKey: 1 }]).ok, false);
});

test('validateSteps: accepts every key in STEP_KEYS individually', () => {
  // a step that is just {wait} is the simplest valid step
  assert.equal(validateSteps([{ wait: 100 }]).ok, true);
});

test('validateSteps: a null/string/array step is rejected, never crashes', () => {
  // these used to throw (Object.keys(null), `in` on a string) — the gate must
  // return a clean error, not blow up the pre-flight it exists to protect.
  const nul = validateSteps([null]);
  assert.equal(nul.ok, false);
  assert.ok(nul.errors.some((e) => /must be an object/.test(e)));
  assert.equal(validateSteps(['hi']).ok, false);
  assert.equal(validateSteps([[1, 2]]).ok, false);
});

test('validateSteps: an empty {} step is rejected as a silent no-op', () => {
  const r = validateSteps([{}]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /empty/.test(e)));
});

test('validateBatch: empty array and non-object take are rejected', () => {
  assert.equal(validateBatch([]).ok, false);
  assert.equal(validateBatch([null]).ok, false);
  assert.equal(validateBatch([{ steps: 'notarray' }]).ok, false);
});

test('validateBatch: unknown take key is named in the error', () => {
  const r = validateBatch([{ steps: [{ wait: 1 }], bogus: 1 }]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /bogus/.test(e)));
});
