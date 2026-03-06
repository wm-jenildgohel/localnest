#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  SERVER_NAME,
  SERVER_VERSION,
  DEFAULT_MAX_READ_LINES,
  DEFAULT_MAX_RESULTS,
  DEFAULT_MAX_FILE_BYTES,
  IGNORE_DIRS,
  PROJECT_MARKER_FILES,
  PROJECT_HINT_DIRS,
  TEXT_EXTENSIONS,
  applyConsolePolicy,
  buildRuntimeConfig
} from './config.js';
import { WorkspaceService } from './services/workspace/service.js';
import { SearchService } from './services/search/service.js';
import { VectorIndexService } from './services/vector-index/service.js';
import { EmbeddingService } from './services/embedding/service.js';
import { AstChunker } from './services/chunker/service.js';
import { RerankerService } from './services/reranker/service.js';
import { UpdateService } from './services/update/service.js';
import { MemoryService } from './services/memory/service.js';
import { MemoryWorkflowService } from './services/memory/workflow.js';
import {
  RESPONSE_FORMAT_SCHEMA,
  MEMORY_KIND_SCHEMA,
  MEMORY_STATUS_SCHEMA,
  MEMORY_SCOPE_SCHEMA,
  MEMORY_LINK_SCHEMA,
  MEMORY_EVENT_TYPE_SCHEMA,
  MEMORY_EVENT_STATUS_SCHEMA
} from './server/common/schemas.js';
import {
  buildRipgrepHelpMessage,
  createJsonToolRegistrar,
  paginateItems
} from './server/common/tool-utils.js';
import { createServerStatusBuilder, buildUsageGuide } from './server/common/status.js';
import { registerCoreTools } from './server/tools/core.js';
import { registerMemoryWorkflowTools } from './server/tools/memory-workflow.js';
import { registerMemoryStoreTools } from './server/tools/memory-store.js';
import { registerRetrievalTools } from './server/tools/retrieval.js';

if (!process.env.DART_SUPPRESS_ANALYTICS) {
  process.env.DART_SUPPRESS_ANALYTICS = 'true';
}

function createWorkspace(runtime) {
  return new WorkspaceService({
    roots: runtime.roots,
    ignoreDirs: IGNORE_DIRS,
    textExtensions: TEXT_EXTENSIONS,
    projectMarkerFiles: PROJECT_MARKER_FILES,
    projectHintDirs: PROJECT_HINT_DIRS,
    extraProjectMarkers: runtime.extraProjectMarkers,
    maxFileBytes: DEFAULT_MAX_FILE_BYTES,
    autoProjectSplit: runtime.autoProjectSplit,
    maxAutoProjects: runtime.maxAutoProjects,
    forceSplitChildren: runtime.forceSplitChildren
  });
}

async function createVectorIndex(runtime, workspace, embeddingService, setActiveBackend) {
  const astChunker = new AstChunker();

  if (runtime.indexBackend === 'sqlite-vec') {
    try {
      const { SqliteVecIndexService } = await import('./services/sqlite-vec/service.js');
      return new SqliteVecIndexService({
        workspace,
        dbPath: runtime.sqliteDbPath,
        sqliteVecExtensionPath: runtime.sqliteVecExtensionPath,
        chunkLines: runtime.vectorChunkLines,
        chunkOverlap: runtime.vectorChunkOverlap,
        maxTermsPerChunk: runtime.vectorMaxTermsPerChunk,
        maxIndexedFiles: runtime.vectorMaxIndexedFiles,
        embeddingService,
        embeddingDimensions: runtime.embeddingDimensions,
        astChunker
      });
    } catch (error) {
      setActiveBackend('json');
      process.stderr.write(
        `[localnest-index] sqlite-vec unavailable on this Node runtime; falling back to json backend. ` +
        `reason=${error?.code || error?.message || 'unknown'}\n`
      );
    }
  }

  return new VectorIndexService({
    workspace,
    indexPath: runtime.vectorIndexPath,
    chunkLines: runtime.vectorChunkLines,
    chunkOverlap: runtime.vectorChunkOverlap,
    maxTermsPerChunk: runtime.vectorMaxTermsPerChunk,
    maxIndexedFiles: runtime.vectorMaxIndexedFiles,
    embeddingService,
    astChunker
  });
}

async function createServices(runtime) {
  const workspace = createWorkspace(runtime);
  const embeddingService = new EmbeddingService({
    provider: runtime.embeddingProvider,
    model: runtime.embeddingModel,
    cacheDir: runtime.embeddingCacheDir
  });
  let activeIndexBackend = runtime.indexBackend;
  const vectorIndex = await createVectorIndex(runtime, workspace, embeddingService, (nextBackend) => {
    activeIndexBackend = nextBackend;
  });
  const search = new SearchService({
    workspace,
    ignoreDirs: IGNORE_DIRS,
    hasRipgrep: runtime.hasRipgrep,
    rgTimeoutMs: runtime.rgTimeoutMs,
    maxFileBytes: DEFAULT_MAX_FILE_BYTES,
    vectorIndex,
    reranker: new RerankerService({
      provider: runtime.rerankerProvider,
      model: runtime.rerankerModel,
      cacheDir: runtime.rerankerCacheDir
    })
  });
  const updates = new UpdateService({
    localnestHome: runtime.localnestHome,
    packageName: runtime.updatePackageName,
    currentVersion: SERVER_VERSION,
    checkIntervalMinutes: runtime.updateCheckIntervalMinutes,
    failureBackoffMinutes: runtime.updateFailureBackoffMinutes
  });
  const memory = new MemoryService({
    localnestHome: runtime.localnestHome,
    enabled: runtime.memoryEnabled,
    backend: runtime.memoryBackend,
    dbPath: runtime.memoryDbPath,
    autoCapture: runtime.memoryAutoCapture,
    consentDone: runtime.memoryConsentDone,
    embeddingService
  });

  return {
    workspace,
    vectorIndex,
    search,
    updates,
    memory,
    getActiveIndexBackend: () => activeIndexBackend
  };
}

function registerTools(server, runtime, services) {
  const registerJsonTool = createJsonToolRegistrar(server, RESPONSE_FORMAT_SCHEMA);
  const buildServerStatus = createServerStatusBuilder({
    serverName: SERVER_NAME,
    serverVersion: SERVER_VERSION,
    runtime,
    workspace: services.workspace,
    memory: services.memory,
    updates: services.updates,
    getActiveIndexBackend: services.getActiveIndexBackend,
    vectorIndex: services.vectorIndex
  });
  const memoryWorkflow = new MemoryWorkflowService({
    memory: services.memory,
    getRuntimeSummary: async () => buildServerStatus()
  });
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
    buildServerStatus,
    buildUsageGuide,
    updates: services.updates
  });

  registerMemoryWorkflowTools({
    registerJsonTool,
    schemas: sharedSchemas,
    memory: services.memory,
    memoryWorkflow
  });

  registerMemoryStoreTools({
    registerJsonTool,
    schemas: sharedSchemas,
    memory: services.memory
  });

  registerRetrievalTools({
    registerJsonTool,
    paginateItems,
    workspace: services.workspace,
    vectorIndex: services.vectorIndex,
    search: services.search,
    defaultMaxReadLines: DEFAULT_MAX_READ_LINES,
    defaultMaxResults: DEFAULT_MAX_RESULTS
  });
}

function startStalenessMonitor(vectorIndex, intervalMinutes) {
  if (!intervalMinutes || intervalMinutes <= 0) return;
  const intervalMs = intervalMinutes * 60 * 1000;
  const timer = setInterval(async () => {
    try {
      const staleness = vectorIndex.checkStaleness();
      if (!staleness.stale) return;
      process.stderr.write(
        `[localnest-sweep] index stale (${staleness.stale_count}/${staleness.total_indexed} files changed) — re-indexing\n`
      );
      await vectorIndex.indexProject({ allRoots: true, force: false });
    } catch (err) {
      process.stderr.write(`[localnest-sweep] error: ${err?.message || err}\n`);
    }
  }, intervalMs);
  timer.unref();
}

async function main() {
  const runtime = buildRuntimeConfig(process.env);
  applyConsolePolicy(runtime.disableConsoleOutput);

  if (runtime.mcpMode !== 'stdio') {
    throw new Error('Unsupported MCP_MODE. Use MCP_MODE=stdio for MCP clients.');
  }

  const services = await createServices(runtime);
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });

  registerTools(server, runtime, services);

  if (!runtime.hasRipgrep) {
    process.stderr.write(
      `[localnest-mcp] warning: ripgrep (rg) not found — search_code and search_hybrid ` +
      `will use slower JS fallback. ${buildRipgrepHelpMessage()}\n`
    );
  }

  services.updates.warmCheck().catch((error) => {
    process.stderr.write(`[localnest-update] warm check failed: ${error?.message || error}\n`);
  });

  startStalenessMonitor(services.vectorIndex, runtime.indexSweepIntervalMinutes);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[localnest-mcp] fatal:', error);
  process.exit(1);
});
