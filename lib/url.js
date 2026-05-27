// LinkedIn profile URL normalization.
// Goal: turn any variant of a /in/<slug> URL into a canonical lookup key.
//
// Handles:
//   - locale prefixes (/in/foo, /uk.linkedin.com/in/foo)
//   - trailing slashes
//   - query params (?utm_source, ?miniProfileUrn, etc.)
//   - hash fragments
//   - uppercase slugs
//   - the contact-info, recent-activity, details/* sub-paths

(function (root) {
  function normalizeLinkedInProfileUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    let u;
    try {
      u = new URL(rawUrl);
    } catch {
      return null;
    }
    // Only LinkedIn host (any locale subdomain like uk., br.)
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    // Extract the /in/<slug> segment — bail otherwise.
    const m = u.pathname.match(/^\/in\/([^\/]+)/i);
    if (!m) return null;
    const slug = decodeURIComponent(m[1]).toLowerCase().trim();
    if (!slug) return null;
    return `/in/${slug}`;
  }

  const api = { normalizeLinkedInProfileUrl };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LSAUrl = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
