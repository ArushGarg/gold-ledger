const F = require('./fine');

// Karigar accounts are linked to one karigar record. They can read only their own slips.
function register(app, db, auth, jobs) {
  db.exec('CREATE TABLE IF NOT EXISTS karigar_users(email TEXT PRIMARY KEY, karigar_id INT)');
  app.get('/api/me/slips', auth('karigar'), (req, res) => {
    const link = db.prepare('SELECT karigar_id FROM karigar_users WHERE email=?').get(req.user.email);
    if (!link) return res.status(403).json({ error: 'No karigar profile linked' });
    const k = db.prepare('SELECT name FROM karigars WHERE id=?').get(link.karigar_id);
    const js = jobs(link.karigar_id);
    const rows = db.prepare('SELECT * FROM txns WHERE karigar_id=? ORDER BY rowid DESC LIMIT 30').all(link.karigar_id);
    res.json({
      name: k.name,
      balance: F.fmt(js.filter((j) => !j.closed).reduce((a, j) => a + j.outstanding, 0)),
      jobs: js.map((j) => ({ job: j.job, closed: j.closed, balance: j.closed ? null : F.fmt(j.outstanding), allowed: j.closed ? null : F.fmt(j.allowed) })),
      slips: rows.map((t) => ({ id: t.id, job: t.job, type: t.type, category: t.category, gross: F.fmt(t.gross_mg),
        purity: (t.purity_bp / 100).toFixed(2), fine: F.fmt(t.fine_mg), at: t.created_at.slice(0, 10) })),
    });
  });
}

function seed(db, bcrypt) {
  if (db.prepare('SELECT COUNT(*) c FROM karigar_users').get().c) return;
  const pw = bcrypt.hashSync(process.env.DEMO_PASSWORD || 'demo1234', 10);
  [['karigar1@demo.com', 1], ['karigar2@demo.com', 2]].forEach(([email, id]) => {
    db.prepare('INSERT OR IGNORE INTO users VALUES(?,?,?)').run(email, pw, 'karigar');
    db.prepare('INSERT INTO karigar_users VALUES(?,?)').run(email, id);
  });
}
module.exports = { register, seed };