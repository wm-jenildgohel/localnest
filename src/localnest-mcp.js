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

const search = new SearchService({
  workspace,
  ignoreDirs: IGNORE_DIRS,
  hasRipgrep: runtime.hasRipgrep,
  rgTimeoutMs: runtime.rgTimeoutMs,
  maxFileBytes: DEFAULT_MAX_FILE_BYTES
});

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION
});

function toolResult(data) {
  return {
    structuredContent: { data },
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
  };
}

function registerJsonTool(name, { title, description, inputSchema }, handler) {
  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema,
      outputSchema: {
        data: z.any()
      }
    },
    async (args) => toolResult(await handler(args || {}))
  );
}

registerJsonTool(
  'server_status',
  {
    title: 'Server Status',
    description: 'Return runtime status and active configuration summary for this MCP server.',
    inputSchema: {}
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
    }
  })
);

registerJsonTool(
  'usage_guide',
  {
    title: 'Usage Guide',
    description: 'Return concise best-practice guidance for users and AI agents using this MCP.',
    inputSchema: {}
  },
  async () => ({
    for_users: [
      'Run list_roots first to verify active roots.',
      'Use list_projects to discover projects under a root.',
      'Use project_tree before deep searches to reduce noise.',
      'Use read_file for targeted context windows.'
    ],
    for_ai_agents: [
      'Call server_status first to understand runtime capabilities.',
      'Prefer search_code with project_path for precision.',
      'Use all_roots only when cross-project lookup is required.',
      'After search_code, call read_file with narrow line ranges.'
    ],
    tool_sequence: [
      'server_status',
      'list_roots',
      'list_projects',
      'project_tree',
      'search_code',
      'read_file'
    ]
  })
);

registerJsonTool(
  'list_roots',
  {
    title: 'List Roots',
    description: 'List configured local roots available to this MCP server.',
    inputSchema: {}
  },
  async () => workspace.listRoots()
);

registerJsonTool(
  'list_projects',
  {
    title: 'List Projects',
    description: 'List first-level project directories under a root.',
    inputSchema: {
      root_path: z.string().optional(),
      max_entries: z.number().int().min(1).max(2000).default(300)
    }
  },
  async ({ root_path, max_entries }) => workspace.listProjects(root_path, max_entries)
);

registerJsonTool(
  'project_tree',
  {
    title: 'Project Tree',
    description: 'Return a compact tree of files/directories for a project path.',
    inputSchema: {
      project_path: z.string(),
      max_depth: z.number().int().min(1).max(8).default(3),
      max_entries: z.number().int().min(1).max(10000).default(1500)
    }
  },
  async ({ project_path, max_depth, max_entries }) => workspace.projectTree(project_path, max_depth, max_entries)
);

registerJsonTool(
  'search_code',
  {
    title: 'Search Code',
    description: 'Search text across files under a project/root and return matching lines.',
    inputSchema: {
      query: z.string().min(1),
      project_path: z.string().optional(),
      all_roots: z.boolean().default(false),
      glob: z.string().default('*'),
      max_results: z.number().int().min(1).max(1000).default(DEFAULT_MAX_RESULTS),
      case_sensitive: z.boolean().default(false)
    }
  },
  async ({ query, project_path, all_roots, glob, max_results, case_sensitive }) =>
    search.searchCode({
      query,
      projectPath: project_path,
      allRoots: all_roots,
      glob,
      maxResults: max_results,
      caseSensitive: case_sensitive
    })
);

registerJsonTool(
  'read_file',
  {
    title: 'Read File',
    description: 'Read a bounded chunk of a file with line numbers.',
    inputSchema: {
      path: z.string(),
      start_line: z.number().int().min(1).default(1),
      end_line: z.number().int().min(1).default(DEFAULT_MAX_READ_LINES)
    }
  },
  async ({ path, start_line, end_line }) => workspace.readFileChunk(path, start_line, end_line, 800)
);

registerJsonTool(
  'summarize_project',
  {
    title: 'Summarize Project',
    description: 'Return a high-level summary of a project directory.',
    inputSchema: {
      project_path: z.string(),
      max_files: z.number().int().min(100).max(20000).default(3000)
    }
  },
  async ({ project_path, max_files }) => workspace.summarizeProject(project_path, max_files)
);

async function main() {
  if (runtime.mcpMode !== 'stdio') {
    throw new Error('Unsupported MCP_MODE. Use MCP_MODE=stdio for MCP clients.');
  }
  if (!runtime.hasRipgrep) {
    throw new Error('ripgrep (rg) is required. Install rg and restart localnest-mcp.');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[localnest-mcp] fatal:', error);
  process.exit(1);
});
