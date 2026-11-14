// The calendar: a week or a month at a glance, with daily, weekly and monthly totals.

import { h, icon } from '../dom.js';
import { store } from '../../core/store.js';
import { entriesByDate, rangeTotals } from '../../core/calc.js';
import {
  today, addDays, addMonths, weekDays, monthDays, monthWeeks, sameMonth, fmt, fmtRange,
} from '../../core/dates.js';
import { isOpenDay, firstOpenDay } from '../../core/days.js';
import { nutrientNum, withUnit, num } from '../../core/format.js';
import { activeNutrients, segmented, macroLine, dot } from '../components.js';
import { toDisplay, ofWhich } from '../../core/nutrients.js';
import { weighInOn, toWeightUnit } from '../../core/weight.js';
import { barChart, lineChart } from '../charts.js';
import { logFood } from './day.js';
import { t } from '../../texts.js';

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
      title: t('weight.label'), color: 'blue', days, values, unit,
      stat: change == null ? null : `${change > 0 ? '+' : change < 0 ? '−' : '±'}${num(Math.abs(change), 1)} ${unit}`,
      empty: t('cal.noWeighIns'),
    }));
  }
  for (const n of nutrients.filter((x) => x.group === 'macro' && !x.depth)) {
    const values = days.map((d) => { const day = stats.perDay.get(d); return day.count ? toDisplay(n, day.values[n.id] || 0) : null; });
    const goalBase = n.target > 0 ? n.target : n.reference;
    cards.push(barChart({
      title: n.name, color: n.color, days, values, unit: n.unit,
      goal: goalBase ? { value: toDisplay(n, goalBase), label: n.target > 0 ? t(n.goalType === 'limit' ? 'settings.limit' : 'settings.target') : t('cal.ref') } : null,
      stat: stats.logged ? t('cal.avg', { value: withUnit(n, stats.average[n.id] || 0) }) : null,
    }));
  }
  return h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, t('cal.graphs'))), cards);
}

/** Total and daily average of every nutrient over a period. */
function totalsTable(stats, nutrients, title) {
  return h('section', {},
    h('div', { class: 'section-head' },
      h('h2', {}, title),
      h('span', { class: 'muted' }, stats.logged ? t('cal.daysLogged', { n: stats.logged }) : t('cal.nothingLogged'))),
    h('div', { class: 'card' },
      h('table', { class: 'totals' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, t('cal.nutrient')), h('th', { scope: 'col' }, t('cal.total')), h('th', { scope: 'col' }, t('cal.dailyAverage')))),
        h('tbody', {}, nutrients.map((n) => h('tr', { class: n.depth ? 'sub' : null },
          h('th', { scope: 'row' }, n.depth ? ofWhich(n) : [dot(n), n.name]),
          h('td', {}, withUnit(n, stats.total[n.id] || 0)),
          h('td', {}, stats.logged ? withUnit(n, stats.average[n.id] || 0) : '–'))))),
      stats.logged ? h('div', { class: 'table-note' }, t('cal.averageNote')) : null));
}

function weekView({ ui, go }, db, nutrients, byDate) {
  const days = weekDays(ui.calDate);
  const stats = rangeTotals(days, byDate, db.foods);
  const main = nutrients[0];
  const tday = today();
  const first = firstOpenDay(db);
  // Bars compare the days of this week: the scale tops out at the target, or the highest day.
  const scaleMax = main ? Math.max(main.target || 0, ...days.map((d) => stats.perDay.get(d).values[main.id] || 0)) : 0;

  const rows = days.map((d) => {
    const day = stats.perDay.get(d);
    const value = main ? day.values[main.id] || 0 : 0;
    return h('div', { class: `row-wrap day-row${d === tday ? ' is-today' : ''}` },
      h('button', { class: 'row', type: 'button', disabled: !isOpenDay(d, first), onClick: () => go({ tab: 'day', date: d }), 'aria-label': t('cal.open', { day: fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }) }) },
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
            : h('span', { class: 'muted' }, t('cal.nothingLogged')))),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('cal.addOn', { day: fmt(d, { weekday: 'long' }) }), disabled: !isOpenDay(d, first), onClick: () => logFood(d) }, icon('plus', 18)));
  });

  return {
    title: fmtRange(days[0], days[6]),
    isCurrent: days.includes(tday),
    body: [h('div', { class: 'card list' }, rows), chartsSection(db, nutrients, days, byDate), totalsTable(stats, nutrients, t('cal.weekTotal'))],
  };
}

function monthView({ ui, go }, db, nutrients, byDate) {
  const weeks = monthWeeks(ui.calDate);
  const days = monthDays(ui.calDate);
  const stats = rangeTotals(days, byDate, db.foods);
  const main = nutrients[0];
  const tday = today();
  const first = firstOpenDay(db);
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
        type: 'button', class: `month-cell${d === tday ? ' is-today' : ''}${day.count ? ' has' : ''}`, disabled: !isOpenDay(d, first),
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
          h('div', { class: 'row-sub' }, s.logged ? t('cal.daysLogged', { n: s.logged }) : t('cal.nothingLogged'))),
        h('div', { class: 'row-side' }, s.logged ? macroLine(s.total, nutrients, { limit: 4 }) : null)));
  });

  return {
    title: fmt(ui.calDate, { month: 'long', year: 'numeric' }),
    isCurrent: sameMonth(ui.calDate, tday),
    body: [
      h('div', { class: 'card month-card' }, grid,
        main ? h('div', { class: 'table-note' }, t('cal.monthNote', { name: main.name.toLowerCase(), unit: main.unit })) : null),
      chartsSection(db, nutrients, days, byDate),
      totalsTable(stats, nutrients, t('cal.monthTotal')),
      h('section', {},
        h('div', { class: 'section-head' }, h('h2', {}, t('cal.weekByWeek')), h('span', { class: 'muted' }, t('cal.fullWeeks'))),
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
      h('div', {}, h('h1', {}, t('tab.calendar')), h('div', { class: 'view-sub' }, view.title)),
      h('div', { class: 'head-actions' },
        view.isCurrent ? null : h('button', { class: 'pill', type: 'button', onClick: () => go({ calDate: today() }) }, isWeek ? t('cal.thisWeek') : t('cal.thisMonth')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': isWeek ? t('cal.prevWeek') : t('cal.prevMonth'), onClick: () => step(-1) }, icon('left')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': isWeek ? t('cal.nextWeek') : t('cal.nextMonth'), onClick: () => step(1) }, icon('right')))),
    segmented([{ value: 'week', label: t('cal.week') }, { value: 'month', label: t('cal.month') }], ui.calMode,
      (v) => go({ calMode: v, calDate: v === 'week' && sameMonth(ui.calDate, today()) ? today() : ui.calDate }), { label: t('cal.period') }),
    view.body);
}

