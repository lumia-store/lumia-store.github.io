/**
 * "Fill with AI": reads product photos (front, and back for ingredients) with Google Gemini
 * and returns the product details for the LUMIA website, in formal Arabic.
 * Gemini has a free tier; the user's own key is stored encrypted on the laptop.
 */
// Tried in order. When Google says a model is busy (503) or failing (500), the app waits a little,
// tries again, then moves to the next model.
const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'];
// "Fast" setting: Flash-Lite first (quicker, higher free limits), the bigger Flash only as backup
const MODELS_LITE = ['gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-2.5-flash'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* How LUMIA writes about cosmetics — used every time the AI writes or translates product texts.
   Elegant, warm and appealing, but every fact comes from the pack: no medical claims, nothing invented. */
const COPY_GUIDE = `WRITING STYLE (very important):
You write like an experienced beauty copywriter for a boutique shop in Egypt: elegant, warm, sensory and easy to read — never stiff, never a literal translation of the German pack.

ARABIC (فصحى أنيقة وسلسة):
- Open with what the shopper will feel or get (the result or the sensation), then the key ingredient, then who it suits. Example opening: "ترطيب غني يدوم طويلاً لليدين الجافة جداً، بتركيبة تحتوي على 5% يوريا وزبدة الشيا."
- Short, flowing sentences (2–3 per description). Do NOT start with "هو" or "هذا المنتج"; do not repeat the word "منتج"; no filler like "يتميز هذا المنتج بأنه".
- Speak about the product, not to one gender: write "البشرة" / "الشعر" / "اليدين", never "بشرتكِ" or "بشرتك".
- Use the beauty words shoppers in Egypt actually use: سيروم (not مصل)، شامبو، بلسم، ماسك، لوشن، كريم، جل، مقشّر (سكراب)، غسول، تونر، واقي شمس، مزيل عرق، ماسكارا، أحمر شفاه، كونسيلر، برايمر، مثبت.
- Sensory, appealing vocabulary (use only when it fits the pack): ملمس خفيف غير دهني، يمتصّه الجلد بسرعة، ترطيب يدوم طويلاً، نعومة فائقة، إشراقة طبيعية، انتعاش فوري، رغوة كريمية، رائحة ناعمة/منعشة، تركيبة لطيفة، عناية مكثفة، للاستخدام اليومي، لمسة نهائية مخملية، ثبات طويل، لمعان صحي.
- Common ingredients and the benefit you may mention: اليوريا → ترطيب البشرة الجافة جداً؛ حمض الهيالورونيك → ترطيب ونضارة؛ النياسيناميد → توحيد مظهر لون البشرة؛ البانثينول → تهدئة البشرة؛ الكيراتين → مظهر شعر أقوى؛ الكولاجين → مظهر بشرة أنعم؛ فيتامين C → إشراقة؛ حمض الساليسيليك → بشرة أنقى للبشرة المعرضة للحبوب؛ زبدة الشيا → تغذية ونعومة؛ الألوفيرا → انتعاش وتهدئة.
- Honest wording: use "يساعد على"، "يُعنى بـ"، "يمنح مظهراً"، "بحسب ما ورد على العبوة". NEVER: يعالج، يشفي، يقضي على، يزيل نهائياً، الأفضل، نتائج مضمونة، or any number/percentage not printed on the pack.
- Features: 3–5 bullets, each 3–8 words, starting with the benefit or a strong verb (e.g. "ترطيب يدوم 24 ساعة"، "ملمس خفيف يمتصّ بسرعة"، "خالٍ من السيليكون"). No full stops.
- Usage: clear, polite steps in the imperative, e.g. "يوزَّع على الشعر المبلل ويُدلَّك بلطف، ثم يُشطف جيداً."

ENGLISH:
- Natural, polished boutique tone; lead with the benefit, short sentences, sensory but truthful ("lightweight, fast-absorbing hydration for very dry hands").
- Same honesty rules: "helps", "cares for", "gives a … look"; never "cures", "treats", "the best", or invented numbers.
- Features: short benefit-led phrases, no full stops.`;
/* names in Arabic/English and Google search info (product form, bulk fill) */
const SEO_RULES = `- "name_ar": the product name in natural Arabic as shoppers in Egypt would say it, WITHOUT the brand and WITHOUT the size. Example: "كريم اليوريا لليدين".
- "name_en": the product name in clear English, WITHOUT the brand and WITHOUT the size. Example: "Urea Hand Cream".
- "search_terms": array of 4–8 short phrases people in Egypt would type into Google to find this product: mostly Arabic, a few English; include the brand written in Arabic letters the way the shop writes it (Balea = "باليا", Mivolis = "ميفوليس", ISANA = "إيسانا", Dontodent = "دونتودنت", essence = "إيسنس", alverde = "ألفيردي", Langhaarmädchen = "لانجهارمادشن", Doppelherz = "دوبلهيرتس") together with the product type, and what it is for. No prices, no claims.
- "seo_description": ONE Arabic sentence of 120–155 characters for Google results: what the product is, who it is for and the size, ending with "توصيل لجميع محافظات مصر". No price, no medical claims.`;
const TAGS = ['vegan', 'natural', 'sensitive', 'nofragrance', 'noparaben', 'nosilicone', 'kids'];

function prompt(categories, context) {
  return `You are preparing a product page for LUMIA, a shop in Egypt that sells original products imported from German drugstores (dm, Rossmann, Müller…).
Look carefully at the photo(s) of ONE product (front, and maybe back/ingredients). Read the packaging text exactly.

${COPY_GUIDE}

Return ONLY a JSON object with these keys:
- "name": product name as printed, in Latin letters, brand first, including the product line and variant, WITHOUT the size. Example: "Balea Professional Plex Repair Shampoo".
- "brand": brand as printed (e.g. "Balea", "Mivolis", "Essence", "Sundance", "alverde", "Dontodent").
- "size": net content with unit as printed, e.g. "250 ml", "50 g", "60 Tabletten" → write "60 tablets". Empty string if not visible.
- "category": short Arabic category. Prefer one of these existing ones if it fits: ${categories.length ? categories.join('، ') : '(none yet)'}. Otherwise one of: العناية بالبشرة، العناية بالشعر، المكياج، الفيتامينات والمكملات، العناية بالفم والأسنان، العناية بالجسم، الأطفال، أخرى.
- "description": 2–3 sentences in FORMAL Modern Standard Arabic (فصحى) describing what the product is and who it is for. Only claims that are printed on the pack or are obvious from the product type. No exaggeration, no medical claims.
- "features": array of 3–5 short bullet points in formal Arabic, taken from the claims on the pack (e.g. "خالٍ من السيليكون", "مناسب للبشرة الحساسة").
- "usage": how to use, in formal Arabic, translated from the pack. Empty string if not on the photos.
- "ingredients": the INCI ingredient list EXACTLY as printed (Latin, comma separated). Empty string if not readable in the photos — never guess ingredients.
- "warnings": warnings from the pack translated to formal Arabic. Empty string if none visible.
- "description_en", "features_en", "usage_en", "warnings_en": the same four texts in clear, natural English for the English version of the website (same facts, same number of features; empty where the Arabic one is empty).
- "tags": array, subset of ${JSON.stringify(TAGS)}, only when clearly stated on the pack (e.g. "vegan" logo, "ohne Silikone", "ohne Parfüm", "sensitiv", "für Kinder", "Naturkosmetik").
- "weightG": estimated total shipping weight in grams of ONE piece including packaging (number). Use the size as a guide (liquids ≈ 1 g per ml plus the bottle).
- "priceEUR": price in euros only if a price tag is visible in the photo, otherwise null.
- "notes": one short English sentence about anything you could not read or are unsure about (empty string if all clear).
${SEO_RULES}
Never invent facts. If something is not visible, leave it empty.` + (context ? `

Below is TEXT COPIED FROM THE SHOP'S PRODUCT PAGE (usually German; it may also contain menus and unrelated text).
Use it as the main source for the name, size, description, usage, ingredients and warnings, and take "priceEUR" from the product's current price on that page.
Translate into formal Arabic where asked; keep the INCI ingredient list exactly as written.
<<<PAGE
${String(context).slice(0, 14000)}
PAGE>>>` : '');
}

function clean(x) {
  const s = v => (v == null ? '' : String(v)).trim();
  const out = {
    name: s(x.name), brand: s(x.brand), size: s(x.size), category: s(x.category),
    description: s(x.description), usage: s(x.usage), ingredients: s(x.ingredients), warnings: s(x.warnings),
    features: Array.isArray(x.features) ? x.features.map(s).filter(Boolean).slice(0, 6) : [],
    descriptionEn: s(x.description_en), usageEn: s(x.usage_en), warningsEn: s(x.warnings_en),
    featuresEn: Array.isArray(x.features_en) ? x.features_en.map(s).filter(Boolean).slice(0, 6) : [],
    tags: Array.isArray(x.tags) ? x.tags.map(s).filter(t => TAGS.includes(t)) : [],
    weightG: Number(x.weightG) > 0 && Number(x.weightG) < 5000 ? Math.round(Number(x.weightG)) : '',
    priceEUR: Number(x.priceEUR) > 0 && Number(x.priceEUR) < 500 ? Number(x.priceEUR) : '',
    notes: s(x.notes),
    nameAr: s(x.name_ar), nameEn: s(x.name_en), seoDesc: s(x.seo_description),
    searchTerms: (Array.isArray(x.search_terms) ? x.search_terms : String(x.search_terms || '').split(/[,،|\n]/)).map(s).filter(Boolean).slice(0, 8)
  };
  return out;
}

function fail(msg) { const e = new Error(msg); e.userMessage = msg; throw e; }

/* Newer Gemini models "think" before answering, which makes them slow. Reading a label needs no deep thinking,
   so it is turned down: Gemini 2.5 → thinking off; Gemini 3 and the "-latest" names → minimal thinking. */
const thinkingFor = model => /2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'minimal' };
/* one Gemini call with fast settings; if Google does not accept the thinking setting for this model, it asks again without it */
async function geminiCall({ key, model, body, fetchImpl }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const go = b => fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(b) });
  const fast = Object.assign({}, body, { generationConfig: Object.assign({}, body.generationConfig, { thinkingConfig: thinkingFor(model) }) });
  let res = await go(fast), text = await res.text();
  if (res.status === 400 && /thinking/i.test(text)) { res = await go(body); text = await res.text(); }
  return { res, text };
}

async function geminiFill({ key, images, categories, context, fetchImpl = fetch, geminiModel = 'flash' }) {
  if (!key) fail('Add your free Google AI key in Settings first.');
  if ((!images || !images.length) && !context) fail('Add a photo of the product first.');
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt(categories || [], context) }, ...(images || []).slice(0, 4).map(b64 => ({ inline_data: { mime_type: 'image/jpeg', data: b64 } }))] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 8192 }
  };
  let lastErr = '';
  for (const model of (geminiModel === 'lite' ? MODELS_LITE : MODELS)) {
   for (let attempt = 0; attempt < 2; attempt++) {
    const { res, text } = await geminiCall({ key, model, body, fetchImpl });
    let json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ }
    if (res.status === 404) { lastErr = 'model'; break; }
    if (res.status === 503 || res.status === 500 || res.status === 502 || res.status === 504) {
      lastErr = 'busy';
      if (attempt === 0) { await sleep(2500); continue; }
      break;
    }
    if (res.status === 400 && /API key/i.test(text)) fail('Google rejected the AI key. Create a new key and save it again in Settings.');
    if (res.status === 403) fail('This AI key is not allowed to use Gemini. Create a key in Google AI Studio and save it again.');
    if (res.status === 429) { lastErr = 'limit'; break; }   // each model has its own free limit: try the next one
    if (!res.ok) fail('The AI service answered with error ' + res.status + '. Try again in a moment.');
    const parts = json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts || [];
    const raw = parts.map(p => p.text || '').join('').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    let data;
    try { data = parseJson(raw); } catch (e) { fail('The AI answer could not be read. Try again, or use a sharper photo.'); }
    const out = clean(Array.isArray(data) ? data[0] || {} : data);
    return { data: out, provider: 'Gemini', model, cost: 0 };
   }
  }
  if (lastErr === 'limit') fail('The free AI limit is used up for now. Wait a minute and try again.');
  if (lastErr === 'busy') fail('Google’s AI is very busy right now. Wait a minute and press “Fill with AI” again.');
  fail(lastErr === 'model' ? 'The AI model is not available for this key right now.' : 'The AI could not be reached.');
}

/* ---------------- Claude (Anthropic API, prepaid credit) ---------------- */
// Prices in US$ per million tokens (input, output), from Anthropic's price list.
const CLAUDE = {
  fast: { model: 'claude-haiku-5-5', label: 'Claude Haiku', inPrice: 0.10, outPrice: 0.50 },
  best: { model: 'claude-sonnet-5-5', label: 'Claude Sonnet', inPrice: 2, outPrice: 10 }
};

function parseJson(raw) {
  raw = String(raw || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(raw); } catch (e) { /* look for the JSON inside the text */ }
  if (raw.startsWith('[')) { const e2 = raw.lastIndexOf(']'); if (e2 > 0) return JSON.parse(raw.slice(0, e2 + 1)); }
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('no json');
  return JSON.parse(raw.slice(a, b + 1));
}

async function claudeFill({ key, images, categories, context, tier = 'fast', fetchImpl = fetch }) {
  if (!key) fail('Add your Claude API key in Settings first.');
  if ((!images || !images.length) && !context) fail('Add a photo of the product first.');
  const m = CLAUDE[tier] || CLAUDE.fast;
  const body = {
    model: m.model, max_tokens: 8000,   // Arabic + English texts + the full ingredient list need room
    messages: [{ role: 'user', content: [
      ...(images || []).slice(0, 4).map(b64 => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } })),
      { type: 'text', text: prompt(categories || [], context) + '\nAnswer with the JSON object only.' }
    ] }]
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ }
    const msg = (json && json.error && json.error.message) || '';
    if (res.status === 401) fail('Anthropic rejected the Claude key. Create a new key in the Claude Console and save it again.');
    if (res.status === 403) fail('This Claude key is not allowed to do this. Check the key in the Claude Console.');
    // If Claude says a setting is no longer supported for this model, drop it and try again.
    const bad = res.status === 400 && /`?(temperature|top_p|top_k)`? (is deprecated|is not supported|not supported)/i.exec(msg);
    if (bad && bad[1] in body) { delete body[bad[1]]; attempt--; continue; }
    if (res.status === 400 && /credit balance/i.test(msg)) { const e = new Error('credit'); e.userMessage = 'Your Claude credit is used up. Add credit in the Claude Console (Billing).'; e.fallback = true; throw e; }
    if (res.status === 429) { const e = new Error('rate'); e.userMessage = 'Claude is limiting requests for a moment. Try again in a minute.'; e.fallback = true; throw e; }
    if (res.status === 529 || res.status >= 500) {
      if (attempt === 0) { await sleep(2500); continue; }
      const e = new Error('busy'); e.userMessage = 'Claude is very busy right now. Try again in a minute.'; e.fallback = true; throw e;
    }
    if (!res.ok) fail('Claude answered with error ' + res.status + (msg ? ': ' + msg : '') + '.');
    const raw = ((json && json.content) || []).filter(c => c.type === 'text').map(c => c.text).join('');
    const cut = json && json.stop_reason === 'max_tokens';
    let data;
    try { data = parseJson(raw); } catch (e) {
      // the answer was cut off (too long) or came back broken: ask once more for a shorter answer, then let Gemini try
      if (attempt === 0) { body.max_tokens = 12000; body.messages[0].content[body.messages[0].content.length - 1].text += '\nKeep every text short (description max 3 sentences, features max 5 short items). Output complete, valid JSON.'; continue; }
      const er = new Error('unreadable'); er.userMessage = cut ? 'Claude\'s answer was too long and got cut off.' : 'Claude\'s answer could not be read.'; er.fallback = true; throw er;
    }
    const u = (json && json.usage) || {};
    const cost = ((u.input_tokens || 0) * m.inPrice + (u.output_tokens || 0) * m.outPrice) / 1e6;
    return { data: clean(data), provider: m.label, model: m.model, cost, usage: u };
  }
}

/**
 * Picks the AI: Claude Haiku by default when a Claude key is saved (Sonnet when asked for the best text),
 * Gemini (free) otherwise — and Gemini takes over when Claude is busy or out of credit.
 */
async function fillProduct({ claudeKey, geminiKey, images, categories, context, tier = 'fast', prefer = 'claude', fetchImpl = fetch, geminiModel = 'flash' }) {
  const useClaude = claudeKey && (prefer !== 'gemini' || tier === 'best');
  if (tier === 'best' && !claudeKey) fail('“Improve with Sonnet” needs a Claude API key. Add it in Settings → AI helper.');
  if (useClaude) {
    try { return await claudeFill({ key: claudeKey, images, categories, context, tier, fetchImpl }); }
    catch (e) {
      if (e.fallback && geminiKey && tier !== 'best') {
        const r = await geminiFill({ key: geminiKey, images, categories, context, fetchImpl, geminiModel });
        r.note = e.userMessage + ' Gemini (free) was used instead.';
        return r;
      }
      throw e;
    }
  }
  if (geminiKey) return geminiFill({ key: geminiKey, images, categories, context, fetchImpl, geminiModel });
  if (claudeKey) return claudeFill({ key: claudeKey, images, categories, context, tier, fetchImpl });
  fail('Add an AI key in Settings → AI helper (Claude, or the free Google Gemini key).');
}

/* ---------------- English for products that only have Arabic text (website in English) ----------------
   items: [{ id, name, description, features: [..], usage, warnings }] → { id: { descriptionEn, featuresEn, usageEn, warningsEn } } */
function translatePrompt(items) {
  return `You prepare product texts for LUMIA, a shop in Egypt selling original products imported from German drugstores.
For EACH product below:
1. Translate its Arabic texts (description, features, usage, warnings) to polished, natural English following the style below. Keep the same facts — add nothing. Keep the number of features. Empty where the Arabic is empty.
2. Write these from the product name, brand, size, category and texts:
${SEO_RULES.replace(/^- /gm, '   - ')}
${COPY_GUIDE}
Return ONLY a JSON object: {"<id>": {"description": "...", "features": ["..."], "usage": "...", "warnings": "...", "name_ar": "...", "name_en": "...", "search_terms": ["..."], "seo_description": "..."}, ...} with one entry per product id below.
${JSON.stringify(items)}`;
}

/* ---------------- rewrite existing texts in the LUMIA style (same facts, better wording) ----------------
   items: [{ id, name, brand, size, category, description, features: [..], usage, description_en, features_en: [..], usage_en }] */
function rewritePrompt(items) {
  return `You are improving the product texts of LUMIA, a shop in Egypt selling original products imported from German drugstores.
For EACH product below, rewrite its Arabic texts and its English texts so they read beautifully, following the writing style below.
STRICT RULES: keep exactly the same facts (ingredients, percentages, skin/hair type, claims) — do not add any fact, benefit, number or claim that is not already in the texts or the product name. Remove medical claims if any. If a text is empty, return it empty. Keep 3–5 features.
${COPY_GUIDE}
Return ONLY a JSON object: {"<id>": {"description": "<Arabic>", "features": ["<Arabic>", ...], "usage": "<Arabic>", "description_en": "...", "features_en": ["..."], "usage_en": "..."}, ...} with one entry per product id below.
${JSON.stringify(items)}`;
}
async function rewriteProducts(opts) { return translateProducts(Object.assign({}, opts, { mode: 'rewrite' })); }
async function translateProducts({ claudeKey, geminiKey, items, prefer = 'gemini', geminiModel = 'lite', fetchImpl = fetch, mode = 'translate' }) {
  const ask = mode === 'rewrite' ? rewritePrompt : translatePrompt;
  if (!items || !items.length) return { data: {}, cost: 0 };
  // The AI may answer { "<id>": {...} }, a list [{ id, ... }], or { "products": [...] } — all are understood.
  // A list without ids is matched to the products in the order they were sent.
  const shape = d => {
    const s = v => (v == null ? '' : String(v)).trim(), out = {};
    const arr = v => [].concat(v || []).map(s).filter(Boolean).slice(0, 6);
    const one = mode === 'rewrite' ? x => ({ description: s(x.description || x.description_ar), features: arr(x.features || x.features_ar), usage: s(x.usage || x.usage_ar),
      descriptionEn: s(x.description_en || x.descriptionEn), featuresEn: arr(x.features_en || x.featuresEn), usageEn: s(x.usage_en || x.usageEn) })
    : x => ({ descriptionEn: s(x.description || x.description_en || x.descriptionEn), usageEn: s(x.usage || x.usage_en || x.usageEn), warningsEn: s(x.warnings || x.warnings_en || x.warningsEn),
      featuresEn: [].concat(x.features || x.features_en || x.featuresEn || []).map(s).filter(Boolean).slice(0, 6),
      nameAr: s(x.name_ar || x.nameAr), nameEn: s(x.name_en || x.nameEn), seoDesc: s(x.seo_description || x.seoDesc),
      searchTerms: (Array.isArray(x.search_terms || x.searchTerms) ? (x.search_terms || x.searchTerms) : String(x.search_terms || x.searchTerms || '').split(/[,،|\n]/)).map(s).filter(Boolean).slice(0, 8) });
    if (d && !Array.isArray(d)) { const inner = d.products || d.items || d.translations || d.data; if (Array.isArray(inner)) d = inner; }
    if (Array.isArray(d)) d.forEach((x, i) => { if (!x || typeof x !== 'object') return; const id = String(x.id || x.product_id || x.productId || (items[i] && items[i].id) || ''); if (id) out[id] = one(x); });
    else for (const [id, x] of Object.entries(d || {})) if (x && typeof x === 'object') out[id] = one(x);
    return out;
  };
  const viaGemini = async () => {
    const body = { contents: [{ role: 'user', parts: [{ text: ask(items) }] }], generationConfig: { temperature: mode === 'rewrite' ? 0.5 : 0.2, responseMimeType: 'application/json' } };
    let last = '';
    for (const model of (geminiModel === 'lite' ? MODELS_LITE : MODELS)) {
      const { res, text } = await geminiCall({ key: geminiKey, model, body, fetchImpl });
      if (res.status === 404 || res.status === 429 || res.status >= 500) { last = res.status === 429 ? 'limit' : 'busy'; continue; }
      if (!res.ok) fail('The AI service answered with error ' + res.status + '.');
      let json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ }
      const raw = ((((json || {}).candidates || [])[0] || {}).content || { parts: [] }).parts.map(p => p.text || '').join('');
      try { return { data: shape(parseJson(raw)), cost: 0, provider: 'Gemini' }; } catch (e) { last = 'read'; continue; }
    }
    fail(last === 'limit' ? 'The free AI limit is used up for now. Wait a minute and try again.' : 'The AI could not answer right now. Try again in a minute.');
  };
  const viaClaude = async () => {
  const m = CLAUDE.fast;
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: m.model, max_tokens: 8000, messages: [{ role: 'user', content: ask(items) + '\nAnswer with the JSON object only.' }] }) });
  const json = await res.json().catch(() => null);
  if (!res.ok) fail('Claude answered with error ' + res.status + '.');
  const u = (json && json.usage) || {};
  return { data: shape(parseJson(((json && json.content) || []).filter(c => c.type === 'text').map(c => c.text).join(''))), cost: ((u.input_tokens || 0) * m.inPrice + (u.output_tokens || 0) * m.outPrice) / 1e6, provider: m.label };
};
  if (!geminiKey && !claudeKey) fail('Add an AI key in Settings → AI helper.');
  const first = prefer === 'claude' && claudeKey ? viaClaude : geminiKey ? viaGemini : viaClaude;
  const second = first === viaClaude ? (geminiKey ? viaGemini : null) : (claudeKey ? viaClaude : null);
  try { return await first(); } catch (e) { if (!second) throw e; return await second(); }   // the other AI is the backup
}

/* General "ask for JSON" call used by the social media robot: same Claude/Gemini choice and backup as everywhere else. */
async function askJson({ claudeKey, geminiKey, prompt: text, prefer = 'claude', temperature = 0.6, maxTokens = 6000, fetchImpl = fetch }) {
  const viaGemini = async () => {
    const body = { contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { temperature, responseMimeType: 'application/json' } };
    let last = '';
    for (const model of MODELS) {
      let res, t;
      try { ({ res, text: t } = await geminiCall({ key: geminiKey, model, body, fetchImpl })); } catch (e) { last = 'busy'; continue; }   // no answer: try the next model
      if (res.status === 404 || res.status === 429 || res.status >= 500) { last = res.status === 429 ? 'limit' : 'busy'; continue; }
      if (!res.ok) fail('The AI service answered with error ' + res.status + '.');
      let json = null; try { json = JSON.parse(t); } catch (e) { /* not json */ }
      const raw = ((((json || {}).candidates || [])[0] || {}).content || { parts: [] }).parts.map(p => p.text || '').join('');
      try { return { data: parseJson(raw), cost: 0, provider: 'Gemini' }; } catch (e) { last = 'read'; continue; }
    }
    fail(last === 'limit' ? 'The free AI limit is used up for now.' : 'The AI could not answer right now.');
  };
  const viaClaude = async () => {
    const m = CLAUDE.fast;
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: m.model, max_tokens: maxTokens, messages: [{ role: 'user', content: text + '\nAnswer with the JSON only.' }] }) });   // (no temperature: the current Haiku no longer accepts it)
    const json = await res.json().catch(() => null);
    const why = String(((json || {}).error || {}).message || '').slice(0, 140);
    if (!res.ok) fail('Claude answered with error ' + res.status + (why ? ' — ' + why : '') + (res.status === 401 ? ' (the Claude key was not accepted)' : res.status === 400 && /credit/i.test(JSON.stringify(json || {})) ? ' (no credit left on the Claude account)' : res.status === 404 ? ' (model not found)' : '') + '.');
    const u = (json && json.usage) || {};
    return { data: parseJson(((json && json.content) || []).filter(c => c.type === 'text').map(c => c.text).join('')), cost: ((u.input_tokens || 0) * m.inPrice + (u.output_tokens || 0) * m.outPrice) / 1e6, provider: m.label };
  };
  if (!geminiKey && !claudeKey) fail('No AI key.');
  const first = prefer === 'claude' && claudeKey ? viaClaude : geminiKey ? viaGemini : viaClaude;
  const second = first === viaClaude ? (geminiKey ? viaGemini : null) : (claudeKey ? viaClaude : null);
  try { return await first(); } catch (e) {
    if (!second) throw e;
    const r = await second();
    return Object.assign(r, { fallback: (first === viaClaude ? 'Claude' : 'Gemini') + ' did not work: ' + (e.userMessage || e.message) });   // so the app can say why the backup was used
  }
}

module.exports = { fillProduct, claudeFill, geminiFill, clean, CLAUDE, translateProducts, rewriteProducts, askJson, COPY_GUIDE };
