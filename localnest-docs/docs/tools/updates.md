# Updates

<div className="docPanel docPanel--compact">
  <p>
    Update tooling is operational rather than informational. Check for new versions first, and only
    run self-update after the user explicitly approves it.
  </p>
</div>

## `localnest_update_status`

Checks npm for the latest LocalNest version with local cache and backoff.

## `localnest_update_self`

Updates the package globally and syncs bundled skill files.

This tool must only be used after explicit user approval.

## Safe usage pattern

<div className="docSteps">
  <div className="docStep">
    <span>1</span>
    <div>
      <strong>Check the installed version</strong>
      <p>Call `localnest_update_status` to see whether a newer version is available.</p>
    </div>
  </div>
  <div className="docStep">
    <span>2</span>
    <div>
      <strong>Ask for approval</strong>
      <p>Do not run `localnest_update_self` unless the user explicitly confirms the update.</p>
    </div>
  </div>
  <div className="docStep">
    <span>3</span>
    <div>
      <strong>Re-verify after updating</strong>
      <p>After an update, re-run status or doctor checks so the new runtime state is visible.</p>
    </div>
  </div>
</div>
