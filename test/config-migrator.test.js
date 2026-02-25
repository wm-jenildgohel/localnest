import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ensureConfigUpgraded } from '../src/migrations/config-migrator.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'localnest-migrator-test-'));
}

test('ensureConfigUpgraded handles missing/invalid config', () => {
  const root = makeTempDir();
  const missing = ensureConfigUpgraded({ configPath: path.join(root, 'missing.json'), localnestHome: root });
  assert.equal(missing.changed, false);
  assert.equal(missing.reason, 'missing');

  const invalidPath = path.join(root, 'invalid.json');
  fs.writeFileSync(invalidPath, '{not-json', 'utf8');
  const invalid = ensureConfigUpgraded({ configPath: invalidPath, localnestHome: root });
  assert.equal(invalid.changed, false);
  assert.equal(invalid.reason, 'invalid-json');

  const badShapePath = path.join(root, 'bad-shape.json');
  fs.writeFileSync(badShapePath, JSON.stringify({ roots: 'x' }), 'utf8');
  const badShape = ensureConfigUpgraded({ configPath: badShapePath, localnestHome: root });
  assert.equal(badShape.changed, false);
  assert.equal(badShape.reason, 'invalid-shape');

  fs.rmSync(root, { recursive: true, force: true });
});

test('ensureConfigUpgraded migrates old config and creates backup', () => {
  const root = makeTempDir();
  const cfgPath = path.join(root, 'localnest.config.json');
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({ version: 1, roots: [{ label: 'x', path: root }] }, null, 2),
    'utf8'
  );

  const result = ensureConfigUpgraded({ configPath: cfgPath, localnestHome: root });
  assert.equal(result.changed, true);
  assert.equal(result.version, 2);
  assert.ok(result.backupPath);
  assert.ok(fs.existsSync(result.backupPath));

  const upgraded = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  assert.equal(upgraded.version, 2);
  assert.equal(upgraded.index.backend, 'sqlite-vec');
  assert.equal(upgraded.index.maxIndexedFiles, 20000);

  fs.rmSync(root, { recursive: true, force: true });
});

test('ensureConfigUpgraded returns up-to-date without rewrite', () => {
  const root = makeTempDir();
  const cfgPath = path.join(root, 'localnest.config.json');
  const data = {
    version: 2,
    roots: [{ label: 'x', path: root }],
    index: {
      backend: 'sqlite-vec',
      dbPath: path.join(root, 'db.sqlite'),
      indexPath: path.join(root, 'idx.json'),
      chunkLines: 60,
      chunkOverlap: 15,
      maxTermsPerChunk: 80,
      maxIndexedFiles: 20000
    }
  };
  fs.writeFileSync(cfgPath, JSON.stringify(data, null, 2), 'utf8');

  const result = ensureConfigUpgraded({ configPath: cfgPath, localnestHome: root });
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'up-to-date');

  fs.rmSync(root, { recursive: true, force: true });
});
