// MV3 service worker. Owns the Sheets client + OAuth token, brokers all
// requests from content scripts and the options page via chrome.runtime
// messages.

import { getAccessToken, clearToken } from './lib/auth.js';
import { SheetsClient, columnLetter } from './lib/sheets.js';

const sheets = new SheetsClient({ getToken: () => getAccessToken({ interactive: true }) });

const DEFAULT_CONFIG = {
  spreadsheetId: '',
  sheetName: 'Connections',
  columnMap: {
    profile_url: 'profile_url',
    first_name: 'first_name',
    last_name: 'last_name',
    template: 'template',
    status: 'status',
    last_touched_at: 'last_touched_at',
    notes: 'notes'
  }
};

async function loadConfig() {
  const stored = await chrome.storage.sync.get('lsa.config');
  return { ...DEFAULT_CONFIG, ...(stored['lsa.config'] || {}) };
}

function findRowByProfileUrl({ rows, headers, rowNumbers, profileUrlHeader, normalizedKey, normalize }) {
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i][profileUrlHeader];
    const norm = normalize(raw);
    if (norm && norm === normalizedKey) {
      return { row: rows[i], rowNumber: rowNumbers[i], index: i };
    }
  }
  return null;
}

async function handleLookup({ normalizedKey }) {
  const cfg = await loadConfig();
  if (!cfg.spreadsheetId) {
    return { ok: false, error: 'No spreadsheet ID configured. Open the extension Options.' };
  }
  const { headers, rows, rowNumbers } = await sheets.readRows({
    spreadsheetId: cfg.spreadsheetId,
    sheetName: cfg.sheetName
  });
  const profileUrlHeader = cfg.columnMap.profile_url;
  if (!headers.includes(profileUrlHeader)) {
    return { ok: false, error: `Column "${profileUrlHeader}" not found in sheet headers: ${headers.join(', ')}` };
  }
  // normalize is duplicated logic from lib/url.js because service workers
  // can't share scripts with content scripts directly. Keep them in sync.
  const normalize = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    try {
      const u = new URL(raw);
      const m = u.pathname.match(/^\/in\/([^\/]+)/i);
      if (!m) return null;
      return `/in/${decodeURIComponent(m[1]).toLowerCase().trim()}`;
    } catch { return null; }
  };
  const match = findRowByProfileUrl({
    rows, headers, rowNumbers, profileUrlHeader, normalizedKey, normalize
  });
  if (!match) return { ok: true, found: false };
  return {
    ok: true,
    found: true,
    row: match.row,
    rowNumber: match.rowNumber,
    headers,
    columnMap: cfg.columnMap,
    spreadsheetId: cfg.spreadsheetId,
    sheetName: cfg.sheetName
  };
}

async function handleMarkStatus({ rowNumber, status, notes }) {
  const cfg = await loadConfig();
  const { headers } = await sheets.readRows({
    spreadsheetId: cfg.spreadsheetId,
    sheetName: cfg.sheetName
  });
  const statusCol = headers.indexOf(cfg.columnMap.status);
  const touchedCol = headers.indexOf(cfg.columnMap.last_touched_at);
  const notesCol = headers.indexOf(cfg.columnMap.notes);
  const updates = [];
  if (statusCol >= 0) {
    updates.push({ columnLetter: columnLetter(statusCol + 1), value: status });
  }
  if (touchedCol >= 0) {
    updates.push({ columnLetter: columnLetter(touchedCol + 1), value: new Date().toISOString() });
  }
  if (notes && notesCol >= 0) {
    updates.push({ columnLetter: columnLetter(notesCol + 1), value: notes });
  }
  if (!updates.length) {
    return { ok: false, error: 'No matching status/last_touched_at column in sheet.' };
  }
  await sheets.updateRowCells({
    spreadsheetId: cfg.spreadsheetId,
    sheetName: cfg.sheetName,
    rowNumber,
    updates
  });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case 'lsa:lookup':
          sendResponse(await handleLookup({ normalizedKey: msg.normalizedKey }));
          break;
        case 'lsa:markStatus':
          sendResponse(await handleMarkStatus({
            rowNumber: msg.rowNumber,
            status: msg.status,
            notes: msg.notes
          }));
          break;
        case 'lsa:signOut':
          await clearToken();
          sendResponse({ ok: true });
          break;
        case 'lsa:probeAuth':
          // Used by options page to force the OAuth prompt.
          await getAccessToken({ interactive: true });
          sendResponse({ ok: true });
          break;
        default:
          sendResponse({ ok: false, error: `Unknown message type: ${msg?.type}` });
      }
    } catch (err) {
      console.error('[LSA] background error', err);
      sendResponse({ ok: false, error: err?.message || String(err), code: err?.code });
    }
  })();
  return true; // async sendResponse
});
