// rec-steps.mjs — pure step/arg helpers for the recorder (no browser, no I/O).
// Extracted from rec.mjs so the recorder's orchestration stays readable and
// these stay unit-testable in isolation. rec.mjs re-exports everything here.

import { num } from './cli-args.mjs';

const HOST_CSV = /^[a-z0-9*.:_-]+(,[a-z0-9*.:_-]+)*$/i;
export function looksLikeHostCsv(v) {
  return !!v && !v.startsWith('--') && !v.includes('/') && HOST_CSV.test(v) &&
    !/\.(gif|mp4|webm|json|html?)$/i.test(v);
}

export function parse(argv) {
  // gifWidth null = full capture width (no downscale — quality rule); size
  // pressure is shrink/RECOMMEND-MP4's job, not a resolution cut here.
  // height null = derived from --ratio and the letterbox lanes the steps use,
  // so the final canvas lands EXACTLY on the aspect and the encoder never has
  // to fill sideways. An explicit --height wins and may get aspect fill.
  const a = { width: 1600, height: null, gifWidth: null, fps: 18, ratio: '16:9' };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--steps') a.steps = argv[++i];
    else if (k === '--steps-json') a.stepsJson = argv[++i];
    else if (k === '--pace') a.pace = argv[++i];
    else if (k === '--dry') a.dry = true;
    else if (k === '--stamp') a.stamp = true;
    else if (k === '--theme') a.theme = argv[++i];
    else if (k === '--accent') a.accent = argv[++i];
    else if (k === '--ratio') a.ratio = argv[++i];
    else if (k === '--fit') a.fit = argv[++i];
    else if (k === '--end-card') a.endCard = argv[++i];
    else if (k === '--mp4') a.mp4 = argv[++i];
    else if (k === '--keep-webm') a.keepWebm = argv[++i];
    else if (k === '--contact-sheet') {
      a.sheet = argv[i + 1] && !argv[i + 1].startsWith('--') && /\.png$/i.test(argv[i + 1]) ? argv[++i] : true;
    }
    else if (k === '--batch') a.batch = argv[++i];
    else if (k === '--block-hosts') {
      a.blockHosts = [];
      if (looksLikeHostCsv(argv[i + 1]))
        a.blockHosts = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    }
    else if (k === '--offline') a.offline = true;
    else if (k === '--auto-annotate') a.autoAnnotate = true;
    else if (k === '--width') a.width = num('rec', '--width', argv[++i], { int: true, min: 1 });
    else if (k === '--height') a.height = num('rec', '--height', argv[++i], { int: true, min: 1 });
    else if (k === '--gif-width') a.gifWidth = num('rec', '--gif-width', argv[++i], { int: true, min: 1 });
    else if (k === '--fps') { a.fps = num('rec', '--fps', argv[++i], { int: true, min: 1 }); a.fpsSet = true; }
    else if (k.startsWith('--')) throw new Error('rec: unknown arg ' + k);
    else pos.push(k);
  }
  if (pos.length > 2) throw new Error(`rec: too many positional args (expected url + out): ${pos.slice(2).join(' ')} — quote a value with spaces?`);
  [a.url, a.out] = pos;
  return a;
}

export const STEP_KEYS = new Set(['click', 'scrollTo', 'wait', 'note', 'arrow', 'badge', 'rect', 'circle', 'blur', 'hide', 'modal', 'glide', 'marks', 'screen', 'zoom', 'topbar', 'bottombar', 'fill', 'text', 'delay', 'select', 'option', 'camera', 'glossary', 'stagger', 'accent', 'inset', 'follow', 'fade', 'speed', 'spotlight', 'redact', 'highlight', 'confetti', 'countup', 'sparkline', 'pulse', 'ripple', 'shake', 'glow', 'checkmark', 'typeon', 'reveal', 'orbit', 'kenburns', 'flash', 'progress', 'countdown', 'trail', 'size', 'dur', 'count', 'intensity']);

export const GLOSSARY_POS = new Set(['auto', 'top-left', 'top-right', 'bottom-left', 'bottom-right']);
export const MARK_KEYS = new Set(['sel', 'badge', 'rect', 'circle', 'text']);

// Reading-time dwell: sentence-bearing overlays (note/modal/end card) stay
// fully visible long enough to read. Floor lands AFTER pace scaling — fast
// takes shorten everything else, never the time a viewer needs to read.
export function dwellMs(text, paceFactor = 1) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
  const base = Math.min(12000, 4500 + Math.max(0, words - 8) * 250);
  return Math.max(4500, Math.round(base * paceFactor));
}

// --offline trades capture density for wall time: 15fps reads fine for UI
// demos with eased cursors and shaves ~17% of the hot-frame cost vs 18.
// An explicit --fps always wins.
export function applyOfflineDefaults(a) {
  if (a.offline && !a.fpsSet) a.fps = 15;
  return a;
}

// The hot head of a step's hold: the slice where things still animate on
// screen (overlay fade-in, badge/glossary staggers, the page reacting to a
// click) before the dwell goes truly static. Offline rendering captures the
// head frame by frame and collapses the static tail into one advance.
export function hotHeadFor(step) {
  const fade = (step && typeof step.fade === 'number' ? step.fade : 400);
  const g = step && step.glossary;
  const gOpt = g && typeof g === 'object' ? g : {};
  const STAG = gOpt.stagger != null ? gOpt.stagger : step && step.stagger != null ? step.stagger : 380;
  let n = 0;
  if (step && Array.isArray(step.marks)) n = Math.max(n, step.marks.filter((m) => m && m.badge != null).length);
  if (Array.isArray(gOpt.items)) n = Math.max(n, gOpt.items.length);
  let head = n ? Math.max(fade, 250 + (n - 1) * STAG + 450) : fade;
  // a click's reaction (toast, drawer, route paint) lands inside the hold —
  // give it a hot window or offline frames never see it move.
  if (step && step.click) head = Math.max(head, 900);
  return head;
}

export function fillSpec(step) {
  if (step.fill == null) return null;
  if (typeof step.fill === 'string')
    return { sel: step.fill, text: step.text, delay: step.delay != null ? step.delay : 45 };
  return { sel: step.fill.sel, text: step.fill.value != null ? step.fill.value : step.fill.text, delay: step.fill.delay != null ? step.fill.delay : 45 };
}

export function selectSpec(step) {
  if (step.select == null) return null;
  if (typeof step.select === 'string') return { sel: step.select, option: step.option };
  return { sel: step.select.sel, option: step.select.value != null ? step.select.value : step.select.option };
}

// --auto-annotate: an interaction step (click/fill/select) that doesn't already
// declare its own visual annotation gets a rect outline on the target plus a
// note carrying the element's visible label — the agent writes {click:"#deploy"}
// and the viewer gets "Deploy to production" boxed for free, no roster verbosity.
// Author intent always wins: a declared note/rect/circle/badge/modal is never
// touched. `label` is the element's visible text, resolved live by the caller
// (null/'' when none). Pure; the selector for the rect comes from the
// interaction's own selector. Non-interaction steps pass through unchanged.
export function autoAnnotateStep(step, label) {
  const sel = typeof step.click === 'string' ? step.click
    : step.fill ? (typeof step.fill === 'string' ? step.fill : step.fill.sel)
    : step.select ? (typeof step.select === 'string' ? step.select : step.select.sel)
    : null;
  if (!sel) return step;
  const hasVisual = step.rect != null || step.circle != null || step.badge != null ||
    step.note != null || step.modal != null || step.arrow != null || step.spotlight != null;
  if (hasVisual) return step;
  const out = { ...step, rect: sel };
  const txt = String(label ?? '').trim();
  if (txt) out.note = txt;
  return out;
}

const camStr = (c) => 'translate(' + c.tx + 'px,' + c.ty + 'px) scale(' + c.s + ')';

// Starting a CSS transition under a PAUSED virtual clock needs the from-value
// committed (transition:none + reflow) before the to-value is armed — without
// an intervening frame the engine resolves straight to the end and the move
// renders frozen. Realtime gets that commit implicitly via a real compositor
// frame between camera moves; offline must do it explicitly. The ordered op
// list is the contract camSnippet's __camTo follows; this pure export locks it.
export function camTransitionPlan(from, to, ms) {
  return [
    { transition: 'none', transform: camStr(from) },
    { reflow: true },
    { transition: 'transform ' + ms + 'ms cubic-bezier(.4,0,.2,1)', transform: camStr(to) },
  ];
}

// Releasing the scroll-clamp must leave __cam == the rendered transform and
// must NOT leave a residual transition:none on the body (the next __camTo
// would inherit it and skip its animation). Reassert the pose from __cam,
// reflow to lock it, then clear the transition property.
export function clampRelease(cam) {
  return [
    { transition: 'none', transform: camStr(cam) },
    { reflow: true },
    { transition: '' },
  ];
}

export function cameraSpec(step) {
  if (step.camera == null) return null;
  if (step.camera === 'out') return { out: true };
  if (typeof step.camera === 'string')
    return { sel: step.camera, zoom: typeof step.zoom === 'number' ? step.zoom : 0 };
  const z = typeof step.camera.zoom === 'number' ? step.camera.zoom
    : typeof step.zoom === 'number' ? step.zoom : 0;
  return { sel: step.camera.sel, zoom: z };
}

export function modalLayout(modal, box, vp) {
  const m = typeof modal === 'string' ? { text: modal } : modal;
  let pos = m.position;
  if (!pos) {
    if (box) {
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      pos = (cy < vp.h / 2 ? 'bottom' : 'top') + '-' + (cx < vp.w / 2 ? 'right' : 'left');
    } else pos = 'center';
  }
  const backdrop = m.backdrop != null ? m.backdrop : pos === 'center';
  // header/html/footer = the rich card form; title/text = the plain form.
  // header falls back to title, content to text, so old scripts still work.
  return {
    pos, backdrop,
    title: m.header || m.title,
    text: m.text,
    html: m.html || null,
    footer: m.footer || null,
  };
}

export function screenPhase(step) {
  if (!step.screen) return null;
  return step.click ? 'afterClick' : 'before';
}

export function validateSteps(steps) {
  const errors = [];
  if (!Array.isArray(steps)) return { ok: false, errors: ['steps.json must be an array'] };
  steps.forEach((s, i) => {
    const n = 'step ' + (i + 1);
    const bad = Object.keys(s).filter((k) => !STEP_KEYS.has(k));
    if (bad.length) errors.push(n + ' has unknown keys: ' + bad.join(', ') + ' (known: ' + [...STEP_KEYS].join(', ') + ')');
    if ('zoom' in s) {
      if ('camera' in s) {
        if (typeof s.zoom !== 'number') errors.push(n + ': alongside camera, zoom must be a number in (1, 3]');
        else if (!(s.zoom > 1 && s.zoom <= 3)) errors.push(n + ': camera zoom must be in (1, 3] — got ' + s.zoom);
        else if (s.camera === 'out') errors.push(n + ': camera "out" resets the framing — drop the zoom number');
      } else if (typeof s.zoom === 'number') {
        errors.push(n + ': numeric zoom only rides a camera step ({"camera":".sel","zoom":1.4})');
      } else if (s.zoom === true) {
        if (!s.click) errors.push(n + ': zoom:true zooms toward the click target — pair it with click, or use {"zoom":".selector"}');
      } else if (typeof s.zoom !== 'string' || !s.zoom) {
        errors.push(n + ': zoom must be a selector string, "out", or true (with click)');
      }
    }
    if ('camera' in s) {
      const c = s.camera;
      if (c !== 'out' && typeof c === 'string' && !c) errors.push(n + ': camera must be a non-empty selector string, "out", or {sel, zoom}');
      else if (c !== 'out' && typeof c !== 'string') {
        if (!c || typeof c !== 'object' || Array.isArray(c)) errors.push(n + ': camera must be a selector string, "out", or {sel, zoom}');
        else {
          if (typeof c.sel !== 'string' || !c.sel) errors.push(n + ': camera.sel must be a non-empty selector string');
          if ('zoom' in c && (typeof c.zoom !== 'number' || !(c.zoom > 1 && c.zoom <= 3))) errors.push(n + ': camera zoom must be a number in (1, 3]');
        }
      }
    }
    if ('fill' in s) {
      const f = s.fill;
      if (typeof f === 'string') {
        if (!f) errors.push(n + ': fill must be a non-empty selector string');
        if (typeof s.text !== 'string' || !s.text) errors.push(n + ': fill needs text — the string to type ({"fill":"#email","text":"a@b.com"})');
      } else if (f && typeof f === 'object' && !Array.isArray(f)) {
        if (typeof f.sel !== 'string' || !f.sel) errors.push(n + ': fill.sel must be a non-empty selector string');
        if (typeof f.value !== 'string' || !f.value) errors.push(n + ': fill.value must be the string to type');
      } else errors.push(n + ': fill must be a selector string (with text) or {sel, value}');
    } else {
      if ('text' in s) errors.push(n + ': text only rides a fill step');
      if ('delay' in s) errors.push(n + ': delay only rides a fill step');
    }
    if ('fill' in s && 'delay' in s && (typeof s.delay !== 'number' || !Number.isFinite(s.delay) || s.delay < 0))
      errors.push(n + ': delay must be a non-negative number (ms per typed char)');
    if ('select' in s) {
      const sl = s.select;
      if (typeof sl === 'string') {
        if (!sl) errors.push(n + ': select must be a non-empty selector string');
        if (typeof s.option !== 'string' || !s.option) errors.push(n + ': select needs option — the visible label to pick ({"select":"#region","option":"São Paulo"})');
      } else if (sl && typeof sl === 'object' && !Array.isArray(sl)) {
        if (typeof sl.sel !== 'string' || !sl.sel) errors.push(n + ': select.sel must be a non-empty selector string');
        if (typeof sl.value !== 'string' || !sl.value) errors.push(n + ': select.value must be the option label to pick');
      } else errors.push(n + ': select must be a selector string (with option) or {sel, value}');
    } else if ('option' in s) errors.push(n + ': option only rides a select step');
    for (const bk of ['topbar', 'bottombar']) {
      if (bk in s && s[bk] !== false && (typeof s[bk] !== 'string' || !s[bk]))
        errors.push(n + ': ' + bk + ' must be a non-empty string (or false to remove it)');
    }
    if (s.marks) {
      if (!Array.isArray(s.marks)) errors.push(n + ': marks must be an array');
      else s.marks.forEach((m, j) => {
        if (!m.sel) errors.push(n + ' mark ' + (j + 1) + ': missing sel');
        const mb = Object.keys(m).filter((k) => !MARK_KEYS.has(k));
        if (mb.length) errors.push(n + ' mark ' + (j + 1) + ' has unknown keys: ' + mb.join(', ') + ' (known: ' + [...MARK_KEYS].join(', ') + ')');
      });
    }
    if ('size' in s && (typeof s.size !== 'number' || !(s.size > 0 && s.size <= 4)))
      errors.push(n + ': size must be a positive number scale (0,4] — proportional multiplier for effects');
    // shared dinamicidade knobs — apply to every primitive unless its own object
    // form overrides. duration ms, count repeats/particles, intensity strength.
    if ('dur' in s && (typeof s.dur !== 'number' || !(s.dur >= 120 && s.dur <= 12000)))
      errors.push(n + ': dur must be a number in [120, 12000] ms — the effect animation length');
    if ('count' in s && (typeof s.count !== 'number' || !Number.isInteger(s.count) || !(s.count >= 1 && s.count <= 60)))
      errors.push(n + ': count must be an integer in [1, 60] — rings/dots/particles/laps/digits');
    if ('intensity' in s && (typeof s.intensity !== 'number' || !(s.intensity >= 0.2 && s.intensity <= 2)))
      errors.push(n + ': intensity must be a number in [0.2, 2] — effect strength (glow/amplitude/drift)');
    // a primitive's object form may also carry per-effect knobs; these keys are
    // accepted on ANY effect object ({sel, duration, count, scale, intensity}).
    const KNOBS = new Set(['sel', 'duration', 'count', 'scale', 'intensity']);
    const knobErr = (key, obj) => {
      if ('duration' in obj && (typeof obj.duration !== 'number' || !(obj.duration >= 120 && obj.duration <= 12000)))
        errors.push(n + ': ' + key + '.duration must be a number in [120, 12000] ms');
      if ('count' in obj && (typeof obj.count !== 'number' || !Number.isInteger(obj.count) || !(obj.count >= 1 && obj.count <= 60)))
        errors.push(n + ': ' + key + '.count must be an integer in [1, 60]');
      if ('scale' in obj && (typeof obj.scale !== 'number' || !(obj.scale > 0 && obj.scale <= 4)))
        errors.push(n + ': ' + key + '.scale must be a positive number in (0, 4]');
      if ('intensity' in obj && (typeof obj.intensity !== 'number' || !(obj.intensity >= 0.2 && obj.intensity <= 2)))
        errors.push(n + ': ' + key + '.intensity must be a number in [0.2, 2]');
    };
    // target-or-true primitives: accept true | "selector" | {sel?, knobs}. When
    // an object without sel is given it bursts from the step's click/glide target.
    const targetEffect = (key, needTargetMsg) => {
      if (!(key in s)) return;
      const v = s[key];
      if (v === true) {
        if (!s.click && !s.glide) errors.push(n + ': ' + key + needTargetMsg);
      } else if (typeof v === 'string') {
        if (!v) errors.push(n + ': ' + key + ' must be true, a non-empty selector string, or {sel?, duration?, count?, scale?, intensity?}');
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        if ('sel' in v && (typeof v.sel !== 'string' || !v.sel)) errors.push(n + ': ' + key + '.sel must be a non-empty selector string');
        if (!('sel' in v) && !s.click && !s.glide) errors.push(n + ': ' + key + needTargetMsg);
        const bad2 = Object.keys(v).filter((k) => !KNOBS.has(k));
        if (bad2.length) errors.push(n + ': ' + key + ' has unknown keys: ' + bad2.join(', ') + ' (known: ' + [...KNOBS].join(', ') + ')');
        knobErr(key, v);
      } else errors.push(n + ': ' + key + ' must be true, a selector string, or {sel?, duration?, count?, scale?, intensity?}');
    };
    targetEffect('confetti', ':true needs a click or glide target — or pass {"confetti":".sel"}');
    if ('countup' in s) {
      const c = s.countup;
      if (c === true) {
        if (!s.click && !s.scrollTo)
          errors.push(n + ': countup:true counts the number in the step target — pair it with a click/scrollTo selector, or pass {"countup":".sel"}');
      } else if (typeof c === 'string') {
        if (!c) errors.push(n + ': countup must be a non-empty selector string or {sel, to}');
      } else if (c && typeof c === 'object' && !Array.isArray(c)) {
        if (typeof c.sel !== 'string' || !c.sel) errors.push(n + ': countup.sel must be a non-empty selector string');
        if ('to' in c && c.to != null && typeof c.to !== 'string' && typeof c.to !== 'number') errors.push(n + ': countup.to must be the final string/number to count to');
        knobErr('countup', c);
      } else errors.push(n + ': countup must be true (count the step target), a selector string, or {sel, to}');
    }
    if ('sparkline' in s) {
      const sp = s.sparkline;
      if (typeof sp === 'string') {
        if (!sp) errors.push(n + ': sparkline must be a non-empty selector string or {sel, points}');
      } else if (sp && typeof sp === 'object' && !Array.isArray(sp)) {
        if (typeof sp.sel !== 'string' || !sp.sel) errors.push(n + ': sparkline.sel must be a non-empty selector string');
        if ('points' in sp) {
          if (!Array.isArray(sp.points) || sp.points.length < 2 || !sp.points.every((p) => typeof p === 'number' && Number.isFinite(p)))
            errors.push(n + ': sparkline.points must be an array of >= 2 finite numbers');
        }
        knobErr('sparkline', sp);
      } else errors.push(n + ': sparkline must be a selector string or {sel, points}');
    }
    if ('accent' in s && (typeof s.accent !== 'string' || !s.accent))
      errors.push(n + ': accent must be a CSS color string (overrides the take accent for this step)');
    if ('fade' in s && (typeof s.fade !== 'number' || !(s.fade >= 60 && s.fade <= 1500)))
      errors.push(n + ': fade must be a number in [60, 1500] ms — this step\'s overlay fade in/out');
    if ('speed' in s && (typeof s.speed !== 'number' || !(s.speed >= 0.1 && s.speed <= 8)))
      errors.push(n + ': speed must be a number in [0.1, 8] — playback rate for this step\'s motion (0.25 = slow-mo, 2 = fast; offline only)');
    if ('follow' in s) {
      if (s.follow !== true && (typeof s.follow !== 'number' || !(s.follow > 1 && s.follow <= 3)))
        errors.push(n + ': follow must be true (1.4x) or a number in (1, 3] — the camera chases the cursor');
      if (!s.click && !s.glide && !s.fill && !s.select)
        errors.push(n + ': follow rides a cursor movement — pair it with click, glide, fill or select');
    }
    if ('inset' in s) {
      const iv = s.inset;
      if (typeof iv === 'string') {
        if (!iv) errors.push(n + ': inset must be a non-empty selector string or {sel, zoom}');
      } else if (iv && typeof iv === 'object' && !Array.isArray(iv)) {
        if (typeof iv.sel !== 'string' || !iv.sel) errors.push(n + ': inset.sel must be a non-empty selector string');
        if ('zoom' in iv && (typeof iv.zoom !== 'number' || !(iv.zoom > 1 && iv.zoom <= 3))) errors.push(n + ': inset.zoom must be a number in (1, 3]');
      } else errors.push(n + ': inset must be a non-empty selector string or {sel, zoom}');
    }
    if ('stagger' in s) {
      if (typeof s.stagger !== 'number' || !Number.isFinite(s.stagger) || s.stagger < 0)
        errors.push(n + ': stagger must be a non-negative number (ms between reveals)');
      if (!s.marks && !s.glossary) errors.push(n + ': stagger only rides marks or glossary');
    }
    if ('glossary' in s) {
      const g = s.glossary;
      const marksTexts = Array.isArray(s.marks) && s.marks.some((m) => m && m.text != null);
      if (g === true) {
        if (!marksTexts) errors.push(n + ': glossary:true needs marks with text fields to list');
      } else if (!g || typeof g !== 'object' || Array.isArray(g)) {
        errors.push(n + ': glossary must be true (list marks texts) or {items, pos?, title?, width?, stagger?}');
      } else {
        if ('items' in g) {
          if (!Array.isArray(g.items) || !g.items.length) errors.push(n + ': glossary.items must be a non-empty array');
          else g.items.forEach((it, j) => {
            if (!it || typeof it !== 'object' || it.badge == null || it.text == null)
              errors.push(n + ' glossary item ' + (j + 1) + ': needs badge and text');
          });
        } else if (!marksTexts) {
          errors.push(n + ': glossary without items needs marks with text fields');
        }
        if ('pos' in g && !GLOSSARY_POS.has(g.pos)) errors.push(n + ': glossary.pos must be one of ' + [...GLOSSARY_POS].join('|'));
        if ('width' in g && (typeof g.width !== 'number' || !(g.width >= 160 && g.width <= 720))) errors.push(n + ': glossary.width must be a number in [160, 720]');
        if ('title' in g && (typeof g.title !== 'string' || !g.title)) errors.push(n + ': glossary.title must be a non-empty string');
        if ('stagger' in g && (typeof g.stagger !== 'number' || !Number.isFinite(g.stagger) || g.stagger < 0)) errors.push(n + ': glossary.stagger must be a non-negative number');
      }
    }
    targetEffect('pulse', ':true needs a click or glide target — or pass {"pulse":".sel"}');
    targetEffect('ripple', ':true needs a click or glide target — or pass {"ripple":".sel"}');
    targetEffect('shake', ':true needs a click or glide target — or pass {"shake":".sel"}');
    // selector-required primitives: accept "selector" | {sel, knobs}.
    const selEffect = (key, what) => {
      if (!(key in s)) return;
      const v = s[key];
      if (typeof v === 'string') {
        if (!v) errors.push(n + ': ' + key + ' must be a non-empty selector string ' + what);
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (typeof v.sel !== 'string' || !v.sel) errors.push(n + ': ' + key + '.sel must be a non-empty selector string');
        const bad2 = Object.keys(v).filter((k) => !KNOBS.has(k));
        if (bad2.length) errors.push(n + ': ' + key + ' has unknown keys: ' + bad2.join(', ') + ' (known: ' + [...KNOBS].join(', ') + ')');
        knobErr(key, v);
      } else errors.push(n + ': ' + key + ' must be a selector string or {sel, duration?, count?, scale?, intensity?}');
    };
    selEffect('glow', '(the CTA to pulse a breathing glow on)');
    targetEffect('checkmark', ':true needs a click or glide target — or pass {"checkmark":".sel"}');
    if ('typeon' in s) {
      const tv = s.typeon;
      if (typeof tv === 'string') {
        if (!tv) errors.push(n + ': typeon must be a non-empty selector string or {sel, text}');
      } else if (tv && typeof tv === 'object' && !Array.isArray(tv)) {
        if (typeof tv.sel !== 'string' || !tv.sel) errors.push(n + ': typeon.sel must be a non-empty selector string');
        if ('text' in tv && (typeof tv.text !== 'string' || !tv.text)) errors.push(n + ': typeon.text must be the string to type');
        knobErr('typeon', tv);
      } else errors.push(n + ': typeon must be a non-empty selector string or {sel, text}');
    }
    selEffect('reveal', '— the text element to wipe in left-to-right');
    targetEffect('orbit', ':true needs a click or glide target — or pass {"orbit":".sel"}');
    if ('kenburns' in s) {
      const v = s.kenburns;
      if (v === true) {
        if (!s.click && !s.glide && !s.scrollTo) errors.push(n + ': kenburns:true needs a click, glide or scrollTo target — or pass {"kenburns":".sel"}');
      } else if (typeof v === 'string') {
        if (!v) errors.push(n + ': kenburns must be true, a selector string, or {sel?, duration?, scale?}');
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        if ('sel' in v && (typeof v.sel !== 'string' || !v.sel)) errors.push(n + ': kenburns.sel must be a non-empty selector string');
        if (!('sel' in v) && !s.click && !s.glide && !s.scrollTo) errors.push(n + ': kenburns needs a click, glide, scrollTo or sel target');
        const bad2 = Object.keys(v).filter((k) => !KNOBS.has(k));
        if (bad2.length) errors.push(n + ': kenburns has unknown keys: ' + bad2.join(', ') + ' (known: ' + [...KNOBS].join(', ') + ')');
        knobErr('kenburns', v);
      } else errors.push(n + ': kenburns must be true, a selector string, or {sel?, duration?, scale?}');
    }
    if ('flash' in s) {
      if (s.flash !== true && (typeof s.flash !== 'string' || !s.flash))
        errors.push(n + ': flash must be true (white/accent pulse) or a non-empty CSS color string');
    }
    selEffect('progress', '— the element to draw a bottom-edge fill bar on ({"progress":"#card"})');
    if ('countdown' in s) {
      const c = s.countdown;
      if (c === true) errors.push(n + ': countdown must be a number of seconds (default 3), a selector string to center on, or {n, sel} — not true');
      else if (typeof c === 'number') {
        if (!Number.isFinite(c) || !(c >= 1 && c <= 9)) errors.push(n + ': countdown seconds must be a number in [1, 9] — got ' + c);
      } else if (typeof c === 'string') {
        if (!c) errors.push(n + ': countdown must be a non-empty selector string, a number of seconds, or {n, sel}');
      } else if (c && typeof c === 'object' && !Array.isArray(c)) {
        if ('n' in c && (typeof c.n !== 'number' || !(c.n >= 1 && c.n <= 9))) errors.push(n + ': countdown.n must be a number in [1, 9]');
        if ('sel' in c && (typeof c.sel !== 'string' || !c.sel)) errors.push(n + ': countdown.sel must be a non-empty selector string');
        knobErr('countdown', c);
      } else errors.push(n + ': countdown must be a number of seconds, a selector string, or {n, sel}');
    }
    if ('trail' in s) {
      const t = s.trail;
      if (!t || typeof t !== 'object' || Array.isArray(t)) errors.push(n + ': trail must be {from, to} — two selector strings the comet streaks between');
      else {
        if (typeof t.from !== 'string' || !t.from) errors.push(n + ': trail.from must be a non-empty selector string (the comet origin)');
        if (typeof t.to !== 'string' || !t.to) errors.push(n + ': trail.to must be a non-empty selector string (the comet destination)');
        knobErr('trail', t);
      }
    }
  });
  return { ok: !errors.length, errors };
}

// Primitives whose motion is a transform/stroke CSS transition: under the
// paused virtual clock (--offline) the engine resolves the transition to its
// end pose without sampling the in-between, so the burst never appears on the
// captured frames (proven: confetti chips and the sparkline draw both render
// blank offline, perfect realtime). flash is opacity-on-a-static-layer and
// survives. These belong in a realtime take — same spirit as the cookbook's
// "moving reel = realtime" rule, now enforced instead of just documented.
export const OFFLINE_INCOMPATIBLE = new Set(['confetti', 'sparkline']);

// Gate: with --offline set, flag any step carrying an offline-incompatible
// motion primitive. rec.mjs turns a non-empty list into a hard error before a
// browser launches (a silently-blank burst is worse than a refusal).
export function offlineMotionConflicts(steps) {
  if (!Array.isArray(steps)) return [];
  const hits = [];
  steps.forEach((s, i) => {
    if (!s || typeof s !== 'object') return;
    for (const k of Object.keys(s)) {
      if (OFFLINE_INCOMPATIBLE.has(k)) hits.push({ step: i + 1, key: k });
    }
  });
  return hits;
}

// Sidecar step label: the human note when present, otherwise the take's first
// authored action key — enough for compose tooling to name segments.
export function stepLabel(step) {
  if (step.note) return String(step.note);
  const k = Object.keys(step).find((x) => STEP_KEYS.has(x));
  return k || 'step';
}

export const TAKE_KEYS = new Set(['steps', 'out', 'url', 'width', 'height', 'gifWidth', 'fps', 'stamp', 'mp4', 'keepWebm', 'pace', 'theme', 'accent', 'ratio', 'endCard', 'sheet']);

export const END_CARD_MODES = new Set(['gif', 'all', 'none']);

export const THEMES = new Set(['auto', 'light', 'dark']);

// ffmpeg pad stage forcing the FINAL canvas (post letterbox strips) to the
// given aspect — 'W:H' string or 'free' to disable. Pure; unit tested.
export function padToRatio(ratio, color) {
  if (!ratio || ratio === 'free') return '';
  const m = String(ratio).match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!m || !(+m[1] > 0) || !(+m[2] > 0)) return '';
  const rw = +m[1], rh = +m[2];
  return `pad=w='ceil(max(iw,ih*${rw}/${rh})/2)*2':h='ceil(max(ih,iw*${rh}/${rw})/2)*2':x='(ow-iw)/2':y='(oh-ih)/2':color=${color}`;
}

// CAPTURE height for a forced aspect: page + the 44px letterbox lanes the
// steps will use must land exactly on the ratio — the encoder then has no
// aspect deficit to fill, and the lateral bars a sideways fill produces can
// never appear. 'free' or an unparsable ratio keeps the classic default.
export function deriveCaptureHeight(width, ratio, steps, stamp) {
  const m = String(ratio || '').match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!m || !(+m[1] > 0) || !(+m[2] > 0)) return 812;
  const list = Array.isArray(steps) ? steps : [];
  const top = (stamp || list.some((s) => s && ('topbar' in s || 'screen' in s))) ? 44 : 0;
  const bottom = list.some((s) => s && 'bottombar' in s) ? 44 : 0;
  const h = Math.round(width * +m[2] / +m[1]) - top - bottom;
  return Math.max(300, h - (h % 2));
}

// A forced ratio (the default 16:9) ALWAYS wins the capture height: capturing
// off-ratio and padding to fit is what put glaring side bars on the video. So
// the height is derived to land the page+lanes exactly on the ratio, and an
// explicit --height that breaks the ratio is overridden (with a warning) — the
// pad stage then has no deficit to fill, no bars can appear. 'free' (or an
// unparsable ratio) keeps whatever height the caller asked for.
export function resolveCaptureHeight(width, height, ratio, steps, stamp) {
  const forced = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.test(String(ratio || ''));
  if (!forced) return { height: height ?? 812, warn: null };
  const derived = deriveCaptureHeight(width, ratio, steps, stamp);
  if (height == null) return { height: derived, warn: null };
  if (height === derived) return { height, warn: null };
  return {
    height: derived,
    warn: `rec: --height ${height} breaks --ratio ${ratio} at width ${width} (would add side bars); capturing at ${width}x${derived} instead. Pass --ratio free to keep ${width}x${height}.`,
  };
}

// Batch roster: EVERY take is fully validated before any browser launches —
// a typo in take 7 must not burn the minutes spent recording takes 1-6.
// Returns normalized takes with the CLI defaults folded in. mp4/keepWebm
// accept true (path derived from out) or an explicit path.
export function validateBatch(takes, defaults = {}) {
  const errors = [];
  if (!Array.isArray(takes) || !takes.length)
    return { ok: false, errors: ['batch file must be a non-empty JSON array of takes'], takes: [] };
  const norm = takes.map((t, i) => {
    const n = 'take ' + (i + 1);
    if (!t || typeof t !== 'object' || Array.isArray(t)) { errors.push(n + ' must be an object'); return null; }
    const bad = Object.keys(t).filter((k) => !TAKE_KEYS.has(k));
    if (bad.length) errors.push(n + ' has unknown keys: ' + bad.join(', ') + ' (known: ' + [...TAKE_KEYS].join(', ') + ')');
    if (!Array.isArray(t.steps)) errors.push(n + ': steps (array) is required');
    else {
      const v = validateSteps(t.steps);
      if (!v.ok) for (const e of v.errors) errors.push(n + ', ' + e);
    }
    if (typeof t.out !== 'string' || !t.out) errors.push(n + ': out (gif path) is required');
    const th = t.theme ?? defaults.theme;
    if (th != null && !THEMES.has(th)) errors.push(n + ': theme must be auto|light|dark');
    const ac = t.accent ?? defaults.accent;
    if (ac != null && (typeof ac !== 'string' || !ac)) errors.push(n + ': accent must be a CSS color string');
    const ra = t.ratio ?? defaults.ratio ?? '16:9';
    if (ra !== 'free' && !padToRatio(ra, '0x000000')) errors.push(n + ': ratio must be "W:H" (e.g. 16:9) or "free"');
    const ec = t.endCard ?? defaults.endCard;
    if (ec != null && !END_CARD_MODES.has(ec)) errors.push(n + ': endCard must be gif|all|none');
    const url = t.url || defaults.url;
    if (!url) errors.push(n + ': url is required (per take, or as the CLI positional default)');
    const derive = (v, ext) => v === true
      ? String(t.out || 'out.gif').replace(/\.gif$/i, '') + ext
      : (typeof v === 'string' && v ? v : null);
    const width = t.width ?? defaults.width ?? 1600;
    const stamp = !!(t.stamp ?? defaults.stamp);
    // an .mp4 out is mp4-ONLY: the gif encode (palette pass + a gif often
    // 10x the mp4) is skipped entirely — the realtime capture is the floor,
    // the encode shouldn't add minutes nobody asked for.
    const mp4Only = /\.mp4$/i.test(String(t.out || ''));
    const rh = resolveCaptureHeight(width, t.height ?? defaults.height ?? null, ra, t.steps, stamp);
    if (rh.warn) console.error(n + ': ' + rh.warn);
    return {
      steps: t.steps, out: t.out, url,
      width,
      height: rh.height,
      gifWidth: t.gifWidth ?? defaults.gifWidth ?? null,
      fps: t.fps ?? defaults.fps ?? 18,
      stamp,
      pace: t.pace ?? defaults.pace,
      theme: t.theme ?? defaults.theme ?? 'auto',
      accent: t.accent ?? defaults.accent ?? null,
      ratio: t.ratio ?? defaults.ratio ?? '16:9',
      endCard: t.endCard ?? defaults.endCard ?? 'none',
      gif: !mp4Only,
      mp4: mp4Only ? t.out : derive(t.mp4, '.mp4'),
      keepWebm: derive(t.keepWebm, '.webm'),
    };
  });
  return { ok: !errors.length, errors, takes: norm };
}
