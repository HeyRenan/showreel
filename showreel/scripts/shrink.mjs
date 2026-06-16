#!/usr/bin/env node
// shrink.mjs — reduce gif/png file size without visible quality loss.
// Built for UI screenshots/recordings (flat colors, text): re-encode through
// system ffmpeg with palettegen/paletteuse (plain forms only — this build has
// no stat_mode/dither options), fps cap + lanczos downscale for gifs, palette
// quantization for pngs. If the result is larger than the input, the input
// bytes win.
//
//   node shrink.mjs in.gif                          # -> in.min.gif
//   node shrink.mjs in.png out.png --max-width 800
//   node shrink.mjs in.gif out.gif --fps 10 --colors 64
//   node shrink.mjs in.gif --target-kb 1500         # ladder until <= target
//   node shrink.mjs in.gif --in-place               # overwrite input
//
// Defaults: gif fps 12, max-width 960, colors 128; png colors 256, no scale
// unless --max-width. Prints `OK <out> (<before>KB -> <after>KB, -NN%)`.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { num } from './cli-args.mjs';

export const GIF_MAX_KB = 2048;
export const GIF_MAX_SEC = 8;

export function buildGifFilter({ fps = 12, maxWidth = 960, colors = 128 } = {}) {
  // fps/scale stages only when asked: fps re-sampling rewrites the variable
  // frame durations our recorder emits, and downscale is visible — both are
  // quality losses reserved for the explicit --target-kb ladder.
  return [
    ...(fps ? [`fps=${fps}`] : []),
    ...(maxWidth ? [`scale='min(iw,${maxWidth})':-2:flags=lanczos`] : []),
    'split[s0][s1]',
  ].join(',') + `;[s0]palettegen=max_colors=${colors}[p];[s1][p]paletteuse`;
}

export function buildPngFilter({ maxWidth = null, colors = 256, widthFactor = 1 } = {}) {
  const scale = maxWidth
    ? `scale='min(iw,${maxWidth})':-2:flags=lanczos,`
    : widthFactor < 1 ? `scale='trunc(iw*${widthFactor})':-2:flags=lanczos,` : '';
  return `${scale}split[s0][s1];[s0]palettegen=max_colors=${colors}[p];[s1][p]paletteuse`;
}

export function ffmpegArgs(input, out, kind, opts = {}) {
  const tail = kind === 'gif'
    ? ['-filter_complex', buildGifFilter(opts), '-loop', '0']
    : ['-filter_complex', buildPngFilter(opts), '-frames:v', '1'];
  return ['-y', '-v', 'error', '-i', input, ...tail, out];
}

export function ladder(targetKb) {
  if (!targetKb) return [{ fps: null, colors: null, widthFactor: 1, lossless: true }];
  return [
    { fps: 12, colors: 128, widthFactor: 1 },
    { fps: 10, colors: 96, widthFactor: 1 },
    { fps: 10, colors: 64, widthFactor: 1 },
    { fps: 8, colors: 64, widthFactor: 0.85 },
    { fps: 8, colors: 48, widthFactor: 0.7 },
  ];
}

export function pickOut(input, outArg) {
  if (outArg) return outArg;
  const ext = extname(input);
  return input.slice(0, input.length - ext.length) + '.min' + ext;
}

export function parse(argv) {
  const a = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--max-width') a.maxWidth = num('shrink', '--max-width', argv[++i], { int: true, min: 1 });
    else if (k === '--fps') a.fps = num('shrink', '--fps', argv[++i], { int: true, min: 1 });
    else if (k === '--colors') a.colors = num('shrink', '--colors', argv[++i], { int: true, min: 2 });
    else if (k === '--target-kb') a.targetKb = num('shrink', '--target-kb', argv[++i], { min: 1 });
    else if (k === '--in-place') a.inPlace = true;
    else if (k.startsWith('--')) throw new Error('shrink: unknown arg ' + k);
    else a.positional.push(k);
  }
  return a;
}

export function attempts(a, kind) {
  const base = {
    fps: a.fps ?? 12,
    colors: a.colors ?? (kind === 'gif' ? 128 : 256),
    maxWidth: a.maxWidth ?? (kind === 'gif' ? 960 : null),
  };
  return ladder(a.targetKb).map((s) => {
    if (s.lossless) {
      // Default mode: quality-preserving only — palette optimization at full
      // color budget, original fps and size unless the caller asked otherwise.
      return {
        fps: a.fps ?? null,
        colors: a.colors ?? 256,
        widthFactor: 1,
        maxWidth: a.maxWidth ?? null,
      };
    }
    return {
      fps: s.fps ?? base.fps,
      colors: s.colors ?? base.colors,
      widthFactor: s.widthFactor,
      maxWidth: base.maxWidth == null ? null : Math.round(base.maxWidth * s.widthFactor),
    };
  });
}

const kb = (bytes) => Math.round(bytes / 1024);

export function runLadder(attemptsList, targetBytes, encode) {
  if (!attemptsList || !attemptsList.length) throw new Error('runLadder: no encode attempts to run');
  let best = null;
  let passes = 0;
  for (const [i, opts] of attemptsList.entries()) {
    passes += 1;
    const result = encode(opts, i);
    if (!best || result.size < best.size) best = result;
    if (targetBytes && result.size <= targetBytes) break;
  }
  return { best, passes };
}

export function parseGifDurationSec(buf) {
  let centiseconds = 0;
  for (let i = 0; i + 5 < buf.length; i++) {
    if (buf[i] === 0x21 && buf[i + 1] === 0xf9 && buf[i + 2] === 0x04) {
      centiseconds += buf[i + 4] | (buf[i + 5] << 8);
      i += 5;
    }
  }
  return centiseconds / 100;
}

export function gifDurationSec(input) {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', input],
      { encoding: 'utf8' },
    );
    const d = parseFloat(out);
    if (Number.isFinite(d) && d > 0) return d;
  } catch {}
  try { return parseGifDurationSec(readFileSync(input)); } catch { return 0; }
}

export function recommendMp4({ kind, finalKb, targetKb, durationSec }) {
  if (kind !== 'gif') return null;
  const limitKb = targetKb || GIF_MAX_KB;
  if (finalKb > limitKb) return 'over-target-kb';
  if (durationSec > GIF_MAX_SEC) return 'over-8s';
  return null;
}

function main() {
  const a = parse(process.argv.slice(2));
  const input = a.positional[0];
  const kind = input ? extname(input).slice(1).toLowerCase() : '';
  if (!input || (kind !== 'gif' && kind !== 'png')) {
    console.error('usage: shrink.mjs <in.(gif|png)> [out] [--max-width N] [--fps N] [--colors N] [--target-kb N] [--in-place]');
    process.exit(2);
  }
  if (!existsSync(input)) { console.error(`shrink: input not found: ${input}`); process.exit(2); }
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); }
  catch { console.error('shrink: ffmpeg not found — brew install ffmpeg'); process.exit(3); }

  const out = a.inPlace ? input : pickOut(input, a.positional[1]);
  const before = statSync(input).size;
  const targetBytes = a.targetKb ? a.targetKb * 1024 : null;

  const tmp = mkdtempSync(join(tmpdir(), 'shrink-'));
  try {
    const encode = (opts, i) => {
      const candidate = join(tmp, `attempt-${i}.${kind}`);
      execFileSync('ffmpeg', ffmpegArgs(input, candidate, kind, opts), { stdio: ['ignore', 'ignore', 'inherit'] });
      return { path: candidate, size: statSync(candidate).size };
    };
    const { best } = runLadder(attempts(a, kind), targetBytes, encode);
    if (targetBytes && best.size > targetBytes)
      console.error(`shrink: warn — target ${a.targetKb}KB missed, best ${kb(best.size)}KB (ladder exhausted)`);
    let finalSize = best.size;
    if (best.size >= before) {
      finalSize = before;
      if (out !== input) copyFileSync(input, out);
      console.log(`OK ${out} (${kb(before)}KB -> ${kb(before)}KB, -0%) — shrunk result was larger, kept original`);
    } else {
      copyFileSync(best.path, out);
      console.log(`OK ${out} (${kb(before)}KB -> ${kb(best.size)}KB, -${Math.round((1 - best.size / before) * 100)}%)`);
    }
    if (kind === 'gif') {
      const reason = recommendMp4({
        kind,
        finalKb: kb(finalSize),
        targetKb: a.targetKb,
        durationSec: gifDurationSec(input),
      });
      if (reason) console.log(`RECOMMEND-MP4 ${reason}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
