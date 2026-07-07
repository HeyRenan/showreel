#!/usr/bin/env node
// build-assets.mjs — regenerate README assets from a reproducible roster.
//
//   node assets-src/build-assets.mjs                 # build everything
//   node assets-src/build-assets.mjs --group state   # only one group
//   node assets-src/build-assets.mjs --name marks     # a single asset
//   node assets-src/build-assets.mjs --list           # list without building
//   node assets-src/build-assets.mjs --dry            # print commands only
//
// Each asset in roster.json declares { name, group, tool, page, ...toolArgs, out }.
// `page` resolves against roster.pages, then to file://<repo>/assets-src/<path>.
// This is the single source of truth so `showcase.mp4` and the ~50 grid assets
// are all rebuildable with one command — no more hand-dogfooding.

import { readFileSync, writeFileSync, mkdtempSync, renameSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { depsEnv } from '../showreel/scripts/ensure-deps.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const SCRIPTS = join(REPO, 'showreel', 'scripts');
const roster = JSON.parse(readFileSync(join(HERE, 'roster.json'), 'utf8'));

const argv = process.argv.slice(2);
const opt = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
const has = (flag) => argv.includes(flag);
const onlyGroup = opt('--group');
const onlyName = opt('--name');
const dry = has('--dry');

function pageUrl(page) {
  const rel = roster.pages[page] || page;
  return 'file://' + join(REPO, 'assets-src', rel);
}

function stepsArg(a) {
  if (a.stepsFile) return ['--steps', join(HERE, a.stepsFile)];
  if (a.steps) {
    const f = join(mkdtempSync(join(tmpdir(), 'roster-')), a.name + '.json');
    writeFileSync(f, JSON.stringify(a.steps));
    return ['--steps', f];
  }
  return [];
}

// Build the argv for one asset, per tool. Returns [scriptPath, ...args] or null to skip.
function command(a) {
  const out = a.out ? join(REPO, a.out) : null;
  const extra = a.args || [];
  switch (a.tool) {
    case 'rec':      return [join(SCRIPTS, 'rec.mjs'), pageUrl(a.page), ...stepsArg(a), ...extra, out];
    case 'prove':    return [join(SCRIPTS, 'prove.mjs'), pageUrl(a.page), a.selector, out, '--label', a.label || '', ...extra];
    case 'auto':     return [join(SCRIPTS, 'auto.mjs'), pageUrl(a.page), ...extra];
    case 'shot':     return [join(SCRIPTS, 'shot.mjs'), pageUrl(a.page), a.selector, out, ...extra];
    case 'demo':     return [join(SCRIPTS, 'demo.mjs'), '--batch', join(HERE, a.batch), ...extra];
    case 'compose':  return [join(SCRIPTS, 'compose.mjs'), join(REPO, a.a), join(REPO, a.b), out, ...extra];
    case 'beautify': return [join(SCRIPTS, 'beautify.mjs'), join(REPO, a.in), out, ...extra];
    case 'tape':     return [join(SCRIPTS, 'tape.mjs'), ...stepsArg(a), out, ...extra];
    default: throw new Error('unknown tool: ' + a.tool);
  }
}

const pick = roster.assets.filter((a) =>
  (!onlyGroup || a.group === onlyGroup) && (!onlyName || a.name === onlyName));

if (has('--list')) {
  for (const a of pick) console.log(`${a.group.padEnd(12)} ${a.name.padEnd(18)} ${a.tool.padEnd(9)} -> ${a.out || '(dir)'}`);
  process.exit(0);
}

let ok = 0, fail = 0;
for (const a of pick) {
  const [script, ...args] = command(a).map(String);
  const label = `${a.group}/${a.name}`;
  if (dry) { console.log(label, '\n  node', script, args.join(' '), '\n'); continue; }
  process.stderr.write(`▶ ${label} ... `);
  try {
    execFileSync('node', [script, ...args], { env: depsEnv(), stdio: ['ignore', 'ignore', 'pipe'] });
    // grid gifs auto-shrink to budget so regeneration stays reproducible (hero mp4/gif exempt)
    if (a.out && a.out.endsWith('.gif') && !a.heavy) {
      const outAbs = join(REPO, a.out);
      try {
        execFileSync('node', [join(SCRIPTS, 'shrink.mjs'), outAbs, '--target-kb', String(a.shrinkKb || 1500)],
          { env: depsEnv(), stdio: ['ignore', 'ignore', 'pipe'] });
        const min = outAbs.replace(/\.gif$/, '.min.gif');
        if (existsSync(min)) renameSync(min, outAbs);
      } catch { /* shrink is best-effort */ }
    }
    console.error('ok'); ok++;
  } catch (e) {
    console.error('FAIL\n' + String(e.stderr || e.message || e)); fail++;
  }
}
if (!dry) console.error(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
