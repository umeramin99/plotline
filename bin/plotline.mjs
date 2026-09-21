#!/usr/bin/env node
/**
 * plotline - render a plain-text roadmap to SVG.
 *
 * Zero dependencies, so `npx` or a vendored copy both work offline.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from '../src/parse.js';
import { render } from '../src/render.js';
import { THEME_NAMES } from '../src/themes.js';

const USAGE = `plotline - plain-text roadmaps, rendered

Usage:
  plotline <file.md> [options]
  cat roadmap.md | plotline - [options]

Options:
  -o, --out <file>    Write SVG here (default: stdout)
  -t, --theme <name>  ${THEME_NAMES.join(', ')}
  -w, --width <px>    Canvas width (default 1200)
      --json          Print the parsed model instead of SVG
      --check         Report problems and exit non-zero if any
  -h, --help          Show this
`;

function parseArgs(argv) {
  const opts = { input: null, out: null, theme: null, width: null, json: false, check: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[(i += 1)];
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '-o' || arg === '--out') opts.out = next();
    else if (arg === '-t' || arg === '--theme') opts.theme = next();
    else if (arg === '-w' || arg === '--width') opts.width = Number(next());
    else if (arg === '--json') opts.json = true;
    else if (arg === '--check') opts.check = true;
    else if (arg.startsWith('-') && arg !== '-') throw new Error(`Unknown option ${arg}`);
    else if (opts.input === null) opts.input = arg;
    else throw new Error(`Unexpected argument ${arg}`);
  }
  return opts;
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`plotline: ${err.message}\n\n${USAGE}`);
    return 2;
  }

  if (opts.help || (!opts.input && process.stdin.isTTY)) {
    process.stdout.write(USAGE);
    return opts.help ? 0 : 2;
  }

  let source;
  try {
    source = opts.input && opts.input !== '-' ? readFileSync(opts.input, 'utf8') : readFileSync(0, 'utf8');
  } catch (err) {
    process.stderr.write(`plotline: cannot read ${opts.input}: ${err.message}\n`);
    return 1;
  }

  const doc = parse(source);
  const where = opts.input && opts.input !== '-' ? opts.input : '<stdin>';
  for (const w of doc.warnings) {
    process.stderr.write(`${where}:${w.line || 1}: ${w.message}\n`);
  }

  if (opts.check) {
    if (!doc.warnings.length) process.stderr.write(`${where}: ok\n`);
    return doc.warnings.length ? 1 : 0;
  }

  const output = opts.json
    ? JSON.stringify(doc, null, 2)
    : render(doc, { theme: opts.theme, width: opts.width || undefined });

  if (opts.out) {
    writeFileSync(opts.out, output + '\n');
    process.stderr.write(`plotline: wrote ${opts.out}\n`);
  } else {
    process.stdout.write(output + '\n');
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
