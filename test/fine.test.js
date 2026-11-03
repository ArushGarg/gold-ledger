const test = require('node:test');
const assert = require('node:assert');
const F = require('../server/fine');

test('sample rows from the brief', () => {
  const issue = F.fineMg(F.toMg('120.000'), F.toBp('91.60'));
  const piece = F.fineMg(F.toMg('112.450'), F.toBp('91.60'));
  const scrap = F.fineMg(F.toMg('3.300'), F.toBp('91.60'));
  assert.equal(F.fmt(issue), '109.920');
  assert.equal(F.fmt(piece), '103.004');
  assert.equal(F.fmt(scrap), '3.023');
  assert.equal(F.fmt(issue - piece), '6.916');
  assert.equal(F.fmt(issue - piece - scrap), '3.893');
});
test('allowed wastage 3% of 109.920 g', () => assert.equal(F.fmt(F.allowedMg(109920, 300)), '3.298'));
test('rejects 4 decimals and bad purity', () => {
  assert.throws(() => F.toMg('1.2345'));
  assert.throws(() => F.toBp('101'));
  assert.throws(() => F.toBp('91.605'));
});
test('excess loss only on closed jobs', () => {
  assert.equal(F.jobLoss({ issued: 100000, returned: 90000, allowed: 3000, closed: false }).excess, 0);
  assert.equal(F.jobLoss({ issued: 100000, returned: 90000, allowed: 3000, closed: true }).excess, 7000);
});
test('drift needs history and a jump over own average', () => {
  assert.equal(F.drifting([0.004, 0.0045]), false);
  assert.equal(F.drifting([0.004, 0.0042, 0.0041, 0.009]), true);
});