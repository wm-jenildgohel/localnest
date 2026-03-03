# 0.0.2-beta.2 Tools

<div className="docPanel docPanel--compact">
  <p>
    This beta is the first version where the tool surface becomes significantly easier to automate
    against, even though compatibility aliases are still exposed.
  </p>
</div>

## Key tool contract changes

- canonical `localnest_*` names added
- legacy aliases still available for compatibility
- `response_format` accepted across tools
- pagination metadata added for list tools

This is the release where the external MCP tool contract becomes much easier to automate against.

## Typical exposed surface

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

Plus compatibility aliases for earlier short names.
