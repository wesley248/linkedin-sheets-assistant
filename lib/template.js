// Template substitution. Replaces {{token}} with the matching field from a
// row object. Tokens are case-insensitive and match either the canonical
// field names (firstName, lastName, fullName) or any raw column header.
//
// Unknown tokens are left intact (wrapped in {{ }}) and reported back so the
// UI can warn the user before sending.

(function (root) {
  const CANONICAL_ALIASES = {
    firstname: ['first_name', 'firstName', 'first'],
    lastname: ['last_name', 'lastName', 'last'],
    fullname: ['full_name', 'fullName', 'name'],
    company: ['company', 'organization', 'org'],
    title: ['title', 'role', 'position']
  };

  function buildLookup(row) {
    // Lower-cased map of every column header → value.
    const map = {};
    if (!row) return map;
    for (const [k, v] of Object.entries(row)) {
      map[k.toLowerCase()] = v;
    }
    // Derive fullName if missing.
    if (!map.fullname && (map.firstname || map.first_name)) {
      const first = map.firstname || map.first_name || '';
      const last = map.lastname || map.last_name || '';
      map.fullname = `${first} ${last}`.trim();
    }
    return map;
  }

  function resolveToken(token, lookup) {
    const key = token.toLowerCase();
    if (lookup[key] != null && lookup[key] !== '') return String(lookup[key]);
    // Try canonical aliases.
    for (const [canonical, aliases] of Object.entries(CANONICAL_ALIASES)) {
      if (canonical === key || aliases.map(a => a.toLowerCase()).includes(key)) {
        if (lookup[canonical] != null && lookup[canonical] !== '') return String(lookup[canonical]);
        for (const alias of aliases) {
          const v = lookup[alias.toLowerCase()];
          if (v != null && v !== '') return String(v);
        }
      }
    }
    return null;
  }

  function renderTemplate(template, row) {
    if (!template) return { text: '', missing: [] };
    const lookup = buildLookup(row);
    const missing = new Set();
    const text = String(template).replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (full, token) => {
      const v = resolveToken(token, lookup);
      if (v == null) {
        missing.add(token);
        return full; // leave intact
      }
      return v;
    });
    return { text, missing: [...missing] };
  }

  const api = { renderTemplate, buildLookup };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LSATemplate = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
