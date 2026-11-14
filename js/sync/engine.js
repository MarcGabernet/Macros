// Keeping this device's data and the Drive copy in step.
//
// The data is one small file, so it travels whole. When Drive's copy has
// changed since this device last saw it, the two are merged record by record
// (see core/merge.js) instead of asking which one to keep.
//
// The one exception is the first sync after connecting a device that already
// has its own data to a Drive that already has some: then you choose which to keep.

import { store } from '../core/store.js';
import { mergeDbs } from '../core/merge.js';
import { COLLECTIONS, normalizeDb } from '../core/schema.js';
import { isConfigured, beginSignIn, consumeRedirect, drive, AuthError, OfflineError } from './google.js';
import { t } from '../texts.js';

const META_KEY = 'macros.sync'; // this device's sync state; never uploaded
const SAVE_DELAY = 2500;        // wait this long after a change before uploading
const RECHECK_AFTER = 60_000;   // look at Drive again when the app comes back after this long

function loadMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch { return {}; }
}

let meta = loadMeta(); // { enabled, email, token, expiresAt, remoteMd5, lastSync, dirty, silentFailed, firstSync }
let state = 'idle';    // 'idle' | 'syncing' | 'choose' | 'needs-auth' | 'offline' | 'error'
let pendingChoice = null; // while state is 'choose': { remote, theirs }
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

const live = (db, c) => Object.values(db[c] || {}).filter((r) => !r.deleted).length;

/** Whether a copy of the data holds anything you made (not just a fresh install). */
function hasContent(db) {
  return ['foods', 'entries', 'weights'].some((c) => live(db, c) > 0)
    || Object.keys(db.nutrients || {}).length > 0 || (db.settings?.updatedAt || 0) > 0;
}

/** "4 foods · 12 logged items · 3 weigh-ins" */
function describe(db) {
  return [t('sync.count.foods', { n: live(db, 'foods') }), t('sync.count.entries', { n: live(db, 'entries') }), t('sync.count.weights', { n: live(db, 'weights') })].join(' · ');
}

class NeedsChoice extends Error {}

/** The first sync after connecting: take Drive's data, or ask when both sides have some. */
async function firstSync(token, remote) {
  const theirs = normalizeDb(JSON.parse(await drive.download(token, remote.id)));
  const merged = mergeDbs(store.db, theirs);
  if (!hasContent(store.db) || (!merged.localChanged && !merged.remoteChanged)) {
    store.replace(theirs, { local: false });
    saveMeta({ remoteMd5: remote.md5Checksum, firstSync: false, dirty: false });
    return;
  }
  if (!hasContent(theirs)) {
    const uploaded = await drive.upload(token, store.serialize(), remote.id);
    saveMeta({ remoteMd5: uploaded.md5Checksum, firstSync: false, dirty: false });
    return;
  }
  pendingChoice = { remote, theirs };
  throw new NeedsChoice();
}

async function run() {
  const startedAt = localChanges;
  const token = meta.token;
  const remote = await drive.find(token);
  let uploaded = null;

  if (meta.firstSync && remote) {
    await firstSync(token, remote);
  } else if (!remote) {
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
  if (meta.firstSync) saveMeta({ firstSync: false });
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
      // A device connecting for the first time (not just renewing its sign-in)
      // checks what Drive already has before merging anything.
      saveMeta({ enabled: true, token: back.token, expiresAt: back.expiresAt, silentFailed: false, firstSync: !meta.enabled });
    } else if (back?.error) {
      saveMeta({ silentFailed: true, token: null, expiresAt: 0 });
      if (back.error === 'drive_not_granted') message = t('sync.driveNotGranted');
      else if (!back.silent) message = t('sync.signInIncomplete');
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
      choice: pendingChoice ? { drive: describe(pendingChoice.theirs), local: describe(store.db) } : null,
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

  /**
   * Settle the first sync: 'drive' replaces this device's data with Drive's;
   * 'local' replaces Drive's with this device's (what only Drive had is
   * marked deleted, so other devices drop it too instead of bringing it back).
   */
  async choose(which) {
    if (!pendingChoice || running) return;
    const { remote, theirs } = pendingChoice;
    running = true;
    setState('syncing');
    try {
      if (which === 'drive') {
        store.replace(theirs, { local: false });
        saveMeta({ remoteMd5: remote.md5Checksum, firstSync: false, dirty: false, lastSync: Date.now() });
      } else {
        const now = Date.now();
        const db = normalizeDb(JSON.parse(store.serialize()));
        for (const c of COLLECTIONS) {
          for (const id of Object.keys(theirs[c])) if (!db[c][id]) db[c][id] = { id, deleted: true, updatedAt: now };
          for (const rec of Object.values(db[c])) rec.updatedAt = Math.max(rec.updatedAt || 0, now);
        }
        db.settings.updatedAt = now;
        store.replace(db, { local: false });
        const uploaded = await drive.upload(meta.token, store.serialize(), remote.id);
        saveMeta({ remoteMd5: uploaded.md5Checksum, firstSync: false, dirty: false, lastSync: Date.now() });
      }
      pendingChoice = null;
      setState('idle');
    } catch (err) {
      setState(err instanceof OfflineError ? 'offline' : 'choose', err.message);
    } finally {
      running = false;
    }
  },

  /** Stop syncing on this device. The Drive copy and the local data both stay. */
  disconnect() {
    clearTimeout(timer);
    pendingChoice = null;
    meta = {};
    localStorage.removeItem(META_KEY);
    setState('idle');
  },

  async syncNow() {
    if (!isConfigured() || !meta.enabled || pendingChoice) return;
    if (running) { again = true; return; }
    if (!hasToken()) { setState('needs-auth'); return; }
    running = true;
    setState('syncing');
    try {
      await run();
      setState('idle');
    } catch (err) {
      if (err instanceof NeedsChoice) setState('choose');
      else if (err instanceof AuthError) { saveMeta({ token: null, expiresAt: 0 }); setState('needs-auth', err.message); }
      else if (err instanceof OfflineError) setState('offline', err.message);
      else { console.error('Sync failed', err); setState('error', err.message || t('sync.failed')); }
    } finally {
      running = false;
      if (again) { again = false; schedule(500); }
    }
  },
};
