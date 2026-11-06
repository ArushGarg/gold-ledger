process.env.JWT_SECRET = 'test-secret';
process.env.DB_FILE = ':memory:';
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { app, db } = require('../server/index');

db.prepare("INSERT INTO karigars VALUES(1,'A')").run();
db.prepare("INSERT INTO karigars VALUES(2,'B')").run();
db.prepare("INSERT INTO wastage VALUES(1,'ring',250)").run();
db.prepare("INSERT INTO txns(id,karigar_id,job,type,category,gross_mg,purity_bp,fine_mg) VALUES('T1',1,'J-1','issue','ring',10000,10000,10000)").run();
db.prepare("INSERT INTO txns(id,karigar_id,job,type,category,gross_mg,purity_bp,fine_mg) VALUES('T2',2,'J-2','issue','ring',99000,10000,99000)").run();
db.prepare("INSERT INTO karigar_users VALUES('k@x.com',1)").run();

const tok = (role, email = 'k@x.com') => 'Bearer ' + jwt.sign({ role, email }, 'test-secret');
const server = app.listen(0);
const get = (p, a) => fetch(`http://localhost:${server.address().port}${p}`, { headers: a ? { authorization: a } : {} });
test.after(() => server.close());

test('no token is rejected', async () => assert.equal((await get('/api/me/slips')).status, 401));
test('karigar sees only their own slips', async () => {
  const d = await (await get('/api/me/slips', tok('karigar'))).json();
  assert.equal(d.balance, '10.000');
  assert.deepEqual(d.slips.map((s) => s.id), ['T1']);
});
test('karigar cannot read other karigars, stock, alerts or old gold', async () => {
  for (const p of ['/api/karigars', '/api/recent', '/api/stock', '/api/alerts', '/api/oldgold'])
    assert.equal((await get(p, tok('karigar'))).status, 403, p);
});
test('clerk cannot read the stock statement or alerts', async () => {
  for (const p of ['/api/stock', '/api/alerts']) assert.equal((await get(p, tok('clerk'))).status, 403, p);
});