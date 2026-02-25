#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

if (!process.env.DART_SUPPRESS_ANALYTICS) {
  process.env.DART_SUPPRESS_ANALYTICS = 'true';
}

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function commandExists(cmd, args = ['--version']) {
  try {
    const result = spawnSync(cmd, args, { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}

function getNpxCommand() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function resolveConfigPath() {
  if (process.env.LOCALNEST_CONFIG) {
    return path.resolve(process.env.LOCALNEST_CONFIG);
  }
  const home = path.resolve(process.env.LOCALNEST_HOME || path.join(os.homedir(), '.localnest'));
  return path.join(home, 'localnest.config.json');
}

function resolveIndexBackend() {
  const byEnv = (process.env.LOCALNEST_INDEX_BACKEND || '').trim();
  if (byEnv) return byEnv;

  const cfgPath = resolveConfigPath();
  try {
    if (!fs.existsSync(cfgPath)) return 'sqlite-vec';
    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    return parsed?.index?.backend || 'sqlite-vec';
  } catch {
    return 'sqlite-vec';
  }
}

function checkNodeVersion() {
  const major = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
  if (Number.isFinite(major) && major >= 18) {
    return { id: 'node_version', ok: true, detail: `Node.js ${process.versions.node}` };
  }
  return {
    id: 'node_version',
    ok: false,
    detail: `Node.js >=18 required. Current: ${process.versions.node}`,
    fix: 'Install Node.js 18+ and re-run doctor.'
  };
}

function checkNpmNpx() {
  const npmOk = commandExists('npm', ['--version']);
  const npxCmd = getNpxCommand();
  const npxOk = commandExists(npxCmd, ['--version']);

  if (npmOk && npxOk) {
    return { id: 'npm_npx', ok: true, detail: `npm and ${npxCmd} available` };
  }

  return {
    id: 'npm_npx',
    ok: false,
    detail: `Missing npm or ${npxCmd}`,
    fix: 'Install/reinstall Node.js with npm, then re-run doctor.'
  };
}

function checkRipgrep() {
  const ok = commandExists('rg');
  if (ok) {
    return { id: 'ripgrep', ok: true, detail: 'ripgrep available' };
  }

  let fix = 'Install ripgrep (rg) and re-run doctor.';
  if (process.platform === 'win32') {
    fix = 'Install ripgrep: winget install BurntSushi.ripgrep.MSVC';
  } else if (process.platform === 'darwin') {
    fix = 'Install ripgrep: brew install ripgrep';
  } else {
    fix = 'Install ripgrep: sudo apt-get install ripgrep';
  }

  return { id: 'ripgrep', ok: false, detail: 'ripgrep (rg) missing', fix };
}

async function checkSdkImport() {
  try {
    await import('@modelcontextprotocol/sdk/server/mcp.js');
    await import('@modelcontextprotocol/sdk/server/stdio.js');
    return { id: 'sdk_import', ok: true, detail: 'MCP SDK imports resolved' };
  } catch (error) {
    return {
      id: 'sdk_import',
      ok: false,
      detail: `MCP SDK import failed: ${error?.code || error?.message || 'unknown error'}`,
      fix: 'If running from source, run npm install. If using npx package, reinstall and retry.'
    };
  }
}

async function checkSqliteBackend() {
  if (resolveIndexBackend() !== 'sqlite-vec') {
    return { id: 'sqlite_backend', ok: true, detail: 'sqlite-vec backend not selected' };
  }

  try {
    await import('node:sqlite');
    return { id: 'sqlite_backend', ok: true, detail: 'node:sqlite available for sqlite-vec backend' };
  } catch {
    return {
      id: 'sqlite_backend',
      ok: false,
      detail: 'node:sqlite unavailable for sqlite-vec backend',
      fix: 'Use Node.js 22+ or switch backend to json in setup.'
    };
  }
}

function checkConfigFile() {
  const configPath = resolveConfigPath();
  if (!fs.existsSync(configPath)) {
    return {
      id: 'config_file',
      ok: false,
      detail: `Config not found: ${configPath}`,
      fix: 'Run localnest-mcp-setup to create config.'
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return {
      id: 'config_file',
      ok: false,
      detail: `Invalid JSON config: ${configPath}`,
      fix: 'Fix JSON syntax in localnest.config.json.'
    };
  }

  if (!parsed || !Array.isArray(parsed.roots) || parsed.roots.length === 0) {
    return {
      id: 'config_file',
      ok: false,
      detail: 'Config has no roots[]',
      fix: 'Add at least one valid root path in localnest.config.json.'
    };
  }

  const missing = [];
  for (const root of parsed.roots) {
    if (!root || typeof root.path !== 'string') {
      missing.push('<invalid-root-entry>');
      continue;
    }
    const resolved = path.resolve(root.path);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      missing.push(resolved);
    }
  }

  if (missing.length > 0) {
    return {
      id: 'config_file',
      ok: false,
      detail: `Some configured roots are missing: ${missing.join(', ')}`,
      fix: 'Update localnest.config.json with existing directories.'
    };
  }

  return {
    id: 'config_file',
    ok: true,
    detail: `Config OK (${configPath}) with ${parsed.roots.length} root(s)`
  };
}

function printText(results) {
  console.log('LocalNest Doctor');
  console.log('');

  for (const r of results) {
    const mark = r.ok ? 'OK' : 'FAIL';
    console.log(`[${mark}] ${r.id}: ${r.detail}`);
    if (!r.ok && r.fix) {
      console.log(`  fix: ${r.fix}`);
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log('');
  if (failed === 0) {
    console.log('Doctor result: healthy');
  } else {
    console.log(`Doctor result: ${failed} issue(s) found`);
  }
}

async function main() {
  const checks = [
    checkNodeVersion(),
    checkNpmNpx(),
    checkRipgrep(),
    await checkSdkImport(),
    await checkSqliteBackend(),
    checkConfigFile()
  ];

  if (asJson) {
    console.log(JSON.stringify({ ok: checks.every((c) => c.ok), checks }, null, 2));
  } else {
    printText(checks);
  }

  const strict = parseBoolean(process.env.LOCALNEST_DOCTOR_STRICT, true);
  if (strict && checks.some((c) => !c.ok)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[localnest-doctor] fatal:', error?.message || error);
  process.exit(1);
});
