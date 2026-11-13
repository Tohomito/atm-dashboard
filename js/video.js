/* Section G, Video: how far people watch each episode on atm.media (Vimeo export) and how visitors move
   through the episode pages (GA4). Data: data/video/ (tools/video.py, loaded once a month). */
(function () {
'use strict';
const $ = id => document.getElementById(id);
const C = window.ATMChart;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const int = x => Math.round(+x || 0).toLocaleString('en-US');
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = m => `${MON[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const dur = s => { s = Math.round(+s || 0); return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`; };

function parseCSV(t) {
  const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); rows.push(r); r = []; c = ''; } else if (ch !== '\r') c += ch; }
  if (c || r.length) { r.push(c); rows.push(r); }
  const [h, ...rest] = rows.filter(x => x.length > 1 || x[0] !== '');
  return h ? rest.map(x => Object.fromEntries(h.map((k, i) => [k, x[i] ?? '']))) : [];
}
const get = f => fetch(`data/${f}?v=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.text() : '').then(t => t ? parseCSV(t) : []).catch(() => []);

// a readable name for an episode page from its address
const pageName = p => {
  let s = decodeURIComponent(p.replace(/^\/episodes\//, '')).replace(/-\|-/g, ' | ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const where = p => p === '/' ? 'Home page' : p.startsWith('/episodes/') ? 'Another episode' : p.startsWith('/collections') ? 'Collections' : p.startsWith('/vote') || p.startsWith('/momentawards') ? 'Moment Awards' : p.startsWith('/about') || p.startsWith('/contact') ? 'About or contact' : 'Other pages';

async function load() {
  const sec = $('video');
  if (!sec) return;
  const [videos, pages, journeys, companies, arrivals, benchRows] = await Promise.all(['video/videos.csv', 'video/pages.csv', 'video/journeys.csv', 'companies.csv', 'video/arrivals.csv', 'video/benchmarks.csv'].map(get));
  const B = Object.fromEntries(benchRows.map(r => [r.key, r]));
  if (!videos.length || !pages.length) { sec.hidden = true; return; }
  const months = [...new Set(pages.map(r => r.month))].sort();
  const industryOf = {};
  companies.forEach(c => { if (c.name) industryOf[c.name.toLowerCase()] = c.industry; if (c.partner) industryOf[c.partner.toLowerCase()] ??= c.industry; });
  const state = { month: months[months.length - 1], by: 'program', prog: 'all' };

  if (months.length > 1) {
    $('v-month').innerHTML = months.map(m => `<button type="button" data-v="${m}" aria-pressed="${m === state.month}">${MON[+m.slice(5, 7) - 1].slice(0, 3)} ${m.slice(2, 4)}</button>`).join('');
    $('v-month').hidden = false;
  }
  const seg = (id, key) => $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
    state[key] = b.dataset.v; $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); draw(); });
  seg('v-month', 'month'); seg('v-by', 'by');
  $('v-prog').addEventListener('change', e => { state.prog = e.target.value; draw(); });

  function draw() {
    const m = state.month;
    const vid = Object.fromEntries(videos.filter(v => v.month === m).map(v => [v.video_id, v]));
    const pg = pages.filter(p => p.month === m);
    // one row per video: when two page addresses share a video, keep the one with more views
    const seen = new Set();
    const ep = pg.filter(p => p.video_id && vid[p.video_id]).sort((a, b) => b.views - a.views).filter(p => !seen.has(p.video_id) && seen.add(p.video_id)).map(p => {
      const v = vid[p.video_id], ind = p.company ? (industryOf[p.company.toLowerCase()] || '') : '';
      return { ...p, v, plays: +v.views, fin: +v.finishes, pct: +v.avg_pct, secs: +v.avg_time_s, time: +v.time_s,
        visits: +p.sessions_other, program: p.program || 'Untagged', industry: ind || (p.company ? 'Other' : 'Untagged') };
    });
    const plays = ep.reduce((a, e) => a + e.plays, 0), fin = ep.reduce((a, e) => a + e.fin, 0), time = ep.reduce((a, e) => a + e.time, 0);
    const wpct = plays ? Math.round(ep.reduce((a, e) => a + e.pct * e.plays, 0) / plays) : 0;
    const views = pg.reduce((a, p) => a + +p.views, 0);
    const sE = pg.reduce((a, p) => a + +p.sessions_email, 0), sO = pg.reduce((a, p) => a + +p.sessions_other, 0);
    const avg = k => { const s = pg.reduce((a, p) => a + +p['sessions_' + k], 0); return s ? pg.reduce((a, p) => a + (+p['sessions_' + k]) * (+p['secs_' + k] || 0), 0) / s : 0; };
    const onward = pg.reduce((a, p) => a + +p.onward, 0), onEp = pg.reduce((a, p) => a + +p.onward_episode, 0);
    const other = Object.values(vid).filter(v => v.kind === 'other'), otherPlays = other.reduce((a, v) => a + +v.views, 0);
    const allPlays = Object.values(vid).reduce((a, v) => a + +v.views, 0);
    const M = monthName(m);

    $('v-title').textContent = `Video on atm.media, ${M}`;
    $('v-lede').textContent = `Episode videos were played ${int(plays)} times in ${M}, and viewers watched ${wpct}% of each video on average. ` +
      `${pct(fin, plays)}% of plays reached the end. ${pct(sE, sE + sO)}% of the visits that began on an episode page came from email links and lasted ${Math.round(avg('email'))} seconds on average; ` +
      `visits from social, search and direct links lasted ${dur(avg('other'))}. Few visitors went on to another page: ${int(onward)} moves for ${int(views)} episode page views.`;

    $('v-tiles').innerHTML = [
      ['Episode plays', int(plays), `${ep.length} episode videos, Vimeo`],
      ['Watched on average', wpct + '%', 'of each video, weighted by plays'],
      ['Plays that finished', pct(fin, plays) + '%', `${int(fin)} finishes`],
      ['Hours watched', (time / 3600).toFixed(1), 'episode videos only'],
      ['Visits from email links', pct(sE, sE + sO) + '%', `of ${int(sE + sO)} visits that began on an episode page`],
      ['Moves to another page', (100 * onward / (views || 1)).toFixed(1), `per 100 episode page views; ${int(onEp)} to another episode`],
    ].map(([k, v, d]) => `<div class="tile"><span class="k">${k}</span><span class="v">${v}</span><span class="d">${d}</span></div>`).join('');

    // program filter
    const progs = [...new Set(ep.map(e => e.program))].sort((a, b) => a === 'Untagged' ? 1 : b === 'Untagged' ? -1 : a.localeCompare(b));
    if (!progs.includes(state.prog)) state.prog = 'all';
    $('v-prog').innerHTML = `<option value="all">All programs</option>` + progs.map(p => `<option value="${esc(p)}"${p === state.prog ? ' selected' : ''}>${esc(p)}</option>`).join('');

    // episode table
    const rows = ep.filter(e => state.prog === 'all' || e.program === state.prog).filter(e => e.plays >= 3).sort((a, b) => b.plays - a.plays);
    $('v-table').innerHTML = `<thead><tr><th>Episode</th><th>Program and guest</th><th class="num">Visits*</th><th class="num">Plays</th><th class="num">Watched</th><th class="num">Avg. time</th><th class="num">Finished</th></tr></thead><tbody>` +
      rows.map(e => `<tr><td><a href="https://www.atm.media${esc(e.page)}" target="_blank" rel="noopener">${esc(e.v.title || pageName(e.page))}</a></td>` +
        `<td>${esc(e.program)}${e.guest || e.company ? `<br><span class="dim">${esc([e.guest, e.company].filter(Boolean).join(', '))}</span>` : ''}</td>` +
        `<td class="num">${int(e.visits)}</td><td class="num">${int(e.plays)}</td><td class="num">${e.pct}%</td><td class="num">${dur(e.secs)}</td><td class="num">${pct(e.fin, e.plays)}%</td></tr>`).join('') +
      (rows.length ? '' : `<tr><td colspan="7" class="dim">No episode video in this program had 3 or more plays in ${M}.</td></tr>`) + '</tbody>';

    // watch-through by program or industry
    const groups = {};
    ep.forEach(e => { const k = state.by === 'industry' ? e.industry : e.program; const g = groups[k] ??= { plays: 0, w: 0, fin: 0, n: 0 }; g.plays += e.plays; g.w += e.pct * e.plays; g.fin += e.fin; g.n++; });
    const gl = Object.entries(groups).filter(([, g]) => g.plays >= 5).map(([k, g]) => ({ k, ...g, avg: g.w / g.plays })).sort((a, b) => b.avg - a.avg);
    $('v-groups').innerHTML = '';
    const benchBar = B.watch_2_10 ? [{ label: `Benchmark, ${B.watch_2_10.source.replace(' business video data', '')} ${B.watch_2_10.year}`, value: +B.watch_2_10.value, color: 'var(--muted)', src: `${B.watch_2_10.label}, ${B.watch_2_10.source} (${B.watch_2_10.year})` }] : [];
    if (gl.length) C.hbar('v-groups', gl.map(g => ({ label: `${g.k} (${g.plays} plays)`, value: Math.round(g.avg), src: `${g.n} episode video${g.n > 1 ? 's' : ''}, ${int(g.plays)} plays, ${pct(g.fin, g.plays)}% finished` })).concat(benchBar),
      { fmt: v => v + '%', labW: 280, rowH: 28, max: 100, aria: `Average share of each video watched, by ${state.by}, ${M}`,
      });
    $('v-groups-sub').textContent = `Average share of each video watched, weighted by plays, ${M}. Groups with fewer than 5 plays are left out.` +
      (B.watch_2_10 ? ` The grey bar is the ${B.watch_2_10.value}% benchmark for business videos of 2 to 10 minutes (${B.watch_2_10.source}, ${B.watch_2_10.year}).` : '');

    // benchmarks
    const arr = Object.fromEntries(arrivals.filter(a => a.month === m).map(a => [a.channel, a]));
    const ppv = ch => arr[ch] && +arr[ch].sessions ? (+arr[ch].views / +arr[ch].sessions) : null;
    const brow = (key, atm, fmt, atmNote) => { const b = B[key]; if (!b || atm == null) return '';
      const bv = +b.value, gap = atm / bv;
      const [word, col] = gap >= 1.1 ? ['Above', 'var(--goodtext)'] : gap >= 0.9 ? ['About level', 'var(--ink2)'] : gap >= 0.75 ? ['Below', 'var(--vb-amber)'] : ['Well below', 'var(--crit)'];
      const dot = `<span aria-hidden="true" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${col};margin-right:6px"></span>`;
      return `<tr><td>${esc(b.label)}${atmNote ? `<br><span class="dim">${esc(atmNote)}</span>` : ''}</td><td class="num" style="color:${col};font-weight:700">${fmt(atm)}</td><td class="num">${fmt(bv)}</td><td style="color:${col};font-weight:600;white-space:nowrap">${dot}${word}</td></tr>`; };
    const pagesFmt = v => (+v).toFixed(2).replace(/0$/, '');
    $('v-bench').innerHTML = `<thead><tr><th>Measure</th><th class="num">ATM</th><th class="num">Benchmark</th><th></th></tr></thead><tbody>` +
      brow('watch_2_10', wpct, v => Math.round(v) + '%', 'Episode videos, weighted by plays') +
      brow('pages_social', ppv('Organic Social'), pagesFmt, 'Visits that began on an episode page') +
      brow('pages_direct', ppv('Direct'), pagesFmt, 'Visits that began on an episode page') +
      brow('internal_share', 100 * onward / (views || 1), v => (+v).toFixed(1) + '%', 'ATM: moves on from episode pages per 100 episode page views, a narrower measure') + '</tbody>';
    $('v-bench-sub').textContent = `${M}. Green: 10% or more above the benchmark. Grey: within 10%. Amber: 10% to 25% below. Red: more than 25% below. None of these benchmarks is specific to B2B media publishers, so read them as a rough guide.`;
    const srcs = [...new Map(benchRows.map(r => [r.source, r])).values()];
    $('v-bench-src').innerHTML = 'Sources: ' + srcs.map(r => `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.source)} (${esc(r.year)})</a>`).join('; ') + '. ATM: Vimeo video report and GA4.';

    // arrivals
    $('v-arrive').innerHTML = '';
    C.hbar('v-arrive', [{ label: `Email links (${int(sE)} visits)`, value: Math.round(avg('email')), src: 'Sessions that began on an episode page, from email links' },
      { label: `Social, search, direct (${int(sO)})`, value: Math.round(avg('other')), src: 'Sessions that began on an episode page, from every other source' }],
      { fmt: v => dur(v), labW: 280, rowH: 32, aria: `Average visit length by how visitors arrived, ${M}` });

    // where visitors go next
    const titleOf = {}; pg.forEach(p => { if (p.video_id && vid[p.video_id]) titleOf[p.page] = vid[p.video_id].title; });
    const nameOf = p => titleOf[p] || pageName(p);
    const jm = journeys.filter(j => j.month === m && j.from.startsWith('/episodes/'));
    const dest = {};
    jm.forEach(j => { const k = where(j.to); dest[k] = (dest[k] || 0) + +j.views; });
    const top = jm.filter(j => j.to.startsWith('/episodes/')).sort((a, b) => b.views - a.views).slice(0, 6);
    $('v-next').innerHTML = `<table class="mini"><tbody>` + Object.entries(dest).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${k}</td><td class="num">${int(v)}</td></tr>`).join('') + `</tbody></table>` +
      (top.length ? `<p class="sub" style="margin-top:12px">Most common moves from one episode to another</p><table class="mini"><tbody>` +
        top.map(j => `<tr><td>${esc(nameOf(j.from))} → ${esc(nameOf(j.to))}</td><td class="num">${int(j.views)}</td></tr>`).join('') + `</tbody></table>` : '');
    $('v-next-sub').textContent = `Page views whose previous page was an episode page, ${M}. Reloads of the same page are left out.`;

    $('v-other').textContent = `Episode videos are those linked to an episode page. The other ${int(otherPlays)} of ${int(allPlays)} Vimeo plays in ${M} (${pct(otherPlays, allPlays)}%) were review copies, social cuts, teasers and raw footage, which include the team's own review plays, so they are left out of these figures. The section updates once a month, after the month closes, from Vimeo's video report joined to GA4 figures for the episode pages.`;
  }
  draw();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
