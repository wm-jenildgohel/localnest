#!/usr/bin/env node

import crypto from 'node:crypto';
import http from 'node:http';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';
import { resolveLocalnestHome, migrateLocalnestHomeLayout } from '../src/home-layout.js';
import { SyncService } from '../src/services/sync-service.js';

if (!process.env.DART_SUPPRESS_ANALYTICS) {
  process.env.DART_SUPPRESS_ANALYTICS = 'true';
}

const argv = process.argv.slice(2);
const localnestHome = resolveLocalnestHome(process.env);
migrateLocalnestHomeLayout(localnestHome);
const syncService = new SyncService({ localnestHome });
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

function parseArg(name) {
  const prefix = `--${name}=`;
  const hit = argv.find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : null;
}

function hasFlag(name) {
  return argv.includes(`--${name}`);
}

function hasShortFlag(name) {
  return argv.includes(`-${name}`);
}

function commandName() {
  for (const arg of argv) {
    if (!arg.startsWith('-')) return arg;
  }
  return 'help';
}

async function ask(question) {
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } catch (error) {
    throw new Error(`Input interrupted while waiting for: ${question.trim()}`);
  } finally {
    rl.close();
  }
}

function isLikelyGoogleClientId(value) {
  if (!value) return false;
  if (value.includes(' ')) return false;
  return value.endsWith('.apps.googleusercontent.com');
}

async function resolveGoogleClientId() {
  const fromArg = parseArg('client-id');
  if (fromArg) {
    if (!isLikelyGoogleClientId(fromArg)) {
      throw new Error(
        'Invalid --client-id format. Expected a Google OAuth client id ending with ".apps.googleusercontent.com".'
      );
    }
    return fromArg;
  }

  const fromEnv = process.env.LOCALNEST_SYNC_GOOGLE_CLIENT_ID;
  if (fromEnv) {
    if (!isLikelyGoogleClientId(fromEnv)) {
      throw new Error(
        'Invalid LOCALNEST_SYNC_GOOGLE_CLIENT_ID format. Expected value ending with ".apps.googleusercontent.com".'
      );
    }
    return fromEnv;
  }

  process.stdout.write('Google OAuth client ID is required.\n');
  process.stdout.write('Example: 1234567890-abcdefg.apps.googleusercontent.com\n');
  process.stdout.write('Press Ctrl+C to cancel.\n\n');

  while (true) {
    const value = await ask('Google OAuth client ID: ');
    if (!value) {
      process.stdout.write('Client ID cannot be empty.\n');
      continue;
    }
    if (!isLikelyGoogleClientId(value)) {
      process.stdout.write('Invalid format. Expected value ending with ".apps.googleusercontent.com".\n');
      continue;
    }
    return value;
  }
}

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildCodeVerifier() {
  return toBase64Url(crypto.randomBytes(64));
}

function buildCodeChallenge(codeVerifier) {
  return toBase64Url(crypto.createHash('sha256').update(codeVerifier).digest());
}

function maybeOpenBrowser(url) {
  if (hasFlag('no-browser')) return false;

  const attempts = process.platform === 'darwin'
    ? [['open', [url]]]
    : process.platform === 'win32'
      ? [['cmd', ['/c', 'start', '', url]]]
      : [['xdg-open', [url]]];

  for (const [command, args] of attempts) {
    const run = spawnSync(command, args, { stdio: 'ignore' });
    if (run.status === 0 && !run.error) {
      return true;
    }
  }

  return false;
}

async function startPkceCallbackServer({ timeoutMs = 300000 } = {}) {
  let settled = false;
  let timeout = null;
  let resolveCode;
  let rejectCode;
  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = http.createServer((req, res) => {
    const host = req.headers.host || '127.0.0.1';
    const reqUrl = new URL(req.url || '/', `http://${host}`);
    if (reqUrl.pathname !== '/oauth2callback') {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    const done = (error, code) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (error) {
        rejectCode(error);
      } else {
        resolveCode(code);
      }
      setImmediate(() => {
        server.close();
      });
    };

    const authError = reqUrl.searchParams.get('error');
    if (authError) {
      res.statusCode = 400;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end('<h2>Authorization failed.</h2><p>You can return to the terminal.</p>');
      done(new Error(`Authorization failed: ${authError}`));
      return;
    }

    const code = reqUrl.searchParams.get('code');
    if (!code) {
      res.statusCode = 400;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end('<h2>Missing authorization code.</h2><p>You can return to the terminal.</p>');
      done(new Error('Google callback did not include authorization code.'));
      return;
    }

    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<h2>Authorization received.</h2><p>You can close this tab and return to LocalNest CLI.</p>');
    done(null, code);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Unable to bind OAuth callback listener.');
  }

  timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    rejectCode(new Error('OAuth authorization timed out. Retry and complete browser approval sooner.'));
    setImmediate(() => {
      server.close();
    });
  }, timeoutMs);

  return {
    redirectUri: `http://127.0.0.1:${address.port}/oauth2callback`,
    codePromise
  };
}

async function exchangeAuthorizationCode({
  clientId,
  clientSecret,
  code,
  redirectUri,
  codeVerifier
}) {
  const body = new URLSearchParams();
  body.set('client_id', clientId);
  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }
  body.set('code', code);
  body.set('code_verifier', codeVerifier);
  body.set('grant_type', 'authorization_code');
  body.set('redirect_uri', redirectUri);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });

  let payload = null;
  let text = '';
  try {
    text = await response.text();
    payload = JSON.parse(text);
  } catch {
    // Keep fallback text.
  }

  if (!response.ok) {
    const description = payload?.error_description || payload?.error || text || `HTTP ${response.status}`;
    throw new Error(`OAuth token exchange failed (${response.status}): ${description}`);
  }

  if (!payload?.refresh_token) {
    throw new Error(
      [
        'Google did not return a refresh token.',
        'Retry and ensure you approve consent fully.',
        'If this persists, revoke previous app consent in your Google account and run init again.'
      ].join('\n')
    );
  }

  return payload;
}

async function runPkceAuthorization({ clientId, clientSecret, scope }) {
  const codeVerifier = buildCodeVerifier();
  const codeChallenge = buildCodeChallenge(codeVerifier);
  const callback = await startPkceCallbackServer();

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', callback.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  const opened = maybeOpenBrowser(authUrl.toString());
  process.stdout.write('\nComplete Google auth:\n');
  if (opened) {
    process.stdout.write('1) Browser opened automatically.\n');
  } else {
    process.stdout.write('1) Open this URL in your browser:\n');
    process.stdout.write(`${authUrl.toString()}\n`);
  }
  process.stdout.write('2) Approve access.\n');
  process.stdout.write('3) Wait for "Authorization received" page.\n\n');

  const code = await callback.codePromise;
  const token = await exchangeAuthorizationCode({
    clientId,
    clientSecret,
    code,
    redirectUri: callback.redirectUri,
    codeVerifier
  });
  return token;
}

function printHelp() {
  process.stdout.write('LocalNest sync\n\n');
  process.stdout.write('Usage:\n');
  process.stdout.write('  localnest sync init\n');
  process.stdout.write('  localnest sync push [--passphrase=...]\n');
  process.stdout.write('  localnest sync pull [--passphrase=...]\n');
  process.stdout.write('  localnest sync status\n\n');
  process.stdout.write('Examples:\n');
  process.stdout.write('  localnest sync init --client-id="123...apps.googleusercontent.com"\n');
  process.stdout.write('  localnest sync push\n');
  process.stdout.write('  localnest sync pull\n');
  process.stdout.write('  localnest sync status\n\n');
  process.stdout.write('Options:\n');
  process.stdout.write('  --client-id=<oauth-client-id>      for sync init\n');
  process.stdout.write('  --client-secret=<oauth-secret>     optional for sync init\n');
  process.stdout.write('  --no-browser                       print auth URL instead of auto-opening browser\n');
  process.stdout.write('  --passphrase=<value>               optional for legacy passphrase configs\n');
  process.stdout.write('  --ask-passphrase                   prompt for passphrase (legacy configs)\n');
  process.stdout.write('  --yes                              non-interactive where possible\n');
  process.stdout.write('\n');
  process.stdout.write('Notes:\n');
  process.stdout.write('  - Sync stores encrypted snapshot of ~/.localnest/config and ~/.localnest/data.\n');
  process.stdout.write('  - Google Drive appDataFolder is used by default.\n');
  process.stdout.write('  - Init uses Desktop OAuth (PKCE) via local loopback callback.\n');
  process.stdout.write('  - New setups generate and store a local encryption key automatically.\n');
}

function resolvePassphraseFromArgsOrEnv() {
  const fromArg = parseArg('passphrase');
  if (fromArg) return fromArg;
  if (process.env.LOCALNEST_SYNC_PASSPHRASE) {
    return process.env.LOCALNEST_SYNC_PASSPHRASE;
  }
  return null;
}

async function resolveOptionalPassphrase() {
  const value = resolvePassphraseFromArgsOrEnv();
  if (value) return value;
  if (hasFlag('ask-passphrase')) {
    return ask('Encryption passphrase: ');
  }
  return null;
}

async function runInit() {
  const clientId = await resolveGoogleClientId();
  const clientSecretArg = parseArg('client-secret');
  const clientSecret = clientSecretArg !== null
    ? clientSecretArg
    : (hasFlag('yes') ? '' : await ask('Google OAuth client secret (optional): '));
  const token = await runPkceAuthorization({
    clientId,
    clientSecret,
    scope: GOOGLE_DRIVE_SCOPE
  });

  const config = SyncService.createGoogleDriveConfig({
    clientId,
    clientSecret: clientSecret || null,
    refreshToken: token.refresh_token
  });
  config.google.scope = GOOGLE_DRIVE_SCOPE;
  syncService.writeSyncConfig(config);
  syncService.writeSyncStatus({
    initializedAt: new Date().toISOString(),
    provider: 'google-drive'
  });

  process.stdout.write(`Sync initialized at ${syncService.syncConfigPath}\n`);
  process.stdout.write('You can now run: localnest sync push\n');
}

async function runPush() {
  if (!syncService.isInitialized()) {
    throw new Error('Sync is not initialized. Run: localnest sync init');
  }
  const passphrase = await resolveOptionalPassphrase();
  const result = await syncService.pushToGoogleDrive({ passphrase });
  process.stdout.write(`Push complete: ${result.bundleName}\n`);
  process.stdout.write(`Remote file id: ${result.remoteFileId}\n`);
  process.stdout.write(`Size: ${result.sizeBytes} bytes\n`);
}

async function runPull() {
  if (!syncService.isInitialized()) {
    throw new Error('Sync is not initialized. Run: localnest sync init');
  }
  const passphrase = await resolveOptionalPassphrase();
  const result = await syncService.pullFromGoogleDrive({ passphrase });
  process.stdout.write(`Pull complete: ${result.name}\n`);
  process.stdout.write(`Remote file id: ${result.fileId}\n`);
  process.stdout.write(`Size: ${result.sizeBytes} bytes\n`);
}

async function runStatus() {
  const local = syncService.readSyncStatus();
  let remote = null;
  try {
    remote = await syncService.getRemoteStatus();
  } catch (error) {
    remote = { error: String(error?.message || error) };
  }
  process.stdout.write(`${JSON.stringify({ local, remote }, null, 2)}\n`);
}

async function main() {
  const cmd = commandName();
  if (cmd === 'help' || hasFlag('help') || hasShortFlag('h')) {
    printHelp();
    return;
  }
  if (cmd === 'init') {
    await runInit();
    return;
  }
  if (cmd === 'push') {
    await runPush();
    return;
  }
  if (cmd === 'pull') {
    await runPull();
    return;
  }
  if (cmd === 'status') {
    await runStatus();
    return;
  }
  printHelp();
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`[localnest-sync] fatal: ${error?.message || error}\n`);
  process.exit(1);
});
