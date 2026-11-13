// Small charts for the calendar: one card per measure, over the days of a week
// or a month. Bars for daily amounts, a line for body weight. One series per
// chart (its title names it), a dashed line for the target or reference, and
// a tooltip on hover or tap.

import { h } from './dom.js';
import { svg } from './components.js';
import { fmt } from '../core/dates.js';
import { num } from '../core/format.js';

const W = 320;          // drawing units; the SVG scales to the card width
const H = 132;
const PAD = { top: 12, right: 6, bottom: 20, left: 34 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** A tidy top for the scale: 1, 2, 2.5 or 5 × a power of ten. */
function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
}

function shortNum(v) {
  if (Math.abs(v) >= 10000) return `${num(v / 1000, 0)}k`;
  if (Math.abs(v) >= 1000) return `${num(v / 1000, 1)}k`;
  return num(v, Math.abs(v) < 10 && v % 1 ? 1 : 0);
}

/** Day labels under the plot: every day for a week, every few days for a month. */
function dayLabel(day, i, count) {
  if (count <= 7) return fmt(day, { weekday: 'narrow' });
  const d = Number(day.slice(8));
  return d === 1 || d % 5 === 0 ? String(d) : '';
}

function frame({ title, color, stat, key, plot }) {
  return h('section', { class: 'card chart-card', style: { '--c': `var(--c-${color})` } },
    h('div', { class: 'chart-head' },
      h('div', { class: 'chart-title' }, h('span', { class: 'dot', style: { '--c': `var(--c-${color})` } }), title),
      stat ? h('div', { class: 'chart-stat' }, stat) : null),
    plot,
    key ? h('div', { class: 'chart-key' }, h('span', { class: 'dash' }), key) : null);
}

/** Wire a tooltip to hit areas: hover on a mouse, tap on a phone. */
function withTooltip(card, plotEl, items) {
  const tip = h('div', { class: 'chart-tip', role: 'status' });
  card.append(tip);
  let active = null;
  const show = (item) => {
    if (active) active.mark?.classList.remove('hot');
    active = item;
    item.mark?.classList.add('hot');
    tip.textContent = item.text;
    const box = plotEl.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const x = box.left - cardBox.left + (item.x / W) * box.width;
    const y = box.top - cardBox.top + (item.y / H) * box.height - 6;
    tip.style.left = `${Math.min(Math.max(x, 60), cardBox.width - 60)}px`;
    tip.style.top = `${y}px`;
    tip.classList.add('show');
  };
  const hide = () => { if (active) active.mark?.classList.remove('hot'); active = null; tip.classList.remove('show'); };
  for (const item of items) {
    item.hit.addEventListener('pointerenter', () => show(item));
    item.hit.addEventListener('click', () => (active === item ? hide() : show(item)));
  }
  plotEl.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
}

function axes(max, count, days) {
  const lines = [];
  for (const f of [0, 0.5, 1]) {
    const y = PAD.top + PLOT_H * (1 - f);
    lines.push(svg('line', { class: 'grid', x1: PAD.left, x2: W - PAD.right, y1: y, y2: y }));
    lines.push(svg('text', { class: 'axis-text', x: PAD.left - 5, y: y + 3, 'text-anchor': 'end' }, shortNum(max * f)));
  }
  const step = PLOT_W / count;
  days.forEach((d, i) => {
    const label = dayLabel(d, i, count);
    if (label) lines.push(svg('text', { class: 'axis-text', x: PAD.left + step * (i + 0.5), y: H - 5, 'text-anchor': 'middle' }, label));
  });
  return lines;
}

/**
 * Daily amounts as bars.
 * values: number per day (already in display units) or null for nothing logged.
 * goal: { value, label } drawn as a dashed line (target, else reference).
 */
export function barChart({ title, color, days, values, unit, goal, stat }) {
  const count = days.length;
  const max = niceMax(Math.max(goal?.value || 0, ...values.map((v) => v || 0)) * 1.05);
  const step = PLOT_W / count;
  const barW = Math.max(2, Math.min(22, step * 0.62));
  const y = (v) => PAD.top + PLOT_H * (1 - v / max);
  const items = [];
  const marks = [];

  days.forEach((d, i) => {
    const v = values[i];
    const cx = PAD.left + step * (i + 0.5);
    let mark = null;
    if (v > 0) {
      const top = y(v);
      const hgt = PAD.top + PLOT_H - top;
      const r = Math.min(4, barW / 2, hgt);
      // Rounded at the top only, flat on the baseline.
      mark = svg('path', {
        class: 'bar',
        d: `M${cx - barW / 2},${PAD.top + PLOT_H} V${top + r} Q${cx - barW / 2},${top} ${cx - barW / 2 + r},${top} H${cx + barW / 2 - r} Q${cx + barW / 2},${top} ${cx + barW / 2},${top + r} V${PAD.top + PLOT_H} Z`,
      });
      marks.push(mark);
    }
    const hit = svg('rect', { class: 'hit', x: cx - step / 2, y: PAD.top, width: step, height: PLOT_H });
    items.push({ hit, mark, x: cx, y: v > 0 ? y(v) : PAD.top + PLOT_H, text: `${fmt(d, { weekday: 'short', day: 'numeric', month: 'short' })}: ${v > 0 ? `${num(v, v < 10 ? 1 : 0)} ${unit}` : 'nothing logged'}` });
  });

  const goalLine = goal?.value > 0
    ? svg('line', { class: 'goal-line', x1: PAD.left, x2: W - PAD.right, y1: y(goal.value), y2: y(goal.value) })
    : null;

  const plot = h('div', { class: 'chart' });
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${title} per day` },
    axes(max, count, days), marks, goalLine, items.map((it) => it.hit));
  plot.append(root);
  const card = frame({ title, color, stat, key: goal?.value > 0 ? `${goal.label} ${num(goal.value, goal.value < 10 ? 1 : 0)} ${unit}` : null, plot });
  withTooltip(card, plot, items);
  return card;
}

/**
 * Body weight as a line through the days that have a weigh-in.
 * values: number per day (display units) or null.
 */
export function lineChart({ title, color, days, values, unit, stat, empty }) {
  const points = values.map((v, i) => (v > 0 ? { i, v } : null)).filter(Boolean);
  if (!points.length) return frame({ title, color, plot: h('div', { class: 'chart-empty' }, empty) });
  const count = days.length;
  const lo = Math.min(...points.map((p) => p.v));
  const hi = Math.max(...points.map((p) => p.v));
  const spread = Math.max(1, hi - lo);
  const min = Math.floor(lo - spread * 0.3);
  const max = Math.ceil(hi + spread * 0.3);
  const step = PLOT_W / count;
  const x = (i) => PAD.left + step * (i + 0.5);
  const y = (v) => PAD.top + PLOT_H * (1 - (v - min) / (max - min));

  const grid = [];
  for (const f of [0, 0.5, 1]) {
    const yy = PAD.top + PLOT_H * (1 - f);
    grid.push(svg('line', { class: 'grid', x1: PAD.left, x2: W - PAD.right, y1: yy, y2: yy }));
    grid.push(svg('text', { class: 'axis-text', x: PAD.left - 5, y: yy + 3, 'text-anchor': 'end' }, num(min + (max - min) * f, 1)));
  }
  days.forEach((d, i) => {
    const label = dayLabel(d, i, count);
    if (label) grid.push(svg('text', { class: 'axis-text', x: x(i), y: H - 5, 'text-anchor': 'middle' }, label));
  });

  const line = points.length > 1 ? svg('path', { class: 'line', d: points.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.v)}`).join(' ') }) : null;
  const items = points.map((p) => {
    const mark = svg('circle', { class: 'point', cx: x(p.i), cy: y(p.v), r: 4 });
    const hit = svg('rect', { class: 'hit', x: x(p.i) - step / 2, y: PAD.top, width: step, height: PLOT_H });
    return { hit, mark, x: x(p.i), y: y(p.v), text: `${fmt(days[p.i], { weekday: 'short', day: 'numeric', month: 'short' })}: ${num(p.v, 1)} ${unit}` };
  });

  const plot = h('div', { class: 'chart' });
  plot.append(svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${title} per day` },
    grid, line, items.map((it) => it.mark), items.map((it) => it.hit)));
  const card = frame({ title, color, stat, plot });
  withTooltip(card, plot, items);
  return card;
}
