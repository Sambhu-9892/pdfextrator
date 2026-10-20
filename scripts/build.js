/**
 * Bundle the extension with esbuild.
 *
 * Why bundling: Firefox extension pages cannot resolve bare module specifiers
 * (e.g. "pdfjs-dist") or extensionless relative imports produced by plain tsc.
 * esbuild inlines dependencies and rewrites import paths so scripts load.
 */
const esbuild = require('esbuild');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Remove stale output from the previous in-place `tsc` build so module
// resolution (esbuild, Vite/Vitest) never picks an outdated .js file.
function cleanStaleJs(dir) {
  if (!dir || dir === ROOT) return;
  for (const entry of require('fs').readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      cleanStaleJs(full);
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.js.map')) {
      require('fs').rmSync(full, { force: true });
    }
  }
}

for (const dir of ['src', 'popup', 'viewer', 'tests']) {
  cleanStaleJs(path.join(ROOT, dir));
}
// Hashed chunk names change between builds; delete old ones so the package
// does not accumulate dead code.
require('fs').rmSync(path.join(ROOT, 'chunks'), { recursive: true, force: true });

async function main() {
  const common = {
    bundle: true,
    platform: 'browser',
    target: ['firefox109'],
    logLevel: 'info',
    sourcemap: true,
    legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"' },
  };

  // Main extension contexts: ESM with code splitting so shared deps (PDF.js,
  // docx) are emitted once into chunks/.
  await esbuild.build({
    ...common,
    entryPoints: {
      'src/background': path.join(ROOT, 'src/background.ts'),
      'popup/popup': path.join(ROOT, 'popup/popup.ts'),
      'viewer/viewer': path.join(ROOT, 'viewer/viewer.ts'),
      'viewer/settings': path.join(ROOT, 'viewer/settings.ts'),
    },
    outdir: ROOT,
    outbase: ROOT,
    format: 'esm',
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
  });

  // Content script: self-contained classic script (no imports at runtime).
  await esbuild.build({
    ...common,
    entryPoints: [path.join(ROOT, 'src/content/content.ts')],
    outfile: path.join(ROOT, 'src/content/content.js'),
    format: 'iife',
  });

  console.log('Bundling complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
