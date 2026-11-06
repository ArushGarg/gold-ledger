const F = require('./fine');

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const PAN_AT = 5000000;    // ASSUMPTION: PAN needed from Rs 50,000 (in paise)
const CASH_MAX = 20000000; // ASSUMPTION: cash payment cap Rs 2,00,000 (in paise)
const MODES = ['cash', 'upi', 'bank'];

const toPaise = (r) => {
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(String(r))) throw new Error('Rate: rupees per gram, max 2 decimals');
  return Math.round(parseFloat(r) * 100);
};
const rupees = (p) => (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Net = gross - deductions; fine = net x purity; value = fine x rate. All integers.
function compute({ gross, deduction = '0', purity, rate }) {
  const g = F.toMg(gross), d = F.toMg(deduction), bp = F.toBp(purity), rp = toPaise(rate);
  if (g <= 0) throw new Error('Weight must be above zero');
  if (d >= g) throw new Error('Deductions must be less than gross weight');
  const net = g - d, fine = F.fineMg(net, bp);
  return { grossMg: g, deductionMg: d, netMg: net, purityBp: bp, fineMg: fine, ratePaise: rp, valuePaise: Math.round((fine * rp) / 1000) };
}

function compliance(valuePaise, mode, pan) {
  if (!MODES.includes(mode)) return { needsPan: false, error: 'Choose a payment mode' };
  const needsPan = valuePaise >= PAN_AT;
  if (needsPan && !PAN_RE.test(pan || '')) return { needsPan, error: 'PAN is required for purchases of Rs 50,000 or more (format ABCDE1234F)' };
  if (mode === 'cash' && valuePaise > CASH_MAX) return { needsPan, error: 'Cash payment above Rs 2,00,000 is not allowed. Use UPI or bank transfer.' };
  return { needsPan, error: null };
}

function register(app, db, auth) {
  db.exec(`CREATE TABLE IF NOT EXISTS old_gold(id TEXT PRIMARY KEY, bill_no TEXT UNIQUE, customer TEXT,
    gross_mg INT, deduction_mg INT, purity_bp INT, fine_mg INT, rate_paise INT, value_paise INT,
    mode TEXT, pan TEXT, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  const roles = auth('clerk', 'finance');

  app.post('/api/oldgold/preview', roles, (req, res) => {
    try {
      const c = compute(req.body), k = compliance(c.valuePaise, req.body.mode, req.body.pan);
      res.json({ net: F.fmt(c.netMg), fine: F.fmt(c.fineMg), value: rupees(c.valuePaise), needsPan: k.needsPan, warning: k.error });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.post('/api/oldgold', roles, (req, res) => {
    try {
      const b = req.body, c = compute(b), k = compliance(c.valuePaise, b.mode, b.pan);
      if (k.error) throw new Error(k.error);
      if (!/^[\w\/-]{1,24}$/.test(b.bill || '')) throw new Error('Exchange bill number required');
      const cust = String(b.customer || '').trim();
      if (cust.length < 2 || cust.length > 60) throw new Error('Customer name required');
      const id = 'OG-' + (50001 + db.prepare('SELECT COUNT(*) c FROM old_gold').get().c);
      db.prepare('INSERT INTO old_gold(id,bill_no,customer,gross_mg,deduction_mg,purity_bp,fine_mg,rate_paise,value_paise,mode,pan,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, b.bill, cust, c.grossMg, c.deductionMg, c.purityBp, c.fineMg, c.ratePaise, c.valuePaise, b.mode, k.needsPan ? b.pan : null, req.user.email);
      res.json({ id, fine: F.fmt(c.fineMg), value: rupees(c.valuePaise) });
    } catch (e) {
      res.status(400).json({ error: /UNIQUE/.test(e.message) ? 'This exchange bill already has an old-gold entry' : e.message });
    }
  });

  // Clerk and finance only: purchases carry customer names and masked PANs.
  app.get('/api/oldgold', roles, (req, res) => {
    res.json(db.prepare('SELECT * FROM old_gold ORDER BY rowid DESC LIMIT 20').all().map((r) => ({
      id: r.id, bill: r.bill_no, customer: r.customer, gross: F.fmt(r.gross_mg), purity: (r.purity_bp / 100).toFixed(2),
      fine: F.fmt(r.fine_mg), value: rupees(r.value_paise), mode: r.mode, pan: r.pan ? 'XXXXXX' + r.pan.slice(-4) : '' })));
  });
}

// Seed rows must obey the same rules as live entries, or the app contradicts its own demo data.
function seed(db) {
  if (db.prepare('SELECT COUNT(*) c FROM old_gold').get().c) return;
  const ins = db.prepare('INSERT INTO old_gold(id,bill_no,customer,gross_mg,deduction_mg,purity_bp,fine_mg,rate_paise,value_paise,mode,pan,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
  [['EX-1001', 'Demo Customer A', '3.000', '0.100', '91.60', 'cash', null],       // small cash purchase, under the PAN limit
   ['EX-1002', 'Demo Customer B', '60.000', '1.200', '91.60', 'bank', 'ABCDE1234F']].forEach(([bill, cust, g, d, p, mode, pan], i) => {
    const c = compute({ gross: g, deduction: d, purity: p, rate: '12500' });
    const k = compliance(c.valuePaise, mode, pan);
    if (k.error) throw new Error('Seed data breaks its own rule: ' + k.error);
    ins.run('OG-' + (50001 + i), bill, cust, c.grossMg, c.deductionMg, c.purityBp, c.fineMg, c.ratePaise, c.valuePaise, mode, pan, 'clerk@demo.com');
  });
}

module.exports = { compute, compliance, register, seed, rupees };