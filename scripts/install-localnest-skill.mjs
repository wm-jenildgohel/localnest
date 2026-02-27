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

  const existed = fs.existsSync(targetSkillDir);
  if (existed) {
    fs.rmSync(targetSkillDir, { recursive: true, force: true });
  }

  copyDir(sourceSkillDir, targetSkillDir);
  syncKnownToolLocations(sourceSkillDir, quiet, force);

  if (!quiet) {
    console.log(`[localnest-skill] ${existed ? 'synced' : 'installed'} successfully`);
    console.log(`[localnest-skill] source: ${sourceSkillDir}`);
    console.log(`[localnest-skill] target: ${targetSkillDir}`);
    console.log('[localnest-skill] restart your AI tool to load the updated skill');
  }
}

// Known AI tool skill locations — extend as new tools adopt the skills spec.
const KNOWN_TOOL_SKILL_DIRS = [
  path.join(os.homedir(), '.claude', 'skills'),       // Claude Code
  path.join(os.homedir(), '.cline', 'skills'),        // Cline
  path.join(os.homedir(), '.continue', 'skills'),     // Continue
];

function syncKnownToolLocations(sourceSkillDir, quiet, force) {
  for (const toolSkillsDir of KNOWN_TOOL_SKILL_DIRS) {
    const dest = path.join(toolSkillsDir, 'localnest-mcp');
    try {
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
      // Only create if the parent tool directory already exists (tool is installed).
      if (!fs.existsSync(toolSkillsDir)) {
        if (!force) continue;
        fs.mkdirSync(toolSkillsDir, { recursive: true });
      }
      copyDir(sourceSkillDir, dest);
      if (!quiet) console.log(`[localnest-skill] synced → ${dest}`);
    } catch (err) {
      if (!quiet) console.warn(`[localnest-skill] skipped ${dest}: ${err.message}`);
    }
  }
}

main();
