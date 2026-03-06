import { DECL_TYPES_BY_LANG } from './languages.js';

export function summarizeImports(text, languageId) {
  const lines = String(text || '').split(/\r?\n/);
  const imports = [];

  const push = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    imports.push(trimmed.slice(0, 140));
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (imports.length >= 12) break;

    if (['javascript', 'typescript', 'tsx'].includes(languageId)) {
      if (/^import\s+/.test(trimmed) || /^const\s+\w+\s*=\s*require\(/.test(trimmed)) push(line);
      continue;
    }
    if (languageId === 'python') {
      if (/^(import\s+|from\s+\S+\s+import\s+)/.test(trimmed)) push(line);
      continue;
    }
    if (languageId === 'go') {
      if (/^import\s+/.test(trimmed) || trimmed === 'import (') push(line);
      continue;
    }
    if (languageId === 'rust') {
      if (/^use\s+/.test(trimmed) || /^mod\s+/.test(trimmed)) push(line);
      continue;
    }
    if (['java', 'kotlin', 'scala'].includes(languageId)) {
      if (/^import\s+/.test(trimmed) || /^package\s+/.test(trimmed)) push(line);
      continue;
    }
    if (languageId === 'csharp') {
      if (/^using\s+/.test(trimmed) || /^namespace\s+/.test(trimmed)) push(line);
      continue;
    }
    if (languageId === 'php') {
      if (/^use\s+/.test(trimmed) || /^require(_once)?\s*/.test(trimmed) || /^include(_once)?\s*/.test(trimmed)) push(line);
      continue;
    }
    if (languageId === 'swift') {
      if (/^import\s+/.test(trimmed)) push(line);
      continue;
    }
    if (languageId === 'ruby') {
      if (/^require\s+/.test(trimmed) || /^require_relative\s+/.test(trimmed)) push(line);
      continue;
    }
    if (languageId === 'lua') {
      if (/^local\s+\w+\s*=\s*require\(/.test(trimmed)) push(line);
      continue;
    }
    if (languageId === 'dart') {
      if (/^import\s+/.test(trimmed) || /^part\s+/.test(trimmed)) push(line);
      continue;
    }
  }

  return imports.join(' | ');
}

export function getNodeName(node) {
  if (!node) return '';
  try {
    const named = typeof node.childForFieldName === 'function' ? node.childForFieldName('name') : null;
    if (named && typeof named.text === 'string' && named.text.trim()) return named.text.trim();
  } catch {
    // no-op
  }

  const stack = [node];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) continue;
    if (cur.type === 'identifier' && typeof cur.text === 'string' && cur.text.trim()) {
      return cur.text.trim();
    }
    if (Array.isArray(cur.namedChildren)) {
      for (let i = cur.namedChildren.length - 1; i >= 0; i -= 1) {
        stack.push(cur.namedChildren[i]);
      }
    }
  }
  return '';
}

export function buildScopePath(node, languageId) {
  const declTypes = DECL_TYPES_BY_LANG[languageId] || new Set();
  const parts = [];
  let cur = node;
  while (cur) {
    if (declTypes.has(cur.type)) {
      const name = getNodeName(cur);
      if (name) parts.push(name);
    }
    cur = cur.parent || null;
  }
  return parts.reverse().join(' > ');
}

export function makeLineSlices(lines, chunkLines, chunkOverlap) {
  const slices = [];
  const step = Math.max(1, chunkLines - chunkOverlap);
  for (let start = 1; start <= lines.length; start += step) {
    const end = Math.min(lines.length, start + chunkLines - 1);
    const rawText = lines.slice(start - 1, end).join('\n');
    if (rawText.trim()) {
      slices.push({
        start_line: start,
        end_line: end,
        raw_text: rawText,
        semantic_text: rawText,
        scope_path: ''
      });
    }
  }
  return slices;
}
