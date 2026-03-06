function buildMemoryGuidance(status) {
  if (status.enabled && (status.backend?.available || false)) {
    return [
      'For non-trivial debugging, implementation, review, or repeated project work: call localnest_task_context before deeper analysis.',
      'After meaningful fixes, decisions, review findings, or user preference discoveries: call localnest_capture_outcome.',
      'Do not use memory in place of file evidence; verify with search/read tools before concluding.'
    ];
  }

  return [
    'Memory is unavailable or disabled; rely on retrieval tools only unless the user opts in during setup.'
  ];
}

export function createServerStatusBuilder({
  serverName,
  serverVersion,
  runtime,
  workspace,
  memory,
  updates,
  getActiveIndexBackend,
  vectorIndex
}) {
  async function buildMemorySummary() {
    const status = await memory.getStatus();
    return {
      enabled: status.enabled,
      auto_capture: status.auto_capture,
      consent_done: status.consent_done,
      backend_available: status.backend?.available || false,
      requested_backend: status.backend?.requested || status.requested_backend,
      selected_backend: status.backend?.selected || null,
      total_entries: status.store?.total_entries || 0,
      total_events: status.store?.total_events || 0,
      guidance: buildMemoryGuidance(status)
    };
  }

  return async function buildServerStatus() {
    const indexStatus = vectorIndex?.getStatus?.() || null;
    return {
      name: serverName,
      version: serverVersion,
      mode: runtime.mcpMode,
      roots: workspace.listRoots(),
      has_ripgrep: runtime.hasRipgrep,
      memory: await buildMemorySummary(),
      search: {
        auto_project_split: runtime.autoProjectSplit,
        max_auto_projects: runtime.maxAutoProjects,
        force_split_children: runtime.forceSplitChildren,
        rg_timeout_ms: runtime.rgTimeoutMs
      },
      vector_index: {
        backend: getActiveIndexBackend(),
        requested_backend: runtime.indexBackend,
        index_path: runtime.vectorIndexPath,
        db_path: runtime.sqliteDbPath,
        chunk_lines: runtime.vectorChunkLines,
        chunk_overlap: runtime.vectorChunkOverlap,
        max_terms_per_chunk: runtime.vectorMaxTermsPerChunk,
        max_indexed_files: runtime.vectorMaxIndexedFiles,
        embedding_provider: runtime.embeddingProvider,
        embedding_model: runtime.embeddingModel,
        embedding_dimensions: runtime.embeddingDimensions,
        reranker_provider: runtime.rerankerProvider,
        reranker_model: runtime.rerankerModel,
        upgrade_recommended: indexStatus?.upgrade_recommended || false,
        upgrade_reason: indexStatus?.upgrade_reason || null
      },
      updates: await updates.getStatus({ force: false })
    };
  };
}

export function buildUsageGuide() {
  return {
    for_users: [
      'Run localnest_list_roots first to verify active roots.',
      'Use localnest_list_projects to discover projects under a root.',
      'Run localnest_index_project for your active project/root before semantic search.',
      'Use localnest_search_hybrid for low-noise retrieval.',
      'Use localnest_read_file for targeted context windows.',
      'Use localnest_task_context for one-call runtime + memory context before non-trivial work.',
      'Use localnest_capture_outcome for one-call outcome capture after meaningful work.',
      'Use localnest_memory_status to verify whether local memory is enabled and supported on this runtime.',
      'Use localnest_memory_capture_event to preserve durable project decisions and preferences after meaningful work.',
      'Use localnest_update_status when you need to verify whether a newer stable version is available.'
    ],
    for_ai_agents: [
      'Call localnest_server_status first to understand runtime capabilities.',
      'Prefer localnest_task_context for non-trivial debugging, implementation, review, and repeated repo work because it bundles runtime status, memory state, and recall in one call.',
      'Treat localnest_capture_outcome as the default post-task memory path after meaningful work when memory is enabled.',
      'To find a module or feature by name (e.g. "SSO", "payments"), use localnest_search_files FIRST — it searches file paths and names, which is faster and more reliable than content search for module discovery.',
      'Use localnest_search_code for exact symbol/keyword/regex matches in file contents.',
      'Call localnest_index_status, then localnest_index_project when index is empty/stale.',
      'For acronyms or domain terms (SSO, IAM, CRM), also try synonyms: SSO → oauth, saml, passport, auth. Use localnest_search_files with each variant.',
      'Prefer localnest_search_hybrid with project_path for concept-level content retrieval. It auto-indexes once per scope when semantic index is empty (auto_index=true).',
      'If you need lower-level control, call localnest_memory_status only when the task is substantive or memory-specific, and use localnest_memory_recall only when memory is enabled.',
      'Emit localnest_memory_capture_event only when you need lower-level event control; explicit tool calls are allowed even if auto-capture is off.',
      'Good capture events include: bug fixed, design decision made, review finding confirmed, user preference discovered, or reusable repo workflow learned.',
      'Bad capture events include: browsing files, exploratory reading, dead-end investigation, or trivial one-shot lookups.',
      'Use all_roots only when cross-project lookup is required.',
      'After retrieval, call localnest_read_file with narrow line ranges.',
      'If updates.is_outdated=true in server status, ask user for approval and then call localnest_update_self with approved_by_user=true.'
    ],
    quality_playbook: [
      'Never answer from memory when a LocalNest tool can verify the claim.',
      'For bug/debug tasks: run both localnest_search_code (exact) and localnest_search_hybrid (context).',
      'If results are empty, retry with synonyms and then use localnest_search_code with use_regex=true.',
      'Always cite concrete file paths and line ranges after localnest_read_file before conclusions.'
    ],
    tool_sequence: [
      'localnest_server_status',
      'localnest_list_roots',
      'localnest_list_projects',
      'localnest_search_files → for module/feature discovery by name',
      'localnest_search_code → for exact identifiers and errors',
      'localnest_index_status',
      'localnest_index_project',
      'localnest_search_hybrid → for concept/content retrieval',
      'localnest_read_file',
      'localnest_task_context → preferred one-call runtime + memory context for substantive tasks',
      'localnest_capture_outcome → preferred one-call outcome capture after meaningful work',
      'localnest_memory_status → only when memory is relevant',
      'localnest_memory_recall → only when memory is enabled and the task is substantive',
      'localnest_memory_capture_event → after meaningful work',
      'localnest_update_status',
      'localnest_update_self (only after user approval)'
    ]
  };
}
