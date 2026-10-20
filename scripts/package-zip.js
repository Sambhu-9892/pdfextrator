/**
 * Package the extension into an installable .zip for AMO submission.
 * Stages the loadable extension files (excluding node_modules, scripts, tests).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'nepali-pdf-extractor.zip');
const STAGE = path.resolve(ROOT, '.stage-pkg');

const EXTENSION_FILES = [
  'manifest.json',
  'chunks',
  'popup',
  'viewer',
  'src',
  'pdf',
  'vendor',
  'icons',
];

function rmdir(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

rmdir(STAGE);
fs.mkdirSync(STAGE, { recursive: true });

for (const rel of EXTENSION_FILES) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, path.join(STAGE, rel), { recursive: true, dereference: true });
}

// Remove compiled test artifacts and source maps from the package if present.
function cleanStage(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      cleanStage(full);
    } else if (entry.name.endsWith('.test.js') || entry.name.endsWith('.map')) {
      fs.rmSync(full, { force: true });
    }
  }
}
cleanStage(STAGE);

try {
  execSync(`cd "${STAGE}" && zip -r "${OUT}" .`, { stdio: 'inherit' });
  console.log('Package created:', OUT);
} catch (err) {
  console.error('`zip` not available; install it or package the .stage-pkg folder manually.');
  process.exit(1);
} finally {
  rmdir(STAGE);
}
