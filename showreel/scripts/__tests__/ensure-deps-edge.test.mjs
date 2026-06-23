// ensure-deps-edge.test.mjs — hostile inputs against the pure path/env logic of
// the dependency bootstrapper. ensureDeps() itself shells out to npm/playwright
// and is NOT unit-tested here; we cover only the deterministic string/path
// builders and the FS-detection helpers, asserting host-invariant properties so
// the suite passes whether or not .deps and a system ffmpeg happen to be present.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sep, isAbsolute } from 'node:path';
import {
  DEPS_DIR, depsEnv, playwrightSpecifier,
  bundledFfmpeg, ffmpegPath, ffmpegHasPalette,
} from '../ensure-deps.mjs';

// ── DEPS_DIR: the anchor constant ──────────────────────────────────────────
test('DEPS_DIR: absolute path ending in the .deps segment', () => {
  assert.equal(typeof DEPS_DIR, 'string');
  assert.ok(isAbsolute(DEPS_DIR), 'DEPS_DIR must be absolute');
  assert.ok(DEPS_DIR.endsWith(sep + '.deps'), 'DEPS_DIR must end with /.deps');
});

// ── playwrightSpecifier: pure join, no FS read ─────────────────────────────
test('playwrightSpecifier: absolute import path under DEPS_DIR ending in index.mjs', () => {
  const spec = playwrightSpecifier();
  assert.equal(typeof spec, 'string');
  assert.ok(isAbsolute(spec));
  assert.ok(spec.startsWith(DEPS_DIR + sep), 'specifier must live inside .deps');
  assert.ok(spec.endsWith(['node_modules', 'playwright', 'index.mjs'].join(sep)),
    'specifier must resolve to the isolated playwright entry');
});

test('playwrightSpecifier: stable across calls and never throws', () => {
  assert.doesNotThrow(playwrightSpecifier);
  assert.equal(playwrightSpecifier(), playwrightSpecifier());
});

// ── depsEnv: spread base env, then force the browsers path ──────────────────
test('depsEnv: sets PLAYWRIGHT_BROWSERS_PATH inside .deps', () => {
  const env = depsEnv();
  assert.equal(typeof env.PLAYWRIGHT_BROWSERS_PATH, 'string');
  assert.ok(env.PLAYWRIGHT_BROWSERS_PATH.startsWith(DEPS_DIR + sep),
    'browsers path must point into .deps');
  assert.ok(env.PLAYWRIGHT_BROWSERS_PATH.endsWith(sep + 'ms-playwright'));
});

test('depsEnv: a stale PLAYWRIGHT_BROWSERS_PATH in the parent env is overridden', () => {
  // hostile: the host already exports a browsers path (even one with spaces).
  // depsEnv spreads process.env first, then writes the key, so ours must win.
  const saved = process.env.PLAYWRIGHT_BROWSERS_PATH;
  try {
    process.env.PLAYWRIGHT_BROWSERS_PATH = '/stale/path with spaces/ms-playwright';
    const env = depsEnv();
    assert.notEqual(env.PLAYWRIGHT_BROWSERS_PATH, '/stale/path with spaces/ms-playwright');
    assert.ok(env.PLAYWRIGHT_BROWSERS_PATH.startsWith(DEPS_DIR + sep));
  } finally {
    if (saved === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = saved;
  }
});

test('depsEnv: preserves unrelated parent-env keys and does not mutate process.env', () => {
  const marker = '__ensure_deps_edge_marker__';
  const saved = process.env[marker];
  try {
    process.env[marker] = 'kept';
    const env = depsEnv();
    assert.equal(env[marker], 'kept', 'base env must be spread through');
    // the returned object is a copy; mutating it must not leak into process.env
    env.PLAYWRIGHT_BROWSERS_PATH = '/tampered';
    assert.notEqual(process.env.PLAYWRIGHT_BROWSERS_PATH, '/tampered');
  } finally {
    if (saved === undefined) delete process.env[marker];
    else process.env[marker] = saved;
  }
});

// ── bundledFfmpeg: FS lookup that must degrade to null, never throw ─────────
test('bundledFfmpeg: returns a path string or null, never throws', () => {
  let result;
  assert.doesNotThrow(() => { result = bundledFfmpeg(); });
  assert.ok(result === null || typeof result === 'string');
  if (typeof result === 'string') {
    assert.ok(isAbsolute(result), 'a found ffmpeg must be an absolute path');
    assert.ok(result.startsWith(DEPS_DIR + sep), 'bundled ffmpeg lives under .deps');
    assert.match(result, /ffmpeg(-mac|-linux|\.exe)$/,
      'must point at a known bundled binary name');
  }
});

// ── ffmpegPath: always a usable command/path string ────────────────────────
test('ffmpegPath: always returns a non-empty string, never throws', () => {
  let p;
  assert.doesNotThrow(() => { p = ffmpegPath(); });
  assert.equal(typeof p, 'string');
  assert.ok(p.length > 0);
});

test('ffmpegPath: resolves to "ffmpeg", a bundled binary, or the literal fallback', () => {
  // three legal outcomes regardless of host: system on PATH ("ffmpeg"),
  // bundled absolute path, or the "ffmpeg" literal fallback when neither exists.
  const p = ffmpegPath();
  const bundled = bundledFfmpeg();
  assert.ok(p === 'ffmpeg' || p === bundled,
    `ffmpegPath returned ${p}, expected "ffmpeg" or ${bundled}`);
});

// ── ffmpegHasPalette: boolean capability flag, consistent with ffmpegPath ──
test('ffmpegHasPalette: returns a boolean, never throws', () => {
  let v;
  assert.doesNotThrow(() => { v = ffmpegHasPalette(); });
  assert.equal(typeof v, 'boolean');
});

test('ffmpegHasPalette: when true, ffmpegPath uses the full system ffmpeg', () => {
  // palette support is gated on the system build; if it reports true, the
  // resolved binary must be the system "ffmpeg", not the stripped bundled one.
  if (ffmpegHasPalette()) {
    assert.equal(ffmpegPath(), 'ffmpeg');
  } else {
    // no system ffmpeg: path is either the bundled fallback or the literal.
    const p = ffmpegPath();
    assert.ok(p === 'ffmpeg' || p === bundledFfmpeg());
  }
});
