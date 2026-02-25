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
