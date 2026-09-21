/**
 * Palettes.
 *
 * Bars are drawn as an accent colour at low opacity over the lane background,
 * so label text always uses `text` and never needs a contrast calculation
 * against the accent itself. That is what keeps every theme readable without
 * per-colour tuning.
 */

const FONT = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const THEMES = {
  aurora: {
    label: 'Aurora',
    dark: true,
    font: FONT,
    bg: '#0B1020',
    bgGlow: '#161F3D',
    panel: '#121A33',
    lane: '#141D38',
    laneAlt: '#101831',
    border: '#243056',
    grid: '#2A3766',
    text: '#EEF2FF',
    muted: '#93A0C8',
    faint: '#5C6A94',
    accents: ['#818CF8', '#22D3EE', '#34D399', '#F472B6', '#FBBF24', '#A78BFA', '#4ADE80', '#FB7185'],
    ok: '#34D399',
    warn: '#FBBF24',
    danger: '#FB7185',
    today: '#22D3EE',
  },
  noir: {
    label: 'Noir',
    dark: true,
    font: FONT,
    bg: '#0A0A0B',
    bgGlow: '#17171A',
    panel: '#121214',
    lane: '#141416',
    laneAlt: '#101011',
    border: '#2A2A2E',
    grid: '#323238',
    text: '#F4F4F5',
    muted: '#A1A1AA',
    faint: '#63636B',
    accents: ['#FAFAFA', '#A1A1AA', '#F97316', '#D4D4D8', '#71717A', '#FDBA74', '#E4E4E7', '#52525B'],
    ok: '#A3E635',
    warn: '#F97316',
    danger: '#F87171',
    today: '#F97316',
  },
  slate: {
    label: 'Slate',
    dark: false,
    font: FONT,
    bg: '#FFFFFF',
    bgGlow: '#F1F5F9',
    panel: '#F8FAFC',
    lane: '#F8FAFC',
    laneAlt: '#F1F5F9',
    border: '#E2E8F0',
    grid: '#CBD5E1',
    text: '#0F172A',
    muted: '#64748B',
    faint: '#94A3B8',
    accents: ['#4F46E5', '#0891B2', '#059669', '#DB2777', '#D97706', '#7C3AED', '#16A34A', '#E11D48'],
    ok: '#059669',
    warn: '#D97706',
    danger: '#E11D48',
    today: '#4F46E5',
  },
  dawn: {
    label: 'Dawn',
    dark: false,
    font: FONT,
    bg: '#FFFCF7',
    bgGlow: '#FDF1E3',
    panel: '#FDF6EC',
    lane: '#FDF5EA',
    laneAlt: '#FBEEDC',
    border: '#EADBC6',
    grid: '#DFC9AB',
    text: '#26201A',
    muted: '#7A6A57',
    faint: '#A6937B',
    accents: ['#C2410C', '#0F766E', '#7C2D12', '#B45309', '#9D174D', '#15803D', '#A16207', '#BE123C'],
    ok: '#15803D',
    warn: '#B45309',
    danger: '#BE123C',
    today: '#C2410C',
  },
  sunset: {
    label: 'Sunset',
    dark: true,
    font: FONT,
    bg: '#1A0B1F',
    bgGlow: '#3A1230',
    panel: '#25102C',
    lane: '#2A1332',
    laneAlt: '#220F2A',
    border: '#4A2149',
    grid: '#5C2A58',
    text: '#FDF2F8',
    muted: '#D8A8C8',
    faint: '#9C6E91',
    accents: ['#FB923C', '#F472B6', '#FCD34D', '#C084FC', '#FB7185', '#FDBA74', '#E879F9', '#FCA5A5'],
    ok: '#86EFAC',
    warn: '#FCD34D',
    danger: '#FB7185',
    today: '#FB923C',
  },
};

export const THEME_NAMES = Object.keys(THEMES);
export const DEFAULT_THEME = 'aurora';

export function getTheme(name) {
  return THEMES[String(name || '').toLowerCase()] || THEMES[DEFAULT_THEME];
}
