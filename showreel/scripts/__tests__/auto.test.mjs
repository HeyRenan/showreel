// auto.test.mjs — hostile inputs against the pure logic of the URL-only quick
// path. The browser-bound main()/COLLECT_FN DOM walk is out of scope (same
// boundary prove.test.mjs draws for proveOne); this probes the pure exports:
// parse (auto.mjs), rankCandidates/roleLabel/isCircleKind/isSmallTarget/
// stableSelector (auto-rank.mjs), and pins that auto reuses prove's summarize.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../auto.mjs';
import {
  rankCandidates, roleLabel, isCircleKind, isSmallTarget, stableSelector, COLLECT_FN,
} from '../auto-rank.mjs';
import { summarize } from '../prove.mjs';

const VP = { w: 1000, h: 800 };
const cand = (role, over = {}) => ({
  role, tag: 'div', selector: over.selector || `#${role}`,
  rect: over.rect || { x: 10, y: 10, w: 200, h: 80 },
  area: over.area, isInteractive: over.isInteractive || false, text: over.text || '',
  ...(over.area != null ? {} : {}),
});
const withArea = (c) => ({ ...c, area: c.area != null ? c.area : c.rect.w * c.rect.h });

// ── parse ──────────────────────────────────────────────────────────────────
test('parse: defaults stand and empty argv binds no url (no crash)', () => {
  const a = parse([]);
  assert.equal(a.width, 900);
  assert.equal(a.height, 1400);
  assert.equal(a.dpr, 1);
  assert.equal(a.max, 4);
  assert.equal(a.outDir, './showreel-out/auto');
  assert.equal(a.url, undefined);
});

test('parse: binds the single url positional and all flags', () => {
  const a = parse(['https://x', '--max', '6', '--width', '1440', '--height', '900', '--dpr', '2', '--out-dir', 'out/']);
  assert.equal(a.url, 'https://x');
  assert.equal(a.max, 6);
  assert.equal(a.width, 1440);
  assert.equal(a.height, 900);
  assert.equal(a.dpr, 2);
  assert.equal(a.outDir, 'out/');
});

test('parse: surplus positional throws (unquoted-arg guard)', () => {
  assert.throws(() => parse(['https://x', 'extra']), /too many positional/);
});

test('parse: unknown flag throws', () => {
  assert.throws(() => parse(['https://x', '--nope']), /unknown arg/);
});

test('parse: --max validates as a positive integer', () => {
  assert.throws(() => parse(['https://x', '--max', 'abc']), /--max must be a number/);
  assert.throws(() => parse(['https://x', '--max', '0']), /--max must be >= 1/);
});

// ── rankCandidates ───────────────────────────────────────────────────────────
test('rankCandidates: hostile / empty input yields empty result, never throws', () => {
  assert.deepEqual(rankCandidates(null, { viewport: VP }), { picks: [], skipped: [] });
  assert.deepEqual(rankCandidates([], { viewport: VP }), { picks: [], skipped: [] });
  assert.deepEqual(rankCandidates([cand('card')], {}), { picks: [], skipped: [] }); // no viewport
});

test('rankCandidates: role weight ranks heading above an equal-size card', () => {
  const heading = withArea(cand('main-heading', { selector: '#h', rect: { x: 0, y: 200, w: 200, h: 80 } }));
  const card = withArea(cand('card', { selector: '#c', rect: { x: 0, y: 200, w: 200, h: 80 } }));
  const { picks } = rankCandidates([card, heading], { max: 4, viewport: VP });
  assert.equal(picks[0].role, 'main-heading');
});

test('rankCandidates: drops too-small and too-large targets with reasons', () => {
  const tiny = withArea(cand('card', { selector: '#tiny', rect: { x: 0, y: 0, w: 10, h: 10 } }));
  const huge = withArea(cand('card', { selector: '#huge', rect: { x: 0, y: 0, w: 1000, h: 790 } }));
  const { picks, skipped } = rankCandidates([tiny, huge], { max: 4, viewport: VP });
  assert.equal(picks.length, 0);
  const reasons = skipped.map((s) => s.reason).sort();
  assert.deepEqual(reasons, ['too-large', 'too-small']);
});

test('rankCandidates: a singular role is capped at one pick', () => {
  const a = withArea(cand('primary-action', { selector: '#a', rect: { x: 0, y: 10, w: 120, h: 40 } }));
  const b = withArea(cand('primary-action', { selector: '#b', rect: { x: 0, y: 400, w: 120, h: 40 } }));
  const { picks } = rankCandidates([a, b], { max: 4, viewport: VP });
  assert.equal(picks.filter((p) => p.role === 'primary-action').length, 1);
});

test('rankCandidates: a pick overlapping an accepted one is dropped', () => {
  const big = withArea(cand('card', { selector: '#big', rect: { x: 0, y: 0, w: 300, h: 200 } }));
  const inside = withArea(cand('card', { selector: '#inside', rect: { x: 10, y: 10, w: 120, h: 60 } }));
  const { picks, skipped } = rankCandidates([big, inside], { max: 4, viewport: VP });
  assert.equal(picks.length, 1);
  assert.ok(skipped.some((s) => s.reason === 'overlap'));
});

test('rankCandidates: respects max', () => {
  const cands = ['#a', '#b', '#c', '#d'].map((s, i) =>
    withArea(cand('card', { selector: s, rect: { x: i * 250, y: 0, w: 200, h: 120 } })));
  const { picks } = rankCandidates(cands, { max: 2, viewport: VP });
  assert.equal(picks.length, 2);
});

// ── roleLabel ────────────────────────────────────────────────────────────────
test('roleLabel: every role maps, unknown falls back, all ≤6 words and non-empty', () => {
  const roles = ['main-heading', 'primary-action', 'primary-nav', 'hero-image', 'form', 'key-metric', 'card'];
  for (const r of roles) {
    const label = roleLabel(r);
    assert.ok(label && label.trim().length > 0, `empty label for ${r}`);
    assert.ok(label.split(/\s+/).length <= 6, `label too long for ${r}: ${label}`);
  }
  assert.equal(roleLabel('something-unknown'), 'salient element');
});

// ── option helpers ───────────────────────────────────────────────────────────
test('isCircleKind: compact action gets a ring, wide nav does not', () => {
  assert.equal(isCircleKind(cand('primary-action', { rect: { x: 0, y: 0, w: 96, h: 56 } })), true); // ~square, compact
  assert.equal(isCircleKind(cand('primary-nav', { rect: { x: 0, y: 0, w: 800, h: 60 } })), false);
  assert.equal(isCircleKind(cand('primary-action', { rect: { x: 0, y: 0, w: 600, h: 44 } })), false); // too wide (aspect > 2)
  assert.equal(isCircleKind(null), false);
});

test('isSmallTarget: small target zooms, large does not', () => {
  assert.equal(isSmallTarget(cand('key-metric', { rect: { x: 0, y: 0, w: 60, h: 60 } }), VP), true);
  assert.equal(isSmallTarget(cand('card', { rect: { x: 0, y: 0, w: 400, h: 300 } }), VP), false);
  assert.equal(isSmallTarget(null, VP), false);
});

// ── selector + collector wiring ──────────────────────────────────────────────
test('stableSelector stringifies (shippable to the in-page collector)', () => {
  const src = stableSelector.toString();
  assert.ok(src.includes('nth-of-type'), 'selector builder should include the nth-of-type fallback');
  // COLLECT_FN is a self-invoking IIFE with stableSelector inlined (page.evaluate
  // does not call a bare function string with args), so its source must embed it.
  assert.ok(typeof COLLECT_FN === 'string' && COLLECT_FN.includes('nth-of-type') && COLLECT_FN.trim().startsWith('('),
    'COLLECT_FN should inline stableSelector as a self-invoking expression');
});

// ── summarize reuse — pins AUTO to the SAME gate as PROVE ─────────────────────
test('summarize reuse: AUTO line + exit policy match prove.summarize', () => {
  assert.deepEqual(
    (({ line, exitCode }) => ({ line: line.replace('PROVE', 'AUTO'), exitCode }))(summarize(['PASS', 'PASS'])),
    { line: 'AUTO 2/2 PASS', exitCode: 0 });
  assert.equal(summarize(['PASS', 'FAIL']).exitCode, 1);
  assert.equal(summarize(['PASS', 'ERROR']).exitCode, 3);
  assert.equal(summarize(['PASS', 'NO_SPACE']).exitCode, 3);
});
