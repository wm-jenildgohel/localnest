import { z } from 'zod';

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
    const lines = Object.entries(value).map(([key, innerValue]) => (
      `- **${key}**: \`${typeof innerValue === 'string' ? innerValue : JSON.stringify(innerValue)}\``
    ));
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

export function paginateItems(items, limit, offset) {
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

export function buildRipgrepHelpMessage() {
  let install;
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

export function createJsonToolRegistrar(server, responseFormatSchema) {
  return function registerJsonTool(names, { title, description, inputSchema, annotations, markdownTitle }, handler) {
    const canonical = Array.isArray(names) ? names[0] : names;
    const schema = {
      ...inputSchema,
      response_format: responseFormatSchema
    };

    server.registerTool(
      canonical,
      {
        title,
        description,
        inputSchema: schema,
        outputSchema: {
          data: z.any()
        },
        annotations
      },
      async (args, extra) => {
        const incoming = args || {};
        const responseFormat = incoming.response_format || 'json';
        const toolArgs = { ...incoming };
        delete toolArgs.response_format;
        const data = await handler(toolArgs, extra);
        return toolResult(data, responseFormat, markdownTitle || title);
      }
    );
  };
}
