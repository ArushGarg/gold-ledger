// Demo data only. Murugesan's rows are the brief's sample (TX-30411/30437/30438).
const F = require('./fine');
module.exports = (db, bcrypt) => {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c) return;
  const pw = bcrypt.hashSync(process.env.DEMO_PASSWORD || 'demo1234', 10);
  db.prepare('INSERT INTO users VALUES(?,?,?)').run('clerk@demo.com', pw, 'clerk');
  db.prepare('INSERT INTO users VALUES(?,?,?)').run('finance@demo.com', pw, 'finance');
  ['Murugesan S', 'Selvam K', 'Ravi P', 'Karthik M'].forEach((n, i) => {
    db.prepare('INSERT INTO karigars VALUES(?,?)').run(i + 1, n);
    [['necklace', 300], ['ring', 250], ['bangle', 280]].forEach(([c, bp]) => db.prepare('INSERT INTO wastage VALUES(?,?,?)').run(i + 1, c, bp));
  });
  const ins = db.prepare('INSERT INTO txns(id,karigar_id,job,type,category,gross_mg,purity_bp,fine_mg,final) VALUES(?,?,?,?,?,?,?,?,?)');
  const row = (id, k, job, type, cat, gross, final = 0) => ins.run(id, k, job, type, cat, gross, 9160, F.fineMg(gross, 9160), final);
  row('TX-30411', 1, 'J-1001', 'issue', 'necklace', 120000);
  row('TX-30437', 1, 'J-1001', 'receipt', 'finished', 112450);
  row('TX-30438', 1, 'J-1001', 'receipt', 'scrap', 3300);

  // Closed history: [karigar, category, loss % of issue]. Selvam steady then a jump (drift, within allowance).
  // Ravi has one job beyond allowance. Karthik is clean.
  const hist = [
    [2, 'ring', 0.30], [2, 'ring', 0.28], [2, 'ring', 0.32], [2, 'ring', 0.30], [2, 'ring', 0.70],
    [3, 'ring', 0.40], [3, 'ring', 3.40],
    [4, 'bangle', 0.20], [4, 'bangle', 0.25], [4, 'bangle', 0.22],
  ];
  hist.forEach(([k, cat, pct], i) => {
    const job = `J-${2000 + i}`, issue = 90000 + i * 1500;
    const back = Math.round(issue * (1 - pct / 100)), fin = Math.round(back * 0.96);
    row(`TX-31${i}a`, k, job, 'issue', cat, issue);
    row(`TX-31${i}b`, k, job, 'receipt', 'finished', fin);
    row(`TX-31${i}c`, k, job, 'receipt', 'scrap', back - fin, 1);
  });
};