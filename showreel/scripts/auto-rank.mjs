// auto-rank.mjs — the PURE core of the URL-only quick path (auto.mjs).
//
// auto.mjs gathers raw DOM candidates in-page (COLLECT_FN), then everything that
// DECIDES — which elements are salient, how to label them, how to mark them — is
// pure and lives here so it is unit-testable with no browser. Mirrors how
// prove.mjs keeps place/buildAnnotations/summarize pure and separate from its
// browser-bound body.

// How much each role contributes to salience. Role identity is the dominant
// signal: a page's h1 and primary action ARE the things a reader looks for.
const ROLE_WEIGHT = {
  'main-heading': 1.0,
  'primary-action': 0.95,
  'hero-image': 0.75,
  'primary-nav': 0.7,
  'form': 0.65,
  'key-metric': 0.6,
  'card': 0.5,
};

// Roles that name a single thing on a page — at most one pick each. card and
// key-metric legitimately repeat, capped low so the shot set stays an overview.
const SINGULAR_ROLES = new Set(['main-heading', 'primary-action', 'primary-nav', 'hero-image', 'form']);
const ROLE_CAP = { card: 2, 'key-metric': 2 };

// Role -> a short note stating the element's FUNCTION (the WHY), never echoing
// its visible text (which would just repeat what's already on screen). ≤6 words.
const ROLE_LABELS = {
  'main-heading': 'main heading',
  'primary-action': 'primary action',
  'primary-nav': 'primary navigation',
  'hero-image': 'hero image',
  'form': 'key input form',
  'key-metric': 'key metric',
  'card': 'feature card',
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || 'salient element';
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Fraction of the SMALLER box that the two rects share. Used to drop a pick that
// sits on top of an already-accepted one (e.g. a card and the button inside it).
function overlapFraction(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  if (inter <= 0) return 0;
  const smaller = Math.min(a.w * a.h, b.w * b.h);
  return smaller > 0 ? inter / smaller : 0;
}

function scoreOf(cand, viewport) {
  const vpArea = Math.max(1, viewport.w * viewport.h);
  const roleWeight = ROLE_WEIGHT[cand.role] || 0.4;
  const verticalBias = 1 - clamp((cand.rect.y || 0) / Math.max(1, viewport.h), 0, 1);
  const areaNorm = clamp((cand.area || 0) / vpArea, 0, 0.6) / 0.6;
  const interactiveBonus = cand.isInteractive ? 0.15 : 0;
  return 0.45 * roleWeight + 0.20 * verticalBias + 0.20 * areaNorm + 0.15 * interactiveBonus;
}

// Rank raw candidates into the top-N salient, non-overlapping picks. Pure and
// total: hostile / empty input yields an empty result, never a throw.
//   cands: [{role, tag, selector, rect:{x,y,w,h}, area, text, isInteractive}]
//   returns { picks:[...cand + {score}], skipped:[{role,selector,reason}] }
export function rankCandidates(cands, { max = 4, viewport } = {}) {
  const skipped = [];
  if (!Array.isArray(cands) || !viewport) return { picks: [], skipped };
  const vpArea = Math.max(1, viewport.w * viewport.h);

  const scored = [];
  for (const c of cands) {
    if (!c || !c.rect || !c.selector) { skipped.push({ role: c && c.role, selector: c && c.selector, reason: 'invalid' }); continue; }
    const { w, h } = c.rect;
    if (w < 24 || h < 16) { skipped.push({ role: c.role, selector: c.selector, reason: 'too-small' }); continue; }
    if ((c.area || w * h) > 0.92 * vpArea) { skipped.push({ role: c.role, selector: c.selector, reason: 'too-large' }); continue; }
    scored.push({ ...c, score: scoreOf(c, viewport) });
  }

  // Highest score first; deterministic tiebreak (top of page, then selector) so
  // the same page always yields the same shot order.
  scored.sort((a, b) => b.score - a.score || a.rect.y - b.rect.y || String(a.selector).localeCompare(String(b.selector)));

  const picks = [];
  const roleCount = {};
  const seenSelectors = new Set();
  for (const c of scored) {
    if (picks.length >= max) { skipped.push({ role: c.role, selector: c.selector, reason: 'over-max' }); continue; }
    if (seenSelectors.has(c.selector)) { skipped.push({ role: c.role, selector: c.selector, reason: 'duplicate' }); continue; }
    const cap = SINGULAR_ROLES.has(c.role) ? 1 : (ROLE_CAP[c.role] || max);
    if ((roleCount[c.role] || 0) >= cap) { skipped.push({ role: c.role, selector: c.selector, reason: 'role-full' }); continue; }
    if (picks.some((p) => overlapFraction(p.rect, c.rect) > 0.6)) { skipped.push({ role: c.role, selector: c.selector, reason: 'overlap' }); continue; }
    picks.push(c);
    roleCount[c.role] = (roleCount[c.role] || 0) + 1;
    seenSelectors.add(c.selector);
  }
  return { picks, skipped };
}

// A compact, roughly-square interactive target reads best with a ring; wide
// containers (nav, form, heading, hero) get a rectangle. Feeds job.circle.
export function isCircleKind(pick) {
  if (!pick || !pick.rect) return false;
  if (pick.role !== 'primary-action' && pick.role !== 'key-metric') return false;
  const { w, h } = pick.rect;
  if (!h) return false;
  const aspect = w / h;
  return aspect >= 0.5 && aspect <= 2 && Math.min(w, h) < 160;
}

// Small targets get a magnified inset so the detail is legible. Must be compact
// in BOTH dimensions — a wide-but-short element (a full-width heading) is not a
// zoom target; magnifying it produces a huge inset that collides with the label.
export function isSmallTarget(pick, viewport) {
  if (!pick || !pick.rect || !viewport) return false;
  const { w, h } = pick.rect;
  return Math.min(w, h) < 96 && Math.max(w, h) < 320;
}

// In-page selector builder (stringified and shipped to the collector). Self-
// contained — no module refs — because it runs inside page.evaluate. Prefers a
// unique id, then a unique tag.class, then an nth-of-type path to body. Built and
// consumed in the SAME page session (no reload), so nth-of-type paths stay valid.
export function stableSelector(el) {
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&'));
  if (el.id && document.querySelectorAll('#' + esc(el.id)).length === 1) return '#' + esc(el.id);
  for (const cls of el.classList || []) {
    const sel = el.tagName.toLowerCase() + '.' + esc(cls);
    if (document.querySelectorAll(sel).length === 1) return sel;
  }
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    if (node.id && document.querySelectorAll('#' + esc(node.id)).length === 1) {
      parts.unshift('#' + esc(node.id));
      break;
    }
    const tag = node.tagName.toLowerCase();
    let nth = 1;
    let sib = node.previousElementSibling;
    while (sib) { if (sib.tagName === node.tagName) nth++; sib = sib.previousElementSibling; }
    parts.unshift(tag + ':nth-of-type(' + nth + ')');
    if (node === document.body) break;
    node = node.parentElement;
  }
  return parts.join(' > ');
}

// In-page candidate collector. page.evaluate(string) evaluates an EXPRESSION and
// does NOT call it with args (a bare function string returns the function, not
// its result), so COLLECT_FN is built as a self-invoking IIFE with stableSelector
// inlined — no module scope needed in the page. Walks roles in priority order;
// the first role to claim an element wins, so an element matching both `button`
// and `[role=button]` is counted once.
function collectImpl(stableSelector) {
  const vpw = window.innerWidth, vph = window.innerHeight;
  const round = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
  const visible = (n) => {
    const s = getComputedStyle(n);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < vpw && r.top < vph;
  };
  const ROLES = [
    { role: 'main-heading',   sels: ['h1', '[role=heading][aria-level="1"]'], one: true },
    { role: 'primary-action', sels: ['button[type=submit]', '[type=submit]', 'a.cta', '.cta', 'button.primary', '[role=button]', 'button'], one: false },
    { role: 'primary-nav',    sels: ['nav', '[role=navigation]', 'header nav'], one: true },
    { role: 'hero-image',     sels: ['[class*=hero] img', 'header img', 'picture img', 'img', '[role=banner]'], one: false },
    { role: 'form',           sels: ['form'], one: true },
    { role: 'key-metric',     sels: ['[class*=stat]', '[class*=metric]', '[class*=kpi]'], one: false },
    { role: 'card',           sels: ['[class*=card]', 'article'], one: false },
  ];
  const claimed = new Set();
  const out = [];
  for (const { role, sels, one } of ROLES) {
    let taken = 0;
    for (const sel of sels) {
      let nodes;
      try { nodes = document.querySelectorAll(sel); } catch (e) { continue; }
      for (const node of nodes) {
        if (claimed.has(node)) continue;
        if (!visible(node)) continue;
        const rect = round(node.getBoundingClientRect());
        const tag = node.tagName.toLowerCase();
        const isInteractive = /^(a|button|input|select)$/.test(tag) || node.matches('[role=button],[type=submit]');
        claimed.add(node);
        out.push({
          role, tag,
          selector: stableSelector(node),
          rect, area: rect.w * rect.h,
          text: (node.innerText || node.textContent || '').trim().slice(0, 120),
          isInteractive,
        });
        taken++;
        if (one || taken >= 4) break;
      }
      if (one && taken) break;
    }
  }
  return out;
}

// Compose the IIFE string: (collectImpl)(stableSelector) — evaluated in-page by
// page.evaluate, returns the serializable candidate array.
export const COLLECT_FN = `(${collectImpl.toString()})(${stableSelector.toString()})`;
