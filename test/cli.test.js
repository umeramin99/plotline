import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = new URL('../bin/plotline.mjs', import.meta.url).pathname;
const EXAMPLE = new URL('../examples/orbit.md', import.meta.url).pathname;

const run = (args, input) => {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
};

test('renders a file to stdout', () => {
  const { code, stdout } = run([EXAMPLE]);
  assert.equal(code, 0);
  assert.match(stdout, /^<svg /);
});

test('renders from stdin', () => {
  const { code, stdout } = run(['-'], '# Piped\n## L\n- a\n');
  assert.equal(code, 0);
  assert.match(stdout, /Piped/);
});

test('writes to a file with -o', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'plotline-')), 'r.svg');
  assert.equal(run([EXAMPLE, '-o', out]).code, 0);
  assert.match(readFileSync(out, 'utf8'), /^<svg /);
});

test('--json prints the model', () => {
  const { stdout } = run([EXAMPLE, '--json']);
  const doc = JSON.parse(stdout);
  assert.equal(doc.title, 'Orbit 2026');
  assert.equal(doc.mode, 'timeline');
});

test('--check passes clean files and fails dirty ones', () => {
  assert.equal(run([EXAMPLE, '--check']).code, 0);
  const bad = run(['-', '--check'], '@timeline nonsense\n## L\n- a\n');
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /Could not read the range/);
});

test('--theme and --width are applied', () => {
  const { stdout } = run([EXAMPLE, '--theme', 'slate', '--width', '900']);
  assert.match(stdout, /width="900"/);
  assert.match(stdout, /#FFFFFF/, 'slate should paint a white background');
});

test('rejects unknown options and missing files', () => {
  assert.equal(run([EXAMPLE, '--wat']).code, 2);
  assert.equal(run(['does-not-exist.md']).code, 1);
});

test('--help exits cleanly', () => {
  const { code, stdout } = run(['--help']);
  assert.equal(code, 0);
  assert.match(stdout, /Usage:/);
});
