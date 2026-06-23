import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTape, validateSteps, parseArgs } from '../tape.mjs';

test('buildTape emits header with output and options', () => {
  const t = buildTape([{ type: 'ls' }], { out: 'demo.gif', width: 800, height: 400, fontSize: 14, theme: 'Dracula', shell: 'zsh', typingSpeed: '40ms' });
  assert.match(t, /^Output "demo\.gif"$/m);
  assert.match(t, /^Set Shell "zsh"$/m);
  assert.match(t, /^Set FontSize 14$/m);
  assert.match(t, /^Set Width 800$/m);
  assert.match(t, /^Set Height 400$/m);
  assert.match(t, /^Set Theme "Dracula"$/m);
  assert.match(t, /^Set TypingSpeed 40ms$/m);
});

test('buildTape maps every step key', () => {
  const t = buildTape([
    { hide: true }, { type: 'export SECRET=1' }, { enter: true }, { show: true },
    { type: 'npm test' }, { enter: true, sleep: 2500 }, { ctrl: 'c' }, { wait: 300 },
  ]);
  const body = t.split('\n\n')[1];
  assert.deepEqual(body.split('\n').filter(Boolean), [
    'Hide', 'Type "export SECRET=1"', 'Enter', 'Show',
    'Type "npm test"', 'Enter', 'Sleep 2500ms', 'Ctrl+C', 'Sleep 300ms',
    'Sleep 1500ms',
  ]);
});

test('buildTape escapes quotes and backslashes in typed text', () => {
  const t = buildTape([{ type: 'echo "a\\b"' }]);
  assert.match(t, /Type "echo \\"a\\\\b\\""/);
});

test('buildTape always lands on a final settle sleep', () => {
  const t = buildTape([{ type: 'ls' }]);
  assert.match(t.trimEnd(), /Sleep 1500ms$/);
});

test('validateSteps rejects unknown keys with the offending name', () => {
  assert.throws(() => validateSteps([{ click: '.btn' }]), /unknown key "click"/);
});

test('validateSteps rejects empty array, empty step, bad types', () => {
  assert.throws(() => validateSteps([]), /non-empty/);
  assert.throws(() => validateSteps([{}]), /empty/);
  assert.throws(() => validateSteps([{ type: 5 }]), /"type" must be a string/);
  assert.throws(() => validateSteps([{ ctrl: 'cc' }]), /single character/);
  assert.throws(() => validateSteps([{ sleep: -1 }]), /non-negative/);
});

test('parseArgs maps flags and positionals, rejects unknown flags', () => {
  const a = parseArgs(['--steps-json', '[]', 'out.gif', '--width', '900', '--theme', 'Dracula']);
  assert.equal(a.stepsJson, '[]');
  assert.deepEqual(a.positional, ['out.gif']);
  assert.equal(a.width, 900);
  assert.equal(a.theme, 'Dracula');
  assert.throws(() => parseArgs(['--nope']), /unknown arg/);
});
