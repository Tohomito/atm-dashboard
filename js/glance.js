/* Toolbar (view switch, refresh, ask box), "At a glance" insights by time frame, and the key-measures panel.
   Runs once the daily data (ATMDailyReady) and the monthly files (ATMScoreReady) have loaded. */
(function () {
const D = window.ATMDaily;
const { addDays, mdy, longDate, fmt, full, sign, esc, slash } = D;
const $ = id => document.getElementById(id);
const pct = (a, b) => b ? (a / b - 1) * 100 : null;
const pctTxt = p => p == null ? '' : `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(0)}%`;
const plain = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' ').trim(); };

/* ---------- view switch ---------- */
function setView(v, push) {
  document.body.dataset.view = v;
  document.querySelectorAll('.seg[data-for="view"] button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'));
  if (push) history.replaceState(null, '', v === 'actions' ? '#actions' : location.pathname + location.search);
  if (push) window.scrollTo(0, 0);
}
document.querySelectorAll('.seg[data-for="view"] button').forEach(b => b.addEventListener('click', () => setView(b.dataset.v, true)));
document.querySelectorAll('[data-goto="actions"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); setView('actions', true); }));
setView(location.hash === '#actions' ? 'actions' : 'data', false);
window.addEventListener('hashchange', () => setView(location.hash === '#actions' ? 'actions' : 'data', false));

/* ---------- refresh ---------- */
$('refresh-btn').addEventListener('click', () => {
  const u = new URL(location.href); u.searchParams.set('r', Date.now()); location.replace(u.toString());
});

/* ---------- insights by time frame ---------- */
function tileBy(tiles, re) { return (tiles || []).find(t => re.test(t.label)) || null; }

function windowFacts(S, W, tiles) {
  const { DAILY, POSTS, YT } = S;
  const liDays = DAILY.filter(d => d.li_org != null), AS_OF = liDays.at(-1).date;
  const all = W === 'all', n = all ? liDays.length : W;
  const cur = liDays.slice(-n), prev = all ? [] : liDays.slice(-2 * n, -n);
  const sum = (rows, k) => rows.reduce((s, d) => s + (d[k] || 0), 0);
  const startRunf = rows => rows.length ? rows[0].li_runf - (rows[0].li_newf || 0) : null;
  const f = { W, all, AS_OF, from: cur[0].date };
  f.imp = sum(cur, 'li_org'); f.impPrev = prev.length === n ? sum(prev, 'li_org') : null;
  f.liGain = cur.at(-1).li_runf - startRunf(cur); f.liGainPrev = prev.length === n ? prev.at(-1).li_runf - startRunf(prev) : null;
  const ig = DAILY.filter(d => d.ig_reach != null), igNow = ig.at(-1);
  const igThen = all ? ig[0] : ig.filter(d => d.date <= addDays(igNow.date, -n)).at(-1);
  f.igReach = igNow?.ig_reach; f.igReachDate = igNow?.date; f.igReachThen = igThen?.ig_reach; f.igReachThenDate = igThen?.date;
  const igf = DAILY.filter(d => d.ig_runf != null), igfNow = igf.at(-1);
  const igfThen = all ? igf[0] : igf.filter(d => d.date <= addDays(AS_OF, -n)).at(-1);
  f.igFoll = igfNow?.ig_runf; f.igFollChange = igfThen ? igfNow.ig_runf - igfThen.ig_runf : null; f.igFollSince = igfThen?.date;
  const postEnd = POSTS.reduce((m, p) => p.date > m ? p.date : m, '');
  const pStart = all ? POSTS.reduce((m, p) => p.date < m ? p.date : m, '9999') : addDays(postEnd, -(n - 1));
  const inWin = (a, b) => POSTS.filter(p => p.date >= a && p.date <= b);
  const P = inWin(pStart, postEnd), PP = all ? [] : inWin(addDays(pStart, -n), addDays(pStart, -1));
  const li = P.filter(p => p.ch === 'LinkedIn'), ig2 = P.filter(p => p.ch === 'Instagram'), liP = PP.filter(p => p.ch === 'LinkedIn');
  f.postStart = pStart; f.postEnd = postEnd; f.liPosts = li.length; f.igPosts = ig2.length;
  f.liComments = li.reduce((s, p) => s + (p.comments || 0), 0);
  f.cpp = li.length ? f.liComments / li.length : null;
  f.cppPrev = liP.length ? liP.reduce((s, p) => s + (p.comments || 0), 0) / liP.length : null;
  f.topLI = [...li].sort((a, b) => (b.reach || 0) - (a.reach || 0))[0];
  f.topIG = [...ig2].sort((a, b) => (b.views || 0) - (a.views || 0))[0];
  const sr = YT.subsRows || [], sNow = sr.at(-1);
  const sThen = sNow ? (all ? sr[0] : sr.filter(r => r.date <= addDays(sNow.date, -n)).at(-1)) : null;
  f.ytTotal = YT.total_subs; f.ytGain = sNow && sThen && sThen !== sNow ? sNow.value - sThen.value : null; f.ytFrom = sThen?.date;
  const sPrev = sThen && !all ? sr.filter(r => r.date <= addDays(sThen.date, -n)).at(-1) : null;
  f.ytGainPrev = sPrev ? sThen.value - sPrev.value : null;
  f.nl = tileBy(tiles, /newsletter active subscribers/i); f.sess = tileBy(tiles, /atm\.media sessions/i);
  f.monthly = (tiles && tiles[0] && tiles[0].data_vintage.match(/\(([^)]+)\)/)) ? tiles[0].data_vintage.match(/\(([^)]+)\)/)[1].replace(/ window/, '') : 'latest month';
  return f;
}

function who(p) { return p.person ? `${esc(p.person)}${p.company ? `, ${esc(p.company)}` : ''}` : esc(p.title.length > 60 ? p.title.slice(0, 58) + '…' : p.title); }

function glanceHTML(f) {
  const span = f.all ? `since ${mdy(f.from)}` : `over the ${f.W} days to ${mdy(f.AS_OF)}`;
  const b = [];
  b.push(`LinkedIn organic impressions: <b>${full(f.imp)}</b> ${span}${f.impPrev != null ? ` (${pctTxt(pct(f.imp, f.impPrev))} on the ${f.W} days before)` : ''}.`);
  b.push(`LinkedIn gained <b>${full(f.liGain)}</b> organic followers${f.liGainPrev != null ? ` (${full(f.liGainPrev)} the ${f.W} days before)` : ''}; Instagram followers ${f.igFollChange != null ? `moved ${sign(f.igFollChange)}${full(f.igFollChange)} ` : ''}to <b>${full(f.igFoll)}</b>.`);
  if (f.igReach != null) b.push(`Instagram's 28-day reach is <b>${fmt(f.igReach)}</b> as of ${mdy(f.igReachDate)}${f.igReachThen ? ` (${pctTxt(pct(f.igReach, f.igReachThen))} on the ${mdy(f.igReachThenDate)} read)` : ''}.`);
  b.push(`Posts published ${slash(f.postStart)}–${slash(f.postEnd)}: <b>${f.liPosts} on LinkedIn and ${f.igPosts} on Instagram</b>. LinkedIn posts drew <b>${full(f.liComments)} comments</b>${f.cpp != null ? `, ${f.cpp.toFixed(1)} per post` : ''}${f.cppPrev != null ? ` (${f.cppPrev.toFixed(1)} the ${f.W} days before)` : ''}.${!f.all && f.W <= 14 ? ' Posts from the last few days are still collecting comments, so short windows read low.' : ''}`);
  const tops = [];
  if (f.topLI) tops.push(`on LinkedIn, ${who(f.topLI)} (${mdy(f.topLI.date)}) with <b>${full(f.topLI.reach)} impressions</b>`);
  if (f.topIG) tops.push(`on Instagram, ${who(f.topIG)} (${mdy(f.topIG.date)}) with <b>${full(f.topIG.views)} views</b>`);
  if (tops.length) b.push(`Best post ${tops.join('; ')}.`);
  if (f.ytGain != null) b.push(`YouTube gained <b>${full(f.ytGain)} subscribers</b> since ${mdy(f.ytFrom)}, to ${full(f.ytTotal)}.`);
  if ((f.all || f.W >= 30) && (f.nl || f.sess)) b.push(`Monthly (${esc(f.monthly)}): ${f.nl ? `<b>${esc(f.nl.value_as_published)}</b> active newsletter subscribers` : ''}${f.nl && f.sess ? '; ' : ''}${f.sess ? `<b>${esc(f.sess.value_as_published)}</b> site sessions (${esc(f.sess.detail.split('·')[0].trim())})` : ''}.`);
  return b;
}

/* ---------- key measures ---------- */
function measureCards(f, tiles) {
  const period = f.all ? `since ${mdy(f.from)}` : `last ${f.W} days`;
  const prevLabel = `prior ${f.W}d`;
  const syn = tileBy(tiles, /syndication multiplier/i), clicks = tileBy(tiles, /verified human clicks/i);
  let ctrNow = null, ctrWas = null;
  if (clicks) { const m = clicks.detail.match(/rate\s*([\d.]+)%.*?was\s*([\d.]+)%/i); if (m) { ctrNow = +m[1]; ctrWas = +m[2]; } }
  return [
    { k: 'LinkedIn comments per post', v: f.cpp != null ? f.cpp.toFixed(1) : '—', p: period, now: f.cpp, prev: f.all ? null : f.cppPrev, prevLabel, fmtB: x => x.toFixed(1), n: !f.all && f.W <= 14 ? 'Recent posts are still collecting comments, so a short window reads low against the one before.' : 'Comments follow people: guest and honoree posts draw the most.' },
    { k: 'Partner-repost lift', v: syn ? syn.value_as_published : '—', p: `${f.monthly}, monthly`, now: null, prev: null, n: syn ? `${syn.detail}; the best posts reached 7–8× with a partner's own repost.` : 'Arrives with the monthly files.' },
    { k: 'Instagram reach, 28 days', v: fmt(f.igReach), p: `as of ${f.igReachDate ? mdy(f.igReachDate) : '—'}`, now: f.igReach, prev: f.igReachThen, prevLabel: f.igReachThenDate ? mdy(f.igReachThenDate) : '', fmtB: fmt, n: 'Collabs still win; the reach loss is in the other posts.' },
    { k: 'YouTube subscribers gained', v: f.ytGain != null ? `${sign(f.ytGain)}${full(f.ytGain)}` : '—', p: f.ytGain != null ? `since ${mdy(f.ytFrom)} · ${full(f.ytTotal)} total` : `${full(f.ytTotal)} total; no read at the start of this window`, now: f.ytGain, prev: f.all ? null : f.ytGainPrev, prevLabel, fmtB: full, n: 'All organic since the ad flight ended in August.' },
    { k: 'Newsletter verified-click rate', v: ctrNow != null ? ctrNow.toFixed(2) + '%' : '—', p: `${f.monthly}, monthly, share of delivered email`, now: ctrNow, prev: ctrWas, prevLabel: 'month before', fmtB: x => x.toFixed(2) + '%', n: 'Bot-filtered clicks; list size alone is inflated by imports.' },
    { k: 'Homepage sign-up rate', v: 'Not yet', p: 'starts with October data', now: null, prev: null, n: 'The subscribe prompt moved up the homepage on Oct 1. Judge it on sign-ups per homepage session, not total subscribers.' }
  ];
}
function measuresHTML(cards) {
  return cards.map(c => {
    const ch = c.now != null && c.prev != null && c.prev !== 0 ? pct(c.now, c.prev) : null;
    const chip = ch == null ? '' : `<span class="chip ${ch > 0.5 ? 'up' : ch < -0.5 ? 'down' : ''}">${ch > 0.5 ? '▲' : ch < -0.5 ? '▼' : '–'} ${pctTxt(ch)}</span>`;
    const mx = Math.max(c.now || 0, c.prev || 0) || 1;
    const bars = c.now != null && c.prev != null ? `<div class="bars" aria-hidden="true">
      <div class="bar"><span>now</span><i style="width:${Math.max(2, c.now / mx * 100)}%"></i></div>
      <div class="bar prev"><span>${esc(c.prevLabel || 'before')}</span><i style="width:${Math.max(2, c.prev / mx * 100)}%"></i></div></div>` : '';
    return `<div class="measure"><div class="mk">${esc(c.k)}</div><div class="mv mono">${esc(c.v)}</div><div class="mp">${esc(c.p)}${c.now != null && c.prev != null ? ` · before: ${esc(c.fmtB(c.prev))}` : ''}</div>${chip}${bars}<div class="mn">${esc(c.n)}</div></div>`;
  }).join('');
}

/* ---------- boot ---------- */
Promise.all([window.ATMDailyReady, window.ATMScoreReady]).then(([S, score]) => {
  const tiles = score ? score.tiles : [];
  $('loaded-at').textContent = 'Loaded ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (!S) { $('glance-list').innerHTML = '<li>Daily figures could not load. Try Refresh.</li>'; return; }
  const W = { '7': 7, '14': 14, '30': 30, all: 'all' };
  const facts = Object.fromEntries(Object.keys(W).map(k => [k, windowFacts(S, W[k], tiles)]));
  const show = k => {
    const f = facts[k];
    $('glance-title').textContent = f.all ? `Everything since ${longDate(f.from)}` : `The last ${f.W} days, to ${longDate(f.AS_OF)}`;
    $('glance-list').innerHTML = glanceHTML(f).map(x => `<li>${x}</li>`).join('');
    $('measures').innerHTML = measuresHTML(measureCards(f, tiles));
  };
  const box = document.querySelector('.seg[data-for="glance"]');
  box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { box.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); show(b.dataset.v); }));
  show('7');
  $('measures-note').textContent = 'Daily measures follow the time frame above. Repost lift and newsletter clicks come from the monthly figures and show the latest month.';

  /* ---------- ask box: opens Claude with the question and the dashboard's current figures ---------- */
  const A = (window.ATMAnalysis || []);
  const context = () => {
    const lines = ['Figures from the ATM audience dashboard (https://atm.mattbecher.com).', `Daily figures run through ${facts['7'].AS_OF}; monthly figures cover ${facts['7'].monthly}.`, ''];
    for (const k of ['7', '14', '30', 'all']) {
      const f = facts[k];
      lines.push(f.all ? `ALL TIME (since ${f.from}):` : `LAST ${f.W} DAYS:`);
      glanceHTML(f).forEach(x => lines.push('- ' + plain(x)));
    }
    lines.push('', 'KEY MEASURES (last 30 days where daily):');
    measureCards(facts['30'], tiles).forEach(c => lines.push(`- ${c.k}: ${c.v} (${c.p})${c.now != null && c.prev != null ? `, before ${c.fmtB(c.prev)}` : ''}`));
    const fnd = A.filter(r => r.kind === 'finding'), notes = A.filter(r => r.kind === 'note');
    if (fnd.length) { lines.push('', 'CURRENT ANALYSIS:'); fnd.forEach(r => lines.push(`- ${r.title} ${r.text}`)); }
    if (notes.length) { lines.push('', 'HOW TO READ THE NUMBERS:'); notes.forEach(r => lines.push(`- ${r.title} ${r.text}`)); }
    return lines.join('\n');
  };
  $('ask-form').addEventListener('submit', e => {
    e.preventDefault();
    const q = $('ask-q').value.trim(); if (!q) { $('ask-q').focus(); return; }
    let ctx = context();
    if (ctx.length > 7000) ctx = ctx.split('\nHOW TO READ THE NUMBERS:')[0];
    if (ctx.length > 7000) ctx = ctx.slice(0, 7000) + '\n[trimmed]';
    const prompt = `I'm on the ATM team. Answer my question using the dashboard figures below. Say plainly when they can't answer it, and what data would.\n\nQuestion: ${q}\n\n${ctx}`;
    const url = 'https://claude.ai/new?q=' + encodeURIComponent(prompt);
    const w = window.open(url, '_blank', 'noopener');
    const note = $('ask-note'); note.hidden = false;
    note.innerHTML = w ? 'Opened in a new Claude chat with the dashboard figures attached. The answer appears there.' : `Your browser blocked the new tab. <a href="${url}" target="_blank" rel="noopener">Open the question in Claude</a>.`;
  });
});
})();
