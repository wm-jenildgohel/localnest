# 0.0.4-beta.4 Tools

<div className="docPanel docPanel--compact">
  <p>
    The beta tool surface adds full memory workflow and update-aware operations on top of the stable
    discovery, search, indexing, and verification flow.
  </p>
</div>

## Added in this beta line

- `localnest_task_context`
- `localnest_memory_status`
- `localnest_memory_recall`
- `localnest_memory_list`
- `localnest_memory_get`
- `localnest_memory_store`
- `localnest_memory_update`
- `localnest_memory_delete`
- `localnest_capture_outcome`
- `localnest_memory_capture_event`
- `localnest_memory_events`
- `localnest_update_status`
- `localnest_update_self`

## Core tools still present

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

## Recommended beta workflow

`localnest_server_status` -> `localnest_task_context` -> `localnest_search_files` -> `localnest_search_code` or `localnest_search_hybrid` -> `localnest_read_file` -> `localnest_capture_outcome`

