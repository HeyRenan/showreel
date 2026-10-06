import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// cli-args.mjs — shared CLI argument helpers.
//
// Every recorder script consumes numeric flags with `+argv[++i]`, which turns
// a typo (`--width abc`) into NaN silently — the failure then surfaces deep in
// Playwright as "viewport.width: expected integer, got float NaN", with no clue
// which flag was wrong. `num()` validates at the point of parse and throws a
// message that names the flag and what it got.

// Parse a numeric flag value. `flag` is the flag name (for the error), `raw`
// is the next argv token. Throws a clear, scoped error on a missing or
// non-numeric value. `opts.int` requires an integer; `opts.min` enforces a
// floor (e.g. a width can't be 0).
export function num(scope, flag, raw, opts = {}) {
  // trim first: Number('   ') is 0, not NaN, so a whitespace-only value would
  // slip through as a silent 0 — the exact silent-wrong-value this module exists
  // to prevent. An all-whitespace token counts as missing.
  if (raw == null || String(raw).trim() === '') throw new Error(`${scope}: ${flag} needs a number`);
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${scope}: ${flag} must be a number, got "${raw}"`);
  if (opts.int && !Number.isInteger(n)) throw new Error(`${scope}: ${flag} must be a whole number, got "${raw}"`);
  if (opts.min != null && n < opts.min) throw new Error(`${scope}: ${flag} must be >= ${opts.min}, got ${n}`);
  return n;
}

// Parse a string flag value. A string flag with `argv[++i]` silently swallows
// the NEXT flag when its value is missing (`--label --circle` makes the label
// literally "--circle" and drops --circle). `str()` rejects a missing value or
// one that is itself a flag, naming the offending flag.
export function str(scope, flag, raw) {
  if (raw == null || raw === '' || /^--/.test(raw)) throw new Error(`${scope}: ${flag} needs a value`);
  return raw;
}

// --do takes inline JSON or a path to a JSON file: the steps that put the page
// in the state to capture (see Browser.prepare for the step shapes).
export function parseDo(scope, raw) {
  const text = str(scope, '--do', raw);
  let steps;
  try {
    steps = JSON.parse(/^\s*[\[{]/.test(text) ? text : readFileSync(text, 'utf8'));
  } catch (e) {
    throw new Error(`${scope}: --do must be a JSON array of steps (inline or a file path): ${e.message}`);
  }
  if (!Array.isArray(steps)) throw new Error(`${scope}: --do must be a JSON array of steps`);
  return steps;
}

// True when `metaUrl` is the script node was started with. Compares real paths
// as file URLs: a plain `file://${argv[1]}` string breaks on a space in the path
// (URL-encoded in import.meta.url) or a symlink, and the script then silently
// does nothing. As a side effect, `--help` / `-h` on a main script prints the
// script's own leading comment block (its usage) and exits 0.
export function isMain(metaUrl) {
  if (!process.argv[1]) return false;
  let entry;
  try { entry = pathToFileURL(realpathSync(process.argv[1])).href; } catch { return false; }
  if (entry !== metaUrl) return false;
  if (process.argv.slice(2).some((a) => a === '--help' || a === '-h')) {
    const lines = readFileSync(fileURLToPath(metaUrl), 'utf8').split('\n')
      .filter((l) => !l.startsWith('#!'));
    const header = [];
    for (const l of lines) { if (!l.startsWith('//')) break; header.push(l.replace(/^\/\/ ?/, '')); }
    console.log(header.join('\n'));
    process.exit(0);
  }
  return true;
}
