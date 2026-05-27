const test = require('node:test');
const assert = require('node:assert');
const { renderTemplate } = require('../lib/template.js');

test('substitutes canonical firstName/lastName tokens', () => {
  const { text, missing } = renderTemplate(
    'Hey {{firstName}} {{lastName}}!',
    { first_name: 'Wesley', last_name: 'Longueira' }
  );
  assert.strictEqual(text, 'Hey Wesley Longueira!');
  assert.deepStrictEqual(missing, []);
});

test('derives fullName from first + last when missing', () => {
  const { text } = renderTemplate(
    'Hey {{fullName}}',
    { first_name: 'Wesley', last_name: 'Longueira' }
  );
  assert.strictEqual(text, 'Hey Wesley Longueira');
});

test('substitutes arbitrary column headers', () => {
  const { text } = renderTemplate(
    'You run {{company}} as {{title}}?',
    { company: 'Acme', title: 'CTO' }
  );
  assert.strictEqual(text, 'You run Acme as CTO?');
});

test('is case-insensitive on tokens', () => {
  const { text } = renderTemplate(
    'Hey {{FIRSTNAME}}',
    { first_name: 'Wesley' }
  );
  assert.strictEqual(text, 'Hey Wesley');
});

test('reports missing tokens and leaves them intact', () => {
  const { text, missing } = renderTemplate(
    'Hey {{firstName}}, about {{project}}',
    { first_name: 'Wesley' }
  );
  assert.strictEqual(text, 'Hey Wesley, about {{project}}');
  assert.deepStrictEqual(missing, ['project']);
});

test('handles empty template', () => {
  const { text, missing } = renderTemplate('', {});
  assert.strictEqual(text, '');
  assert.deepStrictEqual(missing, []);
});

test('treats empty string column values as missing', () => {
  const { text, missing } = renderTemplate(
    'Hey {{firstName}}',
    { first_name: '' }
  );
  assert.strictEqual(text, 'Hey {{firstName}}');
  assert.deepStrictEqual(missing, ['firstName']);
});
