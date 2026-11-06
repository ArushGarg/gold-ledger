// Old gold desk screen. Plugs into the main app through window.extraTabs / window.extraViews.
window.extraTabs = { oldgold: 'Old gold' };
window.extraViews = {
  async oldgold() {
    const rows = await api('oldgold');
    app.innerHTML = `<div class=card><h2 style="margin-top:0">Old gold purchase</h2><div id=ogMsg></div>
    <label>Exchange bill no.</label><input id=bill maxlength=24 placeholder="EX-1003">
    <label>Customer name</label><input id=cust maxlength=60>
    <div class=grid>
      <div><label>Gross weight (g)</label><input id=og inputmode=decimal placeholder="0.000"></div>
      <div><label>Deductions (g)</label><input id=od inputmode=decimal placeholder="0.000"></div>
      <div><label>Tested purity (%)</label><input id=op inputmode=decimal placeholder="91.60"></div>
    </div>
    <div class=grid>
      <div><label>Rate today (₹ per g)</label><input id=or inputmode=decimal value="12500"></div>
      <div><label>Payment mode</label><select id=om><option value=bank>Bank transfer</option><option value=upi>UPI</option><option value=cash>Cash</option></select></div>
    </div>
    <div id=panBox hidden><label>Customer PAN (required for high-value purchases)</label><input id=pan maxlength=10 placeholder="ABCDE1234F" style="text-transform:uppercase"></div>
    <div id=pv class=card style="margin-top:16px"><div class=empty>Enter weight and purity to see fine gold and value.</div></div>
    <button class=btn id=ogSave>Record purchase</button><div id=ogErr></div></div>
    <h3>Recent purchases</h3>${rows.length ? `<div class=card style="overflow-x:auto"><table><tr><th>ID</th><th>Bill</th><th>Customer</th><th class=num>Fine g</th><th class=num>Value ₹</th><th style="padding-left:20px">Paid by</th><th>PAN</th></tr>
    ${rows.map(r => `<tr><td>${esc(r.id)}</td><td>${esc(r.bill)}</td><td>${esc(r.customer)}</td><td class=num><b>${r.fine}</b></td><td class=num>${r.value}</td><td style="padding-left:20px;text-transform:capitalize">${esc(r.mode)}</td><td>${esc(r.pan) || '-'}</td></tr>`).join('')}</table></div>` : '<div class=empty>No purchases yet.</div>'}`;
    const f = (id) => $('#' + id).value.trim();
    const body = () => ({ gross: f('og'), deduction: f('od') || '0', purity: f('op'), rate: f('or'), mode: f('om'), pan: f('pan').toUpperCase() });
    let t;
    const calc = () => { clearTimeout(t); t = setTimeout(async () => {
      if (!f('og') || !f('op')) return;
      try {
        const d = await api('oldgold/preview', { method: 'POST', body: body() });
        $('#panBox').hidden = !d.needsPan;
        $('#pv').innerHTML = `<div class=grid><div><label style="margin-top:0">Net weight</label>${wt(d.net)}</div>
          <div><label style="margin-top:0">Fine gold</label><div class="big gold">${wt(d.fine)}</div></div>
          <div><label style="margin-top:0">Value</label><div class="big">₹ ${d.value}</div></div></div>
          ${d.warning ? `<div class=err>${esc(d.warning)}</div>` : ''}`;
      } catch (e) { $('#pv').innerHTML = `<div class=err>${esc(e.message)}</div>`; }
    }, 300); };
    ['og', 'od', 'op', 'or', 'om', 'pan'].forEach((id) => { $('#' + id).oninput = calc; });
    $('#ogSave').onclick = async () => {
      const b = $('#ogSave'); b.disabled = true;
      try {
        const d = await api('oldgold', { method: 'POST', body: { ...body(), bill: f('bill'), customer: f('cust') } });
        await window.extraViews.oldgold();
        $('#ogMsg').innerHTML = `<div class=ok>Saved ${esc(d.id)}. Fine gold ${wt(d.fine, 'big')} · value ₹ ${d.value}</div>`;
      } catch (e) { $('#ogErr').innerHTML = `<div class=err>${esc(e.message)}</div>`; b.disabled = false; }
    };
  },
};