#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SearchService } from '../src/services/search-service.js';
import { SqliteVecIndexService } from '../src/services/sqlite-vec-index-service.js';
import { VectorIndexService } from '../src/services/vector-index-service.js';
import { MemoryStore } from '../src/services/memory-store.js';

function createWorkspace(project) {
  return {
    resolveSearchBases(projectPath) {
      return [projectPath || project];
    },
    normalizeTarget(targetPath) {
      return path.resolve(targetPath);
    },
    *walkDirectories(base) {
      const stack = [base];
      while (stack.length > 0) {
        const dir = stack.pop();
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files = [];
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) stack.push(full);
          else files.push(full);
        }
        yield { files };
      }
    },
    isLikelyTextFile() {
      return true;
    },
    safeReadText(filePath) {
      return fs.readFileSync(filePath, 'utf8');
    }
  };
}

function buildSearchFixture(project) {
  const files = {
    'auth/gateway.js': `export async function refreshAuthToken(queue, apiClient) {
  // serialize token refresh requests to avoid duplicate refresh operations
  // retry once after refresh completes in the auth gateway
  return queue.run(async () => apiClient.refresh());
}
`,
    'auth/session.js': `export function attachSession(session, token) {
  // session state and jwt token lifecycle tracking
  session.token = token;
}
`,
    'billing/invoice.js': `export function finalizeInvoice(invoice, ledger) {
  // reconcile payment ledger entries before marking invoice paid
  return ledger.commit(invoice.id);
}
`,
    'ui/dashboard.js': `export function refreshDashboardCards(store) {
  // refresh dashboard widgets after settings save
  return store.reload();
}
`,
    'notes/cooking.md': `How to make tomato pasta
- boil pasta
- prepare garlic and olive oil sauce
- add basil and parmesan
`
  };

  for (const [relativePath, content] of Object.entries(files)) {
    const abs = path.join(project, relativePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
}

function runSearchSuite(label, workspace, project, vectorIndex) {
  const search = new SearchService({
    workspace,
    ignoreDirs: new Set(['node_modules', '.git']),
    hasRipgrep: true,
    rgTimeoutMs: 5000,
    maxFileBytes: 512 * 1024,
    vectorIndex
  });

  const queries = [
    'serialize token refresh requests in gateway auth flow',
    'refreshAuthToken',
    'payment ledger invoice reconciliation',
    'how to cook pasta with basil'
  ];

  return {
    label,
    backend: vectorIndex.getStatus(),
    results: queries.map((query) => {
      const hybrid = search.searchHybrid({
        query,
        projectPath: project,
        allRoots: false,
        glob: '*',
        maxResults: 5,
        caseSensitive: false,
        minSemanticScore: 0.01,
        autoIndex: false
      });

      return {
        query,
        lexical_hits: hybrid.lexical_hits,
        semantic_hits: hybrid.semantic_hits,
        ranking_mode: hybrid.ranking_mode,
        top_type: hybrid.results[0]?.type || null,
        top_file: hybrid.results[0]?.file || null,
        top_rrf: hybrid.results[0]?.rrf_score || null,
        top_semantic_raw: hybrid.results[0]?.semantic_score_raw || null
      };
    })
  };
}

async function runMemorySuite(tempRoot) {
  const store = new MemoryStore({
    enabled: true,
    backend: 'auto',
    dbPath: path.join(tempRoot, 'memory.db')
  });

  for (let i = 0; i < 40; i += 1) {
    await store.storeEntry({
      kind: i % 5 === 0 ? 'preference' : 'knowledge',
      title: i % 7 === 0 ? 'Worked on auth flow' : `Auth memory ${i}`,
      summary: i % 7 === 0
        ? `Remember to serialize token refresh requests in gateway auth path ${i}`
        : `Auth summary ${i} covering token refresh retries and queue behavior`,
      content: `Detailed memory ${i}: queue refresh requests, retry once after refresh, and persist auth state in gateway middleware.`,
      importance: 40 + (i % 50),
      tags: ['auth', 'jwt', `tag-${i % 4}`],
      scope: {
        project_path: '/repo/app',
        topic: 'auth',
        feature: i % 2 === 0 ? 'refresh' : 'session'
      }
    });
  }

  const duplicate = await store.storeEntry({
    kind: 'knowledge',
    title: 'Auth memory 1',
    summary: 'Auth summary 1 covering token refresh retries and queue behavior',
    content: 'Detailed memory 1: queue refresh requests, retry once after refresh, and persist auth state in gateway middleware.',
    tags: ['auth', 'jwt', 'tag-1'],
    scope: { project_path: '/repo/app', topic: 'auth', feature: 'session' }
  });

  const strongEvents = [];
  for (let i = 0; i < 20; i += 1) {
    strongEvents.push(await store.captureEvent({
      event_type: i % 4 === 0 ? 'decision' : i % 3 === 0 ? 'task' : 'bugfix',
      status: i % 5 === 0 ? 'completed' : 'resolved',
      title: i % 6 === 0 ? 'Worked on auth flow' : `Fix auth issue ${i}`,
      summary: i % 6 === 0
        ? `Remember to serialize refresh queue handling in branch ${i}`
        : `Resolved auth refresh issue ${i} in gateway queue handling`,
      content: `Event ${i}: refresh queue fix, retry once, and avoid duplicate token refresh in gateway.`,
      files_changed: 1 + (i % 4),
      has_tests: i % 2 === 0,
      tags: ['auth', 'gateway', `event-${i % 3}`],
      scope: {
        project_path: '/repo/app',
        topic: 'auth',
        feature: 'refresh'
      }
    }));
  }

  const mixedEvents = [];
  for (let i = 0; i < 12; i += 1) {
    const weak = i % 2 === 0;
    mixedEvents.push(await store.captureEvent({
      event_type: weak ? 'task' : 'bugfix',
      status: weak ? 'in_progress' : 'resolved',
      title: weak ? `Looked at auth folder ${i}` : `Fix auth refresh issue ${i}`,
      summary: weak ? 'Explored files to understand layout' : 'Resolved auth refresh queue handling bug',
      content: weak ? 'Opened files and browsed code to understand layout.' : 'Fix refresh queue duplication and retry once after refresh completes.',
      files_changed: weak ? 0 : 2,
      has_tests: weak ? false : true,
      tags: weak ? ['auth'] : ['auth', 'gateway'],
      scope: {
        project_path: '/repo/app',
        topic: 'auth',
        feature: 'refresh'
      }
    }));
  }

  const recall = await store.recall({
    query: 'jwt refresh queue retry gateway fix remember decision',
    projectPath: '/repo/app',
    topic: 'auth',
    feature: 'refresh',
    limit: 10
  });

  const status = await store.getStatus();
  return {
    status,
    duplicate_created: duplicate.created,
    duplicate_flag: duplicate.duplicate,
    strong_promoted_like: strongEvents.filter((item) => ['promoted', 'merged', 'duplicate'].includes(item.status)).length,
    mixed_promoted_like: mixedEvents.filter((item) => ['promoted', 'merged', 'duplicate'].includes(item.status)).length,
    mixed_ignored: mixedEvents.filter((item) => item.status === 'ignored').length,
    recall_count: recall.count,
    top_recall: recall.items.slice(0, 3).map((item) => ({
      score: item.score,
      raw_score: item.raw_score,
      title: item.memory.title,
      feature: item.memory.feature,
      recall_count: item.memory.recall_count
    }))
  };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localnest-stress-'));
  const project = path.join(root, 'app');
  fs.mkdirSync(project, { recursive: true });

  try {
    buildSearchFixture(project);
    const workspace = createWorkspace(project);

    const sqliteIndex = new SqliteVecIndexService({
      workspace,
      dbPath: path.join(root, 'idx.db'),
      sqliteVecExtensionPath: '',
      chunkLines: 20,
      chunkOverlap: 5,
      maxTermsPerChunk: 80,
      maxIndexedFiles: 1000
    });
    sqliteIndex.indexProject({ projectPath: project, allRoots: false, force: true, maxFiles: 1000 });

    const jsonIndex = new VectorIndexService({
      workspace,
      indexPath: path.join(root, 'idx.json'),
      chunkLines: 20,
      chunkOverlap: 5,
      maxTermsPerChunk: 80,
      maxIndexedFiles: 1000
    });
    jsonIndex.indexProject({ projectPath: project, allRoots: false, force: true, maxFiles: 1000 });

    const report = {
      search: {
        sqlite: runSearchSuite('sqlite', workspace, project, sqliteIndex),
        json: runSearchSuite('json', workspace, project, jsonIndex)
      },
      memory: await runMemorySuite(root)
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[stress-localnest] fatal:', error?.message || error);
  process.exit(1);
});
