/* ================= DATA LOADER =================
   Everything below fills the page from the files in ./data.
   Rob's monthly run replaces those files; this page never needs editing for a new month. */

const FMT = {
  percent: fmtPct, integer: fmtInt, integer_abbrev: fmtK,
  pct0: v => v.toFixed(0) + '%', pct1: v => v.toFixed(1) + '%', dec1: v => v.toFixed(1),
  pct_small2: v => v.toFixed(v < 5 ? 2 : 0) + '%'
};
const PALETTE = ['--s1', '--s2', '--s3', '--s4', '--s7'];
const col = c => c ? (c.startsWith('--') ? css(c) : c) : null;
const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? 0 : n; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function parseCSV(t) {
  const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { r.push(c); c = ''; }
    else if (ch === '\n') { r.push(c); rows.push(r); r = []; c = ''; }
    else if (ch !== '\r') c += ch;
  }
  if (c || r.length) { r.push(c); rows.push(r); }
  return rows.filter(x => x.length > 1 || x[0] !== '');
}
const objects = rows => { const [h, ...rest] = rows; return rest.map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? '']))); };
const V = Date.now();
const getText = p => fetch(`data/scorecard/${p}?v=${V}`, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(`${p} (${r.status})`); return r.text(); });
const getCSV = p => getText(p).then(t => objects(parseCSV(t)));

/* ---------- chart CSV -> the arguments Rob's drawing functions take ---------- */
function chartArgs(id, rows, st) {
  const o = Object.assign({}, st.opts);
  if (o.fmt) o.fmt = FMT[o.fmt];
  const cols = st.colors || {};
  const order = (a, k) => [...new Set(a.map(r => r[k]))];
  switch (st.type) {
    case 'bullet': {
      return [order(rows, 'metric').map(m => {
        const rs = rows.filter(r => r.metric === m);
        const atm = rs.find(r => !/^benchmark/i.test(r.series)) || rs[0];
        const cfg = (st.rows || {})[m] || {};
        const marks = rs.filter(r => r !== atm).map(r => { const label = r.series.replace(/^benchmark[^:]*:\s*/i, ''); return { label, short: (cfg.marks || {})[label] || label, value: num(r.value) }; });
        const top = Math.max(num(atm.value), ...marks.map(x => x.value));
        const row = { label: m, value: num(atm.value), max: cfg.max && cfg.max >= top ? cfg.max : top * 1.2, fmt: FMT[cfg.fmt || (atm.unit === 'percent' ? 'percent' : 'integer')] };
        if (atm.source_note) row.src = atm.source_note;
        if (marks.length) row.marks = marks;
        return row;
      }), o];
    }
    case 'stack100':
      return [rows.map((r, i) => ({ label: r.label, value: num(r.value), color: col(cols[r.label] || PALETTE[i % PALETTE.length]) })), o];
    case 'hbar':
      return [rows.map(r => {
        const x = { label: r.label, value: num(r.value) };
        const c = cols[r.label] || (/benchmark/i.test(r.flag || '') ? '--muted' : null);
        if (c) x.color = col(c);
        if (r.source_note) x.src = r.source_note;
        return x;
      }), o];
    case 'vbar': {
      const cats = rows.map(r => r.category);
      if (o.colors && !Array.isArray(o.colors)) { const m = o.colors; o.colors = cats.map(c => col(m[c]) || undefined); }
      if (rows.some(r => r.note)) o.notes = rows.map(r => r.note || '');
      return [cats, rows.map(r => num(r.value)), o];
    }
    case 'vstack': case 'line': {
      const cats = order(rows, 'category');
      const series = order(rows, 'series').map((s, i) => ({
        name: s, color: col(cols[s] || PALETTE[i % PALETTE.length]),
        values: cats.map(c => { const r = rows.find(x => x.series === s && x.category === c); return r ? num(r.value) : 0; })
      }));
      return [cats, series, o];
    }
  }
  throw new Error('unknown chart type ' + st.type);
}
const DRAW = { bullet, hbar, vbar, vstack, line, stack100 };

/* ---------- page assembly ---------- */
function statusCell(t) {
  const cls = /blocked/i.test(t) ? 'blocked' : /removed|not |dormant/i.test(t) ? 'missing' : 'ok';
  return `<span class="status ${cls}"><i></i>${esc(t)}</span>`;
}
function fillTable(t, rows) {
  const ths = JSON.parse(t.dataset.thStyle || '[]'), tds = JSON.parse(t.dataset.tdClass || '[]');
  const head = Object.keys(rows[0] || {});
  const statusCol = head.findIndex(h => /^status$/i.test(h));
  let h = '<tr>' + head.map((k, i) => `<th${ths[i] ? ` style="${ths[i]}"` : ''}>${esc(k)}</th>`).join('') + '</tr>';
  for (const r of rows) {
    const bold = r[head[0]] === 'ATM';
    h += '<tr>' + head.map((k, i) => {
      let v = i === statusCol ? statusCell(r[k]) : esc(r[k]);
      if (bold) v = `<b>${v}</b>`;
      return `<td${tds[i] ? ` class="${tds[i]}"` : ''}>${v}</td>`;
    }).join('') + '</tr>';
  }
  t.innerHTML = h;
}

async function boot() {
  const [text, index, style, tiles, analysis] = await Promise.all([
    getCSV('page_text.csv'), getCSV('chart_index.csv'), getText('chart_style.json').then(JSON.parse),
    getCSV('stat_tiles.csv'), getCSV('written_analysis.csv')
  ]);
  const T = Object.fromEntries(text.map(r => [r.key, r.text]));
  // the combined analysis (written across every source) replaces the header and fills "The read"
  const A = await fetch(`data/analysis.csv?v=${V}`, { cache: 'no-store' }).then(r => r.ok ? r.text() : '').then(t => t ? objects(parseCSV(t)) : []).catch(() => []);
  const one = k => (A.find(r => r.kind === k) || {}).text;
  for (const [k, key] of [['header_eyebrow', 'header.eyebrow'], ['header_title', 'header.title'], ['header_lede', 'header.lede'], ['header_meta', 'header.meta']]) if (one(k)) T[key] = one(k);
  const put = (id, h) => { const e = document.getElementById(id); if (e) e.innerHTML = h; };
  put('read-eyebrow', esc(one('read_eyebrow') || ''));
  put('read-headline', esc(one('read_headline') || ''));
  put('read-lede', esc(one('read_lede') || ''));
  put('read-findings', A.filter(r => r.kind === 'finding').map(r => `<li><b>${esc(r.title)}</b>${esc(r.text)}</li>`).join(''));
  put('read-actions', A.filter(r => r.kind === 'action').map((r, i) => `<div class="play"><div class="num">${i + 1}</div><div><b>${esc(r.title)}</b><div class="why">${esc(r.text)}</div></div></div>`).join(''));
  put('tag-actions', A.filter(r => r.kind === 'action_tag').map((r, i) => `<div class="play"><div class="num">${i + 1}</div><div><b>${esc(r.title)}</b><div class="why">${esc(r.text)}</div></div></div>`).join(''));
  const plays = kind => A.filter(r => r.kind === kind).map((r, i) => `<div class="play"><div class="num">${i + 1}</div><div><b>${esc(r.title)}</b><div class="why">${esc(r.text)}</div></div></div>`).join('');
  put('setup-actions', plays('setup'));
  put('tracking-actions', plays('tracking'));
  if (one('header_eyebrow')) put('actions-eyebrow', esc('Actions · ' + (one('header_eyebrow').match(/written [^·]+/i) || [''])[0].trim()));
  window.ATMAnalysis = A;
  put('read-notes', A.filter(r => r.kind === 'note').map(r => `<li><b>${esc(r.title)}</b> ${esc(r.text)}</li>`).join(''));
  if (!A.length) { const sec = document.getElementById('read'); if (sec) sec.hidden = true; }
  document.querySelectorAll('[data-k]').forEach(e => { if (T[e.dataset.k] != null) e.innerHTML = T[e.dataset.k]; });

  // tiles
  document.querySelectorAll('[data-tiles]').forEach(g => {
    const [sec, grp] = g.dataset.tiles.split('|');
    g.innerHTML = tiles.filter(r => r.section === sec && String(r.group) === grp)
      .map(r => `<div class="tile"><div class="v mono">${esc(r.value_as_published)}</div><div class="k">${esc(r.label)}</div><div class="d">${esc(r.detail)}</div></div>`).join('');
  });

  // verdicts and team flags
  const VCLS = { 'Champion': 'good', 'Yellow flag': 'warn', 'Red flag': 'crit' };
  document.querySelectorAll('[data-verdicts]').forEach(box => {
    const rows = analysis.filter(r => r.block === box.dataset.verdicts);
    box.innerHTML = [...new Set(rows.map(r => r.group))].map(g => {
      const items = rows.filter(r => r.group === g), c = VCLS[g] || 'warn';
      return `<div class="verdict ${c}"><span class="pill ${c}"><i></i>${esc(g)}</span><div class="n">${items.length}</div>
      <ul>${items.map(r => `<li>${esc(r.text_as_published)}</li>`).join('')}</ul></div>`;
    }).join('\n    ');
  });
  document.querySelectorAll('[data-plays]').forEach(box => {
    const rows = analysis.filter(r => r.block.includes(box.dataset.plays));
    box.innerHTML = rows.map((r, i) => {
      const t = r.text_as_published, cut = t.indexOf('. ');
      const title = cut > 0 ? t.slice(0, cut + 1) : t, why = cut > 0 ? t.slice(cut + 2) : '';
      return `<div class="play"><div class="num">${esc(r.group || i + 1)}</div><div><b>${esc(title)}</b><div class="why">${esc(why)}</div></div></div>`;
    }).join('\n      ');
    const d = rows[0] && rows[0].block.replace(/\s*flag for the team/i, '').trim();
    if (d && box.dataset.plays === 'flag for the team' && !box.previousElementSibling?.classList.contains('flag-date')) box.insertAdjacentHTML('beforebegin', `<p class="sub flag-date">From the ${esc(d)} monthly analysis; refreshed with each month's analysis.</p>`);
  });

  // tables
  const tables = document.querySelectorAll('[data-table]');
  await Promise.all([...tables].map(t => getCSV(`tables/${t.dataset.table}.csv`).then(rows => fillTable(t, rows))
    .catch(e => { t.innerHTML = `<tr><td>Table unavailable: ${esc(e.message)}</td></tr>`; })));

  // chart cards: captions from the chart index, then the charts themselves
  const IDX = Object.fromEntries(index.map(r => [r.chart_id, r]));
  document.querySelectorAll('[data-chart-card]').forEach(card => {
    const r = IDX[card.dataset.chartCard]; if (!r) return;
    card.querySelectorAll('[data-chart-text]').forEach(e => { e.textContent = r[e.dataset.chartText] || ''; });
    const src = document.createElement('p');
    src.className = 'src';
    src.textContent = `Source: ${r.source_platform_and_window} · ${r.data_vintage}`;
    card.appendChild(src);
  });
  const figs = [...document.querySelectorAll('figure[id]')];
  await Promise.all(figs.map(f => {
    const st = style[f.id];
    if (!st) return null;
    return getCSV(`charts/${f.id}.csv`).then(rows => DRAW[st.type](f.id, ...chartArgs(f.id, rows, st)))
      .catch(e => { f.innerHTML = `<p class="sub">Chart data unavailable (${esc(e.message)}).</p>`; console.error(f.id, e); });
  }));
  const stm = document.getElementById('st-monthly');
  if (stm && tiles[0]) stm.textContent = `Monthly figures: ${tiles[0].data_vintage.replace(/ update /, ' pull ')}`;
  document.documentElement.dataset.ready = '1';
  return { tiles, analysis: window.ATMAnalysis || [] };
}
window.ATMScoreReady = boot().catch(e => {
  console.error(e);
  const b = document.createElement('div');
  b.style.cssText = 'margin:16px 0;padding:12px 14px;border:1px solid var(--crit);border-radius:6px;color:var(--crit)';
  b.textContent = 'The scorecard could not load its data: ' + e.message;
  document.querySelector('.wrap').prepend(b);
  return null;
});
