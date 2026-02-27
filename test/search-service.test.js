import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchService } from '../src/services/search-service.js';

test('searchHybrid merges semantic and lexical overlap into hybrid result', () => {
  const service = new SearchService({
    workspace: {},
    ignoreDirs: new Set(),
    hasRipgrep: false,
    rgTimeoutMs: 1000,
    maxFileBytes: 1024,
    vectorIndex: {
      semanticSearch: () => ([
        {
          file: '/tmp/a.js',
          start_line: 9,
          end_line: 15,
          snippet: 'function alpha() {}',
          semantic_score: 0.5
        }
      ])
    }
  });

  service.searchCode = () => ([
    { file: '/tmp/a.js', line: 11, text: 'alpha();' },
    { file: '/tmp/b.js', line: 5, text: 'beta();' }
  ]);

  const out = service.searchHybrid({
    query: 'alpha',
    projectPath: '/tmp',
    allRoots: false,
    glob: '*',
    maxResults: 10,
    caseSensitive: false,
    minSemanticScore: 0
  });

  assert.equal(out.results[0].file, '/tmp/a.js');
  assert.equal(out.results[0].type, 'hybrid');
  assert.equal(out.results[0].line, 11);
  assert.equal(out.results[0].start_line, 9);
  assert.equal(out.results[0].end_line, 15);
  assert.ok(out.results[0].lexical_score > 0);
  assert.ok(out.results[0].semantic_score > 0);
});

test('searchHybrid auto-indexes once when semantic results are empty', () => {
  const calls = { semantic: 0, index: 0 };
  const service = new SearchService({
    workspace: {
      resolveSearchBases: () => ['/tmp/project'],
      normalizeTarget: (p) => p
    },
    ignoreDirs: new Set(),
    hasRipgrep: false,
    rgTimeoutMs: 1000,
    maxFileBytes: 1024,
    vectorIndex: {
      semanticSearch: ({ query }) => {
        calls.semantic += 1;
        if (query === 'missing') return [];
        if (calls.index === 0) return [];
        return [{
          file: '/tmp/project/a.js',
          start_line: 1,
          end_line: 3,
          snippet: 'alpha result',
          semantic_score: 0.7
        }];
      },
      indexProject: () => {
        calls.index += 1;
        return { indexed_files: 12, failed_files: [] };
      }
    }
  });

  service.searchCode = () => [];

  const first = service.searchHybrid({
    query: 'alpha',
    projectPath: '/tmp/project',
    allRoots: false,
    glob: '*',
    maxResults: 5,
    caseSensitive: false,
    minSemanticScore: 0
  });

  assert.equal(calls.index, 1);
  assert.equal(calls.semantic, 2);
  assert.equal(first.semantic_hits, 1);
  assert.equal(first.auto_index?.attempted, true);
  assert.equal(first.auto_index?.success, true);

  const second = service.searchHybrid({
    query: 'missing',
    projectPath: '/tmp/project',
    allRoots: false,
    glob: '*',
    maxResults: 5,
    caseSensitive: false,
    minSemanticScore: 0
  });

  assert.equal(calls.index, 1);
  assert.equal(second.auto_index?.attempted, false);
  assert.equal(second.auto_index?.skipped_reason, 'already_attempted_for_scope');
});

test('searchHybrid does not auto-index when autoIndex is false', () => {
  const service = new SearchService({
    workspace: {
      resolveSearchBases: () => ['/tmp/project'],
      normalizeTarget: (p) => p
    },
    ignoreDirs: new Set(),
    hasRipgrep: false,
    rgTimeoutMs: 1000,
    maxFileBytes: 1024,
    vectorIndex: {
      semanticSearch: () => [],
      indexProject: () => {
        throw new Error('should not be called');
      }
    }
  });

  service.searchCode = () => [];

  const out = service.searchHybrid({
    query: 'alpha',
    projectPath: '/tmp/project',
    allRoots: false,
    glob: '*',
    maxResults: 5,
    caseSensitive: false,
    minSemanticScore: 0,
    autoIndex: false
  });

  assert.equal(out.semantic_hits, 0);
  assert.equal(out.auto_index, null);
});
