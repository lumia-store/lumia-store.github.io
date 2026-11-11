/**
 * LUMIA social robot — writes the words for a post with the AI (Claude Haiku or Gemini, as chosen in the app).
 * Prices, discounts, links and stock words are NEVER written by the AI: the robot adds them from the shop data,
 * so a post can never show a wrong price.
 */
const need = n => { try { return require('./' + n); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; return require('../desktop/' + n); } };
const { askJson, COPY_GUIDE } = need('ai.js');

const SOCIAL_RULES = `YOU WRITE SOCIAL MEDIA POSTS (Facebook + Instagram) FOR "LUMIA Care", a boutique in Egypt selling ORIGINAL drugstore beauty and care products imported from Germany. Orders are taken on WhatsApp; delivery to all governorates; cash on delivery.

TONE: elegant, warm Arabic (فصحى سلسة قريبة من القارئ), like a trusted beauty advisor. Short lines that read well on a phone. 1–3 fitting emojis per caption at most (✨🌿💧🤍), never a row of emojis.

STRICT RULES:
1. Use ONLY the product facts given. No invented ingredients, percentages, results, awards, "dermatologist tested" or reviews.
2. Honest wording: "يساعد على"، "يمنح مظهراً"، "يُعنى بـ". Never: يعالج، يشفي، يقضي على، نهائياً، الأفضل، رقم 1، نتائج مضمونة، مضمون.
3. Do NOT tell the reader they have a problem or a personal trait (Meta rule): never "هل تعانين من…؟"، "بشرتك الدهنية"، "لأنك…". Describe who a product suits instead: "مناسب للبشرة الدهنية والمختلطة".
4. Do not address one gender. Avoid "اطلبي/جربي/بشرتكِ" and "اطلب/جرب/بشرتك"; use neutral phrases: "للطلب"، "تجربة لطيفة لـ…"، "البشرة"، "الشعر".
5. NEVER write a price, a discount, "عرض"، "خصم"، "كمية محدودة"، "آخر قطعة" or any urgency — the system adds real prices and offers itself.
6. Brand names stay in their original Latin spelling (Balea, essence, Eucerin, LANGHAARMÄDCHEN…). Product names in Arabic as shoppers in Egypt say them.
7. No hashtags inside the caption text; put them only in "hashtags".
8. Hashtags: 6–8, mixing Arabic and English, specific to the product type and benefit (e.g. #سيروم_نياسيناميد #عناية_بالبشرة #skincareegypt). No hashtag about price or offers.

${COPY_GUIDE}`;

const facts = p => ({
  id: p.id, brand: p.brand, name_original: p.name, name_ar: p.nameAr || '', name_en: p.nameEn || '', size: p.size || '', category: p.category || '',
  description_ar: p.description || '', features_ar: (p.features || []).slice(0, 6), usage_ar: String(p.usage || '').slice(0, 300), tags: p.tags || []
});

const SHAPES = {
  spotlight: `{"headline": "≤ 7 Arabic words: the result or feeling the product gives (no brand, no price)", "chips": ["3 tiny facts ≤ 4 words each, from the features"], "caption": "3–5 short lines: the feeling/result, the key ingredient, who it suits, how it is used. No price.", "hashtags": [], "alt_en": "short English description of the image"}`,
  offer: `{"headline": "≤ 7 Arabic words about the product's result (no price, no word عرض)", "chips": ["3 tiny facts ≤ 4 words"], "caption": "3–5 short lines about the product. No price, no offer words.", "hashtags": [], "alt_en": ""}`,
  reel: `{"lines": ["3 lines of ≤ 6 Arabic words each, shown one after another on the video: 1) the feeling/result 2) the key ingredient or texture 3) who it suits"], "caption": "2–4 short lines", "hashtags": [], "alt_en": ""}`,
  compare: `{"chosen": ["exactly 2 product ids from the list that make a USEFUL comparison (same kind of product, different purpose)"], "title": "≤ 6 Arabic words, a question like: نياسيناميد أم فيتامين C؟", "sub": "≤ 8 words", "labels": {"<id>": "≤ 4 words: what this one is for"}, "caption": "4–6 short lines: what each one is for and who it suits, then: أيهما يناسب روتينكم؟ (neutral plural)", "hashtags": [], "alt_en": ""}`,
  guide: `{"chosen": ["exactly 3 product ids that fit one care theme"], "title": "≤ 6 Arabic words: the guide topic, e.g. دليل الترطيب في الشتاء", "sub": "≤ 9 words", "slides": [{"id": "<product id>", "title": "≤ 5 words: the benefit or key ingredient", "points": ["2–3 points of ≤ 8 words, from the facts"]}], "caption": "4–6 short lines summarising the guide", "hashtags": [], "alt_en": ""}`,
  routine: `{"chosen": ["2 or 3 product ids that make a real routine in a logical order (e.g. clean → serum → cream)"], "title": "≤ 6 Arabic words, e.g. روتين مسائي في 3 خطوات", "when": "صباحاً | مساءً | صباحاً ومساءً", "steps": [{"id": "<product id>", "step": "≤ 3 words, e.g. التنظيف", "why": "≤ 9 words"}], "caption": "4–6 short lines", "hashtags": [], "alt_en": ""}`,
  trust: `{"title": "≤ 6 Arabic words about original German products, e.g. أصلية من ألمانيا… إلى باب البيت", "caption": "4–6 short lines: products bought in Germany and brought to Egypt, original and sealed, delivery to all governorates, cash on delivery, orders on WhatsApp. Friendly, no exaggeration.", "hashtags": [], "alt_en": ""}`
};

function promptFor(item, products) {
  const occ = item.occasion ? `\nOCCASION: ${item.occasion.ar} is in ${item.occasion.inDays} day(s). You may mention it gently (e.g. "هدية لطيفة بمناسبة ${item.occasion.ar}") — no offer or price words.` : '';
  const pick = item.pick ? `\nChoose from these products: pick ${item.pick === 2 ? 'exactly 2' : '2 or 3'} that genuinely belong together. If none fit well, still pick the closest and keep the wording honest.` : '';
  return `${SOCIAL_RULES}

POST TYPE: ${item.type}${occ}${pick}
PRODUCTS (facts you may use):
${JSON.stringify(products.map(facts), null, 1)}

Answer with JSON exactly in this shape:
${SHAPES[item.type]}`;
}

/* small safety net on top of the rules: removes words the AI must never use, and any price it slipped in */
const BANNED = /(يعالج|يشفي|يقضي على|نهائياً|نهائيا|الأفضل|مضمون[ةه]?|رقم 1|كمية محدودة|آخر قطعة|خصم|عرض خاص)/g;
const PRICEY = /\d+\s*(ج\.?م|جنيه|EGP|LE)\b/gi;
function tidy(text) {
  return String(text || '').replace(PRICEY, '').replace(BANNED, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ').trim();
}
const tag = h => '#' + String(h || '').replace(/^#+/, '').trim().replace(/\s+/g, '_');

async function writePost(item, products, keys) {
  const { data, provider, cost } = await askJson({ claudeKey: keys.claude, geminiKey: keys.gemini, prefer: keys.prefer || 'claude', prompt: promptFor(item, products), temperature: 0.7 });
  const out = Object.assign({}, data);
  for (const k of ['caption', 'headline', 'title', 'sub']) if (out[k]) out[k] = tidy(out[k]);
  if (Array.isArray(out.lines)) out.lines = out.lines.map(tidy).filter(Boolean).slice(0, 3);
  if (Array.isArray(out.chips)) out.chips = out.chips.map(tidy).filter(Boolean).slice(0, 3);
  const ids = new Set(products.map(p => p.id));
  if (Array.isArray(out.chosen)) out.chosen = out.chosen.map(String).filter(id => ids.has(id));
  if (Array.isArray(out.slides)) out.slides = out.slides.filter(x => ids.has(String(x.id))).map(x => ({ id: String(x.id), title: tidy(x.title), points: [].concat(x.points || []).map(tidy).filter(Boolean).slice(0, 3) }));
  if (Array.isArray(out.steps)) out.steps = out.steps.filter(x => ids.has(String(x.id))).map(x => ({ id: String(x.id), step: tidy(x.step), why: tidy(x.why) }));
  out.hashtags = [...new Set([].concat(out.hashtags || []).map(tag).filter(h => h.length > 2 && !/(خصم|عرض|سعر|offer|sale)/i.test(h)))].slice(0, 8);
  return { words: out, provider, cost };
}

module.exports = { writePost, promptFor, tidy, SOCIAL_RULES };
