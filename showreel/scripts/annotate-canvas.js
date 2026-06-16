// Browser-side annotator. Injected verbatim as the MCP evaluate `function`.
// Zero-dep: pure CanvasRenderingContext2D, present in every Chromium the MCP drives.
// Reads its payload from a baked-in `__PAYLOAD` const (see build-inject.mjs) — NOT
// from tool args, because chrome-devtools `args` resolves element uids and
// playwright browser_evaluate has no args channel at all (verified).
//
// Payload: { imageB64:"data:image/png;base64,...", scale?:1, annotations:[...] }
// annotation types: rect|arrow|label|badge|callout  (see README)
// Returns: data:image/png;base64 dataURL of the annotated image.

function ANNOTATE(payload) {
  return new Promise(function (resolve, reject) {
    var p = typeof payload === 'string' ? JSON.parse(payload) : payload;
    var scale = p.scale && p.scale > 0 ? p.scale : 1;
    var img = new Image();

    img.onload = function () {
      try {
        var W = img.naturalWidth || img.width;
        var H = img.naturalHeight || img.height;
        var cv = document.createElement('canvas');
        cv.width = Math.round(W * scale);
        cv.height = Math.round(H * scale);
        var ctx = cv.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, W, H);

        var FONT = 'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';

        // Page-tone detection: light neutrals on dark pages, dark neutrals on
        // light pages, so cards/lines never sink into the background. Callers
        // opt in per annotation with the 'neutral' sentinel; explicit colors win.
        function detectTheme() {
          try {
            var s = document.createElement('canvas'); s.width = 64; s.height = 48;
            var sctx = s.getContext('2d');
            sctx.drawImage(cv, 0, 0, 64, 48);
            var d = sctx.getImageData(0, 0, 64, 48).data;
            var sum = 0, n = d.length / 4;
            for (var i = 0; i < d.length; i += 4) sum += d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722;
            return sum / n < 118 ? 'dark' : 'light';
          } catch (e) { return 'light'; }
        }
        var theme = (p.theme === 'dark' || p.theme === 'light') ? p.theme : detectTheme();
        var NEU = theme === 'dark'
          ? { bg: 'rgba(248,250,252,.96)', fg: '#0f172a', line: 'rgba(248,250,252,.95)', frame: '#e2e8f0' }
          : { bg: 'rgba(15,23,42,.95)', fg: '#fff', line: 'rgba(15,23,42,.95)', frame: '#0d1117' };
        function neu(v, themed, dflt) {
          if (v === 'neutral') return themed;
          return v == null ? (dflt === undefined ? themed : dflt) : v;
        }

        function roundRect(x, y, w, h, r) {
          r = Math.min(r, w / 2, h / 2);
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.arcTo(x + w, y, x + w, y + h, r);
          ctx.arcTo(x + w, y + h, x, y + h, r);
          ctx.arcTo(x, y + h, x, y, r);
          ctx.arcTo(x, y, x + w, y, r);
          ctx.closePath();
        }

        function pill(x, y, text, color, bg, size, padX, padY) {
          size = size || 20; padX = padX == null ? 10 : padX; padY = padY == null ? 6 : padY;
          ctx.font = '600 ' + size + 'px ' + FONT;
          var lines = String(text).split('\n');
          var tw = 0, i;
          for (i = 0; i < lines.length; i++) tw = Math.max(tw, ctx.measureText(lines[i]).width);
          var lh = size * 1.3;
          var boxW = tw + padX * 2;
          var boxH = lh * lines.length + padY * 2; // fix: no under-size correction term
          ctx.save();
          if (bg) { ctx.fillStyle = bg; roundRect(x, y, boxW, boxH, Math.min(8, size * 0.4)); ctx.fill(); }
          ctx.fillStyle = color || '#fff';
          ctx.textBaseline = 'top';
          for (i = 0; i < lines.length; i++) ctx.fillText(lines[i], x + padX, y + padY + i * lh);
          ctx.restore();
          return { w: boxW, h: boxH };
        }

        function edgeLink(a, b) {
          var acx = a.x + a.w / 2, acy = a.y + a.h / 2;
          var bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
          var dx = bcx - acx, dy = bcy - acy;
          if (Math.abs(dx) > Math.abs(dy))
            return { x1: dx > 0 ? a.x + a.w : a.x, y1: acy, x2: dx > 0 ? b.x : b.x + b.w, y2: bcy };
          return { x1: acx, y1: dy > 0 ? a.y + a.h : a.y, x2: bcx, y2: dy > 0 ? b.y : b.y + b.h };
        }

        function rectsApart(a, b, m) {
          return a.x + a.w + m <= b.x || b.x + b.w + m <= a.x || a.y + a.h + m <= b.y || b.y + b.h + m <= a.y;
        }

        function arrow(x1, y1, x2, y2, color, lw) {
          color = color || '#09f'; lw = lw || 5;
          var head = Math.max(12, lw * 3);
          var ang = Math.atan2(y2 - y1, x2 - x1);
          // logical endpoint stays (x2,y2) — geometry self-checks key off it —
          // but the DRAWING stops short so the head never sits on glyphs.
          var len = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
          var back = Math.min(12, len * 0.4);
          var tx = x2 - Math.cos(ang) * back;
          var ty = y2 - Math.sin(ang) * back;
          ctx.save();
          ctx.strokeStyle = color; ctx.fillStyle = color;
          ctx.lineWidth = lw; ctx.lineCap = 'round';
          ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 4;
          var bx = tx - Math.cos(ang) * head * 0.9;
          var by = ty - Math.sin(ang) * head * 0.9;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(bx, by); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx - head * Math.cos(ang - 0.45), ty - head * Math.sin(ang - 0.45));
          ctx.lineTo(tx - head * Math.cos(ang + 0.45), ty - head * Math.sin(ang + 0.45));
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }

        var ann = p.annotations || [];
        for (var k = 0; k < ann.length; k++) {
          var a = ann[k];
          if (a.type === 'rect') {
            ctx.save();
            ctx.strokeStyle = a.color || '#16a34a'; ctx.lineWidth = a.width || 4;
            ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 3;
            roundRect(a.x, a.y, a.w, a.h, a.radius == null ? 6 : a.radius);
            ctx.stroke(); ctx.restore();
            if (a.label) pill(a.x, Math.max(0, a.y - (a.size || 20) - 12), a.label, a.labelColor || '#fff', a.color || '#16a34a', a.size || 18);
          } else if (a.type === 'arrow') {
            arrow(a.x1, a.y1, a.x2, a.y2, neu(a.color, NEU.line, '#09f'), a.width);
          } else if (a.type === 'label') {
            pill(a.x, a.y, a.text, neu(a.color, NEU.fg), neu(a.bg, NEU.bg), a.size || 20);
          } else if (a.type === 'badge') {
            var r = a.r || 16;
            ctx.save();
            ctx.fillStyle = a.bg || '#16a34a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, r * 0.18);
            ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 4;
            ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.shadowBlur = 0; ctx.fillStyle = a.color || '#fff';
            ctx.font = '700 ' + Math.round(r * 1.1) + 'px ' + FONT;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(String(a.n), a.x, a.y + 1); ctx.restore();
          } else if (a.type === 'callout') {
            var cbg = neu(a.bg, NEU.bg);
            if (a.anchorX != null && a.anchorY != null)
              arrow(a.x + (a.w || 220) / 2, a.y, a.anchorX, a.anchorY, neu(a.lineColor, NEU.line, cbg), a.lineWidth || 3);
            pill(a.x, a.y, a.text, neu(a.color, NEU.fg), cbg, a.size || 18, 14, 10);
          } else if (a.type === 'circle') {
            var crx = a.rx != null ? a.rx : (a.r != null ? a.r : 20);
            var cry = a.ry != null ? a.ry : (a.r != null ? a.r : 20);
            ctx.save();
            ctx.strokeStyle = a.color || '#16a34a'; ctx.lineWidth = a.width || 4;
            ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 3;
            ctx.beginPath(); ctx.ellipse(a.x, a.y, crx, cry, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
          } else if (a.type === 'blur') {
            // pixelate a region: downscale that area into a tiny offscreen canvas
            // then draw it back enlarged with smoothing off -> privacy mask.
            var bw = Math.max(1, Math.round(a.w)), bh = Math.max(1, Math.round(a.h));
            var px = a.px || 12; // block size
            var sw = Math.max(1, Math.round(bw / px)), sh = Math.max(1, Math.round(bh / px));
            var tmp = document.createElement('canvas'); tmp.width = sw; tmp.height = sh;
            var tctx = tmp.getContext('2d');
            tctx.drawImage(cv, a.x, a.y, bw, bh, 0, 0, sw, sh);
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tmp, 0, 0, sw, sh, a.x, a.y, bw, bh);
            ctx.restore();
          } else if (a.type === 'zoom') {
            var zs = a.scale && a.scale > 0 ? a.scale : 2;
            var zw = Math.round(a.w * zs), zh = Math.round(a.h * zs);
            var at = a.at || { x: a.x, y: a.y };
            var lc = neu(a.color, NEU.line);
            var srcRect = { x: a.x, y: a.y, w: a.w, h: a.h };
            var insetRect = { x: at.x, y: at.y, w: zw, h: zh };
            var apart = rectsApart(srcRect, insetRect, 10);
            var sourcePixels = document.createElement('canvas');
            sourcePixels.width = Math.max(1, Math.round(a.w));
            sourcePixels.height = Math.max(1, Math.round(a.h));
            sourcePixels.getContext('2d').drawImage(cv, a.x, a.y, a.w, a.h, 0, 0, sourcePixels.width, sourcePixels.height);
            ctx.save();
            if (apart) {
              ctx.strokeStyle = lc; ctx.lineWidth = 2;
              roundRect(srcRect.x, srcRect.y, srcRect.w, srcRect.h, 4); ctx.stroke();
              var link = edgeLink(srcRect, insetRect);
              ctx.setLineDash([6, 5]);
              ctx.beginPath(); ctx.moveTo(link.x1, link.y1); ctx.lineTo(link.x2, link.y2); ctx.stroke();
              ctx.setLineDash([]);
            }
            ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 8;
            ctx.fillStyle = NEU.frame;
            roundRect(at.x - 4, at.y - 4, zw + 8, zh + 8, 8); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(sourcePixels, 0, 0, sourcePixels.width, sourcePixels.height, at.x, at.y, zw, zh);
            ctx.strokeStyle = lc; ctx.lineWidth = 3;
            roundRect(at.x, at.y, zw, zh, 6); ctx.stroke();
            ctx.restore();
          }
        }

        resolve(cv.toDataURL('image/png'));
      } catch (err) { reject('draw failed: ' + (err && err.message ? err.message : err)); }
    };
    img.onerror = function () { reject('image failed to load: ' + (p.imageUrl || 'base64')); };
    // Prefer a same-origin URL (tiny injectable) over an embedded base64 dataURL
    // (huge injectable). Both keep the canvas untainted as long as the URL is
    // same-origin as the page running this code.
    img.src = p.imageUrl || p.imageB64;
  });
}
