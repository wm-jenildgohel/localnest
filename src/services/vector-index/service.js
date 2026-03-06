import fs from 'node:fs';
import path from 'node:path';
import {
  makeFileSignature,
  isUnderBase,
  collectFiles as collectFilesFn,
  chunkFile as chunkFileFn,
  rebuildStats as rebuildStatsFn,
  semanticSearch as semanticSearchFn
} from './helpers.js';

export class VectorIndexService {
  constructor({
    workspace,
    indexPath,
    chunkLines,
    chunkOverlap,
    maxTermsPerChunk,
    maxIndexedFiles,
    embeddingService,
    astChunker,
    bm25K1 = 1.2,
    bm25B = 0.75
  }) {
    this.workspace = workspace;
    this.indexPath = indexPath;
    this.chunkLines = chunkLines;
    this.chunkOverlap = chunkOverlap;
    this.maxTermsPerChunk = maxTermsPerChunk;
    this.maxIndexedFiles = maxIndexedFiles;
    this.embeddingService = embeddingService || null;
    this.astChunker = astChunker || null;
    this.bm25K1 = bm25K1;
    this.bm25B = bm25B;
    this.data = null;
  }

  ensureLoaded() {
    if (this.data) return;

    try {
      if (fs.existsSync(this.indexPath)) {
        this.data = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
      }
    } catch {
      this.data = null;
    }

    if (!this.data || typeof this.data !== 'object') {
      this.data = {
        version: 2,
        updated_at: null,
        total_chunks: 0,
        total_files: 0,
        avg_chunk_terms: 0,
        df: {},
        documents: {}
      };
    }
  }

  persist() {
    const dir = path.dirname(this.indexPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.indexPath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
  }

  getStatus() {
    this.ensureLoaded();
    const upgradeRecommended = (this.data.total_chunks || 0) > 5000;
    return {
      backend: 'json',
      index_path: this.indexPath,
      version: this.data.version,
      updated_at: this.data.updated_at,
      total_files: this.data.total_files,
      total_chunks: this.data.total_chunks,
      avg_chunk_terms: this.data.avg_chunk_terms,
      upgrade_recommended: upgradeRecommended,
      upgrade_reason: upgradeRecommended
        ? 'json backend with large index; prefer sqlite-vec (Node 22.13+) for production scale'
        : null,
      embedding: this.embeddingService?.getStatus?.() || {
        provider: 'none',
        enabled: false,
        available: false,
        model: null,
        dimensions: null
      },
      ast_chunking: this.astChunker?.getStatus?.() || {
        enabled: false,
        supported_languages: [],
        active_languages: [],
        fallback_languages: [],
        ast_chunks: 0,
        fallback_chunks: 0
      }
    };
  }

  checkStaleness() {
    this.ensureLoaded();
    const docs = this.data?.documents || {};
    let staleCount = 0;
    let deletedCount = 0;
    const entries = Object.entries(docs);
    for (const [filePath, doc] of entries) {
      try {
        const st = fs.statSync(filePath);
        if (makeFileSignature(st) !== doc.signature) staleCount += 1;
      } catch {
        deletedCount += 1;
        staleCount += 1;
      }
    }
    return { stale: staleCount > 0, stale_count: staleCount, deleted_count: deletedCount, total_indexed: entries.length };
  }

  async indexProject({ projectPath, allRoots, force, maxFiles, onProgress }) {
    this.ensureLoaded();

    const bases = this.workspace.resolveSearchBases(projectPath, allRoots).map((p) => this.workspace.normalizeTarget(p));
    const files = this.collectFiles(bases, maxFiles);
    const fileSet = new Set(files);
    const total = files.length;
    let completed = 0;

    let processed = 0;
    let skipped = 0;
    let removed = 0;
    const failedFiles = [];

    for (const filePath of Object.keys(this.data.documents)) {
      if (!isUnderBase(filePath, bases)) continue;
      if (!fileSet.has(filePath)) {
        delete this.data.documents[filePath];
        removed += 1;
      }
    }

    for (const filePath of files) {
      try {
        const st = fs.statSync(filePath);
        const signature = makeFileSignature(st);
        const existing = this.data.documents[filePath];

        if (!force && existing && existing.signature === signature) {
          skipped += 1;
          continue;
        }

        const text = this.workspace.safeReadText(filePath);
        const chunks = await this.chunkFile(filePath, text);
        this.data.documents[filePath] = { signature, chunks };
        processed += 1;
      } catch (err) {
        failedFiles.push({ path: filePath, error: String(err?.message || err) });
      } finally {
        completed += 1;
        if (typeof onProgress === 'function') {
          await onProgress({ scanned: completed, total, phase: 'indexing_files' });
        }
      }
    }

    this.rebuildStats();
    if (typeof onProgress === 'function') {
      await onProgress({ scanned: total, total, phase: 'rebuilding_stats' });
    }
    this.persist();

    return {
      bases,
      scanned_files: files.length,
      indexed_files: processed,
      skipped_files: skipped,
      removed_files: removed,
      failed_files: failedFiles,
      total_files: this.data.total_files,
      total_chunks: this.data.total_chunks,
      index_path: this.indexPath,
      embedding: this.embeddingService?.getStatus?.() || null
    };
  }

  async semanticSearch({ query, projectPath, allRoots, maxResults, minScore }) {
    return semanticSearchFn(this, { query, projectPath, allRoots, maxResults, minScore });
  }

  collectFiles(bases, maxFiles) {
    return collectFilesFn(this, bases, maxFiles);
  }

  async chunkFile(filePath, text) {
    return chunkFileFn(this, filePath, text);
  }

  rebuildStats() {
    return rebuildStatsFn(this);
  }
}
