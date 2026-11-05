const test = require('node:test');
const assert = require('node:assert');
const F = require('../server/fine');
const O = require('../server/oldgold');

test('fine weight and value are exact', () => {
  const c = O.compute({ gross: '25.000', deduction: '0.500', purity: '91.60', rate: '12500' });
  assert.equal(c.netMg, 24500);
  assert.equal(F.fmt(c.fineMg), '22.442');
  assert.equal(c.valuePaise, 28052500); // Rs 2,80,525.00
});
test('deductions must be below gross', () => {
  assert.throws(() => O.compute({ gross: '5.000', deduction: '5.000', purity: '91.60', rate: '12500' }));
});
test('rejects bad rate and purity', () => {
  assert.throws(() => O.compute({ gross: '5.000', purity: '91.60', rate: '12500.999' }));
  assert.throws(() => O.compute({ gross: '5.000', purity: '120', rate: '12500' }));
});
test('PAN needed from Rs 50,000, not below', () => {
  assert.match(O.compliance(5000000, 'bank', '').error, /PAN/);
  assert.equal(O.compliance(5000000, 'bank', 'ABCDE1234F').error, null);
  assert.equal(O.compliance(4999999, 'cash', '').error, null);
});
test('PAN format is checked', () => assert.match(O.compliance(6000000, 'upi', 'abc123').error, /PAN/));
test('cash above Rs 2 lakh is blocked, bank is allowed', () => {
  assert.match(O.compliance(20000001, 'cash', 'ABCDE1234F').error, /Cash/);
  assert.equal(O.compliance(20000001, 'bank', 'ABCDE1234F').error, null);
});