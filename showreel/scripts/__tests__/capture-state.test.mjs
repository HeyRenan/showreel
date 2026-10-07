// capture-state.test.mjs — states that only exist after an interaction, and the
// Claude-in-Chrome overlay. Render tests skip cleanly when chromium is absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { DEPS_DIR } from '../ensure-deps.mjs';
import { parseDo } from '../cli-args.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, '..');
const REPO = join(SCRIPTS, '..', '..');
const DEMO = 'file://' + join(REPO, 'assets-src', 'demo', 'index.html');
const BROWSERS = join(DEPS_DIR, 'ms-playwright');
const present = () => { try { return readdirSync(BROWSERS).some((d) => d.startsWith('chromium')); } catch { return false; } };
const SKIP = present() && existsSync(join(REPO, 'assets-src', 'demo', 'index.html')) ? false : 'chromium/demo absent';
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: BROWSERS };

test('parseDo accepts inline JSON and rejects non-arrays and bad JSON', () => {
  assert.deepEqual(parseDo('t', '[{"click":"#a"}]'), [{ click: '#a' }]);
  assert.throws(() => parseDo('t', '{"click":"#a"}'), /array/);
  assert.throws(() => parseDo('t', '[oops'), /--do must be/);
});

test('prove --do captures an element that only exists after a click', { skip: SKIP }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'sr-state-'));
  try {
    const out = join(dir, 'drawer.png');
    const args = [join(SCRIPTS, 'prove.mjs'), DEMO, '#drawer', out, '--label', 'Menu drawer', '--width', '1280', '--height', '700'];
    let failed = false;
    try { execFileSync('node', args, { env, stdio: 'pipe' }); } catch { failed = true; }
    assert.ok(failed, 'without --do the drawer never appears, so prove must not PASS');
    const res = execFileSync('node', [...args, '--do', '[{"click":"#menu"},{"waitFor":"#drawer"}]'], { env, encoding: 'utf8' });
    assert.match(res, /^PASS .*drawer\.png/m);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('overlay: install is idempotent, annotate returns a verdict that never overlaps the target', { skip: SKIP }, async () => {
  const { Browser } = await import('../../lib/browser.mjs');
  const { buildOverlayLib } = await import('../overlay.mjs');
  const b = await Browser.launch({ width: 1280, height: 700 });
  try {
    await b.open(DEMO);
    await b.page.evaluate(buildOverlayLib());
    await b.page.evaluate(buildOverlayLib());
    const longLabel = 'This is a very long label that explains the deploy panel in detail and keeps going';
    const v = JSON.parse(await b.page.evaluate((l) => window.__showreel.annotate('#deploy-panel', l), longLabel));
    assert.equal(v.ok, true);
    const c = v.callout, t = v.target;
    const overlap = !(c.x + c.w <= t.x || t.x + t.w <= c.x || c.y + c.h <= t.y || t.y + t.h <= c.y);
    assert.equal(overlap, false, 'callout must not cover the target');
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 1280 && c.y + c.h <= 700, 'callout inside viewport');
    const missing = JSON.parse(await b.page.evaluate(() => window.__showreel.annotate('#nope', 'x')));
    assert.equal(missing.ok, false);
    assert.match(missing.reason, /not found/);
    assert.equal(await b.page.evaluate(() => window.__showreel.clear()), 'cleared');
  } finally { await b.close(); }
});
