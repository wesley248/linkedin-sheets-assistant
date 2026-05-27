// Content script — injected on https://www.linkedin.com/in/*.
// Adds a floating panel in the bottom-right of the page that:
//   1. Looks up the sheet row for the current profile URL
//   2. Renders the message template with personalization tokens
//   3. Provides "Copy" / "Mark sent" / "Mark replied" actions
//
// Everything user-facing is keyboard-accessible. Heavy lifting (Sheets +
// OAuth) happens in the service worker; this script is presentation-only.

(function () {
  const LOG = (...args) => console.debug('[LSA]', ...args);
  const PANEL_ID = 'lsa-panel';
  let lastProfileKey = null;
  let currentState = { rowNumber: null, row: null, columnMap: null };

  function send(type, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, ...payload }, (resp) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(resp);
      });
    });
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v != null) node.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = el('div', { id: PANEL_ID, role: 'complementary', 'aria-label': 'LinkedIn Sheets Assistant' });
    panel.innerHTML = `
      <header class="lsa-header">
        <span class="lsa-title">LinkedIn Sheets Assistant</span>
        <button class="lsa-collapse" type="button" aria-label="Collapse">–</button>
      </header>
      <div class="lsa-body" data-state="loading">
        <p class="lsa-status">Loading…</p>
      </div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('.lsa-collapse').addEventListener('click', () => {
      panel.classList.toggle('lsa-collapsed');
    });
    return panel;
  }

  function setBody(node) {
    const body = ensurePanel().querySelector('.lsa-body');
    body.replaceChildren(node);
  }

  function statusLine(text, kind = 'info') {
    return el('p', { class: `lsa-status lsa-${kind}` }, text);
  }

  function renderNotFound(profileKey) {
    setBody(el('div', {},
      statusLine('No matching row in your sheet for this profile.', 'warn'),
      el('code', { class: 'lsa-key' }, profileKey),
      el('p', { class: 'lsa-hint' }, 'Add a row with this URL in the profile_url column and reload.')
    ));
  }

  function renderError(msg) {
    setBody(el('div', {},
      statusLine(msg, 'error'),
      el('button', { type: 'button', class: 'lsa-btn', onclick: () => triggerLookup(true) }, 'Retry')
    ));
  }

  function renderRow({ row, rowNumber, columnMap }) {
    currentState = { row, rowNumber, columnMap };
    const templateField = columnMap.template;
    const statusField = columnMap.status;
    const rawTemplate = row[templateField] || '';
    const { text, missing } = (self.LSATemplate || window.LSATemplate).renderTemplate(rawTemplate, row);
    const currentStatus = row[statusField] || 'open';

    const textarea = el('textarea', {
      class: 'lsa-textarea',
      rows: '6',
      'aria-label': 'Drafted message',
      spellcheck: 'true'
    });
    textarea.value = text;

    const missingNote = missing.length
      ? statusLine(`Unfilled tokens: ${missing.map(t => `{{${t}}}`).join(', ')}`, 'warn')
      : null;

    const copyBtn = el('button', {
      type: 'button',
      class: 'lsa-btn lsa-btn-primary',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(textarea.value);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy draft'; }, 1500);
        } catch (e) {
          copyBtn.textContent = 'Copy failed';
        }
      }
    }, 'Copy draft');

    const markSent = el('button', {
      type: 'button',
      class: 'lsa-btn',
      onclick: () => markStatus('sent')
    }, 'Mark sent');

    const markReplied = el('button', {
      type: 'button',
      class: 'lsa-btn',
      onclick: () => markStatus('replied')
    }, 'Mark replied');

    const meta = el('div', { class: 'lsa-meta' },
      el('span', {}, `Row ${rowNumber}`),
      el('span', { class: `lsa-pill lsa-pill-${String(currentStatus).toLowerCase()}` }, String(currentStatus))
    );

    const body = el('div', { class: 'lsa-form' }, meta);
    if (missingNote) body.appendChild(missingNote);
    body.append(textarea, el('div', { class: 'lsa-actions' }, copyBtn, markSent, markReplied));
    setBody(body);
  }

  async function markStatus(status) {
    if (!currentState.rowNumber) return;
    const panel = ensurePanel();
    const actions = panel.querySelectorAll('.lsa-actions .lsa-btn');
    actions.forEach(b => { b.disabled = true; });
    try {
      const resp = await send('lsa:markStatus', { rowNumber: currentState.rowNumber, status });
      if (!resp?.ok) throw new Error(resp?.error || 'Update failed');
      // Optimistic update of pill.
      const pill = panel.querySelector('.lsa-pill');
      if (pill) {
        pill.textContent = status;
        pill.className = `lsa-pill lsa-pill-${status}`;
      }
      flash(`Marked ${status}`);
    } catch (e) {
      flash(`Error: ${e.message}`, 'error');
    } finally {
      actions.forEach(b => { b.disabled = false; });
    }
  }

  function flash(message, kind = 'info') {
    const panel = ensurePanel();
    let f = panel.querySelector('.lsa-flash');
    if (!f) {
      f = el('div', { class: 'lsa-flash', role: 'status', 'aria-live': 'polite' });
      panel.appendChild(f);
    }
    f.textContent = message;
    f.className = `lsa-flash lsa-${kind}`;
    clearTimeout(flash._t);
    flash._t = setTimeout(() => { f.textContent = ''; }, 2500);
  }

  async function triggerLookup(force = false) {
    const key = (self.LSAUrl || window.LSAUrl).normalizeLinkedInProfileUrl(window.location.href);
    if (!key) return;
    if (!force && key === lastProfileKey) return;
    lastProfileKey = key;
    ensurePanel();
    setBody(statusLine('Looking up sheet row…'));
    try {
      const resp = await send('lsa:lookup', { normalizedKey: key });
      if (!resp?.ok) { renderError(resp?.error || 'Lookup failed'); return; }
      if (!resp.found) { renderNotFound(key); return; }
      renderRow({ row: resp.row, rowNumber: resp.rowNumber, columnMap: resp.columnMap });
    } catch (e) {
      renderError(e.message || String(e));
    }
  }

  // LinkedIn is a SPA — re-run on URL changes.
  let lastHref = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      triggerLookup();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  triggerLookup();
})();
