const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');
const F = require('./fine');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('Set JWT_SECRET (see .env.example)');
const OPENING_MG = 20000000; // ASSUMPTION: vault opened with 20.000 kg fine gold
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

const hits = new Map(); // simple login rate limit: 10 tries/minute/IP
app.post('/api/login', (req, res) => {
  const now = Date.now(), h = (hits.get(req.ip) || []).filter((t) => now - t < 60000);
  if (h.length >= 10) return res.status(429).json({ error: 'Too many attempts. Wait a minute.' });
  hits.set(req.ip, [...h, now]);
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body.email || ''));
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.hash)) return res.status(401).json({ error: 'Wrong email or password' });
  res.json({ token: jwt.sign({ email: u.email, role: u.role }, SECRET, { expiresIn: '8h' }), role: u.role });
});

// Per-job summary. allowed = agreed wastage % x fine issued, by item category.
function jobs(kid) {
  const rows = db.prepare('SELECT * FROM txns WHERE karigar_id=? ORDER BY rowid').all(kid);
  const m = {};
  for (const t of rows) {
    const j = (m[t.job] ||= { job: t.job, issued: 0, returned: 0, allowed: 0, closed: false });
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
      balance: js.filter((j) => !j.closed).reduce((a, j) => a + j.outstanding, 0), jobs: js };
  }));
});

function checkAi(b) {
  if (b.aiGross != null && String(b.aiGross) !== String(b.gross))
    throw new Error(`Typed weight (${b.gross}) differs from the photo reading (${b.aiGross}). Correct it or retake the photo.`);
}
const nextId = () => 'TX-' + (40001 + db.prepare('SELECT COUNT(*) c FROM txns').get().c);

function record(type) {
  return (req, res) => {
    try {
      const b = req.body; checkAi(b);
      const g = F.toMg(b.gross), p = F.toBp(b.purity);
      if (g <= 0) throw new Error('Weight must be above zero');
      const k = db.prepare('SELECT id FROM karigars WHERE id=?').get(Number(b.karigarId));
      if (!k || !/^[\w-]{1,20}$/.test(b.job || '')) throw new Error('Karigar and job number required');
      const existing = db.prepare('SELECT DISTINCT karigar_id, final FROM txns WHERE job=?').all(b.job);
      let cat;
      if (type === 'issue') {
        if (existing.some((r) => r.karigar_id !== k.id)) throw new Error('This job number belongs to another karigar');
        if (existing.some((r) => r.final)) throw new Error('This job is already closed');
        cat = b.category;
        if (!db.prepare('SELECT 1 x FROM wastage WHERE karigar_id=? AND category=?').get(k.id, cat)) throw new Error('No agreed wastage set for this category');
      } else {
        if (!existing.some((r) => r.karigar_id === k.id)) throw new Error('No issue found for this job and karigar');
        if (existing.some((r) => r.final)) throw new Error('This job is already closed');
        if (!['finished', 'scrap', 'filings'].includes(b.kind)) throw new Error('Bad receipt type');
        cat = b.kind;
      }
      const fine = F.fineMg(g, p), id = nextId();
      if (type === 'issue') {
        const s = stock();
        if (fine > s.vault) throw new Error('Not enough gold in vault');
      }
      db.prepare('INSERT INTO txns(id,karigar_id,job,type,category,gross_mg,purity_bp,fine_mg,final) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id, k.id, b.job, type, cat, g, p, fine, b.final ? 1 : 0);
      db.prepare('INSERT INTO audit(email,action,ref) VALUES(?,?,?)').run(req.user.email, type, id);
      const j = jobs(k.id).find((x) => x.job === b.job);
      res.json({ id, fine: F.fmt(fine), job: { outstanding: F.fmt(j.outstanding), allowed: F.fmt(j.allowed), closed: j.closed } });
    } catch (e) { res.status(400).json({ error: e.message }); }
  };
}
app.post('/api/issue', auth('clerk', 'finance'), record('issue'));
app.post('/api/receipt', auth('clerk', 'finance'), record('receipt'));

app.get('/api/recent', auth(), (req, res) => {
  res.json(db.prepare(`SELECT t.id, k.name, t.job, t.type, t.category, t.gross_mg, t.purity_bp, t.fine_mg
    FROM txns t JOIN karigars k ON k.id=t.karigar_id ORDER BY t.rowid DESC LIMIT 8`).all()
    .map((r) => ({ ...r, gross: F.fmt(r.gross_mg), purity: (r.purity_bp / 100).toFixed(2), fine: F.fmt(r.fine_mg) })));
});

// Alerts are items to review, never accusations. Finance only.
app.get('/api/alerts', auth('finance'), (req, res) => {
  const out = [];
  for (const k of db.prepare('SELECT * FROM karigars').all()) {
    const closed = jobs(k.id).filter((j) => j.closed);
    const last = closed[closed.length - 1];
    if (last && last.excess > 0) out.push({ karigar: k.name, text: `Job ${last.job} closed ${F.fmt(last.excess)} g above the agreed allowance. Please review.` });
    if (F.drifting(closed.map((j) => j.lossPct))) out.push({ karigar: k.name, text: 'Recent loss is higher than this karigar’s own earlier average, though within allowance. Worth a look.' });
  }
  res.json(out);
});

// Every gram accounted for: vault + with karigars + finished + allowance used + beyond allowance = opening + old gold bought.
// ASSUMPTION: finished pieces leave to showroom stock; scrap, filings and old gold bought go into the vault.
function stock() {
  const sum = (w) => db.prepare(`SELECT COALESCE(SUM(fine_mg),0) s FROM txns WHERE ${w}`).get().s;
  const issued = sum("type='issue'"), finished = sum("category='finished'"), back = sum("category IN ('scrap','filings')");
  let withK = 0, allowance = 0, beyond = 0;
  for (const k of db.prepare('SELECT id FROM karigars').all())
    for (const j of jobs(k.id)) {
      if (j.closed) { allowance += Math.min(j.outstanding, j.allowed); beyond += Math.max(0, j.outstanding - j.allowed); }
      else withK += j.outstanding;
    }
  const old = db.prepare('SELECT COALESCE(SUM(fine_mg),0) s FROM old_gold').get().s; // old gold bought goes into the vault
  const vault = OPENING_MG - issued + back + old;
  return { vault, withK, finished, allowance, beyond, refiner: 0, reconciled: vault + withK + finished + allowance + beyond === OPENING_MG + old };
}
app.get('/api/stock', auth('finance'), (req, res) => {
  const s = stock();
  res.json({ date: new Date().toISOString().slice(0, 10), vault: F.fmt(s.vault), withKarigars: F.fmt(s.withK), finished: F.fmt(s.finished),
    allowance: F.fmt(s.allowance), beyond: F.fmt(s.beyond), refiner: F.fmt(s.refiner), reconciled: s.reconciled });
});

const csv = (v) => `"${String(v).replace(/"/g, '""')}"`;
app.get('/api/stock.csv', auth('finance'), (req, res) => {
  const rows = db.prepare('SELECT t.id,t.created_at,k.name,t.type,t.category,t.job,t.fine_mg FROM txns t JOIN karigars k ON k.id=t.karigar_id ORDER BY t.rowid').all();
  res.type('text/csv').send('Voucher,Date,Party,Type,Category,Narration,FineGold_g\n' +
    rows.map((r) => [r.id, r.created_at.slice(0, 10), r.name, r.type, r.category, 'Job ' + r.job, F.fmt(r.fine_mg)].map(csv).join(',')).join('\n'));
});

// Scale photo reading via any OpenAI-compatible router. Unsure or offline returns null so the clerk types it.
app.post('/api/read-scale', auth('clerk', 'finance'), async (req, res) => {
  const { AI_BASE_URL, AI_API_KEY, AI_MODEL } = process.env;
  if (typeof req.body.image !== 'string') return res.status(400).json({ error: 'Photo required' });
  if (!AI_API_KEY || !AI_BASE_URL || !AI_MODEL) return res.json({ weight: null, note: 'Reader offline, type the value' });
  try {
    const r = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${AI_API_KEY}` },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 100, messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${req.body.image}` } },
        { type: 'text', text: 'Read the number on this jewellery scale display. Reply ONLY JSON {"weight":"123.456"} or {"weight":null} if unclear.' }] }] }),
    });
    const d = await r.json();
    const j = JSON.parse(d.choices[0].message.content.replace(/```json|```/g, ''));
    res.json({ weight: j.weight && /^\d+\.\d{3}$/.test(j.weight) ? j.weight : null });
  } catch { res.json({ weight: null, note: 'Could not read the photo' }); }
});

require('./oldgold').register(app, db, auth);

module.exports = { app, db };
if (require.main === module) {
  require('./seed')(db, bcrypt);
  require('./oldgold').seed(db);
  app.listen(process.env.PORT || 3000, () => console.log('Running on http://localhost:' + (process.env.PORT || 3000)));
}