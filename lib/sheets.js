// Minimal Google Sheets v4 client. Service-worker friendly (no DOM deps).
// Reads the full sheet on first call and caches it for `cacheMs`; writes
// status updates via a single values.update call.

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export class SheetsClient {
  constructor({ getToken, cacheMs = 30_000 } = {}) {
    this.getToken = getToken;
    this.cacheMs = cacheMs;
    this._cache = new Map(); // key: `${spreadsheetId}:${range}` → { rows, fetchedAt }
  }

  async _fetch(url, init = {}) {
    const token = await this.getToken();
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers || {})
      }
    });
    if (res.status === 401) {
      const err = new Error('Sheets API returned 401 — token likely expired.');
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Sheets API ${res.status}: ${body}`);
    }
    return res.json();
  }

  /**
   * Returns { headers: string[], rows: object[], rowNumbers: number[] }
   * where rowNumbers is the 1-indexed sheet row for each entry (header is row 1).
   */
  async readRows({ spreadsheetId, sheetName, force = false }) {
    const range = `${sheetName}!A1:ZZ`;
    const cacheKey = `${spreadsheetId}:${range}`;
    const now = Date.now();
    const cached = this._cache.get(cacheKey);
    if (!force && cached && now - cached.fetchedAt < this.cacheMs) {
      return cached.payload;
    }
    const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
    const data = await this._fetch(url);
    const values = data.values || [];
    const headers = (values[0] || []).map(h => String(h).trim());
    const rows = [];
    const rowNumbers = [];
    for (let i = 1; i < values.length; i++) {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = values[i][idx] ?? ''; });
      rows.push(obj);
      rowNumbers.push(i + 1); // 1-indexed, header is row 1
    }
    const payload = { headers, rows, rowNumbers };
    this._cache.set(cacheKey, { payload, fetchedAt: now });
    return payload;
  }

  /**
   * Update a single cell. column is 1-indexed.
   */
  async updateCell({ spreadsheetId, sheetName, rowNumber, columnLetter, value }) {
    const range = `${sheetName}!${columnLetter}${rowNumber}`;
    const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    const body = JSON.stringify({ range, majorDimension: 'ROWS', values: [[value]] });
    const data = await this._fetch(url, { method: 'PUT', body });
    // Invalidate cache for this sheet so the next read returns fresh data.
    this._cache.delete(`${spreadsheetId}:${sheetName}!A1:ZZ`);
    return data;
  }

  /**
   * Convenience: update multiple cells in the same row in one batch call.
   * updates = [{ columnLetter, value }, ...]
   */
  async updateRowCells({ spreadsheetId, sheetName, rowNumber, updates }) {
    if (!updates.length) return null;
    const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;
    const data = [...updates].map(u => ({
      range: `${sheetName}!${u.columnLetter}${rowNumber}`,
      majorDimension: 'ROWS',
      values: [[u.value]]
    }));
    const body = JSON.stringify({ valueInputOption: 'USER_ENTERED', data });
    const target = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;
    const result = await this._fetch(target, { method: 'POST', body });
    this._cache.delete(`${spreadsheetId}:${sheetName}!A1:ZZ`);
    return result;
  }
}

/** Convert a 1-indexed column number to A1 letter (1→A, 27→AA). */
export function columnLetter(col) {
  if (col < 1) throw new Error('columnLetter: col must be >= 1');
  let n = col;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}
