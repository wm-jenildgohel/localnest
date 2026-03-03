import { z } from 'zod';

export const RESPONSE_FORMAT_SCHEMA = z.enum(['json', 'markdown']).default('json');
export const MEMORY_KIND_SCHEMA = z.enum(['knowledge', 'preference']).default('knowledge');
export const MEMORY_STATUS_SCHEMA = z.enum(['active', 'stale', 'archived']).default('active');
export const MEMORY_SCOPE_SCHEMA = z.object({
  root_path: z.string().optional(),
  project_path: z.string().optional(),
  branch_name: z.string().optional(),
  topic: z.string().optional(),
  feature: z.string().optional()
}).default({});
export const MEMORY_LINK_SCHEMA = z.object({
  path: z.string(),
  line: z.number().int().min(1).optional(),
  label: z.string().optional()
});
export const MEMORY_EVENT_TYPE_SCHEMA = z.enum([
  'task',
  'bugfix',
  'decision',
  'review',
  'preference'
]).default('task');
export const MEMORY_EVENT_STATUS_SCHEMA = z.enum([
  'in_progress',
  'completed',
  'resolved',
  'ignored',
  'merged'
]).default('completed');
