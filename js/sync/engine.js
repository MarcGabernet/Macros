// Keeping this device's data and the Drive copy in step.
//
// The data is one small file, so it travels whole. When Drive's copy has
// changed since this device last saw it, the two are merged record by record
// (see core/merge.js) instead of asking which one to keep.

import { store } from '../core/store.js';
import { mergeDbs } from '../core/merge.js';
import { isConfigured, beginSignIn, consumeRedirect, drive, AuthError, OfflineError } from './google.js';

const META_KEY = 'macros.sync'; // this device's sync state; never uploaded
const SAVE_DELAY = 2500;        // wait this long after a change before uploading
const RECHECK_AFTER = 60_000;   // look at Drive again when the app comes back after this long

function loadMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch { return {}; }
}

let meta = loadMeta(); // { enabled, email, token, expiresAt, remoteMd5, lastSync, dirty, silentFailed }
let state = 'idle';    // 'idle' | 'syncing' | 'needs-auth' | 'offline' | 'error'
let message = '';
let running = false;
let again = false;
let timer = null;
let localChanges = 0;
const listeners = new Set();

function saveMeta(patch) {
  meta = { ...meta, ...patch };
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function setState(next, text = '') {
  state = next;
  message = text;
  for (const fn of [...listeners]) fn();
}

const hasToken = () => !!meta.token && Date.now() < (meta.expiresAt || 0);

function schedule(delay = SAVE_DELAY) {
  clearTimeout(timer);
  timer = setTimeout(() => sync.syncNow(), delay);
}

async function run() {
  const startedAt = localChanges;
  const token = meta.token;
  const remote = await drive.find(token);
  let uploaded = null;

  if (!remote) {
    uploaded = await drive.upload(token, store.serialize(), null);
  } else if (remote.md5Checksum !== meta.remoteMd5) {
    const theirs = JSON.parse(await drive.download(token, remote.id));
    const merged = mergeDbs(store.db, theirs);
    if (merged.localChanged) store.replace(merged.db, { local: false });
    if (merged.remoteChanged) uploaded = await drive.upload(token, store.serialize(), remote.id);
    else saveMeta({ remoteMd5: remote.md5Checksum });
  } else if (meta.dirty) {
    uploaded = await drive.upload(token, store.serialize(), remote.id);
  }

  if (uploaded) saveMeta({ remoteMd5: uploaded.md5Checksum });
  // Anything changed while this was running still has to go up.
  const changedMeanwhile = localChanges !== startedAt;
  saveMeta({ dirty: changedMeanwhile, lastSync: Date.now() });
  if (changedMeanwhile) schedule();
}

export const sync = {
  /** Call once at start, before drawing. Returns false if the page is leaving for Google. */
  init() {
    const back = consumeRedirect();
    if (back?.token) {
      saveMeta({ enabled: true, token: back.token, expiresAt: back.expiresAt, silentFailed: false });
    } else if (back?.error) {
      saveMeta({ silentFailed: true, token: null, expiresAt: 0 });
      if (back.error === 'drive_not_granted') message = 'Google Drive access was not allowed. Connect again and tick the Drive box on Google’s screen.';
      else if (!back.silent) message = 'Google sign-in was not completed.';
    }

    store.subscribe(({ local }) => {
      if (!local) return;
      localChanges += 1;
      if (!meta.enabled) return;
      saveMeta({ dirty: true });
      schedule();
    });

    if (!isConfigured() || !meta.enabled) return true;

    if (!hasToken()) {
      // The hourly token ran out: ask Google for a fresh one without a prompt,
      // once. If that fails, wait for the user to reconnect by hand.
      if (!meta.silentFailed && navigator.onLine) {
        beginSignIn({ silent: true, hint: meta.email });
        return false;
      }
      state = 'needs-auth';
      return true;
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - (meta.lastSync || 0) > RECHECK_AFTER) sync.syncNow();
    });
    window.addEventListener('online', () => sync.syncNow());

    if (back?.token) drive.email(meta.token).then((email) => { saveMeta({ email }); setState(state, message); }).catch(() => {});
    sync.syncNow();
    return true;
  },

  status() {
    return {
      configured: isConfigured(), enabled: !!meta.enabled, email: meta.email || '',
      state, message, lastSync: meta.lastSync || null, pending: !!meta.dirty,
    };
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Sign in with Google (leaves the page and comes back). */
  connect() {
    beginSignIn({ hint: meta.email || undefined });
  },

  /** Stop syncing on this device. The Drive copy and the local data both stay. */
  disconnect() {
    clearTimeout(timer);
    meta = {};
    localStorage.removeItem(META_KEY);
    setState('idle');
  },

  async syncNow() {
    if (!isConfigured() || !meta.enabled) return;
    if (running) { again = true; return; }
    if (!hasToken()) { setState('needs-auth'); return; }
    running = true;
    setState('syncing');
    try {
      await run();
      setState('idle');
    } catch (err) {
      if (err instanceof AuthError) { saveMeta({ token: null, expiresAt: 0 }); setState('needs-auth', err.message); }
      else if (err instanceof OfflineError) setState('offline', err.message);
      else { console.error('Sync failed', err); setState('error', err.message || 'Sync failed.'); }
    } finally {
      running = false;
      if (again) { again = false; schedule(500); }
    }
  },
};
