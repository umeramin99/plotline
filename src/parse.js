/**
 * The Plotline format.
 *
 * It is Markdown, on purpose: a roadmap should stay readable in a pull request
 * diff and on GitHub's file view without any tooling at all.
 *
 *   # Title                     first h1
 *   > Subtitle                  blockquote
 *   @timeline Q1 2026 -> Q4 2026   directive
 *   ## Lane                     h2+ becomes a lane (timeline) or column (board)
 *   - Item @q1..q2 ~60% +ana #growth !risk
 *     - a note on the item      indented bullet
 *
 * Item modifiers are only recognised as *trailing* tokens, so an email address
 * or a "#1" in the middle of a title is left alone.
 */

import { DEFAULT_THEME, THEMES } from './themes.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUSES = new Set(['done', 'shipped', 'risk', 'blocked', 'now']);
const RANGE_SPLIT = /\s*(?:\.\.\.?|->|→)\s*|\s+to\s+/i;

const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Parse a Plotline document into a plain model. Never throws. */
export function parse(source = '') {
  const doc = {
    title: '',
    subtitle: '',
    theme: DEFAULT_THEME,
    width: 1200,
    footer: 'made with plotline',
    mode: null,
    todaySpec: null,
    columns: [],
    lanes: [],
    warnings: [],
  };

  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const rawItems = []; // items are resolved against columns after the whole doc is read
  let lane = null;
  let lastItem = null;

  lines.forEach((raw, index) => {
    const ln = index + 1;
    const indent = raw.match(/^[ \t]*/)[0].replace(/\t/g, '  ').length;
    const line = raw.trim();
    if (!line || line.startsWith('//')) return;

    if (line.startsWith('@')) {
      directive(doc, line, ln);
      lastItem = null;
      return;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const text = heading[2].trim();
      if (heading[1].length === 1 && !doc.title) doc.title = text;
      else if (text) {
        lane = { name: text, items: [] };
        doc.lanes.push(lane);
      }
      lastItem = null;
      return;
    }

    if (line.startsWith('>')) {
      const text = line.replace(/^>\s?/, '').trim();
      doc.subtitle = doc.subtitle ? doc.subtitle + ' ' + text : text;
      return;
    }

    const bullet = line.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      const text = bullet[1].trim();
      if (indent >= 2 && lastItem) {
        lastItem.notes.push(stripModifiers(text).title);
        return;
      }
      if (!lane) {
        lane = { name: '', items: [] };
        doc.lanes.push(lane);
      }
      const parsed = stripModifiers(text);
      if (/(?:^|\s)[@~+](?![\s@~+])\S/.test(parsed.title)) {
        doc.warnings.push({
          line: ln,
          message: 'Modifiers must be the last tokens on the line. Use +first-last for multi-word owners.',
        });
      }
      const item = { ...parsed, notes: [], line: ln, span: null };
      lane.items.push(item);
      rawItems.push(item);
      lastItem = item;
      return;
    }

    // A bare line directly under an item is a note; otherwise it is a stray.
    if (lastItem && indent >= 2) lastItem.notes.push(line);
    else doc.warnings.push({ line: ln, message: `Ignored: "${truncateMsg(line)}"` });
  });

  if (!doc.mode) doc.mode = doc.columns.length ? 'timeline' : 'board';
  if (doc.mode === 'timeline' && !doc.columns.length) {
    doc.warnings.push({ line: 0, message: 'Timeline mode needs @timeline or @columns; showing a board instead.' });
    doc.mode = 'board';
  }

  if (doc.mode === 'timeline') {
    for (const item of rawItems) {
      if (!item.spanText) continue;
      const span = resolveSpan(item.spanText, doc.columns);
      if (span) item.span = span;
      else doc.warnings.push({ line: item.line, message: `Unknown date "${item.spanText}" — item shown as unscheduled.` });
    }
  }

  doc.lanes = doc.lanes.filter((l) => l.items.length || l.name);
  return doc;
}

function directive(doc, line, ln) {
  const match = line.match(/^@([a-zA-Z][\w-]*)\s*(.*)$/);
  if (!match) return;
  const name = match[1].toLowerCase();
  const value = match[2].trim();

  switch (name) {
    case 'title':
      doc.title = value;
      break;
    case 'subtitle':
      doc.subtitle = value;
      break;
    case 'theme':
      if (THEMES[value.toLowerCase()]) doc.theme = value.toLowerCase();
      else doc.warnings.push({ line: ln, message: `Unknown theme "${value}". Try: ${Object.keys(THEMES).join(', ')}.` });
      break;
    case 'width': {
      const n = parseInt(value, 10);
      if (Number.isFinite(n)) doc.width = Math.min(4000, Math.max(480, n));
      else doc.warnings.push({ line: ln, message: `@width needs a number, got "${value}".` });
      break;
    }
    case 'mode':
      if (value === 'board' || value === 'timeline') doc.mode = value;
      else doc.warnings.push({ line: ln, message: '@mode must be "board" or "timeline".' });
      break;
    case 'footer':
      doc.footer = /^(off|none|false)$/i.test(value) ? '' : value;
      break;
    case 'today':
      doc.todaySpec = value || 'now';
      break;
    case 'timeline': {
      const cols = buildTimeline(value);
      if (cols.length) doc.columns = cols;
      else doc.warnings.push({ line: ln, message: `Could not read the range "${value}". Try "Q1 2026 -> Q4 2026".` });
      break;
    }
    case 'columns': {
      const labels = value.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
      if (labels.length) doc.columns = labels.map((label) => ({ label, key: key(label), start: null, end: null }));
      else doc.warnings.push({ line: ln, message: '@columns needs a comma-separated list.' });
      break;
    }
    default:
      doc.warnings.push({ line: ln, message: `Unknown directive "@${name}".` });
  }
}

/** Pull trailing `@span ~50% +owner #tag !status` tokens off an item line. */
function stripModifiers(text) {
  const out = { title: '', spanText: null, progress: null, owner: '', tags: [], status: '' };
  let rest = String(text).trim();

  // +"Ana Rivera" is pulled out first so the space inside it survives tokenising.
  rest = rest.replace(/\+"([^"]+)"\s*$/, (_, name) => {
    out.owner = name.trim();
    return '';
  });

  const words = rest.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { ...out, title: '' };
  while (words.length > 1) {
    const word = words[words.length - 1];
    let matched = true;
    if (/^@\S+$/.test(word) && !out.spanText) out.spanText = word.slice(1);
    else if (/^~\d{1,3}%?$/.test(word) && out.progress === null) out.progress = Math.min(100, parseInt(word.slice(1), 10)) / 100;
    else if (/^\+\S+$/.test(word) && !out.owner) out.owner = word.slice(1).replace(/[_-]+/g, ' ');
    else if (/^#[\w-]+$/.test(word)) out.tags.unshift(word.slice(1).toLowerCase());
    else if (/^![\w-]+$/.test(word) && STATUSES.has(word.slice(1).toLowerCase())) out.status = word.slice(1).toLowerCase();
    else matched = false;
    if (!matched) break;
    words.pop();
  }
  out.title = words.join(' ').replace(/\s*[:—-]\s*$/, '').trim();
  return out;
}

/** "Q1 2026 -> Q4 2026", "Jan 2026 .. Jun 2026", "2026 -> 2028". */
function buildTimeline(spec) {
  const parts = String(spec).split(RANGE_SPLIT).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return [];
  const from = parsePoint(parts[0]);
  const to = parsePoint(parts[1] || parts[0]);
  if (!from || !to) return [];
  const unit = from.unit;
  if (to.unit !== unit) return [];

  const columns = [];
  let cursor = { ...from };
  const limit = unit === 'month' ? 60 : unit === 'quarter' ? 40 : 30;
  for (let guard = 0; guard < limit; guard += 1) {
    columns.push(makeColumn(cursor));
    if (cursor.year === to.year && cursor.index === to.index) break;
    if (cursor.year > to.year || (cursor.year === to.year && cursor.index > to.index)) break;
    cursor = advance(cursor);
  }
  return columns;
}

function parsePoint(text) {
  const raw = String(text).trim();
  let m = raw.match(/^q([1-4])\s*'?(\d{2,4})$/i);
  if (m) return { unit: 'quarter', index: +m[1] - 1, year: fullYear(m[2]) };
  m = raw.match(/^(\d{4})[-\s]*q([1-4])$/i);
  if (m) return { unit: 'quarter', index: +m[2] - 1, year: +m[1] };
  m = raw.match(/^([a-z]{3,9})\.?\s*'?(\d{2,4})$/i);
  if (m) {
    const idx = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (idx >= 0) return { unit: 'month', index: idx, year: fullYear(m[2]) };
  }
  m = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return { unit: 'month', index: +m[2] - 1, year: +m[1] };
  m = raw.match(/^(\d{4})$/);
  if (m) return { unit: 'year', index: 0, year: +m[1] };
  return null;
}

const fullYear = (y) => (String(y).length <= 2 ? 2000 + Number(y) : Number(y));

function makeColumn(point) {
  if (point.unit === 'quarter') {
    const label = `Q${point.index + 1} ${point.year}`;
    return { label, key: key(label), start: utc(point.year, point.index * 3), end: utc(point.year, point.index * 3 + 3) };
  }
  if (point.unit === 'month') {
    const label = `${MONTH_LABELS[point.index]} ${point.year}`;
    return { label, key: key(label), start: utc(point.year, point.index), end: utc(point.year, point.index + 1) };
  }
  const label = String(point.year);
  return { label, key: key(label), start: utc(point.year, 0), end: utc(point.year + 1, 0) };
}

function advance(point) {
  const per = point.unit === 'quarter' ? 4 : point.unit === 'month' ? 12 : 1;
  const next = point.index + 1;
  return next >= per ? { ...point, index: 0, year: point.year + 1 } : { ...point, index: next };
}

const utc = (year, month) => Date.UTC(year, month, 1);

/**
 * Resolve "q1..q3", "2", "2026-02-14..2026-06-01" to fractional column offsets.
 * Returns [start, end] in column space, or null when nothing matches.
 */
export function resolveSpan(text, columns) {
  if (!columns.length) return null;
  const parts = String(text).split(RANGE_SPLIT).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;

  // Resolve each endpoint to the full column it names, then take the outer
  // edges. Doing it this way means "q4..q1" reads the same as "q1..q4".
  const from = { start: resolvePoint(parts[0], columns, 'start'), end: resolvePoint(parts[0], columns, 'end') };
  const to = parts[1]
    ? { start: resolvePoint(parts[1], columns, 'start'), end: resolvePoint(parts[1], columns, 'end') }
    : from;
  if ([from.start, from.end, to.start, to.end].some((v) => v === null)) return null;

  const start = Math.max(0, Math.min(from.start, to.start));
  const end = Math.min(columns.length, Math.max(from.end, to.end));
  return end - start < 0.08 ? [start, Math.min(columns.length, start + 0.08)] : [start, end];
}

function resolvePoint(text, columns, edge) {
  const raw = String(text).trim();

  if (/^\d{1,2}$/.test(raw) && +raw >= 1 && +raw <= columns.length) {
    return edge === 'start' ? +raw - 1 : +raw;
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (iso && columns[0].start !== null) {
    const time = Date.UTC(+iso[1], +iso[2] - 1, iso[3] ? +iso[3] : 1);
    return dateToOffset(time, columns);
  }

  const k = key(raw);
  if (!k) return null;
  const matches = columns.map((c, i) => [c, i]).filter(([c]) => c.key.startsWith(k));
  const pool = matches.length ? matches : columns.map((c, i) => [c, i]).filter(([c]) => c.key.includes(k));
  if (!pool.length) return null;
  const [, index] = edge === 'start' ? pool[0] : pool[pool.length - 1];
  return edge === 'start' ? index : index + 1;
}

/** Map a timestamp onto fractional column space, clamped to the chart. */
export function dateToOffset(time, columns) {
  if (!columns.length || columns[0].start === null) return null;
  if (time <= columns[0].start) return 0;
  const last = columns[columns.length - 1];
  if (time >= last.end) return columns.length;
  for (let i = 0; i < columns.length; i += 1) {
    const col = columns[i];
    if (time >= col.start && time < col.end) return i + (time - col.start) / (col.end - col.start);
  }
  return columns.length;
}

/** Where the `@today` marker sits, or null. */
export function todayOffset(doc, now = Date.now()) {
  if (!doc.todaySpec || doc.mode !== 'timeline') return null;
  const spec = String(doc.todaySpec).trim();
  if (/^(now|today)$/i.test(spec)) return dateToOffset(now, doc.columns);
  const span = resolveSpan(spec, doc.columns);
  return span ? span[0] : null;
}

const truncateMsg = (s) => (s.length > 40 ? s.slice(0, 37) + '…' : s);
