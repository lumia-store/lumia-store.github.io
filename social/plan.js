/**
 * LUMIA social robot — the content calendar and product choice (no network, easy to test).
 *
 * One post a day, posted at 8:30 PM Cairo time after Mina approves it in the app.
 * Each weekday has its own kind of post so the page feels planned, not repetitive.
 */
const TZ = 'Africa/Cairo';
const POST_HOUR = 20, POST_MIN = 30;

/* Sunday = 0 … Saturday = 6 (Cairo calendar) */
const WEEK = {
  6: { type: 'spotlight', title: 'Product spotlight' },
  0: { type: 'guide', title: 'Care guide (carousel)' },
  1: { type: 'routine', title: 'Routine (carousel)' },
  2: { type: 'reel', title: 'Reel' },
  3: { type: 'compare', title: 'Which one suits you?' },
  4: { type: 'offer', title: 'Offer / weekend pick' },
  5: { type: 'trust', title: 'Why LUMIA' }
};

/* Occasions people in Egypt shop for. Moving Islamic dates are approximate (± 1 day), so the robot only says
   "قرب/بمناسبة" in the days before, never a promise on an exact day. */
const OCCASIONS = [
  { md: '01-01', days: 3, ar: 'بداية العام الجديد', en: 'New Year' },
  { md: '01-07', days: 3, ar: 'عيد الميلاد المجيد', en: 'Coptic Christmas' },
  { md: '02-14', days: 5, ar: 'عيد الحب', en: "Valentine's Day" },
  { md: '03-21', days: 7, ar: 'عيد الأم', en: "Mother's Day" },
  { md: '12-25', days: 3, ar: 'الكريسماس', en: 'Christmas' },
  { date: '2026-11-27', days: 6, ar: 'الجمعة البيضاء', en: 'White Friday' },
  { date: '2027-11-26', days: 6, ar: 'الجمعة البيضاء', en: 'White Friday' },
  { date: '2027-02-08', days: 5, ar: 'شهر رمضان', en: 'Ramadan' },
  { date: '2027-03-10', days: 6, ar: 'عيد الفطر', en: 'Eid al-Fitr' },
  { date: '2027-05-16', days: 6, ar: 'عيد الأضحى', en: 'Eid al-Adha' },
  { date: '2028-01-28', days: 5, ar: 'شهر رمضان', en: 'Ramadan' },
  { date: '2028-02-26', days: 6, ar: 'عيد الفطر', en: 'Eid al-Fitr' }
];

/* ---------- Cairo dates ---------- */
function cairoParts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const o = {}; for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return { date: `${o.year}-${o.month}-${o.day}`, hour: +o.hour, minute: +o.minute, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday) };
}
const addDays = (date, n) => { const t = new Date(date + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const weekdayOf = date => new Date(date + 'T12:00:00Z').getUTCDay();
/* the exact moment 8:30 PM Cairo on that date (Egypt has summer time, so the offset is worked out, not fixed) */
function postAtOf(date) {
  const guess = Date.parse(`${date}T${String(POST_HOUR).padStart(2, '0')}:${String(POST_MIN).padStart(2, '0')}:00Z`);
  for (const off of [2, 3]) {
    const t = guess - off * 3600e3, p = cairoParts(new Date(t));
    if (p.date === date && p.hour === POST_HOUR && p.minute === POST_MIN) return new Date(t).toISOString();
  }
  return new Date(guess - 2 * 3600e3).toISOString();
}
function occasionFor(date) {
  const y = +date.slice(0, 4);
  for (const o of OCCASIONS) {
    const target = o.date || `${y}-${o.md}`;
    const diff = (Date.parse(target + 'T12:00:00Z') - Date.parse(date + 'T12:00:00Z')) / 864e5;
    if (diff >= 0 && diff <= o.days) return { ar: o.ar, en: o.en, inDays: diff };
  }
  return null;
}

/* ---------- products ---------- */
const availOf = p => p.stock > 0 ? 'in' : (p.incoming > 0 || p.preorder) ? 'pre' : 'out';
const hasOffer = p => +p.was > +p.price;
const slugOf = v => String(v || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').toLowerCase()
  .replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
const pageOf = (siteUrl, p) => `${siteUrl}p/${slugOf(p.name)}-${String(p.id).slice(0, 5).toLowerCase()}/`;
const usable = p => p && p.id && p.image && +p.price > 0 && availOf(p) !== 'out' && (p.description || (p.features || []).length);

/* how recently each product was used in a post (from the queue), so the same product does not come back for 45 days */
function lastUsed(queue) {
  const m = {};
  for (const it of queue.items || []) if (it.status !== 'skipped') for (const id of it.products || []) m[id] = Math.max(m[id] || 0, Date.parse(it.date));
  return m;
}
function score(p, used, today, salt) {
  let s = 0;
  if (availOf(p) === 'in') s += 30;
  if (hasOffer(p)) s += 12;
  if ((p.images || []).length > 2) s += 4;
  if (BEAUTY.test(p.category || '')) s += 8;   // skin, hair and make-up are what people come to the page for
  const last = used[p.id];
  if (last) { const days = (Date.parse(today) - last) / 864e5; s -= days < 45 ? 100 - days : 0; }
  // stable little shuffle per day, so ties change from day to day
  let h = 0; for (const c of p.id + salt) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return s + (h % 1000) / 100;
}
function ranked(products, queue, date, filter = () => true) {
  const used = lastUsed(queue);
  return products.filter(usable).filter(filter).map(p => [score(p, used, date, date), p]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
}
const SKIN = /بشرة|وجه|البشرة/;
const BEAUTY = /بشرة|وجه|شعر|مكياج|المكياج|جسم|عطور|شمس/;

/* ---------- the plan for one day ---------- */
function planDay(data, queue, date) {
  const wd = weekdayOf(date), base = WEEK[wd], occ = occasionFor(date);
  const ps = data.products || [];
  let type = base.type, products = [];
  const top = f => ranked(ps, queue, date, f);
  if (type === 'spotlight') products = top().slice(0, 1);
  if (type === 'offer') { const o = top(hasOffer); products = (o.length ? o : top(p => availOf(p) === 'in')).slice(0, 1); }
  if (type === 'reel') products = top(p => availOf(p) === 'in' && (p.images || []).length >= 2).slice(0, 1);
  if (type === 'guide' || type === 'compare' || type === 'routine') {
    // products from one category that go together (skin care first: it is what people ask about most)
    const cats = {};
    for (const p of top()) (cats[p.category] = cats[p.category] || []).push(p);
    const order = Object.entries(cats).sort((a, b) => (SKIN.test(b[0]) - SKIN.test(a[0])) || b[1].length - a[1].length);
    const want = type === 'compare' ? 2 : 3;
    const pick = order.find(([, l]) => l.length >= want);
    // up to 8 related products; the AI picks the ones that really belong together (and says why)
    products = pick ? pick[1].slice(0, 8) : top().slice(0, want);
  }
  if (type === 'trust') products = top(p => availOf(p) === 'in').slice(0, 3);
  if (!products.length && type !== 'trust') { type = 'spotlight'; products = top().slice(0, 1); }
  return {
    id: `${date}-${type}`, date, postAt: postAtOf(date), type, title: (WEEK[Object.keys(WEEK).find(k => WEEK[k].type === type)] || base).title,
    occasion: occ, products: products.map(p => p.id), pick: type === 'compare' ? 2 : type === 'guide' || type === 'routine' ? 3 : 0,
    snapshot: Object.fromEntries(products.map(p => [p.id, { price: +p.price, was: +p.was || 0, avail: availOf(p) }]))
  };
}

/* the week's ad suggestion: one product that is in stock, photographs well and ideally has an offer */
function planAd(data, queue, date) {
  const used = {};
  for (const it of queue.items || []) if (it.type === 'ad' && it.status !== 'skipped') for (const id of it.products || []) used[id] = Date.parse(it.date);
  const list = (data.products || []).filter(usable).filter(p => availOf(p) === 'in' && +p.stock >= 2)
    .map(p => [(hasOffer(p) ? 20 : 0) + ((p.images || []).length > 2 ? 5 : 0) + Math.min(+p.stock, 10) - (used[p.id] && Date.parse(date) - used[p.id] < 28 * 864e5 ? 100 : 0), p])
    .sort((a, b) => b[0] - a[0]);
  if (!list.length) return null;
  const p = list[0][1];
  const why = [`in stock (${p.stock})`, hasOffer(p) ? `on offer ${p.price} instead of ${p.was} EGP` : '', (p.images || []).length > 2 ? 'good photos' : ''].filter(Boolean).join(', ');
  return { id: `ad-${date}`, date, type: 'ad', title: 'Ad suggestion for this week', products: [p.id], reason: why, snapshot: { [p.id]: { price: +p.price, was: +p.was || 0, avail: 'in' } } };
}

module.exports = { TZ, WEEK, OCCASIONS, cairoParts, addDays, weekdayOf, postAtOf, occasionFor, availOf, hasOffer, pageOf, slugOf, usable, planDay, planAd, ranked };
