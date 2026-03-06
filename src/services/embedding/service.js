const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';

export class EmbeddingService {
  constructor({ provider = 'xenova', model, cacheDir } = {}) {
    this.provider = provider;
    this.model = model || DEFAULT_MODEL;
    this.cacheDir = cacheDir || '';
    this._dimensions = null;
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
      dimensions: this._dimensions,
      available: this._available,
      error: this._lastError || undefined
    };
  }

  async embed(text) {
    const results = await this.embedBatch([text]);
    return results[0] ?? null;
  }

  async embedBatch(texts) {
    if (!this.isEnabled() || texts.length === 0) return [];
    if (this.provider === 'xenova') return this._xenovaBatch(texts);
    return [];
  }

  async _getXenovaPipeline() {
    if (this._pipelinePromise) return this._pipelinePromise;

    this._pipelinePromise = (async () => {
      const mod = await import('@xenova/transformers');
      if (this.cacheDir) {
        mod.env.cacheDir = this.cacheDir;
      }
      return mod.pipeline('feature-extraction', this.model);
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

  async _xenovaBatch(texts) {
    const extractor = await this._getXenovaPipeline();
    const embeddings = [];
    for (const text of texts) {
      const out = await extractor(text, { pooling: 'mean', normalize: true });
      const vector = Array.from(out.data || []);
      embeddings.push(vector);
    }
    if (embeddings.length > 0) this._dimensions = embeddings[0].length;
    this._lastError = '';
    return embeddings;
  }
}
