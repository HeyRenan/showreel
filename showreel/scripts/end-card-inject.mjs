#!/usr/bin/env node
// end-card-inject.mjs — emit a JS snippet that overlays a styled "END" card on a
// live page. Show it for ~1s at the very end of a recorded flow so the webm
// captures a clear end marker; without it a looping GIF restarts seamlessly and
// reads as confusing ("did it reset? is that a bug?"). Renders in the browser,
// so it uses real fonts — no ffmpeg drawtext (libfreetype is often missing) and
// no extra Node deps.
//
// Paste the printed snippet inside the Playwright MCP `browser_run_code_unsafe`
// page.evaluate() AFTER the flow's last step, then wait ~1000ms before closing
// the context so the card lands in the video:
//
//   await p.evaluate(() => { /* <END_SNIPPET> */ });
//   await p.waitForTimeout(1000);
//   await p.close();
//
// Optional args: --text "END" --note "cart stays in sync"
//   node end-card-inject.mjs --text "DONE" --note "all flows pass"

// Build the injectable END-card snippet from the card text + optional note.
// Pure/deterministic. JSON-encodes both so quotes/newlines in user text can't
// break out of the snippet; an empty note omits the subtitle node entirely.
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const get = (flag, def) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : def;
  };
  process.stdout.write(buildEndCardSnippet(get('--text', 'END'), get('--note', '')) + '\n');
}
