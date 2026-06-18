// live-validate.test.mjs — the author-facing contract for live elements. The
// `live` step key carries exactly one mutation verb; ephemeral one-shot
// animations cannot be made live. Same hostile-input rigor as every other key:
// a bad live op is a clean pre-flight verdict, never a render crash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSteps, STEP_KEYS, LIVE_OPS, EPHEMERAL_TYPES } from '../rec-steps.mjs';

test('live is a known step key', () => {
  assert.ok(STEP_KEYS.has('live'));
});

test('LIVE_OPS holds exactly the five verbs', () => {
  assert.deepEqual([...LIVE_OPS].sort(), ['append', 'recolor', 'remove', 'replace', 'update']);
});

test('live op must be exactly one of the five verbs', () => {
  assert.equal(validateSteps([{ live: { append: { text: 'x' } } }]).ok, true);
  assert.equal(validateSteps([{ live: { update: { item: 1, text: 'x' } } }]).ok, true);
  assert.equal(validateSteps([{ live: { recolor: { color: 'red' } } }]).ok, true);
  assert.equal(validateSteps([{ live: { replace: { items: [] } } }]).ok, true);
  assert.equal(validateSteps([{ live: { remove: true } }]).ok, true);
  // zero verbs, two verbs, unknown verb -> reject
  assert.equal(validateSteps([{ live: {} }]).ok, false);
  assert.equal(validateSteps([{ live: { append: {}, remove: true } }]).ok, false);
  assert.equal(validateSteps([{ live: { frobnicate: 1 } }]).ok, false);
});

test('live never crashes on hostile shapes', () => {
  for (const bad of [null, 5, [1], true, 'x', {}]) {
    assert.doesNotThrow(() => validateSteps([{ live: bad }]));
  }
});

test('live target id, when present, must be a non-empty string', () => {
  assert.equal(validateSteps([{ live: { id: '', append: { text: 'x' } } }]).ok, false);
  assert.equal(validateSteps([{ live: { id: 'feat', append: { text: 'x' } } }]).ok, true);
  assert.equal(validateSteps([{ live: { id: 5, append: { text: 'x' } } }]).ok, false);
});

test('update/recolor item, when present, must be a positive integer', () => {
  assert.equal(validateSteps([{ live: { update: { item: 0, text: 'x' } } }]).ok, false);
  assert.equal(validateSteps([{ live: { recolor: { item: 1.5, color: 'red' } } }]).ok, false);
  assert.equal(validateSteps([{ live: { update: { item: 2, text: 'x' } } }]).ok, true);
});

test('an ephemeral primitive given an id is rejected as one-shot', () => {
  assert.ok(EPHEMERAL_TYPES.has('confetti'));
  assert.equal(validateSteps([{ confetti: { id: 'x', sel: '#a' } }]).ok, false);
  // a stateful primitive WITH an id is fine (it becomes live)
  assert.equal(validateSteps([{ glossary: { id: 'feat', items: [{ badge: 1, text: 'A' }] } }]).ok, true);
});
