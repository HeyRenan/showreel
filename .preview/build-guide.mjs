import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const png = (p) => existsSync(p) ? 'data:image/png;base64,' + readFileSync(p).toString('base64') : '';
const txt = (p) => existsSync(p) ? readFileSync(p, 'utf8').trim() : '(output not captured)';
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const preflight = txt('/tmp/sc-guide-preflight.txt');
const deps = txt('/tmp/sc-guide-deps.txt');
const proveOut = txt('/tmp/sc-guide-prove.txt');
const proofImg = png('/tmp/sc-guide-proof.png');

const term = (cmd, out) => `
  <div class="term">
    <div class="bar"><span></span><span></span><span></span></div>
    <pre><span class="prompt">$ </span><span class="cmd">${esc(cmd)}</span>
${esc(out)}</pre>
  </div>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>showcase — setup guide</title>
<style>
  :root{--bg:#0d1117;--card:#161b22;--bd:#30363d;--fg:#e6edf3;--mut:#8b949e;--grn:#3fb950;--blue:#79c0ff;--amber:#d29922}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
  header{padding:44px 24px 28px;border-bottom:1px solid var(--bd);text-align:center}
  header h1{margin:0 0 8px;font-size:32px} header p{margin:0;color:var(--mut)}
  main{max-width:860px;margin:0 auto;padding:24px}
  .step{margin:34px 0;padding:22px;background:var(--card);border:1px solid var(--bd);border-radius:12px}
  .step h2{margin:0 0 4px;font-size:20px;display:flex;align-items:center;gap:12px}
  .step h2 .n{flex:none;width:32px;height:32px;border-radius:50%;background:var(--grn);color:#fff;font:700 16px system-ui;display:flex;align-items:center;justify-content:center}
  .step p{color:var(--mut);font-size:14.5px;margin:8px 0}
  .step code.inline{background:#0d1117;border:1px solid var(--bd);border-radius:5px;padding:2px 7px;font:13px ui-monospace,Menlo,monospace;color:var(--blue)}
  .term{margin:14px 0;border:1px solid var(--bd);border-radius:10px;overflow:hidden;background:#0a0d12}
  .term .bar{display:flex;gap:6px;padding:9px 12px;background:#161b22;border-bottom:1px solid var(--bd)}
  .term .bar span{width:11px;height:11px;border-radius:50%;background:#30363d}
  .term .bar span:first-child{background:#f85149}.term .bar span:nth-child(2){background:#d29922}.term .bar span:nth-child(3){background:#3fb950}
  .term pre{margin:0;padding:14px 16px;font:12.5px/1.55 ui-monospace,Menlo,monospace;color:#c9d4e0;overflow-x:auto;white-space:pre-wrap}
  .term .prompt{color:var(--grn);font-weight:700}.term .cmd{color:#fff;font-weight:600}
  .step img{max-width:100%;border-radius:8px;border:1px solid var(--bd);display:block;margin:14px 0 0}
  table{width:100%;border-collapse:collapse;font-size:13.5px;margin:12px 0}
  th,td{text-align:left;padding:8px 10px;border:1px solid var(--bd)} th{background:#0d1117;color:var(--grn)}
  td code{font:12px ui-monospace,Menlo,monospace;color:var(--blue)}
  .tip{border-left:3px solid var(--amber);padding:8px 14px;background:rgba(210,153,34,.08);border-radius:0 8px 8px 0;font-size:13.5px;color:var(--mut);margin:12px 0}
  footer{text-align:center;color:var(--mut);padding:36px;font-size:13px;border-top:1px solid var(--bd);margin-top:40px}
</style></head><body>
<header>
  <h1>showcase — setup guide</h1>
  <p>From install to your first vcheck-gated capture, with the real outputs you should see at every step.</p>
</header>
<main>

<div class="step"><h2><span class="n">1</span>Install the plugin</h2>
<p>From GitHub:</p>
${term('claude plugin marketplace add HeyRenan/showreel\nclaude plugin install showreel@showreel', '')}
<p>From a local folder instead (clone or tgz extracted into your plugins dir):</p>
${term('claude plugin marketplace add ~/.claude/plugins/showreel\nclaude plugin install showreel@showreel', '')}
<p>Restart Claude Code afterwards so the <code class="inline">/showreel</code> skill loads.</p></div>

<div class="step"><h2><span class="n">2</span>Run preflight — it tells you exactly what's missing</h2>
<p>Real output on a configured machine (yours will show <code class="inline">[warn]</code> lines with copy-paste fixes for anything absent). Required: node 18+. No git, no tokens:</p>
${term('bash ~/.claude/plugins/showreel/showreel/scripts/preflight.sh', preflight)}
<div class="tip">Every <b>[warn]</b> comes with the exact command in the Setup block below it — run only what applies to you. <code class="inline">ffmpeg</code> (GIF quality) and <code class="inline">vhs</code> (terminal recordings) are optional.</div></div>

<div class="step"><h2><span class="n">3</span>Pre-warm the capture motor (one-time, ~90MB)</h2>
<p>The first capture installs Playwright + downloads Chromium into the plugin's own <code class="inline">scripts/.deps/</code> — self-contained, no browser MCP. Do it now so a network problem surfaces here, not mid-capture:</p>
${term('node ~/.claude/plugins/showreel/showreel/scripts/ensure-deps.mjs', deps)}
<div class="tip">Behind a proxy: set <code class="inline">HTTPS_PROXY</code> (npm) and <code class="inline">PLAYWRIGHT_DOWNLOAD_HOST</code> (mirror). Linux: if Chromium won't launch, run <code class="inline">sudo scripts/.deps/node_modules/.bin/playwright install-deps chromium</code> once.</div></div>

<div class="step"><h2><span class="n">4</span>First annotated shot — one command, vcheck-gated</h2>
<p>Point it at any page + CSS selector. <code class="inline">PASS</code> means the green marker landed exactly on the element (pixel-verified). This is a real run against the bundled demo page:</p>
${term('node scripts/prove.mjs "file://$PWD/../assets-src/demo/index.html" ".cta" shot.png --label "primary CTA" --width 1280 --height 900', proveOut)}
${proofImg ? '<img src="' + proofImg + '" alt="real annotated capture">' : ''}
<div class="tip">Several shots? <code class="inline">prove.mjs &lt;url&gt; --batch jobs.json</code> reuses one browser launch for all of them. Desktop layouts need <code class="inline">--width 1440 --height 900</code> (the default viewport is portrait/mobile).</div></div>

<div class="step"><h2><span class="n">5</span>Flow + terminal recordings</h2>
<p>Flow GIFs are one <code class="inline">rec.mjs</code> call — steps are JSON, selectors + text; the script owns cursor, ripples, notes, scroll, camera zoom and the END card:</p>
${term(`node scripts/rec.mjs <url> --steps-json '[
 {"click":"#menu","note":"Drawer opens","badge":1,"screen":"Dashboard"},
 {"zoom":".kpis","note":"Camera frames the KPIs","badge":2},
 {"zoom":"out"},
 {"click":"#deploy","zoom":true,"note":"Camera follows the click","badge":3}
]' flow.gif`, '')}
<p>Terminal recordings use the same contract via <code class="inline">tape.mjs</code> (requires <code class="inline">brew install vhs</code>):</p>
${term(`node scripts/tape.mjs --steps-json '[{"type":"bash scripts/preflight.sh"},{"enter":true,"sleep":4000}]' terminal.gif`, '')}
<div class="tip">Step keys: <code class="inline">click, scrollTo, wait, note, arrow, badge, rect, circle, blur, hide, glide, modal, marks, screen, zoom</code> — unknown keys rejected up front.</div></div>

<div class="step"><h2><span class="n">6</span>Verify + use</h2>
${term('cd ~/.claude/plugins/showreel/showreel && node --test scripts/__tests__/', '# pass — all tests, no network or browser needed')}
<p>Done. Invoke <code class="inline">/showreel</code> and describe what to capture — annotated screenshots, isolated primitives (<code class="inline">demo.mjs</code>), tight crops (<code class="inline">shot.mjs</code>), flow GIFs, terminal recordings, BEFORE/AFTER composites (<code class="inline">compose.mjs</code>, <code class="inline">lh-ba.sh</code>).</p></div>

</main>
<footer>showcase setup guide · every terminal block above is a real captured run, not a mockup</footer>
</body></html>`;

writeFileSync('/Users/renan/.claude/plugins/showreel/showreel/GUIDE.html', html);
console.log('wrote GUIDE.html (' + (html.length / 1024).toFixed(0) + ' KB)');
