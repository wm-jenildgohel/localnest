#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stdin as input, stdout as output } from 'node:process';
import { migrateLocalnestHomeLayout, resolveLocalnestHome } from '../src/home-layout.js';
import {
  findMissingRequiredSetupFields,
  normalizeUpgradeConfig
} from '../src/services/update/upgrade-assistant.js';

if (!process.env.DART_SUPPRESS_ANALYTICS) {
  process.env.DART_SUPPRESS_ANALYTICS = 'true';
}

const argv = process.argv.slice(2);
const localnestHome = resolveLocalnestHome(process.env);
const layout = migrateLocalnestHomeLayout(localnestHome).paths;
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

function parseArg(name) {
  const key = `--${name}=`;
  const found = argv.find((item) => item.startsWith(key));
  if (!found) return null;
  return found.slice(key.length).trim();
}

function hasFlag(name) {
  return argv.includes(`--${name}`);
}

function hasShortFlag(flag) {
  return argv.includes(`-${flag}`);
}

function getPositionalArgs() {
  return argv.filter((item) => !item.startsWith('-'));
}

function resolveTargetVersion() {
  const fromFlag = parseArg('version');
  if (fromFlag) return fromFlag;

  const positional = getPositionalArgs();
  if (positional.length === 0) return 'latest';

  if (positional[0] === 'install') {
    return positional[1] || 'latest';
  }

  return positional[0];
}

function parseBoolean(raw, fallback) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const value = String(raw).trim().toLowerCase();
  if (value === 'true' || value === '1' || value === 'yes' || value === 'y') return true;
  if (value === 'false' || value === '0' || value === 'no' || value === 'n') return false;
  return fallback;
}

function readExistingConfig() {
  try {
    if (!fs.existsSync(layout.configPath)) return {};
    const parsed = JSON.parse(fs.readFileSync(layout.configPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function runCommand(command, args, label) {
  process.stdout.write(`[upgrade] ${label}: ${[command, ...args].join(' ')}\n`);
  const run = spawnSync(command, args, { stdio: 'inherit' });
  if (run.error) {
    throw new Error(`${label} failed: ${run.error.message || run.error}`);
  }
  if (run.status !== 0) {
    throw new Error(`${label} failed with exit code ${run.status}`);
  }
}

function runCommandCapture(command, args, label) {
  const run = spawnSync(command, args, { encoding: 'utf8' });
  return {
    ok: run.status === 0 && !run.error,
    status: run.status,
    stdout: String(run.stdout || '').trim(),
    stderr: run.error
      ? `${label} failed: ${run.error.message || run.error}`
      : String(run.stderr || '').trim()
  };
}

function parseVersionsJson(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => String(entry || '').trim()).filter(Boolean);
    }
    if (typeof parsed === 'string') return [parsed.trim()].filter(Boolean);
    return [];
  } catch {
    return raw.split('\n').map((entry) => entry.trim()).filter(Boolean);
  }
}

function printUpgradeError({ title, detailLines = [], suggestionLines = [] }) {
  process.stderr.write('\n[localnest-upgrade] ERROR\n');
  process.stderr.write(`${title}\n`);
  if (detailLines.length > 0) {
    process.stderr.write('\nDetails:\n');
    for (const line of detailLines) {
      process.stderr.write(`- ${line}\n`);
    }
  }
  if (suggestionLines.length > 0) {
    process.stderr.write('\nTry:\n');
    for (const line of suggestionLines) {
      process.stderr.write(`- ${line}\n`);
    }
  }
  process.stderr.write('\n');
}

function ensureVersionExists({ npmCmd, packageName, targetVersion }) {
  if (!targetVersion || targetVersion === 'latest') return;

  const query = runCommandCapture(npmCmd, ['view', packageName, 'versions', '--json'], 'fetch published versions');
  if (!query.ok) {
    printUpgradeError({
      title: `Unable to verify published versions for ${packageName}.`,
      detailLines: [query.stderr || `npm exited with code ${query.status}`],
      suggestionLines: [
        'Check internet/npm access and retry.',
        'Run localnest upgrade latest',
        `Run npm view ${packageName} versions --json`
      ]
    });
    process.exit(1);
  }

  const versions = parseVersionsJson(query.stdout);
  if (versions.includes(targetVersion)) return;

  const latest = versions.length > 0 ? versions[versions.length - 1] : null;
  const betaCandidates = versions.filter((entry) => entry.includes('beta')).slice(-5);
  printUpgradeError({
    title: `Requested version "${targetVersion}" is not published for ${packageName}.`,
    detailLines: [
      latest ? `Latest published version: ${latest}` : 'Unable to determine latest published version.',
      betaCandidates.length > 0
        ? `Recent beta versions: ${betaCandidates.join(', ')}`
        : 'No beta versions found in published list.'
    ],
    suggestionLines: [
      `localnest upgrade ${latest || 'latest'}`,
      `localnest upgrade --dry-run`,
      `npm view ${packageName} versions --json`
    ]
  });
  process.exit(1);
}

function toRootList(rawPaths) {
  if (!rawPaths) return [];
  const roots = [];
  for (const item of rawPaths.split(',').map((entry) => entry.trim()).filter(Boolean)) {
    const resolved = path.resolve(item);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) continue;
    roots.push({
      label: path.basename(resolved) || `root${roots.length + 1}`,
      path: resolved
    });
  }
  return roots;
}

function applyFieldValue(config, fieldPath, value) {
  if (fieldPath === 'roots') {
    config.roots = value;
    return;
  }
  const parts = fieldPath.split('.');
  let cursor = config;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!cursor[key] || typeof cursor[key] !== 'object') {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

async function fillMissingFields(baseConfig, missingFields) {
  if (missingFields.length === 0) return baseConfig;

  const rl = readline.createInterface({ input, output });
  try {
    process.stdout.write('\n');
    process.stdout.write('[upgrade] New required setup fields need your input:\n');
    for (const field of missingFields) {
      process.stdout.write(`- ${field.label} (${field.path})\n`);
    }
    process.stdout.write('\n');

    for (const field of missingFields) {
      if (field.path === 'roots') {
        const answer = (await rl.question('Project folders (comma-separated absolute paths): ')).trim();
        const roots = toRootList(answer);
        if (roots.length === 0) {
          throw new Error('At least one valid project folder is required.');
        }
        applyFieldValue(baseConfig, field.path, roots);
        continue;
      }

      if (field.type === 'boolean') {
        const answer = (await rl.question(`${field.label} [true/false]: `)).trim();
        applyFieldValue(baseConfig, field.path, parseBoolean(answer, false));
        continue;
      }

      const answer = (await rl.question(`${field.label}: `)).trim();
      if (!answer) {
        throw new Error(`Value required for ${field.path}`);
      }
      applyFieldValue(baseConfig, field.path, answer);
    }
  } finally {
    rl.close();
  }
  return baseConfig;
}

async function main() {
  if (hasFlag('help') || hasShortFlag('h')) {
    process.stdout.write('LocalNest upgrade helper\n\n');
    process.stdout.write('Usage:\n');
    process.stdout.write('  localnest upgrade\n');
    process.stdout.write('  localnest upgrade 0.0.4-beta.5\n');
    process.stdout.write('  localnest upgrade install 0.0.4-beta.5\n');
    process.stdout.write('  localnest upgrade --version=0.0.4-beta.5\n');
    process.stdout.write('  localnest upgrade --dry-run\n');
    process.stdout.write('Options:\n');
    process.stdout.write('  --version=<semver|latest>  target package version\n');
    process.stdout.write('  --package=<npm-package>    package name (default localnest-mcp)\n');
    process.stdout.write('  --skip-skill               skip skill sync step\n');
    process.stdout.write('  --yes                      continue without confirmation prompts\n');
    process.stdout.write('  --dry-run                  print actions only\n');
    return;
  }

  const packageName = parseArg('package') || 'localnest-mcp';
  const targetVersion = resolveTargetVersion();
  const skipSkill = hasFlag('skip-skill');
  const dryRun = hasFlag('dry-run');
  const assumeYes = hasFlag('yes');

  const defaults = {
    roots: [{ label: path.basename(process.cwd()) || 'cwd', path: process.cwd() }],
    index: {
      backend: 'sqlite-vec',
      dbPath: layout.sqliteDbPath,
      indexPath: layout.jsonIndexPath,
      chunkLines: 60,
      chunkOverlap: 15,
      maxTermsPerChunk: 80,
      maxIndexedFiles: 20000,
      embeddingProvider: 'xenova',
      embeddingModel: 'Xenova/all-MiniLM-L6-v2',
      embeddingCacheDir: layout.dirs.cache,
      embeddingDimensions: 384,
      rerankerProvider: 'xenova',
      rerankerModel: 'Xenova/ms-marco-MiniLM-L-6-v2',
      rerankerCacheDir: layout.dirs.cache
    },
    memory: {
      enabled: false,
      backend: 'auto',
      dbPath: layout.memoryDbPath,
      autoCapture: false,
      askForConsentDone: false
    }
  };

  const existingConfig = readExistingConfig();
  const missing = findMissingRequiredSetupFields(existingConfig);
  const mergedConfig = normalizeUpgradeConfig({ existingConfig, defaults });
  const finalConfig = assumeYes ? mergedConfig : await fillMissingFields(mergedConfig, missing);

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const skillCmd = process.platform === 'win32' ? 'localnest-mcp-install-skill.cmd' : 'localnest-mcp-install-skill';
  const setupScript = path.resolve(scriptsDir, 'setup-localnest.mjs');
  const setupArgs = [
    setupScript,
    `--package=${packageName}`,
    `--roots-json=${JSON.stringify(finalConfig.roots)}`,
    `--index-backend=${finalConfig.index.backend}`,
    `--db-path=${finalConfig.index.dbPath}`,
    `--index-path=${finalConfig.index.indexPath}`,
    `--chunk-lines=${String(finalConfig.index.chunkLines)}`,
    `--chunk-overlap=${String(finalConfig.index.chunkOverlap)}`,
    `--max-terms-per-chunk=${String(finalConfig.index.maxTermsPerChunk)}`,
    `--max-indexed-files=${String(finalConfig.index.maxIndexedFiles)}`,
    `--embed-provider=${finalConfig.index.embeddingProvider || 'xenova'}`,
    `--embed-model=${finalConfig.index.embeddingModel || 'Xenova/all-MiniLM-L6-v2'}`,
    `--embed-cache-dir=${finalConfig.index.embeddingCacheDir || layout.dirs.cache}`,
    `--embed-dims=${String(finalConfig.index.embeddingDimensions || 384)}`,
    `--reranker-provider=${finalConfig.index.rerankerProvider || 'xenova'}`,
    `--reranker-model=${finalConfig.index.rerankerModel || 'Xenova/ms-marco-MiniLM-L-6-v2'}`,
    `--reranker-cache-dir=${finalConfig.index.rerankerCacheDir || layout.dirs.cache}`,
    `--memory-enabled=${String(finalConfig.memory.enabled)}`,
    `--memory-backend=${finalConfig.memory.backend}`,
    `--memory-db-path=${finalConfig.memory.dbPath}`,
    `--memory-auto-capture=${String(finalConfig.memory.autoCapture)}`,
    `--memory-consent-done=${String(finalConfig.memory.askForConsentDone)}`
  ];

  const planned = [
    `${npmCmd} install -g ${packageName}@${targetVersion}`,
    skipSkill ? null : `${skillCmd} --force`,
    `${process.execPath} ${setupArgs.join(' ')}`
  ].filter(Boolean);

  if (dryRun) {
    process.stdout.write('[upgrade] dry run, planned commands:\n');
    for (const command of planned) {
      process.stdout.write(`- ${command}\n`);
    }
    return;
  }

  ensureVersionExists({ npmCmd, packageName, targetVersion });
  runCommand(npmCmd, ['install', '-g', `${packageName}@${targetVersion}`], 'upgrade package');
  if (!skipSkill) {
    runCommand(skillCmd, ['--force'], 'sync skill');
  }
  runCommand(process.execPath, setupArgs, 'migrate setup');

  const doctorScript = path.resolve(scriptsDir, 'doctor-localnest.mjs');
  try {
    runCommand(process.execPath, [doctorScript], 'post-upgrade doctor');
  } catch (error) {
    process.stderr.write(`[upgrade] warning: ${error.message}\n`);
  }

  process.stdout.write('\n[upgrade] completed. Restart your MCP client to apply the updated runtime.\n');
}

main().catch((error) => {
  process.stderr.write(`[localnest-upgrade] fatal: ${error?.message || error}\n`);
  process.exit(1);
});
