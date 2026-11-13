// Google sign-in and the Drive copy of the data.
//
// Like Butxaca, the data is one file in Drive's hidden *app data* folder: the
// app can only see its own files there, and nothing shows up among your normal
// Drive files. A web page can't keep a client secret, so sign-in uses Google's
// browser flow: the page goes to Google and comes back with a short-lived
// access token (about an hour) in the address, which is then removed.

import { GOOGLE_CLIENT_ID, DRIVE_FILE_NAME } from '../config.js';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const SCOPES = [
  DRIVE_SCOPE,
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');
const FIELDS = 'id,md5Checksum,modifiedTime';
const STATE_KEY = 'macros.oauth';

export class SyncError extends Error {}
export class OfflineError extends SyncError {}
export class AuthError extends SyncError {}

export const isConfigured = () => !!GOOGLE_CLIENT_ID;

/** The address Google sends the browser back to. It must be listed in the OAuth client. */
export const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');

/** Leave for Google's sign-in page. `silent` asks Google not to show anything if it can avoid it. */
export function beginSignIn({ silent = false, hint } = {}) {
  const state = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(STATE_KEY, JSON.stringify({ state, silent }));
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPES,
    state,
    include_granted_scopes: 'true',
    prompt: silent ? 'none' : 'select_account',
  });
  if (hint) params.set('login_hint', hint);
  location.assign(`${AUTH}?${params}`);
}

/**
 * If the page was just opened by Google coming back from sign-in, read the
 * result and clean the address. Returns null when this is a normal start,
 * { token, expiresAt } on success, or { error, silent } on failure.
 */
export function consumeRedirect() {
  const hash = location.hash.replace(/^#/, '');
  if (!/(^|&)(access_token|error)=/.test(hash)) return null;
  const params = new URLSearchParams(hash);
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch { /* ignore */ }
  localStorage.removeItem(STATE_KEY);
  history.replaceState(null, '', location.pathname + location.search);
  if (!saved || saved.state !== params.get('state')) return { error: 'state_mismatch', silent: !!saved?.silent };
  if (params.get('error')) return { error: params.get('error'), silent: !!saved.silent };
  // Google lets people untick single permissions on the consent screen.
  const granted = (params.get('scope') || '').split(' ');
  if (!granted.includes(DRIVE_SCOPE)) return { error: 'drive_not_granted', silent: !!saved.silent };
  const seconds = Number(params.get('expires_in')) || 3600;
  return { token: params.get('access_token'), expiresAt: Date.now() + (seconds - 60) * 1000 };
}

async function call(token, method, url, { params, headers, body } = {}) {
  const full = params ? `${url}?${new URLSearchParams(params)}` : url;
  let res;
  try {
    res = await fetch(full, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, body });
  } catch (err) {
    throw new OfflineError('No connection to Google Drive');
  }
  if (res.status === 401) throw new AuthError('Your Google session has expired');
  if (res.status === 403 && /insufficient/i.test(await res.clone().text())) {
    throw new AuthError('Macros was not allowed to use Google Drive. Reconnect and tick the Drive box');
  }
  if (!res.ok) throw new SyncError(`Google Drive responded with an error (${res.status})`);
  return res;
}

export const drive = {
  async email(token) {
    return (await (await call(token, 'GET', USERINFO)).json()).email || '';
  },

  /** The data file's details ({ id, md5Checksum, modifiedTime }), or null if there is none yet. */
  async find(token) {
    const res = await call(token, 'GET', FILES, {
      params: {
        spaces: 'appDataFolder',
        q: `name='${DRIVE_FILE_NAME}' and trashed=false`,
        fields: `files(${FIELDS})`,
        orderBy: 'modifiedTime desc',
        pageSize: '10',
      },
    });
    return (await res.json()).files?.[0] ?? null;
  },

  async download(token, id) {
    return (await call(token, 'GET', `${FILES}/${id}`, { params: { alt: 'media' } })).text();
  },

  /** Create the file (no `id`) or replace its contents. Returns its new details. */
  async upload(token, text, id) {
    const boundary = `macros${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const meta = id ? {} : { name: DRIVE_FILE_NAME, parents: ['appDataFolder'] };
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, text, `\r\n--${boundary}--`,
    ]);
    const res = await call(token, id ? 'PATCH' : 'POST', id ? `${UPLOAD}/${id}` : UPLOAD, {
      params: { uploadType: 'multipart', fields: FIELDS },
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return res.json();
  },
};
