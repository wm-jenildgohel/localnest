#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
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
import { WorkspaceService } from './services/workspace-service.js';
import { SearchService } from './services/search-service.js';
import { VectorIndexService } from './services/vector-index-service.js';

if (!process.env.DART_SUPPRESS_ANALYTICS) {
  process.env.DART_SUPPRESS_ANALYTICS = 'true';
}

const runtime = buildRuntimeConfig(process.env);
applyConsolePolicy(runtime.disableConsoleOutput);

const workspace = new WorkspaceService({
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

let activeIndexBackend = runtime.indexBackend;

async function createVectorIndex() {
  if (runtime.indexBackend === 'sqlite-vec') {
    try {
      const { SqliteVecIndexService } = await import('./services/sqlite-vec-index-service.js');
      return new SqliteVecIndexService({
        workspace,
        dbPath: runtime.sqliteDbPath,
        sqliteVecExtensionPath: runtime.sqliteVecExtensionPath,
        chunkLines: runtime.vectorChunkLines,
        chunkOverlap: runtime.vectorChunkOverlap,
        maxTermsPerChunk: runtime.vectorMaxTermsPerChunk,
        maxIndexedFiles: runtime.vectorMaxIndexedFiles
      });
    } catch (error) {
      activeIndexBackend = 'json';
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
    maxIndexedFiles: runtime.vectorMaxIndexedFiles
  });
}

const vectorIndex = await createVectorIndex();

const search = new SearchService({
  workspace,
  ignoreDirs: IGNORE_DIRS,
  hasRipgrep: runtime.hasRipgrep,
  rgTimeoutMs: runtime.rgTimeoutMs,
  maxFileBytes: DEFAULT_MAX_FILE_BYTES,
  vectorIndex
});

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION
});

const RESPONSE_FORMAT_SCHEMA = z.enum(['json', 'markdown']).default('json');

function renderMarkdown(value, heading = 'Result') {
  if (value === null || value === undefined) {
    return `## ${heading}\n\nnull`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return `## ${heading}\n\n- (empty)`;
    const preview = value
      .map((item) => `- \`${JSON.stringify(item)}\``)
      .join('\n');
    return `## ${heading}\n\n${preview}`;
  }
  if (typeof value === 'object') {
    const lines = Object.entries(value).map(([k, v]) => `- **${k}**: \`${typeof v === 'string' ? v : JSON.stringify(v)}\``);
    return `## ${heading}\n\n${lines.join('\n')}`;
  }
  return `## ${heading}\n\n${String(value)}`;
}

function toolResult(data, responseFormat = 'json', markdownTitle = 'Result') {
  const text = responseFormat === 'markdown'
    ? renderMarkdown(data, markdownTitle)
    : JSON.stringify(data, null, 2);
  return {
    structuredContent: { data },
    content: [{ type: 'text', text }]
  };
}

function paginateItems(items, limit, offset) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(1000, limit)) : 100;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;
  const totalCount = items.length;
  const paged = items.slice(safeOffset, safeOffset + safeLimit);
  const nextOffset = safeOffset + safeLimit;
  return {
    total_count: totalCount,
    count: paged.length,
    limit: safeLimit,
    offset: safeOffset,
    has_more: nextOffset < totalCount,
    next_offset: nextOffset < totalCount ? nextOffset : null,
    items: paged
  };
}

function buildRipgrepHelpMessage() {
  let install = 'Install ripgrep (rg), then restart localnest-mcp.';
  if (process.platform === 'win32') {
    install = 'Install ripgrep: winget install BurntSushi.ripgrep.MSVC';
  } else if (process.platform === 'darwin') {
    install = 'Install ripgrep: brew install ripgrep';
  } else {
    install = 'Install ripgrep: sudo apt-get install ripgrep';
  }

  return [
    'ripgrep (rg) is required by localnest-mcp for fast code search.',
    install,
    'If rg is installed but MCP still fails, set PATH in your MCP client env.',
    'Run doctor for detailed checks: npx -y localnest-mcp-doctor'
  ].join(' ');
}

function registerJsonTool(names, { title, description, inputSchema, annotations, markdownTitle }, handler) {
  const toolNames = Array.isArray(names) ? names : [names];
  const schema = {
    ...inputSchema,
    response_format: RESPONSE_FORMAT_SCHEMA
  };

  for (const name of toolNames) {
    server.registerTool(
      name,
      {
        title,
        description,
        inputSchema: schema,
        outputSchema: {
          data: z.any()
        },
        annotations
      },
      async (args) => {
        const incoming = args || {};
        const responseFormat = incoming.response_format || 'json';
        const toolArgs = { ...incoming };
        delete toolArgs.response_format;
        const data = await handler(toolArgs);
        return toolResult(data, responseFormat, markdownTitle || title);
      }
    );
  }
}

registerJsonTool(
  ['localnest_server_status', 'server_status'],
  {
    title: 'Server Status',
    description: 'Return runtime status and active configuration summary for this MCP server.',
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async () => ({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    mode: runtime.mcpMode,
    roots: workspace.listRoots(),
    has_ripgrep: runtime.hasRipgrep,
    search: {
      auto_project_split: runtime.autoProjectSplit,
      max_auto_projects: runtime.maxAutoProjects,
      force_split_children: runtime.forceSplitChildren,
      rg_timeout_ms: runtime.rgTimeoutMs
    },
    vector_index: {
      backend: activeIndexBackend,
      requested_backend: runtime.indexBackend,
      index_path: runtime.vectorIndexPath,
      db_path: runtime.sqliteDbPath,
      chunk_lines: runtime.vectorChunkLines,
      chunk_overlap: runtime.vectorChunkOverlap,
      max_terms_per_chunk: runtime.vectorMaxTermsPerChunk,
      max_indexed_files: runtime.vectorMaxIndexedFiles
    }
  })
);

registerJsonTool(
  ['localnest_usage_guide', 'usage_guide'],
  {
    title: 'Usage Guide',
    description: 'Return concise best-practice guidance for users and AI agents using this MCP.',
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async () => ({
    for_users: [
      'Run localnest_list_roots first to verify active roots.',
      'Use localnest_list_projects to discover projects under a root.',
      'Run localnest_index_project for your active project/root before semantic search.',
      'Use localnest_search_hybrid for low-noise retrieval.',
      'Use localnest_read_file for targeted context windows.'
    ],
    for_ai_agents: [
      'Call localnest_server_status first to understand runtime capabilities.',
      'Call localnest_index_status, then localnest_index_project when index is empty/stale.',
      'To find a module or feature by name (e.g. "SSO", "payments"), use localnest_search_files FIRST — it searches file paths and names, which is faster and more reliable than content search for module discovery.',
      'For acronyms or domain terms (SSO, IAM, CRM), also try synonyms: SSO → oauth, saml, passport, auth. Use localnest_search_files with each variant.',
      'Prefer localnest_search_hybrid with project_path for concept-level content retrieval.',
      'Use localnest_search_code for exact symbol/keyword/regex matches in file contents.',
      'Use all_roots only when cross-project lookup is required.',
      'After retrieval, call localnest_read_file with narrow line ranges.'
    ],
    tool_sequence: [
      'localnest_server_status',
      'localnest_list_roots',
      'localnest_list_projects',
      'localnest_search_files → for module/feature discovery by name',
      'localnest_index_status',
      'localnest_index_project',
      'localnest_search_hybrid → for concept/content retrieval',
      'localnest_read_file'
    ]
  })
);

registerJsonTool(
  ['localnest_list_roots', 'list_roots'],
  {
    title: 'List Roots',
    description: 'List configured local roots available to this MCP server.',
    inputSchema: {
      limit: z.number().int().min(1).max(1000).default(100),
      offset: z.number().int().min(0).default(0)
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async ({ limit, offset }) => paginateItems(workspace.listRoots(), limit, offset)
);

registerJsonTool(
  ['localnest_list_projects', 'list_projects'],
  {
    title: 'List Projects',
    description: 'List first-level project directories under a root.',
    inputSchema: {
      root_path: z.string().optional(),
      max_entries: z.number().int().min(1).max(1000).optional(),
      limit: z.number().int().min(1).max(1000).default(100),
      offset: z.number().int().min(0).default(0)
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async ({ root_path, max_entries, limit, offset }) => {
    const effectiveLimit = max_entries || limit;
    const projects = workspace.listProjects(root_path, 2000);
    const paged = paginateItems(projects, effectiveLimit, offset);
    return {
      ...paged,
      truncated_total: projects.length === 2000
    };
  }
);

registerJsonTool(
  ['localnest_project_tree', 'project_tree'],
  {
    title: 'Project Tree',
    description: 'Return a compact tree of files/directories for a project path.',
    inputSchema: {
      project_path: z.string(),
      max_depth: z.number().int().min(1).max(8).default(3),
      max_entries: z.number().int().min(1).max(10000).default(1500)
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async ({ project_path, max_depth, max_entries }) => workspace.projectTree(project_path, max_depth, max_entries)
);

registerJsonTool(
  ['localnest_index_status', 'index_status'],
  {
    title: 'Index Status',
    description: 'Return local semantic index status and metadata.',
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async () => vectorIndex.getStatus()
);

registerJsonTool(
  ['localnest_index_project', 'index_project'],
  {
    title: 'Index Project',
    description: 'Build or refresh semantic index for a project or across all roots.',
    inputSchema: {
      project_path: z.string().optional(),
      all_roots: z.boolean().default(false),
      force: z.boolean().default(false),
      max_files: z.number().int().min(1).max(200000).default(20000)
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    }
  },
  async ({ project_path, all_roots, force, max_files }) =>
    vectorIndex.indexProject({
      projectPath: project_path,
      allRoots: all_roots,
      force,
      maxFiles: max_files
    })
);

registerJsonTool(
  ['localnest_search_files', 'search_files'],
  {
    title: 'Search Files',
    description: 'Search file paths and names matching a query. Use this first when looking for a module, feature, or component by name (e.g. "sso", "payment", "auth"). Much faster than content search for module discovery, and handles cases where the keyword only appears in file/directory names.',
    inputSchema: {
      query: z.string().min(1),
      project_path: z.string().optional(),
      all_roots: z.boolean().default(false),
      max_results: z.number().int().min(1).max(1000).default(DEFAULT_MAX_RESULTS),
      case_sensitive: z.boolean().default(false)
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async ({ query, project_path, all_roots, max_results, case_sensitive }) =>
    search.searchFiles({
      query,
      projectPath: project_path,
      allRoots: all_roots,
      maxResults: max_results,
      caseSensitive: case_sensitive
    })
);

registerJsonTool(
  ['localnest_search_code', 'search_code'],
  {
    title: 'Search Code',
    description: 'Search text across files under a project/root and return matching lines. Best for exact symbol names, imports, or known identifiers. Use use_regex=true for patterns (e.g. "async\\s+function\\s+get\\w+"). Use context_lines to include surrounding lines with each match.',
    inputSchema: {
      query: z.string().min(1),
      project_path: z.string().optional(),
      all_roots: z.boolean().default(false),
      glob: z.string().default('*'),
      max_results: z.number().int().min(1).max(1000).default(DEFAULT_MAX_RESULTS),
      case_sensitive: z.boolean().default(false),
      context_lines: z.number().int().min(0).max(10).default(0),
      use_regex: z.boolean().default(false)
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async ({ query, project_path, all_roots, glob, max_results, case_sensitive, context_lines, use_regex }) =>
    search.searchCode({
      query,
      projectPath: project_path,
      allRoots: all_roots,
      glob,
      maxResults: max_results,
      caseSensitive: case_sensitive,
      contextLines: context_lines,
      useRegex: use_regex
    })
);

registerJsonTool(
  ['localnest_search_hybrid', 'search_hybrid'],
  {
    title: 'Search Hybrid',
    description: 'Run lexical + semantic retrieval and return RRF-ranked results.',
    inputSchema: {
      query: z.string().min(1),
      project_path: z.string().optional(),
      all_roots: z.boolean().default(false),
      glob: z.string().default('*'),
      max_results: z.number().int().min(1).max(1000).default(DEFAULT_MAX_RESULTS),
      case_sensitive: z.boolean().default(false),
      min_semantic_score: z.number().min(0).max(1).default(0.05)
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async ({ query, project_path, all_roots, glob, max_results, case_sensitive, min_semantic_score }) =>
    search.searchHybrid({
      query,
      projectPath: project_path,
      allRoots: all_roots,
      glob,
      maxResults: max_results,
      caseSensitive: case_sensitive,
      minSemanticScore: min_semantic_score
    })
);

registerJsonTool(
  ['localnest_read_file', 'read_file'],
  {
    title: 'Read File',
    description: 'Read a bounded chunk of a file with line numbers.',
    inputSchema: {
      path: z.string(),
      start_line: z.number().int().min(1).default(1),
      end_line: z.number().int().min(1).default(DEFAULT_MAX_READ_LINES)
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async ({ path, start_line, end_line }) => workspace.readFileChunk(path, start_line, end_line, 800)
);

registerJsonTool(
  ['localnest_summarize_project', 'summarize_project'],
  {
    title: 'Summarize Project',
    description: 'Return a high-level summary of a project directory.',
    inputSchema: {
      project_path: z.string(),
      max_files: z.number().int().min(100).max(20000).default(3000)
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async ({ project_path, max_files }) => workspace.summarizeProject(project_path, max_files)
);

async function main() {
  if (runtime.mcpMode !== 'stdio') {
    throw new Error('Unsupported MCP_MODE. Use MCP_MODE=stdio for MCP clients.');
  }

  // P0-1: downgrade missing ripgrep from fatal to a startup warning.
  // SearchService has a JS filesystem walk fallback for all search paths.
  if (!runtime.hasRipgrep) {
    process.stderr.write(
      `[localnest-mcp] warning: ripgrep (rg) not found — search_code and search_hybrid ` +
      `will use slower JS fallback. ${buildRipgrepHelpMessage()}\n`
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[localnest-mcp] fatal:', error);
  process.exit(1);
});
