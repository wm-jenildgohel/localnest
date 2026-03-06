import { tokenize } from '../core/tokenizer.js';

const GENERIC_QUERY_TOKENS = new Set([
  'search', 'config', 'configuration', 'memory', 'index', 'indexing', 'tool',
  'tools', 'server', 'client', 'setup', 'docs', 'documentation', 'query',
  'result', 'results', 'hybrid', 'semantic', 'lexical', 'code', 'file', 'files',
  'project', 'root', 'storage', 'pattern', 'architecture'
]);

export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function globToRegExp(glob) {
  return new RegExp(
    `^${glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')}$`
  );
}

export function validateRegex(pattern) {
  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (e) {
    return { valid: false, reason: e.message };
  }
}

export function buildLineMatcher({ query, useRegex, caseSensitive }) {
  if (useRegex) {
    const regex = new RegExp(query, caseSensitive ? '' : 'i');
    return (line) => regex.test(line);
  }

  if (caseSensitive) {
    return (line) => line.includes(query);
  }

  const normalizedNeedle = query.toLowerCase();
  return (line) => line.toLowerCase().includes(normalizedNeedle);
}

export function scorePathAffinity(filePath, queryTerms) {
  if (!filePath || queryTerms.length === 0) return 0;
  const pathTerms = new Set(tokenize(String(filePath || '')));
  let hits = 0;
  for (const term of queryTerms) {
    if (pathTerms.has(term)) hits += 1;
  }
  return hits / Math.max(1, queryTerms.length);
}

export function isGenericShortQuery(queryTerms) {
  return queryTerms.length > 0 &&
    queryTerms.length <= 2 &&
    queryTerms.every((term) => GENERIC_QUERY_TOKENS.has(term));
}

export function splitPendingContextByLine(pending, matchLine) {
  if (!pending || pending.length === 0) {
    return { before: [], remaining: [] };
  }

  const before = [];
  let splitIdx = pending.length;
  for (let i = 0; i < pending.length; i += 1) {
    const item = pending[i];
    if (item.line < matchLine) {
      before.push(item.text);
      continue;
    }
    splitIdx = i;
    break;
  }

  return {
    before,
    remaining: splitIdx < pending.length ? pending.slice(splitIdx) : []
  };
}

