#!/usr/bin/env node
// ensure-deps.mjs — make the plugin self-contained. Installs Playwright +
// Chromium (headless shell) into scripts/.deps so NO global install is needed.
// Playwright bundles ffmpeg too, so gifs work without a system ffmpeg.
//
//   node ensure-deps.mjs            # check + install, print summary
//   import { ensureDeps, depsEnv, playwrightSpecifier } from './ensure-deps.mjs'
//
// Idempotent: a second run with everything present is a fast no-op.

import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEPS_DIR = join(HERE, '.deps');
const BROWSERS_DIR = join(DEPS_DIR, 'ms-playwright');
const PW_PKG = join(DEPS_DIR, 'node_modules', 'playwright');

// Env every motor script must use so Playwright finds the isolated browser.
export function depsEnv() {
  return { ...process.env, PLAYWRIGHT_BROWSERS_PATH: BROWSERS_DIR };
}

// Absolute import specifier for the isolated Playwright.
export function playwrightSpecifier() {
  return join(PW_PKG, 'index.mjs');
}

function hasChromium() {
  if (!existsSync(BROWSERS_DIR)) return false;
  try {
    return readdirSync(BROWSERS_DIR).some((d) => /^chromium/.test(d));
  } catch {
    return false;
  }
}

function pwInstalled() {
  return existsSync(playwrightSpecifier());
}

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

export function ensureDeps({ quiet = false, needGif = false } = {}) {
  const log = (m) => { if (!quiet) console.error(m); };
  mkdirSync(DEPS_DIR, { recursive: true });
  const pkgJson = join(DEPS_DIR, 'package.json');
  if (!existsSync(pkgJson)) {
    writeFileSync(pkgJson, JSON.stringify({ name: 'showreel-deps', private: true }, null, 2) + '\n');
  }

  if (!pwInstalled()) {
    console.error('ensure-deps: installing playwright into .deps (one-time npm install)...');
    try {
      run('npm', ['install', 'playwright', '--no-audit', '--no-fund'], { cwd: DEPS_DIR });
    } catch (e) {
      throw new Error(
        'ensure-deps: npm install playwright failed. Install manually:\n' +
        '  cd ' + DEPS_DIR + ' && npm install playwright\n' +
        'Behind a proxy: set HTTPS_PROXY (and npm config set proxy/https-proxy).\n' +
        'npm missing from PATH entirely? Install Node 18+ from https://nodejs.org\n' + (e.message || '')
      );
    }
  }

  if (!hasChromium()) {
    console.error('ensure-deps: downloading chromium headless shell into .deps (one-time, ~90MB — may take minutes)...');
    const pwBin = join(DEPS_DIR, 'node_modules', '.bin', 'playwright');
    try {
      run(pwBin, ['install', 'chromium-headless-shell'], { env: depsEnv() });
    } catch (e) {
      // fall back to full chromium if the headless-shell target isn't known
      try {
        run(pwBin, ['install', 'chromium'], { env: depsEnv() });
      } catch (e2) {
        throw new Error(
          'ensure-deps: chromium download failed. Install manually:\n' +
          '  PLAYWRIGHT_BROWSERS_PATH=' + BROWSERS_DIR + ' ' + pwBin + ' install chromium\n' +
          'Behind a proxy/mirror: set HTTPS_PROXY or PLAYWRIGHT_DOWNLOAD_HOST.\n' +
          (e2.message || e.message || '')
        );
      }
    }
    if (process.platform === 'linux') {
      console.error('ensure-deps: Linux note — if Chromium fails to launch, run once:\n' +
        '  sudo ' + pwBin + ' install-deps chromium');
    }
  }

  const ffmpeg = existsSync(BROWSERS_DIR) && readdirSync(BROWSERS_DIR).some((d) => /^ffmpeg/.test(d));
  if (needGif && !ffmpeg && !systemFfmpeg()) {
    log('ensure-deps: WARNING no ffmpeg (bundled or system) — gif conversion will fail.');
  }

  return { playwright: pwInstalled(), chromium: hasChromium(), ffmpeg: ffmpeg || systemFfmpeg() };
}

function systemFfmpeg() {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

// Resolve the ffmpeg binary the motor should use. PREFER system ffmpeg: it is
// full-featured (palettegen/fps filters needed for quality gifs). Playwright's
// bundled ffmpeg is a stripped encode-only build (has scale, lacks palettegen),
// so it is only a fallback for simple conversions.
export function bundledFfmpeg() {
  if (existsSync(BROWSERS_DIR)) {
    try {
      const dir = readdirSync(BROWSERS_DIR).find((d) => /^ffmpeg/.test(d));
      if (dir) {
        for (const c of [
          join(BROWSERS_DIR, dir, 'ffmpeg-mac'),
          join(BROWSERS_DIR, dir, 'ffmpeg-linux'),
          join(BROWSERS_DIR, dir, 'ffmpeg.exe'),
        ]) if (existsSync(c)) return c;
      }
    } catch { /* ignore */ }
  }
  return null;
}

export function ffmpegPath() {
  return systemFfmpeg() ? 'ffmpeg' : (bundledFfmpeg() || 'ffmpeg');
}

// True when the resolved ffmpeg supports the palettegen filter (high-quality
// two-pass gif). Bundled-only -> false -> caller uses the simple path.
export function ffmpegHasPalette() {
  return systemFfmpeg();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const r = ensureDeps({ needGif: true });
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
