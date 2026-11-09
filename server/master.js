const F = require('./fine');

// Agreed wastage %: 0 to 10, max 2 decimals. Returned as basis points (3.00% = 300).
function parseWastage(p) {
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(String(p))) throw new Error('Wastage %: a number from 0 to 10, max 2 decimals');
  const bp = Math.round(parseFloat(p) * 100);
  if (bp > 1000) throw new Error('Wastage % cannot be above 10');
  return bp;
}

// Karigar master. Finance only: agreed wastage is a commercial term, so the clerk can view it but not change it.
function register(app, db, auth) {
  const fin = auth('finance');

  app.post('/api/karigars', fin, (req, res) => {
    const name = String(req.body.name || '').trim();
    if (name.length < 2 || name.length > 40) return res.status(400).json({ error: 'Karigar name: 2 to 40 characters' });
    if (db.prepare('SELECT 1 x FROM karigars WHERE lower(name)=lower(?)').get(name)) return res.status(400).json({ error: 'A karigar with this name already exists' });
    const r = db.prepare('INSERT INTO karigars(name) VALUES(?)').run(name);
    db.prepare('INSERT INTO audit(email,action,ref) VALUES(?,?,?)').run(req.user.email, 'karigar-add', name);
    res.json({ id: Number(r.lastInsertRowid), name });
  });

  app.put('/api/karigars/:id/wastage', fin, (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!db.prepare('SELECT 1 x FROM karigars WHERE id=?').get(id)) throw new Error('Karigar not found');
      const cat = String(req.body.category || '').trim().toLowerCase();
      if (!/^[a-z]{3,20}$/.test(cat)) throw new Error('Category: letters only, 3 to 20 characters');
      const bp = parseWastage(req.body.percent);
      db.prepare('INSERT INTO wastage(karigar_id,category,bp) VALUES(?,?,?) ON CONFLICT(karigar_id,category) DO UPDATE SET bp=excluded.bp').run(id, cat, bp);
      db.prepare('INSERT INTO audit(email,action,ref) VALUES(?,?,?)').run(req.user.email, 'wastage-set', `${id}:${cat}:${bp}`);
      res.json({ category: cat, percent: (bp / 100).toFixed(2) });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
}
module.exports = { register, parseWastage };