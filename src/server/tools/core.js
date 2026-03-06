import { z } from 'zod';

export function registerCoreTools({
  registerJsonTool,
  buildServerStatus,
  buildUsageGuide,
  updates
}) {
  registerJsonTool(
    'localnest_server_status',
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
    async () => buildServerStatus()
  );

  registerJsonTool(
    'localnest_usage_guide',
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
    async () => buildUsageGuide()
  );

  registerJsonTool(
    ['localnest_update_status'],
    {
      title: 'Update Status',
      description: 'Check npm for the latest localnest-mcp version (cached, default every 120 minutes).',
      inputSchema: {
        force_check: z.boolean().default(false)
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ force_check }) => updates.getStatus({ force: force_check })
  );

  registerJsonTool(
    ['localnest_update_self'],
    {
      title: 'Update Self',
      description: 'Update localnest-mcp globally via npm and sync bundled skill. Requires explicit user approval.',
      inputSchema: {
        approved_by_user: z.boolean().default(false),
        dry_run: z.boolean().default(false),
        version: z.string().default('latest'),
        reinstall_skill: z.boolean().default(true)
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async ({ approved_by_user, dry_run, version, reinstall_skill }) => updates.selfUpdate({
      approvedByUser: approved_by_user,
      dryRun: dry_run,
      version,
      reinstallSkill: reinstall_skill
    })
  );
}
