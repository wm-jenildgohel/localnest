import fs from 'node:fs';
import path from 'node:path';

function tokenize(text) {
  const matches = text.toLowerCase().match(/[a-z_][a-z0-9_]{1,39}/g);
  return matches || [];
}

function toSparsePairs(tokens, maxTerms) {
  const tf = new Map();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  return Array.from(tf.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTerms);
}

function makeFileSignature(st) {
  return `${st.mtimeMs}:${st.size}`;
}

function isUnderBase(filePath, bases) {
  const abs = path.resolve(filePath);
  return bases.some((base) => {
    const rel = path.relative(base, abs);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  });
}

export class VectorIndexService {
  constructor({
    workspace,
    indexPath,
    chunkLines,
    chunkOverlap,
    maxTermsPerChunk,
    maxIndexedFiles
  }) {
    this.workspace = workspace;
    this.indexPath = indexPath;
    this.chunkLines = chunkLines;
    this.chunkOverlap = chunkOverlap;
    this.maxTermsPerChunk = maxTermsPerChunk;
    this.maxIndexedFiles = maxIndexedFiles;
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
        version: 1,
        updated_at: null,
        total_chunks: 0,
        total_files: 0,
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
    return {
      index_path: this.indexPath,
      version: this.data.version,
      updated_at: this.data.updated_at,
      total_files: this.data.total_files,
      total_chunks: this.data.total_chunks
    };
  }

  indexProject({ projectPath, allRoots, force, maxFiles }) {
    this.ensureLoaded();

    const bases = this.workspace.resolveSearchBases(projectPath, allRoots).map((p) => this.workspace.normalizeTarget(p));
    const files = this.collectFiles(bases, maxFiles);
    const fileSet = new Set(files);

    let processed = 0;
    let skipped = 0;
    let removed = 0;

    for (const filePath of Object.keys(this.data.documents)) {
      if (!isUnderBase(filePath, bases)) continue;
      if (!fileSet.has(filePath)) {
        delete this.data.documents[filePath];
        removed += 1;
      }
    }

    for (const filePath of files) {
      const st = fs.statSync(filePath);
      const signature = makeFileSignature(st);
      const existing = this.data.documents[filePath];

      if (!force && existing && existing.signature === signature) {
        skipped += 1;
        continue;
      }

      const text = this.workspace.safeReadText(filePath);
      const chunks = this.chunkFile(filePath, text);
      this.data.documents[filePath] = { signature, chunks };
      processed += 1;
    }

    this.rebuildStats();
    this.persist();

    return {
      bases,
      scanned_files: files.length,
      indexed_files: processed,
      skipped_files: skipped,
      removed_files: removed,
      total_files: this.data.total_files,
      total_chunks: this.data.total_chunks,
      index_path: this.indexPath
    };
  }

  semanticSearch({ query, projectPath, allRoots, maxResults, minScore }) {
    this.ensureLoaded();
    if (!query || !query.trim()) return [];

    const bases = this.workspace.resolveSearchBases(projectPath, allRoots).map((p) => this.workspace.normalizeTarget(p));
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const queryTfPairs = toSparsePairs(queryTokens, this.maxTermsPerChunk);
    const queryNorm = this.computeNorm(queryTfPairs);
    if (queryNorm === 0) return [];

    const out = [];
    for (const [filePath, doc] of Object.entries(this.data.documents)) {
      if (!isUnderBase(filePath, bases)) continue;
      for (const chunk of doc.chunks || []) {
        const score = this.computeCosine(queryTfPairs, queryNorm, chunk.terms || [], chunk.norm || 0);
        if (score < minScore) continue;
        out.push({
          file: filePath,
          start_line: chunk.start_line,
          end_line: chunk.end_line,
          snippet: chunk.preview,
          semantic_score: score
        });
      }
    }

    out.sort((a, b) => b.semantic_score - a.semantic_score);
    return out.slice(0, maxResults);
  }

  collectFiles(bases, maxFiles) {
    const files = [];
    for (const base of bases) {
      for (const { files: batch } of this.workspace.walkDirectories(base)) {
        for (const filePath of batch) {
          if (!this.workspace.isLikelyTextFile(filePath)) continue;
          files.push(filePath);
          if (files.length >= Math.min(maxFiles, this.maxIndexedFiles)) {
            return files;
          }
        }
      }
    }
    return files;
  }

  chunkFile(filePath, text) {
    const lines = text.split(/\r?\n/);
    const chunks = [];

    const step = Math.max(1, this.chunkLines - this.chunkOverlap);
    for (let start = 1; start <= lines.length; start += step) {
      const end = Math.min(lines.length, start + this.chunkLines - 1);
      const chunkText = lines.slice(start - 1, end).join('\n');
      const tokens = tokenize(chunkText);
      if (tokens.length === 0) continue;

      const terms = toSparsePairs(tokens, this.maxTermsPerChunk);
      chunks.push({
        id: `${filePath}:${start}-${end}`,
        start_line: start,
        end_line: end,
        preview: chunkText.slice(0, 500),
        terms,
        norm: 0
      });
    }

    return chunks;
  }

  rebuildStats() {
    const df = new Map();
    let totalFiles = 0;
    let totalChunks = 0;

    for (const doc of Object.values(this.data.documents)) {
      totalFiles += 1;
      for (const chunk of doc.chunks || []) {
        totalChunks += 1;
        const seen = new Set();
        for (const [term] of chunk.terms || []) {
          if (seen.has(term)) continue;
          seen.add(term);
          df.set(term, (df.get(term) || 0) + 1);
        }
      }
    }

    this.data.df = Object.fromEntries(df.entries());
    this.data.total_files = totalFiles;
    this.data.total_chunks = totalChunks;
    this.data.updated_at = new Date().toISOString();

    for (const doc of Object.values(this.data.documents)) {
      for (const chunk of doc.chunks || []) {
        chunk.norm = this.computeNorm(chunk.terms || []);
      }
    }
  }

  computeNorm(tfPairs) {
    const totalChunks = Math.max(1, this.data.total_chunks || 0);
    let sum = 0;
    for (const [term, tf] of tfPairs) {
      const df = this.data.df?.[term] || 0;
      const idf = Math.log((totalChunks + 1) / (df + 1)) + 1;
      const w = tf * idf;
      sum += w * w;
    }
    return Math.sqrt(sum);
  }

  computeCosine(queryTfPairs, queryNorm, chunkTfPairs, chunkNorm) {
    if (!queryNorm || !chunkNorm) return 0;

    const totalChunks = Math.max(1, this.data.total_chunks || 0);
    const chunkMap = new Map(chunkTfPairs);
    let dot = 0;

    for (const [term, qtf] of queryTfPairs) {
      const ctf = chunkMap.get(term);
      if (!ctf) continue;
      const df = this.data.df?.[term] || 0;
      const idf = Math.log((totalChunks + 1) / (df + 1)) + 1;
      dot += (qtf * idf) * (ctf * idf);
    }

    return dot / (queryNorm * chunkNorm);
  }
}
