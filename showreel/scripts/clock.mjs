// clock.mjs — the take's single source of time. Every wait, glide tick and
// timeline stamp in rec.mjs goes through one clock object, so realtime and
// offline rendering are two implementations of the same contract — no
// if (offline) forks inside the recording loop.
//
//   realtime: now() reads the wall, wait() sleeps the page, motion() is the
//             proven wall-clock glide loop (each mouse.move costs a protocol
//             round-trip; counting iterations would overshoot the duration).
//   offline:  the page clock is paused (Emulation.setVirtualTimePolicy) and
//             time only passes when the clock advances it. HOT spans (things
//             animating on screen) advance one frame step at a time and
//             capture a screenshot per step; COLD spans (static dwells)
//             advance in one jump and extend the LAST captured frame's
//             duration — a 4.5s reading hold costs one CDP call instead of
//             4.5 seconds. The frame list feeds ffmpeg's concat demuxer; the
//             invariant the encoder relies on is
//                 sum(frame durations) == now() == chrome/step timestamps.
//
// wait(ms, hot): hot=false (default) cold, hot=true all-hot, hot=<number>
// hot for that head then cold for the tail — overlay fades and badge
// staggers animate inside the first slice of an otherwise static hold.
//
// io (injected, unit-testable):
//   wait(ms)        host sleep (realtime only)
//   advance(ms)     advance virtual time, resolve on budget expired
//   capture(vtMs)   screenshot now -> frame file path (null = skip frame)
//   navSettle(vtMs) wall-clock load wait + re-arm virtual time after a
//                   navigation (the renderer swap dropped the paused policy)

export function makeClock({ offline = false, fps = 15, io, wallStart }) {
  if (!offline) {
    const t0 = wallStart ?? Date.now();
    return {
      offline: false,
      now: () => (Date.now() - t0) / 1000,
      wait: (ms) => io.wait(ms),
      tick: () => io.wait(12),
      motion: async (ms, fn) => {
        // non-positive/non-finite duration -> end pose once, no spin (NaN would
        // make k never reach 1 and loop forever; realtime has no frame cap).
        if (!(ms > 0)) { await fn(1); return; }
        const m0 = Date.now();
        for (;;) {
          const k = Math.min(1, (Date.now() - m0) / ms);
          await fn(k);
          if (k >= 1) break;
          await io.wait(12);
        }
      },
      until: (p) => p,
      markNav: () => {},
      // playback-speed control is a no-op realtime: recordVideo is bound to the
      // wall clock, so a segment cannot be captured slower/faster than it plays.
      // (This is exactly what the virtual clock unlocks offline.)
      setRate: () => {},
      frames: () => null,
      flush: async () => null,
    };
  }

  const STEP = 1000 / fps;
  // playback rate for motion segments. 1 = normal. <1 = slow motion (advance
  // virtual time in FINER steps so the same animation is sampled into more
  // frames — genuinely smooth slow-mo, not a stretched still), >1 = fast.
  // Only the virtual clock can do this: it samples the animation at whatever
  // density it likes, decoupled from any wall clock.
  let rate = 1;
  let vt = 0;
  let navDirty = false;
  const frames = [];
  // one pump at a time: concurrent waiters (a scroll leg riding Promise.all
  // with a cursor glide) interleave frame by frame instead of double-advancing
  // mid-capture. Progress is read back from vt, so a waiter whose time was
  // advanced by ANOTHER pump simply finishes in fewer iterations.
  let lock = Promise.resolve();
  const withLock = (fn) => {
    const run = lock.then(fn);
    lock = run.then(() => {}, () => {});
    return run;
  };
  const settleNav = async () => {
    if (!navDirty) return;
    navDirty = false;
    await io.navSettle(vt);
  };
  // one captured frame. Virtual time advances by STEP*rate: at rate 1 that's a
  // normal frame; at rate<1 (slow motion) time creeps forward in finer slices,
  // so an animation in flight (a camera transition, a fade, a glide) is sampled
  // into MORE distinct frames — smooth slow-mo, not a stretched still. Each
  // frame still PLAYS for STEP, so output time = frameCount*STEP scales 1/rate.
  // rate>1 samples coarsely → fewer frames → fast forward. Cold/static spans
  // ignore rate (nothing animates to sample).
  const pump1 = () => withLock(async () => {
    await settleNav();
    const adv = STEP * rate;
    await io.advance(adv);
    vt += adv;
    const f = await io.capture(vt);
    if (f) frames.push({ file: f, dur: STEP });
    else if (frames.length) frames[frames.length - 1].dur += STEP;
  });
  const cold = (ms) => withLock(async () => {
    if (ms <= 0) return;
    await settleNav();
    await io.advance(ms);
    vt += ms;
    if (frames.length) frames[frames.length - 1].dur += ms;
    else {
      const f = await io.capture(vt);
      if (f) frames.push({ file: f, dur: ms });
    }
  });
  const pumpUntil = async (target) => {
    while (vt < target - 0.5) await pump1();
  };

  return {
    offline: true,
    now: () => vt / 1000,
    wait: async (ms, hot = false) => {
      if (!ms || ms <= 0) return;
      if (hot === true) return pumpUntil(vt + ms);
      if (typeof hot === 'number' && hot > 0) {
        const head = Math.min(ms, hot);
        const end = vt + ms;
        await pumpUntil(vt + head);
        return cold(end - vt);
      }
      return cold(ms);
    },
    tick: () => pump1(),
    setRate: (r) => { rate = (typeof r === 'number' && r > 0) ? r : 1; },
    motion: async (ms, fn) => {
      // k tracks animation progress over its nominal ms; pump1 advances vt by
      // STEP*rate, so slow-mo (rate<1) takes more pumps to reach k=1 = more
      // sampled frames = smooth slow motion. Rate lives in pump1 (shared with
      // hot waits: camera transitions, fades, staggers all slow together).
      // a non-positive or non-finite duration has no animation window: render
      // the end pose once and return. Without this, ms<=0/NaN makes k never
      // reach 1 and the pump loop spins forever (a silent render hang).
      if (!(ms > 0)) { await fn(1); return; }
      const t0 = vt;
      for (;;) {
        const k = Math.min(1, (vt - t0) / ms);
        await fn(k);
        if (k >= 1) break;
        await pump1();
      }
    },
    until: async (p) => {
      let done = false, err = null, has = false;
      Promise.resolve(p).then(
        () => { done = true; },
        (e) => { done = true; err = e; has = true; },
      );
      const cap = vt + 120000;
      while (!done) {
        if (vt > cap) throw new Error('clock.until: in-page promise still pending after 120s of virtual time');
        await pump1();
      }
      if (has) throw err;
    },
    markNav: () => { navDirty = true; },
    frames: () => frames,
    flush: () => withLock(async () => frames),
  };
}

// ffmpeg concat demuxer script for the captured stills. Durations in seconds;
// the final file repeats WITHOUT a duration so the last frame's hold counts
// (concat quirk: a trailing duration on the last entry is ignored).
export function buildConcatList(frames) {
  if (!frames || !frames.length) return '';
  const esc = (p) => String(p).replace(/'/g, "'\\''");
  const lines = [];
  for (const f of frames) {
    lines.push(`file '${esc(f.file)}'`);
    lines.push(`duration ${(f.dur / 1000).toFixed(6)}`);
  }
  lines.push(`file '${esc(frames[frames.length - 1].file)}'`);
  return lines.join('\n') + '\n';
}
