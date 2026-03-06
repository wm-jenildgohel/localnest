import { LANG_BY_EXT, DECL_TYPES_BY_LANG, LANGUAGE_LOADERS, getExt } from './languages.js';
import { summarizeImports, buildScopePath, makeLineSlices } from './ast-utils.js';

export class AstChunker {
  constructor() {
    this.parserModulePromise = null;
    this.languagePromises = new Map();
    this.parserByLanguage = new Map();
    this.treeSitterUnavailable = false;
    this.activeLanguages = new Set();
    this.fallbackLanguages = new Set();
    this.stats = {
      ast_chunks: 0,
      fallback_chunks: 0
    };
  }

  resolveLanguageId(filePath) {
    return LANG_BY_EXT[getExt(filePath)] || null;
  }

  async getParserModule() {
    if (this.treeSitterUnavailable) return null;
    if (!this.parserModulePromise) {
      this.parserModulePromise = import('tree-sitter').catch(() => {
        this.treeSitterUnavailable = true;
        return null;
      });
    }
    return this.parserModulePromise;
  }

  async getLanguage(languageId) {
    if (this.languagePromises.has(languageId)) return this.languagePromises.get(languageId);

    const loader = LANGUAGE_LOADERS[languageId];
    if (!loader) {
      this.languagePromises.set(languageId, Promise.resolve(null));
      return null;
    }

    const promise = loader().catch(() => null);
    this.languagePromises.set(languageId, promise);
    return promise;
  }

  async getParser(languageId) {
    if (this.parserByLanguage.has(languageId)) return this.parserByLanguage.get(languageId);

    const parserModule = await this.getParserModule();
    if (!parserModule) return null;
    const Parser = parserModule.default || parserModule;
    if (!Parser) return null;

    const language = await this.getLanguage(languageId);
    if (!language) {
      this.fallbackLanguages.add(languageId);
      return null;
    }

    const parser = new Parser();
    parser.setLanguage(language);
    this.parserByLanguage.set(languageId, parser);
    this.activeLanguages.add(languageId);
    return parser;
  }

  collectCandidateNodes(root, languageId) {
    const declTypes = DECL_TYPES_BY_LANG[languageId] || new Set();
    const nodes = [];
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) continue;
      if (declTypes.has(node.type)) nodes.push(node);
      if (Array.isArray(node.namedChildren)) {
        for (let i = node.namedChildren.length - 1; i >= 0; i -= 1) {
          stack.push(node.namedChildren[i]);
        }
      }
    }
    return nodes;
  }

  toAstSlices({ filePath, text, chunkLines, chunkOverlap }) {
    const languageId = this.resolveLanguageId(filePath);
    if (!languageId) return null;

    return this.buildAstSlices({ filePath, text, chunkLines, chunkOverlap, languageId });
  }

  async buildAstSlices({ text, chunkLines, chunkOverlap, languageId }) {
    try {
      const parser = await this.getParser(languageId);
      if (!parser) return null;

      const lines = String(text || '').split(/\r?\n/);
      const tree = parser.parse(String(text || ''));
      const root = tree?.rootNode;
      if (!root) return null;

      const importSummary = summarizeImports(text, languageId);
      const candidates = this.collectCandidateNodes(root, languageId)
        .map((node) => {
          const start = (node.startPosition?.row ?? 0) + 1;
          const end = (node.endPosition?.row ?? 0) + 1;
          const span = end - start + 1;
          return {
            start_line: start,
            end_line: end,
            span,
            scope_path: buildScopePath(node, languageId)
          };
        })
        .filter((item) => item.span >= 2)
        .sort((a, b) => a.start_line - b.start_line || a.end_line - b.end_line);

      if (candidates.length === 0) return null;

      const slices = [];
      const maxSpan = Math.max(chunkLines * 3, chunkLines + chunkOverlap);
      for (const item of candidates) {
        if (item.end_line < item.start_line) continue;

        if (item.span <= maxSpan) {
          const rawText = lines.slice(item.start_line - 1, item.end_line).join('\n');
          if (!rawText.trim()) continue;
          const semanticText = [
            item.scope_path ? `scope_path: ${item.scope_path}` : '',
            importSummary ? `imports: ${importSummary}` : '',
            rawText
          ].filter(Boolean).join('\n');
          slices.push({
            start_line: item.start_line,
            end_line: item.end_line,
            raw_text: rawText,
            semantic_text: semanticText,
            scope_path: item.scope_path
          });
          continue;
        }

        const partSlices = makeLineSlices(
          lines.slice(item.start_line - 1, item.end_line),
          chunkLines,
          chunkOverlap
        );
        for (const part of partSlices) {
          const start = item.start_line + part.start_line - 1;
          const end = item.start_line + part.end_line - 1;
          const semanticText = [
            item.scope_path ? `scope_path: ${item.scope_path}` : '',
            importSummary ? `imports: ${importSummary}` : '',
            part.raw_text
          ].filter(Boolean).join('\n');
          slices.push({
            start_line: start,
            end_line: end,
            raw_text: part.raw_text,
            semantic_text: semanticText,
            scope_path: item.scope_path
          });
        }
      }

      if (slices.length === 0) return null;

      const deduped = [];
      const seen = new Set();
      for (const item of slices) {
        const key = `${item.start_line}:${item.end_line}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
      }
      this.activeLanguages.add(languageId);
      this.stats.ast_chunks += deduped.length;
      return deduped;
    } catch {
      this.fallbackLanguages.add(languageId);
      return null;
    }
  }

  async chunk({ filePath, text, chunkLines, chunkOverlap }) {
    const lines = String(text || '').split(/\r?\n/);
    const astSlices = await this.toAstSlices({ filePath, text, chunkLines, chunkOverlap });
    if (Array.isArray(astSlices) && astSlices.length > 0) return astSlices;
    const languageId = this.resolveLanguageId(filePath);
    if (languageId) this.fallbackLanguages.add(languageId);
    const fallback = makeLineSlices(lines, chunkLines, chunkOverlap);
    this.stats.fallback_chunks += fallback.length;
    return fallback;
  }

  getStatus() {
    return {
      enabled: !this.treeSitterUnavailable,
      supported_languages: Object.keys(LANGUAGE_LOADERS),
      active_languages: Array.from(this.activeLanguages).sort(),
      fallback_languages: Array.from(this.fallbackLanguages).sort(),
      ast_chunks: this.stats.ast_chunks,
      fallback_chunks: this.stats.fallback_chunks
    };
  }
}
