import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GIF_MAX_KB, GIF_MAX_SEC, attempts, buildGifFilter, buildPngFilter, ffmpegArgs,
  ladder, parse, parseGifDurationSec, pickOut, recommendMp4, runLadder,
} from '../shrink.mjs';

test('buildGifFilter defaults: fps 12, max-width 960, colors 128', () => {
  assert.equal(
    buildGifFilter(),
    "fps=12,scale='min(iw,960)':-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse",
  );
});

test('buildGifFilter honors fps/maxWidth/colors', () => {
  assert.equal(
    buildGifFilter({ fps: 8, maxWidth: 640, colors: 48 }),
    "fps=8,scale='min(iw,640)':-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=48[p];[s1][p]paletteuse",
  );
});

test('buildPngFilter default: no scale, colors 256', () => {
  assert.equal(buildPngFilter(), 'split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse');
});

test('buildPngFilter scales only when maxWidth given', () => {
  assert.equal(
    buildPngFilter({ maxWidth: 800, colors: 128 }),
    "scale='min(iw,800)':-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse",
  );
});

test('buildPngFilter applies widthFactor when no maxWidth', () => {
  assert.equal(
    buildPngFilter({ widthFactor: 0.85 }),
    "scale='trunc(iw*0.85)':-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse",
  );
});

test('ffmpegArgs gif: -loop 0, no -frames:v', () => {
  const args = ffmpegArgs('in.gif', 'out.gif', 'gif', { fps: 12, maxWidth: 960, colors: 128 });
  assert.deepEqual(args.slice(0, 5), ['-y', '-v', 'error', '-i', 'in.gif']);
  assert.ok(args.includes('-loop') && args[args.indexOf('-loop') + 1] === '0');
  assert.ok(!args.includes('-frames:v'));
  assert.equal(args.at(-1), 'out.gif');
});

test('ffmpegArgs png: -frames:v 1, no -loop', () => {
  const args = ffmpegArgs('in.png', 'out.png', 'png', { colors: 256 });
  assert.ok(args.includes('-frames:v') && args[args.indexOf('-frames:v') + 1] === '1');
  assert.ok(!args.includes('-loop'));
  assert.equal(args.at(-1), 'out.png');
});

test('ladder with target: 5 attempts in exact order', () => {
  assert.deepEqual(ladder(1500), [
    { fps: 12, colors: 128, widthFactor: 1 },
    { fps: 10, colors: 96, widthFactor: 1 },
    { fps: 10, colors: 64, widthFactor: 1 },
    { fps: 8, colors: 64, widthFactor: 0.85 },
    { fps: 8, colors: 48, widthFactor: 0.7 },
  ]);
});

test('ladder without target: single lossless attempt', () => {
  assert.deepEqual(ladder(), [{ fps: null, colors: null, widthFactor: 1, lossless: true }]);
  assert.deepEqual(ladder(0), [{ fps: null, colors: null, widthFactor: 1, lossless: true }]);
});

test('attempts merges ladder over flags and scales base width', () => {
  const list = attempts({ targetKb: 500 }, 'gif');
  assert.equal(list.length, 5);
  assert.deepEqual(list[0], { fps: 12, colors: 128, widthFactor: 1, maxWidth: 960 });
  assert.deepEqual(list[3], { fps: 8, colors: 64, widthFactor: 0.85, maxWidth: 816 });
  assert.deepEqual(list[4], { fps: 8, colors: 48, widthFactor: 0.7, maxWidth: 672 });
});

test('attempts without target is quality-preserving: no fps resample, no downscale, full palette', () => {
  assert.deepEqual(attempts({}, 'gif'),
    [{ fps: null, colors: 256, widthFactor: 1, maxWidth: null }]);
  assert.deepEqual(attempts({}, 'png'),
    [{ fps: null, colors: 256, widthFactor: 1, maxWidth: null }]);
  assert.deepEqual(attempts({ fps: 10, colors: 64, maxWidth: 800 }, 'gif'),
    [{ fps: 10, colors: 64, widthFactor: 1, maxWidth: 800 }]);
});

test('buildGifFilter omits fps and scale stages when unset', () => {
  const f = buildGifFilter({ fps: null, maxWidth: null, colors: 256 });
  assert.ok(!f.includes('fps='));
  assert.ok(!f.includes('scale='));
  assert.ok(f.includes('palettegen=max_colors=256'));
});

test('pickOut default naming: in.gif -> in.min.gif', () => {
  assert.equal(pickOut('in.gif'), 'in.min.gif');
  assert.equal(pickOut('/tmp/shots/hero.png'), '/tmp/shots/hero.min.png');
});

test('pickOut respects explicit out', () => {
  assert.equal(pickOut('in.gif', '/tmp/custom.gif'), '/tmp/custom.gif');
});

test('parse reads flags and positionals', () => {
  const a = parse(['in.gif', 'out.gif', '--max-width', '800', '--fps', '10', '--colors', '64', '--target-kb', '1500', '--in-place']);
  assert.deepEqual(a.positional, ['in.gif', 'out.gif']);
  assert.equal(a.maxWidth, 800);
  assert.equal(a.fps, 10);
  assert.equal(a.colors, 64);
  assert.equal(a.targetKb, 1500);
  assert.equal(a.inPlace, true);
});

test('parse rejects unknown flags', () => {
  assert.throws(() => parse(['in.gif', '--quality', '9']), /unknown arg --quality/);
});

test('video policy constants per spec', () => {
  assert.equal(GIF_MAX_KB, 2048);
  assert.equal(GIF_MAX_SEC, 8);
});

const sized = (sizes) => {
  const calls = [];
  const encode = (opts, i) => { calls.push(i); return { path: `p${i}`, size: sizes[i] }; };
  return { calls, encode };
};

test('runLadder stops at FIRST pass meeting target', () => {
  const list = attempts({ targetKb: 1 }, 'gif');
  const { calls, encode } = sized([5000, 1000, 900, 800, 700]);
  const { best, passes } = runLadder(list, 1024, encode);
  assert.equal(passes, 2);
  assert.deepEqual(calls, [0, 1]);
  assert.deepEqual(best, { path: 'p1', size: 1000 });
});

test('runLadder first pass meeting target exits after 1 encode', () => {
  const list = attempts({ targetKb: 10 }, 'gif');
  const { calls, encode } = sized([500, 400, 300, 200, 100]);
  const { best, passes } = runLadder(list, 10 * 1024, encode);
  assert.equal(passes, 1);
  assert.deepEqual(calls, [0]);
  assert.equal(best.size, 500);
});

test('runLadder no pass meets target: runs all, keeps best so far', () => {
  const list = attempts({ targetKb: 1 }, 'gif');
  const { calls, encode } = sized([5000, 4000, 4500, 3000, 3500]);
  const { best, passes } = runLadder(list, 1024, encode);
  assert.equal(passes, 5);
  assert.deepEqual(calls, [0, 1, 2, 3, 4]);
  assert.deepEqual(best, { path: 'p3', size: 3000 });
});

test('runLadder without target runs single passthrough attempt', () => {
  const list = attempts({}, 'gif');
  const { calls, encode } = sized([5000]);
  const { passes } = runLadder(list, null, encode);
  assert.equal(passes, 1);
  assert.deepEqual(calls, [0]);
});

test('recommendMp4: gif over explicit target', () => {
  assert.equal(recommendMp4({ kind: 'gif', finalKb: 1600, targetKb: 1500, durationSec: 3 }), 'over-target-kb');
});

test('recommendMp4: gif over 8s', () => {
  assert.equal(recommendMp4({ kind: 'gif', finalKb: 500, targetKb: 1500, durationSec: 8.5 }), 'over-8s');
});

test('recommendMp4: both conditions -> over-target-kb wins', () => {
  assert.equal(recommendMp4({ kind: 'gif', finalKb: 1600, targetKb: 1500, durationSec: 12 }), 'over-target-kb');
});

test('recommendMp4: no targetKb defaults to GIF_MAX_KB for gifs', () => {
  assert.equal(recommendMp4({ kind: 'gif', finalKb: 2049, targetKb: undefined, durationSec: 2 }), 'over-target-kb');
  assert.equal(recommendMp4({ kind: 'gif', finalKb: 2048, targetKb: undefined, durationSec: 2 }), null);
});

test('recommendMp4: under target and under 8s -> null', () => {
  assert.equal(recommendMp4({ kind: 'gif', finalKb: 900, targetKb: 1500, durationSec: 5 }), null);
});

test('recommendMp4: never for png', () => {
  assert.equal(recommendMp4({ kind: 'png', finalKb: 99999, targetKb: 100, durationSec: 99 }), null);
});

test('parseGifDurationSec sums graphics control extension delays', () => {
  const gce = (cs) => [0x21, 0xf9, 0x04, 0x00, cs & 0xff, cs >> 8, 0x00, 0x00];
  const buf = Buffer.from([0x47, 0x49, 0x46, ...gce(50), 0x2c, ...gce(250), 0x3b]);
  assert.equal(parseGifDurationSec(buf), 3);
});

test('parseGifDurationSec on non-gif bytes is 0', () => {
  assert.equal(parseGifDurationSec(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), 0);
});
