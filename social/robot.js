#!/usr/bin/env node
/**
 * LUMIA social robot. Runs on GitHub (see .github/workflows/social.yml in the website repository).
 *
 *   node social/robot.js prepare   — every morning: keeps the next 3 days of posts ready for approval
 *   node social/robot.js post      — in the evening: posts what Mina approved, at 8:30 PM Cairo time
 *
 * Nothing is posted without approval. Before posting, the price and stock are checked again against the shop:
 * a sold-out product is not posted, and a changed price is redrawn on the picture.
 *
 * Settings come from GitHub secrets: META_TOKEN, META_PAGE_ID, META_IG_ID, CLAUDE_KEY, GEMINI_KEY, AI_PREFER.
 */
const fs = require('fs'), path = require('path');
const P = require('./plan.js'), { writePost } = require('./write.js'), { renderPost } = require('./render.js');
const need = n => { try { return require('./' + n); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; return require('../desktop/' + n); } };
const meta = need('meta.js');

const SITE_DIR = path.resolve(process.env.SITE_DIR || path.join(__dirname, '..'));
const SITE_URL = (process.env.SITE_URL || 'https://lumia-store.github.io/').replace(/\/?$/, '/');
const QUEUE = path.join(SITE_DIR, 'social', 'queue.json');
const MEDIA = path.join(SITE_DIR, 'media', 'social');
const DAYS_AHEAD = 3;
const env = k => String(process.env[k] || '').trim();
const log = (...a) => console.log('[robot]', ...a);

function loadData() {
  const g = { window: {} };
  new Function('window', fs.readFileSync(path.join(SITE_DIR, 'data.js'), 'utf8'))(g.window);
  const d = g.window.SHOP_DATA;
  if (!d || !Array.isArray(d.products)) throw new Error('data.js could not be read');
  return d;
}
function loadQueue() { try { return JSON.parse(fs.readFileSync(QUEUE, 'utf8')); } catch (e) { return { version: 1, items: [], robot: {} }; } }
function saveQueue(q) { fs.mkdirSync(path.dirname(QUEUE), { recursive: true }); q.items.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0); fs.writeFileSync(QUEUE, JSON.stringify(q, null, 1) + '\n'); }
const mediaUrl = f => `${SITE_URL}media/social/${f}`;

async function browser() {
  const { chromium } = require('playwright-core');
  return chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--font-render-hinting=none'] });
}

/* fake AI for tests (AI_FAKE=1): fixed, rule-following words so the whole robot can be checked without a key */
function fakeWords(item, ps) {
  const ids = ps.map(p => p.id);
  return {
    headline: 'إشراقة ناعمة تدوم طوال اليوم', chips: ['تركيبة خفيفة', 'للاستخدام اليومي', 'أصلي من ألمانيا'],
    caption: 'تركيبة خفيفة يمتصها الجلد بسرعة ✨\nتمنح البشرة مظهراً أكثر نضارة.\nمناسبة للاستخدام اليومي صباحاً ومساءً.',
    lines: ['نضارة كل صباح', 'ملمس خفيف سريع الامتصاص', 'لروتين بسيط وأنيق'],
    chosen: ids.slice(0, item.pick || 3), title: 'أيهما يناسب روتينكم؟', sub: 'تعرّف على الفرق بينهما',
    labels: Object.fromEntries(ids.map(id => [id, 'للترطيب والنضارة'])),
    slides: ids.slice(0, 3).map(id => ({ id, title: 'ترطيب يدوم', points: ['ملمس خفيف غير دهني', 'يناسب الاستخدام اليومي'] })),
    steps: ids.slice(0, 3).map((id, i) => ({ id, step: ['التنظيف', 'السيروم', 'الترطيب'][i], why: 'خطوة لطيفة تهيئ البشرة لما بعدها' })), when: 'مساءً',
    hashtags: ['#عناية_بالبشرة', '#منتجات_ألمانية', '#skincareegypt', '#LUMIACare', '#روتين_العناية', '#Balea']
  };
}

/* the full caption: the AI's words + facts the robot adds itself (product, stock, how to order). No prices — Mina's choice. */
function captionFor(item, words, products, data, platform) {
  const wa = String(data.whatsapp || '').replace(/\D/g, ''), waNice = '+' + wa.replace(/^(\d{2})(\d{2})(\d{4})(\d+)$/, '$1 $2 $3 $4');
  const site = SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const pre = data.preorderNote || 'طلب مسبق: يصل خلال أسبوع إلى أسبوعين';
  const line = p => `${p.brand} · ${p.nameAr || p.nameEn || p.name}${p.size ? ' · ' + p.size : ''}`;
  const out = [String(words.caption || '').trim(), ''];
  if (item.type !== 'trust') {
    if (products.length === 1) { const p = products[0]; out.push(`✨ ${line(p)}`, p.stock > 0 ? '📦 متوفر الآن' : `📦 ${pre}`); }
    else for (const p of products) out.push(`• ${line(p)}${p.stock > 0 ? '' : ' (طلب مسبق)'}`);
    out.push('');
  }
  // how to order: the website or WhatsApp (Instagram does not make links clickable, so it points to the bio)
  const page = products.length === 1 && item.type !== 'trust' ? P.pageOf(SITE_URL, products[0]) : SITE_URL;
  if (platform === 'fb') out.push('🛍️ للطلب عبر الموقع أو واتساب:', `🌐 ${page}`, `📲 https://wa.me/${wa}`);
  else out.push('🛍️ للطلب عبر الموقع أو واتساب:', `🌐 ${site} (الرابط في البايو)`, `📲 ${waNice}`);
  out.push('🚚 التوصيل لجميع المحافظات · الدفع عند الاستلام', '');
  const tags = [...new Set([...(words.hashtags || []), '#LUMIACare', '#منتجات_ألمانية_أصلية'])].slice(0, platform === 'fb' ? 5 : 10);
  out.push(tags.join(' '));
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------------- prepare ---------------- */
async function prepare() {
  const data = loadData(), q = loadQueue(), today = env('ROBOT_TODAY') || P.cairoParts().date;   // (ROBOT_TODAY: tests only)
  const keys = { claude: env('CLAUDE_KEY'), gemini: env('GEMINI_KEY'), prefer: env('AI_PREFER') === 'gemini' ? 'gemini' : 'claude' };
  const fake = env('AI_FAKE') === '1';
  if (!fake && !keys.claude && !keys.gemini) {   // not connected yet (More → Social & Ads → Connect robot): wait quietly
    log('not connected yet — nothing to do');
    q.robot = Object.assign({}, q.robot, { waitingForSetup: true, lastCheck: new Date().toISOString() }); saveQueue(q); return;
  }
  if (q.robot) delete q.robot.waitingForSetup;
  const byId = Object.fromEntries(data.products.map(p => [p.id, p]));
  let br = null, made = 0, cost = 0; const errors = [], aiNotes = [];
  try {
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const date = P.addDays(today, i);
      // one post a day; if Mina skipped it (today or later), a replacement is written — at most 2 a day
      const mine = q.items.filter(it => it.date === date && it.type !== 'ad');
      if (mine.some(it => it.status !== 'skipped' && it.status !== 'expired')) continue;
      const redo = mine.filter(it => it.status === 'skipped').length;
      if (redo > 2) continue;
      const plan = P.planDay(data, q, date);
      if (redo) plan.id = `${plan.id}-r${redo}`;
      const cands = plan.products.map(id => byId[id]).filter(Boolean);
      log('preparing', date, plan.type, cands.map(p => p.name).join(' | '));
      let w;
      if (fake) w = { words: fakeWords(plan, cands), provider: 'test', cost: 0 };
      else {
        // the AI service sometimes does not answer for a moment: try again (3 times), then go on with the next day
        for (let t = 1; ; t++) {
          try { w = await writePost(plan, cands, keys); break; }
          catch (e) { log('AI try', t, 'failed:', e.userMessage || e.message); if (t >= 3) { errors.push(`${date}: ${e.userMessage || e.message}`); break; } await new Promise(r => setTimeout(r, 8000 * t)); }
        }
        if (!w) continue;
      }
      br = br || await browser();
      const files = await renderPost({ item: plan, words: w.words, products: cands, data, siteDir: SITE_DIR, outDir: MEDIA, browser: br });
      const used = files.used.map(id => byId[id]);
      const item = Object.assign({}, plan, {
        products: files.used, snapshot: Object.fromEntries(used.map(p => [p.id, { price: +p.price, was: +p.was || 0, avail: P.availOf(p) }])),
        words: w.words, media: { images: files.images.map(mediaUrl), story: files.story ? mediaUrl(files.story) : '', video: files.video ? mediaUrl(files.video) : '', cover: files.cover ? mediaUrl(files.cover) : '' },
        files: [...files.images, files.story, files.video].filter(Boolean),
        preview: { fb: captionFor(plan, w.words, used, data, 'fb'), ig: captionFor(plan, w.words, used, data, 'ig'),
          igTail: captionFor(plan, Object.assign({}, w.words, { caption: '' }), used, data, 'ig') },   // price/stock/order lines, added after an edited text when shared by hand
        status: 'waiting', ai: w.provider, aiNote: w.fallback || '', createdAt: new Date().toISOString()
      });
      delete item.pick;
      q.items.push(item); made++; cost += w.cost || 0;
      if (w.fallback) aiNotes.push(w.fallback);
      saveQueue(q);   // saved straight away, so one failure later never loses the posts already made
    }
    // the weekly ad suggestion (Thursday morning, or when there has been none for 7 days)
    const lastAd = q.items.filter(it => it.type === 'ad').map(it => it.date).sort().pop();
    if (!lastAd || (Date.parse(today) - Date.parse(lastAd)) / 864e5 >= 7) {
      const ad = P.planAd(data, q, today);
      if (ad) {
        const p = byId[ad.products[0]];
        let w = null;
        try { w = fake ? { words: fakeWords({ type: 'spotlight' }, [p]) } : await writePost({ type: 'spotlight', products: [p.id] }, [p], keys); }
        catch (e) { errors.push('ad: ' + (e.userMessage || e.message)); }
        if (w) {
        br = br || await browser();
        const files = await renderPost({ item: Object.assign({}, ad, { type: 'spotlight', id: ad.id }), words: w.words, products: [p], data, siteDir: SITE_DIR, outDir: MEDIA, browser: br });
        Object.assign(ad, { words: w.words, media: { images: files.images.map(mediaUrl) }, files: files.images, status: 'waiting', createdAt: new Date().toISOString(),
          adText: `${String(w.words.caption || '').split('\n').slice(0, 2).join('\n')}\n✨ ${p.brand} · ${p.nameAr || p.name}\n🛍️ للطلب عبر الموقع أو واتساب — التوصيل لجميع المحافظات`,
          link: P.pageOf(SITE_URL, p),
          headline: (w.words.headline || p.nameAr || p.name).slice(0, 40) });
        q.items.push(ad); made++; saveQueue(q);
        log('ad suggestion', p.name, ad.reason);
        }
      }
    }
  } finally { if (br) await br.close(); }
  cleanup(q, today);
  q.robot = Object.assign({}, q.robot, { lastPrepare: new Date().toISOString(), lastPrepareMade: made, aiCostUsd: +((q.robot && q.robot.aiCostUsd || 0) + cost).toFixed(4), lastError: errors.length ? 'Some posts could not be written (the AI did not answer); the robot tries again at the next run.' : '',
    aiNote: aiNotes.length ? 'Written with the backup AI because ' + aiNotes[0] : '', aiKeys: (keys.claude ? 'Claude ✓ ' : 'no Claude key · ') + (keys.gemini ? 'Gemini ✓' : 'no Gemini key') + ' · first choice: ' + keys.prefer });
  saveQueue(q);
  log('done:', made, 'new item(s)');
}

/* old pictures are removed after 21 days (Facebook and Instagram keep their own copy); the list keeps 120 days */
function cleanup(q, today) {
  const keepFiles = new Set();
  for (const it of q.items) {
    const age = (Date.parse(today) - Date.parse(it.date)) / 864e5;
    if (age > 21 && it.files) { for (const f of it.files) { try { fs.unlinkSync(path.join(MEDIA, f)); } catch (e) { /* already gone */ } } it.files = []; it.mediaRemoved = true; }
    else for (const f of it.files || []) keepFiles.add(f);
    if (it.status === 'waiting' && age > 2 && it.type !== 'ad') { it.status = 'expired'; it.note = 'Not approved in time'; }
    if (it.type === 'ad' && it.status === 'waiting' && age > 10) { it.status = 'expired'; }
  }
  q.items = q.items.filter(it => (Date.parse(today) - Date.parse(it.date)) / 864e5 <= 120);
  try { for (const f of fs.readdirSync(MEDIA)) if (!keepFiles.has(f)) { const st = fs.statSync(path.join(MEDIA, f)); if (Date.now() - st.mtimeMs > 3 * 864e5) fs.unlinkSync(path.join(MEDIA, f)); } } catch (e) { /* no folder yet */ }
}

/* ---------------- post ---------------- */
async function post() {
  const data = loadData(), q = loadQueue(), now = Date.now(), today = P.cairoParts().date;
  const byId = Object.fromEntries(data.products.map(p => [p.id, p]));
  const due = q.items.filter(it => it.type !== 'ad' && it.status === 'approved' && Date.parse(it.postAt) <= now && it.date >= P.addDays(today, -1));
  if (!due.length) { log('nothing to post now'); q.robot = Object.assign({}, q.robot, { lastPostCheck: new Date().toISOString() }); saveQueue(q); return; }
  const token = env('META_TOKEN'), pageId = env('META_PAGE_ID'), igId = env('META_IG_ID'), dry = env('META_DRY') === '1';
  if (!token || !pageId) { log('Meta is not connected — approved posts are shared by hand from the app'); return; }
  let br = null;
  try {
    for (const it of due) {
      it.status = 'posting'; it.results = it.results || {};
      // 1. check the shop again
      const ps = it.products.map(id => byId[id]);
      if (ps.some(p => !p)) { it.status = 'failed'; it.note = 'A product in this post was removed from the shop.'; continue; }
      const sold = ps.filter(p => P.availOf(p) === 'out');
      if (sold.length) { it.status = 'failed'; it.note = 'Not posted: sold out — ' + sold.map(p => p.name).join(', '); continue; }
      const changed = ps.some(p => (it.snapshot[p.id] || {}).avail !== P.availOf(p));   // pictures show no prices, only the stock label
      if (changed && it.type !== 'trust') {
        log('price/stock changed → redrawing', it.id);
        br = br || await browser();
        const files = await renderPost({ item: it, words: it.words, products: ps, data, siteDir: SITE_DIR, outDir: MEDIA, browser: br });
        const v = '?v=' + Date.now().toString(36);   // new address, so Meta does not reuse the old picture
        it.media = { images: files.images.map(f => mediaUrl(f) + v), story: files.story ? mediaUrl(files.story) + v : '', video: files.video ? mediaUrl(files.video) + v : '', cover: files.cover ? mediaUrl(files.cover) + v : '' };
        it.snapshot = Object.fromEntries(ps.map(p => [p.id, { price: +p.price, was: +p.was || 0, avail: P.availOf(p) }]));
        it.note = 'Stock changed since approval (in stock ↔ pre-order): the picture was updated automatically.';
        if (!dry) { saveQueue(q); await waitLive(it.media.images[0]); }
      }
      const fbText = captionFor(it, it.words, ps, data, 'fb'), igText = captionFor(it, it.words, ps, data, 'ig');
      const imgs = it.type === 'reel' ? [] : it.media.images;
      const errors = [];
      if (dry) { it.results = { fb: 'dry-run', ig: 'dry-run' }; log('DRY', it.id, fbText.slice(0, 60)); }
      else {
        if (!it.results.fb) try { it.results.fb = (await meta.postFacebook({ token, pageId, images: imgs, video: it.media.video || undefined, message: fbText })).id; } catch (e) { errors.push('Facebook: ' + (e.userMessage || e.message)); }
        if (igId && !it.results.ig) try { it.results.ig = (await meta.postInstagram({ token, igId, images: imgs, video: it.media.video || undefined, cover: it.media.cover, caption: igText })).id; } catch (e) { errors.push('Instagram: ' + (e.userMessage || e.message)); }
        if (it.media.story && !it.results.story) {
          try { if (igId) it.results.story = (await meta.postInstagram({ token, igId, story: it.media.story })).id; } catch (e) { errors.push('Story: ' + (e.userMessage || e.message)); }
          try { it.results.fbStory = (await meta.storyFacebook({ token, pageId, image: it.media.story })).id; } catch (e) { /* Facebook Page stories are optional */ }
        }
      }
      it.status = it.results.fb || it.results.ig ? 'posted' : 'failed';
      if (errors.length) it.note = [it.note, ...errors].filter(Boolean).join(' · ');
      it.postedAt = new Date().toISOString();
      log(it.id, it.status, errors.join(' | '));
    }
  } finally { if (br) await br.close(); }
  q.robot = Object.assign({}, q.robot, { lastPost: new Date().toISOString(), lastError: '' });
  saveQueue(q);
}

/* a redrawn picture is pushed to the website first; wait until it is live before Meta fetches it */
async function waitLive(url) {
  if (env('ROBOT_PUSH') !== '1') return;
  require('child_process').execFileSync('bash', ['-c', 'cd "$SITE_DIR" && git add -A media/social social && git commit -qm "Robot: picture updated before posting" && git push -q || true'], { stdio: 'inherit', env: Object.assign({}, process.env, { SITE_DIR }) });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(url, { method: 'HEAD' }); if (r.ok) return; } catch (e) { /* not yet */ }
    await new Promise(r => setTimeout(r, 15000));
  }
}

const cmd = process.argv[2];
if (require.main === module) (async () => {
  try {
    if (cmd === 'prepare') await prepare();
    else if (cmd === 'post') await post();
    else { console.log('usage: robot.js prepare | post'); process.exit(2); }
  } catch (e) {
    console.error('[robot] ERROR', e.userMessage || e.message);
    try { const q = loadQueue(); q.robot = Object.assign({}, q.robot, { lastError: `${cmd}: ${e.userMessage || e.message}`, lastErrorAt: new Date().toISOString() }); saveQueue(q); } catch (e2) { /* ignore */ }
    process.exit(1);
  }
})();

module.exports = { captionFor };
