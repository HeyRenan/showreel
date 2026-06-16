import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extOk, parse, parseLabels, sidecarPath, trimSeconds, videoArgs, videoFilter } from '../compose-video.mjs';

test('videoFilter builds two lanes, label overlays at 2/3, gap pad, hstack shortest, even pad', () => {
  const f = videoFilter({ height: 360, gap: 20, pad: 30 });
  assert.match(f, /\[0:v\]scale=-2:360:flags=lanczos/);
  assert.match(f, /\[1:v\]scale=-2:360:flags=lanczos/);
  assert.match(f, /pad=iw:ih\+44:0:44:0xf1f5f9\[b0\]/, 'lane label bar must be light for dark-text labels');
  assert.match(f, /pad=iw:ih\+44:0:44:0xf1f5f9\[b1\]/);
  assert.match(f, /\[b0\]\[2:v\]overlay=14:10\[l0\]/);
  assert.match(f, /\[b1\]\[3:v\]overlay=14:10\[l1\]/);
  assert.match(f, /\[l0\]pad=iw\+20:ih:0:0:0x0d1117\[v0\]/);
  assert.match(f, /\[v0\]\[l1\]hstack=shortest=1/);
  assert.match(f, /pad=iw\+60:ih\+60:30:30:0x0d1117/);
  assert.match(f, /pad=ceil\(iw\/2\)\*2:ceil\(ih\/2\)\*2:0:0:0x0d1117/, 'must pad to even dims for yuv420p');
});

test('videoFilter defaults: height 480, gap 24, pad 28, no fps cap, no palette', () => {
  const f = videoFilter();
  assert.match(f, /scale=-2:480/);
  assert.match(f, /pad=iw\+24:ih:0:0/);
  assert.match(f, /pad=iw\+56:ih\+56:28:28/);
  assert.doesNotMatch(f, /fps=/);
  assert.doesNotMatch(f, /palettegen/);
});

test('videoArgs: x264 encode settings, faststart, out last, no -ss at zero trims', () => {
  const args = videoArgs({ aIn: 'a.webm', bIn: 'b.webm', la: 'la.png', lb: 'lb.png', out: 'out.mp4', filter: 'F' });
  assert.deepEqual(args.slice(0, 3), ['-y', '-v', 'error']);
  assert.ok(!args.includes('-ss'));
  assert.equal(args.filter((x) => x === '-i').length, 4);
  assert.equal(args[args.indexOf('-filter_complex') + 1], 'F');
  assert.equal(args[args.indexOf('-c:v') + 1], 'libx264');
  assert.equal(args[args.indexOf('-crf') + 1], '20');
  assert.equal(args[args.indexOf('-preset') + 1], 'veryfast');
  assert.equal(args[args.indexOf('-pix_fmt') + 1], 'yuv420p');
  assert.equal(args[args.indexOf('-movflags') + 1], '+faststart');
  assert.ok(args.includes('-an'));
  assert.equal(args.at(-1), 'out.mp4');
});

test('videoArgs: per-input -ss precedes its own -i', () => {
  const args = videoArgs({ aIn: 'a.webm', bIn: 'b.mp4', la: 'la.png', lb: 'lb.png', out: 'o.mp4', filter: 'F', trims: [1.5, 0.75] });
  const ia = args.indexOf('a.webm'), ib = args.indexOf('b.mp4');
  assert.deepEqual(args.slice(ia - 3, ia), ['-ss', '1.5', '-i']);
  assert.deepEqual(args.slice(ib - 3, ib), ['-ss', '0.75', '-i']);
});

test('videoArgs: mixed trims — only the nonzero input gets -ss', () => {
  const args = videoArgs({ aIn: 'a.webm', bIn: 'b.webm', la: 'l.png', lb: 'l.png', out: 'o.mp4', filter: 'F', trims: [0, 2] });
  assert.equal(args.filter((x) => x === '-ss').length, 1);
  assert.deepEqual(args.slice(args.indexOf('b.webm') - 3, args.indexOf('b.webm')), ['-ss', '2', '-i']);
});

test('trimSeconds: no flag — no trimming', () => {
  assert.deepEqual(trimSeconds(false, { trimSec: 3 }, { trimSec: 4 }), { a: 0, b: 0 });
  assert.deepEqual(trimSeconds(undefined, null, null), { a: 0, b: 0 });
});

test('trimSeconds: both sidecars — each input trimmed by its own trimSec', () => {
  const t = trimSeconds(true, { trimSec: 2.4 }, { trimSec: 0.8 });
  assert.deepEqual(t, { a: 2.4, b: 0.8 });
  assert.deepEqual(trimSeconds(true, { trimSec: 0 }, { trimSec: 1 }), { a: 0, b: 1 }, 'trimSec 0 is a valid sidecar value');
});

test('trimSeconds: missing sidecar(s) — warn + 1.0s default on both', () => {
  for (const [a, b] of [[null, null], [{ trimSec: 2 }, null], [null, { trimSec: 2 }], [{}, { trimSec: 2 }]]) {
    const t = trimSeconds(true, a, b);
    assert.equal(t.a, 1);
    assert.equal(t.b, 1);
    assert.match(t.warn, /1\.0s default/);
  }
});

test('sidecarPath appends .timeline.json to the input path', () => {
  assert.equal(sidecarPath('a.webm'), 'a.webm.timeline.json');
  assert.equal(sidecarPath('/tmp/take.mp4'), '/tmp/take.mp4.timeline.json');
});

test('parseLabels: BEFORE,AFTER default, trims, caps at two', () => {
  assert.deepEqual(parseLabels(), ['BEFORE', 'AFTER']);
  assert.deepEqual(parseLabels(' old , new '), ['old', 'new']);
  assert.deepEqual(parseLabels('a,b,c'), ['a', 'b']);
});

test('parse reads flags and positionals', () => {
  const a = parse(['a.webm', 'b.mp4', 'out.mp4', '--labels', 'Old,New', '--height', '360', '--gap', '12', '--sync-trim']);
  assert.equal(a.aIn, 'a.webm');
  assert.equal(a.bIn, 'b.mp4');
  assert.equal(a.out, 'out.mp4');
  assert.equal(a.labels, 'Old,New');
  assert.equal(a.height, 360);
  assert.equal(a.gap, 12);
  assert.equal(a.syncTrim, true);
});

test('parse defaults: height 480, gap 24, no sync-trim', () => {
  const a = parse(['a.webm', 'b.webm', 'o.mp4']);
  assert.equal(a.height, 480);
  assert.equal(a.gap, 24);
  assert.equal(a.syncTrim, undefined);
});

test('parse rejects unknown flags', () => {
  assert.throws(() => parse(['a.webm', 'b.webm', 'o.mp4', '--fps', '30']), /unknown arg --fps/);
});

test('extOk: usage on missing positionals, rejects bad extensions', () => {
  assert.equal(extOk({ aIn: 'a.webm', bIn: 'b.webm' }), 'usage');
  assert.match(extOk({ aIn: 'a.gif', bIn: 'b.webm', out: 'o.mp4' }), /inputs must be/);
  assert.match(extOk({ aIn: 'a.webm', bIn: 'b.webm', out: 'o.gif' }), /output must be \.mp4/);
  assert.equal(extOk({ aIn: 'a.webm', bIn: 'b.mp4', out: 'o.mp4' }), null);
  assert.equal(extOk({ aIn: 'A.WEBM', bIn: 'B.MP4', out: 'O.MP4' }), null);
});
