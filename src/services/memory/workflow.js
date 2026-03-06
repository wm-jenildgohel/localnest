function cleanText(value, maxLength = 0) {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!maxLength || normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength).trim();
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const cleaned = cleanText(value, 200);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out.slice(0, 50);
}

function deriveQuery(input) {
  return cleanText(
    input.query ||
    input.task ||
    input.title ||
    input.summary ||
    input.details ||
    input.content,
    500
  );
}

function defaultEventStatus(eventType, explicitStatus) {
  const cleaned = cleanText(explicitStatus, 40);
  if (cleaned) return cleaned;
  return eventType === 'bugfix' ? 'resolved' : 'completed';
}

function compactMemoryStatus(status) {
  return {
    enabled: status.enabled,
    auto_capture: status.auto_capture,
    consent_done: status.consent_done,
    backend_available: status.backend?.available || false,
    requested_backend: status.backend?.requested || status.requested_backend,
    selected_backend: status.backend?.selected || null,
    total_entries: status.store?.total_entries || 0,
    total_events: status.store?.total_events || 0
  };
}

export class MemoryWorkflowService {
  constructor({ memory, getRuntimeSummary = null }) {
    this.memory = memory;
    this.getRuntimeSummary = getRuntimeSummary;
  }

  async getTaskContext(input = {}) {
    const query = deriveQuery(input);
    const memoryStatus = await this.memory.getStatus();
    const runtime = this.getRuntimeSummary ? await this.getRuntimeSummary() : null;
    const memorySummary = compactMemoryStatus(memoryStatus);
    const canRecall = memorySummary.enabled && memorySummary.backend_available;

    let recall = {
      attempted: false,
      skipped_reason: ''
    };

    if (!query) {
      recall.skipped_reason = 'empty_query';
    } else if (!memorySummary.enabled) {
      recall.skipped_reason = 'memory_disabled';
    } else if (!memorySummary.backend_available) {
      recall.skipped_reason = 'backend_unavailable';
    } else {
      const recalled = await this.memory.recall({
        query,
        rootPath: input.root_path || input.rootPath,
        projectPath: input.project_path || input.projectPath,
        branchName: input.branch_name || input.branchName,
        topic: input.topic,
        feature: input.feature,
        kind: input.kind,
        limit: input.limit
      });
      recall = {
        attempted: true,
        skipped_reason: '',
        ...recalled
      };
    }

    const guidance = canRecall
      ? [
        'Use recalled items as hints, then verify them with search/read tools before concluding.',
        recall.attempted && recall.count > 0
          ? 'Relevant project memory was found; check the linked files and current code before reusing the prior approach.'
          : 'No matching memory was found; continue with retrieval tools and capture the outcome if the work produces durable knowledge.'
      ]
      : [
        'Memory is disabled or unavailable on this runtime; rely on retrieval tools only.'
      ];

    return {
      query,
      scope: {
        root_path: input.root_path || input.rootPath || '',
        project_path: input.project_path || input.projectPath || '',
        branch_name: input.branch_name || input.branchName || '',
        topic: input.topic || '',
        feature: input.feature || ''
      },
      runtime,
      memory: memorySummary,
      recall,
      guidance
    };
  }

  async captureOutcome(input = {}) {
    const memoryStatus = await this.memory.getStatus();
    const runtime = this.getRuntimeSummary ? await this.getRuntimeSummary() : null;
    const memorySummary = compactMemoryStatus(memoryStatus);

    if (!memorySummary.enabled) {
      return {
        captured: false,
        skipped_reason: 'memory_disabled',
        runtime,
        memory: memorySummary
      };
    }

    if (!memorySummary.backend_available) {
      return {
        captured: false,
        skipped_reason: 'backend_unavailable',
        runtime,
        memory: memorySummary
      };
    }

    const eventType = cleanText(input.event_type || input.eventType || input.outcome_type || 'task', 60) || 'task';
    const task = cleanText(input.task || input.title, 400);
    const summary = cleanText(input.summary, 4000);
    const details = cleanText(input.details || input.content, 20000);
    const fallbackContent = cleanText([summary, details, task].filter(Boolean).join('. '), 20000);

    if (!task && !summary && !details) {
      throw new Error('task, summary, or details is required');
    }

    const captureInput = {
      event_type: eventType,
      status: defaultEventStatus(eventType, input.status),
      title: task || summary || details,
      summary,
      content: details || fallbackContent,
      kind: input.kind,
      importance: input.importance,
      confidence: input.confidence,
      files_changed: input.files_changed ?? input.filesChanged ?? 0,
      has_tests: input.has_tests ?? input.hasTests ?? false,
      tags: uniqueStrings([
        ...(input.tags || []),
        input.topic,
        input.feature
      ]),
      links: Array.isArray(input.links) ? input.links.slice(0, 50) : [],
      scope: {
        root_path: input.root_path || input.rootPath,
        project_path: input.project_path || input.projectPath,
        branch_name: input.branch_name || input.branchName,
        topic: input.topic,
        feature: input.feature
      },
      source_ref: cleanText(input.source_ref || input.sourceRef, 1000)
    };

    const result = await this.memory.captureEvent(captureInput);
    return {
      captured: true,
      runtime,
      memory: memorySummary,
      event: captureInput,
      result
    };
  }
}
