/**
 * LUMIA social robot — writes the words for a post with the AI (Claude Haiku or Gemini, as chosen in the app).
 * Prices, discounts, links and stock words are NEVER written by the AI: the robot adds them from the shop data,
 * so a post can never show a wrong price.
 */
const need = n => { try { return require('./' + n); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; return require('../desktop/' + n); } };
const { askJson, COPY_GUIDE } = need('ai.js');

const HASHTAGS = ['#عناية_بالبشرة', '#روتين_العناية', '#سيروم', '#ترطيب', '#نضارة_البشرة', '#واقي_شمس', '#عناية_بالشعر', '#زيت_الشعر', '#شعر_صحي', '#عناية_بالجسم', '#مزيل_عرق', '#مكياج', '#بشرة_دهنية', '#بشرة_جافة', '#بشرة_حساسة', '#فيتامينات', '#مكملات_غذائية', '#العناية_بالفم', '#منتجات_ألمانية', '#منتجات_أصلية', '#جمال', '#skincare', '#skincareegypt', '#haircare', '#bodycare', '#makeup', '#germanbeauty', '#dmproducts', '#Balea', '#essence', '#Eucerin', '#Mivolis', '#LANGHAARMAEDCHEN', '#trenditup', '#Sundance', '#ISANA', '#babylove'];

const SOCIAL_RULES = `YOU WRITE SOCIAL MEDIA POSTS (Facebook + Instagram) FOR "LUMIA Care", a boutique in Egypt selling ORIGINAL drugstore beauty and care products imported from Germany. Orders are taken on WhatsApp; delivery to all governorates; cash on delivery.

TONE: elegant, warm Arabic (فصحى سلسة قريبة من القارئ), like a trusted beauty advisor. Short lines that read well on a phone. 1–3 fitting emojis per caption at most (✨🌿💧🤍), never a row of emojis.

STRICT RULES:
1. Use ONLY the product facts given. No invented ingredients, percentages, results, awards, "dermatologist tested" or reviews.
2. Honest wording: "يساعد على"، "يمنح مظهراً"، "يُعنى بـ". Never: يعالج، يشفي، يقضي على، نهائياً، الأفضل، رقم 1، نتائج مضمونة، مضمون.
3. Do NOT tell the reader they have a problem or a personal trait (Meta rule): never "هل تعانين من…؟"، "بشرتك الدهنية"، "لأنك…". Describe who a product suits instead: "مناسب للبشرة الدهنية والمختلطة".
4. Do not address one gender. Avoid "اطلبي/جربي/بشرتكِ" and "اطلب/جرب/بشرتك"; use neutral phrases: "للطلب"، "تجربة لطيفة لـ…"، "البشرة"، "الشعر".
5. NEVER write a price, a discount, "عرض"، "خصم"، "كمية محدودة"، "آخر قطعة" or any urgency.
5b. NEVER write how to order, WhatsApp, the website, delivery, shipping or payment — the system adds these lines itself after your text.
5c. Our products come from German drugstores/shops (متاجر ألمانية مثل dm وRossmann) — never call them pharmacies (صيدليات) or medical products.
6. Brand names stay in their original Latin spelling (Balea, essence, Eucerin, LANGHAARMÄDCHEN…). Product names in Arabic as shoppers in Egypt say them.
7. No hashtags inside the caption text; put them only in "hashtags".
8. Hashtags: choose 5–7 ONLY from this list (copy them exactly; never invent new ones): ${HASHTAGS.join(' ')}
9. Every word must be correct, common Arabic that a native reader finds natural. If unsure of a word, use a simpler one. Short sentences.
10. Caption length: 2–4 short lines, at most 280 characters.

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
  trust: `{"title": "≤ 6 Arabic words about original German products, e.g. أصلية من ألمانيا… إلى باب البيت", "caption": "2–4 short lines: original, sealed products bought from German shops such as dm and Rossmann and brought to Egypt; chosen with care. Friendly, no exaggeration. (Do not write about ordering, delivery or payment.)", "hashtags": [], "alt_en": ""}`
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
const ORDER_LINE = /(واتساب|واتس|الواتس|whatsapp|للطلب|اطلب|التوصيل|توصيل|الشحن|شحن|الدفع|عند الاستلام|الموقع|الرابط|البايو)/i;
function tidy(text) {
  return String(text || '').split('\n').filter(l => !ORDER_LINE.test(l)).join('\n').replace(PRICEY, '').replace(BANNED, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ').trim();
}
const tag = h => '#' + String(h || '').replace(/^#+/, '').trim().replace(/\s+/g, '_');

async function writePost(item, products, keys) {
  const { data, provider, cost, fallback } = await askJson({ claudeKey: keys.claude, geminiKey: keys.gemini, prefer: keys.prefer || 'claude', prompt: promptFor(item, products), temperature: 0.7 });
  const out = Object.assign({}, data);
  for (const k of ['caption', 'headline', 'title', 'sub']) if (out[k]) out[k] = tidy(out[k]);
  if (Array.isArray(out.lines)) out.lines = out.lines.map(tidy).filter(Boolean).slice(0, 3);
  if (Array.isArray(out.chips)) out.chips = out.chips.map(tidy).filter(Boolean).slice(0, 3);
  const ids = new Set(products.map(p => p.id));
  if (Array.isArray(out.chosen)) out.chosen = out.chosen.map(String).filter(id => ids.has(id));
  if (Array.isArray(out.slides)) out.slides = out.slides.filter(x => ids.has(String(x.id))).map(x => ({ id: String(x.id), title: tidy(x.title), points: [].concat(x.points || []).map(tidy).filter(Boolean).slice(0, 3) }));
  if (Array.isArray(out.steps)) out.steps = out.steps.filter(x => ids.has(String(x.id))).map(x => ({ id: String(x.id), step: tidy(x.step), why: tidy(x.why) }));
  const ok = new Map(HASHTAGS.map(h => [h.toLowerCase(), h]));
  out.hashtags = [...new Set([].concat(out.hashtags || []).map(tag).map(h => ok.get(h.toLowerCase())).filter(Boolean))].slice(0, 7);
  if (out.hashtags.length < 3) out.hashtags = [...new Set([...out.hashtags, '#منتجات_ألمانية', '#منتجات_أصلية', '#skincareegypt'])];
  return { words: out, provider, cost, fallback };
}

module.exports = { writePost, promptFor, tidy, SOCIAL_RULES, HASHTAGS };
