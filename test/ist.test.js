const test = require('node:test');
const assert = require('node:assert');
const F = require('../server/fine');

test('a UTC evening timestamp becomes the next day in India', () => assert.equal(F.istDate('2026-11-08 20:00:00'), '2026-11-09'));
test('a UTC morning timestamp stays on the same day', () => assert.equal(F.istDate('2026-11-08 05:00:00'), '2026-11-08'));