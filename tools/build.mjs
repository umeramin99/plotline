#!/usr/bin/env node
/**
 * Bundle the app into one self-contained docs/index.html.
 *
 * No bundler, because a roadmap tool should not need a toolchain. The modules
 * are written so that stripping `import` lines and the `export ` keyword and
 * concatenating them in dependency order produces valid script source.
 *
 *   node tools/build.mjs          write docs/index.html
 *   node tools/build.mjs --check  fail if the committed file is out of date
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = ['measure.js', 'themes.js', 'parse.js', 'render.js', 'app.js'];
const OUT = join(root, 'docs', 'index.html');

/** Drop ES module syntax so the files can be concatenated into one script. */
function flatten(source, name) {
  return source
    .replace(/^import\s[\s\S]*?from\s+'[^']+';\s*$/gm, '')
    .replace(/^export\s+\{[^}]*\}\s*(?:from\s+'[^']+')?;\s*$/gm, '')
    .replace(/^export\s+(?=(?:default\s+)?(?:const|let|var|function|class)\b)/gm, '')
    .replace(/^\s*\n(?=\s*\n)/gm, '')
    .trim()
    .concat(`\n/* --- end ${name} --- */\n`);
}

/**
 * Concatenating modules only works while their top-level names stay distinct,
 * so a collision has to be a build error rather than a subtle runtime bug.
 */
function assertNoCollisions(parts) {
  const seen = new Map();
  const clashes = [];
  for (const { name, code } of parts) {
    const declared = new Set();
    for (const m of code.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      declared.add(m[1]);
    }
    for (const id of declared) {
      if (seen.has(id)) clashes.push(`${id} (${seen.get(id)} and ${name})`);
      else seen.set(id, name);
    }
  }
  if (clashes.length) {
    throw new Error(`Top-level name collisions between modules:\n  - ${clashes.join('\n  - ')}`);
  }
}

function exampleBundle() {
  const dir = join(root, 'examples');
  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  const entries = {};
  const order = [];
  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8');
    const title = (text.match(/^#\s+(.+)$/m) || [, basename(file, '.md')])[1].trim();
    entries[title] = text;
    order.push(title);
  }
  // The first example is what a first-time visitor sees, so lead with the timeline.
  order.sort((a, b) => (entries[a].includes('@timeline') ? -1 : 1) - (entries[b].includes('@timeline') ? -1 : 1));
  return (
    `const PLOTLINE_EXAMPLES = ${JSON.stringify(entries, null, 2)};\n` +
    `const PLOTLINE_EXAMPLE_ORDER = ${JSON.stringify(order)};\n`
  );
}

function build() {
  const parts = MODULES.map((name) => ({
    name,
    code: flatten(readFileSync(join(root, 'src', name), 'utf8'), name),
  }));
  assertNoCollisions(parts);

  const js = ['(() => {', '"use strict";', exampleBundle(), ...parts.map((p) => p.code), '})();'].join('\n');
  const css = readFileSync(join(root, 'src', 'app.css'), 'utf8').trim();
  const html = readFileSync(join(root, 'src', 'app.html'), 'utf8');

  if (!html.includes('/*__PLOTLINE_CSS__*/') || !html.includes('/*__PLOTLINE_JS__*/')) {
    throw new Error('src/app.html is missing its placeholders');
  }
  return html.replace('/*__PLOTLINE_CSS__*/', () => css).replace('/*__PLOTLINE_JS__*/', () => js);
}

const output = build();

if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== output) {
    process.stderr.write('docs/index.html is out of date. Run: npm run build\n');
    process.exit(1);
  }
  process.stderr.write('docs/index.html is up to date\n');
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, output);
  process.stderr.write(`built ${OUT} (${(output.length / 1024).toFixed(1)} kB)\n`);
}
