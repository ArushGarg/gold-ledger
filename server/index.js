const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');
const F = require('./fine');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('Set JWT_SECRET');
const db = new DatabaseSync(process.env.DB_FILE || 'ledger.db');
db.exec(`
CREATE TABLE IF NOT EXISTS users(email TEXT PRIMARY KEY, hash TEXT, role TEXT);
CREATE TABLE IF NOT EXISTS karigars(id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE IF NOT EXISTS wastage(karigar_id INT, category TEXT, bp INT, PRIMARY KEY(karigar_id, category));
CREATE TABLE IF NOT EXISTS txns(id TEXT PRIMARY KEY, karigar_id INT, job TEXT, type TEXT, category TEXT,
  gross_mg INT, purity_bp INT, fine_mg INT, final INT DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit(at TEXT DEFAULT CURRENT_TIMESTAMP, email TEXT, action TEXT, ref TEXT);
`);

const app = express();
app.use(express.json({ limit: '6mb' }));
app.use(express.static(path.join(__dirname, '../public')));

const auth = (...roles) => (req, res, next) => {
  try {
    const u = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
    if (roles.length && !roles.includes(u.role)) return res.status(403).json({ error: 'Not allowed for your role' });
    req.user = u; next();
  } catch { res.status(401).json({ error: 'Sign in required' }); }
};
const bad = (res, e) => res.status(400).json({ error: e.message });
const nextId = () => 'TX-' + (30000 + db.prepare('SELECT COUNT(*) c FROM txns').get().c + 411);

app.post('/api/login', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body.email || ''));
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.hash)) return res.status(401).json({ error: 'Wrong email or password' });
  res.json({ token: jwt.sign({ email: u.email, role: u.role }, SECRET, { expiresIn: '8h' }), role: u.role });
});

// Job summaries per karigar
function jobs(kid) {
  const rows = db.prepare('SELECT * FROM txns WHERE karigar_id=? ORDER BY created_at, rowid').all(kid);
  const m = {};
  for (const t of rows) {
    const j = (m[t.job] ||= { job: t.job, issued: 0, returned: 0, allowed: 0, closed: false, kid });
    if (t.type === 'issue') {
      j.issued += t.fine_mg;
      const w = db.prepare('SELECT bp FROM wastage WHERE karigar_id=? AND category=?').get(kid, t.category);
      j.allowed += F.allowedMg(t.fine_mg, w ? w.bp : 0);
    } else { j.returned += t.fine_mg; if (t.final) j.closed = true; }
  }
  return Object.values(m).map((j) => ({ ...j, ...F.jobLoss(j) }));
}

app.get('/api/karigars', auth(), (req, res) => {
  res.json(db.prepare('SELECT * FROM karigars').all().map((k) => {
    const js = jobs(k.id);
    return { ...k, wastage: db.prepare('SELECT category, bp FROM wastage WHERE karigar_id=?').all(k.id),
      balance: js.reduce((a, j) => a + j.outstanding, 0), jobs: js };
  }));
});

// AI-read values must match typed values or saving is blocked.
function checkAi(body) {
  for (const [typed, ai] of [['gross', 'aiGross'], ['purity', 'aiPurity']])
    if (body[ai] != null && String(body[ai]) !== String(body[typed]))
      throw new Error(`Typed ${typed} (${body[typed]}) differs from photo reading (${body[ai]}). Correct it or retake the photo.`);
}
function record(type) {
  return (req, res) => {
    try {
      const b = req.body; checkAi(b);
      const g = F.toMg(b.gross), p = F.toBp(b.purity);
      if (g <= 0) throw new Error('Weight must be above zero');
      const k = db.prepare('SELECT id FROM karigars WHERE id=?').get(b.karigarId);
      if (!k || !/^[\w-]{1,20}$/.test(b.job || '')) throw new Error('Karigar and job number required');
      const kind = type === 'issue' ? 'issue' : b.kind; // finished | scrap | filings
      if (!['issue', 'finished', 'scrap', 'filings'].includes(kind)) throw new Error('Bad receipt type');
      const fine = F.fineMg(g, p), id = nextId();
      if (type === 'issue') {
        const vault = db.prepare("SELECT 20000000 - COALESCE(SUM(CASE WHEN type='issue' THEN fine_mg END),0) v FROM txns").get().v;
        if (fine > vault) throw new Error('Not enough gold in vault');
      }
      db.prepare('INSERT INTO txns(id,karigar_id,job,type,category,gross_mg,purity_bp,fine_mg,final) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id, k.id, b.job, type, b.category || kind, g, p, fine, b.final ? 1 : 0);
      db.prepare('INSERT INTO audit(email,action,ref) VALUES(?,?,?)').run(req.user.email, type, id);
      const j = jobs(k.id).find((x) => x.job === b.job);
      res.json({ id, fine: F.fmt(fine), job: j && { outstanding: F.fmt(j.outstanding), allowed: F.fmt(j.allowed) } });
    } catch (e) { bad(res, e); }
  };
}
app.post('/api/issue', auth('clerk', 'finance'), record('issue'));
app.post('/api/receipt', auth('clerk', 'finance'), record('receipt'));

// Alerts: for review, worded as items, never accusations. Finance only.
app.get('/api/alerts', auth('finance'), (req, res) => {
  const out = [];
  for (const k of db.prepare('SELECT * FROM karigars').all()) {
    const closed = jobs(k.id).filter((j) => j.closed);
    const last = closed[closed.length - 1];
    if (last && last.excess > 0) out.push({ karigar: k.name, text: `Job ${last.job}: ${F.fmt(last.excess)} g above allowance. Please review.` });
    if (F.drifting(closed.map((j) => j.lossPct))) out.push({ karigar: k.name, text: 'Recent loss is higher than this karigar’s own earlier average. Worth a look.' });
  }
  res.json(out);
});

function stock() {
  const issued = db.prepare("SELECT COALESCE(SUM(fine_mg),0) s FROM txns WHERE type='issue'").get().s;
  const ret = db.prepare("SELECT COALESCE(SUM(fine_mg),0) s FROM txns WHERE type='receipt'").get().s;
  return { vault: 20000000 - issued, withKarigars: issued - ret, refiner: 0 };
}
app.get('/api/stock', auth('finance'), (req, res) => {
  const s = stock(); res.json({ date: new Date().toISOString().slice(0, 10), vault: F.fmt(s.vault), withKarigars: F.fmt(s.withKarigars), refiner: F.fmt(s.refiner) });
});
app.get('/api/stock.csv', auth('finance'), (req, res) => {
  const rows = db.prepare('SELECT t.id,t.created_at,k.name,t.type,t.job,t.fine_mg FROM txns t JOIN karigars k ON k.id=t.karigar_id ORDER BY t.rowid').all();
  res.type('text/csv').send('Voucher,Date,Party,Type,Narration,FineGold_g\n' +
    rows.map((r) => [r.id, r.created_at.slice(0, 10), r.name, r.type, 'Job ' + r.job, F.fmt(r.fine_mg)].join(',')).join('\n'));
});

// Scale photo reading. Without a key it returns "unsure" so the clerk types manually.
app.post('/api/read-scale', auth('clerk', 'finance'), async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.json({ weight: null, note: 'Reader offline, type the value' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 100, messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: req.body.image } },
        { type: 'text', text: 'Read the number on this jewellery scale display. Reply ONLY JSON {"weight":"123.456"} or {"weight":null} if unclear.' }] }] }),
    });
    const d = await r.json();
    const j = JSON.parse(d.content[0].text.replace(/```json|```/g, ''));
    res.json({ weight: j.weight && /^\d+\.\d{3}$/.test(j.weight) ? j.weight : null });
  } catch { res.json({ weight: null, note: 'Could not read photo' }); }
});

module.exports = { app, db };
if (require.main === module) {
  require('./seed')(db, bcrypt);
  app.listen(process.env.PORT || 3000, () => console.log('Running'));
}