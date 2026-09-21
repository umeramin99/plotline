/**
 * Text measurement without a DOM.
 *
 * The renderer runs in three places -- browser, CLI, CI -- and all three must
 * produce byte-identical SVG. Asking the DOM for text metrics would break that,
 * so we approximate advance widths from a table calibrated against Inter and the
 * common system-ui stack. Accurate to a few percent, which is all truncation and
 * wrapping need.
 */

const NARROW = "il|.,:;'`!Ijft()[]{}/\\-";
const WIDE = 'mwMW';

/** Advance width of a single character, as a multiple of the font size. */
export function charWidth(ch) {
  if (ch === ' ') return 0.28;
  if (ch === '%') return 0.87;
  if (ch === '\u2014') return 0.92; // em dash
  if (ch === '\u2013') return 0.55; // en dash
  if (ch === '\u2026') return 0.88; // ellipsis
  if (NARROW.includes(ch)) return ch === 'i' || ch === 'l' || ch === '|' || ch === '.' || ch === ',' ? 0.3 : 0.38;
  if (WIDE.includes(ch)) return 0.9;
  if (ch >= '0' && ch <= '9') return 0.62;
  if (ch >= 'A' && ch <= 'Z') return 0.68;
  if (ch >= 'a' && ch <= 'z') return 0.55;
  // Anything else (punctuation, emoji, CJK) gets a conservative guess.
  return ch.codePointAt(0) > 0x2e80 ? 1 : 0.58;
}

/** Width of `text` rendered at `size` px in `weight`. */
// The stack falls back to whatever the machine has, and most fallbacks are a
// little wider than Inter. A small margin is cheaper than overlapping text.
const SAFETY = 1.1;

export function textWidth(text, size = 13, weight = 400) {
  let units = 0;
  for (const ch of String(text)) units += charWidth(ch);
  const bolding = weight >= 600 ? 1.09 : 1;
  return units * size * bolding * SAFETY;
}

/** Shorten `text` with an ellipsis so it fits inside `maxWidth`. */
export function truncate(text, size, maxWidth, weight = 400) {
  const str = String(text);
  if (maxWidth <= 0) return '';
  if (textWidth(str, size, weight) <= maxWidth) return str;
  const ellipsis = textWidth('\u2026', size, weight);
  let out = '';
  let used = 0;
  for (const ch of str) {
    const w = charWidth(ch) * size * (weight >= 600 ? 1.09 : 1) * SAFETY;
    if (used + w + ellipsis > maxWidth) break;
    out += ch;
    used += w;
  }
  return out.replace(/\s+$/, '') + '\u2026';
}

/** Greedy word wrap. Returns at most `maxLines` lines, last one ellipsised. */
export function wrapText(text, size, maxWidth, weight = 400, maxLines = 2) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word;
    if (textWidth(candidate, size, weight) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    const consumed = lines.join(' ').length;
    const rest = String(text).slice(consumed).trim();
    if (rest) lines[maxLines - 1] = truncate(lines[maxLines - 1] + ' ' + rest, size, maxWidth, weight);
    else lines[maxLines - 1] = truncate(lines[maxLines - 1], size, maxWidth, weight);
  }
  return lines;
}
