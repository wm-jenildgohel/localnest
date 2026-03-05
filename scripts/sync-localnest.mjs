#!/usr/bin/env node

import readline from 'node:readline/promises';
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

function parseArg(name) {
  const prefix = `--${name}=`;
  const hit = argv.find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : null;
}

function hasFlag(name) {
  return argv.includes(`--${name}`);
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

async function requestDeviceCode({ clientId, scope }) {
  const body = new URLSearchParams();
  body.set('client_id', clientId);
  body.set('scope', scope);
  const response = await fetch('https://oauth2.googleapis.com/device/code', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) {
    throw new Error(`Device auth start failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollDeviceToken({ clientId, clientSecret, deviceCode, intervalSec, expiresInSec }) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < expiresInSec * 1000) {
    const body = new URLSearchParams();
    body.set('client_id', clientId);
    if (clientSecret) {
      body.set('client_secret', clientSecret);
    }
    body.set('device_code', deviceCode);
    body.set('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    });
    const payload = await response.json();
    if (response.ok && payload.refresh_token) {
      return payload;
    }
    if (payload.error === 'authorization_pending') {
      await sleep(intervalSec * 1000);
      continue;
    }
    if (payload.error === 'slow_down') {
      await sleep((intervalSec + 2) * 1000);
      continue;
    }
    if (payload.error === 'access_denied') {
      throw new Error('Authorization denied by user.');
    }
    if (payload.error) {
      throw new Error(`Device auth failed: ${payload.error}`);
    }
    await sleep(intervalSec * 1000);
  }
  throw new Error('Device authorization timed out.');
}

function printHelp() {
  process.stdout.write('LocalNest sync\n\n');
  process.stdout.write('Usage:\n');
  process.stdout.write('  localnest sync init\n');
  process.stdout.write('  localnest sync push [--passphrase=...]\n');
  process.stdout.write('  localnest sync pull [--passphrase=...]\n');
  process.stdout.write('  localnest sync status\n\n');
  process.stdout.write('Options:\n');
  process.stdout.write('  --client-id=<oauth-client-id>      for sync init\n');
  process.stdout.write('  --client-secret=<oauth-secret>     optional for sync init\n');
  process.stdout.write('  --passphrase=<value>               optional fallback for legacy passphrase configs\n');
  process.stdout.write('  --yes                              non-interactive where possible\n');
  process.stdout.write('\n');
  process.stdout.write('Notes:\n');
  process.stdout.write('  - Sync stores encrypted snapshot of ~/.localnest/config and ~/.localnest/data.\n');
  process.stdout.write('  - Google Drive appDataFolder is used by default.\n');
  process.stdout.write('  - New setups generate and store a local encryption key automatically.\n');
}

async function resolvePassphrase() {
  const fromArg = parseArg('passphrase');
  if (fromArg) return fromArg;
  if (process.env.LOCALNEST_SYNC_PASSPHRASE) {
    return process.env.LOCALNEST_SYNC_PASSPHRASE;
  }
  return ask('Encryption passphrase: ');
}

async function runInit() {
  const clientId = await resolveGoogleClientId();
  const clientSecret = parseArg('client-secret') || await ask('Google OAuth client secret (optional): ');

  const device = await requestDeviceCode({
    clientId,
    scope: 'https://www.googleapis.com/auth/drive.appdata'
  });

  process.stdout.write('\nComplete Google auth:\n');
  process.stdout.write(`1) Open: ${device.verification_url || device.verification_uri}\n`);
  process.stdout.write(`2) Enter code: ${device.user_code}\n`);
  process.stdout.write('Waiting for authorization...\n\n');

  const token = await pollDeviceToken({
    clientId,
    clientSecret,
    deviceCode: device.device_code,
    intervalSec: Number.parseInt(String(device.interval || '5'), 10) || 5,
    expiresInSec: Number.parseInt(String(device.expires_in || '900'), 10) || 900
  });

  const config = SyncService.createGoogleDriveConfig({
    clientId,
    clientSecret: clientSecret || null,
    refreshToken: token.refresh_token
  });
  syncService.writeSyncConfig(config);
  syncService.writeSyncStatus({
    initializedAt: new Date().toISOString(),
    provider: 'google-drive'
  });

  process.stdout.write(`Sync initialized at ${syncService.syncConfigPath}\n`);
  process.stdout.write('You can now run: localnest sync push\n');
}

async function runPush() {
  const passphrase = await resolvePassphrase();
  if (!passphrase) {
    throw new Error('passphrase is required.');
  }
  const result = await syncService.pushToGoogleDrive({ passphrase });
  process.stdout.write(`Push complete: ${result.bundleName}\n`);
  process.stdout.write(`Remote file id: ${result.remoteFileId}\n`);
  process.stdout.write(`Size: ${result.sizeBytes} bytes\n`);
}

async function runPull() {
  const passphrase = await resolvePassphrase();
  if (!passphrase) {
    throw new Error('passphrase is required.');
  }
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
  if (cmd === 'help' || hasFlag('help') || hasFlag('h')) {
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
