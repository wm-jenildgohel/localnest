#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

if (!process.env.DART_SUPPRESS_ANALYTICS) {
  process.env.DART_SUPPRESS_ANALYTICS = 'true';
}

const cwd = process.cwd();
const localnestHome = path.resolve(process.env.LOCALNEST_HOME || path.join(os.homedir(), '.localnest'));
const configPath = path.join(localnestHome, 'localnest.config.json');
const snippetPath = path.join(localnestHome, 'mcp.localnest.json');
const defaultDbPath = path.join(localnestHome, 'localnest.db');
const defaultJsonIndexPath = path.join(localnestHome, 'localnest.index.json');
const argv = process.argv.slice(2);

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function toLabel(dirPath, fallback = 'root') {
  const base = path.basename(dirPath);
  const safe = (base || fallback).replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  return safe || fallback;
}

function expandHome(p) {
  if (!p) return p;
  return p.replace(/^~(?=$|\/)/, os.homedir());
}

function collectSuggestions() {
  const home = os.homedir();
  const candidates = [
    path.join(home, 'projects'),
    path.join(home, 'project'),
    path.join(home, 'code'),
    path.join(home, 'workspace'),
    path.join(home, 'work'),
    cwd
  ];

  const unique = [];
  const seen = new Set();
  for (const p of candidates) {
    const resolved = path.resolve(p);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    if (isDir(resolved)) unique.push(resolved);
  }
  return unique;
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

function getGlobalCommand() {
  return process.platform === 'win32' ? 'localnest-mcp.cmd' : 'localnest-mcp';
}

function runPreflightChecks() {
  const errors = [];

  const majorNode = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
  if (!Number.isFinite(majorNode) || majorNode < 18) {
    errors.push(`Node.js 18+ is required. Current: ${process.versions.node}`);
  }

  if (!commandExists(getNpxCommand())) {
    errors.push('npx is not available. Install Node.js/npm correctly and retry.');
  }

  if (!commandExists('rg')) {
    errors.push('ripgrep (rg) is required for efficient search. Install it and re-run setup.');
  }

  return { errors };
}

function buildClientSnippet(packageRef, indexConfig) {
  return {
    mcpServers: {
      localnest: {
        command: getNpxCommand(),
        args: ['-y', packageRef],
        env: {
          MCP_MODE: 'stdio',
          LOCALNEST_CONFIG: configPath,
          LOCALNEST_INDEX_BACKEND: indexConfig.backend,
          LOCALNEST_DB_PATH: indexConfig.dbPath,
          LOCALNEST_INDEX_PATH: indexConfig.indexPath
        }
      }
    }
  };
}

function buildGlobalClientSnippet(indexConfig) {
  return {
    mcpServers: {
      localnest: {
        command: getGlobalCommand(),
        env: {
          MCP_MODE: 'stdio',
          LOCALNEST_CONFIG: configPath,
          LOCALNEST_INDEX_BACKEND: indexConfig.backend,
          LOCALNEST_DB_PATH: indexConfig.dbPath,
          LOCALNEST_INDEX_PATH: indexConfig.indexPath
        }
      }
    }
  };
}

function parseArg(name) {
  const long = `--${name}=`;
  const item = argv.find((a) => a.startsWith(long));
  if (!item) return null;
  return item.slice(long.length).trim();
}

function parseRootsFromPathsArg(pathsArg) {
  if (!pathsArg) return [];

  const roots = [];
  for (const raw of pathsArg.split(',').map((x) => x.trim()).filter(Boolean)) {
    const resolved = path.resolve(expandHome(raw));
    if (!isDir(resolved)) continue;
    roots.push({
      label: toLabel(resolved, `root${roots.length + 1}`),
      path: resolved
    });
  }
  return roots;
}

function saveOutputs(roots, packageRef, indexConfig) {
  fs.mkdirSync(localnestHome, { recursive: true });
  const config = {
    name: 'localnest',
    version: 1,
    updatedAt: new Date().toISOString(),
    roots,
    index: {
      backend: indexConfig.backend,
      dbPath: indexConfig.dbPath,
      indexPath: indexConfig.indexPath,
      chunkLines: indexConfig.chunkLines,
      chunkOverlap: indexConfig.chunkOverlap,
      maxTermsPerChunk: indexConfig.maxTermsPerChunk,
      maxIndexedFiles: indexConfig.maxIndexedFiles
    }
  };

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  fs.writeFileSync(snippetPath, `${JSON.stringify(buildClientSnippet(packageRef, indexConfig), null, 2)}\n`, 'utf8');
}

function printSuccess(packageRef, indexConfig) {
  const globalSnippet = buildGlobalClientSnippet(indexConfig);
  const npxSnippet = buildClientSnippet(packageRef, indexConfig);

  console.log('');
  console.log(`Saved root config: ${configPath}`);
  console.log(`Saved client snippet: ${snippetPath}`);
  console.log('');
  console.log('Next steps:');
  console.log('1) Copy-paste this GLOBAL MCP config block into your client config:');
  console.log('');
  console.log(JSON.stringify(globalSnippet, null, 2));
  console.log('');
  console.log('2) Restart your MCP client / AI tool');
  console.log('3) Use tools: localnest_index_status, localnest_index_project, localnest_search_hybrid, localnest_read_file');
  console.log('');
  console.log('Optional npx fallback snippet (also saved to file):');
  console.log(`- ${snippetPath}`);
  console.log(JSON.stringify(npxSnippet, null, 2));
}

async function main() {
  const packageRef = parseArg('package') || process.env.LOCALNEST_NPX_PACKAGE || 'localnest-mcp';
  const preflight = runPreflightChecks();
  if (preflight.errors.length > 0) {
    for (const err of preflight.errors) {
      console.error(`[preflight:error] ${err}`);
    }
    process.exit(1);
  }

  const pathsArg = parseArg('paths');
  if (pathsArg) {
    const roots = parseRootsFromPathsArg(pathsArg);
    if (roots.length === 0) {
      throw new Error('No valid directories provided in --paths');
    }
    saveOutputs(roots, packageRef, {
      backend: 'sqlite-vec',
      dbPath: defaultDbPath,
      indexPath: defaultJsonIndexPath,
      chunkLines: 60,
      chunkOverlap: 15,
      maxTermsPerChunk: 80,
      maxIndexedFiles: 20000
    });
    printSuccess(packageRef, {
      backend: 'sqlite-vec',
      dbPath: defaultDbPath,
      indexPath: defaultJsonIndexPath
    });
    return;
  }

  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('LocalNest setup wizard');
    console.log('');
    console.log('Usage:');
    console.log('  npm run setup');
    console.log('  npm run setup -- --paths=\"/abs/path1,/abs/path2\"');
    console.log('  npm run setup -- --package=\"localnest-mcp\"');
    return;
  }

  const rl = readline.createInterface({ input, output });
  try {
    console.log('LocalNest setup wizard');
    console.log('This will configure project/data folders and indexing backend for LocalNest MCP.');
    console.log('');

    const suggestions = collectSuggestions();
    if (suggestions.length > 0) {
      console.log('Suggested folders:');
      suggestions.forEach((s, i) => {
        console.log(`  ${i + 1}. ${s}`);
      });
      console.log('');
    }

    const roots = [];

    for (let i = 0; i < suggestions.length; i += 1) {
      const answer = (await rl.question(`Add suggested folder ${i + 1} (${suggestions[i]})? [y/N]: `)).trim().toLowerCase();
      if (answer !== 'y' && answer !== 'yes') continue;

      const defaultLabel = toLabel(suggestions[i], `root${roots.length + 1}`);
      const labelInput = (await rl.question(`Label for ${suggestions[i]} [${defaultLabel}]: `)).trim();
      roots.push({
        label: labelInput || defaultLabel,
        path: suggestions[i]
      });
    }

    while (true) {
      const rawPath = (await rl.question('Add another folder path (or press Enter to finish): ')).trim();
      if (!rawPath) break;

      const resolved = path.resolve(expandHome(rawPath));
      if (!isDir(resolved)) {
        console.log(`Skipping: not a directory -> ${resolved}`);
        continue;
      }

      if (roots.some((r) => r.path === resolved)) {
        console.log(`Skipping: already added -> ${resolved}`);
        continue;
      }

      const defaultLabel = toLabel(resolved, `root${roots.length + 1}`);
      const labelInput = (await rl.question(`Label for ${resolved} [${defaultLabel}]: `)).trim();
      roots.push({
        label: labelInput || defaultLabel,
        path: resolved
      });
    }

    if (roots.length === 0) {
      const fallback = cwd;
      console.log('No folders selected. Using current directory as fallback.');
      roots.push({ label: toLabel(fallback, 'cwd'), path: fallback });
    }

    console.log('');
    console.log('Index backend options:');
    console.log('1) sqlite-vec (recommended): low-resource SQLite DB, durable, future-upgradable');
    console.log('2) json: simplest file-based index (fallback compatibility mode)');
    const backendAnswer = (await rl.question('Choose backend [1/2] (default 1): ')).trim();
    const backend = backendAnswer === '2' ? 'json' : 'sqlite-vec';

    const suggestedDbPath = defaultDbPath;
    const dbPathInput = (await rl.question(`SQLite DB path [${suggestedDbPath}]: `)).trim();
    const dbPath = path.resolve(expandHome(dbPathInput || suggestedDbPath));

    const suggestedIndexPath = defaultJsonIndexPath;
    const indexPathInput = (await rl.question(`JSON index path (fallback) [${suggestedIndexPath}]: `)).trim();
    const indexPath = path.resolve(expandHome(indexPathInput || suggestedIndexPath));

    const chunkLinesInput = (await rl.question('Chunk lines [60]: ')).trim();
    const chunkOverlapInput = (await rl.question('Chunk overlap [15]: ')).trim();
    const maxTermsInput = (await rl.question('Max terms per chunk [80]: ')).trim();
    const maxFilesInput = (await rl.question('Max indexed files [20000]: ')).trim();

    const chunkLines = Number.parseInt(chunkLinesInput || '60', 10) || 60;
    const chunkOverlap = Number.parseInt(chunkOverlapInput || '15', 10) || 15;
    const maxTermsPerChunk = Number.parseInt(maxTermsInput || '80', 10) || 80;
    const maxIndexedFiles = Number.parseInt(maxFilesInput || '20000', 10) || 20000;

    saveOutputs(roots, packageRef, {
      backend,
      dbPath,
      indexPath,
      chunkLines,
      chunkOverlap,
      maxTermsPerChunk,
      maxIndexedFiles
    });
    printSuccess(packageRef, {
      backend,
      dbPath,
      indexPath
    });
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error('[localnest-setup] fatal:', error?.message || error);
  process.exit(1);
});
