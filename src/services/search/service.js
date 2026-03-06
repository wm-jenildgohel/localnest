import { tokenize } from '../core/tokenizer.js';
import {
  normalizeSymbolInput,
  buildSymbolWordPattern,
  buildDefinitionPattern,
  classifySymbolLine
} from '../core/symbol-search.js';
import {
  searchCode as runSearchCode,
  fastSearchWithRipgrep as runFastSearchWithRipgrep,
  searchFiles as runSearchFiles
} from './lexical-search.js';
import { isGenericShortQuery } from './query-utils.js';
import { fuseRankAndRerank } from './hybrid-ranking.js';
import { maybeBootstrapSemanticIndex } from './auto-index.js';

export class SearchService {
  constructor({
    workspace,
    ignoreDirs,
    hasRipgrep,
    rgTimeoutMs,
    maxFileBytes,
    vectorIndex,
    reranker,
    rerankerMinCandidates = 15,
    rerankerTopN = 25
  }) {
    this.workspace = workspace;
    this.ignoreDirs = ignoreDirs;
    this.hasRipgrep = hasRipgrep;
    this.rgTimeoutMs = rgTimeoutMs;
    this.maxFileBytes = maxFileBytes;
    this.vectorIndex = vectorIndex;
    this.reranker = reranker || null;
    this.rerankerMinCandidates = Math.max(1, rerankerMinCandidates);
    this.rerankerTopN = Math.max(1, rerankerTopN);
    this.autoIndexedScopes = new Set();
    this.defaultAutoIndexMaxFiles = 20000;
  }

  searchCode({ query, projectPath, allRoots, glob, maxResults, caseSensitive, contextLines = 0, useRegex = false }) {
    return runSearchCode({
      workspace: this.workspace,
      hasRipgrep: this.hasRipgrep,
      query,
      projectPath,
      allRoots,
      glob,
      maxResults,
      caseSensitive,
      contextLines,
      useRegex,
      fastSearchWithRipgrepFn: (args) => this.fastSearchWithRipgrep(args)
    });
  }

  fastSearchWithRipgrep({ query, base, glob, caseSensitive, maxResults, contextLines = 0, useRegex = false }) {
    return runFastSearchWithRipgrep({
      query,
      base,
      glob,
      caseSensitive,
      maxResults,
      contextLines,
      useRegex,
      maxFileBytes: this.maxFileBytes,
      ignoreDirs: this.ignoreDirs,
      rgTimeoutMs: this.rgTimeoutMs
    });
  }

  searchFiles({ query, projectPath, allRoots, maxResults, caseSensitive }) {
    return runSearchFiles({
      workspace: this.workspace,
      hasRipgrep: this.hasRipgrep,
      ignoreDirs: this.ignoreDirs,
      rgTimeoutMs: this.rgTimeoutMs,
      query,
      projectPath,
      allRoots,
      maxResults,
      caseSensitive
    });
  }

  getSymbol({ symbol, projectPath, allRoots, glob = '*', maxResults = 100, caseSensitive = false }) {
    const normalized = normalizeSymbolInput(symbol);
    if (!normalized) throw new Error('symbol is required');

    const rows = this.searchCode({
      query: buildDefinitionPattern(normalized),
      projectPath,
      allRoots,
      glob,
      maxResults,
      caseSensitive,
      useRegex: true,
      contextLines: 0
    });

    const definitions = [];
    const exports = [];
    for (const row of rows) {
      const classification = classifySymbolLine(row.text, normalized);
      const item = {
        file: row.file,
        start_line: row.line,
        end_line: row.line,
        text: row.text
      };
      if (classification === 'definition') definitions.push(item);
      if (/\bexport\b|module\.exports|exports\./i.test(row.text)) exports.push(item);
    }

    return {
      symbol: normalized,
      count: rows.length,
      definitions,
      exports
    };
  }

  findUsages({ symbol, projectPath, allRoots, glob = '*', maxResults = 200, caseSensitive = false, contextLines = 0 }) {
    const normalized = normalizeSymbolInput(symbol);
    if (!normalized) throw new Error('symbol is required');

    const rows = this.searchCode({
      query: buildSymbolWordPattern(normalized),
      projectPath,
      allRoots,
      glob,
      maxResults,
      caseSensitive,
      useRegex: true,
      contextLines
    });

    const usages = [];
    for (const row of rows) {
      const kind = classifySymbolLine(row.text, normalized);
      if (kind !== 'call' && kind !== 'import') continue;
      usages.push({
        file: row.file,
        line: row.line,
        kind,
        text: row.text,
        ...(Array.isArray(row.context_before) ? { context_before: row.context_before } : {}),
        ...(Array.isArray(row.context_after) ? { context_after: row.context_after } : {})
      });
    }

    return {
      symbol: normalized,
      count: usages.length,
      usages
    };
  }

  async searchHybrid({
    query,
    projectPath,
    allRoots,
    glob,
    maxResults,
    caseSensitive,
    minSemanticScore,
    autoIndex = true,
    useReranker = false
  }) {
    const queryTerms = tokenize(query).slice(0, 12);
    const genericShortQuery = isGenericShortQuery(queryTerms);
    const lexical = this.searchCode({
      query,
      projectPath,
      allRoots,
      glob,
      maxResults: maxResults * 3,
      caseSensitive
    });

    const bootstrapped = await maybeBootstrapSemanticIndex({
      vectorIndex: this.vectorIndex,
      autoIndex,
      autoIndexedScopes: this.autoIndexedScopes,
      getScopeKey: () => this.buildScopeKey(projectPath, allRoots),
      projectPath,
      allRoots,
      query,
      maxResults,
      minSemanticScore,
      defaultAutoIndexMaxFiles: this.defaultAutoIndexMaxFiles
    });
    const semantic = bootstrapped.semantic;
    const autoIndexMeta = bootstrapped.autoIndexMeta;

    const ranked = await fuseRankAndRerank({
      query,
      lexical,
      semantic,
      queryTerms,
      allRoots,
      genericShortQuery,
      useReranker,
      reranker: this.reranker,
      rerankerMinCandidates: this.rerankerMinCandidates,
      rerankerTopN: this.rerankerTopN,
      maxResults
    });

    let indexStaleness = null;
    if (this.vectorIndex) {
      try {
        indexStaleness = this.vectorIndex.checkStaleness();
      } catch {
        // non-fatal
      }
    }

    return {
      query,
      lexical_hits: lexical.length,
      semantic_hits: semantic.length,
      ranking_mode: ranked.rankingMode,
      auto_index: autoIndexMeta,
      reranker: ranked.reranker,
      index_stale: indexStaleness?.stale ?? null,
      index_staleness: indexStaleness,
      results: ranked.results
    };
  }

  buildScopeKey(projectPath, allRoots) {
    const bases = this.workspace.resolveSearchBases(projectPath, allRoots);
    const normalized = bases.map((base) => this.workspace.normalizeTarget(base)).sort();
    return normalized.join('||');
  }
}
