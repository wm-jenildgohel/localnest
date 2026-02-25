import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkspaceService } from '../src/services/workspace-service.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'localnest-workspace-test-'));
}

function makeWorkspace(root, opts = {}) {
  return new WorkspaceService({
    roots: [{ label: 'root', path: root }],
    ignoreDirs: new Set(['node_modules', 'build']),
    textExtensions: new Set(['.js', '.ts', '.md', '.txt']),
    projectMarkerFiles: new Set(['package.json', 'pubspec.yaml']),
    projectHintDirs: new Set(['src', 'lib', 'test']),
    extraProjectMarkers: new Set(['.project-marker']),
    maxFileBytes: opts.maxFileBytes || 1024,
    autoProjectSplit: opts.autoProjectSplit ?? true,
    maxAutoProjects: opts.maxAutoProjects || 10,
    forceSplitChildren: opts.forceSplitChildren ?? false
  });
}

test('normalizeTarget enforces root boundaries', () => {
  const root = makeTempDir();
  const service = makeWorkspace(root);

  const inside = service.normalizeTarget('./');
  assert.equal(inside, path.resolve(root));

  assert.throws(() => service.normalizeTarget(path.resolve(root, '..')), /outside configured roots/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('resolveSearchBases auto split and fallback behavior', () => {
  const root = makeTempDir();
  const projA = path.join(root, 'proj-a');
  const projB = path.join(root, 'proj-b');
  fs.mkdirSync(projA);
  fs.mkdirSync(path.join(projA, 'src'), { recursive: true });
  fs.writeFileSync(path.join(projA, 'package.json'), '{}', 'utf8');
  fs.mkdirSync(path.join(projB, 'random'), { recursive: true });

  const splitService = makeWorkspace(root, { autoProjectSplit: true, forceSplitChildren: false });
  const splitBases = splitService.resolveSearchBases(undefined, false);
  assert.equal(splitBases.length, 1);
  assert.equal(splitBases[0], projA);

  const forceService = makeWorkspace(root, { autoProjectSplit: true, forceSplitChildren: true, maxAutoProjects: 5 });
  const forcedWhenProjectsExist = forceService.resolveSearchBases(undefined, false);
  assert.deepEqual(forcedWhenProjectsExist, [projA]);

  // forceSplitChildren applies only when no explicit project markers are found.
  fs.rmSync(path.join(projA, 'package.json'));
  const forced = forceService.resolveSearchBases(undefined, false);
  assert.ok(forced.includes(projA));
  assert.ok(forced.includes(projB));

  const noSplitService = makeWorkspace(root, { autoProjectSplit: false });
  const raw = noSplitService.resolveSearchBases(undefined, false);
  assert.deepEqual(raw, [root]);

  fs.rmSync(root, { recursive: true, force: true });
});

test('listProjects/projectTree/summarizeProject/readFileChunk flows', () => {
  const root = makeTempDir();
  const proj = path.join(root, 'proj');
  fs.mkdirSync(path.join(proj, 'src'), { recursive: true });
  fs.mkdirSync(path.join(proj, '.hidden-dir'));
  fs.writeFileSync(path.join(proj, 'package.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(proj, 'src', 'main.js'), 'a\nb\nc\nd\n123456789', 'utf8');
  fs.writeFileSync(path.join(proj, 'README.md'), '# hi', 'utf8');
  fs.writeFileSync(path.join(proj, '.hidden.txt'), 'hidden', 'utf8');

  const service = makeWorkspace(root, { maxFileBytes: 1024 });

  const projects = service.listProjects(root, 10);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].name, 'proj');
  assert.match(projects[0].markers, /node/);

  const tree = service.projectTree(proj, 3, 20);
  assert.ok(tree.some((l) => l.includes('src/')));
  assert.ok(tree.some((l) => l.includes('main.js')));

  const summary = service.summarizeProject(proj, 1);
  assert.equal(summary.truncated, true);
  assert.equal(summary.files_counted, 1);

  const chunk = service.readFileChunk(path.join(proj, 'src', 'main.js'), 3, 20, 2);
  assert.equal(chunk.start_line, 3);
  assert.equal(chunk.end_line, 4);
  assert.match(chunk.content, /^3: c/m);

  const tinyLimitService = makeWorkspace(root, { maxFileBytes: 7 });
  assert.throws(() => tinyLimitService.safeReadText(path.join(proj, 'src', 'main.js')), /File too large/);

  fs.rmSync(root, { recursive: true, force: true });
});
