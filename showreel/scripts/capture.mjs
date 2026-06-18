#!/usr/bin/env node
// capture.mjs — emit the exact MCP snippets to screenshot ONE element tightly,
// with NO black background and NO read-adjust-read cycle.
//
// The agent can't drive the browser (zero-dep), so this prints:
//   1) a `prep` evaluate fn: isolates the element (hides siblings), frames it on
//      a dark card, returns its bounding box {x,y,w,h,pad}.
//   2) the resize_page dimensions to use (bbox + padding) so the viewport == the
//      element — the screenshot comes out cropped tight, every time.
//   3) a `scroll` evaluate fn to bring the element to (pad,pad).
//
// Usage:
//   node capture.mjs prep   "<css-selector>" [bg] [pad]   -> prints the evaluate fn
//   node capture.mjs scroll "<css-selector>" [pad]        -> prints the scroll fn
//
// Flow the agent runs:
//   a) evaluate( capture.mjs prep ".sel" )      -> returns {w,h,pad}
//   b) resize_page(width = w+2*pad, height = h+2*pad)
//   c) evaluate( capture.mjs scroll ".sel" )
//   d) take_screenshot(filePath)                -> tight crop, no black
//
// Why this kills the slowness: the viewport is sized to the element BEFORE the
// shot, so there is never leftover dark body to re-crop, and no measure-shot-
// remeasure loop.

export function prepFn(sel, bg, pad) {
  // Returns a no-arg arrow fn string (the only evaluate channel that works on
  // both chrome-devtools and playwright). Selector + opts are baked in.
  return `()=>{
    var SEL=${JSON.stringify(sel)}, BG=${JSON.stringify(bg)}, PAD=${JSON.stringify(pad)};
    var el=document.querySelector(SEL);
    if(!el) return {error:'selector not found: '+SEL};
    // frame the element as a standalone dark card
    el.style.background=BG; el.style.padding=PAD+'px'; el.style.borderRadius='10px';
    el.style.boxSizing='border-box'; el.style.maxWidth='none';
    document.documentElement.style.background=BG; document.body.style.background=BG;
    // hide everything that isn't the element or its ancestors/descendants
    var keep=el; var p=el;
    while(p && p!==document.body){
      var par=p.parentElement;
      if(par){ for(var i=0;i<par.children.length;i++){ var c=par.children[i]; if(c!==p && !c.contains(keep)) c.style.display='none'; } }
      p=par;
    }
    [].forEach.call(document.body.children,function(c){ if(!c.contains(keep)) c.style.visibility='hidden'; });
    el.style.visibility='visible';
    window.scrollTo(0,0);
    var r=el.getBoundingClientRect();
    return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),pad:PAD,
            resizeW:Math.round(r.width),resizeH:Math.round(r.height)};
  }`;
}

export function scrollFn(sel, pad) {
  return `()=>{
    var el=document.querySelector(${JSON.stringify(sel)});
    if(!el) return {error:'not found'};
    var top=el.getBoundingClientRect().top+window.scrollY-${pad};
    var left=el.getBoundingClientRect().left+window.scrollX-${pad};
    window.scrollTo(Math.max(0,left),Math.max(0,top));
    return 'scrolled';
  }`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, sel, a, b] = process.argv.slice(2);
  if (cmd === 'prep') {
    if (!sel) { console.error('usage: capture.mjs prep <selector> [bg] [pad]'); process.exit(2); }
    const bg = a || '#0d1117';
    const pad = b != null ? parseInt(b, 10) : 24;
    console.log(prepFn(sel, bg, pad));
    console.error('After evaluate returns {w,h,pad}: resize_page(width=w+2*pad, height=h+2*pad), then run `capture.mjs scroll`, then take_screenshot.');
  } else if (cmd === 'scroll') {
    if (!sel) { console.error('usage: capture.mjs scroll <selector> [pad]'); process.exit(2); }
    const pad = a != null ? parseInt(a, 10) : 24;
    console.log(scrollFn(sel, pad));
  } else {
    console.error('usage: capture.mjs <prep|scroll> <selector> [bg] [pad]');
    process.exit(2);
  }
}
