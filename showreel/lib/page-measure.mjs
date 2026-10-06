// page-measure.mjs — DOM measurement functions that run INSIDE a page. They are
// plain, self-contained functions (no imports, no closure) so the headless
// motor evaluates them via page.evaluate AND the Claude-in-Chrome overlay embeds
// their source via toString(). One copy, two drivers.

// Target box + the visible sibling boxes a callout must avoid + viewport.
export function measureInPage(sel) {
    const el = document.querySelector(sel);
    if (!el) return { error: 'selector not found: ' + sel };
    const round = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
    const target = round(el.getBoundingClientRect());
    // neighbors = visible siblings of the target and of its ancestors that
    // intersect the viewport — the things a callout must not cover.
    const vpw = window.innerWidth, vph = window.innerHeight;
    const visible = (n) => {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < vpw && r.top < vph;
    };
    const set = new Map();
    let node = el;
    while (node && node !== document.body && node.parentElement) {
      const sibs = node.parentElement.children;
      for (let i = 0; i < sibs.length; i++) {
        const c = sibs[i];
        if (c === node || c.contains(el)) continue;
        if (!visible(c)) continue;
        const r = round(c.getBoundingClientRect());
        set.set(r.x + ':' + r.y + ':' + r.w + ':' + r.h, r);
        if (set.size >= 40) break;
      }
      node = node.parentElement;
    }
    return { target, neighbors: [...set.values()], viewport: { w: vpw, h: vph } };
}

// Nearest visible text-bearing boxes (excluding the target) — extra obstacles so
// callouts never land on page text the sibling-only measure misses.
export function textNeighborsInPage(sel) {
    const target = document.querySelector(sel);
    const viewportWidth = window.innerWidth, viewportHeight = window.innerHeight;
    const boxes = [];
    const seenKeys = new Set();
    const textNodes = document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,a,button,td,th,li,label,code,b,strong,em,span,small');
    for (const node of textNodes) {
      if (target && (node === target || target.contains(node) || node.contains(target))) continue;
      if (!(node.textContent || '').trim()) continue;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || +style.opacity === 0) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= viewportWidth || rect.top >= viewportHeight) continue;
      const box = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
      const key = box.x + ':' + box.y + ':' + box.w + ':' + box.h;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      boxes.push(box);
    }
    // Keep the 50 boxes NEAREST the target — document order would drop the
    // text right below it on any page with more than 50 text nodes above.
    const t = target ? target.getBoundingClientRect() : { x: 0, y: 0, width: 0, height: 0 };
    const cx = t.x + t.width / 2, cy = t.y + t.height / 2;
    const dist = (b) => Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy);
    return boxes.sort((p, q) => dist(p) - dist(q)).slice(0, 50);
}
