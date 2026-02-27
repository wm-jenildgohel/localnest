import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function parseIsoTime(value) {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function parseVersion(version) {
  const raw = String(version || '').trim().replace(/^v/i, '');
  const [coreRaw, prereleaseRaw = ''] = raw.split('-', 2);
  const core = coreRaw.split('.').map((part) => Number.parseInt(part, 10));
  if (core.some((n) => !Number.isFinite(n))) return null;
  const prerelease = prereleaseRaw
    ? prereleaseRaw.split('.').map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) ? n : part;
    })
    : [];
  return { raw, core, prerelease };
}

export function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return 0;

  const max = Math.max(va.core.length, vb.core.length);
  for (let i = 0; i < max; i += 1) {
    const da = va.core[i] || 0;
    const db = vb.core[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }

  if (va.prerelease.length === 0 && vb.prerelease.length > 0) return 1;
  if (va.prerelease.length > 0 && vb.prerelease.length === 0) return -1;
  const maxPre = Math.max(va.prerelease.length, vb.prerelease.length);
  for (let i = 0; i < maxPre; i += 1) {
    const pa = va.prerelease[i];
    const pb = vb.prerelease[i];
    if (pa === undefined && pb !== undefined) return -1;
    if (pa !== undefined && pb === undefined) return 1;
    if (typeof pa === 'number' && typeof pb === 'number') {
      if (pa > pb) return 1;
      if (pa < pb) return -1;
      continue;
    }
    if (typeof pa === 'number' && typeof pb !== 'number') return -1;
    if (typeof pa !== 'number' && typeof pb === 'number') return 1;
    const sa = String(pa);
    const sb = String(pb);
    if (sa > sb) return 1;
    if (sa < sb) return -1;
  }

  return 0;
}

function defaultRunner(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeoutMs || 12000,
    maxBuffer: 4 * 1024 * 1024
  });
}

function parseLatestVersion(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'string') return parsed.trim();
    if (Array.isArray(parsed) && parsed.length > 0) {
      const last = parsed[parsed.length - 1];
      if (typeof last === 'string') return last.trim();
    }
  } catch {
    // npm may return a plain string in some environments.
  }
  return text.replace(/^"|"$/g, '').trim() || null;
}

function buildInstallCommand(packageName, version) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return {
    command: npmCmd,
    args: ['install', '-g', `${packageName}@${version || 'latest'}`]
  };
}

function buildSkillSyncCommand() {
  const binary = process.platform === 'win32' ? 'localnest-mcp-install-skill.cmd' : 'localnest-mcp-install-skill';
  return { command: binary, args: ['--force'] };
}

export class UpdateService {
  constructor({
    localnestHome,
    packageName,
    currentVersion,
    checkIntervalMinutes,
    failureBackoffMinutes,
    commandRunner = defaultRunner
  }) {
    this.localnestHome = localnestHome;
    this.packageName = packageName;
    this.currentVersion = currentVersion;
    this.checkIntervalMinutes = checkIntervalMinutes;
    this.failureBackoffMinutes = failureBackoffMinutes;
    this.commandRunner = commandRunner;
    this.cachePath = path.join(localnestHome, 'update-status.json');
  }

  readCache() {
    try {
      if (!fs.existsSync(this.cachePath)) return null;
      const parsed = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  writeCache(data) {
    fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
    fs.writeFileSync(this.cachePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }

  shouldRefresh(cache, now, force) {
    if (force) return true;
    if (!cache?.last_checked_at) return true;
    const ageMs = now - parseIsoTime(cache.last_checked_at);
    const backoffMinutes = cache.last_check_ok ? this.checkIntervalMinutes : this.failureBackoffMinutes;
    return ageMs >= backoffMinutes * 60 * 1000;
  }

  checkLatestFromNpm() {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const run = this.commandRunner(npmCmd, ['view', this.packageName, 'version', '--json'], {
      timeoutMs: 12000
    });
    if (run?.error) {
      throw new Error(`npm view failed: ${run.error.message || run.error}`);
    }
    if (run?.status !== 0) {
      const stderr = String(run?.stderr || '').trim();
      throw new Error(`npm view exited with code ${run.status}${stderr ? `: ${stderr}` : ''}`);
    }
    const latest = parseLatestVersion(run?.stdout);
    if (!latest) {
      throw new Error('Unable to parse npm latest version response');
    }
    return latest;
  }

  async getStatus({ force = false } = {}) {
    const now = Date.now();
    const cache = this.readCache();

    if (!this.shouldRefresh(cache, now, force) && cache) {
      return {
        ...cache,
        stale: false,
        source: 'cache'
      };
    }

    try {
      const latestVersion = this.checkLatestFromNpm();
      const isOutdated = compareVersions(latestVersion, this.currentVersion) > 0;
      const refreshed = {
        package_name: this.packageName,
        current_version: this.currentVersion,
        latest_version: latestVersion,
        is_outdated: isOutdated,
        checked_via: 'npm view',
        source: 'live',
        last_checked_at: new Date(now).toISOString(),
        last_check_ok: true,
        error: null,
        recommend_update_prompt: isOutdated,
        next_check_after_minutes: this.checkIntervalMinutes,
        cache_path: this.cachePath
      };
      this.writeCache(refreshed);
      return refreshed;
    } catch (error) {
      const fallbackLatest = cache?.latest_version || this.currentVersion;
      const isOutdated = compareVersions(fallbackLatest, this.currentVersion) > 0;
      const failed = {
        package_name: this.packageName,
        current_version: this.currentVersion,
        latest_version: fallbackLatest,
        is_outdated: isOutdated,
        checked_via: 'npm view',
        source: cache ? 'cache-fallback' : 'error',
        last_checked_at: new Date(now).toISOString(),
        last_check_ok: false,
        error: String(error?.message || error),
        recommend_update_prompt: isOutdated,
        next_check_after_minutes: this.failureBackoffMinutes,
        cache_path: this.cachePath
      };
      this.writeCache(failed);
      return failed;
    }
  }

  async warmCheck() {
    await this.getStatus({ force: false });
  }

  runCommand(command, args) {
    const run = this.commandRunner(command, args, { timeoutMs: 180000 });
    return {
      command: [command, ...args].join(' '),
      ok: run && run.status === 0 && !run.error,
      status: run?.status ?? null,
      stdout: String(run?.stdout || '').trim(),
      stderr: String(run?.stderr || '').trim(),
      error: run?.error ? String(run.error.message || run.error) : null
    };
  }

  async selfUpdate({ approvedByUser = false, dryRun = false, version = 'latest', reinstallSkill = true } = {}) {
    if (!approvedByUser) {
      return {
        ok: false,
        skipped: true,
        reason: 'approval_required',
        message: 'User approval is required. Ask: "LocalNest has a newer version. Update now?"'
      };
    }

    const installStep = buildInstallCommand(this.packageName, version);
    const skillStep = buildSkillSyncCommand();
    const planned = [
      [installStep.command, ...installStep.args].join(' '),
      reinstallSkill ? [skillStep.command, ...skillStep.args].join(' ') : null
    ].filter(Boolean);

    if (dryRun) {
      return {
        ok: true,
        skipped: true,
        dry_run: true,
        planned_commands: planned,
        restart_required: true
      };
    }

    const installResult = this.runCommand(installStep.command, installStep.args);
    if (!installResult.ok) {
      return {
        ok: false,
        step: 'npm_install',
        restart_required: false,
        planned_commands: planned,
        install: installResult
      };
    }

    let skillResult = null;
    if (reinstallSkill) {
      skillResult = this.runCommand(skillStep.command, skillStep.args);
      if (!skillResult.ok) {
        return {
          ok: false,
          step: 'skill_sync',
          restart_required: false,
          planned_commands: planned,
          install: installResult,
          skill_sync: skillResult
        };
      }
    }

    const status = await this.getStatus({ force: true });
    return {
      ok: true,
      step: 'completed',
      restart_required: true,
      planned_commands: planned,
      install: installResult,
      skill_sync: skillResult,
      update_status: status
    };
  }
}

