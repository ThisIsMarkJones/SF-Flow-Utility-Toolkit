'use strict';
/**
 * Launches Chromium with the toolkit loaded and logs in to the test org.
 *
 * - Extension: by default an unpacked copy of the store build from
 *   scripts/package.sh (the dev manifest.json lacks all_frames, so the repo
 *   root doesn't behave like the published extension). Set SFUT_EXTENSION_DIR
 *   to load another folder, e.g. the repo root. SFUT_NO_EXTENSION=1 runs
 *   without the toolkit (for "with and without" checks).
 * - Profile: a fresh temporary directory, deleted on close, so no session
 *   cookie outlives the run.
 * - Login: the one-time URL from `sf org open --url-only`. It is never printed,
 *   logged or written to disk.
 */
const { chromium } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const ORG_ALIAS = process.env.SFUT_ORG_ALIAS || 'sfut-w27';
const SF_PROJECT_DIR = process.env.SFUT_SF_PROJECT_DIR || process.cwd();

function stageExtension() {
  if (process.env.SFUT_EXTENSION_DIR) return { dir: path.resolve(process.env.SFUT_EXTENSION_DIR), cleanup() {} };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sfut-ext-'));
  execFileSync(path.join(REPO_ROOT, 'scripts', 'package.sh'), ['chrome', '--out', tmp], { stdio: 'ignore' });
  const zip = fs.readdirSync(tmp).find((f) => f.endsWith('.zip'));
  const dir = path.join(tmp, 'unpacked');
  execFileSync('unzip', ['-q', path.join(tmp, zip), '-d', dir]);
  return { dir, cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

/** One-time login URL for a path in the org. Kept in memory only. */
function loginUrl(orgPath) {
  const out = execFileSync('sf', [
    'org', 'open', '--target-org', ORG_ALIAS, '--url-only', '--path', orgPath, '--json'
  ], { cwd: SF_PROJECT_DIR, stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out.toString()).result.url;
}

async function launch({ withExtension = process.env.SFUT_NO_EXTENSION !== '1', headless = process.env.SFUT_HEADED !== '1' } = {}) {
  const ext = withExtension ? stageExtension() : { dir: null, cleanup() {} };
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sfut-profile-'));
  const args = ['--no-first-run', '--no-default-browser-check'];
  if (ext.dir) args.push(`--disable-extensions-except=${ext.dir}`, `--load-extension=${ext.dir}`);
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', // the full Chromium build supports extensions, headed or headless
    headless,
    args,
    viewport: { width: 1600, height: 1000 }
  });
  const close = async () => {
    await context.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
    ext.cleanup();
  };
  return { context, close, extensionDir: ext.dir };
}

/** Removes login URLs, one-time tokens and session IDs from any text. */
function redact(text) {
  return String(text)
    .replace(/https?:\/\/\S*(?:frontdoor|secur\/)\S*/gi, '[login URL redacted]')
    .replace(/\b(otp|sid|oid|cshc|access_token)=[^&\s"']+/gi, '$1=[redacted]')
    .replace(/00D[A-Za-z0-9]{12,15}![A-Za-z0-9._]+/g, '[session redacted]');
}

/**
 * Logs in via the one-time URL and returns the Lightning origin.
 * Errors are rethrown with the login URL redacted: Playwright's own messages
 * include the URL it was navigating to.
 */
async function login(page, orgPath = '/lightning/setup/SetupOneHome/home') {
  try {
    await page.goto(loginUrl(orgPath), { waitUntil: 'commit', timeout: 120000 });
    // 'commit': Lightning pages can take minutes to fire 'load'; callers wait for their own landmarks.
    await page.waitForURL((u) => !/frontdoor|secur\//.test(u.toString()), { timeout: 120000, waitUntil: 'commit' });
  } catch (err) {
    throw new Error(`Login failed: ${redact(err.message).split('\n')[0]}`);
  }
  return new URL(page.url()).origin;
}

module.exports = { launch, login, redact, REPO_ROOT, ORG_ALIAS };
