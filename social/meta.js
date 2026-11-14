/**
 * Meta (Facebook + Instagram) connection — shared by the social robot (posting) and the LUMIA Orders app (ads control).
 * Works in Node and in the phone's web view: pass fetchImpl.
 *
 * Money safety: every function that can spend money checks the hard limit here, in code — the app cannot set a
 * daily budget above MAX_DAILY_EGP, whatever is typed — and the app asks Mina to approve every spending change.
 */
const GRAPH = (typeof process !== 'undefined' && process.env && process.env.META_GRAPH_URL) || 'https://graph.facebook.com/v25.0';   // (tests point this at a fake Meta)
const MAX_DAILY_EGP = 50;
/* two kinds of ads: to the website's product page (default — no WhatsApp Business needed) or straight to a WhatsApp chat */
const KINDS = {
  website: { campaign: 'LUMIA · Website visits', adset: 'LUMIA · Egypt · Website' },
  whatsapp: { campaign: 'LUMIA · WhatsApp chats', adset: 'LUMIA · Egypt · WhatsApp' }
};
const NAMES = KINDS.whatsapp;   // (older name kept for compatibility)

/* Website ads with the Pixel = a "Sales" campaign that looks for buyers, not clicks (Nov 2026).
   One campaign budget (so the daily cap is exact), two audiences:
   - Returning: people who visited the site, added to the bag, or engaged with the Page / Instagram — and did not order.
   - New: women 20–45 in Egypt interested in skin care, cosmetics and beauty — not recent visitors, not customers.
   Meta is asked to find people who add to the bag; once the site has enough orders a week, people who order. */
const SALES = { campaign: 'LUMIA · Sales (website)', back: 'LUMIA · Returning visitors', fresh: 'LUMIA · New customers' };
const AUD = { visitors: 'LUMIA · Website visitors 30d', carts: 'LUMIA · Added to bag 30d', buyers: 'LUMIA · Ordered 180d', fb: 'LUMIA · Facebook engagers 90d', ig: 'LUMIA · Instagram engagers 90d' };
const INTERESTS = ['Skin care', 'Cosmetics', 'Beauty', 'Hair care', 'Personal care'];
const ORDERS_TO_SWITCH = 25;   // orders in 7 days before Meta optimises for orders instead of add-to-bag
const GOALS = { ADD_TO_CART: 'add to bag', PURCHASE: 'orders' };
const DAY = 86400;
const kindOf = d => d === 'whatsapp' ? 'whatsapp' : 'website';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fail(msg, extra) { const e = new Error(msg); e.userMessage = msg; Object.assign(e, extra || {}); throw e; }

/* explains Meta's error codes in plain words */
function explain(err, status) {
  const c = err && err.code, sub = err && err.error_subcode, m = (err && (err.error_user_msg || err.message)) || ('error ' + status);
  if (c === 190) return 'The Meta connection has expired or was removed. Connect Meta again in Settings → Social & Ads.';
  if (c === 10 || c === 200 || c === 3) return 'Meta did not allow this action: the connection is missing a permission. (' + m + ')';
  if (c === 4 || c === 17 || c === 32 || c === 613) return 'Meta asks to slow down. The robot will try again later.';
  if (c === 9 && sub === 2207042) return 'Instagram\'s daily posting limit is reached. It will post tomorrow.';
  if (c === 1487390 || /budget/i.test(m)) return 'Meta did not accept the budget: ' + m;
  return 'Meta: ' + m;
}

function client({ token, fetchImpl = fetch }) {
  if (!token) fail('Connect Meta first (Settings → Social & Ads).');
  async function call(method, path, params = {}, tok = token) {
    const url = new URL(GRAPH + path);
    let body;
    if (method === 'GET') { for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v)); url.searchParams.set('access_token', tok); }
    else { body = new URLSearchParams(); for (const [k, v] of Object.entries(params)) body.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v)); body.set('access_token', tok); }
    for (let attempt = 0; attempt < 3; attempt++) {
      let res, json;
      try { res = await fetchImpl(url.toString(), { method, body, headers: body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined }); json = await res.json().catch(() => ({})); }
      catch (e) { if (attempt < 2) { await sleep(2000 * (attempt + 1)); continue; } fail('Meta could not be reached. Check the internet connection.'); }
      if (res.ok && !json.error) return json;
      const err = json.error || {};
      if ((res.status >= 500 || err.is_transient) && attempt < 2) { await sleep(3000 * (attempt + 1)); continue; }
      fail(explain(err, res.status), { meta: err });
    }
  }
  return { call, get: (p, q, t) => call('GET', p, q, t), post: (p, q, t) => call('POST', p, q, t) };
}

/* ---------------- connection check (app → Settings) ---------------- */
async function discover({ token, fetchImpl }) {
  const g = client({ token, fetchImpl });
  const me = await g.get('/me', { fields: 'id,name' });
  const pages = (await g.get('/me/accounts', { fields: 'id,name,instagram_business_account{id,username},access_token', limit: 50 })).data || [];
  let ads = [];
  try { ads = (await g.get('/me/adaccounts', { fields: 'id,name,currency,account_status,spend_cap,amount_spent', limit: 50 })).data || []; } catch (e) { /* no ads permission yet */ }
  return {
    user: me, pages: pages.map(p => ({ id: p.id, name: p.name, ig: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username } : null })),
    adAccounts: ads.map(a => ({ id: a.id, name: a.name, currency: a.currency, status: a.account_status, spendCap: +a.spend_cap / 100 || 0, spent: +a.amount_spent / 100 || 0 }))
  };
}

/* ---------------- posting (robot) ---------------- */
async function pageToken(g, pageId) {
  const r = await g.get('/' + pageId, { fields: 'access_token' });
  return r.access_token || null;
}

/* Facebook: one photo, several photos (album post), or a video */
async function postFacebook({ token, fetchImpl, pageId, images = [], video, message }) {
  const g = client({ token, fetchImpl }), pt = (await pageToken(g, pageId)) || token;
  if (video) { const r = await g.post(`/${pageId}/videos`, { file_url: video, description: message }, pt); return { id: r.id }; }
  if (images.length === 1) { const r = await g.post(`/${pageId}/photos`, { url: images[0], message }, pt); return { id: r.post_id || r.id }; }
  const ids = [];
  for (const url of images) ids.push((await g.post(`/${pageId}/photos`, { url, published: false }, pt)).id);
  const r = await g.post(`/${pageId}/feed`, { message, attached_media: ids.map(id => ({ media_fbid: id })) }, pt);
  return { id: r.id };
}
async function storyFacebook({ token, fetchImpl, pageId, image }) {
  const g = client({ token, fetchImpl }), pt = (await pageToken(g, pageId)) || token;
  const photo = await g.post(`/${pageId}/photos`, { url: image, published: false }, pt);
  const r = await g.post(`/${pageId}/photo_stories`, { photo_id: photo.id }, pt);
  return { id: r.post_id || r.id };
}

/* Instagram: containers → wait until ready → publish */
async function waitReady(g, id, maxMs = 5 * 60e3) {
  const t0 = Date.now();
  for (;;) {
    const r = await g.get('/' + id, { fields: 'status_code,status' });
    if (r.status_code === 'FINISHED' || !r.status_code) return;
    if (r.status_code === 'ERROR' || r.status_code === 'EXPIRED') fail('Instagram could not process the media: ' + (r.status || r.status_code));
    if (Date.now() - t0 > maxMs) fail('Instagram took too long to process the video.');
    await sleep(5000);
  }
}
async function postInstagram({ token, fetchImpl, igId, images = [], video, cover, caption, story }) {
  const g = client({ token, fetchImpl });
  let creation;
  if (story) { creation = (await g.post(`/${igId}/media`, { image_url: story, media_type: 'STORIES' })).id; }
  else if (video) { creation = (await g.post(`/${igId}/media`, { media_type: 'REELS', video_url: video, cover_url: cover || '', caption, share_to_feed: true })).id; }
  else if (images.length === 1) { creation = (await g.post(`/${igId}/media`, { image_url: images[0], caption })).id; }
  else {
    const kids = [];
    for (const url of images.slice(0, 10)) kids.push((await g.post(`/${igId}/media`, { image_url: url, is_carousel_item: true })).id);
    for (const k of kids) await waitReady(g, k);
    creation = (await g.post(`/${igId}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption })).id;
  }
  await waitReady(g, creation, video ? 10 * 60e3 : 2 * 60e3);
  const r = await g.post(`/${igId}/media_publish`, { creation_id: creation });
  return { id: r.id };
}

/* ---------------- ads (app) ---------------- */
const act = id => 'act_' + String(id || '').replace(/^act_/, '');
const minor = egp => Math.round(egp * 100);   // Meta counts money in the smallest unit (piasters)

function checkBudget(egp) {
  egp = Number(egp);
  if (!Number.isFinite(egp) || egp <= 0) fail('Enter a daily budget in EGP.');
  if (egp > MAX_DAILY_EGP) fail(`The daily budget can't be more than ${MAX_DAILY_EGP} EGP. This limit is built into the app.`);
  return Math.round(egp);
}

async function account(g, adAccount) {
  const a = await g.get('/' + act(adAccount), { fields: 'id,name,currency,account_status,spend_cap,amount_spent,timezone_name' });
  if (a.currency !== 'EGP') fail(`This ad account uses ${a.currency}. The app only runs ads on an ad account in Egyptian pounds (EGP), so the 50 EGP limit stays exact.`);
  return a;
}
async function findOurs(g, adAccount, dest) {
  const K = KINDS[kindOf(dest)];
  const camps = (await g.get(`/${act(adAccount)}/campaigns`, { fields: 'id,name,status,effective_status', limit: 50 })).data || [];
  const c = camps.find(x => x.name === K.campaign && x.status !== 'DELETED' && x.status !== 'ARCHIVED');
  if (!c) return { campaign: null, adset: null, ads: [] };
  const sets = (await g.get(`/${c.id}/adsets`, { fields: 'id,name,status,daily_budget,effective_status', limit: 50 })).data || [];
  const s = sets.find(x => x.name === K.adset) || sets[0] || null;
  const ads = s ? ((await g.get(`/${s.id}/ads`, { fields: 'id,name,status,effective_status,creative{id,thumbnail_url}', limit: 50 })).data || []) : [];
  return { campaign: c, adset: s, ads };
}

/* everything the Ads panel shows */
async function adsStatus({ token, fetchImpl, adAccount, dest, pixelId }) {
  const g = client({ token, fetchImpl });
  if (kindOf(dest) === 'website' && pixelId) {
    const a = await account(g, adAccount), st = await salesStatus(g, adAccount, pixelId);
    return Object.assign(st, { account: { id: a.id, name: a.name, status: a.account_status, spendCap: +a.spend_cap / 100 || 0, spent: +a.amount_spent / 100 || 0 }, dest: 'website', maxDaily: MAX_DAILY_EGP,
      costPerClick: st.week.clicks ? +(st.week.spend / st.week.clicks).toFixed(1) : 0 });
  }
  const a = await account(g, adAccount), ours = await findOurs(g, adAccount, dest);
  let week = { spend: 0, chats: 0, clicks: 0, reach: 0, visits: 0, orders: 0 };
  if (ours.campaign) {
    const ins = ((await g.get(`/${ours.campaign.id}/insights`, { date_preset: 'last_7d', fields: 'spend,reach,clicks,inline_link_clicks,actions' })).data || [])[0];
    if (ins) {
      const n = re => (ins.actions || []).filter(x => re.test(x.action_type)).reduce((m, x) => Math.max(m, +x.value || 0), 0);
      week = { spend: +ins.spend || 0, chats: n(/messaging_conversation_started/), clicks: +ins.inline_link_clicks || +ins.clicks || 0, reach: +ins.reach || 0,
        visits: n(/^landing_page_view$/), orders: n(/(fb_pixel_contact|^contact$|onsite_web_contact)/) };
    }
  }
  const live = ours.ads.find(x => x.status === 'ACTIVE');
  return {
    account: { id: a.id, name: a.name, status: a.account_status, spendCap: +a.spend_cap / 100 || 0, spent: +a.amount_spent / 100 || 0 },
    running: !!(ours.campaign && ours.campaign.status === 'ACTIVE' && ours.adset && ours.adset.status === 'ACTIVE' && live),
    dailyBudget: ours.adset ? +ours.adset.daily_budget / 100 : 0,
    ad: live ? { id: live.id, name: live.name, thumb: live.creative && live.creative.thumbnail_url, review: live.effective_status } : null,
    dest: kindOf(dest), week, maxDaily: MAX_DAILY_EGP,
    costPerChat: week.chats ? Math.round(week.spend / week.chats) : 0,
    costPerClick: week.clicks ? +(week.spend / week.clicks).toFixed(1) : 0,
    costPerOrder: week.orders ? Math.round(week.spend / week.orders) : 0
  };
}

/* creates (or reuses) the campaign + ad set, PAUSED; nothing spends until startAds() */
async function ensureSetup(g, { adAccount, pageId, budget, dest, pixelId }) {
  const k = kindOf(dest), K = KINDS[k];
  let ours = await findOurs(g, adAccount, k);
  if (!ours.campaign) {
    const c = await g.post(`/${act(adAccount)}/campaigns`, { name: K.campaign, objective: k === 'website' ? 'OUTCOME_TRAFFIC' : 'OUTCOME_ENGAGEMENT', status: 'PAUSED', special_ad_categories: [], is_adset_budget_sharing_enabled: false });
    ours.campaign = { id: c.id, status: 'PAUSED' };
  }
  if (!ours.adset) {
    const common = { name: K.adset, campaign_id: ours.campaign.id, status: 'PAUSED', daily_budget: minor(checkBudget(budget)), billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: { geo_locations: { countries: ['EG'] }, age_min: 18, age_max: 60, targeting_automation: { advantage_audience: 1 } } };
    const s = await g.post(`/${act(adAccount)}/adsets`, k === 'website'
      // with the Pixel, Meta looks for people who actually open the page; without it, for people who click
      ? Object.assign(common, { optimization_goal: pixelId ? 'LANDING_PAGE_VIEWS' : 'LINK_CLICKS', destination_type: 'WEBSITE' })
      : Object.assign(common, { optimization_goal: 'CONVERSATIONS', destination_type: 'WHATSAPP', promoted_object: { page_id: pageId } }));
    ours.adset = { id: s.id, status: 'PAUSED', daily_budget: minor(budget) };
  }
  return ours;
}

/* ---------- Sales campaign (website + Pixel) ---------- */
const pixelRule = (pixelId, days, event) => JSON.stringify({ inclusions: { operator: 'or', rules: [{ event_sources: [{ id: String(pixelId), type: 'pixel' }], retention_seconds: days * DAY,
  filter: event ? { operator: 'and', filters: [{ field: 'event', operator: 'eq', value: event }] } : { operator: 'and', filters: [{ field: 'url', operator: 'i_contains', value: '' }] } }] } });
const engageRule = (id, type, value) => JSON.stringify({ inclusions: { operator: 'or', rules: [{ event_sources: [{ id: String(id), type }], retention_seconds: 90 * DAY,
  filter: { operator: 'and', filters: [{ field: 'event', operator: 'eq', value }] } }] } });

/* the audiences the ads use; made once, Meta keeps them filled. Any that Meta refuses (e.g. terms not accepted yet) are skipped. */
async function ensureAudiences(g, { adAccount, pixelId, pageId, igId }) {
  const have = {}, notes = [];
  for (const a of (await g.get(`/${act(adAccount)}/customaudiences`, { fields: 'id,name,approximate_count_lower_bound', limit: 100 })).data || []) have[a.name] = a;
  const want = [[AUD.visitors, pixelRule(pixelId, 30)], [AUD.carts, pixelRule(pixelId, 30, 'AddToCart')], [AUD.buyers, pixelRule(pixelId, 180, 'Purchase')]];
  if (pageId) want.push([AUD.fb, engageRule(pageId, 'page', 'page_engaged')]);
  if (igId) want.push([AUD.ig, engageRule(igId, 'ig_business', 'ig_business_profile_all')]);
  for (const [name, rule] of want) {
    if (have[name]) continue;
    try { const r = await g.post(`/${act(adAccount)}/customaudiences`, { name, rule, prefill: true }); have[name] = { id: r.id, name, approximate_count_lower_bound: 0 }; }
    catch (e) { notes.push(name.replace('LUMIA · ', '') + ': ' + (e.userMessage || e.message)); }
  }
  const id = n => have[n] && have[n].id;
  return { visitors: id(AUD.visitors), carts: id(AUD.carts), buyers: id(AUD.buyers), fb: id(AUD.fb), ig: id(AUD.ig), sizes: Object.fromEntries(Object.values(AUD).filter(n => have[n]).map(n => [n.replace('LUMIA · ', ''), +have[n].approximate_count_lower_bound || 0])), notes };
}
async function interestIds(g) {
  const out = [];
  for (const q of INTERESTS) {
    try { const r = ((await g.get('/search', { type: 'adinterest', q, limit: 1 })).data || [])[0]; if (r && r.id && !out.some(x => x.id === r.id)) out.push({ id: r.id, name: r.name }); } catch (e) { /* skip one */ }
  }
  return out;
}
/* orders the Pixel saw in the last 7 days (to decide when Meta should look for buyers directly) */
async function ordersLastWeek(g, pixelId) {
  try {
    const r = await g.get(`/${pixelId}/stats`, { aggregation: 'event', start_time: Math.floor(Date.now() / 1000) - 7 * DAY });
    let n = 0; for (const b of r.data || []) for (const x of b.data || []) if (x.value === 'Purchase') n += +x.count || 0;
    return n;
  } catch (e) { return 0; }
}
function salesTargeting(kind, aud, interests) {
  const base = { geo_locations: { countries: ['EG'] }, targeting_automation: { advantage_audience: 0 } };
  const excl = [aud.buyers].filter(Boolean).map(id => ({ id }));
  if (kind === 'back') {
    const inc = [aud.visitors, aud.carts, aud.fb, aud.ig].filter(Boolean).map(id => ({ id }));
    return inc.length ? Object.assign(base, { age_min: 18, age_max: 65, custom_audiences: inc, excluded_custom_audiences: excl }) : null;
  }
  return Object.assign(base, { age_min: 20, age_max: 45, genders: [2],
    excluded_custom_audiences: excl.concat([aud.visitors].filter(Boolean).map(id => ({ id }))),
    ...(interests.length ? { flexible_spec: [{ interests }] } : {}) });
}
async function findSales(g, adAccount) {
  const camps = (await g.get(`/${act(adAccount)}/campaigns`, { fields: 'id,name,status,effective_status,daily_budget', limit: 50 })).data || [];
  const c = camps.find(x => x.name === SALES.campaign && x.status !== 'DELETED' && x.status !== 'ARCHIVED');
  if (!c) return { campaign: null, sets: [] };
  const sets = ((await g.get(`/${c.id}/adsets`, { fields: 'id,name,status,effective_status,promoted_object', limit: 50 })).data || []).filter(x => x.status !== 'DELETED' && x.status !== 'ARCHIVED');
  for (const s of sets) s.ads = ((await g.get(`/${s.id}/ads`, { fields: 'id,name,status,effective_status,creative{id,thumbnail_url}', limit: 50 })).data || [])
    .sort((x, y) => String(y.id).localeCompare(String(x.id), undefined, { numeric: true }));   // newest first (Meta ids grow)
  return { campaign: c, sets };
}
const setName = (kind, goal) => `${kind === 'back' ? SALES.back : SALES.fresh} · ${GOALS[goal]}`;
/* campaign (PAUSED until startAds) + the two audiences for the current goal; nothing spends until startAds() */
async function ensureSales(g, { adAccount, pageId, igId, budget, pixelId }) {
  let ours = await findSales(g, adAccount);
  if (!ours.campaign) {
    const c = await g.post(`/${act(adAccount)}/campaigns`, { name: SALES.campaign, objective: 'OUTCOME_SALES', status: 'PAUSED', special_ad_categories: [],
      daily_budget: minor(checkBudget(budget)), bid_strategy: 'LOWEST_COST_WITHOUT_CAP' });
    ours = { campaign: { id: c.id, name: SALES.campaign, status: 'PAUSED' }, sets: [] };
  }
  const aud = await ensureAudiences(g, { adAccount, pixelId, pageId, igId });
  const orders = await ordersLastWeek(g, pixelId), goal = orders >= ORDERS_TO_SWITCH ? 'PURCHASE' : 'ADD_TO_CART';
  let interests = null;
  const current = [];
  for (const kind of ['back', 'fresh']) {
    const name = setName(kind, goal);
    let s = ours.sets.find(x => x.name === name);
    if (!s) {
      if (kind === 'fresh' && !interests) interests = await interestIds(g);
      const targeting = salesTargeting(kind, aud, interests || []);
      if (!targeting) continue;   // no returning audience yet
      const r = await g.post(`/${act(adAccount)}/adsets`, { name, campaign_id: ours.campaign.id, status: 'PAUSED', billing_event: 'IMPRESSIONS', optimization_goal: 'OFFSITE_CONVERSIONS',
        promoted_object: { pixel_id: String(pixelId), custom_event_type: goal }, destination_type: 'WEBSITE', targeting });
      s = { id: r.id, name, status: 'PAUSED', ads: [] }; ours.sets.push(s);
    }
    current.push(s);
  }
  const old = ours.sets.filter(x => !current.includes(x));
  return { campaign: ours.campaign, current, old, goal, orders, aud };
}
/* the newest ad's creative goes into every current audience (also after the goal switched) */
async function fillSets(g, adAccount, sales, live) {
  const all = sales.current.concat(sales.old).flatMap(s => s.ads || []);
  const newest = all.filter(a => a.creative && a.creative.id).sort((a, b) => String(b.id).localeCompare(String(a.id), undefined, { numeric: true }))[0];
  if (!newest) return;
  for (const s of sales.current) {
    if ((s.ads || []).some(a => a.creative && a.creative.id === newest.creative.id)) continue;
    const r = await g.post(`/${act(adAccount)}/ads`, { name: newest.name, adset_id: s.id, creative: { creative_id: newest.creative.id }, status: live ? 'ACTIVE' : 'PAUSED' });
    (s.ads = s.ads || []).unshift({ id: r.id, name: newest.name, status: live ? 'ACTIVE' : 'PAUSED', creative: { id: newest.creative.id } });
  }
}
const n = (ins, re) => ((ins && ins.actions) || []).filter(x => re.test(x.action_type)).reduce((m, x) => Math.max(m, +x.value || 0), 0);
const PURCHASE = /^(offsite_conversion\.fb_pixel_purchase|purchase|omni_purchase)$/, CART = /^(offsite_conversion\.fb_pixel_add_to_cart|add_to_cart|omni_add_to_cart)$/;
async function salesStatus(g, adAccount, pixelId) {
  const sales = await findSales(g, adAccount);
  const out = { mode: 'sales', running: false, dailyBudget: 0, goal: null, ordersToSwitch: ORDERS_TO_SWITCH, week: { spend: 0, clicks: 0, reach: 0, visits: 0, carts: 0, orders: 0 }, groups: [], ads: [], ad: null };
  if (!sales.campaign) return out;
  out.dailyBudget = +sales.campaign.daily_budget / 100 || 0;
  const liveSets = sales.sets.filter(s => s.status === 'ACTIVE');
  out.running = sales.campaign.status === 'ACTIVE' && liveSets.some(s => (s.ads || []).some(a => a.status === 'ACTIVE'));
  const goalSet = liveSets[0] || sales.sets[sales.sets.length - 1];
  out.goal = goalSet && goalSet.promoted_object ? GOALS[goalSet.promoted_object.custom_event_type] || null : null;
  const live = sales.sets.flatMap(s => s.ads || []).find(a => a.status === 'ACTIVE');
  if (live) out.ad = { id: live.id, name: live.name, thumb: live.creative && live.creative.thumbnail_url, review: live.effective_status };
  const ins = ((await g.get(`/${sales.campaign.id}/insights`, { date_preset: 'last_7d', fields: 'spend,reach,clicks,inline_link_clicks,actions' })).data || [])[0];
  if (ins) out.week = { spend: +ins.spend || 0, reach: +ins.reach || 0, clicks: +ins.inline_link_clicks || +ins.clicks || 0, visits: n(ins, /^landing_page_view$/), carts: n(ins, CART), orders: n(ins, PURCHASE) };
  const per = async level => ((await g.get(`/${sales.campaign.id}/insights`, { date_preset: 'last_7d', level, fields: `${level}_name,spend,inline_link_clicks,actions`, limit: 50 })).data || []);
  try {
    const sum = new Map();
    for (const r of await per('adset')) {   // "· add to bag" / "· orders" versions of the same audience add up
      const k = /Returning/.test(r.adset_name) ? 'Returning visitors' : 'New customers';
      const o = sum.get(k) || { name: k, spend: 0, carts: 0, orders: 0 }; o.spend += +r.spend || 0; o.carts += n(r, CART); o.orders += n(r, PURCHASE); sum.set(k, o);
    }
    out.groups = [...sum.values()].map(o => Object.assign(o, { costPerOrder: o.orders ? Math.round(o.spend / o.orders) : 0 }));
    const byAd = new Map();
    for (const r of await per('ad')) { const o = byAd.get(r.ad_name) || { name: r.ad_name, spend: 0, carts: 0, orders: 0 }; o.spend += +r.spend || 0; o.carts += n(r, CART); o.orders += n(r, PURCHASE); byAd.set(r.ad_name, o); }
    out.ads = [...byAd.values()].sort((a, b) => b.orders - a.orders || b.carts - a.carts || b.spend - a.spend).slice(0, 5)
      .map(o => Object.assign(o, { costPerOrder: o.orders ? Math.round(o.spend / o.orders) : 0 }));
  } catch (e) { /* breakdowns are a bonus */ }
  out.costPerOrder = out.week.orders ? Math.round(out.week.spend / out.week.orders) : 0;
  out.costPerCart = out.week.carts ? Math.round(out.week.spend / out.week.carts) : 0;
  out.ordersSeen = await ordersLastWeek(g, pixelId);
  return out;
}

/* the website's Meta Pixel: reuses the ad account's pixel or creates one called "LUMIA website" */
async function ensurePixel({ token, fetchImpl, adAccount }) {
  const g = client({ token, fetchImpl });
  const list = (await g.get(`/${act(adAccount)}/adspixels`, { fields: 'id,name', limit: 25 })).data || [];
  if (list.length) return { pixelId: list[0].id, name: list[0].name, created: false };
  const r = await g.post(`/${act(adAccount)}/adspixels`, { name: 'LUMIA website' });
  return { pixelId: r.id, name: 'LUMIA website', created: true };
}

/* new ad for a product (after Mina approves the suggestion). The old ad is paused, the new one waits for startAds(). */
async function createProductAd({ token, fetchImpl, adAccount, pageId, igId, budget, product, imageUrl, text, headline, dest, link, pixelId }) {
  const g = client({ token, fetchImpl }), k = kindOf(dest);
  await account(g, adAccount);
  if (k === 'website' && !/^https:\/\//.test(String(link || ''))) fail('This ad has no product link.');
  const url = k === 'website' ? link + (link.includes('?') ? '&' : '?') + 'utm_source=meta&utm_medium=paid&utm_campaign=lumia&utm_content=' + encodeURIComponent(String(product.id || '').slice(0, 40)) : '';
  if (k === 'website' && pixelId) {   // Sales campaign: the same ad goes to both audiences
    const sales = await ensureSales(g, { adAccount, pageId, igId, budget, pixelId });
    const spec = { page_id: pageId, link_data: { picture: imageUrl, link: url, message: text, name: headline, call_to_action: { type: 'SHOP_NOW', value: { link: url } } } };
    if (igId) spec.instagram_user_id = igId;
    const cr = await g.post(`/${act(adAccount)}/adcreatives`, { name: 'LUMIA · ' + product.name, object_story_spec: spec });
    const live = sales.campaign.status === 'ACTIVE';
    for (const s of sales.current) {
      for (const old of s.ads || []) if (old.status === 'ACTIVE') await g.post('/' + old.id, { status: 'PAUSED' });
      await g.post(`/${act(adAccount)}/ads`, { name: 'LUMIA · ' + product.name, adset_id: s.id, creative: { creative_id: cr.id }, status: live ? 'ACTIVE' : 'PAUSED' });
    }
    return { adId: cr.id, running: live, audiences: sales.current.length };
  }
  const ours = await ensureSetup(g, { adAccount, pageId, budget, dest: k, pixelId });
  const spec = { page_id: pageId, link_data: k === 'website'
    ? { picture: imageUrl, link: url, message: text, name: headline, call_to_action: { type: 'SHOP_NOW', value: { link: url } } }
    : { picture: imageUrl, link: 'https://api.whatsapp.com/send', message: text, name: headline, call_to_action: { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' } } } };
  if (igId) spec.instagram_user_id = igId;
  const cr = await g.post(`/${act(adAccount)}/adcreatives`, { name: 'LUMIA · ' + product.name, object_story_spec: spec });
  for (const old of ours.ads) if (old.status === 'ACTIVE') await g.post('/' + old.id, { status: 'PAUSED' });
  const live = ours.campaign.status === 'ACTIVE' && ours.adset.status === 'ACTIVE';
  const ad = await g.post(`/${act(adAccount)}/ads`, { name: 'LUMIA · ' + product.name, adset_id: ours.adset.id, creative: { creative_id: cr.id }, status: live ? 'ACTIVE' : 'PAUSED' });
  return { adId: ad.id, running: live };
}

async function startAds({ token, fetchImpl, adAccount, budget, dest, pageId, igId, pixelId }) {
  const g = client({ token, fetchImpl });
  const b = checkBudget(budget);
  if (kindOf(dest) === 'website' && pixelId) {
    for (const k of Object.keys(KINDS)) { const o = await findOurs(g, adAccount, k); if (o.campaign && o.campaign.status === 'ACTIVE') await g.post('/' + o.campaign.id, { status: 'PAUSED' }); }   // one campaign at a time: the cap stays exact
    const sales = await ensureSales(g, { adAccount, pageId, igId, budget: b, pixelId });
    await fillSets(g, adAccount, sales, false);
    if (!sales.current.some(s => (s.ads || []).length)) fail('There is no ad yet. Approve a product suggestion first.');
    for (const s of sales.old) if (s.status !== 'PAUSED') await g.post('/' + s.id, { status: 'PAUSED' });   // the previous goal
    for (const s of sales.current) {
      const newest = (s.ads || [])[0];
      for (const ad of s.ads || []) await g.post('/' + ad.id, { status: ad === newest ? 'ACTIVE' : 'PAUSED' });
      await g.post('/' + s.id, { status: 'ACTIVE' });
    }
    await g.post('/' + sales.campaign.id, { daily_budget: minor(b), status: 'ACTIVE' });
    return { running: true, dailyBudget: b, goal: GOALS[sales.goal], audiences: sales.current.length };
  }
  const ours = await findOurs(g, adAccount, dest);
  // only one kind runs at a time, so the daily total never exceeds the limit
  const other = await findOurs(g, adAccount, kindOf(dest) === 'website' ? 'whatsapp' : 'website');
  if (other.campaign && other.campaign.status === 'ACTIVE') await g.post('/' + other.campaign.id, { status: 'PAUSED' });
  const sl = await findSales(g, adAccount); if (sl.campaign && sl.campaign.status === 'ACTIVE') await g.post('/' + sl.campaign.id, { status: 'PAUSED' });
  if (!ours.campaign || !ours.adset || !ours.ads.length) fail('There is no ad yet. Approve a product suggestion first.');
  await g.post('/' + ours.adset.id, { daily_budget: minor(b), status: 'ACTIVE' });
  const newest = ours.ads[0];
  for (const ad of ours.ads) await g.post('/' + ad.id, { status: ad.id === newest.id || ad.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED' });
  await g.post('/' + ours.campaign.id, { status: 'ACTIVE' });
  return { running: true, dailyBudget: b };
}
async function setBudget({ token, fetchImpl, adAccount, budget, dest, pixelId }) {
  const g = client({ token, fetchImpl }), b = checkBudget(budget);
  if (kindOf(dest) === 'website' && pixelId) {
    const sl = await findSales(g, adAccount); if (!sl.campaign) fail('There is no ad yet.');
    await g.post('/' + sl.campaign.id, { daily_budget: minor(b) }); return { dailyBudget: b };
  }
  const ours = await findOurs(g, adAccount, dest);
  if (!ours.adset) fail('There is no ad yet.');
  await g.post('/' + ours.adset.id, { daily_budget: minor(b) });
  return { dailyBudget: b };
}
/* the big red button: pauses the whole campaign at once (no money is spent while paused) */
async function stopAds({ token, fetchImpl, adAccount }) {
  const g = client({ token, fetchImpl });
  for (const k of Object.keys(KINDS)) {   // both kinds, whatever is chosen now
    const ours = await findOurs(g, adAccount, k);
    if (ours.campaign) await g.post('/' + ours.campaign.id, { status: 'PAUSED' });
    if (ours.adset) await g.post('/' + ours.adset.id, { status: 'PAUSED' });
  }
  const sl = await findSales(g, adAccount);
  if (sl.campaign) await g.post('/' + sl.campaign.id, { status: 'PAUSED' });   // pausing the campaign stops every audience at once
  return { running: false };
}

module.exports = { GRAPH, MAX_DAILY_EGP, NAMES, KINDS, SALES, AUD, ORDERS_TO_SWITCH, ensurePixel, client, discover, postFacebook, storyFacebook, postInstagram, adsStatus, createProductAd, startAds, setBudget, stopAds, checkBudget, explain };
