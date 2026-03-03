# main Tools

<div className="docPanel docPanel--compact">
  <p>
    The `main` tool surface extends stable LocalNest with update-aware operations while keeping the
    same discovery, search, indexing, and verification flow.
  </p>
</div>

## Additional tools on main

- `localnest_update_status`
- `localnest_update_self`

## Existing tools still present

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

## Key behavior

- `localnest_server_status` includes `updates`
- `localnest_update_self` requires explicit user approval
- `localnest_usage_guide` pushes `search_files` first for module discovery
- `localnest_search_hybrid` is positioned as the main concept-retrieval tool
