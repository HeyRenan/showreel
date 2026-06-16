// rec-encode.mjs — the ffmpeg encode stage: webm/concat stills -> gif/mp4
// with letterbox strip overlays. Extracted from rec.mjs (stage 3). The
// artifact object { webm, listPath, chrome, pageTheme, pageBg, vidDir,
// stepTimes, endT0 } is the contract between recordTake and convertOutputs.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { ffmpegPath, ffmpegHasPalette } from './ensure-deps.mjs';
import { padToRatio } from './rec-steps.mjs';

function ffmpegHasFade(ff) {
  try { return /\sfade\s+V->V/.test(execFileSync(ff, ['-hide_banner', '-filters'], { encoding: 'utf8' })); }
  catch { return false; }
}

// Letterbox chrome assets: each unique bar/pill text renders ONCE as a
// transparent 44px-tall PNG on the self-contained browser canvas (one launch
// for all strips — the compose.mjs labelPngs pattern), at the FINAL gif width.
// Strip is light on dark pages, dark on light pages; pills invert the strip.
// Mutates each event with {png, x}; bar left, pills right, widths measured on

async function renderChromeStrips(events, { width, theme, dir }) {
  const { Browser } = await import('../lib/browser.mjs');
  const b = await Browser.launch({ width: Math.max(320, width), height: 80, dpr: 1 });
  const ink = theme === 'dark' ? '#0f172a' : '#f1f5f9';
  const pill = theme === 'dark' ? { bg: '#0f172a', ink: '#f8fafc' } : { bg: '#f1f5f9', ink: '#0f172a' };
  const key = (ev) => ev.lane + '\x00' + ev.slot + '\x00' + ev.text;
  try {
    const render = (spec) => b.page.evaluate(({ kind, text, ink, pillBg, pillInk, maxW }) => {
      const FONT = 'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
      const H = 44;
      const cv = document.createElement('canvas');
      let ctx = cv.getContext('2d');
      const fit = (f, t) => {
        ctx.font = f;
        if (ctx.measureText(t).width <= maxW) return t;
        while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
        return t + '…';
      };
      if (kind === 'barbg') {
        cv.width = maxW; cv.height = H;
        ctx = cv.getContext('2d');
        ctx.fillStyle = ink;
        ctx.fillRect(0, 0, maxW, H);
      } else if (kind === 'bar') {
        const f = '600 15px ' + FONT;
        const t = fit(f, text);
        cv.width = Math.max(2, Math.ceil(ctx.measureText(t).width) + 4);
        cv.height = H;
        ctx = cv.getContext('2d');
        ctx.font = f; ctx.fillStyle = ink; ctx.textBaseline = 'middle';
        ctx.fillText(t, 2, H / 2 + 1);
      } else {
        const f = '700 13px ' + FONT;
        const t = fit(f, text);
        const tw = Math.ceil(ctx.measureText(t).width);
        const pw = tw + 26, ph = 26;
        cv.width = pw + 2; cv.height = H;
        ctx = cv.getContext('2d');
        ctx.font = f; ctx.textBaseline = 'middle';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(1, (H - ph) / 2, pw, ph, 13);
        else ctx.rect(1, (H - ph) / 2, pw, ph);
        ctx.fillStyle = pillBg; ctx.fill();
        ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = pillInk;
        ctx.fillText(t, 14, H / 2 + 1);
      }
      return { url: cv.toDataURL('image/png'), w: cv.width };
    }, spec);

    const uniq = new Map();
    for (const ev of events) if (!uniq.has(key(ev))) uniq.set(key(ev), { lane: ev.lane, slot: ev.slot, text: ev.text });
    const assets = new Map();
    let maxScreenW = 0, maxStampW = 0;
    for (const [k, u] of uniq) {
      if (u.slot === 'bar') continue;
      const r = await render({ kind: 'pill', text: u.text, ink, pillBg: pill.bg, pillInk: pill.ink, maxW: width / 2 });
      assets.set(k, r);
      if (u.slot === 'screen') maxScreenW = Math.max(maxScreenW, r.w);
      else maxStampW = Math.max(maxStampW, r.w);
    }
    const anyScreen = events.some((e) => e.slot === 'screen');
    const topHasBar = events.some((e) => e.lane === 'top' && e.slot === 'bar');
    const stampRight = topHasBar; // bar text owns the left of the top strip
    const reservedTop = (anyScreen ? maxScreenW + 10 : 0) + (stampRight && maxStampW ? maxStampW + 10 : 0);
    for (const [k, u] of uniq) {
      if (u.slot !== 'bar') continue;
      const maxW = u.lane === 'top' ? width - 40 - reservedTop : width - 32;
      assets.set(k, await render({ kind: 'bar', text: u.text, ink, pillBg: pill.bg, pillInk: pill.ink, maxW: Math.max(60, maxW) }));
    }
    // the bar's strip background is an overlay too — it appears and vanishes
    // WITH the bar text, so the lane outside the bar window stays page-toned
    const hasBar = events.some((e) => e.slot === 'bar');
    const bg = hasBar
      ? await render({ kind: 'barbg', text: '', ink: theme === 'dark' ? '#f1f5f9' : '#0f172a', pillBg: pill.bg, pillInk: pill.ink, maxW: width })
      : null;
    let n = 0;
    if (bg) {
      bg.path = join(dir, 'chrome-bg.png');
      writeFileSync(bg.path, Buffer.from(bg.url.split(',')[1], 'base64'));
    }
    for (const r of assets.values()) {
      r.path = join(dir, 'chrome-' + n++ + '.png');
      writeFileSync(r.path, Buffer.from(r.url.split(',')[1], 'base64'));
    }
    const bgEvents = [];
    for (const ev of events) {
      const r = assets.get(key(ev));
      ev.png = r.path;
      ev.x = ev.slot === 'bar' ? 14
        : ev.slot === 'screen' ? width - 14 - r.w
        : stampRight ? width - 14 - (anyScreen ? maxScreenW + 10 : 0) - r.w : 14;
      if (ev.slot === 'bar' && bg) bgEvents.push({ ...ev, slot: 'barbg', text: '', png: bg.path, x: 0 });
    }
    return [...bgEvents, ...events];
  } finally {
    await b.close();
  }
}

export async function convertOutputs(a, { webm, listPath, chrome, pageTheme, pageBg, vidDir, stepTimes, endT0 }) {
  const ff = ffmpegPath();
  const TRIM_S = webm ? 1.0 : 0;
  const SRC = webm
    ? ['-ss', TRIM_S.toFixed(1), '-i', webm]
    : ['-f', 'concat', '-safe', '0', '-i', listPath];
  const gifW = a.gifWidth || a.width;
  const vf = `fps=${a.fps},scale=${gifW}:-2:flags=lanczos`;
  // Letterbox composite: chrome timestamps shift by the head-trim; events that
  // ended inside the trimmed head drop out. The page canvas pads +44px per
  // used lane (strip color from the page theme) and each strip PNG overlays
  // inside its window — fade in/out 0.35s when this ffmpeg has the fade
  // filter, hard cut otherwise.
  const events = chrome
    .map((ev) => ({ ...ev, t0: Math.max(0, ev.tStart - TRIM_S), t1: ev.tEnd == null ? 9999 : Math.max(0, ev.tEnd - TRIM_S) }))
    .filter((ev) => ev.t1 > ev.t0 + 0.05);
  const padTop = events.some((e) => e.lane === 'top') ? 44 : 0;
  const padBottom = events.some((e) => e.lane === 'bottom') ? 44 : 0;
  const stripHex = pageTheme === 'dark' ? '0xf1f5f9' : '0x0f172a';
  const fadeOk = events.length ? ffmpegHasFade(ff) : false;
  const stripsAt = async (width) => {
    const evs = events.map((ev) => ({ ...ev }));
    return await renderChromeStrips(evs, { width, theme: pageTheme, dir: vidDir });
  };
  // The final canvas (page + strips) is padded to the requested aspect in the
  // PAGE tone — a contrast fill reads as glaring bars around the page; the
  // strips alone keep contrast because their text needs it.
  const fillHex = pageBg || (pageTheme === 'dark' ? '0x0b1220' : '0xf8fafc');
  const RPAD = padToRatio(a.ratio, fillHex);
  const overlayGraph = (evs, baseVf) => {
    const parts = [`[0:v]${baseVf},pad=iw:ih+${padTop + padBottom}:0:${padTop}:${fillHex}[c0]`];
    let cur = 'c0';
    evs.forEach((ev, i) => {
      let lbl = (i + 1) + ':v';
      if (fadeOk) {
        const f = ['format=rgba', `fade=t=in:st=${ev.t0.toFixed(2)}:d=0.35:alpha=1`];
        if (ev.t1 < 9000) f.push(`fade=t=out:st=${Math.max(ev.t0, ev.t1 - 0.35).toFixed(2)}:d=0.35:alpha=1`);
        parts.push(`[${i + 1}:v]${f.join(',')}[f${i}]`);
        lbl = 'f' + i;
      }
      const y = ev.lane === 'top' ? '0' : 'main_h-44';
      parts.push(`[${cur}][${lbl}]overlay=${ev.x}:${y}:shortest=1:enable='between(t,${ev.t0.toFixed(2)},${ev.t1.toFixed(2)})'[c${i + 1}]`);
      cur = 'c' + (i + 1);
    });
    if (RPAD) {
      parts.push(`[${cur}]${RPAD}[rz]`);
      cur = 'rz';
    }
    return { parts, cur };
  };
  if (a.gif === false) {
    // mp4-only: no gif target, no palette pass.
  } else if (events.length) {
    const evs = await stripsAt(gifW);
    const { parts, cur } = overlayGraph(evs, vf);
    const inputs = evs.flatMap((ev) => ['-loop', '1', '-i', ev.png]);
    if (ffmpegHasPalette()) {
      parts.push(`[${cur}]split[s0][s1]`, '[s0]palettegen[p]', '[s1][p]paletteuse=dither=sierra2_4a');
      execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', ...SRC, ...inputs, '-filter_complex', parts.join(';'), '-loop', '0', a.out]);
    } else {
      console.error('rec: using bundled ffmpeg (no palettegen) — gif quality is lower; install system ffmpeg for best results.');
      execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', ...SRC, ...inputs, '-filter_complex', parts.join(';'), '-map', `[${cur}]`, '-loop', '0', a.out]);
    }
  } else if (ffmpegHasPalette()) {
    // palette pass decodes the whole take a second time — sampling a few
    // frames per second is enough for a stable palette and cuts that pass
    // to a fraction of the duration.
    const RP = RPAD ? ',' + RPAD : '';
    const palVf = `fps=4,scale=${gifW}:-2:flags=lanczos${RP}`;
    const pal = join(vidDir, 'pal.png');
    execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', ...SRC, '-vf', `${palVf},palettegen=stats_mode=diff`, pal]);
    execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', ...SRC, '-i', pal, '-lavfi', `${vf}${RP}[x];[x][1:v]paletteuse=dither=sierra2_4a`, '-loop', '0', a.out]);
  } else {
    console.error('rec: using bundled ffmpeg (no palettegen) — gif quality is lower; install system ffmpeg for best results.');
    execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', ...SRC, '-vf', `scale=${gifW}:-2${RPAD ? ',' + RPAD : ''}`, '-loop', '0', a.out]);
  }

  // --mp4: same head trim, same letterbox graph (no palette pass), H.264 at
  // the full capture resolution — chrome strips re-rendered at that width.
  if (a.mp4) {
    const mp4Vf = `fps=${a.fps},scale=trunc(iw/2)*2:-2:flags=lanczos`;
    const X264 = ['-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an'];
    // END card is a loop marker — the mp4 cuts before it unless endCard 'all'.
    const CUT = (a.endCard ?? 'gif') === 'gif' && endT0 != null && endT0 > TRIM_S + 0.5
      ? ['-t', (endT0 - TRIM_S).toFixed(2)] : [];
    if (events.length) {
      const evs = await stripsAt(a.width);
      const { parts, cur } = overlayGraph(evs, mp4Vf);
      const inputs = evs.flatMap((ev) => ['-loop', '1', '-i', ev.png]);
      execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', ...SRC, ...inputs, '-filter_complex', parts.join(';'), '-map', `[${cur}]`, ...CUT, ...X264, a.mp4]);
    } else {
      execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', ...SRC, '-vf', mp4Vf + (RPAD ? ',' + RPAD : ''), ...CUT, ...X264, a.mp4]);
    }
  }

  // --keep-webm: the raw take survives + a '<out>.timeline.json' sidecar that
  // compose-video.mjs --sync-trim reads — trimSec plus per-step t0/t1 seconds
  // relative to the TRIMMED start.
  if (a.keepWebm && !webm) {
    console.error('rec: --keep-webm needs a realtime take (offline renders stills, no webm) — skipped');
  } else if (a.keepWebm) {
    copyFileSync(webm, a.keepWebm);
    writeFileSync(a.keepWebm + '.timeline.json', JSON.stringify({
      trimSec: TRIM_S,
      width: a.width,
      height: a.height,
      fps: a.fps,
      steps: (stepTimes || []).map((s) => ({
        i: s.i,
        t0: Math.max(0, +(s.t0 - TRIM_S).toFixed(3)),
        t1: Math.max(0, +(s.t1 - TRIM_S).toFixed(3)),
        label: s.label,
      })),
    }, null, 2) + '\n');
  }

  // --contact-sheet: the take reviews itself — a tile of ~24 frames spanning
  // the whole video, one Read instead of a dozen ffmpeg probes.
  if (a.sheet) {
    const src = a.gif === false ? a.mp4 : (a.mp4 || a.out);
    const sheetPath = typeof a.sheet === 'string' ? a.sheet : src.replace(/\.(gif|mp4)$/i, '') + '.sheet.png';
    const dur = Math.max(1, (stepTimes && stepTimes.length ? stepTimes[stepTimes.length - 1].t1 : 10) - TRIM_S);
    execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src,
      '-vf', `fps=${(24 / dur).toFixed(5)},scale=320:-2,tile=6x4:padding=2:color=0x10182f`, '-frames:v', '1', sheetPath]);
    console.log('SHEET ' + sheetPath);
  }
  return (readFileSync(a.gif === false ? a.mp4 : a.out).length / 1024 / 1024).toFixed(2);
}
