// Demo data only. Matches the brief's sample rows (TX-30411/30437/30438).
module.exports = (db, bcrypt) => {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c) return;
  const pw = bcrypt.hashSync(process.env.DEMO_PASSWORD || 'demo1234', 10);
  db.prepare('INSERT INTO users VALUES(?,?,?)').run('clerk@demo.com', pw, 'clerk');
  db.prepare('INSERT INTO users VALUES(?,?,?)').run('finance@demo.com', pw, 'finance');
  const names = ['Murugesan S', 'Selvam K', 'Ravi P', 'Karthik M'];
  names.forEach((n, i) => {
    db.prepare('INSERT INTO karigars VALUES(?,?)').run(i + 1, n);
    [['necklace', 300], ['ring', 250], ['bangle', 280]].forEach(([c, bp]) => db.prepare('INSERT INTO wastage VALUES(?,?,?)').run(i + 1, c, bp));
  });
  const t = db.prepare('INSERT INTO txns(id,karigar_id,job,type,category,gross_mg,purity_bp,fine_mg,final) VALUES(?,?,?,?,?,?,?,?,?)');
  t.run('TX-30411', 1, 'J-1001', 'issue', 'necklace', 120000, 9160, 109920, 0);
  t.run('TX-30437', 1, 'J-1001', 'receipt', 'finished', 112450, 9160, 103004, 0);
  t.run('TX-30438', 1, 'J-1001', 'receipt', 'scrap', 3300, 9160, 3023, 0);
  // Selvam: steady history then a higher-loss job, so the drift alert has something real to show
  [[200, 220, 230, 240, 520]].flat().forEach((loss, i) => {
    const job = 'J-20' + i, issue = 50000 + i * 1000;
    t.run('TX-31' + i + 'a', 2, job, 'issue', 'ring', issue, 10000, issue, 0);
    t.run('TX-31' + i + 'b', 2, job, 'receipt', 'finished', issue - loss * 10, 10000, issue - loss * 10, 1);
  });
};