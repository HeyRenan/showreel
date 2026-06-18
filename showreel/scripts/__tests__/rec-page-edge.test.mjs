// rec-page-edge.test.mjs — hostile sweep of rec-page.mjs's pure surface.
// Everything else in that module is IMPURE by design: cursorSnippet/endCardSnippet
// shell out (execFileSync), detectPageLook/readLiveTheme/loadChromium touch a real
// browser or the filesystem. The only deterministic, side-effect-free export is
// OFFLINE_ARGS — the frozen list of chromium flags that force every animation onto
// the virtual clock. This file pins that contract so a flag can't silently drift.
//
// Mirrors how edge-cases.test.mjs pins FRAME and the vocab Sets (THEMES, TAKE_KEYS):
// membership + exact-shape assertions, not an Object.freeze runtime check.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFLINE_ARGS } from '../rec-page.mjs';

// Every flag here earns its place: dropping any one lets the compositor finish on
// wall-clock time while the renderer runs virtual, desyncing the camera. New entries
// are fine; a SILENT removal of one of these is the regression this guards against.
const REQUIRED_FLAGS = [
  '--disable-threaded-animation',
  '--disable-threaded-scrolling',
  '--run-all-compositor-stages-before-draw',
  '--disable-checker-imaging',
  '--disable-new-content-rendering-timeout',
];

test('OFFLINE_ARGS: contains every required offline flag', () => {
  for (const flag of REQUIRED_FLAGS) {
    assert.ok(OFFLINE_ARGS.includes(flag), `missing offline flag ${flag}`);
  }
});

test('OFFLINE_ARGS: is exactly the known set, in order (no drift, no extras)', () => {
  // exact match catches both accidental removal AND an unreviewed addition —
  // a new flag should land here as a deliberate test edit, not slip in unnoticed.
  assert.deepEqual(OFFLINE_ARGS, REQUIRED_FLAGS);
});

test('OFFLINE_ARGS: every entry is a non-empty "--" flag string', () => {
  // a bare value or a flag missing its dashes would be silently ignored by chromium
  // and break offline determinism without any launch error.
  assert.ok(Array.isArray(OFFLINE_ARGS));
  for (const a of OFFLINE_ARGS) {
    assert.equal(typeof a, 'string');
    assert.ok(a.startsWith('--'), `not a flag: ${JSON.stringify(a)}`);
  }
});

test('OFFLINE_ARGS: has no duplicate flags', () => {
  assert.equal(new Set(OFFLINE_ARGS).size, OFFLINE_ARGS.length);
});
