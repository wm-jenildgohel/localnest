'use strict';
// CJS wrapper so __dirname is resolved by Node's module loader (absolute,
// never from process.cwd()). This lets the postinstall survive a global npm
// install where the CWD is deleted before this script runs (uv_cwd ENOENT).
try {
  const path = require('path');
  const { spawnSync } = require('child_process');
  // __dirname is the scripts/ directory — absolute, set by the CJS loader.
  const script = path.join(__dirname, 'install-localnest-skill.mjs');
  spawnSync(process.execPath, [script, '--auto'], {
    stdio: 'inherit',
    env: process.env
  });
} catch (_) {
  // Skill auto-install is best-effort — never fail npm install.
}
