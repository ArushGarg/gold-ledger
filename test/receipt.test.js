process.env.JWT_SECRET = 'test-secret';
process.env.DB_FILE = ':memory:';
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { app, db } = require('../server/index');

db.prepare("INSERT INTO karigars VALUES(1,'A')").run();
db.prepare("INSERT INTO wastage VALUES(1,'ring',250)").run();
db.prepare("INSERT INTO txns(id,karigar_id,job,type,category,gross_mg,purity_bp,fine_mg) VALUES('T1',1,'J-1','issue','ring',50000,10000,50000)").run();

const server = app.listen(0);
const token = 'Bearer ' + jwt.sign({ role: 'clerk', email: 'c@x.com' }, 'test-secret');
const post = (body) => fetch(`http://localhost:${server.address().port}/api/receipt`, {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: token }, body: JSON.stringify(body) });
const receipt = (gross) => post({ karigarId: 1, job: 'J-1', gross, purity: '100', kind: 'scrap' });
test.after(() => server.close());

test('a receipt within the balance is accepted', async () => assert.equal((await receipt('40.000')).status, 200));
test('a receipt returning more fine gold than was issued is refused', async () => {
  const r = await receipt('10.001'); // balance is 10.000 g
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /more fine gold/);
});
test('a receipt exactly equal to the balance is accepted', async () => assert.equal((await receipt('10.000')).status, 200));