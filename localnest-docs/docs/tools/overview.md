# Tools Overview

<div className="docPanel docPanel--compact">
  <p>
    Use the tools in layers: discover files first, then run exact or semantic search, then confirm
    with file reads. When memory is enabled, recall it before analysis and capture meaningful outcomes
    after the work is done.
  </p>
</div>

## Main tools

<div className="docGrid docGrid--2">
  <div className="docPanel">
    <h3>Discovery</h3>
    <ul>
      <li>`localnest_usage_guide`</li>
      <li>`localnest_server_status`</li>
      <li>`localnest_list_roots`</li>
      <li>`localnest_list_projects`</li>
      <li>`localnest_project_tree`</li>
    </ul>
  </div>
  <div className="docPanel">
    <h3>Indexing and updates</h3>
    <ul>
      <li>`localnest_update_status`</li>
      <li>`localnest_update_self`</li>
      <li>`localnest_index_status`</li>
      <li>`localnest_index_project`</li>
      <li>`localnest_summarize_project`</li>
    </ul>
  </div>
  <div className="docPanel">
    <h3>Search</h3>
    <ul>
      <li>`localnest_search_files`</li>
      <li>`localnest_search_code`</li>
      <li>`localnest_search_hybrid`</li>
    </ul>
  </div>
  <div className="docPanel">
    <h3>Memory</h3>
    <ul>
      <li>`localnest_task_context`</li>
      <li>`localnest_memory_status`</li>
      <li>`localnest_memory_recall`</li>
      <li>`localnest_memory_list`</li>
      <li>`localnest_memory_get`</li>
      <li>`localnest_memory_store`</li>
      <li>`localnest_memory_update`</li>
      <li>`localnest_memory_delete`</li>
      <li>`localnest_capture_outcome`</li>
      <li>`localnest_memory_capture_event`</li>
      <li>`localnest_memory_events`</li>
    </ul>
  </div>
  <div className="docPanel">
    <h3>Verification</h3>
    <ul>
      <li>`localnest_read_file`</li>
    </ul>
  </div>
</div>

## Response format

Tools support `response_format: "json"` or `"markdown"`.

## Typical workflow

<div className="docSteps">
  <div className="docStep">
    <span>1</span>
    <div>
      <strong>Check runtime state</strong>
      <p>`localnest_server_status`, `localnest_task_context`, and `localnest_update_status` confirm active backend, memory state, relevant recall, and version state.</p>
    </div>
  </div>
  <div className="docStep">
    <span>2</span>
    <div>
      <strong>Scope the workspace</strong>
      <p>`localnest_list_roots` and `localnest_list_projects` tell you where to search.</p>
    </div>
  </div>
  <div className="docStep">
    <span>3</span>
    <div>
      <strong>Recall prior context</strong>
      <p>If memory is enabled, prefer `localnest_task_context` before indexing or deep analysis.</p>
    </div>
  </div>
  <div className="docStep">
    <span>4</span>
    <div>
      <strong>Prepare the index</strong>
      <p>`localnest_index_status` and `localnest_index_project` make hybrid retrieval useful.</p>
    </div>
  </div>
  <div className="docStep">
    <span>5</span>
    <div>
      <strong>Retrieve and verify</strong>
      <p>`localnest_search_hybrid` narrows candidates, then `localnest_read_file` confirms exact lines.</p>
    </div>
  </div>
  <div className="docStep">
    <span>6</span>
    <div>
      <strong>Capture durable outcomes</strong>
      <p>After a fix, decision, review, or preference discovery, emit `localnest_capture_outcome` when memory is enabled.</p>
    </div>
  </div>
</div>
