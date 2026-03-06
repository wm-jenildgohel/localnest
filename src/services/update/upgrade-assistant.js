function getByPath(obj, dotPath) {
  if (!obj || typeof obj !== 'object') return undefined;
  return dotPath.split('.').reduce((acc, part) => {
    if (acc === undefined || acc === null) return undefined;
    return acc[part];
  }, obj);
}

function hasValue(value, type) {
  if (type === 'array') return Array.isArray(value) && value.length > 0;
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'number') return Number.isFinite(value);
  if (type === 'string') return typeof value === 'string' && value.trim() !== '';
  return value !== undefined && value !== null && value !== '';
}

export const REQUIRED_SETUP_FIELDS = [
  { path: 'roots', label: 'project roots', type: 'array' },
  { path: 'index.backend', label: 'index backend', type: 'string' },
  { path: 'index.dbPath', label: 'SQLite DB path', type: 'string' },
  { path: 'index.indexPath', label: 'JSON index path', type: 'string' },
  { path: 'memory.enabled', label: 'memory enabled flag', type: 'boolean' },
  { path: 'memory.backend', label: 'memory backend', type: 'string' },
  { path: 'memory.dbPath', label: 'memory DB path', type: 'string' },
  { path: 'memory.autoCapture', label: 'memory auto-capture flag', type: 'boolean' },
  { path: 'memory.askForConsentDone', label: 'memory consent marker', type: 'boolean' }
];

export function findMissingRequiredSetupFields(config) {
  return REQUIRED_SETUP_FIELDS.filter((field) => !hasValue(getByPath(config, field.path), field.type));
}

export function normalizeUpgradeConfig({ existingConfig, defaults }) {
  const existing = existingConfig && typeof existingConfig === 'object' ? existingConfig : {};
  const roots = Array.isArray(existing.roots) && existing.roots.length > 0
    ? existing.roots
    : defaults.roots;

  const index = {
    backend: existing.index?.backend || defaults.index.backend,
    dbPath: existing.index?.dbPath || defaults.index.dbPath,
    indexPath: existing.index?.indexPath || defaults.index.indexPath,
    chunkLines: Number.isFinite(existing.index?.chunkLines) ? existing.index.chunkLines : defaults.index.chunkLines,
    chunkOverlap: Number.isFinite(existing.index?.chunkOverlap) ? existing.index.chunkOverlap : defaults.index.chunkOverlap,
    maxTermsPerChunk: Number.isFinite(existing.index?.maxTermsPerChunk)
      ? existing.index.maxTermsPerChunk
      : defaults.index.maxTermsPerChunk,
    maxIndexedFiles: Number.isFinite(existing.index?.maxIndexedFiles)
      ? existing.index.maxIndexedFiles
      : defaults.index.maxIndexedFiles,
    embeddingProvider: existing.index?.embeddingProvider || defaults.index.embeddingProvider,
    embeddingModel: existing.index?.embeddingModel || defaults.index.embeddingModel,
    embeddingCacheDir: existing.index?.embeddingCacheDir || defaults.index.embeddingCacheDir,
    embeddingDimensions: Number.isFinite(existing.index?.embeddingDimensions)
      ? existing.index.embeddingDimensions
      : defaults.index.embeddingDimensions,
    rerankerProvider: existing.index?.rerankerProvider || defaults.index.rerankerProvider,
    rerankerModel: existing.index?.rerankerModel || defaults.index.rerankerModel,
    rerankerCacheDir: existing.index?.rerankerCacheDir || defaults.index.rerankerCacheDir
  };

  const memoryEnabled = typeof existing.memory?.enabled === 'boolean'
    ? existing.memory.enabled
    : defaults.memory.enabled;
  const memory = {
    enabled: memoryEnabled,
    backend: existing.memory?.backend || defaults.memory.backend,
    dbPath: existing.memory?.dbPath || defaults.memory.dbPath,
    autoCapture: typeof existing.memory?.autoCapture === 'boolean'
      ? existing.memory.autoCapture
      : memoryEnabled,
    askForConsentDone: typeof existing.memory?.askForConsentDone === 'boolean'
      ? existing.memory.askForConsentDone
      : defaults.memory.askForConsentDone
  };

  return {
    roots,
    index,
    memory
  };
}
