/* ATM daily social data: reads the ATM Daily Social Pulse Google Sheet and builds every daily series.
   Exposes window.ATMDaily. Posts through ARCHIVE_END come from archive.js. */
(function () {
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
    total_subs: subsNow ? subsNow.value : null, subsDate: subsNow ? subsNow.date : null, subs28, subsRows,
    last28: { views: latest("views (last 28")?.value ?? null, watch: latest("watch time (last 28")?.value ?? null, date: latest("views (last 28")?.date ?? null }
  };
}

function buildGA(flat) {
  const ga = flat.filter(r => /site/i.test(r.ch) || /ga/i.test(r.ch)).sort((a, b) => a.date < b.date ? -1 : 1);
  const last = re => ga.filter(r => re.test(r.metric)).at(-1) || null;
  const v = last(/^site visitors/i), s = last(/^total subscribers/i);
  // the Looker subscriber tile can sit unchanged for weeks; report when the value last changed, not when it was last read
  const subRows = ga.filter(r => /^total subscribers/i.test(r.metric));
  let since = s?.date ?? null;
  for (let i = subRows.length - 1; i >= 0 && subRows[i].value === s?.value; i--) since = subRows[i].date;
  return { site_visitors: v?.value ?? null, subscribers: s?.value ?? null, date: v?.date ?? null, subsSince: since, subsRead: s?.date ?? null };
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


/* LinkedIn competitor table: ATM's own total followers, and the peer pages it is measured against */
function buildCompetitors(rows) {
  const h = rows.findIndex(r => (r[0] || "").trim() === "Rank");
  if (h < 0) return { rows: [], note: "" };
  const note = rows.slice(0, h).map(r => r[0]).filter(Boolean).find(t => /pull|refresh|last 30/i.test(t)) || "";
  const out = rows.slice(h + 1).filter(r => num(r[0]) != null && r[1]).map(r => ({ rank: num(r[0]), company: r[1].trim(), total: num(r[2]), newf: num(r[3]), posts: num(r[4]), comments: num(r[5]) }));
  return { rows: out, note, atm: out.find(r => /\(ATM\)/.test(r.company)) || null, peer: out.find(r => /^At The Moment$/i.test(r.company)) || null };
}


/* ---------- Supermetrics pulls (data/sm/, refreshed daily by a scheduled run) ----------
   LinkedIn Pages, Instagram Insights and YouTube through Supermetrics. Where these overlap the
   sheet they win (same platform numbers, read directly); the sheet still supplies the peer set and
   the hand-tagged person, company and series on each post. */
async function readSM(name) {
  try {
    const r = await fetch(`data/sm/${name}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return [];
    const rows = parseCSV(await r.text()).filter(x => x.length > 1);
    const h = rows.shift() || [];
    return rows.map(x => Object.fromEntries(h.map((k, i) => [k, x[i]])));
  } catch (e) { return []; }
}
const clean = s => String(s || "").replace(/\s+/g, " ").trim();
const firstSentence = t => { t = clean(t); const m = t.match(/^(.{20,110}?[.!?])(\s|$)/); return m ? m[1] : (t.length > 100 ? t.slice(0, 98) + "…" : t); };
const splitTitle = seg => {
  seg = clean(seg).replace(/\s*\(.*?\)\s*/g, " ").trim();
  let i = seg.lastIndexOf(" at ");
  if (i > 0) return { title: seg.slice(0, i).trim(), company: seg.slice(i + 4).trim() };
  i = seg.indexOf(" of ");
  if (i > 0) return { title: seg.slice(0, i).trim(), company: seg.slice(i + 4).trim() };
  return { title: seg, company: "" };
};
const NAME = "\\p{Lu}[\\p{L}.'’-]+(?: (?:\\p{Lu}[\\p{L}.'’-]+|de|la|van|von)){1,4}";
function personFromLinkedIn(text) {
  const t = clean(text).replace(/\s*\((?:he|she|they)[^)]*\)/ig, "");
  let m = t.match(new RegExp(`^(${NAME}), ([^,]{3,120}?), (?:says|said|is|was|tells|wants|grew|built|on|shares|believes|launched|joins|explains|talks|thinks|knows|has|reflects)\\b`, "u"));
  if (!m) m = t.match(new RegExp(`honou?ring (${NAME}), ([^,]{3,120}?), as\\b`, "u"));
  if (!m) return null;
  const tc = splitTitle(m[2]);
  return { person: m[1].trim(), role: tc.title, company: tc.company.replace(/\s+(LLC|Inc\.?|Ltd\.?)$/i, "").replace(/^the /i, "") };
}
function personFromInstagram(text) {
  const t = clean(text);
  const m = t.match(new RegExp(`(?:^|[.!?]\\s+|[\\u{1F300}-\\u{1FAFF}\\u2600-\\u27BF]\\s*)(${NAME})(?:, [^.]{2,80}?)? at (?:the )?@?([\\p{L}\\d.&' -]{2,40}?) (?:on|about|shares|explains)\\b`, "u"));
  return m ? { person: m[1].trim(), company: m[2].trim() } : null;
}
const lastName = n => (n || "").trim().split(/\s+/).at(-1).toLowerCase();

function smPosts(li, ig) {
  const L = li.map(r => {
    const impr = num(r.impressions), clicks = num(r.clicks), likes = num(r.likes), cm = num(r.comments), sh = num(r.shares);
    const who = personFromLinkedIn(r.text) || {};
    return { id: "li:" + r.post_id, ch: "LinkedIn", fmt: r.media === "VIDEO" ? "Video" : r.media === "IMAGE" ? "Image" : (r.media ? r.media[0] + r.media.slice(1).toLowerCase() : "Image"),
      date: r.date, person: who.person || "", company: who.company || "", role: who.role || "", series: "", client: "", title: firstSentence(r.text), text: clean(r.text),
      reach: impr, views: null, clicks, reactions: likes, comments: cm, amp: sh,
      er: impr ? round(((clicks || 0) + (likes || 0) + (cm || 0) + (sh || 0)) / impr * 100, 2) : null, src: "sm" };
  });
  const I = ig.filter(r => r.type !== "STORY").map(r => {
    const reach = num(r.reach), inter = num(r.interactions);
    let who = personFromInstagram(r.caption);
    // the same guest usually has a LinkedIn post within a few days; it carries a cleaner name and company
    const near = L.filter(p => p.person && Math.abs(new Date(p.date) - new Date(r.date)) <= 3 * 864e5 && clean(r.caption).toLowerCase().includes(lastName(p.person)));
    if (near.length) who = { person: near[0].person, company: near[0].company };
    return { id: "ig:" + r.media_id, url: r.url || "", ch: "Instagram", fmt: r.type === "REELS" ? "Reel" : r.type === "FEED" ? "Post" : (r.type || ""), date: r.date, person: who?.person || "", company: who?.company || "", series: "", client: "",
      title: firstSentence(r.caption), text: clean(r.caption), reach, views: num(r.views), clicks: null, reactions: num(r.likes), comments: num(r.comments), amp: num(r.shares),
      er: reach ? round((inter || 0) / reach * 100, 2) : null, src: "sm" };
  });
  return L.concat(I);
}

function applySM(S, sm) {
  const { liDaily, liPosts, igPosts, ig28, yt, ytm, totals } = sm;
  const byDate = Object.fromEntries(S.DAILY.map(d => [d.date, d]));
  const row = d => byDate[d] ??= { date: d };
  // LinkedIn daily
  for (const r of liDaily) {
    const d = row(r.date), impr = num(r.impressions);
    if (impr == null) continue;
    d.li_org = impr; d.li_spon = d.li_spon ?? 0; d.li_total = impr + (d.li_spon || 0);
    if (num(r.page_views) != null) d.li_pv = num(r.page_views);
    if (num(r.new_followers) != null) d.li_newf = num(r.new_followers);
    d.li_eng = (num(r.likes) || 0) + Math.max(0, num(r.comments) || 0) + (num(r.shares) || 0);
  }
  // Instagram 28-day windows and follower totals; YouTube and LinkedIn totals
  for (const r of ig28) { const d = row(r.end_date); d.ig_reach = num(r.reach); d.ig_views = num(r.views); }
  for (const r of totals) { if (num(r.ig_followers) != null) row(r.date).ig_runf = num(r.ig_followers); }
  S.DAILY = Object.values(byDate).sort((a, b) => a.date < b.date ? -1 : 1);
  // the organic follower line runs on from the sheet's last reading, adding LinkedIn's daily gains
  let runf = null;
  for (const d of S.DAILY) {
    if (d.li_runf != null) { runf = d.li_runf; continue; }
    if (runf != null && d.li_org != null) { runf += d.li_newf || 0; d.li_runf = runf; }
  }
  const tot = totals.filter(r => num(r.li_followers) != null).at(-1);
  if (tot) S.LI_TOTAL = { value: num(tot.li_followers), date: tot.date };
  // YouTube: monthly totals, subscriber count and the last 28 days
  const months = Object.fromEntries(S.YT.months.map(m => [m.k, m]));
  for (const r of ytm) {
    const k = r.month, m = months[k] ??= { k, m: monthShort(k), pre: false };
    m.views = num(r.views); m.watch = round(num(r.minutes) / 60, 1); m.subs = (num(r.subs_gained) || 0) - (num(r.subs_lost) || 0);
    m.partial = !!r.through && r.through.slice(8) !== String(daysIn(k)).padStart(2, "0");
  }
  S.YT.months = Object.values(months).sort((a, b) => a.k < b.k ? -1 : 1);
  for (const r of totals) if (num(r.yt_subscribers) != null && !S.YT.subsRows.some(x => x.date === r.date)) S.YT.subsRows.push({ date: r.date, ch: "YouTube", metric: "Subscribers (channel total)", value: num(r.yt_subscribers) });
  S.YT.subsRows.sort((a, b) => a.date < b.date ? -1 : 1);
  const sNow = S.YT.subsRows.at(-1);
  if (sNow) { S.YT.total_subs = sNow.value; S.YT.subsDate = sNow.date; const back = S.YT.subsRows.filter(r => r.date <= addDays(sNow.date, -28)).at(-1); S.YT.subs28 = back ? sNow.value - back.value : S.YT.subs28; }
  if (yt.length) {
    const end = yt.at(-1).date, w = yt.filter(r => r.date > addDays(end, -28));
    S.YT.last28 = { views: w.reduce((s, r) => s + (num(r.views) || 0), 0), watch: round(w.reduce((s, r) => s + (num(r.minutes) || 0), 0) / 60, 1), date: end };
  }
  // posts: Supermetrics lists every post, so it replaces sheet rows on the days it covers, keeping the sheet's tags
  const SMP = smPosts(liPosts, igPosts);
  for (const ch of ["LinkedIn", "Instagram"]) {
    const mine = SMP.filter(p => p.ch === ch); if (!mine.length) continue;
    const start = mine.reduce((m, p) => p.date < m ? p.date : m, "9999");
    const old = S.POSTS.filter(p => p.ch === ch && p.date >= start && p.date > ARCHIVE_END);
    for (const p of mine) {
      const hit = old.find(o => o.date === p.date && o.person && p.text.toLowerCase().includes(lastName(o.person)));
      if (hit) { p.person = hit.person; p.company = hit.company || p.company; p.series = hit.series || ""; p.client = hit.client || ""; }
    }
    S.POSTS = S.POSTS.filter(p => !(p.ch === ch && p.date >= start && p.date > ARCHIVE_END)).concat(mine.filter(p => p.date > ARCHIVE_END));
  }
  S.POSTS.sort((a, b) => a.date < b.date ? 1 : -1);
  S.SM = sm.meta || null;
}

async function load() {
  const [daily, creative, flat, comp] = await Promise.all(["Daily Pulse", "Creative", "Flat Feed", "Competitors"].map(n => readTab(n).catch(e => n === "Competitors" ? [] : Promise.reject(e))));
  const DAILY = buildDaily(daily);
  if (!DAILY.length) throw new Error("the Daily Pulse tab had no dated rows");
  const asOf = DAILY.filter(d => d.li_org != null).at(-1).date;
  const POSTS = mergePosts(ARCHIVE_POSTS, buildCreativePosts(creative, asOf));
  const F = buildFlat(flat);
  const S = { DAILY, POSTS, YT: buildYouTube(F), GA: buildGA(F) };
  const [liDaily, liPosts, igPosts, ig28, yt, ytm, totals, meta] = await Promise.all(["li_daily.csv", "li_posts.csv", "ig_posts.csv", "ig_28d.csv", "yt_daily.csv", "yt_monthly.csv", "totals.csv"].map(readSM)
    .concat(fetch(`data/sm/meta.json?t=${Date.now()}`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null)));
  applySM(S, { liDaily, liPosts, igPosts, ig28, yt, ytm, totals, meta });
  S.MO = buildMonths(S.DAILY, S.POSTS);
  S.COMP = buildCompetitors(comp);
  return S;
}

window.ATMDaily = { load, personFromLinkedIn, personFromInstagram, CAD, addDays, daysIn, prevMonth, monthName, monthShort, mdy, longDate, slash, fmt, full, sign, esc, median, mean, round, igMonthEnds, windowTotals, buildBench };
})();
