# Search

<div className="docPanel docPanel--compact">
  <p>
    Search works best when you move from precise scope to precise evidence: file discovery first,
    then lexical or hybrid search, then bounded file reads.
  </p>
</div>

## `localnest_search_files`

Best first step when looking for a feature or module by name.

<div className="docPanel">
  <h3>Use when</h3>
  <p>Start here for folders, modules, subsystems, acronyms, and other path-oriented discovery tasks.</p>
</div>

## `localnest_search_code`

Use for exact identifiers, imports, symbols, or regex patterns.

Useful parameters:

- `glob`
- `max_results`
- `case_sensitive`
- `context_lines`
- `use_regex`

<div className="docPanel">
  <h3>Use when</h3>
  <p>Choose this tool when you already know the symbol, error text, or pattern you want to match.</p>
</div>

## `localnest_search_hybrid`

Use for concept-level retrieval when exact keywords are not enough.

Useful parameters:

- `project_path`
- `all_roots`
- `min_semantic_score`
- `auto_index`

<div className="docPanel">
  <h3>Use when</h3>
  <p>Use hybrid search after indexing when you need semantic recall, architecture context, or concept-level lookup.</p>
</div>

## Recommended flow

<div className="docSteps">
  <div className="docStep">
    <span>1</span>
    <div>
      <strong>Find the likely area</strong>
      <p>Run `localnest_search_files` to narrow the search to a directory, feature, or component.</p>
    </div>
  </div>
  <div className="docStep">
    <span>2</span>
    <div>
      <strong>Search with the right mode</strong>
      <p>Use `localnest_search_code` for exact terms and `localnest_search_hybrid` for concepts.</p>
    </div>
  </div>
  <div className="docStep">
    <span>3</span>
    <div>
      <strong>Confirm with file reads</strong>
      <p>Validate the result set with `localnest_read_file` before drawing conclusions or editing code.</p>
    </div>
  </div>
</div>
