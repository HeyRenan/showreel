# Real-time GIF recipe — cursor + visible clicks

Produce a GIF that is an actual screen recording of the flow, with a fake mouse
cursor that moves and a ripple that pulses on every click. This beats the
slideshow `gif.sh` path whenever the change is about motion (modals, menus,
drawers, video players, transitions).

Requires the **Playwright MCP** (`browser_run_code_unsafe`) + `ffmpeg`.

## Pieces

- `cursor-inject.mjs` — prints the page snippet that draws the cursor + exposes
  `window.__ripple(x,y)` (rAF-driven, survives animation-freeze).
- `end-card-inject.mjs` — prints a page snippet that overlays a styled "END" card.
  Show it for ~1s after the last step so the looping GIF has a clear stop and
  doesn't read as a confusing seamless restart. Renders in the browser (real
  fonts), so it needs no ffmpeg drawtext and no extra deps.
- `webm-to-gif.sh` — turns the recorded `.webm` into an optimized loopable GIF.

## Flow (one `browser_run_code_unsafe` call)

Record with a fresh context so Playwright writes a video file. Inject the cursor
snippet, then drive the flow with a `clickAt` helper that glides the real mouse,
fires the ripple, lets it breathe, then clicks.

```js
async (page) => {
  const browser = page.context().browser();
  const ctx = await browser.newContext({
    recordVideo: { dir: '<repo>/.mr-proof/vid', size: { width: 900, height: 1400 } },
    viewport: { width: 900, height: 1400 },
    ignoreHTTPSErrors: true
  });
  const p = await ctx.newPage();
  await p.goto('<URL>', { waitUntil: 'domcontentloaded' });

  // paste the output of: node scripts/cursor-inject.mjs
  await p.evaluate(() => { /* <CURSOR_SNIPPET> */ });

  // optional: scroll the target into view
  await p.evaluate(() => { document.querySelector('<SELECTOR>').scrollIntoView({block:'center'}); window.scrollBy(0,-40); });

  // glide = many small moves on a wall-clock timer with easing. This is what
  // makes the cursor look FLUID in the recording. `mouse.move(x,y,{steps})`
  // fires synchronously between video frames, so it teleports — do NOT rely on
  // it for smoothness; pace the moves with waitForTimeout(16) (~1 per frame).
  const glide = async (x, y, ms = 650) => {
    const [sx, sy] = await p.evaluate(() => {
      const c = document.getElementById('__cursor__');
      return [parseFloat(c.style.left) || 80, parseFloat(c.style.top) || 80];
    });
    const N = Math.max(20, Math.round(ms / 16));
    for (let i = 1; i <= N; i++) {
      const k = i / N;
      const e = k < 0.5 ? 2*k*k : 1 - Math.pow(-2*k+2, 2)/2; // easeInOutQuad
      await p.mouse.move(sx + (x-sx)*e, sy + (y-sy)*e);
      await p.waitForTimeout(16);
    }
  };
  const clickAt = async (sel) => {
    const b = await p.locator(sel).first().boundingBox();
    const x = b.x + b.width/2, y = b.y + b.height/2;
    await glide(x, y, 650);                     // fluid eased glide
    await p.waitForTimeout(150);
    await p.evaluate(([x,y]) => window.__ripple(x,y), [x,y]);  // pulse
    await p.waitForTimeout(650);               // let the ring breathe in the gif
    await p.mouse.click(x, y);
  };

  await p.mouse.move(150, 250, { steps: 6 });
  await p.waitForTimeout(600);
  await clickAt('<SELECTOR>');                  // e.g. open
  await p.waitForTimeout(3000);
  // ...more steps...

  // END card — paste the output of: node scripts/end-card-inject.mjs
  // (optionally: --text "END" --note "short caption"). Hold ~1s so it lands
  // in the video; this gives the looping GIF a clear stop.
  await p.evaluate(() => { /* <END_SNIPPET> */ });
  await p.waitForTimeout(1000);

  await p.close();                             // finalizes the video
  const path = await p.video().path();
  await ctx.close();
  return { videoPath: path };
}
```

Then convert:

```bash
bash scripts/webm-to-gif.sh <repo>/.mr-proof/vid/<file>.webm <repo>/.mr-proof/flow.gif 460 18 160
```

Upload with `scripts/upload.mjs` and embed in **For testing**.

## Gotchas (each one was hit in the field)

- Sandbox has **no `require`, no `fs`, no `setTimeout`**. Use `p.waitForTimeout`,
  not `setTimeout`. Don't write files from inside `browser_run_code_unsafe` —
  let `recordVideo` produce the webm, convert with ffmpeg on the shell side.
- Playwright's real cursor is **not** in the video — the injected fake cursor is
  what shows. Mirror `mousemove` onto it (the snippet does this).
- A CSS-`@keyframes` ripple dies under the "freeze animations" style. The snippet
  uses **requestAnimationFrame**, so it pulses even with motion frozen.
- `await window.__ripple(...)` before the click so the pulse is centered on the
  target and actually lands in frames (820ms dwell is a good default at 15fps).
- **Smoothness comes from fps + eased glide, not from `mouse.move({steps})`.**
  Pace moves with `waitForTimeout(16)` (~1/frame) and ease them; convert at
  **18-24fps with `dither=sierra2_4a`** (bayer reads as stuttery/blocky on
  motion). 15fps + bayer is the classic "travado" look — avoid it.
- A playing video (e.g. YouTube) inflates GIF size via inter-frame delta and is
  the main reason a smooth gif blows past 10MB. Keep the play dwell SHORT
  (~1.5s is enough to show it running), record a smaller `recordVideo.size`
  (e.g. 760×1180), and convert at width ~440-480. Trim dead air over dropping fps.
- `recordVideo.size` == `viewport` keeps the output crisp and unscaled.
