/* Overview band, "At a glance" (channel + time-frame tabs: headline, bullets, chart), key measures,
   toolbar (view switch, refresh, ask box) and the live peer watch in the Actions view.
   Runs once the daily data (ATMDailyReady) and the monthly files (ATMScoreReady) have loaded. */
(function () {
const D = window.ATMDaily, C = window.ATMChart;
const { addDays, mdy, longDate, fmt, full, sign, esc, monthName } = D;
const $ = id => document.getElementById(id);
const pct = (a, b) => (a != null && b) ? (a / b - 1) * 100 : null;
const pctTxt = p => p == null ? '' : `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(0)}%`;
const upDown = p => p == null ? '' : `${p >= 0 ? 'up' : 'down'} ${Math.abs(p).toFixed(0)}%`;
const plain = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' ').trim(); };
const num = v => { const n = parseFloat(String(v ?? '').replace(/[,%×x]/g, '')); return isNaN(n) ? null : n; };

/* ---------- view switch and refresh ---------- */
function setView(v, push) {
  document.body.dataset.view = v;
  document.querySelectorAll('.seg[data-for="view"] button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'));
  if (push) { history.replaceState(null, '', v === 'actions' ? '#actions' : location.pathname + location.search); window.scrollTo(0, 0); }
}
document.querySelectorAll('.seg[data-for="view"] button').forEach(b => b.addEventListener('click', () => setView(b.dataset.v, true)));
document.addEventListener('click', e => { const a = e.target.closest('[data-goto="actions"]'); if (a) { e.preventDefault(); setView('actions', true); } });
setView(location.hash === '#actions' ? 'actions' : 'data', false);
window.addEventListener('hashchange', () => setView(location.hash === '#actions' ? 'actions' : 'data', false));
$('refresh-btn').addEventListener('click', () => { const u = new URL(location.href); u.searchParams.set('r', Date.now()); location.replace(u.toString()); });

/* ---------- monthly chart files (newsletter, site, social by month) ---------- */
function parseCSV(t) {
  const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); rows.push(r); r = []; c = ''; } else if (ch !== '\r') c += ch; }
  if (c || r.length) { r.push(c); rows.push(r); }
  const [h, ...rest] = rows.filter(x => x.length > 1 || x[0] !== '');
  return rest.map(x => Object.fromEntries(h.map((k, i) => [k, x[i] ?? ''])));
}
const getMonthly = id => fetch(`data/scorecard/charts/${id}.csv?v=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.text() : '').then(t => t ? parseCSV(t) : []).catch(() => []);
/* give each monthly label a year: "Oct '25", "Nov", ..., "Jan '26", ..., "Sep*" */
function datedMonths(rows) {
  const MS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let y = null, last = -1;
  return rows.map(r => {
    const lab = String(r.category || ''), m = MS.indexOf(lab.slice(0, 3).toLowerCase()), yy = lab.match(/'(\d\d)/);
    if (yy) y = 2000 + +yy[1]; else if (y != null && m <= last) y++;
    last = m;
    return { m, y, key: y != null && m >= 0 ? `${y}-${String(m + 1).padStart(2, '0')}` : null, value: num(r.value), partial: /\*/.test(lab), label: lab };
  });
}

/* ---------- facts for one time window ---------- */
const tileBy = (tiles, re) => (tiles || []).find(t => re.test(t.label)) || null;
function windowFacts(S, W, tiles) {
  const { DAILY, POSTS, YT } = S;
  const liDays = DAILY.filter(d => d.li_org != null), AS_OF = liDays.at(-1).date;
  const all = W === 'all', n = all ? liDays.length : W;
  const cur = liDays.slice(-n), prev = all ? [] : liDays.slice(-2 * n, -n), hasPrev = prev.length === n;
  const sum = (rows, k) => rows.reduce((s, d) => s + (d[k] || 0), 0);
  const startRunf = rows => rows.length ? rows[0].li_runf - (rows[0].li_newf || 0) : null;
  const f = { W, all, n, AS_OF, from: cur[0].date, cur };
  f.imp = sum(cur, 'li_org'); f.impPrev = hasPrev ? sum(prev, 'li_org') : null;
  f.liGain = cur.at(-1).li_runf - startRunf(cur); f.liGainPrev = hasPrev ? prev.at(-1).li_runf - startRunf(prev) : null;
  const ig = DAILY.filter(d => d.ig_reach != null), igNow = ig.at(-1);
  const igThen = all ? ig[0] : ig.filter(d => d.date <= addDays(igNow.date, -n)).at(-1);
  Object.assign(f, { igReach: igNow?.ig_reach, igViews: igNow?.ig_views, igReachDate: igNow?.date, igReachThen: igThen?.ig_reach, igViewsThen: igThen?.ig_views, igReachThenDate: igThen?.date });
  const igf = DAILY.filter(d => d.ig_runf != null), igfNow = igf.at(-1);
  const igfThen = all ? igf[0] : igf.filter(d => d.date <= addDays(AS_OF, -n)).at(-1);
  f.igFoll = igfNow?.ig_runf; f.igFollChange = igfThen ? igfNow.ig_runf - igfThen.ig_runf : null;
  const postEnd = POSTS.reduce((m, p) => p.date > m ? p.date : m, '');
  const pStart = all ? POSTS.reduce((m, p) => p.date < m ? p.date : m, '9999') : addDays(postEnd, -(n - 1));
  const inWin = (a, b) => POSTS.filter(p => p.date >= a && p.date <= b);
  const P = inWin(pStart, postEnd), PP = all ? [] : inWin(addDays(pStart, -n), addDays(pStart, -1));
  const tot = (arr, k) => arr.reduce((s, p) => s + (p[k] || 0), 0);
  for (const [ch, key] of [['LinkedIn', 'li'], ['Instagram', 'ig']]) {
    const a = P.filter(p => p.ch === ch), b = PP.filter(p => p.ch === ch);
    f[key + 'Posts'] = a.length; f[key + 'PostsPrev'] = all ? null : b.length;
    for (const k of ['comments', 'reactions', 'amp']) { f[key + k] = tot(a, k); f[key + k + 'Prev'] = all ? null : tot(b, k); }
    const score = p => (ch === 'LinkedIn' ? p.reach : p.views) || 0;
    f[key + 'Top'] = [...a].sort((x, y) => score(y) - score(x))[0];
    f[key + 'TopComments'] = [...a].sort((x, y) => (y.comments || 0) - (x.comments || 0))[0];
  }
  f.postStart = pStart; f.postEnd = postEnd;
  f.cpp = f.liPosts ? f.licomments / f.liPosts : null; f.cppPrev = f.liPostsPrev ? f.licommentsPrev / f.liPostsPrev : null;
  f.young = !all && n <= 14;
  const sr = YT.subsRows || [], sNow = sr.at(-1);
  const sThen = sNow ? (all ? sr[0] : sr.filter(r => r.date <= addDays(sNow.date, -n)).at(-1)) : null;
  f.ytTotal = YT.total_subs; f.ytGain = sNow && sThen && sThen !== sNow ? sNow.value - sThen.value : null; f.ytFrom = sThen?.date;
  const sPrev = sThen && !all ? sr.filter(r => r.date <= addDays(sThen.date, -n)).at(-1) : null;
  f.ytGainPrev = sPrev ? sThen.value - sPrev.value : null;
  f.yt28 = YT.last28; f.ytMonths = YT.months;
  f.nl = tileBy(tiles, /newsletter active subscribers/i); f.sess = tileBy(tiles, /atm\.media sessions/i); f.clicks = tileBy(tiles, /verified human clicks/i);
  const mv = tiles && tiles[0] && tiles[0].data_vintage.match(/\(([^)]+)\)/);
  f.monthly = mv ? mv[1].replace(/ window/, '') : 'the latest month';
  const mn = f.monthly.match(/^([A-Z][a-z]{2})/); f.monthlyName = mn ? ({ Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June', Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December' })[mn[1]] : 'Latest month';
  return f;
}
const who = p => p.person ? `${esc(p.person)}${p.company ? `, ${esc(p.company)}` : ''}` : esc(p.title.split(/ - | \(/)[0].length <= 80 ? p.title.split(/ - | \(/)[0] : p.title.slice(0, 78) + '…');
const before = f => `the ${f.n} days before`;

/* ---------- headline + bullets for a channel and window ---------- */
function readout(f, ch) {
  const B = [], cand = [];
  const add = (label, p, text) => { if (p != null && isFinite(p)) cand.push({ label, p, text }); };
  const liImp = () => `LinkedIn drew <b>${full(f.imp)}</b> organic impressions${f.impPrev != null ? `, ${upDown(pct(f.imp, f.impPrev))} on ${before(f)}` : ''}.`;
  const liFoll = () => `LinkedIn gained <b>${full(f.liGain)}</b> organic followers${f.liGainPrev != null ? ` (${full(f.liGainPrev)} in ${before(f)})` : ''}.`;
  const liPosts = () => `<b>${f.liPosts}</b> LinkedIn posts drew <b>${full(f.licomments)}</b> comments${f.cpp != null ? `, ${f.cpp.toFixed(1)} per post` : ''}${f.cppPrev != null ? ` against ${f.cppPrev.toFixed(1)}` : ''}${f.young ? '; the newest posts are still collecting comments' : ''}.`;
  const liTop = () => f.liTop ? `Top LinkedIn post: ${who(f.liTop)} (${mdy(f.liTop.date)}), <b>${full(f.liTop.reach)} impressions</b>.` : '';
  const igReach = () => f.igReach != null ? `Instagram's 28-day reach was <b>${fmt(f.igReach)}</b> on ${mdy(f.igReachDate)}${f.igReachThen ? `, ${upDown(pct(f.igReach, f.igReachThen))} on the ${mdy(f.igReachThenDate)} reading` : ''}.` : '';
  const igFoll = () => f.igFollChange != null ? `Instagram ${f.igFollChange >= 0 ? 'added' : 'lost'} <b>${full(Math.abs(f.igFollChange))}</b> followers, to ${full(f.igFoll)}.` : `Instagram has ${full(f.igFoll)} followers.`;
  const igPosts = () => `<b>${f.igPosts}</b> Instagram posts drew <b>${full(f.igreactions)}</b> likes and ${full(f.igcomments)} comments${f.igreactionsPrev ? ` (likes ${upDown(pct(f.igreactions, f.igreactionsPrev))} on ${before(f)})` : ''}.`;
  const igTop = () => f.igTop ? `Top Instagram post: ${who(f.igTop)} (${mdy(f.igTop.date)}), <b>${full(f.igTop.views)} views</b>.` : '';
  const yt = () => f.ytGain != null ? `YouTube gained <b>${full(f.ytGain)}</b> subscribers since ${mdy(f.ytFrom)}, to ${full(f.ytTotal)}.` : `YouTube has <b>${full(f.ytTotal)}</b> subscribers; there is no reading at the start of this window to compare.`;
  const monthlyOnly = 'Figures for this channel are monthly. Switch to 30 days or All to see them.';
  const nl = () => f.nl ? `The newsletter had <b>${esc(f.nl.value_as_published)}</b> active subscribers over ${esc(f.monthly)} (${esc(f.nl.detail)}).` : '';
  const ck = () => f.clicks ? `Verified human clicks: <b>${esc(f.clicks.value_as_published)}</b> across the month's sends (${esc(f.clicks.detail)}).` : '';
  const site = () => f.sess ? `The site had <b>${esc(f.sess.value_as_published)}</b> sessions over ${esc(f.monthly)} (${esc(f.sess.detail)}).` : '';

  add('LinkedIn impressions', pct(f.imp, f.impPrev), p => `LinkedIn impressions ${upDown(p)} on ${before(f)}`);
  add('Instagram reach', pct(f.igReach, f.igReachThen), p => `Instagram's 28-day reach ${upDown(p)} since ${mdy(f.igReachThenDate)}`);
  if (!f.young) add('LinkedIn comments per post', pct(f.cpp, f.cppPrev), p => `LinkedIn comments per post ${upDown(p)} on ${before(f)}`);
  // likes on young posts and sparse YouTube readings make poor headlines, so they stay in the bullets only
  if (!f.young && f.igreactionsPrev) add('Instagram likes', pct(f.igreactions, f.igreactionsPrev), p => `Instagram likes ${upDown(p)} on ${before(f)}`);
  const pick = re => { const c = cand.filter(x => re.test(x.label)).sort((a, b) => Math.abs(b.p) - Math.abs(a.p))[0]; return c ? c.text(c.p) + '.' : ''; };

  let headline = '';
  if (ch === 'all') {
    headline = f.all ? `${full(f.imp)} LinkedIn impressions, ${full(f.liGain)} new LinkedIn followers and ${f.liPosts + f.igPosts} posts since ${mdy(f.from)}.` : pick(/./);
    B.push(liImp(), liPosts(), igReach(), igFoll(), [liTop(), igTop()].filter(Boolean).join(' '), yt());
    if (f.all || f.n >= 30) B.push([nl(), site()].filter(Boolean).join(' '));
  } else if (ch === 'li') {
    headline = f.all ? `${full(f.imp)} organic impressions and ${full(f.liGain)} new followers since ${mdy(f.from)}.` : pick(/LinkedIn/);
    B.push(liImp(), liFoll(), liPosts(), `Reactions totalled <b>${full(f.lireactions)}</b> and reposts ${full(f.liamp)}${f.lireactionsPrev != null ? `, against ${full(f.lireactionsPrev)} and ${full(f.liampPrev)} in ${before(f)}` : ''}.`, liTop(),
      f.liTopComments && f.liTopComments.comments ? `Most-commented: ${who(f.liTopComments)} (${mdy(f.liTopComments.date)}), <b>${full(f.liTopComments.comments)} comments</b>.` : '');
  } else if (ch === 'ig') {
    headline = pick(/Instagram/) || `Instagram stands at ${full(f.igFoll)} followers.`;
    B.push(igReach(), f.igViews != null ? `28-day views were <b>${fmt(f.igViews)}</b>${f.igViewsThen ? `, ${upDown(pct(f.igViews, f.igViewsThen))} on the same reading` : ''}.` : '', igFoll(), igPosts(), igTop());
  } else if (ch === 'yt') {
    headline = f.ytGain != null ? `YouTube gained ${full(f.ytGain)} subscribers since ${mdy(f.ytFrom)}.` : `YouTube stands at ${full(f.ytTotal)} subscribers.`;
    const lastM = (f.ytMonths || []).filter(m => !m.partial && m.views != null).at(-1);
    B.push(yt(), f.yt28 && f.yt28.views != null ? `Last 28 days: <b>${fmt(f.yt28.views)}</b> views and ${f.yt28.watch ?? '—'} watch hours.` : '',
      lastM ? `${monthName(lastM.k)} closed at <b>${full(lastM.views)}</b> views and ${full(lastM.watch)} watch hours, all organic since the ad flight ended in August.` : '');
  } else if (ch === 'nl') {
    const cm = f.clicks && f.clicks.detail.match(/rate\s*([\d.]+)%.*?was\s*([\d.]+)%/i);
    headline = cm ? `The verified-click rate fell from ${cm[2]}% to ${cm[1]}% of delivered email while the list grew on imports.` : 'Newsletter figures are monthly.';
    if (!f.all && f.n < 30) B.push(monthlyOnly); else B.push(nl(), ck(), 'List size includes imported addresses, so verified clicks are the better measure of readers.');
  } else if (ch === 'site') {
    headline = f.sess ? `The site drew ${esc(f.sess.value_as_published)} sessions over ${esc(f.monthly)}.` : 'Site traffic.';
    if (!f.all && f.n < 30) B.push(monthlyOnly); else B.push(site(), 'New against returning visitors needs GA4 data; getting access is a setup task in the Actions view.');
  }
  return { headline, bullets: B.filter(Boolean) };
}

/* ---------- chart for a channel and window ---------- */
async function drawChart(f, ch, S) {
  const host = $('glance-chart'), cap = $('glance-chart-cap'), css = C.css;
  host.innerHTML = '';
  const rows = f.cur, cats = rows.map(d => mdy(d.date));
  if (ch === 'all' || ch === 'li') { window.ATMLine('glance-chart', cats, [{ name: 'Organic impressions', color: css('--s1'), values: rows.map(d => d.li_org) }], { fmt: C.fmtK, zero: true, h: 200 }); cap.textContent = 'LinkedIn organic impressions per day'; return; }
  if (ch === 'ig') { window.ATMLine('glance-chart', cats, [{ name: 'Reach', color: css('--s2'), values: rows.map(d => d.ig_reach) }, { name: 'Views', color: css('--s4'), dash: true, values: rows.map(d => d.ig_views) }], { fmt: C.fmtK, zero: true, h: 200 }); cap.textContent = 'Instagram 28-day reach (solid) and views (dashed)'; return; }
  if (ch === 'yt') {
    const sr = (S.YT.subsRows || []).filter(r => f.all || r.date >= f.from);
    if (sr.length > 1) { window.ATMLine('glance-chart', sr.map(r => mdy(r.date)), [{ name: 'Subscribers', color: css('--s1'), values: sr.map(r => r.value) }], { fmt: C.fmtInt, intTicks: true, h: 200 }); cap.textContent = 'YouTube subscribers, on days with a reading'; return; }
    const ms = S.YT.months.filter(m => m.views != null);
    C.vbar('glance-chart', ms.map(m => m.m), ms.map(m => m.views), { fmt: C.fmtK, colors: ms.map(m => m.pre || m.partial ? css('--muted') : css('--s1')) }); cap.textContent = 'YouTube views per month'; return;
  }
  const mrows = await getMonthly(ch === 'nl' ? 's-nl' : 's-ga');
  host.innerHTML = '';
  if (!mrows.length) { host.innerHTML = '<p class="sub">Monthly data unavailable.</p>'; cap.textContent = ''; return; }
  C.vbar('glance-chart', mrows.map(r => r.category), mrows.map(r => num(r.value)), { fmt: C.fmtK, hideVals: true, every: 2 });
  cap.textContent = ch === 'nl' ? 'Newsletter active subscribers at month end (monthly)' : 'atm.media users per month (monthly)';
}

/* ---------- key measures: each card belongs to a channel; "All" shows one or two per channel ---------- */
function measureCards(f, tiles, chan) {
  const period = f.all ? `since ${mdy(f.from)}` : `last ${f.n} days`, prevLabel = `prior ${f.n}d`;
  const syn = tileBy(tiles, /syndication multiplier/i), clicks = f.clicks;
  let ctrNow = null, ctrWas = null;
  if (clicks) { const m = clicks.detail.match(/rate\s*([\d.]+)%.*?was\s*([\d.]+)%/i); if (m) { ctrNow = +m[1]; ctrWas = +m[2]; } }
  const cards = [
    { ch: 'li', all: false, k: 'LinkedIn organic impressions', v: full(f.imp), p: period, now: f.imp, prev: f.all ? null : f.impPrev, prevLabel, fmtB: full, n: 'Reach follows the post: guest and honoree posts travel, house posts do not.' },
    { ch: 'li', all: true, k: 'LinkedIn comments per post', v: f.cpp != null ? f.cpp.toFixed(1) : '—', p: period, now: f.cpp, prev: f.all ? null : f.cppPrev, prevLabel, fmtB: x => x.toFixed(1), n: f.young ? 'Recent posts are still collecting comments, so a short window reads low against the one before.' : 'Comments follow people: guest and honoree posts draw the most.' },
    { ch: 'li', all: false, k: 'LinkedIn followers gained', v: `${sign(f.liGain)}${full(f.liGain)}`, p: `${period}, organic`, now: f.liGain, prev: f.all ? null : f.liGainPrev, prevLabel, fmtB: full, n: 'Organic gains only; LinkedIn\'s own total is in the Overview.' },
    { ch: 'li', all: true, k: 'Partner-repost lift', v: syn ? syn.value_as_published : '—', p: `${f.monthly}, monthly`, now: null, prev: null, n: syn ? `${syn.detail}; the best posts reached 7–8× with a partner's own repost.` : 'Arrives with the monthly figures.' },
    { ch: 'ig', all: true, k: 'Instagram reach, 28 days', v: fmt(f.igReach), p: `as of ${f.igReachDate ? mdy(f.igReachDate) : '—'}`, now: f.igReach, prev: f.igReachThen, prevLabel: f.igReachThenDate ? mdy(f.igReachThenDate) : '', fmtB: fmt, n: 'Collabs still win; the reach loss is in the other posts.' },
    { ch: 'ig', all: false, k: 'Instagram views, 28 days', v: fmt(f.igViews), p: `as of ${f.igReachDate ? mdy(f.igReachDate) : '—'}`, now: f.igViews, prev: f.igViewsThen, prevLabel: f.igReachThenDate ? mdy(f.igReachThenDate) : '', fmtB: fmt, n: 'Meta\'s rolling 28-day count of Reels, posts and Stories.' },
    { ch: 'ig', all: false, k: 'Instagram likes on new posts', v: full(f.igreactions), p: `${f.igPosts} posts, ${period}`, now: f.igreactions, prev: f.all ? null : f.igreactionsPrev, prevLabel, fmtB: full, n: f.young ? 'Recent posts are still collecting likes, so a short window reads low.' : 'Lifetime likes on posts published in the window.' },
    { ch: 'ig', all: false, k: 'Instagram followers', v: full(f.igFoll), p: f.igFollChange != null ? `${sign(f.igFollChange)}${full(f.igFollChange)} ${period}` : 'latest daily read', now: null, prev: null, n: 'Lifetime total from the daily reads.' },
    { ch: 'yt', all: true, k: 'YouTube subscribers gained', v: f.ytGain != null ? `${sign(f.ytGain)}${full(f.ytGain)}` : '—', p: f.ytGain != null ? `since ${mdy(f.ytFrom)} · ${full(f.ytTotal)} total` : `${full(f.ytTotal)} total; no reading at the start of this window`, now: f.ytGain, prev: f.all ? null : f.ytGainPrev, prevLabel, fmtB: full, n: 'All organic since the ad flight ended in August.' },
    { ch: 'nl', all: true, k: 'Newsletter verified-click rate', v: ctrNow != null ? ctrNow.toFixed(2) + '%' : '—', p: `${f.monthly}, monthly, share of delivered email`, now: ctrNow, prev: ctrWas, prevLabel: 'month before', fmtB: x => x.toFixed(2) + '%', n: 'Bot-filtered clicks; list size alone is inflated by imports.' },
    { ch: 'site', all: true, k: 'Homepage sign-up rate', v: 'Not yet', p: 'starts with October data', now: null, prev: null, n: 'The subscribe prompt moved up the homepage on Oct 1. Judge it on sign-ups per homepage session, not total subscribers.' }
  ];
  return chan && chan !== 'all' ? cards.filter(c => c.ch === chan) : cards.filter(c => c.all);
}
/* the monthly headline numbers, filed under the channel each one measures */
const tileCh = l => /linkedin/i.test(l) ? 'li' : /instagram/i.test(l) ? 'ig' : /youtube/i.test(l) ? 'yt' : /newsletter|verified human clicks/i.test(l) ? 'nl' : /atm\.media|session|site/i.test(l) ? 'site' : null;
function headlineTiles(tiles, chan) {
  return (tiles || []).filter(t => /^A\b/.test(t.section) && (chan === 'all' || tileCh(t.label) === chan));
}
function headlineHTML(list, f) {
  if (!list.length) return '';
  return `<h4 class="hl-head">${esc(f.monthlyName)} headline numbers <span class="dim">· monthly, ${esc(f.monthly)}</span></h4><div class="hl-tiles">` +
    list.map(t => `<div class="hl"><div class="hv mono">${esc(t.value_as_published)}</div><div class="hk">${esc(t.label)}</div><div class="hd">${esc(t.detail)}</div></div>`).join('') + '</div>';
}
function measuresHTML(cards) {
  return cards.map(c => {
    const ch = c.now != null && c.prev != null && c.prev !== 0 ? pct(c.now, c.prev) : null;
    const chip = ch == null ? '' : `<span class="chip ${ch > 0.5 ? 'up' : ch < -0.5 ? 'down' : ''}">${ch > 0.5 ? '▲' : ch < -0.5 ? '▼' : '–'} ${pctTxt(ch)}</span>`;
    const mx = Math.max(c.now || 0, c.prev || 0) || 1;
    const bars = c.now != null && c.prev != null ? `<div class="bars" aria-hidden="true"><div class="bar"><span>now</span><i style="width:${Math.max(2, c.now / mx * 100)}%"></i></div><div class="bar prev"><span>${esc(c.prevLabel || 'before')}</span><i style="width:${Math.max(2, c.prev / mx * 100)}%"></i></div></div>` : '';
    return `<div class="measure"><div class="mk">${esc(c.k)}</div><div class="mv mono">${esc(c.v)}</div><div class="mp">${esc(c.p)}${c.now != null && c.prev != null ? ` · before: ${esc(c.fmtB(c.prev))}` : ''}</div>${chip}${bars}<div class="mn">${esc(c.n)}</div></div>`;
  }).join('');
}

/* ---------- overview band ---------- */
async function overview(S, tiles) {
  const igf = S.DAILY.filter(d => d.ig_runf != null).at(-1);
  const comp = S.COMP || {}, liTotal = comp.atm ? comp.atm.total : num((tileBy(tiles, /^linkedin followers$/i) || {}).value_as_published);
  const nlTile = tileBy(tiles, /newsletter active subscribers/i), nlSubs = nlTile ? num(nlTile.value_as_published) : null;
  const parts = [['LinkedIn', liTotal, '--s1'], ['Instagram', igf?.ig_runf, '--s2'], ['Newsletter', nlSubs, '--s3'], ['YouTube', S.YT.total_subs, '--s4']].filter(p => p[1] != null);
  const total = parts.reduce((s, p) => s + p[1], 0), mx = Math.max(...parts.map(p => p[1]));
  $('ov-audience').innerHTML = `<div class="mk">Total audience</div><div class="mv mono">${full(total)}</div><div class="mp">follows and subscriptions across channels, not unique people</div>
    <div class="aud">${parts.map(p => `<div class="audrow"><span>${p[0]}</span><i style="width:${Math.max(3, p[1] / mx * 100)}%;background:var(${p[2]})"></i><b class="mono">${full(p[1])}</b></div>`).join('')}</div>
    <div class="mn">LinkedIn ${comp.atm ? 'total from the latest competitor read' : 'from the monthly figures'}; Instagram and YouTube from the latest daily reads; newsletter from the monthly figures.</div>`;
  const sess = tileBy(tiles, /atm\.media sessions/i);
  const per = tiles && tiles[0] ? (tiles[0].data_vintage.match(/\(([^)]+)\)/) || ['', 'latest month'])[1].replace(/ window/, '') : '';
  $('ov-site').innerHTML = `<div class="mk">Site traffic</div><div class="mv mono">${sess ? esc(sess.value_as_published) : '—'}</div><div class="mp">sessions, ${esc(per)}</div><div class="mn">${sess ? esc(sess.detail) : 'Arrives with the monthly figures.'}</div>`;
  $('ov-newret').innerHTML = `<div class="mk">New vs returning visitors</div><div class="mv mono dim">Needs GA4</div><div class="mp">not in either data source yet</div><div class="mn">Waiting on GA4 access; see the <a href="#actions" data-goto="actions">setup tasks</a>.</div>`;
  const series = [['LinkedIn impressions', 's-li'], ['Instagram views', 's-ig'], ['Site users', 's-ga']];
  const yoy = [];
  for (const [label, id] of series) {
    const ms = datedMonths(await getMonthly(id)).filter(m => m.key && m.value != null && !m.partial);
    const last = ms.at(-1), ly = last ? ms.find(m => m.key === `${last.y - 1}-${String(last.m + 1).padStart(2, '0')}`) : null;
    yoy.push({ label, last, ly, earliest: ms[0] });
  }
  const ready = yoy.filter(x => x.ly);
  const earliest = yoy.map(x => x.earliest).filter(Boolean).sort((a, b) => a.key < b.key ? -1 : 1)[0];
  $('ov-yoy').innerHTML = `<div class="mk">Year over year</div>` + (ready.length
    ? ready.map(x => `<div class="mp">${esc(x.label)}, ${monthName(x.last.key)}: <b>${full(x.last.value)}</b> against ${full(x.ly.value)} a year earlier (${pctTxt(pct(x.last.value, x.ly.value))})</div>`).join('')
    : `<div class="mv mono dim">From ${earliest ? `${monthName(earliest.key)} ${earliest.y + 1}` : 'next year'}</div><div class="mp">the monthly record starts in ${earliest ? `${monthName(earliest.key)} ${earliest.y}` : '—'}</div>`) +
    `<div class="mn">Turns on by itself once a month has a year of history. Site figures will not compare cleanly across the October server switch, which cut bot traffic.</div>`;
}

/* ---------- boot ---------- */
Promise.all([window.ATMDailyReady, window.ATMScoreReady]).then(async ([S, score]) => {
  const tiles = score ? score.tiles : [];
  $('loaded-at').textContent = 'Loaded ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (!S) { $('glance-list').innerHTML = '<li>Daily figures could not load. Try Refresh.</li>'; return; }
  overview(S, tiles);
  const WIN = { '7': 7, '14': 14, '30': 30, all: 'all' };
  const facts = Object.fromEntries(Object.keys(WIN).map(k => [k, windowFacts(S, WIN[k], tiles)]));
  const CH = { all: 'All channels', li: 'LinkedIn', ig: 'Instagram', yt: 'YouTube', nl: 'Newsletter', site: 'Site' };
  let win = '7', chan = 'all';
  const show = () => {
    const f = facts[win], r = readout(f, chan);
    $('glance-title').textContent = `${CH[chan]} · ${f.all ? `everything since ${longDate(f.from)}` : `the last ${f.n} days, to ${longDate(f.AS_OF)}`}`;
    $('glance-headline').innerHTML = r.headline ? esc(r.headline.charAt(0).toUpperCase() + r.headline.slice(1)) : '';
    $('glance-list').innerHTML = r.bullets.map(x => `<li>${x}</li>`).join('');
    $('measures').innerHTML = measuresHTML(measureCards(f, tiles, chan));
    $('headline-tiles').innerHTML = headlineHTML(headlineTiles(tiles, chan), f);
    drawChart(f, chan, S);
  };
  const bind = (key, set) => { const box = document.querySelector(`.seg[data-for="${key}"]`); if (!box) return; box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { box.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); set(b.dataset.v); show(); })); };
  bind('glance', v => { win = v; }); bind('channel', v => { chan = v; });
  show();
  $('measures-note').textContent = 'Measures follow the channel and time frame above. Repost lift, newsletter clicks and the headline numbers come from the monthly figures and show the latest month.';

  // peer watch in the Actions view
  const peer = S.COMP && S.COMP.peer, atm = S.COMP && S.COMP.atm;
  if (peer && $('peer-watch')) $('peer-watch').innerHTML = `<b>Peer watch, latest competitor read:</b> "${esc(peer.company)}" gained <b>${full(peer.newf)}</b> followers on <b>${full(peer.posts)}</b> post${peer.posts === 1 ? '' : 's'} in the last 30 days${atm ? `, while ATM gained ${full(atm.newf)} on ${full(atm.posts)} posts` : ''}. Follower gains without much posting are the signal to check for mis-tags.`;

  /* ---------- ask box: opens Claude with the question and the dashboard's current figures ---------- */
  const A = window.ATMAnalysis || [];
  const context = () => {
    const lines = ['Figures from the ATM audience dashboard (https://atm.mattbecher.com).', `Daily figures run through ${facts['7'].AS_OF}; monthly figures cover ${facts['7'].monthly}.`, ''];
    for (const k of ['7', '30', 'all']) {
      const f = facts[k];
      lines.push(f.all ? `ALL TIME (since ${f.from}):` : `LAST ${f.n} DAYS:`);
      for (const c of ['li', 'ig', 'yt'].concat(k === '7' ? [] : ['nl', 'site'])) readout(f, c).bullets.forEach(x => lines.push('- ' + plain(x)));
    }
    lines.push('', 'KEY MEASURES (last 30 days where daily):');
    measureCards(facts['30'], tiles, 'all').forEach(c => lines.push(`- ${c.k}: ${c.v} (${c.p})${c.now != null && c.prev != null ? `, before ${c.fmtB(c.prev)}` : ''}`));
    // posts newer than the full data file, read live from the sheet
    const end = typeof ARCHIVE_END !== 'undefined' ? ARCHIVE_END : '';
    const recent = (S.POSTS || []).filter(p => p.date > end).sort((a, b) => b.date.localeCompare(a.date));
    if (recent.length) {
      const v = x => x == null ? '' : x;
      lines.push('', `POSTS SINCE ${end} (date | channel | format | person | title | reach | reactions | comments | reposts):`);
      recent.slice(0, 40).forEach(p => lines.push(`- ${p.date} | ${p.ch} | ${v(p.fmt)} | ${v(p.person)} | ${(p.title || '').slice(0, 70)} | ${v(p.reach)} | ${v(p.reactions)} | ${v(p.comments)} | ${v(p.amp)}`));
    }
    const comp = (S.COMP && S.COMP.rows) || [];
    if (comp.length) {
      lines.push('', `LINKEDIN PEER SET, LAST 30 DAYS (rank | page | followers | new followers | posts | comments)${S.COMP.note ? '. ' + S.COMP.note.replace(/[.\s]+$/, '') : ''}:`);
      comp.forEach(r => lines.push(`- ${r.rank} | ${r.company} | ${v0(r.total)} | ${v0(r.newf)} | ${v0(r.posts)} | ${v0(r.comments)}`));
    }
    const fnd = A.filter(r => r.kind === 'finding'), notes = A.filter(r => r.kind === 'note');
    if (fnd.length) { lines.push('', 'CURRENT ANALYSIS:'); fnd.forEach(r => lines.push(`- ${r.title} ${r.text}`)); }
    if (notes.length) { lines.push('', 'HOW TO READ THE NUMBERS:'); notes.forEach(r => lines.push(`- ${r.title} ${r.text}`)); }
    return lines.join('\n');
  };
  const v0 = x => x == null ? '' : x;
  // private Google Docs in the team's Drive folder; Claude opens them with the asker's own Google Drive connector
  const DATA_DOCS = [
    'https://docs.google.com/document/d/1Qwn770yCzLZI-2uOwyLXqn8dOEgVU-hLjtD8xVLVs2E/edit',
    'https://docs.google.com/document/d/1Y17XTL4KqGCJzl8JQ-RZSl6RbRDKKqiJzbqHHi0Bxsc/edit',
  ];
  $('ask-form').addEventListener('submit', e => {
    e.preventDefault();
    const q = $('ask-q').value.trim(); if (!q) { $('ask-q').focus(); return; }
    let ctx = context();
    // the analysis and notes are also in the data file, so they go first when space runs short
    if (ctx.length > 7000) ctx = ctx.split('\nHOW TO READ THE NUMBERS:')[0];
    if (ctx.length > 7000) ctx = ctx.split('\nCURRENT ANALYSIS:')[0];
    if (ctx.length > 7000) ctx = ctx.slice(0, 7000) + '\n[trimmed]';
    const prompt = `I'm on the ATM team. Answer my question about ATM's audience.\n\nQuestion: ${q}\n\nFirst read the dashboard's two data Docs with Google Drive:\n- ${DATA_DOCS[0]} (monthly scorecard, every chart's data, the peer set, the current analysis and actions)\n- ${DATA_DOCS[1]} (post history from May, with speakers, companies and series)\nThe live daily figures and newest posts are below; use them for anything recent. If you can't open the Docs (Google Drive not connected, or no access to the folder), say so in one line, then answer from the figures below. Say plainly when the data can't answer the question, and what data would.\n\n${ctx}`;
    const url = 'https://claude.ai/new?q=' + encodeURIComponent(prompt);
    const w = window.open(url, '_blank', 'noopener');
    const note = $('ask-note'); note.hidden = false;
    note.innerHTML = w ? 'Opened in a new Claude chat with the latest figures and links to the full data. The answer appears there. Claude needs Google Drive connected to read the full data.' : `Your browser blocked the new tab. <a href="${url}" target="_blank" rel="noopener">Open the question in Claude</a>.`;
  });
});
})();
