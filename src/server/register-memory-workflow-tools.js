import { z } from 'zod';

export function registerMemoryWorkflowTools({
  registerJsonTool,
  schemas,
  memory,
  memoryWorkflow
}) {
  const {
    MEMORY_KIND_SCHEMA,
    MEMORY_LINK_SCHEMA,
    MEMORY_EVENT_TYPE_SCHEMA,
    MEMORY_EVENT_STATUS_SCHEMA
  } = schemas;

  registerJsonTool(
    ['localnest_task_context'],
    {
      title: 'Task Context',
      description: 'Bundle runtime status, memory state, and relevant recall for a non-trivial task in one call.',
      inputSchema: {
        query: z.string().optional(),
        task: z.string().optional(),
        root_path: z.string().optional(),
        project_path: z.string().optional(),
        branch_name: z.string().optional(),
        topic: z.string().optional(),
        feature: z.string().optional(),
        kind: MEMORY_KIND_SCHEMA.optional(),
        limit: z.number().int().min(1).max(20).default(8)
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (args) => memoryWorkflow.getTaskContext(args)
  );

  registerJsonTool(
    ['localnest_memory_status'],
    {
      title: 'Memory Status',
      description: 'Return local memory feature status, consent state, and backend compatibility.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async () => memory.getStatus()
  );

  registerJsonTool(
    ['localnest_memory_recall'],
    {
      title: 'Memory Recall',
      description: 'Recall the most relevant local memories for a task or query.',
      inputSchema: {
        query: z.string().min(1),
        root_path: z.string().optional(),
        project_path: z.string().optional(),
        branch_name: z.string().optional(),
        topic: z.string().optional(),
        feature: z.string().optional(),
        kind: MEMORY_KIND_SCHEMA.optional(),
        limit: z.number().int().min(1).max(50).default(10)
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ query, root_path, project_path, branch_name, topic, feature, kind, limit }) => memory.recall({
      query,
      rootPath: root_path,
      projectPath: project_path,
      branchName: branch_name,
      topic,
      feature,
      kind,
      limit
    })
  );

  registerJsonTool(
    ['localnest_capture_outcome'],
    {
      title: 'Capture Outcome',
      description: 'Capture a meaningful task outcome into the memory event pipeline with a simpler payload.',
      inputSchema: {
        task: z.string().optional(),
        title: z.string().optional(),
        summary: z.string().optional(),
        details: z.string().optional(),
        content: z.string().optional(),
        event_type: MEMORY_EVENT_TYPE_SCHEMA,
        status: MEMORY_EVENT_STATUS_SCHEMA.optional(),
        kind: MEMORY_KIND_SCHEMA.optional(),
        importance: z.number().int().min(0).max(100).optional(),
        confidence: z.number().min(0).max(1).optional(),
        files_changed: z.number().int().min(0).max(10000).default(0),
        has_tests: z.boolean().default(false),
        tags: z.array(z.string()).max(50).default([]),
        links: z.array(MEMORY_LINK_SCHEMA).max(50).default([]),
        root_path: z.string().optional(),
        project_path: z.string().optional(),
        branch_name: z.string().optional(),
        topic: z.string().optional(),
        feature: z.string().optional(),
        source_ref: z.string().max(1000).default('')
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (args) => memoryWorkflow.captureOutcome(args)
  );
}
