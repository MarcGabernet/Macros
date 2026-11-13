// Small helpers for building the screen: elements, icons, sheets, messages.

/**
 * Create an element. `props`: class, style (object; `--custom` keys allowed),
 * on<Event> handlers, or plain attributes. Children: nodes, strings, arrays;
 * null/false are skipped.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') {
      for (const [p, v] of Object.entries(value)) {
        if (v == null) continue;
        if (p.startsWith('--')) el.style.setProperty(p, v);
        else el.style[p] = v;
      }
    } else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value') el.value = value;
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  append(el, children);
  return el;
}

/** Append children the way `h` does: arrays are flattened, null/false skipped. */
export function add(el, ...children) {
  append(el, children);
  return el;
}

/** Replace an element's children (same rules as `add`). */
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

const ICONS = {
  day: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  foods: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  alert: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
};

export function icon(name, size = 22) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

/**
 * A sheet that slides up from the bottom (a centred panel on wide screens).
 * Returns { el, body, foot, close }. Fill `body` and `foot` yourself.
 */
export function openSheet({ title, onClose } = {}) {
  const titleEl = h('h2', { class: 'sheet-title' }, title || '');
  const body = h('div', { class: 'sheet-body' });
  const foot = h('div', { class: 'sheet-foot' });
  // Closing cleans up right away. (The browser's own 'close' event arrives late,
  // on the next painted frame, so nothing here waits for it.)
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (dlg.open) dlg.close();
    dlg.remove();
    onClose?.();
  };
  const dlg = h('dialog', { class: 'sheet' },
    h('div', { class: 'sheet-head' },
      titleEl,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onClick: close }, icon('close', 20))),
    body, foot);
  // A click on the dimmed area outside the panel lands on the dialog itself.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('close', close); // closed by the Escape key
  document.body.append(dlg);
  dlg.showModal();
  return { el: dlg, body, foot, close, setTitle: (t) => { titleEl.textContent = t; } };
}

/** Ask a yes/no question. Resolves true when confirmed. */
export function confirmSheet({ title, message, confirmLabel = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    let answer = false;
    const sheet = openSheet({ title, onClose: () => resolve(answer) });
    sheet.body.append(h('p', { class: 'sheet-text' }, message));
    sheet.foot.append(
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onClick: () => sheet.close() }, 'Cancel'),
        h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', onClick: () => { answer = true; sheet.close(); } }, confirmLabel)));
  });
}

let toastTimer;
export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = h('div', { class: 'toast', role: 'status' });
    document.body.append(el);
  }
  // A toast must sit above any open sheet, which lives in the browser's top layer.
  const top = [...document.querySelectorAll('dialog[open]')].pop();
  (top || document.body).append(el);
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// Keep sheets above the on-screen keyboard (iOS draws it over the page).
export function trackKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    const hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', `${Math.round(hidden)}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}
