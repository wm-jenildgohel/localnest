# 0.0.3 Tools

<div className="docPanel docPanel--compact">
  <p>
    `0.0.3` exposes the stable canonical tool surface. This page is useful when you need the exact
    released tool contract without unreleased update tooling from `main`.
  </p>
</div>

## Exposed tools

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

## Recommended workflow

```text
localnest_server_status
→ localnest_list_roots
→ localnest_list_projects
→ localnest_index_status
→ localnest_index_project
→ localnest_search_files
→ localnest_search_hybrid
→ localnest_read_file
```

## Key behavior

- `response_format` supports `json` and `markdown`
- list-style tools return pagination metadata
- `localnest_search_code` supports `use_regex` and `context_lines`
- `localnest_search_hybrid` supports semantic filtering and auto-indexing
- `localnest_search_files` is the recommended first step for module discovery
