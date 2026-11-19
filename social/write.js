/**
 * LUMIA social robot — writes the words for a post with the AI (Claude Haiku or Gemini, as chosen in the app).
 * Prices, discounts, links and stock words are NEVER written by the AI: the robot adds them from the shop data,
 * so a post can never show a wrong price.
 */
const need = n => { try { return require('./' + n); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; return require('../desktop/' + n); } };
const { askJson } = need('ai.js');

const HASHTAGS = ['#عناية_بالبشرة', '#روتين_العناية', '#سيروم', '#ترطيب', '#نضارة_البشرة', '#واقي_شمس', '#عناية_بالشعر', '#زيت_الشعر', '#شعر_صحي', '#عناية_بالجسم', '#مزيل_عرق', '#مكياج', '#بشرة_دهنية', '#بشرة_جافة', '#بشرة_حساسة', '#فيتامينات', '#مكملات_غذائية', '#العناية_بالفم', '#منتجات_المانية', '#منتجات_أصلية', '#جمال', '#skincare', '#skincareegypt', '#haircare', '#bodycare', '#makeup', '#germanbeauty', '#dmproducts', '#Balea', '#essence', '#Eucerin', '#Mivolis', '#LANGHAARMAEDCHEN', '#trenditup', '#Sundance', '#ISANA', '#babylove'];

const SOCIAL_RULES = `YOU WRITE SOCIAL MEDIA POSTS (Facebook + Instagram) FOR "LUMIA Care", a shop in Egypt selling ORIGINAL drugstore beauty and care products imported from Germany (bought from German shops such as dm and Rossmann). The readers are mostly Egyptian women.

VOICE (very important — this is what makes Egyptian women stop and read):
- Write in warm EGYPTIAN COLLOQUIAL Arabic (عامية مصرية), like a friend who loves beauty products talking to the girls — NOT formal فصحى.
  Natural expressions you may use: "بصوا يا بنات"، "جبتلكم"، "وصل"، "هتحبيه"، "حلو أوي"، "خفيف أوي على البشرة"، "ريحته تجنن"، "بيدي إحساس"، "مناسب جداً لـ"، "شيك أوي"، "يستاهل التجربة"، "حطيه على"، "استخدميه".
- Talk TO her (feminine): "شعرك"، "بشرتك"، "استخدميه"، "هتلاحظي"، "لو بتحبي…". Excited, friendly, never stiff.
- Emojis: generous and fitting, like real Egyptian beauty pages: 😍✨💗🌸🌿💧🤍🇩🇪 — at the end of lines, 1–2 per line, never a whole row.
- Shape of a caption (follow it for "spotlight", "reel" and "offer" posts):
  1) an excited hook line with emojis (the feeling or result she will love — no invented personal story)
  2) the product name in Latin letters on its own line (e.g. "Balea Urea Handcreme ✨")
  3) 2–3 short lines: how it feels, what it is made with, who it suits
  4) "✨ مميزاته:" then 3–5 lines that each start with 💗 — ONLY from the product facts
  5) "🌸 طريقة الاستخدام:" then 1–2 short lines, only if the usage is in the facts
  6) a warm closing line, e.g. "أصلي من المانيا 🇩🇪 ويستاهل يبقى في روتينك 🤍"
- Example of the voice (style only; never copy its facts):
  "بصوا يا بنات وصلنا إيه 😍✨
  Balea Urea Handcreme
  كريم إيدين خفيف أوي بيتشرب بسرعة ومش بيسيب أي ملمس دهني 💧
  ✨ مميزاته:
  💗 فيه يوريا بتساعد على ترطيب الإيد الجافة جداً
  💗 مناسب للاستخدام كل يوم
  🌸 طريقة الاستخدام:
  حطي كمية صغيرة ودلكي إيدك لحد ما يتشرب 🤍
  أصلي من المانيا 🇩🇪"

HONESTY RULES (never break these, even in the friendly voice):
1. Use ONLY the product facts given. No invented ingredients, percentages, hours ("24 ساعة"), results, awards, "dermatologist tested" or reviews.
2. No invented personal experience or story: never "أنا جربتها"، "انبهرت"، "استخدمته بنفسي"، "البنات قالولي"، "اتحجزت كلها". Speak about the product, not about a fake experience.
3. Honest claims: "بيساعد على"، "بيدي مظهر"، "مناسب لـ". Never: بيعالج، بيشفي، بيقضي على، نهائياً، الأفضل، رقم 1، مضمون، "آمن تماماً"، "بدون كيماويات"، "طبيعي 100%" (unless printed on the pack).
4. NEVER write a price, a discount, "عرض"، "خصم"، "كمية محدودة"، "آخر قطعة" or any urgency.
5. NEVER write how to order, WhatsApp, the website, delivery, shipping or payment — the system adds these lines itself after your text.
6. NEVER mention stock or availability (متوفر، متاح، طلب مسبق، نفد، الكمية، الشحنة) and NEVER ask to swipe/slide or refer to "the next picture" — the same post goes to Facebook, where photos are not swiped.
7. Our products come from German drugstores/shops — never call them pharmacies (صيدليات) or medical products.
8. Write Germany / German / Europe WITHOUT hamza: المانيا، الماني، المانية، اوروبا، اوروبي.
9. Brand names stay in their original Latin spelling (Balea, essence, Eucerin, LANGHAARMÄDCHEN…).
10. No hashtags inside the caption text; put them only in "hashtags". Choose 5–7 ONLY from this list (copy them exactly; never invent new ones): ${HASHTAGS.join(' ')}
11. Every word must be natural Egyptian Arabic a native reader finds normal; correct spelling. Short lines that read well on a phone.
12. Caption length: up to about 700 characters for spotlight/reel/offer; 4–8 lines for the other types. Words ON THE PICTURE (headline, chips, title, sub, lines, labels, step, why) stay short, as the shape says, and may also be in friendly Egyptian.
13. BILINGUAL: every post is Arabic + English. For each Arabic text field also give its English version in the matching "_en" field
    (headline_en, title_en, sub_en, caption_en, lines_en, and title_en inside each slide). English: warm, friendly and short, with a few fitting emojis —
    written for an English reader in Egypt, not a word-for-word translation. All honesty rules apply to the English too.`;
/* paid ads: Meta refuses ads that tell the reader she has a problem or a personal trait */
const AD_RULES = `\nTHIS IS A PAID AD: keep the friendly Egyptian voice, but never say she has a problem or a personal trait ("شعرك ضعيف"، "بشرتك دهنية"، "لو عندك تساقط"، "هل تعانين"). Describe who the product suits instead: "مناسب للشعر الجاف"، "للبشرة الدهنية والمختلطة".`;

const facts = p => ({
  id: p.id, brand: p.brand, name_original: p.name, name_ar: p.nameAr || '', name_en: p.nameEn || '', size: p.size || '', category: p.category || '',
  description_ar: p.description || '', features_ar: (p.features || []).slice(0, 6), usage_ar: String(p.usage || '').slice(0, 300), tags: p.tags || []
});

const SHAPES = {
  spotlight: `{"headline": "≤ 7 Arabic words: the result or feeling the product gives (no brand, no price)", "chips": ["3 tiny facts ≤ 4 words each, from the features"], "caption": "the full Egyptian caption in the shape above (hook, product name, feel, ✨ مميزاته with 💗 lines, 🌸 طريقة الاستخدام, warm closing). No price.", "hashtags": [], "alt_en": "short English description of the image"}`,
  ad: `{"headline": "≤ 6 Arabic words: the clearest benefit (no brand, no price)", "chips": ["3 tiny facts ≤ 4 words each, from the features"], "ad_text": "exactly 3 short lines for a paid ad, written by a senior beauty marketer: 1) a hook that names the result people want (not a problem they have), 2) the proof: key ingredient or texture + original from Germany, 3) who it suits / how it fits their day. No price, no order words, no emojis except one at the end of line 1.", "caption": "same idea as ad_text in 3–4 lines", "hashtags": [], "alt_en": ""}`,
  offer: `{"headline": "≤ 7 Arabic words about the product's result (no price, no word عرض)", "chips": ["3 tiny facts ≤ 4 words"], "caption": "the full Egyptian caption in the shape above. No price, no offer words.", "hashtags": [], "alt_en": ""}`,
  reel: `{"lines": ["3 lines of ≤ 6 Arabic words each, shown one after another on the video: 1) the feeling/result 2) the key ingredient or texture 3) who it suits"], "caption": "the full Egyptian caption in the shape above", "hashtags": [], "alt_en": ""}`,
  compare: `{"chosen": ["exactly 2 product ids from the list that make a USEFUL comparison (same kind of product, different purpose)"], "title": "≤ 6 Arabic words, a question like: نياسيناميد أم فيتامين C؟", "sub": "≤ 8 words", "labels": {"<id>": "≤ 4 words: what this one is for"}, "caption": "4–6 short lines: what each one is for and who it suits, then a friendly question like: تختاري أنهي واحد لروتينك؟ 😍", "hashtags": [], "alt_en": ""}`,
  guide: `{"chosen": ["exactly 3 product ids that fit one care theme"], "title": "≤ 6 Arabic words: the guide topic, e.g. دليل الترطيب في الشتاء", "sub": "≤ 9 words", "slides": [{"id": "<product id>", "title": "≤ 5 words: the benefit or key ingredient", "points": ["2–3 points of ≤ 8 words, from the facts"]}], "caption": "4–6 short lines summarising the guide", "hashtags": [], "alt_en": ""}`,
  routine: `{"chosen": ["2 or 3 product ids that make a real routine in a logical order (e.g. clean → serum → cream)"], "title": "≤ 6 Arabic words, e.g. روتين مسائي في 3 خطوات", "when": "صباحاً | مساءً | صباحاً ومساءً", "steps": [{"id": "<product id>", "step": "≤ 3 words, e.g. التنظيف", "why": "≤ 9 words"}], "caption": "4–6 short lines", "hashtags": [], "alt_en": ""}`,
  trust: `{"title": "≤ 6 Arabic words about original German products, e.g. أصلية من المانيا… إلى باب البيت", "caption": "2–4 short lines: original, sealed products bought from German shops such as dm and Rossmann and brought to Egypt; chosen with care. Friendly Egyptian, no exaggeration. (Do not write about ordering, delivery or payment.)", "hashtags": [], "alt_en": ""}`
};

function promptFor(item, products) {
  const occ = item.occasion ? `\nOCCASION: ${item.occasion.ar} is in ${item.occasion.inDays} day(s). You may mention it gently (e.g. "هدية حلوة أوي لـ${item.occasion.ar} 🎁") — no offer or price words.` : '';
  const pick = item.pick ? `\nChoose from these products: pick ${item.pick === 2 ? 'exactly 2' : '2 or 3'} that genuinely belong together. If none fit well, still pick the closest and keep the wording honest.` : '';
  return `${SOCIAL_RULES}

POST TYPE: ${item.type}${item.type === 'ad' ? AD_RULES : ''}${occ}${pick}
PRODUCTS (facts you may use):
${JSON.stringify(products.map(facts), null, 1)}

Answer with JSON exactly in this shape:
${SHAPES[item.type]}${EN_RULES}`;
}

/* small safety net on top of the rules: removes words the AI must never use, and any price it slipped in */
const BANNED = /(بيعالج|يعالج|بيشفي|يشفي|بيقضي على|يقضي على|نهائياً|نهائيا|الأفضل|مضمون[ةه]?|رقم 1|كمية محدودة|آخر قطعة|خصم|عرض خاص|آمن تماماً|آمنة تماماً|بدون (أي )?(مواد )?كيما?وي[اةه]ت?)/g;
const PRICEY = /\d+\s*(ج\.?م|جنيه|EGP|LE)\b/gi;
const EN_RULES = '\nAlso add the English fields: "headline_en" / "title_en" / "sub_en" / "caption_en" / "lines_en" (and "title_en" in each slide) — one for every Arabic text field in the shape.';
const STATUS_LINE = /(أنا جربت|انا جربت|جربتها بنفسي|جربته بنفسي|انبهرت|اتحجز|الشحنة|اسحب|اسحبي|مرر|مرّر|swipe|الصورة التالية|الصور التالية|متوفر|متوفّر|متاح الآن|متوفرة الآن|طلب مسبق|الطلب المسبق|بالطلب المسبق|المخزون|نفد|نفذت|pre-?order|in stock)/i;   // Mina: no stock words, no swiping (Facebook)
const ORDER_LINE = /(واتساب|واتس|الواتس|whatsapp|للطلب|اطلب|التوصيل|توصيل|الشحن|شحن|الدفع|عند الاستلام|الموقع|الرابط|البايو)/i;
/* English lines: the same safety net in English */
const EN_BANNED = /\b(cures?|heals?|treats?|the best|number one|guaranteed|discount|sale|limited (offer|stock)|last piece)\b/gi;
const EN_LINE = /\b(swipe|next (photo|picture|slide)|in stock|out of stock|pre-?order|available now|whatsapp|order now|to order|delivery|deliver|shipping|cash on delivery|payment|link in bio|website)\b/i;
function tidyEn(text) {
  return String(text || '').split('\n').filter(l => !EN_LINE.test(l)).join('\n').replace(PRICEY, '').replace(EN_BANNED, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ').trim();
}
function tidy(text) {
  const bad = new RegExp(BANNED.source);   // a line with a banned claim goes whole (cutting one word leaves a broken half-line)
  return String(text || '').split('\n').filter(l => !ORDER_LINE.test(l) && !STATUS_LINE.test(l) && !bad.test(l)).join('\n').replace(PRICEY, '').replace(BANNED, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ').trim();
}
const tag = h => '#' + String(h || '').replace(/^#+/, '').trim().replace(/\s+/g, '_');

async function writePost(item, products, keys) {
  const { data, provider, cost, fallback } = await askJson({ claudeKey: keys.claude, geminiKey: keys.gemini, prefer: keys.prefer || 'claude', prompt: promptFor(item, products), temperature: 0.7 });
  const out = Object.assign({}, data);
  for (const k of ['caption', 'headline', 'title', 'sub', 'ad_text']) if (out[k]) out[k] = tidy(out[k]);
  for (const k of ['caption_en', 'headline_en', 'title_en', 'sub_en']) if (out[k]) out[k] = tidyEn(out[k]);
  if (Array.isArray(out.lines_en)) out.lines_en = out.lines_en.map(tidyEn).slice(0, 3);
  if (Array.isArray(out.lines)) out.lines = out.lines.map(tidy).filter(Boolean).slice(0, 3);
  if (Array.isArray(out.chips)) out.chips = out.chips.map(tidy).filter(Boolean).slice(0, 3);
  const ids = new Set(products.map(p => p.id));
  if (Array.isArray(out.chosen)) out.chosen = out.chosen.map(String).filter(id => ids.has(id));
  if (Array.isArray(out.slides)) out.slides = out.slides.filter(x => ids.has(String(x.id))).map(x => ({ id: String(x.id), title: tidy(x.title), title_en: tidyEn(x.title_en), points: [].concat(x.points || []).map(tidy).filter(Boolean).slice(0, 3) }));
  if (Array.isArray(out.steps)) out.steps = out.steps.filter(x => ids.has(String(x.id))).map(x => ({ id: String(x.id), step: tidy(x.step), why: tidy(x.why) }));
  const ok = new Map(HASHTAGS.map(h => [h.toLowerCase(), h]));
  out.hashtags = [...new Set([].concat(out.hashtags || []).map(tag).map(h => ok.get(h.toLowerCase())).filter(Boolean))].slice(0, 7);
  if (out.hashtags.length < 3) out.hashtags = [...new Set([...out.hashtags, '#منتجات_المانية', '#منتجات_أصلية', '#skincareegypt'])];
  return { words: out, provider, cost, fallback };
}

module.exports = { writePost, promptFor, tidy, tidyEn, SOCIAL_RULES, HASHTAGS };
