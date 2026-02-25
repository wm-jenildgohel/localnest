#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);

function hasFlag(flag) {
  return argv.includes(flag);
}

function envTrue(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function copyDir(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

function main() {
  const auto = hasFlag('--auto');
  const force = hasFlag('--force');
  const quiet = hasFlag('--quiet') || auto;

  if (auto && envTrue('LOCALNEST_SKIP_SKILL_INSTALL', false)) {
    if (!quiet) console.log('[localnest-skill] skipped by LOCALNEST_SKIP_SKILL_INSTALL=true');
    return;
  }

  if (auto && envTrue('CI', false)) {
    if (!quiet) console.log('[localnest-skill] skipped in CI environment');
    return;
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(scriptDir, '..');
  const sourceSkillDir = path.join(packageRoot, 'skills', 'localnest-mcp');

  if (!fs.existsSync(sourceSkillDir)) {
    if (!quiet) console.error(`[localnest-skill] source not found: ${sourceSkillDir}`);
    process.exitCode = 1;
    return;
  }

  const agentsHome = path.resolve(process.env.LOCALNEST_AGENTS_HOME || path.join(os.homedir(), '.agents'));
  const targetSkillsDir = path.resolve(process.env.LOCALNEST_SKILLS_DIR || path.join(agentsHome, 'skills'));
  const targetSkillDir = path.join(targetSkillsDir, 'localnest-mcp');

  if (fs.existsSync(targetSkillDir)) {
    if (!force) {
      if (!quiet) console.log(`[localnest-skill] already installed: ${targetSkillDir}`);
      return;
    }
    fs.rmSync(targetSkillDir, { recursive: true, force: true });
  }

  copyDir(sourceSkillDir, targetSkillDir);

  if (!quiet) {
    console.log('[localnest-skill] installed successfully');
    console.log(`[localnest-skill] source: ${sourceSkillDir}`);
    console.log(`[localnest-skill] target: ${targetSkillDir}`);
    console.log('[localnest-skill] restart Codex to load new/updated skill');
  }
}

main();
