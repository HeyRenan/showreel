// end-card-inject.mjs — builds the JS snippet that overlays a styled "END" card on a
// live page. Show it for ~1s at the very end of a recorded flow so the webm
// captures a clear end marker; without it a looping GIF restarts seamlessly and
// reads as confusing ("did it reset? is that a bug?"). Renders in the browser,
// so it uses real fonts — no ffmpeg drawtext (libfreetype is often missing) and
// no extra Node deps.

// JSON-encodes text and note so quotes/newlines in user text can't break out of
// the snippet; an empty note omits the subtitle node entirely.
export function buildEndCardSnippet(text, note) {
  // JSON-encode so quotes/newlines in user text can't break the snippet.
  const T = JSON.stringify(text);
  const N = JSON.stringify(note);

  return `(() => {
  document.getElementById('__endcard__')?.remove();
  const o = document.createElement('div');
  o.id = '__endcard__';
  o.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;background:rgba(12,27,45,0.78);opacity:0;transition:opacity .25s ease;font-family:-apple-system,Segoe UI,Roboto,sans-serif;';
  const card = document.createElement('div');
  card.textContent = ${T};
  card.style.cssText = 'font-weight:800;font-size:84px;letter-spacing:10px;color:#fff;border:4px solid #16a34a;border-radius:18px;padding:18px 56px;background:rgba(22,163,74,.14);';
  o.appendChild(card);
  if (${N}) {
    const s = document.createElement('div');
    s.textContent = ${N};
    s.style.cssText = 'color:#8aa0b8;font-size:18px;font-weight:500;';
    o.appendChild(s);
  }
  document.documentElement.appendChild(o);
  requestAnimationFrame(() => { o.style.opacity = '1'; });
  return { endcard: true };
})()`;
}
