import { tokenize, toSparsePairs } from '../core/tokenizer.js';

export function collectFiles(workspace, bases, maxFiles, maxIndexedFiles) {
  const files = [];
  for (const base of bases) {
    for (const { files: batch } of workspace.walkDirectories(base)) {
      for (const filePath of batch) {
        if (!workspace.isLikelyTextFile(filePath)) continue;
        files.push(filePath);
        if (files.length >= Math.min(maxFiles, maxIndexedFiles)) {
          return files;
        }
      }
    }
  }
  return files;
}

export async function chunkFile(filePath, text, { astChunker, embeddingService, chunkLines, chunkOverlap, maxTermsPerChunk }) {
  const lines = text.split(/\r?\n/);
  const chunks = [];
  const chunkTexts = [];

  const slices = astChunker
    ? await astChunker.chunk({ filePath, text, chunkLines, chunkOverlap })
    : null;

  const effectiveSlices = Array.isArray(slices) && slices.length > 0
    ? slices
    : (() => {
      const step = Math.max(1, chunkLines - chunkOverlap);
      const out = [];
      for (let start = 1; start <= lines.length; start += step) {
        const end = Math.min(lines.length, start + chunkLines - 1);
        const rawText = lines.slice(start - 1, end).join('\n');
        out.push({ start_line: start, end_line: end, raw_text: rawText, semantic_text: rawText });
      }
      return out;
    })();

  for (const slice of effectiveSlices) {
    const chunkText = slice.raw_text;
    const semanticText = slice.semantic_text || slice.raw_text;
    const tokens = tokenize(semanticText);
    if (tokens.length === 0) continue;
    const terms = toSparsePairs(tokens, maxTermsPerChunk);
    const termCount = terms.reduce((sum, [, tf]) => sum + (Number(tf) || 0), 0);
    chunks.push({
      id: `${filePath}:${slice.start_line}-${slice.end_line}`,
      start_line: slice.start_line,
      end_line: slice.end_line,
      preview: chunkText.slice(0, 500),
      terms,
      term_count: Math.max(1, termCount),
      embedding: null,
      norm: 0
    });
    chunkTexts.push(semanticText);
  }

  if (embeddingService?.isEnabled?.() && chunks.length > 0) {
    try {
      const embeddings = await embeddingService.embedBatch(chunkTexts);
      for (let i = 0; i < chunks.length; i += 1) {
        if (Array.isArray(embeddings[i]) && embeddings[i].length > 0) {
          chunks[i].embedding = embeddings[i];
        }
      }
    } catch {
      // Fallback BM25 remains available.
    }
  }

  return chunks;
}
