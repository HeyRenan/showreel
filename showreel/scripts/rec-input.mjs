// rec-input.mjs — form interactions: doFill (cursor walk + ripple + per-char
// keyboard typing on the take's clock) and doSelect (fake theme-aware dropdown
// panel, since native <select> popups never reach a headless screencast).
// Extracted from rec.mjs (stage 5d) as makeInput(rctx, motion): the motion
// helpers (glide/ripple/boxOf/smoothScroll) come from rec-motion.mjs.

export function makeInput(rctx, motion) {
  const { page, safeEval, clock, ms, PACE, a, pageTheme } = rctx;
  const { glide, ripple, boxOf, smoothScroll } = motion;

  const doFill = async ({ sel, text, delay }) => {
    let b = await boxOf(sel);
    if (b && (b.y < 0 || b.y + b.h > a.height)) { await smoothScroll(sel); b = await boxOf(sel); }
    if (!b) return;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    await glide(cx, cy, 600);
    await clock.wait(ms(120));
    await ripple(cx, cy);
    await clock.wait(ms(350), true);
    // focus via the DOM, type via the raw keyboard: locator APIs poll
    // actionability on the page's rAF, which never fires on a paused clock —
    // page.type would hang an offline take forever. The per-char wait keeps
    // the typing rhythm on the take's clock in both modes.
    await safeEval((q) => document.querySelector(q)?.focus(), sel);
    const perChar = Math.max(1, Math.round(delay * PACE));
    for (const ch of String(text ?? '')) {
      await page.keyboard.type(ch);
      await clock.wait(perChar, true);
    }
    await clock.wait(ms(300));
  };

  // Native <select> popups never reach a headless screencast — fake the panel:
  // a theme-aware card listing the select's REAL option labels, placed below
  // the select (above when no room — never covering it), the cursor walks to
  // the requested row, the row highlights, then the REAL select.value is set
  // with input+change events and the panel fades out.
  const doSelect = async ({ sel, option }) => {
    let b = await boxOf(sel);
    if (b && (b.y < 0 || b.y + b.h > a.height)) { await smoothScroll(sel); b = await boxOf(sel); }
    if (!b) return;
    await glide(b.x + b.w / 2, b.y + b.h / 2, 600);
    await clock.wait(ms(120));
    await ripple(b.x + b.w / 2, b.y + b.h / 2);
    await clock.wait(ms(350), true);
    const row = await safeEval(({ sel, option, theme }) => {
      const el = document.querySelector(sel);
      if (!el || !el.options) return null;
      document.getElementById('__selpanel__')?.remove();
      const labels = [...el.options].map((o) => (o.label || o.text || '').trim());
      let idx = labels.findIndex((t) => t === option);
      if (idx < 0) idx = labels.findIndex((t) => t.includes(option));
      if (idx < 0) return null;
      const T = theme === 'dark'
        ? { bg: '#f8fafc', ink: '#0f172a', hl: 'rgba(22,163,74,.18)' }
        : { bg: '#0d1b2d', ink: '#e2e8f0', hl: 'rgba(22,163,74,.28)' };
      const r = el.getBoundingClientRect();
      const rowH = 38, pad = 6;
      const ph = labels.length * rowH + pad * 2;
      const pw = Math.max(180, Math.round(r.width));
      const below = r.bottom + 8 + ph <= innerHeight;
      const top = below ? r.bottom + 8 : Math.max(8, r.top - 8 - ph);
      const left = Math.max(8, Math.min(innerWidth - pw - 8, r.left));
      const panel = document.createElement('div');
      panel.id = '__selpanel__';
      panel.style.cssText = 'position:fixed;z-index:2147483641;pointer-events:none;left:' + left + 'px;top:' + top +
        'px;width:' + pw + 'px;background:' + T.bg + ';border:1px solid #16a34a;border-radius:10px;padding:' + pad +
        'px 0;box-shadow:0 10px 30px rgba(0,0,0,.45);opacity:0;transition:opacity .25s ease;';
      labels.forEach((t, i) => {
        const d = document.createElement('div');
        d.style.cssText = 'height:' + rowH + 'px;display:flex;align-items:center;padding:0 14px;margin:0 6px;' +
          'border-radius:6px;color:' + T.ink + ';font:500 16px system-ui;';
        d.textContent = t;
        if (i === idx) { d.dataset.target = '1'; d.dataset.hl = T.hl; }
        panel.appendChild(d);
      });
      document.documentElement.appendChild(panel);
      requestAnimationFrame(() => { panel.style.opacity = '1'; });
      return { x: left + pw / 2, y: top + pad + idx * rowH + rowH / 2 };
    }, { sel, option, theme: pageTheme });
    if (!row) return;
    await clock.wait(ms(400), 280); // panel fade-in is the hot head
    await glide(row.x, row.y, 550);
    await safeEval(() => {
      const d = document.querySelector('#__selpanel__ [data-target]');
      if (d) { d.style.background = d.dataset.hl; d.style.fontWeight = '700'; }
    });
    await clock.wait(ms(600));
    await safeEval(({ sel, option, fade }) => {
      const el = document.querySelector(sel);
      if (el && el.options) {
        const labels = [...el.options].map((o) => (o.label || o.text || '').trim());
        let idx = labels.findIndex((t) => t === option);
        if (idx < 0) idx = labels.findIndex((t) => t.includes(option));
        if (idx >= 0) {
          el.value = el.options[idx].value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      const p = document.getElementById('__selpanel__');
      if (p) {
        p.style.transition = 'opacity ' + fade + 'ms ease';
        p.style.opacity = '0';
        setTimeout(() => p.remove(), fade + 60);
      }
    }, { sel, option, fade: ms(400) });
    await clock.wait(ms(400) + 80, true);
  };

  return { doFill, doSelect };
}
