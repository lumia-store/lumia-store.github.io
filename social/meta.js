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
async function adsStatus({ token, fetchImpl, adAccount, dest }) {
  const g = client({ token, fetchImpl });
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
  const ours = await ensureSetup(g, { adAccount, pageId, budget, dest: k, pixelId });
  const url = k === 'website' ? link + (link.includes('?') ? '&' : '?') + 'utm_source=meta&utm_medium=paid&utm_campaign=lumia' : '';
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

async function startAds({ token, fetchImpl, adAccount, budget, dest }) {
  const g = client({ token, fetchImpl });
  const b = checkBudget(budget), ours = await findOurs(g, adAccount, dest);
  // only one kind runs at a time, so the daily total never exceeds the limit
  const other = await findOurs(g, adAccount, kindOf(dest) === 'website' ? 'whatsapp' : 'website');
  if (other.campaign && other.campaign.status === 'ACTIVE') await g.post('/' + other.campaign.id, { status: 'PAUSED' });
  if (!ours.campaign || !ours.adset || !ours.ads.length) fail('There is no ad yet. Approve a product suggestion first.');
  await g.post('/' + ours.adset.id, { daily_budget: minor(b), status: 'ACTIVE' });
  const newest = ours.ads[0];
  for (const ad of ours.ads) await g.post('/' + ad.id, { status: ad.id === newest.id || ad.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED' });
  await g.post('/' + ours.campaign.id, { status: 'ACTIVE' });
  return { running: true, dailyBudget: b };
}
async function setBudget({ token, fetchImpl, adAccount, budget, dest }) {
  const g = client({ token, fetchImpl }), b = checkBudget(budget), ours = await findOurs(g, adAccount, dest);
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
  return { running: false };
}

module.exports = { GRAPH, MAX_DAILY_EGP, NAMES, KINDS, ensurePixel, client, discover, postFacebook, storyFacebook, postInstagram, adsStatus, createProductAd, startAds, setBudget, stopAds, checkBudget, explain };
