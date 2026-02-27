import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { UpdateService, compareVersions } from '../src/services/update-service.js';

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'localnest-update-test-'));
}

test('compareVersions handles stable and prerelease ordering', () => {
  assert.equal(compareVersions('0.0.4', '0.0.3'), 1);
  assert.equal(compareVersions('0.0.3', '0.0.3'), 0);
  assert.equal(compareVersions('0.0.3-beta.1', '0.0.3'), -1);
  assert.equal(compareVersions('0.0.3-beta.2', '0.0.3-beta.1'), 1);
});

test('getStatus fetches npm live result and then serves cache while fresh', async () => {
  const home = makeTempHome();
  let calls = 0;
  const service = new UpdateService({
    localnestHome: home,
    packageName: 'localnest-mcp',
    currentVersion: '0.0.3',
    checkIntervalMinutes: 120,
    failureBackoffMinutes: 15,
    commandRunner: () => {
      calls += 1;
      return { status: 0, stdout: '"0.0.5"\n', stderr: '' };
    }
  });

  const live = await service.getStatus({ force: true });
  assert.equal(calls, 1);
  assert.equal(live.latest_version, '0.0.5');
  assert.equal(live.is_outdated, true);
  assert.equal(live.source, 'live');
  assert.ok(fs.existsSync(path.join(home, 'update-status.json')));

  const cached = await service.getStatus({ force: false });
  assert.equal(calls, 1);
  assert.equal(cached.source, 'cache');
});

test('getStatus falls back to cache on npm failure', async () => {
  const home = makeTempHome();
  const cachePath = path.join(home, 'update-status.json');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(cachePath, `${JSON.stringify({
    package_name: 'localnest-mcp',
    current_version: '0.0.3',
    latest_version: '0.0.4',
    is_outdated: true,
    last_checked_at: '2000-01-01T00:00:00.000Z',
    last_check_ok: true
  }, null, 2)}\n`, 'utf8');

  const service = new UpdateService({
    localnestHome: home,
    packageName: 'localnest-mcp',
    currentVersion: '0.0.3',
    checkIntervalMinutes: 120,
    failureBackoffMinutes: 15,
    commandRunner: () => ({ status: 1, stdout: '', stderr: 'network error' })
  });

  const out = await service.getStatus({ force: true });
  assert.equal(out.source, 'cache-fallback');
  assert.equal(out.is_outdated, true);
  assert.equal(out.last_check_ok, false);
  assert.match(out.error, /network error/);
});

test('selfUpdate requires explicit approval', async () => {
  const home = makeTempHome();
  const service = new UpdateService({
    localnestHome: home,
    packageName: 'localnest-mcp',
    currentVersion: '0.0.3',
    checkIntervalMinutes: 120,
    failureBackoffMinutes: 15,
    commandRunner: () => ({ status: 0, stdout: '', stderr: '' })
  });

  const out = await service.selfUpdate({ approvedByUser: false });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'approval_required');
});

test('selfUpdate runs install and skill sync when approved', async () => {
  const home = makeTempHome();
  const calls = [];
  const service = new UpdateService({
    localnestHome: home,
    packageName: 'localnest-mcp',
    currentVersion: '0.0.3',
    checkIntervalMinutes: 120,
    failureBackoffMinutes: 15,
    commandRunner: (command, args) => {
      calls.push([command, ...args].join(' '));
      if (args[0] === 'view') return { status: 0, stdout: '"0.0.6"\n', stderr: '' };
      return { status: 0, stdout: 'ok', stderr: '' };
    }
  });

  const out = await service.selfUpdate({
    approvedByUser: true,
    version: 'latest',
    reinstallSkill: true
  });

  assert.equal(out.ok, true);
  assert.equal(out.restart_required, true);
  assert.ok(calls.some((line) => line.includes('install -g localnest-mcp@latest')));
  assert.ok(calls.some((line) => line.includes('localnest-mcp-install-skill')));
});

test('selfUpdate dry-run does not execute commands', async () => {
  const home = makeTempHome();
  let called = false;
  const service = new UpdateService({
    localnestHome: home,
    packageName: 'localnest-mcp',
    currentVersion: '0.0.3',
    checkIntervalMinutes: 120,
    failureBackoffMinutes: 15,
    commandRunner: () => {
      called = true;
      return { status: 0, stdout: '', stderr: '' };
    }
  });

  const out = await service.selfUpdate({
    approvedByUser: true,
    dryRun: true
  });

  assert.equal(out.ok, true);
  assert.equal(out.dry_run, true);
  assert.equal(called, false);
  assert.ok(Array.isArray(out.planned_commands));
  assert.ok(out.planned_commands.length >= 1);
});

test('selfUpdate reports npm install failure and stops before skill sync', async () => {
  const home = makeTempHome();
  const calls = [];
  const service = new UpdateService({
    localnestHome: home,
    packageName: 'localnest-mcp',
    currentVersion: '0.0.3',
    checkIntervalMinutes: 120,
    failureBackoffMinutes: 15,
    commandRunner: (command, args) => {
      calls.push([command, ...args].join(' '));
      return { status: 1, stdout: '', stderr: 'permission denied' };
    }
  });

  const out = await service.selfUpdate({
    approvedByUser: true,
    version: 'latest',
    reinstallSkill: true
  });

  assert.equal(out.ok, false);
  assert.equal(out.step, 'npm_install');
  assert.equal(calls.length, 1);
  assert.match(out.install.stderr, /permission denied/);
});

test('selfUpdate reports skill sync failure after successful install', async () => {
  const home = makeTempHome();
  const calls = [];
  const service = new UpdateService({
    localnestHome: home,
    packageName: 'localnest-mcp',
    currentVersion: '0.0.3',
    checkIntervalMinutes: 120,
    failureBackoffMinutes: 15,
    commandRunner: (command, args) => {
      const line = [command, ...args].join(' ');
      calls.push(line);
      if (args[0] === 'install') {
        return { status: 0, stdout: 'installed', stderr: '' };
      }
      if (String(command).includes('localnest-mcp-install-skill')) {
        return { status: 1, stdout: '', stderr: 'sync failed' };
      }
      return { status: 0, stdout: '"0.0.3"\n', stderr: '' };
    }
  });

  const out = await service.selfUpdate({
    approvedByUser: true,
    version: 'latest',
    reinstallSkill: true
  });

  assert.equal(out.ok, false);
  assert.equal(out.step, 'skill_sync');
  assert.equal(calls.length, 2);
  assert.match(out.skill_sync.stderr, /sync failed/);
});
