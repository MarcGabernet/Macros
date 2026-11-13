// Merging two copies of the data (this device's and Drive's), record by record:
// for each record the copy changed most recently wins. Deletions are records
// too (tombstones), so a delete on one device isn't undone by another.

import { COLLECTIONS, SCHEMA_VERSION, normalizeDb } from './schema.js';

const stamp = (rec) => Number(rec?.updatedAt) || 0;

/**
 * @returns {{ db, localChanged: boolean, remoteChanged: boolean }}
 *   localChanged: the merge holds something this device didn't have.
 *   remoteChanged: the merge holds something Drive didn't have.
 */
export function mergeDbs(localRaw, remoteRaw) {
  const local = normalizeDb(localRaw);
  const remote = normalizeDb(remoteRaw);
  const db = { schema: SCHEMA_VERSION, settings: local.settings };
  let localChanged = false;
  let remoteChanged = false;

  for (const c of COLLECTIONS) {
    db[c] = {};
    const ids = new Set([...Object.keys(local[c]), ...Object.keys(remote[c])]);
    for (const id of ids) {
      const a = local[c][id];
      const b = remote[c][id];
      if (a && !b) { db[c][id] = a; remoteChanged = true; }
      else if (b && !a) { db[c][id] = b; localChanged = true; }
      else if (stamp(b) > stamp(a)) { db[c][id] = b; localChanged = true; }
      else {
        db[c][id] = a;
        if (stamp(a) > stamp(b)) remoteChanged = true;
      }
    }
  }

  if (stamp(remote.settings) > stamp(local.settings)) { db.settings = remote.settings; localChanged = true; }
  else if (stamp(local.settings) > stamp(remote.settings)) remoteChanged = true;

  return { db, localChanged, remoteChanged };
}
