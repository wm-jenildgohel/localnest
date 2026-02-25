import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildBaseScopeClause, SqliteVecIndexService } from '../src/services/sqlite-vec-index-service.js';

test('buildBaseScopeClause handles slash and backslash descendants', () => {
  const bases = ['C:\\repo\\project', '/home/u/repo'];
  const scope = buildBaseScopeClause(bases);

  assert.equal(scope.params[0], 'C:\\repo\\project');
  assert.equal(scope.params[1], 'C:\\repo\\project/%');
  assert.equal(scope.params[2], 'C:\\repo\\project\\%');
  assert.equal(scope.params[3], '/home/u/repo');
  assert.equal(scope.params[4], '/home/u/repo/%');
  assert.equal(scope.params[5], '/home/u/repo\\%');
});

test('sqlite index updates df/norm incrementally across reindex', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'localnest-sqlite-test-'));
  const dbPath = path.join(tempRoot, 'idx.db');
  const target = path.join(tempRoot, 'a.js');

  fs.writeFileSync(target, 'const foo = 1;\nfoo();\n', 'utf8');

  const workspace = {
    resolveSearchBases: () => [tempRoot],
    normalizeTarget: (p) => p,
    *walkDirectories(base) {
      yield { files: [path.join(base, 'a.js')] };
    },
    isLikelyTextFile: () => true,
    safeReadText: (p) => fs.readFileSync(p, 'utf8')
  };

  const service = new SqliteVecIndexService({
    workspace,
    dbPath,
    sqliteVecExtensionPath: '',
    chunkLines: 20,
    chunkOverlap: 5,
    maxTermsPerChunk: 40,
    maxIndexedFiles: 100
  });

  service.indexProject({ projectPath: tempRoot, allRoots: false, force: false, maxFiles: 10 });
  const fooBefore = service.semanticSearch({
    query: 'foo',
    projectPath: tempRoot,
    allRoots: false,
    maxResults: 5,
    minScore: 0
  });
  assert.ok(fooBefore.length > 0);

  fs.writeFileSync(target, 'const bar = 2;\nbar();\n', 'utf8');
  service.indexProject({ projectPath: tempRoot, allRoots: false, force: false, maxFiles: 10 });

  const fooAfter = service.semanticSearch({
    query: 'foo',
    projectPath: tempRoot,
    allRoots: false,
    maxResults: 5,
    minScore: 0
  });
  const barAfter = service.semanticSearch({
    query: 'bar',
    projectPath: tempRoot,
    allRoots: false,
    maxResults: 5,
    minScore: 0
  });

  assert.equal(fooAfter.length, 0);
  assert.ok(barAfter.length > 0);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});
