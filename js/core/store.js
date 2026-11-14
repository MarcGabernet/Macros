// The app's data, kept in this browser's storage. Every change goes through
// here, which stamps it with a time so that devices can be merged later.

import { emptyDb, normalizeDb } from './schema.js';

const DB_KEY = 'macros.db';

function load() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? normalizeDb(JSON.parse(raw)) : emptyDb();
  } catch (err) {
    console.error('Could not read saved data', err);
    return emptyDb();
  }
}

let db = load();
let saveFailed = false;
const listeners = new Set();

function commit(local) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    saveFailed = false;
  } catch (err) {
    saveFailed = true;
    console.error('Could not save data', err);
  }
  for (const fn of [...listeners]) fn({ local });
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export const store = {
  get db() { return db; },
  get saveFailed() { return saveFailed; },

  /** Call `fn({ local })` after every change; `local` is false for changes that came from sync. */
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Live (not deleted) records of a collection. */
  all(collection) {
    return Object.values(db[collection]).filter((r) => !r.deleted);
  },

  get(collection, id) {
    return db[collection][id];
  },

  /** Create or update a record. */
  put(collection, record) {
    const now = Date.now();
    const rec = { ...record, id: record.id || uid(), createdAt: record.createdAt ?? now, updatedAt: now };
    delete rec.deleted;
    db[collection][rec.id] = rec;
    commit(true);
    return rec;
  },

  /**
   * Add records that aren't there yet, stamped as the oldest possible change
   * (updatedAt 0), so any real change from another device wins over them.
   */
  seed(collection, records) {
    for (const r of records) {
      if (!db[collection][r.id]) db[collection][r.id] = { ...r, createdAt: 0, updatedAt: 0 };
    }
    commit(true);
  },

  /**
   * Delete a record. Foods and nutrients keep their contents (hidden), so days
   * already logged with them still add up; log entries shrink to a marker.
   */
  remove(collection, id) {
    const rec = db[collection][id];
    if (!rec) return;
    const now = Date.now();
    db[collection][id] = collection === 'entries'
      ? { id, deleted: true, updatedAt: now }
      : { ...rec, deleted: true, updatedAt: now };
    commit(true);
  },

  setSettings(patch) {
    db.settings = { ...db.settings, ...patch, updatedAt: Date.now() };
    commit(true);
  },

  /** Swap in a whole document (from sync or a backup file). */
  replace(next, { local = false } = {}) {
    db = normalizeDb(next);
    commit(local);
  },

  serialize() {
    return JSON.stringify(db);
  },
};
