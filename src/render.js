/**
 * Model -> SVG string.
 *
 * Deliberate constraints, so the same output works in a browser, a README, a
 * canvas export and Figma:
 *   - no <style> blocks (GitHub's SVG sanitiser is picky), presentation
 *     attributes only;
 *   - no foreignObject and no external references, so canvas rasterising never
 *     taints and PNG export keeps working;
 *   - no clipPath: progress fills are their own rounded rects, so nothing
 *     overflows if a renderer drops the clip.
 */

import { getTheme } from './themes.js';
import { textWidth, truncate, wrapText } from './measure.js';
import { todayOffset } from './parse.js';

const PAD = 32;
const ROW = 40;
const BAR = 30;
const RADIUS = 9;

export function render(doc, options = {}) {
  const theme = getTheme(options.theme || doc.theme);
  const width = Math.min(4000, Math.max(480, options.width || doc.width || 1200));
  const now = options.now ?? Date.now();
  const colors = palette(doc, theme);
  return doc.mode === 'timeline' && doc.columns.length
    ? timeline(doc, theme, width, colors, now)
    : board(doc, theme, width, colors);
}

/* ------------------------------------------------------------------ colour */

function palette(doc, theme) {
  const accents = theme.accents;
  const lanes = new Map();
  doc.lanes.forEach((lane, i) => lanes.set(lane, accents[i % accents.length]));

  const tags = new Map();
  let next = doc.lanes.length;
  for (const lane of doc.lanes) {
    for (const item of lane.items) {
      for (const tag of item.tags) {
        if (!tags.has(tag)) {
          tags.set(tag, accents[next % accents.length]);
          next += 1;
        }
      }
    }
  }

  const item = (it, lane) => (it.tags.length && tags.get(it.tags[0])) || lanes.get(lane) || accents[0];

  // A lane's stripe takes the colour its own bars mostly use, so the stripe and
  // the bars beside it never disagree.
  const stripes = new Map();
  for (const lane of doc.lanes) {
    const tally = new Map();
    for (const it of lane.items) {
      const c = item(it, lane);
      tally.set(c, (tally.get(c) || 0) + 1);
    }
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    stripes.set(lane, top ? top[0] : lanes.get(lane));
  }

  return { tags, item, lane: (lane) => stripes.get(lane) || lanes.get(lane) || accents[0] };
}

/* ----------------------------------------------------------------- shared  */

function head(doc, theme, width, colors, out) {
  let y = PAD;
  if (doc.title) {
    out.push(text(PAD, y + 24, doc.title, { size: 30, weight: 700, fill: theme.text, spacing: -0.6 }));
    y += 36;
  }
  if (doc.subtitle) {
    out.push(text(PAD, y + 11, doc.subtitle, { size: 14.5, fill: theme.muted }));
    y += 24;
  }

  if (colors.tags.size) legend(theme, width, colors, out);
  return doc.title || doc.subtitle ? y + 16 : PAD;
}

function legend(theme, width, colors, out) {
  const size = 11.5;
  const entries = [...colors.tags.entries()].slice(0, 6);
  const widths = entries.map(([tag]) => 9 + 6 + textWidth(tag, size, 600));
  const total = widths.reduce((a, b) => a + b, 0) + 16 * (entries.length - 1);
  if (total > width * 0.46) return;

  let x = width - PAD - total;
  entries.forEach(([tag, colour], i) => {
    out.push(`<circle cx="${r2(x + 4)}" cy="${PAD + 12}" r="4" fill="${colour}"/>`);
    out.push(text(x + 15, PAD + 16, tag, { size, weight: 600, fill: theme.muted }));
    x += widths[i] + 16;
  });
}

function foot(doc, theme, width, y, out) {
  if (!doc.footer) return y + PAD;
  out.push(text(PAD, y + 20, doc.footer, { size: 11.5, fill: theme.faint, spacing: 0.3 }));
  return y + 42;
}

function frame(theme, width, height) {
  return [
    `<defs><radialGradient id="plGlow" cx="14%" cy="0%" r="92%">`,
    `<stop offset="0%" stop-color="${theme.bgGlow}" stop-opacity="${theme.dark ? 0.85 : 0.6}"/>`,
    `<stop offset="100%" stop-color="${theme.bgGlow}" stop-opacity="0"/>`,
    `</radialGradient></defs>`,
    `<rect x="0" y="0" width="${width}" height="${height}" rx="20" fill="${theme.bg}"/>`,
    `<rect x="0" y="0" width="${width}" height="${height}" rx="20" fill="url(#plGlow)"/>`,
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="19.5" fill="none" stroke="${theme.border}"/>`,
  ].join('');
}

const doc2svg = (theme, width, height, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
  `font-family="${esc(theme.font)}" role="img">` +
  frame(theme, width, height) +
  body +
  '</svg>';

/* --------------------------------------------------------------- timeline  */

function timeline(doc, theme, width, colors, now) {
  const out = [];
  const gutter = Math.round(Math.min(200, Math.max(104, width * 0.15)));
  const trackX = PAD + gutter;
  const trackW = width - PAD * 2 - gutter;
  const colW = trackW / doc.columns.length;

  const top = head(doc, theme, width, colors, out);
  // Tall enough that the TODAY pill sits below the column labels, not on them.
  const headerH = 48;
  const lanesTop = top + headerH + 8;

  // Lane geometry first: grid and the today marker need the full extent.
  let y = lanesTop;
  const lanes = doc.lanes.map((lane) => {
    const rows = Math.max(1, lane.items.length);
    const height = 14 + rows * ROW + 10;
    const box = { lane, y, height, rows };
    y += height + 10;
    return box;
  });
  const lanesBottom = lanes.length ? y - 10 : lanesTop;

  // Column headers.
  doc.columns.forEach((col, i) => {
    const cx = trackX + colW * (i + 0.5);
    out.push(text(cx, top + 15, col.label.toUpperCase(), {
      size: 11, weight: 700, fill: theme.muted, anchor: 'middle', spacing: 1.1,
    }));
  });
  out.push(line(PAD, top + headerH, width - PAD, top + headerH, theme.border));

  // Lane bands.
  lanes.forEach((box, i) => {
    out.push(rect(PAD, box.y, width - PAD * 2, box.height, 14, {
      fill: i % 2 ? theme.laneAlt : theme.lane,
    }));
  });

  // Column grid, drawn over the bands but under the bars.
  for (let i = 1; i < doc.columns.length; i += 1) {
    const x = trackX + colW * i;
    out.push(line(x, top + headerH, x, lanesBottom, theme.grid, { opacity: 0.4 }));
  }

  // Today marker.
  const today = todayOffset(doc, now);
  if (today !== null) {
    const x = trackX + colW * today;
    out.push(line(x, top + 44, x, lanesBottom, theme.today, { opacity: 0.55, dash: '5 5', w: 2 }));
    const label = 'TODAY';
    const w = textWidth(label, 10, 700) + 18;
    out.push(rect(x - w / 2, top + 24, w, 18, 9, { fill: theme.today }));
    out.push(text(x, top + 37, label, {
      size: 10, weight: 700, anchor: 'middle', spacing: 0.8,
      fill: theme.dark ? theme.bg : '#FFFFFF',
    }));
  }

  // Lanes and bars.
  lanes.forEach((box) => {
    const accent = colors.lane(box.lane);
    if (box.lane.name) {
      out.push(rect(PAD + 14, box.y + 14, 3, box.height - 28, 2, { fill: accent }));
      const nameLines = wrapText(box.lane.name, 13, gutter - 42, 600, 2);
      const startY = box.y + box.height / 2 - (nameLines.length - 1) * 8.5;
      nameLines.forEach((ln, i) => {
        out.push(text(PAD + 27, startY + i * 17 + 4.5, ln, { size: 13, weight: 600, fill: theme.text }));
      });
    }

    const rowsTop = box.y + (box.height - box.rows * ROW) / 2;
    box.lane.items.forEach((item, i) => {
      const barY = rowsTop + i * ROW + (ROW - BAR) / 2;
      bar(item, box.lane, barY, { theme, colors, trackX, trackW, colW, out });
    });
  });

  const end = foot(doc, theme, width, lanesBottom, out);
  return doc2svg(theme, width, Math.round(end), out.join(''));
}

function bar(item, lane, y, ctx) {
  const { theme, colors, trackX, trackW, colW, out } = ctx;
  const accent = colors.item(item, lane);
  const statusColour = { done: theme.ok, shipped: theme.ok, risk: theme.warn, blocked: theme.danger, now: accent }[item.status];

  // No date? Show it honestly rather than guessing a position.
  if (!item.span) {
    out.push(rect(trackX + 3, y, trackW - 6, BAR, RADIUS, {
      fill: 'none', stroke: theme.faint, dash: '4 4', opacity: 0.75,
    }));
    out.push(text(trackX + 14, y + BAR / 2 + 4.5, truncate(item.title, 13, trackW - 100, 500), {
      size: 13, weight: 500, fill: theme.muted,
    }));
    out.push(text(trackX + trackW - 14, y + BAR / 2 + 4, 'no date', {
      size: 10.5, weight: 600, fill: theme.faint, anchor: 'end', spacing: 0.5,
    }));
    return;
  }

  const x = trackX + item.span[0] * colW + 3;
  const w = Math.max(28, (item.span[1] - item.span[0]) * colW - 6);
  const risky = item.status === 'risk' || item.status === 'blocked';

  out.push(rect(x, y, w, BAR, RADIUS, { fill: accent, opacity: 0.16 }));
  if (item.progress) {
    const pw = Math.max(4, w * item.progress);
    out.push(rect(x, y, pw, BAR, Math.min(RADIUS, pw / 2), { fill: accent, opacity: 0.44 }));
  }
  out.push(rect(x + 0.5, y + 0.5, w - 1, BAR - 1, RADIUS - 0.5, {
    fill: 'none',
    stroke: risky ? statusColour : accent,
    opacity: risky ? 0.85 : 0.45,
    dash: risky ? '5 4' : null,
  }));

  let labelX = x + 12;
  if (statusColour) {
    out.push(`<circle cx="${r2(x + 13)}" cy="${r2(y + BAR / 2)}" r="4" fill="${statusColour}"/>`);
    labelX = x + 25;
  }

  let right = x + w - 11;
  if (item.owner && w > 150) {
    out.push(`<circle cx="${r2(right - 10)}" cy="${r2(y + BAR / 2)}" r="10" fill="${accent}" fill-opacity="0.38"/>`);
    out.push(text(right - 10, y + BAR / 2 + 3.5, initials(item.owner), {
      size: 9.5, weight: 700, fill: theme.text, anchor: 'middle',
    }));
    right -= 26;
  }
  if (item.progress !== null && w > 116) {
    const pct = `${Math.round(item.progress * 100)}%`;
    out.push(text(right, y + BAR / 2 + 4, pct, { size: 11, weight: 600, fill: theme.muted, anchor: 'end' }));
    right -= textWidth(pct, 11, 600) + 10;
  }

  const room = right - labelX - 6;
  if (room > 24) {
    out.push(text(labelX, y + BAR / 2 + 4.5, truncate(item.title, 13, room, 600), {
      size: 13, weight: 600, fill: theme.text, opacity: item.status === 'done' || item.status === 'shipped' ? 0.72 : 1,
    }));
  }
}

/* ------------------------------------------------------------------ board  */

function board(doc, theme, width, colors) {
  const out = [];
  const top = head(doc, theme, width, colors, out);
  const lanes = doc.lanes.length ? doc.lanes : [{ name: '', items: [] }];

  const gap = 18;
  const colW = (width - PAD * 2 - gap * (lanes.length - 1)) / lanes.length;
  const inner = colW - 28;

  const columns = lanes.map((lane) => {
    const cards = lane.items.map((item) => layoutCard(item, inner));
    const height = 54 + cards.reduce((sum, c) => sum + c.height + 10, 0) + 4;
    return { lane, cards, height };
  });
  const panelH = Math.max(120, ...columns.map((c) => c.height));

  columns.forEach((col, i) => {
    const x = PAD + i * (colW + gap);
    const accent = colors.lane(col.lane);
    out.push(rect(x, top, colW, panelH, 16, { fill: theme.lane }));
    out.push(rect(x, top, colW, 3, 1.5, { fill: accent, opacity: 0.9 }));

    out.push(text(x + 14, top + 30, truncate(col.lane.name || 'Untitled', 14, inner - 34, 700), {
      size: 14, weight: 700, fill: theme.text,
    }));
    const count = String(col.lane.items.length);
    out.push(text(x + colW - 14, top + 30, count, { size: 12, weight: 700, fill: theme.faint, anchor: 'end' }));

    let y = top + 48;
    col.cards.forEach((card) => {
      drawCard(card, x + 14, y, inner, theme, colors.item(card.item, col.lane), out);
      y += card.height + 10;
    });
  });

  const end = foot(doc, theme, width, top + panelH, out);
  return doc2svg(theme, width, Math.round(end), out.join(''));
}

function layoutCard(item, width) {
  const pad = 13;
  const titleLines = wrapText(item.title, 13.5, width - pad * 2 - 10, 600, 3);
  const notes = item.notes.slice(0, 2);
  const hasMeta = Boolean(item.owner) || item.progress !== null || Boolean(item.status);
  const height =
    pad +
    titleLines.length * 19 +
    notes.length * 16 +
    (item.tags.length ? 24 : 0) +
    (hasMeta ? 22 : 0) +
    pad -
    4;
  return { item, titleLines, notes, hasMeta, height };
}

function drawCard(card, x, y, width, theme, accent, out) {
  const { item, titleLines, notes, hasMeta } = card;
  const pad = 13;
  out.push(rect(x, y, width, card.height, 11, { fill: theme.panel }));
  out.push(rect(x, y, 3, card.height, 1.5, { fill: accent, opacity: 0.95 }));
  out.push(rect(x + 0.5, y + 0.5, width - 1, card.height - 1, 10.5, {
    fill: 'none', stroke: theme.border, opacity: 0.85,
  }));

  let cursor = y + pad + 10;
  const dim = item.status === 'done' || item.status === 'shipped';
  titleLines.forEach((ln) => {
    out.push(text(x + pad, cursor, ln, { size: 13.5, weight: 600, fill: theme.text, opacity: dim ? 0.78 : 1 }));
    cursor += 19;
  });
  notes.forEach((note) => {
    out.push(text(x + pad, cursor + 2, truncate(note, 11.5, width - pad * 2, 400), {
      size: 11.5, fill: theme.muted,
    }));
    cursor += 16;
  });

  if (item.tags.length) {
    let tx = x + pad;
    for (const tag of item.tags.slice(0, 3)) {
      const w = textWidth(tag, 10.5, 600) + 16;
      if (tx + w > x + width - pad) break;
      out.push(rect(tx, cursor + 2, w, 17, 8.5, { fill: accent, opacity: 0.18 }));
      out.push(text(tx + w / 2, cursor + 14, tag, { size: 10.5, weight: 600, fill: theme.text, anchor: 'middle', opacity: 0.9 }));
      tx += w + 6;
    }
    cursor += 24;
  }

  if (hasMeta) {
    const statusColour = { done: theme.ok, shipped: theme.ok, risk: theme.warn, blocked: theme.danger }[item.status];
    if (item.owner) {
      out.push(`<circle cx="${r2(x + pad + 8)}" cy="${r2(cursor + 6)}" r="8" fill="${accent}" fill-opacity="0.34"/>`);
      out.push(text(x + pad + 8, cursor + 9, initials(item.owner), {
        size: 8.5, weight: 700, fill: theme.text, anchor: 'middle',
      }));
    }
    if (item.progress !== null) {
      const trackW = 56;
      const tx = x + width - pad - trackW - 42;
      out.push(rect(tx, cursor + 3, trackW, 6, 3, { fill: theme.grid, opacity: 0.5 }));
      out.push(rect(tx, cursor + 3, Math.max(3, trackW * item.progress), 6, 3, { fill: statusColour || accent }));
      out.push(text(x + width - pad, cursor + 10, `${Math.round(item.progress * 100)}%`, {
        size: 10.5, weight: 600, fill: theme.muted, anchor: 'end',
      }));
    } else if (statusColour) {
      out.push(text(x + width - pad, cursor + 10, item.status, {
        size: 10.5, weight: 700, fill: statusColour, anchor: 'end', spacing: 0.4,
      }));
    }
  }
}

/* ----------------------------------------------------------------- atoms   */

export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const r2 = (n) => Math.round(n * 100) / 100;

function rect(x, y, w, h, r, o = {}) {
  const attrs = [`x="${r2(x)}"`, `y="${r2(y)}"`, `width="${r2(Math.max(0, w))}"`, `height="${r2(Math.max(0, h))}"`, `rx="${r2(r)}"`];
  attrs.push(`fill="${o.fill || 'none'}"`);
  if (o.opacity != null && o.fill && o.fill !== 'none') attrs.push(`fill-opacity="${o.opacity}"`);
  if (o.stroke) {
    attrs.push(`stroke="${o.stroke}"`);
    if (o.opacity != null && (!o.fill || o.fill === 'none')) attrs.push(`stroke-opacity="${o.opacity}"`);
    if (o.dash) attrs.push(`stroke-dasharray="${o.dash}"`);
  }
  return `<rect ${attrs.join(' ')}/>`;
}

function line(x1, y1, x2, y2, stroke, o = {}) {
  const attrs = [`x1="${r2(x1)}"`, `y1="${r2(y1)}"`, `x2="${r2(x2)}"`, `y2="${r2(y2)}"`, `stroke="${stroke}"`];
  if (o.w) attrs.push(`stroke-width="${o.w}"`);
  if (o.opacity != null) attrs.push(`stroke-opacity="${o.opacity}"`);
  if (o.dash) attrs.push(`stroke-dasharray="${o.dash}"`);
  return `<line ${attrs.join(' ')}/>`;
}

function text(x, y, value, o = {}) {
  const attrs = [`x="${r2(x)}"`, `y="${r2(y)}"`, `fill="${o.fill}"`, `font-size="${o.size}"`];
  if (o.weight) attrs.push(`font-weight="${o.weight}"`);
  if (o.anchor) attrs.push(`text-anchor="${o.anchor}"`);
  if (o.spacing) attrs.push(`letter-spacing="${o.spacing}"`);
  if (o.opacity != null && o.opacity !== 1) attrs.push(`fill-opacity="${o.opacity}"`);
  return `<text ${attrs.join(' ')}>${esc(value)}</text>`;
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
