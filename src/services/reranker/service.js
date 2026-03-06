const DEFAULT_MODEL = 'Xenova/ms-marco-MiniLM-L-6-v2';

function extractScore(result) {
  if (Array.isArray(result) && result.length > 0) {
    if (Array.isArray(result[0]) && result[0].length > 0) return Number(result[0][0]?.score || 0);
    return Number(result[0]?.score || 0);
  }
  if (result && typeof result === 'object') {
    return Number(result.score || 0);
  }
  return 0;
}

export class RerankerService {
  constructor({ provider = 'xenova', model, cacheDir } = {}) {
    this.provider = provider;
    this.model = model || DEFAULT_MODEL;
    this.cacheDir = cacheDir || '';
    this._pipelinePromise = null;
    this._available = provider !== 'none';
    this._lastError = '';
  }

  isEnabled() {
    return this.provider !== 'none';
  }

  getStatus() {
    return {
      provider: this.provider,
      model: this.model,
      enabled: this.isEnabled(),
      available: this._available,
      error: this._lastError || undefined
    };
  }

  async _getPipeline() {
    if (this._pipelinePromise) return this._pipelinePromise;

    this._pipelinePromise = (async () => {
      const mod = await import('@xenova/transformers');
      if (this.cacheDir) {
        mod.env.cacheDir = this.cacheDir;
      }
      return mod.pipeline('text-classification', this.model);
    })();

    try {
      return await this._pipelinePromise;
    } catch (error) {
      this._available = false;
      this._lastError = String(error?.message || error);
      this._pipelinePromise = null;
      throw error;
    }
  }

  async score(query, text) {
    if (!this.isEnabled()) return 0;
    const classifier = await this._getPipeline();
    try {
      const paired = await classifier({ text: query, text_pair: text }, { topk: 1 });
      return Math.max(0, Math.min(1, extractScore(paired)));
    } catch {
      const joined = await classifier(`${query} [SEP] ${text}`, { topk: 1 });
      return Math.max(0, Math.min(1, extractScore(joined)));
    }
  }

  async rerank(query, candidates) {
    if (!this.isEnabled() || !Array.isArray(candidates) || candidates.length === 0) return [];
    const out = [];
    for (const candidate of candidates) {
      const snippet = candidate.text || candidate.snippet || candidate.file || '';
      try {
        const score = await this.score(query, String(snippet));
        out.push(score);
      } catch (error) {
        this._available = false;
        this._lastError = String(error?.message || error);
        return [];
      }
    }
    this._lastError = '';
    return out;
  }
}
