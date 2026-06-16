#!/usr/bin/env node
// tape.mjs — terminal session gif via charmbracelet/vhs (https://github.com/charmbracelet/vhs).
// Steps JSON in, .tape generated, vhs renders the gif. Same contract as rec.mjs:
// you speak in content and intent, the script owns the tape syntax.
//
//   node tape.mjs --steps steps.json out.gif
//   node tape.mjs --steps-json '[{"type":"npm test"},{"enter":true},{"sleep":3000}]' out.gif
//   node tape.mjs --tape raw.tape out.gif        # passthrough, no generation
//
// Step keys (unknown keys rejected up front):
//   type   string typed with realistic delay     {"type":"git status"}
//   enter  press Enter                           {"enter":true}
//   sleep  wait ms                               {"sleep":1500}
//   ctrl   control chord                         {"ctrl":"c"}
//   hide   stop recording (setup commands)       {"hide":true}
//   show   resume recording                      {"show":true}
//   wait   alias of sleep
// Options: --width --height --font-size --theme --shell --typing-speed
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { num, str } from './cli-args.mjs';

const STEP_KEYS = new Set(['type', 'enter', 'sleep', 'wait', 'ctrl', 'hide', 'show']);

export function validateSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) throw new Error('tape: steps must be a non-empty array');
  steps.forEach((s, i) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error(`tape: step ${i} must be an object`);
    const keys = Object.keys(s);
    if (keys.length === 0) throw new Error(`tape: step ${i} is empty`);
    for (const k of keys) if (!STEP_KEYS.has(k)) throw new Error(`tape: step ${i} has unknown key "${k}" (allowed: ${[...STEP_KEYS].join(', ')})`);
    if ('type' in s && typeof s.type !== 'string') throw new Error(`tape: step ${i} "type" must be a string`);
    if ('ctrl' in s && (typeof s.ctrl !== 'string' || s.ctrl.length !== 1)) throw new Error(`tape: step ${i} "ctrl" must be a single character`);
    const ms = s.sleep ?? s.wait;
    if (ms !== undefined && (!Number.isFinite(ms) || ms < 0)) throw new Error(`tape: step ${i} sleep/wait must be a non-negative number (ms)`);
  });
  return steps;
}

const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function buildTape(steps, opts = {}) {
  const {
    out = 'out.gif', width = 1000, height = 540, fontSize = 16,
    theme = 'Catppuccin Mocha', shell = 'bash', typingSpeed = '60ms',
  } = opts;
  const lines = [
    `Output ${q(out)}`,
    `Set Shell ${q(shell)}`,
    `Set FontSize ${fontSize}`,
    `Set Width ${width}`,
    `Set Height ${height}`,
    `Set Theme ${q(theme)}`,
    `Set TypingSpeed ${typingSpeed}`,
    `Set Padding 24`,
    '',
  ];
  for (const s of validateSteps(steps)) {
    if (s.hide) lines.push('Hide');
    if (s.show) lines.push('Show');
    if (typeof s.type === 'string') lines.push(`Type ${q(s.type)}`);
    if (s.enter) lines.push('Enter');
    if (typeof s.ctrl === 'string') lines.push(`Ctrl+${s.ctrl.toUpperCase()}`);
    const ms = s.sleep ?? s.wait;
    if (ms !== undefined) lines.push(`Sleep ${ms}ms`);
  }
  lines.push('Sleep 1500ms', '');
  return lines.join('\n');
}

export function parseArgs(argv) {
  const a = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--steps') a.steps = str('tape', '--steps', argv[++i]);
    else if (k === '--steps-json') a.stepsJson = str('tape', '--steps-json', argv[++i]);
    else if (k === '--tape') a.tape = str('tape', '--tape', argv[++i]);
    else if (k === '--width') a.width = num('tape', '--width', argv[++i], { int: true, min: 1 });
    else if (k === '--height') a.height = num('tape', '--height', argv[++i], { int: true, min: 1 });
    else if (k === '--font-size') a.fontSize = num('tape', '--font-size', argv[++i], { int: true, min: 1 });
    else if (k === '--theme') a.theme = str('tape', '--theme', argv[++i]);
    else if (k === '--shell') a.shell = str('tape', '--shell', argv[++i]);
    else if (k === '--typing-speed') a.typingSpeed = argv[++i];
    else if (k.startsWith('--')) throw new Error('tape: unknown arg ' + k);
    else a.positional.push(k);
  }
  return a;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  const out = a.positional[0];
  if (!out || (!a.steps && !a.stepsJson && !a.tape)) {
    console.error('usage: tape.mjs --steps steps.json out.gif | --steps-json \'[...]\' out.gif | --tape file.tape out.gif');
    process.exit(2);
  }
  const probe = spawnSync('vhs', ['--version'], { stdio: 'ignore' });
  if (probe.error) {
    console.error('tape: vhs binary not found — install it first: brew install vhs  (https://github.com/charmbracelet/vhs)');
    process.exit(3);
  }
  let tapePath = a.tape;
  let tmp;
  if (!tapePath) {
    const steps = JSON.parse(a.stepsJson ?? readFileSync(a.steps, 'utf8'));
    tmp = mkdtempSync(join(tmpdir(), 'tape-'));
    tapePath = join(tmp, 'session.tape');
    writeFileSync(tapePath, buildTape(steps, { ...a, out }));
  }
  try {
    execFileSync('vhs', [tapePath], { stdio: ['ignore', 'inherit', 'inherit'] });
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
  if (!existsSync(out)) { console.error(`tape: vhs finished but ${out} was not created`); process.exit(1); }
  console.log(`OK ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); }
  catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
