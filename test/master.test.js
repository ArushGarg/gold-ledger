process.env.JWT_SECRET = 'test-secret';
process.env.DB_FILE = ':memory:';
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { app, db } = require('../server/index');
const { parseWastage } = require('../server/master');

db.prepare("INSERT INTO karigars VALUES(1,'A')").run();
db.prepare("INSERT INTO wastage VALUES(1,'ring',250)").run();
const server = app.listen(0);
const base = () => `http://localhost:${server.address().port}`;
const tok = (role) => 'Bearer ' + jwt.sign({ role, email: role + '@x.com' }, 'test-secret');
const call = (method, p, role, body) => fetch(base() + p, { method, headers: { 'content-type': 'application/json', authorization: tok(role) }, body: body && JSON.stringify(body) });
test.after(() => server.close());

test('wastage % parsing', () => {
  assert.equal(parseWastage('3.00'), 300);
  assert.equal(parseWastage('0'), 0);
  assert.throws(() => parseWastage('10.01'));
  assert.throws(() => parseWastage('3.005'));
  assert.throws(() => parseWastage('abc'));
});
test('the clerk cannot change the master', async () => {
  assert.equal((await call('PUT', '/api/karigars/1/wastage', 'clerk', { category: 'ring', percent: '3' })).status, 403);
  assert.equal((await call('POST', '/api/karigars', 'clerk', { name: 'New Person' })).status, 403);
});
test('finance can add a karigar and set wastage; bad values are refused', async () => {
  assert.equal((await call('POST', '/api/karigars', 'finance', { name: 'New Person' })).status, 200);
  assert.equal((await call('POST', '/api/karigars', 'finance', { name: 'new person' })).status, 400); // duplicate
  assert.equal((await call('PUT', '/api/karigars/1/wastage', 'finance', { category: 'chain', percent: '2.75' })).status, 200);
  assert.equal((await call('PUT', '/api/karigars/1/wastage', 'finance', { category: 'chain', percent: '12' })).status, 400);
});
test('changing the master does not rewrite the allowance of a job already issued', async () => {
  const issue = await call('POST', '/api/issue', 'finance', { karigarId: 1, job: 'J-9', category: 'ring', gross: '100.000', purity: '100' });
  assert.equal((await issue.json()).job.allowed, '2.500');
  await call('PUT', '/api/karigars/1/wastage', 'finance', { category: 'ring', percent: '4' });
  const ks = await (await call('GET', '/api/karigars', 'finance')).json();
  assert.equal(ks.find((k) => k.id === 1).jobs.find((j) => j.job === 'J-9').allowed, 2500); // still 2.500 g
});