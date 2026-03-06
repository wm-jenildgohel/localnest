import crypto from 'node:crypto';
import { tokenize } from '../core/tokenizer.js';

export function nowIso() {
  return new Date().toISOString();
}

export function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function cleanString(value, maxLength = 0) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!maxLength || trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength).trim();
}

export function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function truncateText(value, maxLength) {
  const normalized = normalizeWhitespace(value);
  if (!normalized || normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function firstSentence(value, maxLength = 240) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return '';
  const sentence = normalized.split(/(?<=[.!?])\s+/)[0] || normalized;
  return truncateText(sentence.replace(/[.!?]+$/, ''), maxLength);
}

export function looksGenericTitle(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) return true;
  if (normalized.length < 10) return true;
  if (/^(task|update|progress|work|fix|bugfix|review|decision|note|memory|change|done|completed|wip|misc|issue)$/.test(normalized)) {
    return true;
  }
  return /^(looked at|worked on|checked|updated|fixed issue|misc|progress on)\b/.test(normalized);
}

export function humanizeLabel(value) {
  const cleaned = normalizeWhitespace(String(value || '').replace(/[_-]+/g, ' '));
  if (!cleaned) return '';
  return cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function deriveSummary(summary, content) {
  const explicit = truncateText(summary, 4000);
  if (explicit) return explicit;
  return truncateText(firstSentence(content, 280), 4000);
}

export function deriveTitle({ title, summary, content, eventType, scope }) {
  const explicit = truncateText(title, 400);
  if (explicit && !looksGenericTitle(explicit)) return explicit;

  const fromSummary = firstSentence(summary, 120);
  if (fromSummary && !looksGenericTitle(fromSummary)) return truncateText(fromSummary, 400);

  const fromContent = firstSentence(content, 120);
  if (fromContent && !looksGenericTitle(fromContent)) return truncateText(fromContent, 400);

  const scopeLabel = humanizeLabel(scope.feature || scope.topic);
  const eventLabel = humanizeLabel(eventType || 'memory');
  return truncateText(`${eventLabel}${scopeLabel ? ` for ${scopeLabel}` : ''}`, 400) || 'Project memory';
}

export function ensureArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 50);
}

export function stableJson(value) {
  return JSON.stringify(value || []);
}

export function normalizeScope(scope = {}) {
  return {
    root_path: cleanString(scope.root_path || scope.rootPath),
    project_path: cleanString(scope.project_path || scope.projectPath),
    branch_name: cleanString(scope.branch_name || scope.branchName, 200),
    topic: cleanString(scope.topic, 200),
    feature: cleanString(scope.feature, 200)
  };
}

export function normalizeLinks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      path: cleanString(item.path, 4000),
      line: Number.isFinite(item.line) ? item.line : null,
      label: cleanString(item.label, 200)
    }))
    .filter((item) => item.path)
    .slice(0, 50);
}

export function makeFingerprint({ kind, title, summary, content, scope, tags }) {
  const payload = [
    cleanString(kind, 40).toLowerCase(),
    cleanString(title, 400).toLowerCase(),
    cleanString(summary, 4000).toLowerCase(),
    cleanString(content, 20000).toLowerCase(),
    scope.project_path.toLowerCase(),
    scope.topic.toLowerCase(),
    scope.feature.toLowerCase(),
    ensureArray(tags).join('|').toLowerCase()
  ].join('\n');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function generateMemoryId() {
  return `mem_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function splitTerms(query) {
  return tokenize(String(query || '')).slice(0, 20);
}

export function buildSearchTerms({ title, summary, content, scope, tags, links, sourceRef }) {
  return Array.from(new Set(tokenize([
    title,
    summary,
    content,
    scope.root_path,
    scope.project_path,
    scope.branch_name,
    scope.topic,
    scope.feature,
    ensureArray(tags).join(' '),
    normalizeLinks(links).map((item) => `${item.label || ''} ${item.path}`).join(' '),
    sourceRef
  ].join('\n')))).slice(0, 200);
}

export function hasStrongMemorySignal(text) {
  return /fix|resolved|decided|remember|always|never|prefer|constraint|important|must|should/.test(text);
}

export function looksExploratory(text) {
  return /explor|looked at|opened files|read files|investigat|inspect|understand layout|browsed|scanned/.test(text);
}

export function scoreTokenOverlap(queryTerms, candidateTerms) {
  if (queryTerms.length === 0 || candidateTerms.length === 0) return 0;
  const candidateSet = new Set(candidateTerms);
  let hits = 0;
  for (const term of queryTerms) {
    if (candidateSet.has(term)) hits += 1;
  }
  return hits / Math.max(1, queryTerms.length);
}

export function textContainsAllTerms(text, terms) {
  const haystack = String(text || '').toLowerCase();
  return terms.length > 0 && terms.every((term) => haystack.includes(term));
}

export function normalizeRecallScore(rawScore) {
  const numeric = Number(rawScore);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return 1 - Math.exp(-numeric / 12);
}

export function scoreScopeMatch(row, scope = {}) {
  let score = 0;
  if (scope.project_path && row.scope_project_path === scope.project_path) score += 3;
  if (scope.topic && row.topic === scope.topic) score += 2;
  if (scope.feature && row.feature === scope.feature) score += 1.5;
  if (scope.branch_name && row.scope_branch_name === scope.branch_name) score += 1;
  if (scope.root_path && row.scope_root_path === scope.root_path) score += 1;
  return score;
}

export function computeMemorySimilarity(a, b) {
  const aTerms = new Set(buildSearchTerms(a));
  const bTerms = new Set(buildSearchTerms(b));
  if (aTerms.size === 0 || bTerms.size === 0) return 0;

  let intersection = 0;
  for (const term of aTerms) {
    if (bTerms.has(term)) intersection += 1;
  }
  return intersection / Math.max(aTerms.size, bTerms.size);
}

export function deserializeEntry(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    content: row.content,
    status: row.status,
    importance: row.importance,
    confidence: row.confidence,
    scope_root_path: row.scope_root_path,
    scope_project_path: row.scope_project_path,
    scope_branch_name: row.scope_branch_name,
    topic: row.topic,
    feature: row.feature,
    tags: JSON.parse(row.tags_json || '[]'),
    links: JSON.parse(row.links_json || '[]'),
    source_type: row.source_type,
    source_ref: row.source_ref,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_recalled_at: row.last_recalled_at,
    recall_count: row.recall_count
  };
}
