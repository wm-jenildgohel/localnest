#!/usr/bin/env node
import { SERVER_VERSION } from '../src/config.js';

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  process.stdout.write(`${SERVER_VERSION}\n`);
  process.exit(0);
}

await import('../src/localnest-mcp.js');
