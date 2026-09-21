import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, resolveSpan, todayOffset } from '../src/parse.js';

const items = (doc) => doc.lanes.flatMap((l) => l.items);
const first = (doc) => items(doc)[0];

test('reads the document header', () => {
  const doc = parse('# Roadmap\n> A subtitle\n@theme slate\n@width 900\n');
  assert.equal(doc.title, 'Roadmap');
  assert.equal(doc.subtitle, 'A subtitle');
  assert.equal(doc.theme, 'slate');
  assert.equal(doc.width, 900);
});

test('picks board mode without a timeline, timeline mode with one', () => {
  assert.equal(parse('## Now\n- a\n').mode, 'board');
  assert.equal(parse('@timeline Q1 2026 -> Q2 2026\n## Lane\n- a\n').mode, 'timeline');
});

test('falls back to a board when timeline mode has no columns', () => {
  const doc = parse('@mode timeline\n## Lane\n- a\n');
  assert.equal(doc.mode, 'board');
  assert.match(doc.warnings[0].message, /Timeline mode needs/);
});

test('builds quarter, month and year columns', () => {
  assert.deepEqual(
    parse('@timeline Q3 2026 -> Q2 2027\n').columns.map((c) => c.label),
    ['Q3 2026', 'Q4 2026', 'Q1 2027', 'Q2 2027'],
  );
  assert.deepEqual(
    parse('@timeline Jan 2026 .. Apr 2026\n').columns.map((c) => c.label),
    ['Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026'],
  );
  assert.deepEqual(parse('@timeline 2026 to 2028\n').columns.map((c) => c.label), ['2026', '2027', '2028']);
});

test('accepts explicit columns', () => {
  const doc = parse('@columns Discovery, Build, Launch\n## Lane\n- a @build\n');
  assert.deepEqual(doc.columns.map((c) => c.label), ['Discovery', 'Build', 'Launch']);
  assert.deepEqual(first(doc).span, [1, 2]);
});

test('reads trailing modifiers and leaves the title alone', () => {
  const doc = parse('@timeline Q1 2026 -> Q4 2026\n## Lane\n- Ship v2 @q1..q2 ~60% +ana #core !risk\n');
  const item = first(doc);
  assert.equal(item.title, 'Ship v2');
  assert.equal(item.progress, 0.6);
  assert.equal(item.owner, 'ana');
  assert.deepEqual(item.tags, ['core']);
  assert.equal(item.status, 'risk');
  assert.deepEqual(item.span, [0, 2]);
});

test('leaves mid-line sigils in the title', () => {
  const doc = parse('## Lane\n- Email ana@example.com about #1 today\n');
  assert.equal(first(doc).title, 'Email ana@example.com about #1 today');
});

test('handles both multi-word owner spellings', () => {
  const doc = parse('## Lane\n- A +ana-rivera\n- B +"Ana Rivera"\n');
  assert.equal(items(doc)[0].owner, 'ana rivera');
  assert.equal(items(doc)[1].owner, 'Ana Rivera');
});

test('warns when a modifier is stranded mid-line', () => {
  const doc = parse('## Lane\n- A thing +ana rivera\n');
  assert.match(doc.warnings[0].message, /last tokens/);
});

test('collects indented bullets as notes', () => {
  const doc = parse('## Lane\n- Parent\n  - why it matters\n  - second note\n- Sibling\n');
  assert.deepEqual(items(doc)[0].notes, ['why it matters', 'second note']);
  assert.equal(items(doc).length, 2);
});

test('resolves spans by key, index and date', () => {
  const cols = parse('@timeline Q1 2026 -> Q4 2026\n').columns;
  assert.deepEqual(resolveSpan('q2', cols), [1, 2]);
  assert.deepEqual(resolveSpan('q1..q3', cols), [0, 3]);
  assert.deepEqual(resolveSpan('2', cols), [1, 2]);
  assert.deepEqual(resolveSpan('2026', cols), [0, 4], 'a bare year covers all of its columns');
  assert.equal(resolveSpan('q1->q3', cols)[1], 3, 'arrow ranges work too');
  assert.deepEqual(resolveSpan('nope', cols), null);
});

test('normalises a reversed range', () => {
  const cols = parse('@timeline Q1 2026 -> Q4 2026\n').columns;
  assert.deepEqual(resolveSpan('q4..q1', cols), [0, 4]);
});

test('interpolates ISO dates inside a column', () => {
  const cols = parse('@timeline Jan 2026 -> Feb 2026\n').columns;
  const [start] = resolveSpan('2026-01-16..2026-02-01', cols);
  assert.ok(start > 0.45 && start < 0.55, `mid-January should land mid-column, got ${start}`);
});

test('clamps dates outside the chart', () => {
  const cols = parse('@timeline Q1 2026 -> Q2 2026\n').columns;
  assert.deepEqual(resolveSpan('2020-01-01..2030-01-01', cols), [0, 2]);
});

test('an unresolvable span warns and leaves the item unscheduled', () => {
  const doc = parse('@timeline Q1 2026 -> Q2 2026\n## Lane\n- A @q9\n');
  assert.equal(first(doc).span, null);
  assert.match(doc.warnings[0].message, /Unknown date/);
});

test('places the today marker', () => {
  const doc = parse('@timeline Q1 2026 -> Q4 2026\n@today 2026-04-01\n## L\n- a\n');
  assert.equal(todayOffset(doc), 1);
  assert.equal(todayOffset(parse('@timeline Q1 2026 -> Q4 2026\n@today q3\n')), 2);
  assert.equal(todayOffset(parse('## L\n- a\n')), null, 'board mode has no today marker');
});

test('@today now follows the clock', () => {
  const doc = parse('@timeline Q1 2026 -> Q4 2026\n@today now\n');
  assert.equal(todayOffset(doc, Date.UTC(2026, 6, 1)), 2);
});

test('footer can be switched off', () => {
  assert.equal(parse('@footer off\n').footer, '');
  assert.equal(parse('@footer Acme confidential\n').footer, 'Acme confidential');
});

test('warns about unknown directives and themes', () => {
  const doc = parse('@nope 1\n@theme banana\n');
  assert.equal(doc.warnings.length, 2);
  assert.match(doc.warnings[1].message, /Unknown theme/);
});

test('survives junk without throwing', () => {
  for (const junk of ['', '\n\n\n', '###', '- ', '@', '@timeline', '#'.repeat(50), 'just some prose']) {
    assert.doesNotThrow(() => parse(junk), `threw on ${JSON.stringify(junk)}`);
  }
});

test('every bundled example parses cleanly', () => {
  const dir = new URL('../examples/', import.meta.url).pathname;
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert.ok(files.length >= 3);
  for (const file of files) {
    const doc = parse(readFileSync(join(dir, file), 'utf8'));
    assert.deepEqual(doc.warnings, [], `${file} should parse without warnings`);
    assert.ok(doc.title, `${file} should have a title`);
  }
});
