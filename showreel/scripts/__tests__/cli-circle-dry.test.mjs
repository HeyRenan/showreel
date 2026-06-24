// cli-circle-dry.test.mjs — render-real guards for two CLI bugs found by
// intensive testing:
//   1. `prove --circle` always FAILed vcheck (dominance judged against the bare
//      rect, not the padded ellipse) — a correct ring exited non-zero.
//   2. `rec --dry` required an output path (contradicting the documented quick
//      check) AND only checked a subset of selector-bearing keys.
// GUARDED: skips cleanly when chromium is absent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEPS_DIR } from '../ensure-deps.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, '..');
const REPO = join(SCRIPTS, '..', '..');
const DEMO = 'file://' + join(REPO, 'assets-src', 'demo', 'index.html');
const BROWSERS = join(DEPS_DIR, 'ms-playwright');
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: BROWSERS };

function chromiumPresent() {
  try { return readdirSync(BROWSERS).some((d) => d.startsWith('chromium')); } catch { return false; }
}
const SKIP = chromiumPresent() && existsSync(join(REPO, 'assets-src', 'demo', 'index.html'))
  ? false : 'chromium/demo absent — run ensure-deps.mjs';

// run a node script, return { code, out }. execFileSync throws on non-zero exit,
// so capture both paths.
function run(args) {
  try {
    const out = execFileSync('node', args, { env, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status == null ? 1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

test('prove --circle passes vcheck on a normal target', { skip: SKIP }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'sr-circle-'));
  try {
    const r = run([join(SCRIPTS, 'prove.mjs'), DEMO, '#deploy', join(dir, 'c.png'), '--label', 'ship', '--circle']);
    assert.equal(r.code, 0, `prove --circle should exit 0, got ${r.code}: ${r.out}`);
    assert.match(r.out, /PROVE 1\/1 PASS/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('rec --dry works with no output path and flags missing selectors', { skip: SKIP }, () => {
  // missing selector on a `rect` key — a key the old dry path did not even check.
  const miss = run([join(SCRIPTS, 'rec.mjs'), DEMO, '--steps-json', '[{"rect":"#nope-xyz"}]', '--dry']);
  assert.equal(miss.code, 1, `a missing selector should exit 1, got ${miss.code}: ${miss.out}`);
  assert.match(miss.out, /\[MISS\][^\n]*#nope-xyz/);

  // all-valid, still no output path → DRY PASS, exit 0.
  const pass = run([join(SCRIPTS, 'rec.mjs'), DEMO, '--steps-json', '[{"click":"#deploy"},{"rect":"#stage-deploy"}]', '--dry']);
  assert.equal(pass.code, 0, `all-valid --dry should exit 0, got ${pass.code}: ${pass.out}`);
  assert.match(pass.out, /DRY PASS/);
});
