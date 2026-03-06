import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { VectorIndexService } from '../src/services/vector-index/service.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'localnest-vector-test-'));
}

function makeWorkspace(base) {
  return {
    resolveSearchBases: () => [base],
    normalizeTarget: (p) => p,
    *walkDirectories(root) {
      const entries = fs.readdirSync(root);
      yield {
        files: entries
          .filter((f) => fs.statSync(path.join(root, f)).isFile())
          .map((f) => path.join(root, f))
      };
    },
    isLikelyTextFile: (p) => ['.js', '.md', '.txt'].includes(path.extname(p)),
    safeReadText: (p) => fs.readFileSync(p, 'utf8')
  };
}

test('vector index project lifecycle: index, skip, remove, search', async () => {
  const root = makeTempDir();
  const indexPath = path.join(root, 'index.json');
  const a = path.join(root, 'a.js');
  const b = path.join(root, 'b.txt');

  fs.writeFileSync(a, 'const alpha = 1;\nalpha();\n', 'utf8');
  fs.writeFileSync(b, 'beta beta gamma\n', 'utf8');

  const service = new VectorIndexService({
    workspace: makeWorkspace(root),
    indexPath,
    chunkLines: 20,
    chunkOverlap: 5,
    maxTermsPerChunk: 20,
    maxIndexedFiles: 10
  });

  const first = await service.indexProject({ projectPath: root, allRoots: false, force: false, maxFiles: 10 });
  assert.equal(first.indexed_files, 2);
  assert.equal(first.skipped_files, 0);
  assert.ok(first.total_chunks > 0);

  const second = await service.indexProject({ projectPath: root, allRoots: false, force: false, maxFiles: 10 });
  assert.equal(second.skipped_files, 2);

  fs.rmSync(b);
  const third = await service.indexProject({ projectPath: root, allRoots: false, force: false, maxFiles: 10 });
  assert.equal(third.removed_files, 1);

  const found = await service.semanticSearch({
    query: 'alpha',
    projectPath: root,
    allRoots: false,
    maxResults: 5,
    minScore: 0
  });
  assert.ok(found.length > 0);
  assert.equal(found[0].file, a);

  const none = await service.semanticSearch({
    query: '   ',
    projectPath: root,
    allRoots: false,
    maxResults: 5,
    minScore: 0
  });
  assert.deepEqual(none, []);

  const status = service.getStatus();
  assert.equal(status.index_path, indexPath);
  assert.equal(status.total_files, 1);

  fs.rmSync(root, { recursive: true, force: true });
});

test('vector collectFiles respects maxFiles and maxIndexedFiles', () => {
  const root = makeTempDir();
  for (let i = 0; i < 5; i += 1) {
    fs.writeFileSync(path.join(root, `f${i}.js`), `const n${i}=1;`, 'utf8');
  }

  const service = new VectorIndexService({
    workspace: makeWorkspace(root),
    indexPath: path.join(root, 'index.json'),
    chunkLines: 20,
    chunkOverlap: 5,
    maxTermsPerChunk: 20,
    maxIndexedFiles: 3
  });

  const files = service.collectFiles([root], 10);
  assert.equal(files.length, 3);

  fs.rmSync(root, { recursive: true, force: true });
});

test('vector index BM25 fallback ranks lexical match without embeddings', async () => {
  const root = makeTempDir();
  const indexPath = path.join(root, 'index.json');
  const auth = path.join(root, 'auth.js');
  const other = path.join(root, 'other.js');

  fs.writeFileSync(auth, 'export function authMiddleware() { return true; }', 'utf8');
  fs.writeFileSync(other, 'export function billingLedger() { return true; }', 'utf8');

  const service = new VectorIndexService({
    workspace: makeWorkspace(root),
    indexPath,
    chunkLines: 20,
    chunkOverlap: 5,
    maxTermsPerChunk: 20,
    maxIndexedFiles: 10
  });

  await service.indexProject({ projectPath: root, allRoots: false, force: false, maxFiles: 10 });
  const out = await service.semanticSearch({
    query: 'auth middleware',
    projectPath: root,
    allRoots: false,
    maxResults: 5,
    minScore: 0
  });

  assert.ok(out.length > 0);
  assert.equal(out[0].file, auth);

  fs.rmSync(root, { recursive: true, force: true });
});

test('vector index status recommends sqlite upgrade for large json index', () => {
  const root = makeTempDir();
  const service = new VectorIndexService({
    workspace: makeWorkspace(root),
    indexPath: path.join(root, 'index.json'),
    chunkLines: 20,
    chunkOverlap: 5,
    maxTermsPerChunk: 20,
    maxIndexedFiles: 10
  });

  service.ensureLoaded();
  service.data.total_chunks = 5001;
  const status = service.getStatus();
  assert.equal(status.backend, 'json');
  assert.equal(status.upgrade_recommended, true);
  assert.ok(String(status.upgrade_reason).includes('sqlite-vec'));

  fs.rmSync(root, { recursive: true, force: true });
});
