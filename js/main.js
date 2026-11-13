// Start-up, the tab bar, and redrawing the current screen when data changes.

import { h, icon, trackKeyboard } from './ui/dom.js';
import { store } from './core/store.js';
import { today } from './core/dates.js';
import { sync } from './sync/engine.js';
import { renderDay, logFood } from './ui/views/day.js';
import { renderCalendar } from './ui/views/calendar.js';
import { renderFoods } from './ui/views/foods.js';
import { renderSettings } from './ui/views/settings.js';

const TABS = [
  { id: 'day', label: 'Day', icon: 'day', render: renderDay },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', render: renderCalendar },
  { id: 'foods', label: 'Foods', icon: 'foods', render: renderFoods },
  { id: 'settings', label: 'Settings', icon: 'settings', render: renderSettings },
];

// What is on screen. Not saved: the app always opens on today.
const ui = {
  tab: 'day',
  date: today(),
  calMode: 'week',
  calDate: today(),
  foodKind: 'ingredient',
  foodQuery: '',
};

const root = document.getElementById('app');
const viewEl = h('main', { id: 'view' });
const bannerEl = h('div', { id: 'banner' });
const tabBar = h('nav', { class: 'tabbar', 'aria-label': 'Sections' });

/** Change what is on screen, then redraw. */
function go(patch) {
  const tabChanged = patch.tab && patch.tab !== ui.tab;
  Object.assign(ui, patch);
  // Opening a day from the calendar keeps the calendar on that day's period.
  if (patch.date) ui.calDate = patch.date;
  render();
  if (tabChanged) window.scrollTo(0, 0);
}

function renderTabs() {
  const tabButton = (tab) => h('button', {
    type: 'button', class: `tab${ui.tab === tab.id ? ' on' : ''}`, 'aria-current': ui.tab === tab.id ? 'page' : null,
    onClick: () => go({ tab: tab.id }),
  }, icon(tab.icon, 22), h('span', {}, tab.label));
  tabBar.replaceChildren(
    tabButton(TABS[0]), tabButton(TABS[1]),
    h('button', { type: 'button', class: 'tab-add', 'aria-label': 'Add food', onClick: () => logFood(ui.date) }, icon('plus', 26)),
    tabButton(TABS[2]), tabButton(TABS[3]));
}

function renderBanner() {
  const s = sync.status();
  bannerEl.replaceChildren(s.configured && s.enabled && s.state === 'needs-auth'
    ? h('button', { class: 'banner', type: 'button', onClick: () => sync.connect() },
      icon('cloud', 18), h('span', {}, 'Drive sync is paused.'), h('strong', {}, 'Reconnect'))
    : '');
}

function render() {
  const tab = TABS.find((t) => t.id === ui.tab) || TABS[0];
  viewEl.replaceChildren(tab.render({ ui, go }));
  renderTabs();
  renderBanner();
}

function start() {
  // If the hourly Google token ran out, this may leave for Google and come straight back.
  if (!sync.init()) return;

  root.replaceChildren(bannerEl, viewEl, tabBar);
  trackKeyboard();
  store.subscribe(render);
  sync.subscribe(() => { renderBanner(); if (ui.tab === 'settings') render(); });
  render();

  // Move on to the new day if the app was left open overnight.
  let lastSeen = today();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || today() === lastSeen) return;
    if (ui.date === lastSeen) go({ date: today() });
    lastSeen = today();
  });

  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

start();
