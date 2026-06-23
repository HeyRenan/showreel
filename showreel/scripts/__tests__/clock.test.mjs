import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeClock, buildConcatList } from '../clock.mjs';

// stub io: advance/capture record the protocol traffic; capture mints frame
// names so the duration ledger is observable without a browser.
const stubIO = () => {
  const log = { advances: [], captures: 0, navSettles: [] };
  let n = 0;
  return {
    log,
    io: {
      wait: async () => { log.waits = (log.waits || 0) + 1; },
      advance: async (ms) => { log.advances.push(ms); },
      capture: async () => { log.captures++; return 'f' + String(n++).padStart(4, '0') + '.jpg'; },
      navSettle: async (vt) => { log.navSettles.push(vt); },
    },
  };
};

const sum = (frames) => frames.reduce((s, f) => s + f.dur, 0);

test('offline: hot wait captures one frame per step and keeps the invariant', async () => {
  const { io, log } = stubIO();
  const c = makeClock({ offline: true, fps: 10, io }); // STEP 100
  await c.wait(500, true);
  const frames = c.frames();
  assert.equal(frames.length, 5);
  assert.equal(log.captures, 5);
  assert.equal(sum(frames), 500);
  assert.equal(c.now(), 0.5);
});

test('offline: cold wait is one advance that extends the last frame', async () => {
  const { io, log } = stubIO();
  const c = makeClock({ offline: true, fps: 10, io });
  await c.wait(100, true);
  await c.wait(4500);
  const frames = c.frames();
  assert.equal(frames.length, 1);
  assert.equal(frames[0].dur, 4600);
  assert.equal(log.advances.length, 2);
  assert.equal(sum(frames), 4600);
  assert.equal(c.now(), 4.6);
});

test('offline: cold wait with no frame yet captures the opening frame', async () => {
  const { io } = stubIO();
  const c = makeClock({ offline: true, fps: 10, io });
  await c.wait(500);
  const frames = c.frames();
  assert.equal(frames.length, 1);
  assert.equal(frames[0].dur, 500);
});

test('offline: numeric hot head splits hot frames + cold tail', async () => {
  const { io, log } = stubIO();
  const c = makeClock({ offline: true, fps: 10, io });
  await c.wait(5000, 300); // 300ms hot head (3 frames), 4700 cold tail
  const frames = c.frames();
  assert.equal(frames.length, 3);
  assert.equal(sum(frames), 5000);
  assert.equal(log.captures, 3);
  assert.equal(c.now(), 5);
});

test('offline: motion calls fn with k derived from virtual time, ends at 1', async () => {
  const { io } = stubIO();
  const c = makeClock({ offline: true, fps: 10, io });
  const ks = [];
  await c.motion(300, async (k) => ks.push(k));
  assert.equal(ks[0], 0);
  assert.equal(ks[ks.length - 1], 1);
  assert.equal(ks.length, 4); // 0, 1/3, 2/3, 1
  assert.equal(sum(c.frames()), 300);
});

// the follow camera reads clock.offline to decide whether to JS-drive the
// body transform per motion tick (a CSS transition armed under a paused clock
// never advances in-step). Lock the flag both ways so that branch can't break.
test('clock.offline flag distinguishes the two modes', () => {
  const { io } = stubIO();
  assert.equal(makeClock({ offline: true, fps: 10, io }).offline, true);
  assert.equal(makeClock({ offline: false, io, wallStart: 0 }).offline, false);
});

// in-page promises resolve as virtual frames pump (an awaited rAF animation);
// tie resolution to the advance count so the stub mirrors that coupling.
const promiseAfterAdvances = (io, n, value) => new Promise((resolve, reject) => {
  const base = io.advance;
  let seen = 0;
  io.advance = async (ms) => {
    await base(ms);
    if (++seen === n) (value instanceof Error ? reject : resolve)(value);
  };
});

test('offline: until pumps frames while an in-page promise is pending', async () => {
  const { io } = stubIO();
  const p = promiseAfterAdvances(io, 4);
  const c = makeClock({ offline: true, fps: 10, io });
  await c.until(p);
  assert.ok(c.frames().length >= 4);
  assert.equal(sum(c.frames()), c.now() * 1000);
});

test('offline: until rethrows the promise rejection', async () => {
  const { io } = stubIO();
  const p = promiseAfterAdvances(io, 2, new Error('context was destroyed'));
  const c = makeClock({ offline: true, fps: 10, io });
  await assert.rejects(() => c.until(p), /context was destroyed/);
});

test('offline: concurrent pumpers (scroll leg + glide) keep the invariant', async () => {
  const { io } = stubIO();
  const scroll = promiseAfterAdvances(io, 3);
  const c = makeClock({ offline: true, fps: 10, io });
  await Promise.all([
    c.until(scroll),
    c.motion(400, async () => {}),
  ]);
  assert.equal(sum(c.frames()), c.now() * 1000);
});

test('offline: a navigation re-arms before the next advance', async () => {
  const { io, log } = stubIO();
  const c = makeClock({ offline: true, fps: 10, io });
  await c.wait(200, true);
  c.markNav();
  await c.wait(100, true);
  assert.equal(log.navSettles.length, 1);
  assert.equal(log.navSettles[0], 200);
});

test('offline: capture returning null extends the previous frame', async () => {
  let n = 0;
  const io = {
    wait: async () => {},
    advance: async () => {},
    capture: async () => (n++ === 1 ? null : 'f' + n + '.jpg'),
    navSettle: async () => {},
  };
  const c = makeClock({ offline: true, fps: 10, io });
  await c.wait(300, true);
  const frames = c.frames();
  assert.equal(frames.length, 2);
  assert.equal(sum(frames), 300);
});

test('realtime: wait delegates to io, now reads the wall from wallStart', async () => {
  let slept = 0;
  const c = makeClock({ offline: false, io: { wait: async (ms) => { slept += ms; } }, wallStart: Date.now() - 1500 });
  await c.wait(250, true);
  await c.tick();
  assert.equal(slept, 262);
  assert.ok(c.now() >= 1.5 && c.now() < 3);
  assert.equal(c.frames(), null);
});

test('realtime: motion reaches k=1 and ends on it', async () => {
  const c = makeClock({ offline: false, io: { wait: (ms) => new Promise((r) => setTimeout(r, ms)) } });
  const ks = [];
  await c.motion(40, async (k) => ks.push(k));
  assert.equal(ks[ks.length - 1], 1);
  assert.ok(ks.length >= 2);
});

test('buildConcatList: durations in seconds, last file repeated bare', () => {
  const txt = buildConcatList([
    { file: '/t/f0.jpg', dur: 66.6667 },
    { file: '/t/f1.jpg', dur: 4500 },
  ]);
  const lines = txt.trim().split('\n');
  assert.equal(lines[0], "file '/t/f0.jpg'");
  assert.equal(lines[1], 'duration 0.066667');
  assert.equal(lines[2], "file '/t/f1.jpg'");
  assert.equal(lines[3], 'duration 4.500000');
  assert.equal(lines[4], "file '/t/f1.jpg'");
  assert.equal(buildConcatList([]), '');
});

test('offline slow-mo: a motion at rate 0.25 captures ~4x the frames and plays ~4x longer (smooth)', async () => {
  const { io, log } = stubIO();
  const c = makeClock({ offline: true, fps: 10, io }); // STEP 100ms
  // baseline: a 400ms motion at normal rate
  await c.motion(400, async () => {});
  const baseFrames = c.frames().length;
  const baseDur = sum(c.frames());

  const { io: io2 } = stubIO();
  const c2 = makeClock({ offline: true, fps: 10, io: io2 });
  c2.setRate(0.25);            // quarter-speed slow motion
  await c2.motion(400, async () => {});
  c2.setRate(1);
  const slowFrames = c2.frames().length;
  const slowDur = sum(c2.frames());

  assert.ok(slowFrames >= baseFrames * 3, `slow-mo captures more frames (${slowFrames} vs ${baseFrames})`);
  assert.ok(slowDur >= baseDur * 3, `slow-mo plays back longer (${slowDur}ms vs ${baseDur}ms)`);
});

test('offline fast-forward: a motion at rate 2 captures fewer frames and plays shorter', async () => {
  const { io } = stubIO();
  const c = makeClock({ offline: true, fps: 10, io });
  c.setRate(2);
  await c.motion(400, async () => {});
  c.setRate(1);
  assert.ok(sum(c.frames()) <= 250, `2x speed roughly halves the 400ms playback (got ${sum(c.frames())}ms)`);
});

test('setRate defaults to 1 and realtime clock has a no-op setRate', () => {
  const { io } = stubIO();
  const rt = makeClock({ offline: false, io, wallStart: 0 });
  assert.equal(typeof rt.setRate, 'function');
  rt.setRate(0.5); // must not throw
});

// motion with a degenerate duration must render the end pose once and return,
// never spin: ms<=0 or NaN made k never reach 1 and the pump loop hung forever.
test('offline motion: ms 0 / negative / NaN call fn(1) once, no hang', async () => {
  const { io } = stubIO();
  const c = makeClock({ offline: true, fps: 10, io });
  for (const ms of [0, -100, NaN]) {
    const ks = [];
    await c.motion(ms, async (k) => ks.push(k));
    assert.deepEqual(ks, [1], `ms=${ms} should yield a single k=1 call`);
  }
});

test('realtime motion: ms 0 / negative / NaN call fn(1) once, no hang', async () => {
  const { io } = stubIO();
  const c = makeClock({ offline: false, io, wallStart: 0 });
  for (const ms of [0, -100, NaN]) {
    const ks = [];
    await c.motion(ms, async (k) => ks.push(k));
    assert.deepEqual(ks, [1], `ms=${ms} should yield a single k=1 call`);
  }
});

// ── buildConcatList: the ffmpeg-script escaping contract ───────────────────
test('buildConcatList: a single-quote in a path is escaped for the concat demuxer', () => {
  // ffmpeg concat wraps paths in '...'; a literal quote must close-escape-reopen
  // ('\'') or the demuxer mis-parses the line. A frame from O'Brien's tmp dir.
  const txt = buildConcatList([{ file: "/t/o'brien/f0.jpg", dur: 100 }]);
  assert.ok(txt.includes("'\\''"), 'quote must be escaped as \x27\\\x27\x27');
  assert.ok(!/file '\/t\/o'brien/.test(txt), 'raw unescaped quote must not survive');
});

test('buildConcatList: null / empty frames yield an empty script (no throw)', () => {
  assert.equal(buildConcatList(null), '');
  assert.equal(buildConcatList(undefined), '');
  assert.equal(buildConcatList([]), '');
});

test('buildConcatList: a single frame still repeats its file bare at the end', () => {
  const txt = buildConcatList([{ file: '/t/only.jpg', dur: 1234 }]);
  const lines = txt.trim().split('\n');
  assert.equal(lines.length, 3); // file, duration, file (bare repeat)
  assert.equal(lines[0], "file '/t/only.jpg'");
  assert.equal(lines[2], "file '/t/only.jpg'");
});

// ── degenerate wait / setRate / until ──────────────────────────────────────
test('offline: wait(0) and wait(negative) are no-ops, advance nothing', async () => {
  const { io, log } = stubIO();
  const c = makeClock({ offline: true, fps: 10, io });
  await c.wait(0, true);
  await c.wait(-500);
  assert.equal(c.frames().length, 0);
  assert.equal(log.advances.length, 0);
  assert.equal(c.now(), 0);
});

test('offline: setRate ignores 0 / negative / NaN, holding rate 1', async () => {
  const { io } = stubIO();
  const c = makeClock({ offline: true, fps: 10, io });
  for (const bad of [0, -1, NaN, 'x']) {
    c.setRate(bad);
    const before = c.now();
    await c.motion(200, async () => {});
    // at rate 1, a 200ms motion over STEP 100 plays ~200ms — never 0 / never hung
    assert.ok(c.now() - before >= 0.2 - 1e-9, `rate ${String(bad)} must fall back to 1`);
  }
});

test('offline: until throws after 120s of virtual time on a never-resolving promise', async () => {
  const { io } = stubIO();
  const c = makeClock({ offline: true, fps: 10, io });
  // a promise that NEVER settles — the cap (vt > now+120000) must fire, not spin
  await assert.rejects(() => c.until(new Promise(() => {})), /still pending after 120s/);
});
