// All gold maths in integer mg and basis points (purity 91.60% = 9160). No floats in stored values.
const toMg = (g) => {
  if (!/^\d{1,6}(\.\d{1,3})?$/.test(String(g))) throw new Error('Weight: max 3 decimals');
  return Math.round(parseFloat(g) * 1000);
};
const toBp = (p) => {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(String(p)) || parseFloat(p) > 100 || parseFloat(p) <= 0)
    throw new Error('Purity: 0-100, max 2 decimals');
  return Math.round(parseFloat(p) * 100);
};
const fineMg = (grossMg, purityBp) => Math.round((grossMg * purityBp) / 10000);
const allowedMg = (issuedFineMg, wastageBp) => Math.round((issuedFineMg * wastageBp) / 10000);
const fmt = (mg) => (mg / 1000).toFixed(3);

// job: {issued, returned, allowed, closed}. Excess loss is judged only when the job is closed.
const jobLoss = ({ issued, returned, allowed, closed }) => {
  const outstanding = issued - returned;
  return { outstanding, lossPct: issued ? outstanding / issued : 0, excess: closed ? Math.max(0, outstanding - allowed) : 0 };
};
// Drift: latest closed-job loss% vs the karigar's OWN earlier average (needs 3+ history jobs).
const drifting = (lossPcts) => {
  if (lossPcts.length < 4) return false;
  const last = lossPcts[lossPcts.length - 1];
  const prior = lossPcts.slice(0, -1);
  const avg = prior.reduce((a, b) => a + b, 0) / prior.length;
  return last > avg * 1.5 && last > 0.002;
};
module.exports = { toMg, toBp, fineMg, allowedMg, fmt, jobLoss, drifting };