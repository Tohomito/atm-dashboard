/* Daily social sections of the ATM Audience Dashboard.
   Reads Hannah's sheet through ATMDaily and draws with the scorecard's chart code (ATMChart),
   so the whole page shares one look. */
(function () {
const D = window.ATMDaily, C = window.ATMChart;
const { CAD, addDays, monthName, monthShort, mdy, longDate, slash, fmt, full, sign, esc, mean, round, igMonthEnds, windowTotals, buildBench } = D;
const $ = id => document.getElementById(id);
const setHTML = (id, h) => { const e = $(id); if (e) e.innerHTML = h; };

/* ---------- line chart with gaps (same look as the scorecard's line chart) ---------- */
function lineGaps(id, cats, series, opt = {}) {
  const { el, css, showTip, hideTip } = C;
  const host = $(id); host.innerHTML = '';
  const W = 560, H = opt.h || 210, padL = 48, padB = 34, padT = 14, padR = 46;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opt.aria || 'Line chart' });
  const all = series.flatMap(s => s.values).filter(v => v != null);
  if (!all.length) { host.innerHTML = '<p class="sub">No data in this range.</p>'; return; }
  let minv = opt.zero ? 0 : Math.min(...all), maxv = Math.max(...all);
  if (!opt.zero) { const pad = (maxv - minv) * 0.12 || maxv * 0.02 || 1; minv = Math.max(0, minv - pad); maxv = maxv + pad; } else maxv *= 1.1;
  if (opt.intTicks) { minv = Math.floor(minv); maxv = minv + Math.max(4, Math.ceil((Math.ceil(maxv) - minv) / 4) * 4); }
  const x0 = padL, x1 = W - padR, y0 = H - padB, y1 = padT, n = cats.length;
  const sx = i => n > 1 ? x0 + (x1 - x0) * i / (n - 1) : (x0 + x1) / 2, sy = v => y0 - (y0 - y1) * (v - minv) / (maxv - minv);
  for (let t = 0; t <= 4; t++) { const v = minv + (maxv - minv) * t / 4, y = sy(v); svg.appendChild(el('line', { x1: x0, y1: y, x2: x1, y2: y, class: 'gridline' })); svg.appendChild(el('text', { x: x0 - 8, y: y + 4, class: 'tick', 'text-anchor': 'end' }, opt.fmt(v))); }
  const every = Math.max(1, Math.ceil(n / 7));
  cats.forEach((c, i) => { if (i % every === 0) svg.appendChild(el('text', { x: sx(i), y: y0 + 16, class: 'tick', 'text-anchor': 'middle' }, c)); });
  series.forEach(s => {
    const pts = s.values.map((v, i) => [i, v]).filter(p => p[1] != null);
    if (!pts.length) return;
    svg.appendChild(el('path', { d: pts.map((p, k) => (k ? 'L' : 'M') + sx(p[0]) + ' ' + sy(p[1])).join(' '), fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...(s.dash ? { 'stroke-dasharray': '5 4' } : {}) }));
    const dots = n <= 16;
    pts.forEach((p, k) => { const last = k === pts.length - 1; if (dots || last) svg.appendChild(el('circle', { cx: sx(p[0]), cy: sy(p[1]), r: last ? 4.5 : 2.5, fill: s.color, stroke: css('--surface'), 'stroke-width': 2 })); });
    const lp = pts.at(-1); svg.appendChild(el('text', { x: sx(lp[0]) + 6, y: sy(lp[1]) + 4, class: 'val' }, opt.fmt(lp[1])));
  });
  const cross = el('line', { x1: 0, y1: y1, x2: 0, y2: y0, class: 'baseline', opacity: 0 }); svg.appendChild(cross);
  const hit = el('rect', { x: x0, y: y1, width: x1 - x0, height: y0 - y1, fill: 'transparent' }); svg.appendChild(hit);
  hit.addEventListener('mousemove', e => { const r = svg.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width * W; const i = Math.max(0, Math.min(n - 1, Math.round((px - x0) / (x1 - x0) * (n - 1)))); cross.setAttribute('x1', sx(i)); cross.setAttribute('x2', sx(i)); cross.setAttribute('opacity', 1); showTip(e, `<b>${cats[i]}</b><br>` + series.map(s => `${s.name}: ${s.values[i] == null ? '—' : full(s.values[i])}`).join('<br>')); });
  hit.addEventListener('mouseleave', () => { cross.setAttribute('opacity', 0); hideTip(); });
  svg.appendChild(el('line', { x1: x0, y1: y0, x2: x1, y2: y0, class: 'baseline' }));
  host.appendChild(svg);
}

window.ATMLine = lineGaps;

/* segmented buttons: <div class="seg" data-for="chartKey"><button data-v="..."> */
function seg(key, onPick) {
  const box = document.querySelector(`.seg[data-for="${key}"]`); if (!box) return;
  box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    box.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    onPick(b.dataset.v);
  }));
}

/* sortable table */
function sortable(tableId, cols, getRows, opts = {}) {
  const t = $(tableId); let key = opts.key, dir = opts.dir || 'desc';
  const draw = () => {
    let rows = [...getRows()];
    const c = cols.find(x => x.k === key);
    if (c) rows.sort((a, b) => {
      let x = a[key], y = b[key];
      if (c.num) { if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; }
      else { x = String(x ?? '').toLowerCase(); y = String(y ?? '').toLowerCase(); if (!x && y) return 1; if (!y && x) return -1; }
      const r = x < y ? -1 : x > y ? 1 : 0; return dir === 'asc' ? r : -r;
    });
    const head = '<tr>' + cols.map(c => `<th class="sortable" data-k="${c.k}"${c.k === key ? ` aria-sort="${dir === 'asc' ? 'ascending' : 'descending'}"` : ''}>${c.label}${c.k === key ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('') + '</tr>';
    const body = rows.length ? rows.map(r => '<tr>' + cols.map(c => `<td${c.cls ? ` class="${typeof c.cls === 'function' ? c.cls(r) : c.cls}"` : ''}>${c.show ? c.show(r) : esc(r[c.k])}</td>`).join('') + '</tr>').join('')
      : `<tr><td colspan="${cols.length}" class="dim">No posts match.</td></tr>`;
    t.innerHTML = head + body;
    t.querySelectorAll('th.sortable').forEach(th => th.onclick = () => { const k = th.dataset.k, cc = cols.find(x => x.k === k); if (key === k) dir = dir === 'asc' ? 'desc' : 'asc'; else { key = k; dir = cc.num ? 'desc' : 'asc'; } draw(); });
    if (opts.onDraw) opts.onDraw(rows);
  };
  draw(); return draw;
}

function render(S) {
  const { DAILY, POSTS, YT, GA, MO } = S;
  const css = C.css, S1 = css('--s1'), S2 = css('--s2'), S3 = css('--s3'), S4 = css('--s4');
  const liDays = DAILY.filter(d => d.li_org != null);
  const AS_OF = liDays.at(-1).date;
  const POST_END = POSTS.reduce((m, p) => p.date > m ? p.date : m, "");
  const POST_START = POSTS.reduce((m, p) => p.date < m ? p.date : m, "9999");
  const liLast = liDays.at(-1), igFollNow = DAILY.filter(d => d.ig_runf != null).at(-1);

  setHTML('st-daily', `Daily figures: through ${longDate(AS_OF)}, refreshed each time the page opens`);

  /* ===== This week ===== */
  const igReads = DAILY.filter(d => d.ig_reach != null);
  const igNow = igReads.at(-1);
  const igPrev = igNow ? igReads.filter(d => d.date <= addDays(igNow.date, -28)).at(-1) : null;
  const pctTxt = (a, b) => b ? `${sign(a - b)}${((a / b - 1) * 100).toFixed(0)}%` : '';
  const last7 = liDays.slice(-7), prior7 = liDays.slice(-14, -7);
  const s7 = last7.reduce((s, d) => s + d.li_org, 0), p7 = prior7.reduce((s, d) => s + d.li_org, 0);
  const li30 = liDays.filter(d => d.date <= addDays(AS_OF, -30)).at(-1);
  const recent = POSTS.filter(p => p.date > addDays(POST_END, -30));
  const topLI = recent.filter(p => p.ch === "LinkedIn").sort((a, b) => (b.reach || 0) - (a.reach || 0))[0];
  const topIG = recent.filter(p => p.ch === "Instagram").sort((a, b) => (b.views || 0) - (a.views || 0))[0];
  const who = p => p.person ? `${esc(p.person)}${p.company ? `, ${esc(p.company)}` : ""}` : esc(p.title);
  setHTML('now-eyebrow', `Daily · through ${mdy(AS_OF)}`);
  setHTML('now-lede', [
    `LinkedIn organic impressions were <b>${full(s7)}</b> over the 7 days to ${mdy(AS_OF)}${p7 ? ` (${pctTxt(s7, p7)} on the week before)` : ''}.`,
    `LinkedIn gained <b>${li30 ? full(liLast.li_runf - li30.li_runf) : '—'}</b> organic followers in 30 days; Instagram stands at <b>${full(igFollNow?.ig_runf)}</b> followers.`,
    igNow ? `Instagram's 28-day window reads <b>${fmt(igNow.ig_reach)} reach</b> and <b>${fmt(igNow.ig_views)} views</b>${igPrev ? ` (${pctTxt(igNow.ig_reach, igPrev.ig_reach)} reach on the prior 28 days)` : ''}.` : '',
    topLI ? `Top LinkedIn post of the last 30 days: ${who(topLI)} (${mdy(topLI.date)}), <b>${full(topLI.reach)} impressions</b>.` : '',
    topIG ? `Top Instagram post: ${who(topIG)} (${mdy(topIG.date)}), <b>${full(topIG.views)} views</b>.` : ''
  ].filter(Boolean).join(' '));

  const slice = r => r === 'all' ? liDays : liDays.slice(-parseInt(r));
  const draw = {
    liimpr: r => { const rows = slice(r); lineGaps('d-liimpr', rows.map(d => mdy(d.date)), [{ name: 'Organic impressions', color: S1, values: rows.map(d => d.li_org) }], { fmt: C.fmtK, zero: true, aria: 'LinkedIn organic impressions per day' }); },
    lifoll: r => { const rows = slice(r); lineGaps('d-lifoll', rows.map(d => mdy(d.date)), [{ name: 'Followers', color: S1, values: rows.map(d => d.li_runf) }], { fmt: C.fmtInt, intTicks: true, aria: 'LinkedIn followers' }); },
    igreach: r => { const rows = slice(r); lineGaps('d-igreach', rows.map(d => mdy(d.date)), [{ name: 'Reach', color: S2, values: rows.map(d => d.ig_reach) }, { name: 'Views', color: S4, dash: true, values: rows.map(d => d.ig_views) }], { fmt: C.fmtK, zero: true, aria: 'Instagram 28-day reach and views' }); },
    igfoll: r => { const rows = slice(r); lineGaps('d-igfoll', rows.map(d => mdy(d.date)), [{ name: 'Followers', color: S2, values: rows.map(d => d.ig_runf) }], { fmt: C.fmtInt, intTicks: true, aria: 'Instagram followers' }); }
  };
  for (const k in draw) { draw[k]('7'); seg(k, draw[k]); }
  const firstIG = DAILY.find(d => d.ig_reach != null), firstIGF = DAILY.find(d => d.ig_runf != null);
  if (firstIG) setHTML('d-igreach-sub', `Meta's 28-day rolling reach and views, read most days since ${mdy(firstIG.date)}. Gaps are days with no read.`);
  if (firstIGF) setHTML('d-igfoll-sub', `Lifetime follower total, read since ${mdy(firstIGF.date)}.`);

  // engagement, last 30 days vs the 30 before (by publish date)
  const DELTA = {}; for (const ch of ['LinkedIn', 'Instagram']) DELTA[ch] = { cur: windowTotals(POSTS, ch, POST_END), pri: windowTotals(POSTS, ch, addDays(POST_END, -30)) };
  const DM = [['LinkedIn', 'comments', 'LinkedIn comments'], ['LinkedIn', 'reactions', 'LinkedIn reactions'], ['LinkedIn', 'amp', 'LinkedIn reposts'], ['Instagram', 'comments', 'Instagram comments'], ['Instagram', 'reactions', 'Instagram likes'], ['Instagram', 'amp', 'Instagram shares']];
  setHTML('now-delta', DM.map(([ch, k, lab]) => {
    const c = DELTA[ch].cur[k], p = DELTA[ch].pri[k], d = c - p;
    return `<div class="tile"><div class="v mono">${full(c)}</div><div class="k">${lab}</div><div class="d">${sign(d)}${full(d)}${p ? ` (${sign(d)}${Math.round(d / p * 100)}%)` : ''} vs ${full(p)} the 30 days before · ${(c / (DELTA[ch].cur.posts || 1)).toFixed(1)} per post</div></div>`;
  }).join(''));
  setHTML('now-delta-note', `Lifetime totals for posts published ${slash(addDays(POST_END, -29))} to ${slash(POST_END)}, against ${slash(addDays(POST_END, -59))} to ${slash(addDays(POST_END, -30))}. A number moves when publishing moves, not when an old post picks up a late comment, so these will not tie out with LinkedIn's own 30-day Highlights.`);

  const TREND = {}; const tStart = addDays(POST_START, 29);
  for (const ch of ['LinkedIn', 'Instagram']) { TREND[ch] = []; for (let d = tStart; d <= POST_END; d = addDays(d, 1)) TREND[ch].push(Object.assign({ date: d }, windowTotals(POSTS, ch, d))); }
  const drawEng = ch => {
    const rows = TREND[ch], li = ch === 'LinkedIn', base = li ? S1 : S2;
    lineGaps('d-eng-rx', rows.map(d => mdy(d.date)), [{ name: (li ? 'Reactions' : 'Likes') + ', 30-day total', color: base, values: rows.map(d => d.reactions) }], { fmt: C.fmtK, zero: true, aria: 'Reactions, trailing 30 days' });
    lineGaps('d-eng-cm', rows.map(d => mdy(d.date)), [{ name: 'Comments, 30-day total', color: S3, values: rows.map(d => d.comments) }, { name: (li ? 'Reposts' : 'Shares') + ', 30-day total', color: S4, dash: true, values: rows.map(d => d.amp) }], { fmt: C.fmtInt, zero: true, aria: 'Comments and reposts, trailing 30 days' });
    setHTML('d-eng-t1', li ? 'LinkedIn reactions' : 'Instagram likes');
    setHTML('d-eng-t2', li ? 'LinkedIn comments and reposts' : 'Instagram comments and shares');
    setHTML('d-eng-legend1', `<span class="line" style="--c:${base}">${li ? 'Reactions' : 'Likes'}</span>`);
    setHTML('d-eng-legend2', `<span class="line" style="--c:${S3}">Comments</span><span class="line" style="--c:${S4}">${li ? 'Reposts' : 'Shares'}</span>`);
  };
  drawEng('LinkedIn'); seg('eng', drawEng);

  /* ===== benchmark tiles, in section A ===== */
  const MOk = Object.keys(MO).sort();
  const Hm = MOk.filter(k => MO[k].complete).at(-1), benchKeys = MOk.filter(k => k < Hm).slice(-3);
  const posts = k => MO[k].days * CAD, perPost = k => MO[k].org / posts(k), engRate = k => MO[k].eng / MO[k].org * 100;
  const liMoM = k => MO[k].follStart ? (MO[k].follEnd - MO[k].follStart) / MO[k].follStart * 100 : null;
  const sum = (ks, f) => ks.reduce((s, k) => s + f(k), 0);
  const B_perPost = sum(benchKeys, k => MO[k].org) / sum(benchKeys, posts), B_engRate = sum(benchKeys, k => MO[k].eng) / sum(benchKeys, k => MO[k].org) * 100, B_liMoM = mean(benchKeys.map(liMoM));
  const igM = igMonthEnds(DAILY), igH = igM(Hm), B_igMoM = mean(benchKeys.map(k => igM(k)?.mom ?? null));
  const ytFull = YT.months.filter(m => !m.partial && m.views != null), ytH = ytFull.at(-1);
  const ytBench = ytH ? ytFull.filter(m => m.k < ytH.k && !m.pre).slice(-3) : [];
  const ytBV = mean(ytBench.map(m => m.views)), ytBW = mean(ytBench.map(m => m.watch));
  const span = ks => ks.length ? `${monthShort(ks[0])}–${monthShort(ks.at(-1))}` : '';
  // the change against benchmark, green when better and red when worse (higher is better for every scorecard)
  const chg = (txt, d) => { const r = Math.round(d * 1000) / 1000; const c = r > 0 ? 'up' : r < 0 ? 'down' : 'flat'; return `<span class="chg ${c}">${c === 'up' ? '▲ ' : c === 'down' ? '▼ ' : ''}${esc(txt)}</span>`; };
  const pc = (c, b) => c == null || b == null ? 'no benchmark yet' : chg(`${sign(c / b - 1)}${((c / b - 1) * 100).toFixed(0)}% vs benchmark`, (c / b - 1) * 100);
  const pt = (c, b) => c == null || b == null ? 'no benchmark yet' : chg(`${sign(c - b)}${(c - b).toFixed(1)} pts vs benchmark`, c - b);
  const Hn = monthName(Hm);
  const tiles = [
    [full(perPost(Hm)), `LinkedIn organic reach per post, ${Hn}`, `${pc(perPost(Hm), B_perPost)} ${esc(`(${full(B_perPost)}, ${span(benchKeys)})`)}`],
    [engRate(Hm).toFixed(2) + '%', `LinkedIn engagement rate, ${Hn}`, `${pt(engRate(Hm), B_engRate)} (${B_engRate.toFixed(2)}%)`],
    [`${sign(liMoM(Hm))}${liMoM(Hm).toFixed(1)}%`, `LinkedIn follower growth, ${Hn}`, `${pt(liMoM(Hm), B_liMoM)} (${sign(B_liMoM)}${(B_liMoM ?? 0).toFixed(1)}%/mo)`],
    [igH ? `${sign(igH.mom)}${igH.mom.toFixed(1)}%` : '—', `Instagram follower growth, ${Hn}`, `${pt(igH?.mom ?? null, B_igMoM)}${B_igMoM != null ? ` (${sign(B_igMoM)}${B_igMoM.toFixed(1)}%/mo)` : ''}`],
    [fmt(igNow?.ig_reach), `Instagram reach, 28 days to ${igNow ? mdy(igNow.date) : '—'}`, igPrev ? `${chg(`${pctTxt(igNow.ig_reach, igPrev.ig_reach)} vs prior 28 days`, igNow.ig_reach - igPrev.ig_reach)} (${esc(fmt(igPrev.ig_reach))})` : ''],
    [fmt(ytH?.views), `YouTube views, ${ytH ? monthName(ytH.k) : ''}`, `${pc(ytH?.views, ytBV)} ${esc(`(${fmt(ytBV)}/mo, ${span(ytBench.map(m => m.k))})`)}`],
    [ytH?.watch != null ? `${full(ytH.watch)} hrs` : '—', `YouTube watch time, ${ytH ? monthName(ytH.k) : ''}`, `${pc(ytH?.watch, ytBW)} (${full(ytBW)} hrs/mo)`]
  ];
  setHTML('a-bench-tiles', tiles.map(([v, k, d]) => `<div class="tile"><div class="v mono">${esc(v)}</div><div class="k">${esc(k)}</div><div class="d">${d}</div></div>`).join(''));
  const proxy = MOk.find(k => MO[k].proxy);
  setHTML('a-bench-note', `${Hn} ${Hm.slice(0, 4)} is the last full month in the daily sheet; the benchmark is the three months before it, so this row moves forward on its own each month. LinkedIn per-post reach = monthly organic impressions ÷ (days × ${CAD} posts/day).${proxy ? ` From ${monthName(proxy)} on, LinkedIn monthly engagement is summed from posts published that month; earlier months use LinkedIn's Highlights totals.` : ''} Sources: LinkedIn page analytics, Meta Business Suite, YouTube Studio.`);

  /* ===== YouTube watch time, in section B ===== */
  const ytm = YT.months.filter(m => m.watch != null);
  if (ytm.length && $('d-ytwatch')) C.vbar('d-ytwatch', ytm.map(m => m.m), ytm.map(m => m.watch), { fmt: C.fmtInt, aria: 'YouTube watch hours per month', colors: ytm.map(m => m.pre || m.partial ? css('--muted') : S1), notes: ytm.map(m => m.pre ? 'pre-launch' : m.partial ? 'partial month' : '') });

  /* ===== F · every post ===== */
  const BENCH = buildBench(POSTS);
  const spanDays = Math.round((new Date(POST_END) - new Date(POST_START)) / 864e5) + 1;
  setHTML('f-eyebrow', `F · Posts · ${slash(POST_START)} to ${slash(POST_END)}`);
  setHTML('f-lede', `${POSTS.length} organic LinkedIn and Instagram posts over ${spanDays} days. Per-post figures from LinkedIn page analytics and Meta Business Suite; recent posts keep gaining until they mature. Instagram Stories are excluded. LinkedIn engagement rate = (clicks + reactions + comments + reposts) ÷ impressions; Instagram = interactions ÷ reach, so read each against its own median.`);
  const L = BENCH.LinkedIn, I = BENCH.Instagram;
  const brow = (lab, a, b) => `<tr><td>${lab}</td><td class="num">${a}</td><td class="num">${b}</td></tr>`;
  $('d-bench').innerHTML = '<tr><th>Per post</th><th>LinkedIn</th><th>Instagram</th></tr>' + [
    brow('Posts', full(L.n), full(I.n)),
    brow('Median impressions / reach', full(L.hl_med), full(I.hl_med)),
    brow('Average impressions / reach', full(L.hl_avg), full(I.hl_avg)),
    brow('Top post', full(L.hl_max), full(I.hl_max)),
    brow('Median engagement rate', L.er_med + '%', I.er_med + '%'),
    brow('Average engagement rate', L.er_avg + '%', I.er_avg + '%'),
    brow('Median reactions / likes', full(L.rx_med), full(I.rx_med)),
    brow('Median comments', L.cm_med, I.cm_med),
    brow('Median reposts / shares', full(L.am_med), full(I.am_med))
  ].join('');

  const winStart = addDays(POST_END, -29);
  const recentPosts = POSTS.filter(p => p.date >= winStart);
  setHTML('d-cmt-sub', `LinkedIn posts published ${slash(winStart)} to ${slash(POST_END)}, top 15 by comments.`);
  const cmt = recentPosts.filter(p => p.ch === 'LinkedIn' && p.comments != null).sort((a, b) => b.comments - a.comments).slice(0, 15);
  const short = p => { const t = (p.person ? `${p.person} · ${p.company || ''}` : p.title).replace(/ · $/, ''); return (t.length > 26 ? t.slice(0, 25) + '…' : t) + ` (${slash(p.date)})`; };
  if (cmt.length) C.hbar('d-cmt', cmt.map(p => ({ label: short(p), value: p.comments, src: p.title })), { fmt: C.fmtInt, labW: 270, rowH: 24, aria: 'Comments per LinkedIn post' });

  const med = { LinkedIn: L.er_med, Instagram: I.er_med };
  const dash = v => v == null || v === '' ? '<span class="dim">—</span>' : esc(v);
  const COLS = [
    { k: 'date', label: 'Date', show: r => `<span class="dim">${mdy(r.date)}</span>` },
    { k: 'ch', label: 'Channel', show: r => r.ch === 'LinkedIn' ? 'LI' : 'IG' },
    { k: 'person', label: 'Person', show: r => dash(r.person) },
    { k: 'company', label: 'Company', show: r => dash(r.company) },
    { k: 'title', label: 'Post', cls: 'post' },
    { k: 'reach', label: 'Impr / reach', num: 1, cls: 'num', show: r => full(r.reach) },
    { k: 'views', label: 'Views', num: 1, cls: 'num', show: r => full(r.views) },
    { k: 'er', label: 'Eng. rate', num: 1, cls: r => 'num' + (r.er != null && r.er >= med[r.ch] ? ' beat' : ''), show: r => r.er == null ? '—' : r.er.toFixed(2) + '%' },
    { k: 'reactions', label: 'Reactions / likes', num: 1, cls: 'num', show: r => full(r.reactions) },
    { k: 'comments', label: 'Comments', num: 1, cls: 'num', show: r => full(r.comments) },
    { k: 'amp', label: 'Reposts / shares', num: 1, cls: 'num', show: r => full(r.amp) }
  ];
  let topCh = 'all';
  const drawTop = sortable('d-top', COLS, () => recentPosts.filter(p => topCh === 'all' || p.ch === topCh), { key: 'reach' });
  seg('top', v => { topCh = v; drawTop(); });
  setHTML('d-top-sub', `Posts published ${slash(winStart)} to ${slash(POST_END)}. Click a header to sort. Green rates beat the channel's median.`);

  setHTML('foot-daily', `Daily and per-post figures (the 7/14/30-day section, the Overview scorecards, YouTube watch hours, F) refresh each time the page opens, from LinkedIn page analytics, Meta Business Suite and YouTube Studio reads. Instagram reach and views on the daily series are 28-day rolling figures. Boosted Instagram posts report organic and paid together.`);
  document.documentElement.dataset.dailyReady = '1';
}

window.ATMDailyReady = D.load().then(S => { render(S); return S; }).catch(e => {
  console.error(e);
  setHTML('st-daily', `<span style="color:var(--crit)">Daily figures could not load: ${esc(e.message)}. Try refreshing.</span>`);
  document.documentElement.dataset.dailyReady = 'error';
  return null;
});
})();
