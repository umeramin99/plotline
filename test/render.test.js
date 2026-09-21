import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parse.js';
import { render } from '../src/render.js';
import { THEME_NAMES } from '../src/themes.js';
import { textWidth, truncate, wrapText } from '../src/measure.js';

const TIMELINE = `# Plan
> Subtitle
@timeline Q1 2026 -> Q4 2026
@today 2026-05-01
## Growth
- Ship onboarding @q1..q2 ~60% +ana #core
- Something risky @q3 !risk
- No date at all
## Platform
- Migrate the bus @q2..q4 ~10%
`;

const BOARD = `# Board
## Now
- A thing ~50% +bo #tag
  - a note
## Next
- Another thing !blocked
`;

const size = (svg) => {
  const m = svg.match(/width="(\d+)" height="(\d+)"/);
  return { w: Number(m[1]), h: Number(m[2]) };
};

test('emits a well-formed svg in both modes', () => {
  for (const source of [TIMELINE, BOARD]) {
    const svg = render(parse(source));
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.ok(svg.endsWith('</svg>'));
    const { w, h } = size(svg);
    assert.equal(w, 1200);
    assert.ok(h > 100 && h < 4000, `implausible height ${h}`);
    // Every tag we open, we close.
    assert.equal((svg.match(/<svg/g) || []).length, (svg.match(/<\/svg>/g) || []).length);
    assert.equal((svg.match(/<text /g) || []).length, (svg.match(/<\/text>/g) || []).length);
  }
});

test('escapes text so a roadmap cannot inject markup', () => {
  const svg = render(parse('# <script>alert("x")</script> & "quoted"\n## L\n- <b>bold</b>\n'));
  assert.ok(!svg.includes('<script>'), 'raw script tag leaked into the output');
  assert.ok(!svg.includes('<b>'), 'raw markup leaked into the output');
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(svg.includes('&amp;'));
});

test('stays inside the safe SVG subset', () => {
  const svg = render(parse(TIMELINE));
  // These keep GitHub's sanitiser happy and keep canvas exports untainted.
  for (const banned of ['<style', 'foreignObject', 'xlink:href', 'http://www.w3.org/1999/xlink', '<image', '<script']) {
    assert.ok(!svg.includes(banned), `output should not contain ${banned}`);
  }
  const external = svg.match(/(?:href|src)="(?!#)[^"]*"/g) || [];
  assert.deepEqual(external, [], 'output should have no external references');
});

test('is deterministic', () => {
  const doc = parse(TIMELINE);
  assert.equal(render(doc, { now: 0 }), render(doc, { now: 0 }));
});

test('@today now moves the marker but nothing else', () => {
  const doc = parse('@timeline Q1 2026 -> Q4 2026\n@today now\n## L\n- a @q1\n');
  const early = render(doc, { now: Date.UTC(2026, 0, 2) });
  const late = render(doc, { now: Date.UTC(2026, 10, 2) });
  assert.notEqual(early, late);
  assert.equal(size(early).h, size(late).h);
});

test('renders in every theme', () => {
  for (const theme of THEME_NAMES) {
    const svg = render(parse(TIMELINE), { theme });
    assert.ok(svg.length > 1000, `${theme} produced almost nothing`);
    assert.ok(!svg.includes('undefined'), `${theme} left an undefined value in the output`);
  }
});

test('falls back to the default theme for an unknown name', () => {
  assert.equal(render(parse(TIMELINE), { theme: 'nope' }), render(parse(TIMELINE), { theme: 'aurora' }));
});

test('grows taller as items are added', () => {
  const small = size(render(parse('@timeline Q1 2026 -> Q2 2026\n## L\n- a\n'))).h;
  const big = size(render(parse('@timeline Q1 2026 -> Q2 2026\n## L\n- a\n- b\n- c\n- d\n'))).h;
  assert.ok(big > small, 'more items should mean a taller chart');
});

test('honours width and clamps absurd values', () => {
  assert.equal(size(render(parse(TIMELINE), { width: 800 })).w, 800);
  assert.equal(size(render(parse(TIMELINE), { width: 10 })).w, 480);
  assert.equal(size(render(parse(TIMELINE), { width: 99999 })).w, 4000);
});

test('drops the footer when asked', () => {
  assert.ok(render(parse(TIMELINE)).includes('made with plotline'));
  assert.ok(!render(parse(TIMELINE + '@footer off\n')).includes('made with plotline'));
});

test('renders an empty document without throwing', () => {
  for (const source of ['', '# Only a title\n', '@timeline Q1 2026 -> Q2 2026\n']) {
    assert.doesNotThrow(() => render(parse(source)), `threw on ${JSON.stringify(source)}`);
  }
});

test('text measurement behaves', () => {
  assert.ok(textWidth('mmmm', 13) > textWidth('llll', 13), 'wide glyphs should measure wider');
  assert.ok(textWidth('abc', 26) > textWidth('abc', 13), 'width should scale with size');
  assert.equal(textWidth('', 13), 0);
  assert.equal(truncate('short', 13, 500), 'short');
  assert.ok(truncate('a very long label indeed', 13, 40).endsWith('…'));
  assert.ok(textWidth(truncate('a very long label indeed', 13, 60), 13) <= 60);
  assert.deepEqual(wrapText('one two three four', 13, 1000, 400, 2), ['one two three four']);
  assert.equal(wrapText('one two three four five six seven', 12, 60, 400, 2).length, 2);
});
