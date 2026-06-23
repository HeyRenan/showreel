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
