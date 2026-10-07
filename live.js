/* ATM Social Dashboard — live build.
   Reads the ATM Daily Social Pulse Google Sheet every time the page opens and
   computes every number on the page from it. Posts up to ARCHIVE_END come from
   archive.js; newer posts are read from the sheet's Creative tab. */

const SHEET_ID = "1N3hk1Qvfob_Cdbvs9cgfComDfT7quLBftTXzDyCORyE";
const CAD = 2.0; // LinkedIn posting cadence, posts per day (per-post reach basis)

/* ---------- reading the sheet ---------- */
function parseCSV(t) {
  const rows = []; let r = [], c = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { r.push(c); c = ""; }
    else if (ch === "\n") { r.push(c); rows.push(r); r = []; c = ""; }
    else if (ch !== "\r") c += ch;
  }
  if (c || r.length) { r.push(c); rows.push(r); }
  return rows;
}
async function readTab(name) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(name)}&t=${Date.now()}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`could not read the "${name}" tab (${r.status})`);
  const text = await r.text();
  if (/^\s*</.test(text)) throw new Error(`the sheet returned a sign-in page for "${name}"; check its sharing settings`);
  return parseCSV(text);
}
const num = v => {
  if (v == null) return null;
  let s = String(v).trim().replace(/,/g, "");
  if (!s || s === "-" || s === "—" || s === "–") return null;
  let mult = 1;
  if (/k$/i.test(s)) { mult = 1e3; s = s.slice(0, -1); } else if (/m$/i.test(s)) { mult = 1e6; s = s.slice(0, -1); }
  s = s.replace(/%$/, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n * mult;
};
const isoDate = v => { const m = String(v || "").match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null; };

/* ---------- date helpers ---------- */
const MN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const addDays = (d, n) => { const x = new Date(d + "T00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const daysIn = k => new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7), 0)).getUTCDate();
const prevMonth = k => { let y = +k.slice(0, 4), m = +k.slice(5, 7) - 1; if (m === 0) { m = 12; y--; } return `${y}-${String(m).padStart(2, "0")}`; };
const monthName = k => MN[+k.slice(5, 7) - 1];
const monthShort = k => MS[+k.slice(5, 7) - 1];
const mdy = s => { const d = new Date(s + "T00:00"); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
const longDate = s => new Date(s + "T00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const slash = s => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;

/* ---------- formatting ---------- */
const fmt = n => n == null ? "—" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : Math.round(n).toLocaleString();
const full = n => n == null ? "—" : Math.round(n).toLocaleString();
const sign = n => (n >= 0 ? "+" : "") ;
const esc = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const median = a => { a = a.filter(x => x != null).sort((x, y) => x - y); const n = a.length; if (!n) return null; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; };
const mean = a => { a = a.filter(x => x != null); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
const round = (n, d) => n == null ? null : Math.round(n * 10 ** d) / 10 ** d;

/* ---------- build data from the sheet ---------- */
function buildDaily(rows) {
  const byDate = {};
  for (const r of rows) {
    const d = isoDate(r[0]); if (!d) continue;
    byDate[d] = {
      date: d, li_org: num(r[1]), li_spon: num(r[2]), li_total: num(r[3]), li_pv: num(r[4]), li_newf: num(r[5]), li_runf: num(r[6]),
      ig_reach: num(r[7]), ig_views: num(r[8]), ig_profile: num(r[9]), ig_runf: num(r[11]), ga_sessions: num(r[17])
    };
  }
  return Object.values(byDate).sort((a, b) => a.date < b.date ? -1 : 1);
}

function buildFlat(rows) {
  return rows.map(r => ({ date: isoDate(r[0]), ch: (r[1] || "").trim(), metric: (r[2] || "").trim(), value: num(r[3]) }))
             .filter(r => r.date && r.ch && r.value != null);
}

function buildYouTube(flat) {
  const yt = flat.filter(r => r.ch === "YouTube");
  const months = {};
  for (const r of yt) {
    if (!/monthly/i.test(r.metric)) continue;
    const kind = /^views/i.test(r.metric) ? "views" : /^watch/i.test(r.metric) ? "watch" : /subscri/i.test(r.metric) ? "subs" : null;
    if (!kind) continue;
    const k = r.date.slice(0, 7), partial = /partial/i.test(r.metric), pre = /pre-launch/i.test(r.metric);
    const m = months[k] ??= { k, pre: false };
    if (pre) m.pre = true;
    const cur = m[kind + "_p"]; // whether the stored value is partial
    if (m[kind] == null || (cur && !partial) || cur === partial) { m[kind] = r.value; m[kind + "_p"] = partial; }
  }
  const list = Object.values(months).sort((a, b) => a.k < b.k ? -1 : 1)
    .map(m => ({ k: m.k, m: monthShort(m.k), views: m.views ?? null, watch: m.watch ?? null, subs: m.subs ?? null, pre: m.pre, partial: !!(m.views_p) }));
  const latest = metric => { const xs = yt.filter(r => r.metric.toLowerCase().startsWith(metric)); return xs.sort((a, b) => a.date < b.date ? -1 : 1).at(-1) || null; };
  const subsRows = yt.filter(r => /^subscribers \(channel total\)/i.test(r.metric)).sort((a, b) => a.date < b.date ? -1 : 1);
  const subsNow = subsRows.at(-1) || null;
  let subs28 = null;
  if (subsNow) { const back = subsRows.filter(r => r.date <= addDays(subsNow.date, -28)).at(-1); if (back) subs28 = subsNow.value - back.value; }
  return {
    months: list,
    total_subs: subsNow ? subsNow.value : null, subsDate: subsNow ? subsNow.date : null, subs28,
    last28: { views: latest("views (last 28")?.value ?? null, watch: latest("watch time (last 28")?.value ?? null, date: latest("views (last 28")?.date ?? null }
  };
}

function buildGA(flat) {
  const ga = flat.filter(r => /site/i.test(r.ch) || /ga/i.test(r.ch)).sort((a, b) => a.date < b.date ? -1 : 1);
  const last = re => ga.filter(r => re.test(r.metric)).at(-1) || null;
  const v = last(/^site visitors/i), s = last(/^total subscribers/i);
  return { site_visitors: v?.value ?? null, subscribers: s?.value ?? null, date: v?.date ?? null };
}

/* Creative tab -> post records */
function parseCreativeTitle(s, refYear, refDate) {
  let date = null;
  let m = s.match(/\((\d{1,2})\/(\d{1,2})\b/);
  if (m) date = `${refYear}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  else if ((m = s.match(/\((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s?(\d{1,2})\b/i))) {
    const mi = MS.findIndex(x => x.toLowerCase() === m[1].slice(0, 3).toLowerCase()) + 1;
    date = `${refYear}-${String(mi).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  }
  if (date && date > addDays(refDate, 31)) date = (refYear - 1) + date.slice(4);
  let person = "", company = "", title = s.replace(/\s*\([^()]*\)\s*$/, "").trim();
  if ((m = s.match(/^([^\/()]+?)\/([^()]+?)\s+-\s+(.+?)\s*(\(|$)/))) { person = m[1].trim(); company = m[2].trim(); title = m[3].trim(); }
  else if ((m = s.match(/^(.+?)\s+\/\s+([^,()]+),\s*([^()]+?)\s*(\(|$)/))) { title = m[1].trim(); person = m[2].trim(); company = m[3].trim(); }
  return { date, person, company, title };
}

function buildCreativePosts(rows, refDate) {
  const h = rows.findIndex(r => (r[0] || "").trim() === "Channel" && /post/i.test(r[1] || ""));
  if (h < 0) return [];
  const refYear = +refDate.slice(0, 4), seen = new Set(), out = [];
  for (const r of rows.slice(h + 1)) {
    const ch = (r[0] || "").trim();
    if (ch !== "LinkedIn" && ch !== "Instagram") continue;
    const p = parseCreativeTitle(r[1] || "", refYear, refDate);
    if (!p.date) continue;
    const key = `${ch}|${p.date}|${(r[1] || "").replace(/\s*\([^()]*\)\s*$/, "").toLowerCase()}`;
    if (seen.has(key)) continue; // first row is the freshest read
    seen.add(key);
    let rec;
    if (ch === "LinkedIn") {
      rec = { reach: num(r[4]), views: num(r[5]), clicks: num(r[6]), er: num(r[11]), reactions: num(r[8]), comments: num(r[9]), amp: num(r[10]) };
    } else {
      const views = num(r[4]), reach = num(r[5]) || null, inter = num(r[6]);
      rec = { reach, views, clicks: null, er: reach && inter != null ? round(inter / reach * 100, 2) : null, reactions: num(r[8]), comments: num(r[9]), amp: num(r[10]) };
    }
    out.push(Object.assign({ ch, fmt: (r[2] || "").trim(), date: p.date, person: p.person, company: p.company, series: "", client: "", title: p.title }, rec));
  }
  return out;
}

function mergePosts(archive, creative) {
  const posts = archive.map(p => Object.assign({}, p));
  for (const c of creative) {
    if (c.date > ARCHIVE_END) { posts.push(c); continue; }
    if (!c.person) continue;
    const hits = posts.filter(p => p.ch === c.ch && p.date === c.date && (p.person || "").toLowerCase() === c.person.toLowerCase());
    if (hits.length !== 1) continue;
    const p = hits[0];
    if ((c.reach ?? 0) > (p.reach ?? 0)) for (const k of ["reach", "views", "clicks", "er", "reactions", "comments", "amp"]) if (c[k] != null) p[k] = c[k];
  }
  return posts.sort((a, b) => a.date < b.date ? 1 : -1);
}

/* ---------- derived metrics ---------- */
function buildMonths(daily, posts) {
  const MO = JSON.parse(JSON.stringify(ARCHIVE_MONTHS));
  const lastArchive = Object.keys(MO).sort().at(-1);
  const live = {};
  for (const d of daily) {
    if (d.li_org == null) continue;
    const k = d.date.slice(0, 7);
    if (k <= lastArchive) continue;
    const m = live[k] ??= { days: 0, org: 0, follEnd: null, eng: 0, proxy: true };
    m.days++; m.org += d.li_org; if (d.li_runf != null) m.follEnd = d.li_runf;
  }
  for (const p of posts) { const k = p.date.slice(0, 7); if (live[k] && p.ch === "LinkedIn") live[k].eng += (p.reactions || 0) + (p.comments || 0) + (p.amp || 0); }
  for (const k of Object.keys(live).sort()) { live[k].follStart = (MO[prevMonth(k)] || {}).follEnd ?? null; MO[k] = live[k]; }
  const keys = Object.keys(MO).sort();
  for (const k of keys) MO[k].complete = k === keys[0] ? true : MO[k].days >= daysIn(k);
  return MO;
}

function igMonthEnds(daily) {
  const reads = daily.filter(d => d.ig_runf != null);
  const at = (k, edge) => {
    if (edge === "start") { const first = `${k}-01`; const near = reads.filter(r => r.date >= addDays(first, -3) && r.date <= addDays(first, 3)); if (near.length) return near[0].ig_runf; const inMonth = reads.filter(r => r.date.startsWith(k)); return inMonth.length ? inMonth[0].ig_runf : null; }
    const inMonth = reads.filter(r => r.date.startsWith(k)); return inMonth.length ? inMonth.at(-1).ig_runf : null;
  };
  return k => { const s = at(k, "start"), e = at(k, "end"); return s != null && e != null && s !== e ? { s, e, mom: (e - s) / s * 100 } : (s != null && e != null ? { s, e, mom: 0 } : null); };
}

function windowTotals(posts, ch, end) {
  const st = addDays(end, -29);
  const P = posts.filter(p => p.ch === ch && p.date >= st && p.date <= end);
  return { comments: P.reduce((s, p) => s + (p.comments || 0), 0), reactions: P.reduce((s, p) => s + (p.reactions || 0), 0), amp: P.reduce((s, p) => s + (p.amp || 0), 0), posts: P.length };
}

function buildBench(posts) {
  const out = {};
  const meta = { LinkedIn: { headline: "Impressions", erlabel: "Eng. rate (eng/impr)", reaclabel: "Reactions", amplabel: "Reposts" },
                 Instagram: { headline: "Reach", erlabel: "Eng. rate (int/reach)", reaclabel: "Likes", amplabel: "Shares" } };
  for (const ch of ["LinkedIn", "Instagram"]) {
    const P = posts.filter(p => p.ch === ch);
    out[ch] = Object.assign({
      n: P.length,
      hl_med: median(P.map(p => p.reach)), hl_avg: round(mean(P.map(p => p.reach)), 1), hl_max: Math.max(0, ...P.map(p => p.reach || 0)),
      er_med: round(median(P.map(p => p.er)), 2), er_avg: round(mean(P.map(p => p.er)), 1),
      cm_med: median(P.map(p => p.comments)), cm_avg: round(mean(P.map(p => p.comments)), 1),
      rx_med: median(P.map(p => p.reactions)), rx_avg: round(mean(P.map(p => p.reactions)), 1),
      am_med: median(P.map(p => p.amp)), am_avg: round(mean(P.map(p => p.amp)), 1)
    }, meta[ch]);
  }
  return out;
}

/* ---------- render ---------- */
function render(S) {
  const { DAILY, POSTS, YT, GA, MO } = S;
  const liDays = DAILY.filter(d => d.li_org != null);
  const AS_OF = liDays.at(-1).date;
  const POST_END = POSTS.reduce((m, p) => p.date > m ? p.date : m, "");
  const POST_START = POSTS.reduce((m, p) => p.date < m ? p.date : m, "9999");

  document.getElementById("asof").textContent = longDate(AS_OF);
  document.getElementById("pulled").textContent = "live from the sheet";

  /* scorecard model */
  const keys = Object.keys(MO).sort();
  const H = keys.filter(k => MO[k].complete).at(-1);
  const benchKeys = keys.filter(k => k < H).slice(-3);
  const cur = keys.at(-1) !== H ? keys.at(-1) : null;
  const posts = k => MO[k].days * CAD;
  const perPost = k => MO[k].org / posts(k);
  const engRate = k => MO[k].eng / MO[k].org * 100;
  const liMoM = k => MO[k].follStart ? (MO[k].follEnd - MO[k].follStart) / MO[k].follStart * 100 : null;
  const sum = (ks, f) => ks.reduce((s, k) => s + f(k), 0);
  const B_perPost = sum(benchKeys, k => MO[k].org) / sum(benchKeys, posts);
  const B_engRate = sum(benchKeys, k => MO[k].eng) / sum(benchKeys, k => MO[k].org) * 100;
  const B_liMoM = mean(benchKeys.map(liMoM));
  const igM = igMonthEnds(DAILY);
  const igH = igM(H), B_igMoM = mean(benchKeys.map(k => igM(k)?.mom ?? null));
  const span = ks => ks.length ? `${monthShort(ks[0])} to ${monthShort(ks.at(-1))}` : "";

  const pct = (c, b, lab) => { if (c == null || b == null) return { t: "no comparison yet", c: "flat" }; const p = (c / b - 1) * 100; return { t: `${sign(p)}${p.toFixed(0)}% ${lab}`, c: p > 0 ? "pos" : p < 0 ? "neg" : "flat" }; };
  const pts = (c, b, lab) => { if (c == null || b == null) return { t: "no comparison yet", c: "flat" }; const d = c - b; return { t: `${sign(d)}${d.toFixed(1)} pts ${lab}`, c: d > 0 ? "pos" : d < 0 ? "neg" : "flat" }; };

  // Instagram 28-day reach vs the read ~28 days earlier
  const igReads = DAILY.filter(d => d.ig_reach != null);
  const igNow = igReads.at(-1);
  const igPrev = igNow ? igReads.filter(d => d.date <= addDays(igNow.date, -28)).at(-1) : null;
  const igPeak = igReads.reduce((m, d) => !m || d.ig_reach > m.ig_reach ? d : m, null);

  // YouTube: last full month vs the three full months before it
  const ytFull = YT.months.filter(m => !m.partial && m.views != null);
  const ytH = ytFull.at(-1);
  const ytBench = ytH ? ytFull.filter(m => m.k < ytH.k && !m.pre).slice(-3) : [];
  const ytBV = mean(ytBench.map(m => m.views)), ytBW = mean(ytBench.map(m => m.watch)), ytBS = mean(ytBench.map(m => m.subs));

  const liLast = liDays.at(-1), igFollNow = DAILY.filter(d => d.ig_runf != null).at(-1);
  const crossF = (liLast?.li_runf ?? 0) + (igFollNow?.ig_runf ?? 0);
  const Hn = `${monthName(H)} ${H.slice(0, 4)}`;

  const cards = [
    { cls: "li", tag: "LinkedIn", lab: "Organic reach per post", val: full(perPost(H)), cap: "per post", d: pct(perPost(H), B_perPost, "vs benchmark"),
      bench: `3-mo benchmark <b>${full(B_perPost)}</b> / post (${span(benchKeys)})`,
      mtd: cur ? `${monthName(cur)} to date <b>${full(perPost(cur))}</b> / post &middot; ${MO[cur].days} days` : `${monthName(H)} &middot; ${MO[H].days} days at ${CAD} posts/day` },
    { cls: "li", tag: "LinkedIn", lab: "Organic engagement rate", val: engRate(H).toFixed(2) + "%", cap: "", d: pts(engRate(H), B_engRate, "vs benchmark"),
      bench: `3-mo benchmark <b>${B_engRate.toFixed(2)}%</b>`,
      mtd: `Reactions + comments + reposts &divide; organic impressions` },
    { cls: "li", tag: "LinkedIn", lab: "Follower growth MoM", val: `${sign(liMoM(H))}${liMoM(H).toFixed(1)}%`, cap: "", d: pts(liMoM(H), B_liMoM, "vs benchmark"),
      bench: `3-mo benchmark <b>${sign(B_liMoM)}${(B_liMoM ?? 0).toFixed(1)}%</b> / mo`,
      mtd: `${full(MO[H].follStart)} &rarr; <b>${full(MO[H].follEnd)}</b> followers in ${monthName(H)} &middot; <b>${full(liLast.li_runf)}</b> as of ${mdy(liLast.date)}` },
    { cls: "ig", tag: "Instagram", lab: "Follower growth MoM", val: igH ? `${sign(igH.mom)}${igH.mom.toFixed(1)}%` : "—", cap: "", d: pts(igH?.mom ?? null, B_igMoM, "vs benchmark"),
      bench: B_igMoM != null ? `3-mo benchmark <b>${sign(B_igMoM)}${B_igMoM.toFixed(1)}%</b> / mo` : `Benchmark builds as months close`,
      mtd: igH ? `${full(igH.s)} &rarr; <b>${full(igH.e)}</b> followers in ${monthName(H)} &middot; <b>${full(igFollNow?.ig_runf)}</b> latest` : "" },
    { cls: "ig", tag: "Instagram", lab: "Reach (28-day rolling)", val: fmt(igNow?.ig_reach), cap: igNow ? `as of ${mdy(igNow.date)}` : "", d: pct(igNow?.ig_reach, igPrev?.ig_reach, "vs prior 28 days"),
      bench: igPrev ? `Prior 28 days <b>${fmt(igPrev.ig_reach)}</b> (${mdy(igPrev.date)} read)` : "",
      mtd: `Views <b>${fmt(igNow?.ig_views)}</b> over the same window &middot; peak reach ${fmt(igPeak?.ig_reach)} on ${igPeak ? mdy(igPeak.date) : "—"}` },
    { cls: "yt", tag: "YouTube", lab: "Views (monthly)", val: fmt(ytH?.views), cap: ytH ? monthName(ytH.k) : "", d: pct(ytH?.views, ytBV, "vs benchmark"),
      bench: `3-mo benchmark <b>${fmt(ytBV)}</b> / mo (${span(ytBench.map(m => m.k))})`,
      mtd: `Last 28 days <b>${fmt(YT.last28.views)}</b> views` },
    { cls: "yt", tag: "YouTube", lab: "Watch time (monthly)", val: ytH?.watch != null ? `${full(ytH.watch)} hrs` : "—", cap: ytH ? monthName(ytH.k) : "", d: pct(ytH?.watch, ytBW, "vs benchmark"),
      bench: `3-mo benchmark <b>${full(ytBW)} hrs</b> / mo`,
      mtd: `Last 28 days <b>${YT.last28.watch ?? "—"} hrs</b>` },
    { cls: "yt", tag: "YouTube", lab: "Subscribers (channel total)", val: full(YT.total_subs), cap: "",
      d: YT.subs28 != null ? { t: `${sign(YT.subs28)}${YT.subs28} in last 28 days`, c: YT.subs28 > 0 ? "pos" : YT.subs28 < 0 ? "neg" : "flat" } : { t: "channel total", c: "flat" },
      bench: ytH ? `${monthName(ytH.k)} net <b>${sign(ytH.subs)}${ytH.subs ?? "—"}</b> vs ${sign(ytBS)}${round(ytBS, 1) ?? "—"} / mo benchmark` : "",
      mtd: YT.subsDate ? `As of ${mdy(YT.subsDate)}` : "" },
    { cls: "ga", tag: "Site (GA)", lab: "Site visitors (period)", val: full(GA.site_visitors), cap: "", d: { t: "context metric", c: "flat" },
      bench: `Cross-channel followers <b>${full(crossF)}</b> (LinkedIn + Instagram)`,
      mtd: `Subscribers <b>${full(GA.subscribers)}</b>${GA.date ? ` &middot; as of ${mdy(GA.date)}` : ""}` }
  ];
  document.getElementById("kpis").innerHTML = cards.map(c =>
    `<div class="kpi ${c.cls}"><div class="tag">${c.tag}</div><div class="lab">${c.lab}</div><div class="valrow"><span class="val">${c.val}</span>${c.cap ? `<span class="valcap">${c.cap}</span>` : ""}</div><div class="chg ${c.d.c}">${c.d.t}</div><div class="bench">${c.bench}</div><div class="mtd">${c.mtd}</div></div>`).join("");

  document.getElementById("kpiLegend").innerHTML =
    `<span class="chip head">Headline</span> ${Hn}, the last complete month. <span class="chip bench">Benchmark</span> the three months before it (${span(benchKeys)}). <span class="chip mtd">Context</span> the current month to date and the latest reads.`;
  const proxyNote = keys.some(k => MO[k].proxy) ? ` From ${monthName(keys.find(k => MO[k].proxy))} on, LinkedIn monthly engagement is summed from the posts published that month; earlier months use LinkedIn's own Highlights totals.` : "";
  document.getElementById("kpiMethod").innerHTML =
    `<b>Method.</b> LinkedIn per-post metrics use monthly organic impressions divided by posts, where posts = days &times; ${CAD} posts/day. Rates use organic impressions as the denominator.${proxyNote} Instagram reach is Meta's 28-day rolling figure, compared with the read 28 days earlier. YouTube reads at the monthly account level and is benchmarked against the three full months before. The headline month moves forward on its own once LinkedIn has reported every day of a month.`;

  /* summary */
  const last7 = liDays.slice(-7), prior7 = liDays.slice(-14, -7);
  const s7 = last7.reduce((s, d) => s + d.li_org, 0), p7 = prior7.reduce((s, d) => s + d.li_org, 0);
  const li30 = liDays.filter(d => d.date <= addDays(AS_OF, -30)).at(-1);
  const recent = POSTS.filter(p => p.date > addDays(POST_END, -30));
  const topLI = recent.filter(p => p.ch === "LinkedIn").sort((a, b) => (b.reach || 0) - (a.reach || 0))[0];
  const topIG = recent.filter(p => p.ch === "Instagram").sort((a, b) => (b.views || 0) - (a.views || 0))[0];
  const who = p => p.person ? `${esc(p.person)}${p.company ? `, ${esc(p.company)}` : ""}` : esc(p.title);
  const chg = (a, b) => b ? ` (${sign(a - b)}${((a / b - 1) * 100).toFixed(0)}% on the week before)` : "";
  document.getElementById("take").innerHTML = [
    `LinkedIn organic impressions were <b>${full(s7)}</b> over the 7 days to ${mdy(AS_OF)}${chg(s7, p7)}.`,
    `LinkedIn followers stand at <b>${full(liLast.li_runf)}</b>${li30 ? ` (${sign(liLast.li_runf - li30.li_runf)}${full(liLast.li_runf - li30.li_runf)} in 30 days)` : ""}; Instagram at <b>${full(igFollNow?.ig_runf)}</b>.`,
    igNow ? `Instagram's 28-day window reads <b>${fmt(igNow.ig_reach)} reach</b> and <b>${fmt(igNow.ig_views)} views</b>${igPrev ? ` (${pct(igNow.ig_reach, igPrev.ig_reach, "").t.trim()} reach on the prior 28 days)` : ""}.` : "",
    topLI ? `Top LinkedIn post of the last 30 days: ${who(topLI)} (${mdy(topLI.date)}) at <b>${full(topLI.reach)} impressions</b>.` : "",
    topIG ? `Top Instagram post: ${who(topIG)} (${mdy(topIG.date)}) at <b>${full(topIG.views)} views</b>.` : "",
    YT.total_subs != null ? `YouTube is at <b>${full(YT.total_subs)}</b> subscribers on <b>${fmt(YT.last28.views)} views</b> in the last 28 days.` : "",
    GA.site_visitors != null ? `Site visitors: <b>${full(GA.site_visitors)}</b>.` : ""
  ].filter(Boolean).join(" ");

  /* charts */
  Chart.defaults.font.family = "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif";
  Chart.defaults.color = "#77727f";
  const baseOpts = fmtY => ({ responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${full(c.parsed.y)}` } } },
    scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }, y: { beginAtZero: false, grid: { color: "#f0ebe2" }, ticks: { callback: v => fmtY(v) } } } });
  const liSlice = r => r === "all" ? liDays : liDays.slice(-parseInt(r));
  const charts = {};
  const line = (id, rows, sets, opts) => { if (charts[id]) charts[id].destroy(); charts[id] = new Chart(document.getElementById(id), { type: "line", data: { labels: rows.map(d => mdy(d.date)), datasets: sets }, options: opts }); };
  const ds = (label, data, color, fill, r, dash) => ({ label, data, borderColor: color, backgroundColor: fill ? color.replace("rgb", "rgba").replace(")", ",.10)") : "transparent", borderWidth: 2, borderDash: dash || [], fill, tension: .3, spanGaps: true, pointRadius: r === "all" ? 0 : 2, pointHoverRadius: 5 });
  const igOpts = (legend, f) => Object.assign(baseOpts(f || fmt), { plugins: { legend: legend ? { display: true, position: "top", labels: { usePointStyle: true, padding: 16, boxWidth: 8 } } : { display: false }, tooltip: { filter: i => i.parsed.y != null, callbacks: { label: c => `${c.dataset.label}: ${full(c.parsed.y)}` } } } });
  const draw = {
    liImpr: r => { const rows = liSlice(r); line("liImpr", rows, [ds("Organic impressions", rows.map(d => d.li_org), "rgb(47,74,107)", true, r)], baseOpts(fmt)); },
    liFoll: r => { const rows = liSlice(r); line("liFoll", rows, [ds("Followers", rows.map(d => d.li_runf), "rgb(201,99,63)", true, r)], baseOpts(full)); },
    igReach: r => { const rows = liSlice(r); line("igReach", rows, [ds("Reach", rows.map(d => d.ig_reach), "rgb(177,80,138)", true, r), ds("Views", rows.map(d => d.ig_views), "rgb(194,154,69)", false, r, [5, 4])], igOpts(true)); },
    igFoll: r => { const rows = liSlice(r); line("igFoll", rows, [ds("Followers", rows.map(d => d.ig_runf), "rgb(177,80,138)", true, r)], igOpts(false, full)); }
  };
  for (const [range, id] of [["liRange", "liImpr"], ["lfRange", "liFoll"], ["igRange", "igReach"], ["igfRange", "igFoll"]]) {
    draw[id]("30");
    document.querySelectorAll(`#${range} button`).forEach(b => b.onclick = () => {
      document.querySelectorAll(`#${range} button`).forEach(x => x.classList.remove("active"));
      b.classList.add("active"); draw[id](b.dataset.r);
    });
  }
  const firstIG = DAILY.find(d => d.ig_reach != null), firstIGF = DAILY.find(d => d.ig_runf != null);
  if (firstIG) document.getElementById("igReachNote").innerHTML = `28-day rolling values &middot; capture starts ${mdy(firstIG.date)}`;
  if (firstIGF) document.getElementById("igFollNote").innerHTML = `Lifetime &middot; capture starts ${mdy(firstIGF.date)}`;

  const ytMonths = YT.months.filter(m => m.views != null);
  const ytNote = x => x.pre ? " (pre-launch)" : x.partial ? " (partial month)" : "";
  const ytBar = (id, key, unit, f) => new Chart(document.getElementById(id), { type: "bar",
    data: { labels: ytMonths.map(x => x.m), datasets: [{ label: unit, data: ytMonths.map(x => x[key]), backgroundColor: ytMonths.map(x => x.pre ? "#e3b7b3" : x.partial ? "#e08a83" : "#cc3a32"), borderRadius: 4, barThickness: 38 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${full(c.parsed.y)} ${unit}${ytNote(ytMonths[c.dataIndex])}` } } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: "#f0ebe2" }, ticks: { callback: v => f(v) } } } } });
  ytBar("ytViews", "views", "views", fmt); ytBar("ytWatch", "watch", "hrs", full);

  /* top content: posts published in the last 30 days */
  const winStart = addDays(POST_END, -29);
  const CREATIVE = POSTS.filter(p => p.date >= winStart).map(p => ({
    channel: p.ch, title: (p.person && !p.title.toLowerCase().includes(p.person.split(",")[0].toLowerCase()) ? `${p.person}${p.company ? ` / ${p.company}` : ""} - ` : "") + p.title + ` (${slash(p.date)})`, type: p.fmt,
    impressions: p.reach, views: p.views, clicks: p.clicks, ctr: p.ch === "LinkedIn" && p.clicks != null && p.reach ? (p.clicks / p.reach * 100).toFixed(1) + "%" : null, comments: p.comments }));
  document.getElementById("topNote").innerHTML = `Posts published ${slash(winStart)} to ${slash(POST_END)}`;
  document.getElementById("cmtNote").innerHTML = `LinkedIn conversation depth, top 15 posts published ${slash(winStart)} to ${slash(POST_END)}`;
  let curFilter = "all", sortK = "impressions", sortDir = "desc";
  const tbody = document.querySelector("#ctable tbody");
  const renderTable = () => {
    let rows = CREATIVE.filter(r => curFilter === "all" || r.channel === curFilter);
    rows = [...rows].sort((a, b) => { let x = a[sortK], y = b[sortK];
      if (typeof x === "string" && x.endsWith("%")) x = parseFloat(x); if (typeof y === "string" && y.endsWith("%")) y = parseFloat(y);
      if (x == null) x = -Infinity; if (y == null) y = -Infinity; const c = x < y ? -1 : x > y ? 1 : 0; return sortDir === "asc" ? c : -c; });
    tbody.innerHTML = rows.map(r => `<tr><td><span class="pill ${r.channel}">${r.channel}</span></td><td>${esc(r.title)}</td><td>${esc(r.type)}</td>
      <td class="num">${full(r.impressions)}</td><td class="num">${full(r.views)}</td><td class="num">${full(r.clicks)}</td><td class="num">${r.ctr ?? "—"}</td><td class="num">${full(r.comments)}</td></tr>`).join("");
  };
  document.querySelectorAll("#ctable thead th").forEach(th => th.onclick = () => { const k = th.dataset.k; if (sortK === k) sortDir = sortDir === "asc" ? "desc" : "asc"; else { sortK = k; sortDir = "desc"; } renderTable(); });
  document.querySelectorAll("#chips button").forEach(b => b.onclick = () => { document.querySelectorAll("#chips button").forEach(x => x.classList.remove("active")); b.classList.add("active"); curFilter = b.dataset.c; renderTable(); });
  renderTable();

  const cmt = CREATIVE.filter(r => r.channel === "LinkedIn" && r.comments != null).sort((a, b) => b.comments - a.comments).slice(0, 15);
  const shortT = t => t.length > 46 ? t.slice(0, 44) + "…" : t;
  new Chart(document.getElementById("cmtChart"), { type: "bar",
    data: { labels: cmt.map(r => shortT(r.title)), datasets: [{ label: "Comments", data: cmt.map(r => r.comments), backgroundColor: "#2f4a6b", borderRadius: 4, barThickness: 14 }] },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.parsed.x} comment${c.parsed.x === 1 ? "" : "s"}` } } },
      scales: { x: { beginAtZero: true, grid: { color: "#f0ebe2" }, ticks: { precision: 0 } }, y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 11 } } } } } });

  /* engagement momentum */
  const DELTA = {}; for (const ch of ["LinkedIn", "Instagram"]) DELTA[ch] = { cur: windowTotals(POSTS, ch, POST_END), pri: windowTotals(POSTS, ch, addDays(POST_END, -30)) };
  const DMETA = [{ ch: "LinkedIn", k: "comments", lab: "LinkedIn comments", cls: "li" }, { ch: "LinkedIn", k: "reactions", lab: "LinkedIn reactions", cls: "li" }, { ch: "LinkedIn", k: "amp", lab: "LinkedIn reposts", cls: "li" },
                 { ch: "Instagram", k: "comments", lab: "Instagram comments", cls: "ig" }, { ch: "Instagram", k: "reactions", lab: "Instagram likes", cls: "ig" }, { ch: "Instagram", k: "amp", lab: "Instagram shares", cls: "ig" }];
  document.getElementById("deltacards").innerHTML = DMETA.map(d => {
    const c = DELTA[d.ch].cur[d.k], p = DELTA[d.ch].pri[d.k], diff = c - p, pc = p ? Math.round(diff / p * 100) : null;
    const cls = diff > 0 ? "up" : diff < 0 ? "down" : "flat", arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "–";
    return `<div class="dcard ${d.cls}"><div class="dl">${d.lab}</div><div class="dv">${full(c)}</div>
      <div class="dd ${cls}">${arrow} ${diff > 0 ? "+" : ""}${full(diff)}${pc === null ? "" : ` (${diff > 0 ? "+" : ""}${pc}%)`}</div>
      <div class="dp">vs ${full(p)} the 30 days before &middot; ${(c / (DELTA[d.ch].cur.posts || 1)).toFixed(1)} per post</div></div>`; }).join("");
  document.getElementById("deltaNote").innerHTML =
    `<b>How these are counted.</b> These are lifetime totals for the posts published in each window (${slash(addDays(POST_END, -29))} to ${slash(POST_END)}, against ${slash(addDays(POST_END, -59))} to ${slash(addDays(POST_END, -30))}), so a number moves when the publishing moves, not when an old post picks up a late comment. LinkedIn's own 30-day Highlights panel counts activity on posts of any age, so the two track close but will not tie out exactly. Treat Highlights as the platform headline and this as the editorial scorecard.`;

  const TREND = {};
  const tStart = addDays(POST_START, 29);
  for (const ch of ["LinkedIn", "Instagram"]) { TREND[ch] = []; for (let d = tStart; d <= POST_END; d = addDays(d, 1)) TREND[ch].push(Object.assign({ date: d }, windowTotals(POSTS, ch, d))); }
  let engChart;
  const drawEng = ch => {
    const rows = TREND[ch], rxLab = ch === "LinkedIn" ? "Reactions" : "Likes", ampLab = ch === "LinkedIn" ? "Reposts" : "Shares", li = ch === "LinkedIn";
    if (engChart) engChart.destroy();
    engChart = new Chart(document.getElementById("engChart"), { type: "line",
      data: { labels: rows.map(d => mdy(d.date)), datasets: [
        { label: rxLab + " (30d total)", data: rows.map(d => d.reactions), borderColor: li ? "#2f4a6b" : "#b1508a", backgroundColor: li ? "rgba(47,74,107,.10)" : "rgba(177,80,138,.10)", borderWidth: 2, fill: true, tension: .3, pointRadius: 0, pointHoverRadius: 5, yAxisID: "y" },
        { label: "Comments (30d total)", data: rows.map(d => d.comments), borderColor: "#c9633f", borderWidth: 2, fill: false, tension: .3, pointRadius: 0, pointHoverRadius: 5, yAxisID: "y1" },
        { label: ampLab + " (30d total)", data: rows.map(d => d.amp), borderColor: "#c29a45", borderWidth: 2, borderDash: [5, 4], fill: false, tension: .3, pointRadius: 0, pointHoverRadius: 5, yAxisID: "y1" }] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 12, boxHeight: 2, font: { size: 11 } } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${full(c.parsed.y)}` } } },
        scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
          y: { position: "left", beginAtZero: true, grid: { color: "#f0ebe2" }, ticks: { callback: v => fmt(v) }, title: { display: true, text: rxLab, font: { size: 10 } } },
          y1: { position: "right", beginAtZero: true, grid: { display: false }, ticks: { callback: v => fmt(v) }, title: { display: true, text: "Comments / " + ampLab, font: { size: 10 } } } } } });
  };
  drawEng("LinkedIn");
  document.querySelectorAll("#engChan button").forEach(b => b.onclick = () => { document.querySelectorAll("#engChan button").forEach(x => x.classList.remove("active")); b.classList.add("active"); drawEng(b.dataset.c); });

  /* running benchmarks */
  const BENCH = buildBench(POSTS);
  const spanDays = Math.round((new Date(POST_END) - new Date(POST_START)) / 864e5) + 1;
  document.getElementById("benchTitle").innerHTML = `Running Benchmarks &middot; all posts, ${slash(POST_START)} to ${slash(POST_END)} (${spanDays} days)`;
  const bmeta = { LinkedIn: "li", Instagram: "reel" };
  document.getElementById("benchcards").innerHTML = Object.keys(BENCH).map(k => { const b = BENCH[k];
    return `<div class="bcard ${bmeta[k]}"><div class="bh"><div class="bt">${k}</div><div class="bn">n=${b.n} posts</div></div>
      <div class="hero"><div class="big">${full(b.hl_med)}</div><div class="hl">median ${b.headline.toLowerCase()}</div></div>
      <div class="avgline">avg ${full(b.hl_avg)} &middot; top post ${full(b.hl_max)}</div>
      <div class="rows"><div class="mrow"><span class="k">${b.erlabel}</span><span class="v">${b.er_med}%</span></div>
      <div class="mrow"><span class="k">${b.reaclabel}</span><span class="v">${full(b.rx_med)}</span></div>
      <div class="mrow"><span class="k">Comments</span><span class="v">${b.cm_med}</span></div>
      <div class="mrow"><span class="k">${b.amplabel}</span><span class="v">${full(b.am_med)}</span></div>
      <div class="mrow"><span class="k">Avg rate</span><span class="v">${b.er_avg}%</span></div>
      <div class="mrow"><span class="k">Avg comments</span><span class="v">${b.cm_avg}</span></div></div></div>`; }).join("");

  /* every post, ranked */
  const medBy = { LinkedIn: BENCH.LinkedIn.er_med, Instagram: BENCH.Instagram.er_med };
  const NUMK = { reach: 1, views: 1, er: 1, reactions: 1, comments: 1, amp: 1 };
  let pFilter = "all", pSortK = "reach", pSortDir = "desc", pQ = "", pMonth = "all", pField = "any";
  const ptbody = document.querySelector("#ptable tbody");
  const MONTHS = [...new Set(POSTS.map(r => r.date.slice(0, 7)))].sort().reverse();
  document.getElementById("pmonth").innerHTML = '<option value="all">All months</option>' + MONTHS.map(m => `<option value="${m}">${monthName(m)} ${m.slice(0, 4)}</option>`).join("");
  const dash = v => (v == null || v === "") ? '<span class="dim">&mdash;</span>' : esc(v);
  const hit = r => { if (!pQ) return true; const f = pField === "any" ? [r.person, r.company, r.series, r.client, r.title, r.ch] : [r[pField]]; return f.some(v => String(v || "").toLowerCase().includes(pQ)); };
  const renderPTable = () => {
    let rows = POSTS.filter(r => (pFilter === "all" || r.ch === pFilter) && (pMonth === "all" || r.date.slice(0, 7) === pMonth) && hit(r));
    rows = [...rows].sort((a, b) => { let x = a[pSortK], y = b[pSortK];
      if (NUMK[pSortK]) { if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; }
      else { x = String(x == null ? "" : x).toLowerCase(); y = String(y == null ? "" : y).toLowerCase(); if (x === "" && y !== "") return 1; if (y === "" && x !== "") return -1; }
      const c = x < y ? -1 : x > y ? 1 : 0; return pSortDir === "asc" ? c : -c; });
    document.getElementById("pcount").textContent = rows.length === POSTS.length ? `${POSTS.length} posts` : `${rows.length} of ${POSTS.length} posts`;
    if (!rows.length) { ptbody.innerHTML = '<tr><td colspan="13" class="empty">No posts match that search.</td></tr>'; return; }
    ptbody.innerHTML = rows.map(r => { const beat = r.er != null && r.er >= (medBy[r.ch] || 0);
      return `<tr><td class="dim">${mdy(r.date)}</td><td><span class="pill ${r.ch}">${r.ch === "LinkedIn" ? "LI" : "IG"}</span></td>
        <td>${dash(r.person)}</td><td>${dash(r.company)}</td><td>${dash(r.series)}</td><td>${dash(r.client)}</td><td class="ttl">${esc(r.title)}</td>
        <td class="num">${full(r.reach)}</td><td class="num">${full(r.views)}</td><td class="num ${beat ? "beat" : "below"}">${r.er == null ? "&mdash;" : r.er.toFixed(2) + "%"}</td>
        <td class="num">${full(r.reactions)}</td><td class="num">${full(r.comments)}</td><td class="num">${full(r.amp)}</td></tr>`; }).join("");
  };
  document.querySelectorAll("#ptable thead th").forEach(th => th.onclick = () => {
    const k = th.dataset.k; if (pSortK === k) pSortDir = pSortDir === "asc" ? "desc" : "asc"; else { pSortK = k; pSortDir = NUMK[k] ? "desc" : "asc"; }
    document.querySelectorAll("#ptable thead th").forEach(x => { x.classList.toggle("sorted", x.dataset.k === pSortK); x.textContent = x.textContent.replace(/[ ▲▼]+$/, ""); if (x.dataset.k === pSortK) x.textContent += pSortDir === "asc" ? " ▲" : " ▼"; });
    renderPTable(); });
  document.querySelectorAll("#pchips button").forEach(b => b.onclick = () => { document.querySelectorAll("#pchips button").forEach(x => x.classList.remove("active")); b.classList.add("active"); pFilter = b.dataset.c; renderPTable(); });
  document.getElementById("psearch").addEventListener("input", e => { pQ = e.target.value.trim().toLowerCase(); renderPTable(); });
  document.getElementById("pmonth").addEventListener("change", e => { pMonth = e.target.value; renderPTable(); });
  document.getElementById("pfield").addEventListener("change", e => { pField = e.target.value; renderPTable(); });
  document.getElementById("pclear").addEventListener("click", () => {
    pQ = ""; pMonth = "all"; pField = "any"; pFilter = "all";
    document.getElementById("psearch").value = ""; document.getElementById("pmonth").value = "all"; document.getElementById("pfield").value = "any";
    document.querySelectorAll("#pchips button").forEach(x => x.classList.remove("active")); document.querySelector('#pchips button[data-c="all"]').classList.add("active");
    renderPTable(); });
  renderPTable();
  document.getElementById("postNote").innerHTML =
    `<b>How to use this.</b> Every organic LinkedIn and Instagram post from ${slash(POST_START)} to ${slash(POST_END)}, ${POSTS.length} in total. Instagram Stories are excluded. <b>Person</b> and <b>Company</b> come from the post caption, so brand and recap posts carry no person. <b>Series</b> and <b>Client</b> stay empty until the content calendar is joined in. Search matches any field by default, or narrow it with the dropdown. Click any header to sort, and click again to flip direction. Rate cells shade green when a post beats its channel median.`;

  document.getElementById("foot").innerHTML =
    `<b>Source:</b> the ATM Daily Social Pulse Google Sheet, read live each time this page opens (Daily Pulse, Creative and Flat Feed tabs). Posts through ${slash(ARCHIVE_END)} come from the archived per-post pull from LinkedIn page analytics and Meta Business Suite; later posts come from the sheet's Creative tab. Instagram engagement rate is interactions over reach; LinkedIn is (clicks + reactions + comments + reposts) over impressions, so read each against its own median rather than across channels. Instagram reach and views on the daily series are 28-day rolling figures. Boosted Instagram posts report organic and paid together.`;
}

/* ---------- boot ---------- */
(async function () {
  const status = document.getElementById("loadStatus");
  try {
    const [daily, creative, flat] = await Promise.all(["Daily Pulse", "Creative", "Flat Feed"].map(readTab));
    const DAILY = buildDaily(daily);
    if (!DAILY.length) throw new Error("the Daily Pulse tab had no dated rows");
    const asOf = DAILY.filter(d => d.li_org != null).at(-1).date;
    const POSTS = mergePosts(ARCHIVE_POSTS, buildCreativePosts(creative, asOf));
    const F = buildFlat(flat);
    const S = { DAILY, POSTS, YT: buildYouTube(F), GA: buildGA(F) };
    S.MO = buildMonths(DAILY, POSTS);
    window.ATM = S;
    render(S);
    status.remove();
  } catch (e) {
    console.error(e);
    status.innerHTML = `<b>The dashboard could not read the Google Sheet:</b> ${esc(e.message)}. Try refreshing in a minute.`;
    status.classList.add("err");
  }
})();
