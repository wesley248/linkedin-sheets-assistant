const test = require('node:test');
const assert = require('node:assert');
const { normalizeLinkedInProfileUrl } = require('../lib/url.js');

test('normalizes vanity slug URLs', () => {
  assert.strictEqual(
    normalizeLinkedInProfileUrl('https://www.linkedin.com/in/wesley-longueira/'),
    '/in/wesley-longueira'
  );
});

test('strips query params and fragments', () => {
  assert.strictEqual(
    normalizeLinkedInProfileUrl('https://www.linkedin.com/in/wesley-longueira/?utm_source=foo#bar'),
    '/in/wesley-longueira'
  );
});

test('lowercases the slug', () => {
  assert.strictEqual(
    normalizeLinkedInProfileUrl('https://www.linkedin.com/in/Wesley-Longueira'),
    '/in/wesley-longueira'
  );
});

test('accepts locale subdomains', () => {
  assert.strictEqual(
    normalizeLinkedInProfileUrl('https://uk.linkedin.com/in/wesley-longueira'),
    '/in/wesley-longueira'
  );
});

test('ignores sub-paths like /details/experience', () => {
  assert.strictEqual(
    normalizeLinkedInProfileUrl('https://www.linkedin.com/in/wesley-longueira/details/experience/'),
    '/in/wesley-longueira'
  );
});

test('returns null for non-LinkedIn URLs', () => {
  assert.strictEqual(normalizeLinkedInProfileUrl('https://example.com/in/foo'), null);
});

test('returns null for LinkedIn pages without /in/<slug>', () => {
  assert.strictEqual(normalizeLinkedInProfileUrl('https://www.linkedin.com/feed/'), null);
});

test('returns null for non-string input', () => {
  assert.strictEqual(normalizeLinkedInProfileUrl(null), null);
  assert.strictEqual(normalizeLinkedInProfileUrl(undefined), null);
  assert.strictEqual(normalizeLinkedInProfileUrl(42), null);
});

test('handles URL-encoded slugs', () => {
  assert.strictEqual(
    normalizeLinkedInProfileUrl('https://www.linkedin.com/in/wesley%2Dlongueira'),
    '/in/wesley-longueira'
  );
});
