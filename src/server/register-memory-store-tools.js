import { z } from 'zod';

export function registerMemoryStoreTools({
  registerJsonTool,
  schemas,
  memory
}) {
  const {
    MEMORY_KIND_SCHEMA,
    MEMORY_STATUS_SCHEMA,
    MEMORY_SCOPE_SCHEMA,
    MEMORY_LINK_SCHEMA,
    MEMORY_EVENT_TYPE_SCHEMA,
    MEMORY_EVENT_STATUS_SCHEMA
  } = schemas;

  registerJsonTool(
    ['localnest_memory_list'],
    {
      title: 'Memory List',
      description: 'List stored memories with optional scope and kind filters.',
      inputSchema: {
        kind: MEMORY_KIND_SCHEMA.optional(),
        status: MEMORY_STATUS_SCHEMA.optional(),
        project_path: z.string().optional(),
        topic: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(20),
        offset: z.number().int().min(0).default(0)
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ kind, status, project_path, topic, limit, offset }) => memory.listEntries({
      kind,
      status,
      projectPath: project_path,
      topic,
      limit,
      offset
    })
  );

  registerJsonTool(
    ['localnest_memory_get'],
    {
      title: 'Memory Get',
      description: 'Fetch one stored memory with revision history.',
      inputSchema: {
        id: z.string().min(1)
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ id }) => {
      const item = await memory.getEntry(id);
      if (!item) {
        throw new Error(`memory not found: ${id}`);
      }
      return item;
    }
  );

  registerJsonTool(
    ['localnest_memory_store'],
    {
      title: 'Memory Store',
      description: 'Store a durable local memory entry.',
      inputSchema: {
        kind: MEMORY_KIND_SCHEMA,
        title: z.string().min(1).max(400),
        summary: z.string().max(4000).default(''),
        content: z.string().min(1).max(20000),
        status: MEMORY_STATUS_SCHEMA,
        importance: z.number().int().min(0).max(100).default(50),
        confidence: z.number().min(0).max(1).default(0.7),
        tags: z.array(z.string()).max(50).default([]),
        links: z.array(MEMORY_LINK_SCHEMA).max(50).default([]),
        scope: MEMORY_SCOPE_SCHEMA,
        source_type: z.string().max(60).default('manual'),
        source_ref: z.string().max(1000).default(''),
        change_note: z.string().max(400).default('Initial memory creation')
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (args) => memory.storeEntry(args)
  );

  registerJsonTool(
    ['localnest_memory_update'],
    {
      title: 'Memory Update',
      description: 'Update a stored memory entry and append a revision.',
      inputSchema: {
        id: z.string().min(1),
        kind: MEMORY_KIND_SCHEMA.optional(),
        title: z.string().min(1).max(400).optional(),
        summary: z.string().max(4000).optional(),
        content: z.string().min(1).max(20000).optional(),
        status: MEMORY_STATUS_SCHEMA.optional(),
        importance: z.number().int().min(0).max(100).optional(),
        confidence: z.number().min(0).max(1).optional(),
        tags: z.array(z.string()).max(50).optional(),
        links: z.array(MEMORY_LINK_SCHEMA).max(50).optional(),
        scope: MEMORY_SCOPE_SCHEMA.optional(),
        source_type: z.string().max(60).optional(),
        source_ref: z.string().max(1000).optional(),
        change_note: z.string().max(400).default('Memory updated')
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ id, ...patch }) => memory.updateEntry(id, patch)
  );

  registerJsonTool(
    ['localnest_memory_delete'],
    {
      title: 'Memory Delete',
      description: 'Delete a stored memory entry and all of its revisions.',
      inputSchema: {
        id: z.string().min(1)
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ id }) => memory.deleteEntry(id)
  );

  registerJsonTool(
    ['localnest_memory_capture_event'],
    {
      title: 'Memory Capture Event',
      description: 'Ingest a background work event and auto-promote meaningful events into durable memory.',
      inputSchema: {
        event_type: MEMORY_EVENT_TYPE_SCHEMA,
        status: MEMORY_EVENT_STATUS_SCHEMA,
        title: z.string().min(1).max(400),
        summary: z.string().max(4000).default(''),
        content: z.string().max(20000).default(''),
        kind: MEMORY_KIND_SCHEMA.optional(),
        importance: z.number().int().min(0).max(100).optional(),
        confidence: z.number().min(0).max(1).optional(),
        files_changed: z.number().int().min(0).max(10000).default(0),
        has_tests: z.boolean().default(false),
        tags: z.array(z.string()).max(50).default([]),
        links: z.array(MEMORY_LINK_SCHEMA).max(50).default([]),
        scope: MEMORY_SCOPE_SCHEMA,
        source_ref: z.string().max(1000).default('')
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (args) => memory.captureEvent(args)
  );

  registerJsonTool(
    ['localnest_memory_events'],
    {
      title: 'Memory Events',
      description: 'List recently captured memory events and whether they were promoted into durable memory.',
      inputSchema: {
        project_path: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(20),
        offset: z.number().int().min(0).default(0)
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ project_path, limit, offset }) => memory.listEvents({
      projectPath: project_path,
      limit,
      offset
    })
  );
}
