// Karigar master screen. Finance edits agreed wastage % per category; the clerk can only view it.
window.extraTabs = { ...window.extraTabs, master: 'Karigar master' };
window.extraViews = {
  ...window.extraViews,
  async master() {
    const ks = await api('karigars'), fin = R === 'finance', note = window.masterNote || '';
    window.masterNote = '';
    app.innerHTML = `<div id=mNote>${note}</div>
    ${fin ? `<div class=card><h2 style="margin-top:0">Set agreed wastage</h2>
      <label>Karigar</label><select id=mk>${ks.map(k => `<option value=${k.id}>${esc(k.name)}</option>`).join('')}</select>
      <div class=grid>
        <div><label>Item category</label><input id=mc list=cats placeholder="necklace" maxlength=20 autocomplete="off">
          <datalist id=cats><option>necklace<option>ring<option>bangle<option>chain<option>earring</datalist></div>
        <div><label>Agreed wastage (%)</label><input id=mp inputmode=decimal placeholder="3.00" autocomplete="off"></div>
      </div>
      <p class=empty style="text-align:left;padding:8px 0 0">Applies to new issues only. Jobs already issued keep the % they were issued under.</p>
      <button class=btn id=mSave>Save wastage</button><div id=mErr></div></div>
      <div class=card><h2 style="margin-top:0">Add karigar</h2><label>Name</label><input id=mn maxlength=40 autocomplete="off">
      <button class=btn id=mAdd>Add karigar</button><div id=mErr2></div></div>` : '<div class="card empty">View only. Agreed wastage is changed by the finance head.</div>'}
    <h3>Agreed wastage per karigar</h3>
    ${ks.map(k => `<div class=card><b>${esc(k.name)}</b><div style="margin-top:8px">${k.wastage.map(w => `<span class=chip>${esc(w.category)} ${(w.bp / 100).toFixed(2)}%</span> `).join('') || '<span class=empty>No categories set yet</span>'}</div></div>`).join('')}`;
    if (!fin) return;
    const clear = () => { $('#mNote').innerHTML = ''; $('#mErr').innerHTML = ''; $('#mErr2').innerHTML = ''; };
    const done = (msg) => { window.masterNote = `<div class=ok>${esc(msg)}</div>`; render('master'); };
    $('#mSave').onclick = async () => {
      clear();
      const b = $('#mSave'); b.disabled = true;
      try {
        const d = await api(`karigars/${$('#mk').value}/wastage`, { method: 'PUT', body: { category: $('#mc').value, percent: $('#mp').value.trim() } });
        done(`Saved: ${d.category} ${d.percent}%`);
      } catch (e) { $('#mErr').innerHTML = `<div class=err>${esc(e.message)}</div>`; b.disabled = false; }
    };
    $('#mAdd').onclick = async () => {
      clear();
      const b = $('#mAdd'); b.disabled = true;
      try { const d = await api('karigars', { method: 'POST', body: { name: $('#mn').value } }); done(`Added ${d.name}. Set a wastage % for each category before issuing gold.`); }
      catch (e) { $('#mErr2').innerHTML = `<div class=err>${esc(e.message)}</div>`; b.disabled = false; }
    };
  },
};