import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../prove.mjs';

test('summarize: all pass -> PASS line, exit 0', () => {
  const s = summarize(['PASS', 'PASS', 'PASS']);
  assert.equal(s.verdict, 'PASS');
  assert.equal(s.line, 'PROVE 3/3 PASS');
  assert.equal(s.exitCode, 0);
});

test('summarize: zero pass reads FAIL, never "0/1 PASS"', () => {
  const s = summarize(['ERROR']);
  assert.equal(s.line, 'PROVE 0/1 FAIL');
  assert.notEqual(s.verdict, 'PASS');
});

test('summarize: a mix of pass and fail is FAIL', () => {
  const s = summarize(['PASS', 'FAIL']);
  assert.equal(s.passed, 1);
  assert.equal(s.total, 2);
  assert.equal(s.line, 'PROVE 1/2 FAIL');
  assert.equal(s.exitCode, 1);
});

test('summarize: ERROR exits 3 (input problem, not a placement fail)', () => {
  assert.equal(summarize(['ERROR']).exitCode, 3);
  assert.equal(summarize(['PASS', 'ERROR']).exitCode, 3);
});

test('summarize: NO_SPACE exits 3', () => {
  assert.equal(summarize(['NO_SPACE']).exitCode, 3);
  assert.equal(summarize(['PASS', 'NO_SPACE']).exitCode, 3);
});

test('summarize: ERROR/NO_SPACE take precedence over FAIL for exit 3', () => {
  assert.equal(summarize(['FAIL', 'ERROR']).exitCode, 3);
  assert.equal(summarize(['FAIL', 'NO_SPACE']).exitCode, 3);
});

test('summarize: FAIL alone exits 1', () => {
  assert.equal(summarize(['PASS', 'FAIL']).exitCode, 1);
});

test('summarize: empty result set is FAIL, exit 0 (nothing ran)', () => {
  const s = summarize([]);
  assert.equal(s.line, 'PROVE 0/0 FAIL');
  assert.equal(s.exitCode, 0);
});
