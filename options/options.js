const DEFAULTS = {
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

const $ = (sel) => document.querySelector(sel);

function setStatus(node, text, kind = '') {
  node.textContent = text;
  node.className = `status ${kind}`.trim();
}

async function load() {
  const { 'lsa.config': config, 'lsa.googleClientId': clientId } =
    await chrome.storage.sync.get(['lsa.config', 'lsa.googleClientId']);
  const merged = { ...DEFAULTS, ...(config || {}), columnMap: { ...DEFAULTS.columnMap, ...((config || {}).columnMap || {}) } };

  $('#clientId').value = clientId || '';
  $('#spreadsheetId').value = merged.spreadsheetId;
  $('#sheetName').value = merged.sheetName;
  document.querySelectorAll('input[data-key]').forEach((input) => {
    input.value = merged.columnMap[input.dataset.key] || '';
  });
  $('#redirectUri').textContent = chrome.identity.getRedirectURL();
}

async function save() {
  const config = {
    spreadsheetId: $('#spreadsheetId').value.trim(),
    sheetName: $('#sheetName').value.trim() || 'Connections',
    columnMap: {}
  };
  document.querySelectorAll('input[data-key]').forEach((input) => {
    config.columnMap[input.dataset.key] = input.value.trim() || DEFAULTS.columnMap[input.dataset.key];
  });
  const clientId = $('#clientId').value.trim();
  await chrome.storage.sync.set({
    'lsa.config': config,
    'lsa.googleClientId': clientId
  });
  setStatus($('#saveStatus'), 'Saved.', 'ok');
  setTimeout(() => setStatus($('#saveStatus'), ''), 2000);
}

async function testAuth() {
  setStatus($('#authStatus'), 'Opening Google sign-in…');
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'lsa:probeAuth' });
    if (resp?.ok) setStatus($('#authStatus'), 'Signed in. Token cached for this session.', 'ok');
    else setStatus($('#authStatus'), resp?.error || 'Sign-in failed.', 'error');
  } catch (e) {
    setStatus($('#authStatus'), e.message, 'error');
  }
}

async function signOut() {
  await chrome.runtime.sendMessage({ type: 'lsa:signOut' });
  setStatus($('#authStatus'), 'Cached token cleared.', 'ok');
}

document.addEventListener('DOMContentLoaded', () => {
  load();
  $('#save').addEventListener('click', save);
  $('#testAuth').addEventListener('click', testAuth);
  $('#signOut').addEventListener('click', signOut);
});
