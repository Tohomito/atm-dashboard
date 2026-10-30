/* Weekly mis-tag check: posts that tag "At The Moment" instead of ATM (data/mistags.csv, written by the Monday task) */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const parse = t => { const rows = []; let r = [], c = '', q = false;
    for (let i = 0; i < t.length; i++) { const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; }
      else if (ch === '\n') { r.push(c); rows.push(r); r = []; c = ''; } else if (ch !== '\r') c += ch; }
    if (c || r.length) { r.push(c); rows.push(r); }
    const [h, ...rest] = rows.filter(x => x.length > 1); return rest.map(x => Object.fromEntries(h.map((k, i) => [k, x[i] || ''])));
  };
  const md = d => { const [y, m, dd] = (d || '').split('-').map(Number); return y ? new Date(y, m - 1, dd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''; };
  Promise.all([
    fetch('data/mistags.csv?v=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : '').catch(() => ''),
    fetch('data/mistags_meta.json?v=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : {}).catch(() => ({}))
  ]).then(([t, meta]) => {
    const box = document.getElementById('mistag-log'); if (!box) return;
    const rows = t ? parse(t) : [];
    const open = rows.filter(r => !/fixed|not a mis-tag/i.test(r.status));
    const fol = (meta.other_page && meta.other_page.followers) || [];
    const last = fol[fol.length - 1], prev = fol[fol.length - 2];
    const folTxt = last ? ` "At The Moment" had ${Number(last.count).toLocaleString()} followers on ${md(last.date)}${prev ? ` (${last.count - prev.count >= 0 ? '+' : ''}${last.count - prev.count} in a week)` : ''}.` : '';
    if (!meta.checked) { box.innerHTML = `<p class="sub">Weekly check starts Monday: it searches LinkedIn for last week's posts that tag "At The Moment" when they mean ATM and lists them here.</p>`; return; }
    const head = `<p class="sub">Checked ${md(meta.checked)}. ${open.length ? `${open.length} post${open.length === 1 ? '' : 's'} to fix.` : 'No open mis-tags.'}${folTxt}</p>`;
    box.innerHTML = head + (open.length ? `<div class="tblwrap"><table class="mini"><tr><th>Posted</th><th>Who</th><th>About</th><th>Ask</th></tr>${open.map(r =>
      `<tr><td class="nw">${esc(md(r.post_date))}</td><td><a href="${esc(r.post_url)}" target="_blank" rel="noopener">${esc(r.poster)}</a></td><td>${esc(r.about)}</td><td>${esc(r.fix)}</td></tr>`).join('')}</table></div>` : '');
  });
})();
