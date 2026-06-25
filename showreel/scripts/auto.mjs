#!/usr/bin/env node
// auto.mjs — the URL-only quick path. Point it at a page and it discovers the
// salient elements itself, annotates each with a role-based note, and runs the
// SAME vcheck gate as prove.mjs. No hand-authored selectors.
//
//   node auto.mjs <url> [--max N] [--width N] [--height N] [--dpr N] [--out-dir DIR]
//
// One browser launch for all shots. Writes N annotated PNGs + an index.json
// manifest into the out dir (default ./showreel-out/auto/). stdout is the same
// per-element verdict lines prove.mjs prints, then a batch summary:
//   PASS <out> kb=<n>  /  FAIL <out> reason=<short>  /  NO_SPACE <out>  /  ERROR <out>
//   AUTO <k>/<n> PASS|FAIL
// Exit: 0 all PASS, 1 any FAIL, 3 any NO_SPACE/ERROR, 2 no salient elements found.
// The agent consumes index.json; it never has to read a passing PNG.

import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Browser } from '../lib/browser.mjs';
import { proveOne, summarize } from './prove.mjs';
import { rankCandidates, roleLabel, isCircleKind, isSmallTarget, COLLECT_FN } from './auto-rank.mjs';
import { num, str } from './cli-args.mjs';

export function parse(argv) {
  const a = { width: 900, height: 1400, dpr: 1, max: 4, outDir: './showreel-out/auto' };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--max') a.max = num('auto', '--max', argv[++i], { int: true, min: 1 });
    else if (k === '--width') a.width = num('auto', '--width', argv[++i], { int: true, min: 1 });
    else if (k === '--height') a.height = num('auto', '--height', argv[++i], { int: true, min: 1 });
    else if (k === '--dpr') a.dpr = num('auto', '--dpr', argv[++i], { min: 0.1 });
    else if (k === '--out-dir') a.outDir = str('auto', '--out-dir', argv[++i]);
    else if (k.startsWith('--')) throw new Error('auto: unknown arg ' + k);
    else pos.push(k);
  }
  // One positional only (the url). Reject surplus — an unquoted value is the
  // usual cause. Mirrors prove/demo/rec parsers.
  if (pos.length > 1) throw new Error('auto: too many positional args (expected url): ' + pos.slice(1).join(' '));
  [a.url] = pos;
  return a;
}

function outputKb(path) {
  try { return Math.max(1, Math.round(statSync(path).size / 1024)); } catch { return 0; }
}

async function main() {
  const a = parse(process.argv.slice(2));
  if (!a.url) {
    console.error('usage: auto.mjs <url> [--max N] [--width N] [--height N] [--out-dir DIR]');
    process.exit(2);
  }
  mkdirSync(a.outDir, { recursive: true });

  const b = await Browser.launch({ width: a.width, height: a.height, dpr: a.dpr });
  const results = [];
  const shots = [];
  let picks = [], skipped = [];
  try {
    await b.open(a.url);
    await b.freeze();
    const fitted = await b.fitToContent();
    const raw = await b.inject(COLLECT_FN);
    ({ picks, skipped } = rankCandidates(raw, { max: a.max, viewport: { w: fitted.width, h: fitted.height } }));
    for (const s of skipped) console.error(`auto: skipped ${s.role || '?'} (${s.reason})`);

    for (let i = 0; i < picks.length; i++) {
      const pick = picks[i];
      const out = join(a.outDir, `${String(i + 1).padStart(2, '0')}-${pick.role}.png`);
      const job = {
        selector: pick.selector,
        out,
        label: roleLabel(pick.role),
        circle: isCircleKind(pick),
        zoom: isSmallTarget(pick, { w: fitted.width, h: fitted.height }),
      };
      let verdict;
      try { verdict = await proveOne(b, job); }
      catch (e) {
        const msg = String(e.message || e);
        // A discovered element that no longer resolves (SPA re-render, themed
        // dark/light swap) is a soft SKIP for an overview tool, not a capture
        // failure — don't let one vanished element tank the run's verdict.
        if (/selector not found/i.test(msg)) {
          console.error('auto: skipped ' + pick.role + ' (vanished before capture)');
          skipped.push({ role: pick.role, selector: pick.selector, reason: 'vanished' });
          continue;
        }
        console.error(msg); console.log('ERROR ' + out); verdict = 'ERROR';
      }
      results.push(verdict);
      shots.push({ role: pick.role, label: job.label, selector: pick.selector, out, verdict, kb: outputKb(out) });
    }
  } finally {
    await b.close();
  }

  const manifest = {
    url: a.url,
    generatedAt: new Date().toISOString(),
    viewport: { width: a.width, height: a.height },
    verdict: summarize(results).verdict,
    shots,
    skipped: skipped.map((s) => ({ role: s.role, reason: s.reason })),
  };
  const indexPath = join(a.outDir, 'index.json');
  writeFileSync(indexPath, JSON.stringify(manifest, null, 2));

  // "Found nothing salient" is NOT success — summarize([]) would exit 0. Signal
  // it distinctly so a caller can tell it apart from "every shot passed".
  if (picks.length === 0) {
    console.error('auto: no salient elements found — pass an explicit selector to prove.mjs for precise control');
    console.log('AUTO 0/0 FAIL');
    process.exit(2);
  }

  const { line, exitCode } = summarize(results);
  console.log(line.replace('PROVE', 'AUTO'));
  if (exitCode) process.exit(exitCode);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
}
