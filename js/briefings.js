/* Briefings view: two short reads for two audiences.
   - Editorial decisions (Hannah): patterns and experiments from data/briefings.csv, rewritten weekly,
     with the supporting posts drawn live from the post data.
   - Client and partner proof (Rob and Christine): proof points worked out live from the posts,
     filterable by partner, series or industry (data/companies.csv maps companies to partners and industries). */
(function () {
const D = window.ATMDaily;
const { fmt, full, esc, mdy, median, round, addDays } = D;
const $ = id => document.getElementById(id);

function parseCSV(t) {
  const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); rows.push(r); r = []; c = ''; } else if (ch !== '\r') c += ch; }
  if (c || r.length) { r.push(c); rows.push(r); }
  const [h, ...rest] = rows.filter(x => x.length > 1 || x[0] !== '');
  return h ? rest.map(x => Object.fromEntries(h.map((k, i) => [k, x[i] ?? '']))) : [];
}
const getCSV = path => fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.text() : '').then(t => t ? parseCSV(t) : []).catch(() => []);
const getJSON = path => fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const localISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const daysSince = iso => iso ? Math.round((Date.parse(localISO()) - Date.parse(iso.slice(0, 10))) / 864e5) : null;
const cut = (t, n) => { t = String(t || '').trim(); if (t.length <= n) return t; const c = t.slice(0, n); return c.slice(0, Math.max(c.lastIndexOf(' '), n - 15)).replace(/[\s,;:.]+$/, '') + '…'; };
const article = x => /^(8|11|18)(\D|$)/.test(String(x)) ? 'an' : 'a';
const dateTxt = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

/* ---------- sub-tabs ---------- */
function setTab(t, push) {
  document.querySelectorAll('#brief-tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.b === t ? 'true' : 'false'));
  document.querySelectorAll('.brief-panel').forEach(p => p.hidden = p.id !== 'brief-' + t);
  if (push) history.replaceState(null, '', '#briefings/' + t);
}
document.querySelectorAll('#brief-tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.b, true)));
const fromHash = () => { const m = location.hash.match(/^#briefings\/(\w+)/); return m && ['editorial', 'proof'].includes(m[1]) ? m[1] : 'editorial'; };
setTab(fromHash(), false);
window.addEventListener('hashchange', () => { if (location.hash.startsWith('#briefings')) setTab(fromHash(), false); });

/* ---------- series and partner tagging ---------- */
// ATM's defined series (Hannah, Oct 27). Moment Maker, client series and the Awards are programs, not series.
const SERIES = [
  [/on the record/i, 'On The Record'], [/insider? scoop|industry scoop/i, 'Insider Scoop'], [/trend watch/i, 'Trend Watch'],
  [/masterclass|off duty|secret talent/i, 'Masterclass Off Duty'], [/brand digest/i, 'Brand Digest'], [/media diet/i, 'Media Diet'],
  [/heart ?beat/i, 'The Heart Beat'], [/newsroom/i, 'Newsroom'], [/movers|industry moves|new roles|moves keep coming/i, 'Industry Movers & Shakers']
];
function seriesOf(p) {
  const tagged = p.series && SERIES.find(([re]) => re.test(p.series));
  if (tagged) return tagged[1];
  const t = `${p.title || ''} ${p.text || ''}`;
  const hit = SERIES.find(([re]) => re.test(t));
  return hit ? hit[1] : '';
}
function tagger(companies) {
  const byName = new Map(), byNorm = new Map();
  for (const c of companies) { byName.set(c.name, c); byNorm.set(norm(c.name), c); if (!byNorm.has(norm(c.partner))) byNorm.set(norm(c.partner), c); }
  return p => {
    const out = { partners: [], industry: '' };
    for (const raw of [p.company, p.client]) {
      if (!raw) continue;
      const c = byName.get(raw) || byNorm.get(norm(raw));
      const partner = c ? c.partner : raw;
      if (c && c.industry === 'ATM') continue;
      if (!out.partners.includes(partner)) out.partners.push(partner);
      if (!out.industry && c) out.industry = c.industry;
    }
    return out;
  };
}

/* ---------- editorial decisions ---------- */
function postRow(p, med) {
  const rel = p.reach && med[p.ch] ? p.reach / med[p.ch] : null;
  const who = p.person ? `${esc(p.person)}${p.company ? `, ${esc(p.company)}` : ''}` : esc(cut(p.title, 70));
  const link = p.url ? ` <a href="${esc(p.url)}" target="_blank" rel="noopener">open</a>` : '';
  return `<tr><td class="nw">${dateTxt(p.date)}</td><td>${p.ch === 'LinkedIn' ? 'LI' : 'IG'}</td><td>${who}${link}</td><td class="num">${full(p.reach)}</td><td class="num">${rel != null ? `<span class="chg ${rel >= 1 ? 'up' : 'down'}">${rel.toFixed(1)}×</span>` : '—'}</td><td class="num">${p.er != null ? p.er.toFixed(1) + '%' : '—'}</td><td class="num">${full(p.comments)}</td></tr>`;
}
function editorial(B, S) {
  const meta = B.find(r => r.kind === 'meta') || {};
  const posts = new Map(S.POSTS.filter(p => p.id).map(p => [p.id, p]));
  const sep = S.POSTS.filter(p => p.date >= '2026-09-01' && p.date <= '2026-09-30');
  const recent = S.POSTS.filter(p => p.date >= addDays(S.DAILY.at(-1).date, -30));
  const med = { LinkedIn: median(recent.filter(p => p.ch === 'LinkedIn').map(p => p.reach)), Instagram: median(recent.filter(p => p.ch === 'Instagram').map(p => p.reach)) };
  const pats = B.filter(r => r.kind === 'pattern'), exps = B.filter(r => r.kind === 'experiment');
  $('brief-editorial-meta').innerHTML = `<b>${esc(meta.title || 'This week')}.</b> ${esc(meta.text || '')}`;
  $('brief-patterns').innerHTML = pats.map((r, i) => {
    const sup = (r.posts || '').split(/\s+/).map(id => posts.get(id)).filter(Boolean);
    return `<article class="card brief-card"><div class="brief-num">${i + 1}</div><div>
      <h3>${esc(r.title)}</h3><div class="chips">${(r.tags || '').split(';').filter(Boolean).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
      <p>${esc(r.text)}</p>
      ${sup.length ? `<details class="fnote" open><summary>Supporting posts</summary><div class="tbl-wrap"><table class="mini"><thead><tr><th>Date</th><th></th><th>Post</th><th class="num">Impr / reach</th><th class="num">vs median</th><th class="num">Eng.</th><th class="num">Comments</th></tr></thead><tbody>${sup.map(p => postRow(p, med)).join('')}</tbody></table></div></details>` : ''}
    </div></article>`;
  }).join('') || '<p class="dim">No patterns written for this week yet.</p>';
  $('brief-experiments').innerHTML = exps.map((r, i) => `<article class="card brief-card exp"><div class="brief-num">${String.fromCharCode(65 + i)}</div><div>
      <h3>${esc(r.title)}</h3><div class="chips">${(r.tags || '').split(';').filter(Boolean).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
      <p>${esc(r.text)}</p><p class="brief-measure">${esc(r.next_step)}</p>${r.owner ? `<p class="owner">Owner: <b>${esc(r.owner)}</b></p>` : ''}</div></article>`).join('');
  $('brief-editorial-note').textContent = `"vs median" compares each post with the median ${'LinkedIn'} or Instagram post of the last 30 days (${fmt(med.LinkedIn)} LinkedIn impressions, ${fmt(med.Instagram)} Instagram reach). September's medians were ${fmt(median(sep.filter(p => p.ch === 'LinkedIn').map(p => p.reach)))} and ${fmt(median(sep.filter(p => p.ch === 'Instagram').map(p => p.reach)))}.`;
}

/* ---------- client and partner proof ---------- */
function proof(S, companies, syn, senior, func, execs) {
  const tag = tagger(companies);
  const ALL = S.POSTS.map(p => Object.assign({}, p, tag(p), { seriesName: seriesOf(p) }));
  const first = ALL.reduce((m, p) => p.date < m ? p.date : m, '9999'), last = ALL.reduce((m, p) => p.date > m ? p.date : m, '');
  const count = key => { const m = new Map(); for (const p of ALL) for (const v of [].concat(p[key] || [])) if (v) m.set(v, (m.get(v) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); };
  const fill = (id, list, label) => { $(id).innerHTML = `<option value="">All ${label}</option>` + list.map(([v, n]) => `<option value="${esc(v)}">${esc(v)} (${n})</option>`).join(''); };
  fill('pf-partner', count('partners'), 'partners'); fill('pf-series', count('seriesName'), 'series'); fill('pf-industry', count('industry'), 'industries');
  const chMed = ch => median(ALL.filter(p => p.ch === ch).map(p => p.reach)), erMed = ch => median(ALL.filter(p => p.ch === ch).map(p => p.er));
  const MED = { LinkedIn: chMed('LinkedIn'), Instagram: chMed('Instagram') }, ERM = { LinkedIn: erMed('LinkedIn'), Instagram: erMed('Instagram') };

  // audience composition from the September LinkedIn page read
  const pctOf = (rows, re) => rows.filter(r => re.test(r.label)).reduce((s, r) => s + (parseFloat(r.value) || 0), 0);
  const dirPlus = round(pctOf(senior, /^(CXO|VP|Director|Owner|Partner)$/), 1);
  const adv = func.find(r => /advertising services/i.test(r.label));
  const topFn = func.filter(r => !/industry/i.test(r.label)).sort((a, b) => b.value - a.value).slice(0, 2).map(r => r.label.toLowerCase());

  // repost lift, September syndication read (organic engagement vs engagement on partners' reposts)
  const synRows = {};
  for (const r of syn) { const c = r.category; (synRows[c] ??= { name: c })[/organic/i.test(r.series) ? 'org' : 'syn'] = parseFloat(r.value) || 0; }
  const SYN = Object.values(synRows).filter(r => r.org).map(r => {
    const [s, partner] = r.name.split(' · ');
    const series = /^FoG/.test(s) ? 'The Future of Growth' : /moment maker/i.test(s) ? 'Moment Maker' : '';
    const pn = partner || (series ? '' : s);
    const c = companies.find(x => norm(x.name) === norm(pn) || norm(x.partner) === norm(pn)) || null;
    const nice = /^FoG Ep(\d)/.test(s) ? `The Future of Growth, episode ${s.match(/Ep(\d)/)[1]}` : /^FoG trailer/.test(s) ? 'The Future of Growth trailer' : /moment maker/i.test(s) ? 'Moment Maker' : `the ${c ? c.partner : s} post`;
    return { label: nice, series, partner: c ? c.partner : pn === 'EA' ? 'Electronic Arts' : pn, industry: c ? c.industry : '', lift: (r.org + r.syn) / r.org, org: r.org, syn: r.syn };
  }).sort((a, b) => b.lift - a.lift);

  const card = (id, kicker, big, body, src, copy) => {
    $(id).innerHTML = `<div class="mk">${kicker}</div><div class="mv mono">${big}</div><p>${body}</p><p class="src">Source: ${src}</p><button type="button" class="copy-btn">Copy proof point</button>`;
    $(id).querySelector('.copy-btn').onclick = e => { navigator.clipboard?.writeText(copy).then(() => { e.target.textContent = 'Copied'; setTimeout(() => e.target.textContent = 'Copy proof point', 1500); }); };
  };

  /* ---------- profiles shown when a partner, series or industry is selected ---------- */
  const eng = p => (p.reactions || 0) + (p.comments || 0) + (p.amp || 0);
  const titleOf = (() => {
    const m = new Map(); for (const e of execs) { m.set(norm(e.name), e.title); for (const a of String(e.also_known_as || '').split(/;|\|/)) if (a.trim()) m.set(norm(a), e.title); }
    return p => { if (!p.person) return ''; const t = m.get(norm(p.person)); if (t) return t; if (p.role) return p.role;
      const w = D.personFromLinkedIn(p.title || ''); return w && norm(w.person) === norm(p.person) ? w.role : ''; };
  })();
  const SENIOR = t => /\b(chief|ceo|cmo|cro|coo|cfo|cto|cco|president|founder|chair|partner|owner)\b/i.test(t) ? 'top' : /\b(vp|svp|evp|vice president|head of|general manager|gm|managing director|director)\b/i.test(t) ? 'senior' : t ? 'other' : '';
  const monthKey = d => d.slice(0, 7), monthLbl = k => new Date(k + '-15T12:00:00').toLocaleDateString('en-US', { month: 'short' });
  const monthsBetween = (from = first) => { const out = []; let k = monthKey(from); while (k <= monthKey(last)) { out.push(k); const [y, m] = k.split('-').map(Number); k = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; } return out; };
  const bars = (P, metric, from) => {
    const ks = monthsBetween(from), v = ks.map(k => P.filter(p => monthKey(p.date) === k).reduce((s, p) => s + metric(p), 0)), mx = Math.max(1, ...v);
    return `<div class="mbars" role="img" aria-label="${esc(ks.map((k, i) => `${monthLbl(k)} ${v[i]}`).join(', '))}">${ks.map((k, i) => `<div class="mb"><span class="mbv">${v[i] || ''}</span><i style="height:${Math.max(v[i] ? 6 : 1, Math.round(v[i] / mx * 52))}px"></i><span class="mbl">${monthLbl(k)}</span></div>`).join('')}</div>`;
  };
  const ratioTxt = r => r == null ? '—' : `${r.toFixed(1)}×`;
  const medBy = (P, ch) => median(P.filter(p => p.ch === ch).map(p => p.reach));
  const whoTxt = p => p.person ? `${p.person}${p.company ? ` (${p.company})` : ''}` : `"${cut((p.title || '').split(/(?<=[.!?])\s/)[0], 60)}"`;
  const bestOf = P => { const r = P.filter(p => p.reach != null).sort((a, b) => b.reach / MED[b.ch] - a.reach / MED[a.ch]); return r.find(p => p.er != null && ERM[p.ch] != null && p.er >= ERM[p.ch]) || r[0]; };
  const bestTxt = p => p ? `${whoTxt(p)} on ${p.ch}, ${dateTxt(p.date)}: ${full(p.reach)} ${p.ch === 'LinkedIn' ? 'impressions' : 'accounts reached'}, ${(p.reach / MED[p.ch]).toFixed(1)} times the median ATM ${p.ch} post` : '';
  const beatCount = P => { const xs = P.filter(p => p.reach != null && MED[p.ch]); return { n: xs.filter(p => p.reach > MED[p.ch]).length, of: xs.length }; };
  const chLine = (P, base) => ['LinkedIn', 'Instagram'].map(ch => { const m = medBy(P, ch), b = base ? medBy(base, ch) : MED[ch]; return m != null && b ? `${ch}: median ${full(m)} against ${full(b)} (${ratioTxt(m / b)})` : null; }).filter(Boolean);
  const synFor = f => SYN.filter(r => (!f.partners || r.partner === f.partners) && (!f.seriesName || r.series === f.seriesName) && (!f.industry || r.industry === f.industry));

  function partnerProfile(f, P, name) {
    // 1. who appeared, with titles where on record
    const people = new Map();
    for (const p of [...P].sort((a, b) => a.date < b.date ? -1 : 1)) if (p.person && !people.has(norm(p.person))) people.set(norm(p.person), { name: p.person, title: titleOf(p), first: p.date, eng: 0, posts: 0 });
    for (const p of P) { const x = p.person && people.get(norm(p.person)); if (x) { x.eng += eng(p); x.posts++; } }
    const ppl = [...people.values()].sort((a, b) => b.eng - a.eng);
    const top = ppl.filter(x => SENIOR(x.title) === 'top');
    const list = ppl.slice(0, 6).map(x => `<li><b>${esc(x.name)}</b>${x.title ? `, ${esc(x.title)}` : ''} <span class="dim">· first featured ${dateTxt(x.first)}</span></li>`).join('');
    const titled = ppl.filter(x => x.title).length;
    const s1 = ppl.length ? `${ppl.length} ${ppl.length === 1 ? 'person' : 'people'} from ${name} ${ppl.length === 1 ? 'has' : 'have'} appeared on ATM since ${dateTxt(ppl.reduce((m, x) => x.first < m ? x.first : m, '9999'))}${top.length ? `, including ${top.slice(0, 2).map(x => `${x.name} (${x.title})`).join(' and ')}` : ''}.${titled < ppl.length ? ` ${titled ? `${titled} ha${titled === 1 ? 's' : 've'} a title on record.` : 'None has a title on record yet.'}` : ''}` : `No named guest from ${name} is on record in these posts yet.`;
    card('pp-audience', 'Who appeared', String(ppl.length), `${esc(s1)}${list ? `<ul class="plist">${list}</ul>` : ''}`,
      'post tags and post text; titles from the ATM Kitchen board and post copy', s1);
    // 2. consistency
    const b = beatCount(P), best = bestOf(P), lines = chLine(P);
    const s2 = `${b.n} of ${b.of} ${name} posts beat the median ATM post on their channel. ${lines.join('; ')}.${best ? ` Strongest: ${bestTxt(best)}.` : ''}`;
    card('pp-content', 'Consistency, not one hit', `${b.n} of ${b.of}`, esc(s2) + (best && best.url ? ` <a href="${esc(best.url)}" target="_blank" rel="noopener">Open the post</a>` : ''),
      `LinkedIn and Instagram analytics; medians of all ATM posts ${dateTxt(first)}–${dateTxt(last)}`, s2);
    // 3. relationship over time, best format and channel, repost lift where on record
    const months = new Set(P.map(p => monthKey(p.date))).size;
    const fm = {}; for (const p of P) { const k = `${p.ch === 'LinkedIn' ? 'LinkedIn' : 'Instagram'} ${String(p.fmt || 'post').toLowerCase()}s`; (fm[k] ??= []).push(p.reach / MED[p.ch]); }
    const bestFmt = Object.entries(fm).filter(([, v]) => v.length >= 2).map(([k, v]) => [k, median(v)]).sort((a, b) => b[1] - a[1])[0];
    const syn = synFor(f)[0];
    const s3 = `${P.length} post${P.length === 1 ? '' : 's'} across ${months} month${months === 1 ? '' : 's'}, most recently ${dateTxt(P.reduce((m, p) => p.date > m ? p.date : m, ''))}.${bestFmt ? ` ${bestFmt[0][0].toUpperCase() + bestFmt[0].slice(1)} did best, at ${bestFmt[1].toFixed(1)} times the channel median.` : ''}${syn ? ` When ${name} reposted ${syn.label} with its own words, the post drew ${syn.lift.toFixed(1)} times its organic engagement.` : ''}`;
    card('pp-amp', 'Relationship over time', String(P.length), `${bars(P, () => 1)}<p>${esc(s3)}</p>`,
      `posts by month, LinkedIn and Instagram${syn ? '; repost lift from September repost tracking' : ''}`, s3);
  }

  function seriesProfile(f, P, name) {
    // 1. the run: episodes and whether reach is rising
    const sorted = [...P].sort((a, b) => a.date < b.date ? -1 : 1), half = Math.floor(sorted.length / 2);
    const rel = p => p.reach != null && MED[p.ch] ? p.reach / MED[p.ch] : null;
    const early = median(sorted.slice(0, half).map(rel)), late = median(sorted.slice(half).map(rel));
    const trend = early && late ? (late > early * 1.15 ? 'rising' : late < early * 0.85 ? 'falling' : 'steady') : null;
    const s1 = `${P.length} post${P.length === 1 ? '' : 's'} in ${name} from ${dateTxt(sorted[0].date)} to ${dateTxt(sorted.at(-1).date)}.${trend ? ` Reach is ${trend}: the later half ran at ${late.toFixed(1)} times the channel median, against ${early.toFixed(1)} times for the earlier half.` : ''}`;
    card('pp-audience', 'The run so far', String(P.length), `${bars(P, () => 1, sorted[0].date)}<p>${esc(s1)}</p>`, 'posts by month; reach against each channel\'s median', s1);
    // 2. series against everything else
    const rest = ALL.filter(p => !P.includes(p)), lines = chLine(P, rest);
    const erS = median(P.map(p => p.er)), erR = median(rest.map(p => p.er));
    const mainRatio = (() => { const m = medBy(P, 'LinkedIn'), r = medBy(rest, 'LinkedIn'); return m && r ? m / r : null; })();
    const s2 = `${name} posts against all other ATM posts. ${lines.join('; ')}.${erS != null && erR != null ? ` Median engagement rate ${erS.toFixed(1)}% against ${erR.toFixed(1)}%.` : ''}`;
    card('pp-content', `${name} against the rest`, mainRatio ? ratioTxt(mainRatio) : '—', esc(s2), 'LinkedIn and Instagram analytics, medians per post', s2);
    // 3. who it featured, best episode, repost lift
    const pe = {}; for (const p of P) for (const x of p.partners) pe[x] = (pe[x] || 0) + eng(p);
    const topP = Object.entries(pe).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const best = bestOf(P), syn = synFor(f);
    const s3 = `${topP.length ? `Partners featured, by engagement: ${topP.map(([k, v]) => `${k} (${full(v)})`).join(', ')}. ` : ''}${best ? `Best post: ${bestTxt(best)}.` : ''}${syn.length ? ` Reposts with the partner's own words took ${syn.map(r => `${r.label} to ${r.lift.toFixed(1)}×`).join(' and ')} its organic engagement.` : ''}`;
    card('pp-amp', 'Who it featured', syn.length ? `${syn[0].lift.toFixed(1)}×` : String(topP.length), esc(s3), `post tags and analytics${syn.length ? '; repost lift from September repost tracking' : ''}`, s3);
  }

  function industryProfile(f, P, name) {
    // 1. share of voice and how it performs
    const share = P.length / ALL.length * 100, b = beatCount(P);
    const rest = ALL.filter(p => !P.includes(p)), lines = chLine(P, rest);
    const s1 = `${name} accounts for ${share.toFixed(0)}% of ATM's posts (${P.length} of ${ALL.length}). Against the rest: ${lines.join('; ')}. ${b.n} of ${b.of} beat their channel's median.`;
    card('pp-audience', 'Share of voice', `${share.toFixed(0)}%`, `${bars(P, () => 1)}<p>${esc(s1)}</p>`, 'post tags and data/companies.csv; LinkedIn and Instagram analytics', s1);
    // 2. top partners
    const pe = {}; for (const p of P) for (const x of p.partners) { (pe[x] ??= { eng: 0, n: 0 }); pe[x].eng += eng(p); pe[x].n++; }
    const topP = Object.entries(pe).sort((a, b) => b[1].eng - a[1].eng).slice(0, 6);
    const s2 = `Top ${name} partners by engagement: ${topP.map(([k, v]) => `${k} (${v.n} post${v.n === 1 ? '' : 's'}, ${full(v.eng)})`).join('; ')}.`;
    card('pp-content', 'Top partners', String(Object.keys(pe).length), `<ul class="plist">${topP.map(([k, v]) => `<li><b>${esc(k)}</b> <span class="dim">· ${v.n} post${v.n === 1 ? '' : 's'}, ${full(v.eng)} reactions, comments and shares</span></li>`).join('')}</ul>`, 'post tags; engagement = reactions + comments + reposts or shares', s2);
    // 3. guest seniority
    const people = new Map(); for (const p of P) if (p.person && !people.has(norm(p.person))) people.set(norm(p.person), titleOf(p));
    const ts = [...people.values()], top = ts.filter(t => SENIOR(t) === 'top').length, sen = ts.filter(t => SENIOR(t) === 'senior').length, known = ts.filter(Boolean).length;
    const s3 = `${people.size} guests from ${name} companies have appeared. Of the ${known} with a title on record, ${top} are C-suite, president or founder and ${sen} are VP, head or director level.`;
    card('pp-amp', 'Guest seniority', `${top + sen} of ${known}`, esc(s3), 'titles from the ATM Kitchen board and post copy', s3);
  }

  const draw = () => {
    const f = { partners: $('pf-partner').value, seriesName: $('pf-series').value, industry: $('pf-industry').value };
    const P = ALL.filter(p => (!f.partners || p.partners.includes(f.partners)) && (!f.seriesName || p.seriesName === f.seriesName) && (!f.industry || p.industry === f.industry));
    const label = [f.partners, f.seriesName, f.industry].filter(Boolean).join(' · ');
    const li = P.filter(p => p.ch === 'LinkedIn'), ig = P.filter(p => p.ch === 'Instagram');
    const liImpr = li.reduce((s, p) => s + (p.reach || 0), 0), igReach = ig.reduce((s, p) => s + (p.reach || 0), 0);
    const verb = f.partners ? 'featuring' : 'in';
    $('pf-scope').innerHTML = P.length ? `<b>${P.length}</b> post${P.length === 1 ? '' : 's'}${label ? ` ${verb} <b>${esc(label)}</b>` : ''} from ${dateTxt(first)} to ${dateTxt(last)}: ${li.length} on LinkedIn, ${ig.length} on Instagram.` : `No posts match ${esc(label)}. Try a broader filter.`;
    if (!P.length) { ['pp-audience', 'pp-content', 'pp-amp'].forEach(id => $(id).innerHTML = ''); return; }
    const audLine = `${dirPlus}% of ATM's LinkedIn followers are director level or above${adv ? `, and ${adv.value}% work in advertising services` : ''} (LinkedIn page admin, September).`;
    if (label) {
      $('pf-scope').innerHTML += ` <span class="dim">Audience: ${esc(audLine)}</span>`;
      if (f.partners) partnerProfile(f, P, f.partners); else if (f.seriesName) seriesProfile(f, P, f.seriesName); else industryProfile(f, P, f.industry);
      return;
    }

    // 1. audience relevance
    const reachTxt = `${label ? `Posts featuring ${label}` : 'These posts'} drew ${full(liImpr)} LinkedIn impressions${ig.length ? ` and reached ${full(igReach)} Instagram accounts` : ''}.`;
    const aud = `${dirPlus}% of ATM's LinkedIn followers are director level or above${adv ? `, and ${adv.value}% work in advertising services` : ''}; ${topFn.join(' and ')} are the largest job functions.`;
    card('pp-audience', 'Audience relevance', `${dirPlus}%`, `${esc(aud)} ${esc(reachTxt)}`,
      'LinkedIn page admin, follower composition (September); post figures from LinkedIn and Instagram analytics',
      `${aud} ${reachTxt} (Source: LinkedIn page admin, September; LinkedIn and Instagram analytics, ${dateTxt(first)}–${dateTxt(last)}.)`);

    // 2. strongest piece of content: highest reach against its channel's median
    // a post that reached far but drew little engagement (often boosted) is weak proof, so prefer posts at or above the median engagement rate
    const ranked = P.filter(p => p.reach != null).sort((a, b) => b.reach / MED[b.ch] - a.reach / MED[a.ch]);
    const best = ranked.find(p => p.er != null && ERM[p.ch] != null && p.er >= ERM[p.ch]) || ranked[0];
    if (best) {
      const x = best.reach / MED[best.ch], unit = best.ch === 'LinkedIn' ? 'impressions' : 'accounts reached';
      const who = best.person ? `${best.person}${best.company ? ` (${best.company})` : ''}` : `"${cut((best.title || '').split(/(?<=[.!?])\s/)[0], 80)}"`;
      const sent = `${who}, ${best.ch}, ${dateTxt(best.date)}: ${full(best.reach)} ${unit}, ${x.toFixed(1)} times the median ATM ${best.ch} post${best.er != null && ERM[best.ch] ? `, with ${article(best.er.toFixed(1))} ${best.er.toFixed(1)}% engagement rate against ${article(ERM[best.ch].toFixed(1))} ${ERM[best.ch].toFixed(1)}% median` : ''}${best.comments ? ` and ${full(best.comments)} comment${best.comments === 1 ? '' : 's'}` : ''}.`;
      card('pp-content', 'Strongest content example', `${x.toFixed(1)}×`, esc(sent) + (best.url ? ` <a href="${esc(best.url)}" target="_blank" rel="noopener">Open the post</a>` : ''),
        `${best.ch} analytics; median of all ${best.ch} posts ${dateTxt(first)}–${dateTxt(last)} (${full(MED[best.ch])})`, sent);
    }

    // 3. partner amplification
    const synHit = SYN.filter(r => (!f.partners || r.partner === f.partners) && (!f.seriesName || r.series === f.seriesName) && (!f.industry || r.industry === f.industry));
    const amp = P.reduce((s, p) => s + (p.amp || 0), 0), topAmp = P.filter(p => p.amp).sort((a, b) => b.amp - a.amp)[0];
    if (synHit.length) {
      const r = synHit[0];
      const sent = `When ${r.partner || 'the partner'} reposted ${r.label} with its own words, the post drew ${r.lift.toFixed(1)} times its organic engagement (${full(r.org + r.syn)} reactions, comments and reposts against ${full(r.org)} on ATM's post alone).`;
      card('pp-amp', 'Partner amplification', `${r.lift.toFixed(1)}×`, esc(sent) + (synHit.length > 1 ? ` <span class="dim">${synHit.slice(1, 3).map(s => `${esc(s.label)}: ${s.lift.toFixed(1)}×`).join('; ')}.</span>` : ''),
        'LinkedIn reposts with commentary, September (repost tracking began that month); engagement = reactions + comments + reposts', sent);
    } else {
      const sent = `${label ? `Posts featuring ${label}` : 'These posts'} were reposted or shared ${full(amp)} times${topAmp ? `; the most shared was ${topAmp.person || `"${cut((topAmp.title || '').split(/(?<=[.!?])\s/)[0], 60)}"`} (${topAmp.ch}, ${dateTxt(topAmp.date)}, ${full(topAmp.amp)})` : ''}.`;
      card('pp-amp', 'Partner amplification', full(amp), `${esc(sent)} <span class="dim">No repost with the partner's own words is on record for this selection yet. Repost tracking began in September.</span>`,
        'LinkedIn reposts and Instagram shares, per post', sent);
    }
  };
  ['pf-partner', 'pf-series', 'pf-industry'].forEach(id => $(id).addEventListener('change', draw));
  $('pf-clear').addEventListener('click', () => { ['pf-partner', 'pf-series', 'pf-industry'].forEach(id => $(id).value = ''); draw(); });
  draw();
}


/* ---------- record of past tests and standing practices (data/tests.csv) ---------- */
function tests(T) {
  const ORDER = ['Running', 'Keep doing', 'No clear effect', 'Not decided', 'Not measured', 'Stopped'];
  const CLS = { 'Running': 'run', 'Keep doing': 'keep', 'No clear effect': 'none', 'Not decided': 'open', 'Not measured': 'open', 'Stopped': 'stop' };
  const rows = T.filter(r => r.name).sort((a, b) => (ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict)) || (a.started < b.started ? 1 : -1));
  const present = ORDER.filter(v => rows.some(r => r.verdict === v));
  let cur = '';
  const seg = $('test-seg');
  const draw = () => {
    seg.innerHTML = [['', `All (${rows.length})`]].concat(present.map(v => [v, `${v} (${rows.filter(r => r.verdict === v).length})`]))
      .map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${v === cur}">${esc(l)}</button>`).join('');
    seg.querySelectorAll('button').forEach(b => b.onclick = () => { cur = b.dataset.v; draw(); });
    $('brief-tests').innerHTML = rows.filter(r => !cur || r.verdict === cur).map(r => `<article class="test-row">
      <span class="pill ${CLS[r.verdict] || 'open'}"><i></i>${esc(r.verdict)}</span>
      <div><h4>${esc(r.name)}<span class="when">since ${esc(dateTxt(r.started))}</span></h4>
      <div class="chips">${(r.area || '').split(';').filter(Boolean).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
      <p>${esc(r.evidence)}</p>
      ${r.adherence ? `<p><b>Followed:</b> ${esc(r.adherence)}</p>` : ''}
      ${r.next_step ? `<p><b>Next:</b> ${esc(r.next_step)}</p>` : ''}
      <p class="meta">Source: ${esc(r.source || '—')}</p></div></article>`).join('') || '<p class="dim">Nothing recorded yet.</p>';
  };
  draw();
}

Promise.all([window.ATMDailyReady, window.ATMScoreReady]).then(async ([S]) => {
  if (!S || !S.POSTS) return;
  const [B, companies, syn, senior, func, execs, T] = await Promise.all([getCSV('data/briefings.csv'), getCSV('data/companies.csv'),
    getCSV('data/scorecard/charts/s-syn.csv'), getCSV('data/scorecard/charts/c-senior.csv'), getCSV('data/scorecard/charts/c-func.csv'), getCSV('data/execs.csv'), getCSV('data/tests.csv')]);
  const meta = B.find(r => r.kind === 'meta');
  if (meta) $('brief-eyebrow').textContent = `Briefings · ${meta.title}`;
  try { editorial(B, S); } catch (e) { console.error('editorial briefing', e); }
  try { tests(T); } catch (e) { console.error('tests', e); }
  try { proof(S, companies, syn, senior, func, execs); } catch (e) { console.error('proof briefing', e); }
  document.documentElement.dataset.briefReady = '1';
});
})();
