import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STEP_KEYS, validateSteps } from '../rec.mjs';

const PRESETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'presets');
const PRESET_FILES = ['form-flow.json', 'nav-flow.json', 'dashboard.json'];
const FORTHCOMING_KEYS = new Set(['fill', 'select', 'camera']);

const load = (name) => JSON.parse(readFileSync(join(PRESETS_DIR, name), 'utf8'));

test('presets dir ships exactly the three spec presets plus README', () => {
  const entries = readdirSync(PRESETS_DIR).sort();
  assert.deepEqual(entries, ['README.md', ...PRESET_FILES].sort());
});

for (const name of PRESET_FILES) {
  test(`${name}: parses to a non-empty step array`, () => {
    const steps = load(name);
    assert.ok(Array.isArray(steps));
    assert.ok(steps.length > 0);
    steps.forEach((s) => assert.equal(typeof s, 'object'));
  });

  test(`${name}: every key is current STEP_KEYS or forthcoming fill/select/camera`, () => {
    for (const step of load(name)) {
      for (const key of Object.keys(step)) {
        assert.ok(
          STEP_KEYS.has(key) || FORTHCOMING_KEYS.has(key),
          `${name}: key "${key}" not in STEP_KEYS nor forthcoming vocabulary`,
        );
      }
    }
  });

  test(`${name}: steps using only current keys pass validateSteps`, () => {
    const current = load(name).filter((s) => Object.keys(s).every((k) => STEP_KEYS.has(k)));
    const v = validateSteps(current);
    assert.ok(v.ok, (v.errors || []).join('; '));
  });

  test(`${name}: full preset passes validateSteps once rec accepts fill/select/camera`, (t) => {
    const pending = [...FORTHCOMING_KEYS].filter((k) => !STEP_KEYS.has(k));
    if (pending.length) {
      t.skip('rec STEP_KEYS missing: ' + pending.join(', ') + ' (other agent in flight)');
      return;
    }
    const v = validateSteps(load(name));
    assert.ok(v.ok, (v.errors || []).join('; '));
  });
}

test('form-flow covers fill, select, camera, click and a success note', () => {
  const steps = load('form-flow.json');
  const keys = steps.flatMap((s) => Object.keys(s));
  for (const k of ['fill', 'select', 'camera', 'click', 'note']) assert.ok(keys.includes(k), 'missing ' + k);
});

test('nav-flow covers click+screen pill, scrollTo+note, camera out', () => {
  const steps = load('nav-flow.json');
  assert.equal(typeof steps[0].click, 'string');
  assert.equal(typeof steps[0].screen, 'string');
  assert.equal(typeof steps[1].scrollTo, 'string');
  assert.equal(typeof steps[1].note, 'string');
  assert.equal(steps.at(-1).camera, 'out');
});

test('dashboard covers camera zoom, marks with sub-badges, note, camera out', () => {
  const steps = load('dashboard.json');
  assert.equal(steps[0].camera.zoom, 1.4);
  const marksStep = steps.find((s) => s.marks);
  assert.ok(Array.isArray(marksStep.marks) && marksStep.marks.length >= 2);
  marksStep.marks.forEach((m) => { assert.ok(m.sel); assert.match(m.badge, /^\d+\.\d+$/); });
  assert.equal(typeof marksStep.note, 'string');
  assert.equal(steps.at(-1).camera, 'out');
});
