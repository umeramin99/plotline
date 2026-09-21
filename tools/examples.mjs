#!/usr/bin/env node
/**
 * Render every example into assets/ for the README.
 *
 * `now` is pinned so re-running this never produces a spurious diff just
 * because the clock moved.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/parse.js';
import { render } from '../src/render.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = Date.UTC(2026, 4, 14); // 14 May 2026

mkdirSync(join(root, 'assets'), { recursive: true });
let failures = 0;

for (const file of readdirSync(join(root, 'examples')).filter((f) => f.endsWith('.md')).sort()) {
  const source = readFileSync(join(root, 'examples', file), 'utf8');
  const doc = parse(source);
  for (const w of doc.warnings) {
    process.stderr.write(`examples/${file}:${w.line}: ${w.message}\n`);
    failures += 1;
  }
  const out = join(root, 'assets', basename(file, '.md') + '.svg');
  writeFileSync(out, render(doc, { now: NOW }) + '\n');
  process.stderr.write(`wrote assets/${basename(out)}\n`);
}

if (failures) {
  process.stderr.write(`\n${failures} example problem(s)\n`);
  process.exit(1);
}
