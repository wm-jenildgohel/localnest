import test from 'node:test';
import assert from 'node:assert/strict';
import { createJsonToolRegistrar, paginateItems } from '../src/server/common/tool-utils.js';
import { registerCoreTools } from '../src/server/tools/core.js';
import { registerMemoryWorkflowTools } from '../src/server/tools/memory-workflow.js';
import { registerMemoryStoreTools } from '../src/server/tools/memory-store.js';
import { registerRetrievalTools } from '../src/server/tools/retrieval.js';
import {
  RESPONSE_FORMAT_SCHEMA,
  MEMORY_KIND_SCHEMA,
  MEMORY_STATUS_SCHEMA,
  MEMORY_SCOPE_SCHEMA,
  MEMORY_LINK_SCHEMA,
  MEMORY_EVENT_TYPE_SCHEMA,
  MEMORY_EVENT_STATUS_SCHEMA
} from '../src/server/common/schemas.js';

function makeFakeServer() {
  const tools = new Map();
  return {
    tools,
    registerTool(name, meta, handler) {
      tools.set(name, { meta, handler });
    }
  };
}

function makeFixture() {
  const calls = [];
  const mark = (name, payload) => {
    calls.push({ name, payload });
  };

  const workspace = {
    listRoots: () => [{ label: 'root', path: '/tmp/root' }],
    listProjects: () => [{ path: '/tmp/root/p1' }, { path: '/tmp/root/p2' }],
    projectTree: (projectPath) => ({ project_path: projectPath, entries: [] }),
    readFileChunk: (filePath, start, end) => ({ path: filePath, start_line: start, end_line: end, lines: [] }),
    summarizeProject: (projectPath) => ({ project_path: projectPath, summary: 'ok' })
  };

  const vectorIndex = {
    getStatus: () => ({ backend: 'sqlite-vec', total_files: 1, upgrade_recommended: false, upgrade_reason: null }),
    indexProject: async (args) => {
      mark('indexProject', args);
      return { indexed_files: 1, failed_files: [] };
    }
  };

  const search = {
    searchFiles: (args) => {
      mark('searchFiles', args);
      return [{ file: '/tmp/root/a.js', relative_path: 'a.js', name: 'a.js' }];
    },
    searchCode: (args) => {
      mark('searchCode', args);
      return [{ file: '/tmp/root/a.js', line: 1, text: 'const a = 1;' }];
    },
    searchHybrid: async (args) => {
      mark('searchHybrid', args);
      return { query: args.query, lexical_hits: 1, semantic_hits: 1, ranking_mode: 'hybrid', results: [] };
    },
    getSymbol: (args) => {
      mark('getSymbol', args);
      return { symbol: args.symbol, count: 1, definitions: [], exports: [] };
    },
    findUsages: (args) => {
      mark('findUsages', args);
      return { symbol: args.symbol, count: 1, usages: [] };
    }
  };

  const updates = {
    getStatus: async ({ force }) => {
      mark('updateStatus', { force });
      return { current: '0.0.0', latest: '0.0.1', is_outdated: true };
    },
    selfUpdate: async (args) => {
      mark('selfUpdate', args);
      return { ok: true, ...args };
    }
  };

  const memory = {
    getStatus: async () => ({ enabled: true, backend: { available: true }, store: { total_entries: 1, total_events: 1 } }),
    recall: async (args) => {
      mark('memoryRecall', args);
      return { count: 1, items: [] };
    },
    listEntries: async (args) => {
      mark('memoryList', args);
      return { count: 1, items: [{ id: 'm1' }] };
    },
    getEntry: async (id) => {
      mark('memoryGet', { id });
      return id === 'missing' ? null : { id, title: 'entry' };
    },
    storeEntry: async (args) => {
      mark('memoryStore', args);
      return { id: 'm2', created: true };
    },
    updateEntry: async (id, patch) => {
      mark('memoryUpdate', { id, patch });
      return { id, updated: true };
    },
    deleteEntry: async (id) => {
      mark('memoryDelete', { id });
      return { id, deleted: true };
    },
    captureEvent: async (args) => {
      mark('memoryCaptureEvent', args);
      return { id: 'e1', status: 'promoted' };
    },
    listEvents: async (args) => {
      mark('memoryEvents', args);
      return { count: 1, items: [{ id: 'e1' }] };
    },
    suggestRelations: async (id, opts) => {
      mark('memorySuggestRelations', { id, opts });
      return { id, source_title: 'test', count: 0, threshold: opts?.threshold || 0.55, using_embeddings: false, suggestions: [] };
    },
    addRelation: async (sourceId, targetId, relationType) => {
      mark('memoryAddRelation', { sourceId, targetId, relationType });
      return { source_id: sourceId, target_id: targetId, relation_type: relationType };
    },
    removeRelation: async (sourceId, targetId) => {
      mark('memoryRemoveRelation', { sourceId, targetId });
      return { removed: true, source_id: sourceId, target_id: targetId };
    },
    getRelated: async (id) => {
      mark('memoryRelated', { id });
      return { id, count: 0, related: [] };
    }
  };

  const memoryWorkflow = {
    getTaskContext: async (args) => {
      mark('taskContext', args);
      return { query: args.query || '', status: 'ok' };
    },
    captureOutcome: async (args) => {
      mark('captureOutcome', args);
      return { captured: true, event_type: args.event_type || 'task' };
    }
  };

  return {
    calls,
    workspace,
    vectorIndex,
    search,
    updates,
    memory,
    memoryWorkflow
  };
}

test('MCP tools register and execute across all tool groups', async () => {
  const server = makeFakeServer();
  const fixture = makeFixture();
  const registerJsonTool = createJsonToolRegistrar(server, RESPONSE_FORMAT_SCHEMA);

  const sharedSchemas = {
    MEMORY_KIND_SCHEMA,
    MEMORY_STATUS_SCHEMA,
    MEMORY_SCOPE_SCHEMA,
    MEMORY_LINK_SCHEMA,
    MEMORY_EVENT_TYPE_SCHEMA,
    MEMORY_EVENT_STATUS_SCHEMA
  };

  registerCoreTools({
    registerJsonTool,
    buildServerStatus: async () => ({ name: 'localnest', version: 'test' }),
    buildUsageGuide: () => ({ for_users: ['a'], for_ai_agents: ['b'] }),
    updates: fixture.updates
  });
  registerMemoryWorkflowTools({
    registerJsonTool,
    schemas: sharedSchemas,
    memory: fixture.memory,
    memoryWorkflow: fixture.memoryWorkflow
  });
  registerMemoryStoreTools({
    registerJsonTool,
    schemas: sharedSchemas,
    memory: fixture.memory
  });
  registerRetrievalTools({
    registerJsonTool,
    paginateItems,
    workspace: fixture.workspace,
    vectorIndex: fixture.vectorIndex,
    search: fixture.search,
    defaultMaxReadLines: 400,
    defaultMaxResults: 100
  });

  const expected = [
    'localnest_server_status',
    'localnest_usage_guide',
    'localnest_update_status',
    'localnest_update_self',
    'localnest_task_context',
    'localnest_memory_status',
    'localnest_memory_recall',
    'localnest_capture_outcome',
    'localnest_memory_list',
    'localnest_memory_get',
    'localnest_memory_store',
    'localnest_memory_update',
    'localnest_memory_delete',
    'localnest_memory_capture_event',
    'localnest_memory_events',
    'localnest_memory_suggest_relations',
    'localnest_memory_add_relation',
    'localnest_memory_remove_relation',
    'localnest_memory_related',
    'localnest_list_roots',
    'localnest_list_projects',
    'localnest_project_tree',
    'localnest_index_status',
    'localnest_embed_status',
    'localnest_index_project',
    'localnest_search_files',
    'localnest_search_code',
    'localnest_search_hybrid',
    'localnest_get_symbol',
    'localnest_find_usages',
    'localnest_read_file',
    'localnest_summarize_project'
  ];

  const registered = Array.from(server.tools.keys());
  assert.deepEqual(registered.sort(), expected.sort());
  for (const name of expected) {
    assert.ok(server.tools.get(name)?.meta?.outputSchema);
  }

  const notifications = [];
  const makeExtra = (progressToken = undefined) => ({
    _meta: progressToken === undefined ? {} : { progressToken },
    sendNotification: async (notification) => {
      notifications.push(notification);
    }
  });
  const run = async (name, args = {}, extra = makeExtra()) => server.tools.get(name).handler(args, extra);

  assert.equal((await run('localnest_server_status')).structuredContent.data.name, 'localnest');
  assert.ok((await run('localnest_usage_guide', { response_format: 'markdown' })).content[0].text.includes('##'));
  assert.equal((await run('localnest_update_status', { force_check: true })).structuredContent.data.is_outdated, true);
  assert.equal((await run('localnest_update_self', { approved_by_user: true, dry_run: true, version: 'latest', reinstall_skill: true })).structuredContent.data.ok, true);

  assert.equal((await run('localnest_task_context', { query: 'q' })).structuredContent.data.status, 'ok');
  assert.equal((await run('localnest_memory_status')).structuredContent.data.enabled, true);
  assert.equal((await run('localnest_memory_recall', { query: 'auth' })).structuredContent.data.count, 1);
  assert.equal((await run('localnest_capture_outcome', { event_type: 'task', title: 'x' })).structuredContent.data.captured, true);
  assert.equal((await run('localnest_memory_list', { limit: 10, offset: 0 })).structuredContent.data.count, 1);
  assert.equal((await run('localnest_memory_get', { id: 'm1' })).structuredContent.data.id, 'm1');
  await assert.rejects(() => run('localnest_memory_get', { id: 'missing' }), /memory not found/);
  assert.equal((await run('localnest_memory_store', { kind: 'knowledge', title: 't', summary: '', content: 'c', status: 'active', importance: 50, confidence: 0.7, tags: [], links: [], scope: {}, source_type: 'manual', source_ref: '', change_note: 'init' })).structuredContent.data.created, true);
  assert.equal((await run('localnest_memory_update', { id: 'm1', change_note: 'u' })).structuredContent.data.updated, true);
  assert.equal((await run('localnest_memory_delete', { id: 'm1' })).structuredContent.data.deleted, true);
  assert.equal((await run('localnest_memory_capture_event', { event_type: 'task', status: 'completed', title: 'evt', summary: '', content: '', kind: 'knowledge', importance: 50, confidence: 0.7, files_changed: 0, has_tests: false, tags: [], links: [], scope: {}, source_ref: '' })).structuredContent.data.status, 'promoted');
  assert.equal((await run('localnest_memory_events', { limit: 10, offset: 0 })).structuredContent.data.count, 1);
  assert.equal((await run('localnest_memory_suggest_relations', { id: 'm1', threshold: 0.6, max_results: 5 })).structuredContent.data.count, 0);
  assert.equal((await run('localnest_memory_add_relation', { source_id: 'm1', target_id: 'm2', relation_type: 'related' })).structuredContent.data.source_id, 'm1');
  assert.equal((await run('localnest_memory_remove_relation', { source_id: 'm1', target_id: 'm2' })).structuredContent.data.removed, true);
  assert.equal((await run('localnest_memory_related', { id: 'm1' })).structuredContent.data.count, 0);

  assert.equal((await run('localnest_list_roots', { limit: 10, offset: 0 })).structuredContent.data.count, 1);
  assert.equal((await run('localnest_list_projects', { limit: 10, offset: 0 })).structuredContent.data.count, 2);
  assert.equal((await run('localnest_project_tree', { project_path: '/tmp/root', max_depth: 2, max_entries: 10 })).structuredContent.data.project_path, '/tmp/root');
  assert.equal((await run('localnest_index_status')).structuredContent.data.backend, 'sqlite-vec');
  assert.equal((await run('localnest_embed_status')).structuredContent.data.backend, 'sqlite-vec');
  assert.equal((await run('localnest_index_project', { project_path: '/tmp/root', all_roots: false, force: false, max_files: 10 }, makeExtra('token-1'))).structuredContent.data.indexed_files, 1);
  assert.equal((await run('localnest_search_files', { query: 'a', project_path: '/tmp/root', all_roots: false, max_results: 5, case_sensitive: false })).structuredContent.data[0].name, 'a.js');
  assert.equal((await run('localnest_search_code', { query: 'const', project_path: '/tmp/root', all_roots: false, glob: '*', max_results: 5, case_sensitive: false, context_lines: 0, use_regex: false })).structuredContent.data[0].line, 1);
  assert.equal((await run('localnest_search_hybrid', { query: 'auth', project_path: '/tmp/root', all_roots: false, glob: '*', max_results: 5, case_sensitive: false, min_semantic_score: 0, auto_index: false })).structuredContent.data.ranking_mode, 'hybrid');
  assert.equal((await run('localnest_get_symbol', { symbol: 'AuthService', project_path: '/tmp/root', all_roots: false, glob: '*', max_results: 5, case_sensitive: false })).structuredContent.data.symbol, 'AuthService');
  assert.equal((await run('localnest_find_usages', { symbol: 'AuthService', project_path: '/tmp/root', all_roots: false, glob: '*', max_results: 5, case_sensitive: false, context_lines: 1 })).structuredContent.data.symbol, 'AuthService');
  assert.equal((await run('localnest_read_file', { path: '/tmp/root/a.js', start_line: 1, end_line: 5 })).structuredContent.data.path, '/tmp/root/a.js');
  assert.equal((await run('localnest_summarize_project', { project_path: '/tmp/root', max_files: 100 })).structuredContent.data.summary, 'ok');

  assert.ok(fixture.calls.some((c) => c.name === 'indexProject'));
  assert.ok(fixture.calls.some((c) => c.name === 'searchHybrid'));
  assert.ok(fixture.calls.some((c) => c.name === 'getSymbol'));
  assert.ok(fixture.calls.some((c) => c.name === 'findUsages'));
  assert.ok(fixture.calls.some((c) => c.name === 'memoryStore'));
  assert.ok(fixture.calls.some((c) => c.name === 'memorySuggestRelations'));
  assert.ok(fixture.calls.some((c) => c.name === 'memoryAddRelation'));
  assert.ok(fixture.calls.some((c) => c.name === 'memoryRelated'));
  assert.ok(notifications.some((n) => n.method === 'notifications/progress'));
});
