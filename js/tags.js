/* Series and board tagging shared by the Overview callouts (glance.js) and the Briefings (briefings.js).
   window.ATMTags: SERIES, seriesOf(post), boardTagger(rows, companies). */
(function () {
const { addDays } = window.ATMDaily;
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// ATM's defined series (Hannah, Oct 27). Moment Maker, client series, the Awards, Moments That Matter and Events are programs, not series.
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
// ATM Kitchen board tags (data/board_tags.csv, approved Oct 31). A post is matched to its board item by the post link the audit
// found, or else by live date (within a day) and the guest's surname in the item name. A firm match sets the post's series and partner.
function boardKey(p) { return p.ch === 'Instagram' ? (p.url ? 'ig:' + p.url.split('?')[0].replace(/\/?$/, '/') : '') : (p.id || ''); }
function boardTagger(rows, companies) {
  const byKey = new Map(), byDate = new Map();
  for (const r of rows) {
    for (const k of (r.posts || '').split(' ').filter(Boolean)) { const o = byKey.get(k); if (!o || (o.match !== 'exact' && r.match === 'exact')) byKey.set(k, r); }
    if (r.date) (byDate.get(r.date) || byDate.set(r.date, []).get(r.date)).push(r);
  }
  const byName = new Map(); for (const c of companies) { if (!byName.has(norm(c.partner))) byName.set(norm(c.partner), c); byName.set(norm(c.name), c); }
  return p => {
    let b = byKey.get(boardKey(p)), firm = b && b.match === 'exact';
    if (!b && p.person) {
      const sur = p.person.trim().split(/\s+/).at(-1).toLowerCase();
      if (sur.length >= 3) {
        const near = [-1, 0, 1].flatMap(d => byDate.get(addDays(p.date, d)) || []).filter(r => r.item.toLowerCase().includes(sur));
        if (new Set(near.map(r => r.item_id)).size === 1) { b = near[0]; firm = true; }
      }
    }
    if (!b) return {};
    const out = { boardItem: b.item, programs: (b.programs || '').split(';').filter(Boolean) };
    if (firm) out.seriesName = b.series; else if (b.series && !seriesOf(p)) out.seriesName = b.series;
    if (b.partner && firm) {
      const c = byName.get(norm(b.partner));
      if (!(c && c.industry === 'ATM')) { out.partners = [c ? c.partner : b.partner]; out.industry = c ? c.industry : ''; }
    }
    return out;
  };
}
window.ATMTags = { SERIES, seriesOf, boardTagger, boardKey };
})();
