#!/usr/bin/env node

import process from 'node:process';
import {
  SERVER_NAME,
  SERVER_VERSION,
  buildRuntimeConfig
} from '../src/config.js';
import { MemoryService } from '../src/services/memory/service.js';
import { MemoryWorkflowService } from '../src/services/memory/workflow.js';

export function parseArg(argv, name) {
  const direct = `--${name}`;
  const prefixed = `${direct}=`;
  const index = argv.indexOf(direct);
  if (index !== -1) {
    return argv[index + 1] || '';
  }
  const item = argv.find((arg) => arg.startsWith(prefixed));
  return item ? item.slice(prefixed.length) : '';
}

export function parseBooleanArg(argv, name, fallback = false) {
  const value = parseArg(argv, name);
  if (!value) return fallback;
  return String(value).toLowerCase() === 'true';
}

export function parseNumberArg(argv, name, fallback = undefined) {
  const value = parseArg(argv, name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseCsvArg(argv, name) {
  const value = parseArg(argv, name);
  if (!value) return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export async function readJsonInput(argv) {
  const argJson = parseArg(argv, 'json');
  if (argJson) return JSON.parse(argJson);
  if (process.stdin.isTTY) return {};

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function buildRuntimeSummary(runtime) {
  return {
    name: SERVER_NAME,
    version: SERVER_VERSION,
    mode: runtime.mcpMode,
    roots: runtime.roots,
    has_ripgrep: runtime.hasRipgrep,
    memory: {
      enabled: runtime.memoryEnabled,
      auto_capture: runtime.memoryAutoCapture,
      consent_done: runtime.memoryConsentDone
    },
    vector_index: {
      backend: runtime.indexBackend,
      requested_backend: runtime.indexBackend
    }
  };
}

export function createMemoryWorkflow() {
  const runtime = buildRuntimeConfig(process.env);
  const memory = new MemoryService({
    localnestHome: runtime.localnestHome,
    enabled: runtime.memoryEnabled,
    backend: runtime.memoryBackend,
    dbPath: runtime.memoryDbPath,
    autoCapture: runtime.memoryAutoCapture,
    consentDone: runtime.memoryConsentDone
  });
  const workflow = new MemoryWorkflowService({
    memory,
    getRuntimeSummary: async () => buildRuntimeSummary(runtime)
  });
  return { runtime, workflow };
}

export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
