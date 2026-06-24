// cli-parse.test.mjs — argument-parsing guards for the CLI tools that lacked a
// dedicated parse test (shot, compose, tape). Locks in the behaviour intensive
// testing exercised by hand: positional mapping, numeric/string flag validation,
// unknown-flag rejection, and the surplus-positional guard.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse as shotParse } from '../shot.mjs';
import { parse as composeParse } from '../compose.mjs';
import { parseArgs as tapeParse } from '../tape.mjs';

test('shot: positionals map to url/selector/out; flags parse', () => {
  const a = shotParse(['http://x/', '.card', 'out.png', '--width', '1440', '--pad', '8']);
  assert.equal(a.url, 'http://x/');
  assert.equal(a.selector, '.card');
  assert.equal(a.out, 'out.png');
  assert.equal(a.width, 1440);
  assert.equal(a.pad, 8);
});

test('shot: bad numeric flag, unknown flag, and surplus positionals all throw', () => {
  assert.throws(() => shotParse(['u', 's', 'o', '--width', 'abc']), /--width must be a number/);
  assert.throws(() => shotParse(['u', 's', 'o', '--nope']), /shot: unknown arg --nope/);
  assert.throws(() => shotParse(['u', 's', 'o', 'extra']), /too many positional/);
});

test('compose: positionals map to aPng/bPng/out; flags parse', () => {
  const a = composeParse(['a.png', 'b.png', 'out.png', '--labels', 'Before,After', '--gap', '12']);
  assert.equal(a.aPng, 'a.png');
  assert.equal(a.bPng, 'b.png');
  assert.equal(a.out, 'out.png');
  assert.equal(a.labels, 'Before,After');
  assert.equal(a.gap, 12);
});

test('compose: unknown flag, surplus positionals, and a flag-as-value all throw', () => {
  assert.throws(() => composeParse(['a', 'b', 'o', '--frob']), /compose: unknown arg --frob/);
  assert.throws(() => composeParse(['a', 'b', 'o', 'x']), /too many positional/);
  assert.throws(() => composeParse(['a', 'b', 'o', '--labels', '--gap']), /--labels needs a value/);
});

test('tape: positionals collected; numeric + string flags parse', () => {
  const a = tapeParse(['out.gif', '--width', '900', '--steps-json', '[]', '--theme', 'dark']);
  assert.deepEqual(a.positional, ['out.gif']);
  assert.equal(a.width, 900);
  assert.equal(a.stepsJson, '[]');
  assert.equal(a.theme, 'dark');
});

test('tape: unknown flag and a non-integer width throw', () => {
  assert.throws(() => tapeParse(['o.gif', '--bogus']), /tape: unknown arg --bogus/);
  assert.throws(() => tapeParse(['o.gif', '--width', '12.5']), /--width must be a whole number/);
});
