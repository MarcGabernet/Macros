// The calendar: a week or a month at a glance, with daily, weekly and monthly totals.

import { h, icon } from '../dom.js';
import { store } from '../../core/store.js';
import { entriesByDate, rangeTotals } from '../../core/calc.js';
import {
  today, addDays, addMonths, weekDays, monthDays, monthWeeks, sameMonth, fmt, fmtRange,
} from '../../core/dates.js';
import { nutrientNum, withUnit, num } from '../../core/format.js';
import { activeNutrients, segmented, macroLine, dot } from '../components.js';
import { toDisplay } from '../../core/nutrients.js';
import { weighInOn, toWeightUnit } from '../../core/weight.js';
import { barChart, lineChart } from '../charts.js';
import { logFood } from './day.js';

/**
 * Graphs for the period: body weight (with daily weigh-ins), then energy and
 * each macro per day, with a dashed line at its target (or its reference).
 */
function chartsSection(db, nutrients, days, byDate) {
  const stats = rangeTotals(days, byDate, db.foods);
  const cards = [];
  if ((db.settings.weightMode || 'weighins') === 'weighins') {
    const unit = db.settings.weightUnit || 'kg';
    const values = days.map((d) => { const w = weighInOn(db, d); return w ? toWeightUnit(w.kg, unit) : null; });
    const logged = values.filter((v) => v > 0);
    const change = logged.length > 1 ? logged[logged.length - 1] - logged[0] : null;
    cards.push(lineChart({
      title: 'Weight', color: 'blue', days, values, unit,
      stat: change == null ? null : `${change > 0 ? '+' : change < 0 ? '−' : '±'}${num(Math.abs(change), 1)} ${unit}`,
      empty: 'No weigh-ins in this period',
    }));
  }
  for (const n of nutrients.filter((x) => x.group === 'macro' && !x.depth)) {
    const values = days.map((d) => { const day = stats.perDay.get(d); return day.count ? toDisplay(n, day.values[n.id] || 0) : null; });
    const goalBase = n.target > 0 ? n.target : n.reference;
    cards.push(barChart({
      title: n.name, color: n.color, days, values, unit: n.unit,
      goal: goalBase ? { value: toDisplay(n, goalBase), label: n.target > 0 ? 'Target' : 'Ref' } : null,
      stat: stats.logged ? `avg ${withUnit(n, stats.average[n.id] || 0)}` : null,
    }));
  }
  return h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Graphs')), cards);
}

/** Total and daily average of every nutrient over a period. */
function totalsTable(stats, nutrients, title) {
  return h('section', {},
    h('div', { class: 'section-head' },
      h('h2', {}, title),
      h('span', { class: 'muted' }, stats.logged ? `${stats.logged} day${stats.logged > 1 ? 's' : ''} logged` : 'Nothing logged')),
    h('div', { class: 'card' },
      h('table', { class: 'totals' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Nutrient'), h('th', { scope: 'col' }, 'Total'), h('th', { scope: 'col' }, 'Daily average'))),
        h('tbody', {}, nutrients.map((n) => h('tr', { class: n.depth ? 'sub' : null },
          h('th', { scope: 'row' }, n.depth ? `of which ${n.name.toLowerCase()}` : [dot(n), n.name]),
          h('td', {}, withUnit(n, stats.total[n.id] || 0)),
          h('td', {}, stats.logged ? withUnit(n, stats.average[n.id] || 0) : '–'))))),
      stats.logged ? h('div', { class: 'table-note' }, 'The average counts only the days with something logged') : null));
}

function weekView({ ui, go }, db, nutrients, byDate) {
  const days = weekDays(ui.calDate, db.settings.weekStart);
  const stats = rangeTotals(days, byDate, db.foods);
  const main = nutrients[0];
  const t = today();
  // Bars compare the days of this week: the scale tops out at the target, or the highest day.
  const scaleMax = main ? Math.max(main.target || 0, ...days.map((d) => stats.perDay.get(d).values[main.id] || 0)) : 0;

  const rows = days.map((d) => {
    const day = stats.perDay.get(d);
    const value = main ? day.values[main.id] || 0 : 0;
    return h('div', { class: `row-wrap day-row${d === t ? ' is-today' : ''}` },
      h('button', { class: 'row', type: 'button', onClick: () => go({ tab: 'day', date: d }), 'aria-label': `Open ${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}` },
        h('div', { class: 'day-label' },
          h('span', { class: 'day-name' }, fmt(d, { weekday: 'short' })),
          h('span', { class: 'day-num' }, fmt(d, { day: 'numeric' }))),
        h('div', { class: 'row-main' },
          day.count
            ? [
              main ? h('div', { class: 'meter meter-thin', style: { '--c': `var(--c-${main.color})` } },
                h('div', { class: 'meter-fill', style: { width: `${scaleMax ? Math.min(100, (value / scaleMax) * 100).toFixed(1) : 0}%` } })) : null,
              macroLine(day.values, nutrients),
            ]
            : h('span', { class: 'muted' }, 'Nothing logged'))),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Add food on ${fmt(d, { weekday: 'long' })}`, onClick: () => logFood(d) }, icon('plus', 18)));
  });

  return {
    title: fmtRange(days[0], days[6]),
    isCurrent: days.includes(t),
    body: [h('div', { class: 'card list' }, rows), chartsSection(db, nutrients, days, byDate), totalsTable(stats, nutrients, 'Week total')],
  };
}

function monthView({ ui, go }, db, nutrients, byDate) {
  const ws = db.settings.weekStart;
  const weeks = monthWeeks(ui.calDate, ws);
  const days = monthDays(ui.calDate);
  const stats = rangeTotals(days, byDate, db.foods);
  const main = nutrients[0];
  const t = today();
  const scaleMax = main ? Math.max(main.target || 0, ...days.map((d) => stats.perDay.get(d).values[main.id] || 0)) : 0;

  const grid = h('div', { class: 'month-grid', style: main ? { '--c': `var(--c-${main.color})` } : null },
    weeks[0].map((d) => h('div', { class: 'month-head' }, fmt(d, { weekday: 'narrow' }))),
    weeks.flat().map((d) => {
      if (!sameMonth(d, ui.calDate)) return h('div', { class: 'month-cell out' });
      const day = stats.perDay.get(d);
      const value = main ? day.values[main.id] || 0 : 0;
      // One hue, light to dark: the more eaten that day, the stronger the tint.
      const tint = day.count && scaleMax ? Math.round(10 + 34 * Math.min(1, value / scaleMax)) : 0;
      return h('button', {
        type: 'button', class: `month-cell${d === t ? ' is-today' : ''}${day.count ? ' has' : ''}`,
        style: { '--tint': `${tint}%` },
        'aria-label': `${fmt(d, { day: 'numeric', month: 'long' })}${day.count && main ? `: ${withUnit(main, value)}` : ''}`,
        onClick: () => go({ tab: 'day', date: d }),
      },
      h('span', { class: 'cell-num' }, fmt(d, { day: 'numeric' })),
      h('span', { class: 'cell-value' }, day.count && main ? nutrientNum(main, value) : ''));
    }));

  const weekRows = weeks.map((week) => {
    const inMonth = week.filter((d) => sameMonth(d, ui.calDate));
    const s = rangeTotals(week, byDate, db.foods);
    return h('div', { class: 'row-wrap' },
      h('button', { class: 'row', type: 'button', onClick: () => go({ calMode: 'week', calDate: inMonth[0] }) },
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title' }, fmtRange(week[0], week[6])),
          h('div', { class: 'row-sub' }, s.logged ? `${s.logged} day${s.logged > 1 ? 's' : ''} logged` : 'Nothing logged')),
        h('div', { class: 'row-side' }, s.logged ? macroLine(s.total, nutrients, { limit: 4 }) : null)));
  });

  return {
    title: fmt(ui.calDate, { month: 'long', year: 'numeric' }),
    isCurrent: sameMonth(ui.calDate, t),
    body: [
      h('div', { class: 'card month-card' }, grid,
        main ? h('div', { class: 'table-note' }, `Each day shows its ${main.name.toLowerCase()} (${main.unit}). Tap a day to open it`) : null),
      chartsSection(db, nutrients, days, byDate),
      totalsTable(stats, nutrients, 'Month total'),
      h('section', {},
        h('div', { class: 'section-head' }, h('h2', {}, 'Week by week'), h('span', { class: 'muted' }, 'Full weeks')),
        h('div', { class: 'card list' }, weekRows)),
    ],
  };
}

export function renderCalendar(ctx) {
  const { ui, go } = ctx;
  const db = store.db;
  const nutrients = activeNutrients(db);
  const byDate = entriesByDate(db);
  const isWeek = ui.calMode === 'week';
  const view = (isWeek ? weekView : monthView)(ctx, db, nutrients, byDate);
  const step = (dir) => go({ calDate: isWeek ? addDays(ui.calDate, dir * 7) : addMonths(ui.calDate, dir) });

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {}, h('h1', {}, 'Calendar'), h('div', { class: 'view-sub' }, view.title)),
      h('div', { class: 'head-actions' },
        view.isCurrent ? null : h('button', { class: 'pill', type: 'button', onClick: () => go({ calDate: today() }) }, isWeek ? 'This week' : 'This month'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': isWeek ? 'Previous week' : 'Previous month', onClick: () => step(-1) }, icon('left')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': isWeek ? 'Next week' : 'Next month', onClick: () => step(1) }, icon('right')))),
    segmented([{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }], ui.calMode,
      (v) => go({ calMode: v, calDate: v === 'week' && sameMonth(ui.calDate, today()) ? today() : ui.calDate }), { label: 'Period' }),
    view.body);
}

