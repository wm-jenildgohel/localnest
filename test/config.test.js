import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { applyConsolePolicy, buildRuntimeConfig, expandHome } from '../src/config.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'localnest-config-test-'));
}

test('expandHome expands leading ~ only', () => {
  const originalHome = process.env.HOME;
  process.env.HOME = '/tmp/h';
  assert.equal(expandHome('~/a/b'), '/tmp/h/a/b');
  assert.equal(expandHome('/abs/~keep'), '/abs/~keep');
  process.env.HOME = originalHome;
});

test('buildRuntimeConfig prioritizes PROJECT_ROOTS and env tuning', () => {
  const rootA = makeTempDir();
  const rootB = makeTempDir();
  const localnestHome = makeTempDir();
  const cfgPath = path.join(localnestHome, 'localnest.config.json');
  fs.writeFileSync(cfgPath, JSON.stringify({ version: 2, roots: [{ label: 'cfg', path: rootA }] }), 'utf8');

  const runtime = buildRuntimeConfig({
    MCP_MODE: 'STDIO',
    PROJECT_ROOTS: `alpha=${rootA};beta=${rootB}`,
    LOCALNEST_CONFIG: cfgPath,
    LOCALNEST_HOME: localnestHome,
    LOCALNEST_VECTOR_CHUNK_LINES: '120',
    LOCALNEST_VECTOR_CHUNK_OVERLAP: '20',
    LOCALNEST_VECTOR_MAX_TERMS: '90',
    LOCALNEST_VECTOR_MAX_FILES: '345',
    LOCALNEST_EXTRA_PROJECT_MARKERS: 'a.txt,b.txt',
    DISABLE_CONSOLE_OUTPUT: 'true',
    LOCALNEST_AUTO_PROJECT_SPLIT: 'false',
    LOCALNEST_FORCE_SPLIT_CHILDREN: 'true',
    LOCALNEST_RG_TIMEOUT_MS: '1234'
  });

  assert.equal(runtime.mcpMode, 'stdio');
  assert.equal(runtime.roots.length, 2);
  assert.equal(runtime.roots[0].label, 'alpha');
  assert.equal(runtime.autoProjectSplit, false);
  assert.equal(runtime.forceSplitChildren, true);
  assert.equal(runtime.disableConsoleOutput, true);
  assert.equal(runtime.rgTimeoutMs, 1234);
  assert.equal(runtime.vectorChunkLines, 120);
  assert.equal(runtime.vectorChunkOverlap, 20);
  assert.equal(runtime.vectorMaxTermsPerChunk, 90);
  assert.equal(runtime.vectorMaxIndexedFiles, 345);
  assert.ok(runtime.extraProjectMarkers.has('a.txt'));

  fs.rmSync(rootA, { recursive: true, force: true });
  fs.rmSync(rootB, { recursive: true, force: true });
  fs.rmSync(localnestHome, { recursive: true, force: true });
});

test('buildRuntimeConfig uses config file roots when PROJECT_ROOTS missing', () => {
  const rootA = makeTempDir();
  const localnestHome = makeTempDir();
  const cfgPath = path.join(localnestHome, 'localnest.config.json');
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({ version: 2, roots: [{ label: 'cfg-root', path: rootA }] }),
    'utf8'
  );

  const runtime = buildRuntimeConfig({
    LOCALNEST_CONFIG: cfgPath,
    LOCALNEST_HOME: localnestHome
  });
  assert.equal(runtime.roots.length, 1);
  assert.equal(runtime.roots[0].label, 'cfg-root');
  assert.equal(runtime.roots[0].path, rootA);

  fs.rmSync(rootA, { recursive: true, force: true });
  fs.rmSync(localnestHome, { recursive: true, force: true });
});

test('buildRuntimeConfig clamps update intervals to safe ranges', () => {
  const localnestHome = makeTempDir();
  const runtimeLow = buildRuntimeConfig({
    LOCALNEST_HOME: localnestHome,
    LOCALNEST_UPDATE_CHECK_INTERVAL_MINUTES: '1',
    LOCALNEST_UPDATE_FAILURE_BACKOFF_MINUTES: '1'
  });
  assert.equal(runtimeLow.updateCheckIntervalMinutes, 15);
  assert.equal(runtimeLow.updateFailureBackoffMinutes, 5);

  const runtimeHigh = buildRuntimeConfig({
    LOCALNEST_HOME: localnestHome,
    LOCALNEST_UPDATE_CHECK_INTERVAL_MINUTES: '99999',
    LOCALNEST_UPDATE_FAILURE_BACKOFF_MINUTES: '99999'
  });
  assert.equal(runtimeHigh.updateCheckIntervalMinutes, 1440);
  assert.equal(runtimeHigh.updateFailureBackoffMinutes, 240);

  fs.rmSync(localnestHome, { recursive: true, force: true });
});

test('applyConsolePolicy disables common console outputs', () => {
  const original = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    warn: console.warn
  };

  applyConsolePolicy(true);
  assert.notEqual(console.log, original.log);
  assert.notEqual(console.info, original.info);
  assert.notEqual(console.debug, original.debug);
  assert.notEqual(console.warn, original.warn);

  console.log = original.log;
  console.info = original.info;
  console.debug = original.debug;
  console.warn = original.warn;
});
