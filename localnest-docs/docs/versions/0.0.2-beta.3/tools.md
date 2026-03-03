# 0.0.2-beta.3 Tools

<div className="docPanel docPanel--compact">
  <p>
    This beta kept the same overall tool line while materially improving how search and indexing
    results were exposed to agents.
  </p>
</div>

This release keeps the canonical `localnest_*` tool line and improves search behavior.

## Tool surface

- `localnest_usage_guide`
- `localnest_server_status`
- `localnest_list_roots`
- `localnest_list_projects`
- `localnest_project_tree`
- `localnest_index_status`
- `localnest_index_project`
- `localnest_search_files`
- `localnest_search_code`
- `localnest_search_hybrid`
- `localnest_read_file`
- `localnest_summarize_project`

## Important tool improvements

- `localnest_search_code` supports `use_regex`
- `localnest_search_code` supports `context_lines`
- `localnest_index_project` reports `failed_files`
- `localnest_search_hybrid` exposes `semantic_score_raw`
- `localnest_server_status` surfaces ripgrep availability instead of startup failure
