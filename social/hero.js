/**
 * LUMIA hero post (Nov 2026, from Mina's study of premium beauty posts):
 * the real product, cut out of its white photo background, large on a marble podium; a themed scene behind it
 * (a picture from media/scenes/ when there is one for the theme, otherwise a drawn blush/ivory/aqua/citrus scene);
 * bold headline with a rose-gold swoosh, three benefits with line icons, delivery footer framed by rules.
 * The product is never drawn or changed by AI — only placed. All text is drawn here, so Arabic is always correct.
 */
const fs = require('fs'), path = require('path');
const hx = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nm = p => p.nameAr || p.nameEn || p.name;

const THEMES = {
  blush:  { bg1: '#f9e6e1', bg2: '#eccac3', glow: 'rgba(255,244,240,.95)', ink: '#5a2a2c', soft: '#8a5d58', acc: '#b47b62', acc2: '#e2b9a3', satin: 'rgba(255,255,255,.55)' },
  ivory:  { bg1: '#f8f2ec', bg2: '#e8dcd1', glow: 'rgba(255,253,249,.95)', ink: '#4a2c28', soft: '#7d6a64', acc: '#b08a6a', acc2: '#dcc6ad', satin: 'rgba(255,255,255,.6)' },
  aqua:   { bg1: '#eff6f5', bg2: '#d3e4e1', glow: 'rgba(251,255,254,.95)', ink: '#2e3f42', soft: '#5f7477', acc: '#a98a6c', acc2: '#d9c7b1', satin: 'rgba(255,255,255,.6)' },
  citrus: { bg1: '#fcefe1', bg2: '#f0d2b2', glow: 'rgba(255,249,240,.95)', ink: '#5b331f', soft: '#8a6450', acc: '#bb8450', acc2: '#e9c79f', satin: 'rgba(255,255,255,.55)' },
  sun:    { bg1: '#fdf3e4', bg2: '#f4d9b9', glow: 'rgba(255,250,240,.95)', ink: '#5a3a1f', soft: '#8a6a50', acc: '#c08a4e', acc2: '#ecd0a5', satin: 'rgba(255,255,255,.55)' }
};
/* which scene suits a product (by what it is and what it smells/does) */
function themeOf(p) {
  const t = [p.name, p.nameEn, p.nameAr, p.category, p.categoryEn, (p.tags || []).join(' ')].join(' ').toLowerCase();
  if (/(spf|sonne|sun|شمس|واقي)/.test(t)) return 'sun';
  if (/(vitamin ?c|orange|citrus|zitron|lemon|mango|peach|pfirsich|برتقال|ليمون|مانجو|خوخ|فيتامين سي)/.test(t)) return 'citrus';
  if (/(hyaluron|aqua|wasser|water|fresh|frisch|meer|marine|men\b|niacinamid|هيالورون|نياسيناميد|منعش|انتعاش|ماء)/.test(t)) return 'aqua';
  if (/(haar|hair|shampoo|spülung|conditioner|شعر|شامبو|بلسم)/.test(t)) return 'ivory';
  return 'blush';   // roses, berries, flowers, body care — the brand's own blush
}

/* optional scene pictures (made once in Gemini from the prompts in SCENES.md): media/scenes/scenes.json
   [{ "file": "blush-1.jpg", "theme": "blush", "h": 1341, "podium": { "cx": 539, "cy": 959, "w": 640 }, "top": "#…", "base": "#…" }]
   pictures are 1080 wide; podium = the centre and width of the podium's top surface (where the product stands) */
function scenesIn(siteDir) {
  try { return JSON.parse(fs.readFileSync(path.join(siteDir, 'media/scenes/scenes.json'), 'utf8')).filter(s => s && s.file && THEMES[s.theme] && s.podium && s.podium.cy && fs.existsSync(path.join(siteDir, 'media/scenes', s.file))); } catch (e) { return []; }
}
const NEAR = { blush: ['ivory', 'citrus', 'aqua', 'sun'], ivory: ['blush', 'aqua', 'citrus', 'sun'], aqua: ['ivory', 'blush', 'citrus', 'sun'], citrus: ['sun', 'blush', 'ivory', 'aqua'], sun: ['citrus', 'ivory', 'blush', 'aqua'] };
function sceneFor(siteDir, theme, key) {
  const all = scenesIn(siteDir);
  let list = all.filter(s => s.theme === theme);
  for (const t of NEAR[theme] || []) { if (list.length) break; list = all.filter(s => s.theme === t); }   // no scene for this theme yet: the closest one
  if (!list.length) list = all;
  if (!list.length) return null;   // no scene pictures at all: the drawn scene
  let h = 0; for (const ch of String(key || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];   // the same post always gets the same scene; different posts rotate
}

const ICONS = {
  drop: '<path d="M32 8C24 20 16 29 16 38a16 16 0 0 0 32 0c0-9-8-18-16-30z"/><path d="M24 40a8 8 0 0 0 8 8"/>',
  leaf: '<path d="M14 50C14 26 30 12 52 12c0 22-14 38-38 38z"/><path d="M14 50L38 26"/>',
  shield: '<path d="M32 8l20 8v14c0 13-9 22-20 26C21 52 12 43 12 30V16z"/><path d="M23 31l6 6 12-13"/>',
  sun: '<circle cx="32" cy="32" r="10"/><path d="M32 8v8M32 48v8M8 32h8M48 32h8M15 15l6 6M43 43l6 6M49 15l-6 6M21 43l-6 6"/>',
  feather: '<path d="M50 12C30 14 18 26 16 48l8-8c14-2 24-12 26-28z"/><path d="M12 52l20-20"/>',
  lotus: '<path d="M32 46c-8-6-10-16-0-28 10 12 8 22 0 28z"/><path d="M32 46c-10 0-18-6-20-16 8-1 15 3 20 10"/><path d="M32 46c10 0 18-6 20-16-8-1-15 3-20 10"/><path d="M14 50h36"/>',
  clock: '<circle cx="32" cy="32" r="20"/><path d="M32 20v12l8 6"/>',
  spark: '<path d="M32 10l5 15 15 5-15 5-5 15-5-15-15-5 15-5z"/><path d="M50 46l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>',
  hair: '<path d="M20 52c0-20 4-34 12-40 8 6 12 20 12 40"/><path d="M26 52c0-14 2-24 6-30M38 52c0-14-2-24-6-30"/>'
};
function iconFor(text) {
  const t = String(text || '');
  if (/(ترطيب|رطوب|هيالورون|ماء|مائي|منعش|انتعاش)/.test(t)) return 'drop';
  if (/(طبيعي|زبدة|زيت|شيا|ألوة|صبار|نبات|عضوي|خلاصة)/.test(t)) return 'leaf';
  if (/(حماية|spf|SPF|واقي|ضد|بدون|خال)/.test(t)) return /(شمس|spf|SPF)/.test(t) ? 'sun' : 'shield';
  if (/(سريع|خفيف|ناعم|نعومة|ملمس)/.test(t)) return 'feather';
  if (/(ساعة|48|24|يدوم|طويل)/.test(t)) return 'clock';
  if (/(شعر|فروة)/.test(t)) return 'hair';
  if (/(يومي|يوم|لطيف|حساس)/.test(t)) return 'lotus';
  return 'spark';
}
const icon = k => `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${ICONS[k] || ICONS.spark}</svg>`;

/* a marble podium (two tiers) drawn in SVG; veins come from a turbulence filter, rim in rose gold */
function podium(w, acc, uid) {
  const h = Math.round(w * 0.3), rx = w / 2 - 40, ry = Math.round(w * 0.075), base = w / 2 - 4;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible">
  <defs>
    <linearGradient id="side${uid}" x1="0" x2="1"><stop offset="0" stop-color="#d9d1cc"/><stop offset=".22" stop-color="#f6f2ef"/><stop offset=".55" stop-color="#fffdfb"/><stop offset=".85" stop-color="#ebe4df"/><stop offset="1" stop-color="#d4cbc5"/></linearGradient>
    <radialGradient id="top${uid}" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ece6e2"/></radialGradient>
    <linearGradient id="rim${uid}" x1="0" x2="1"><stop offset="0" stop-color="${acc}" stop-opacity=".3"/><stop offset=".5" stop-color="${acc}"/><stop offset="1" stop-color="${acc}" stop-opacity=".3"/></linearGradient>
    <filter id="mb${uid}" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency="0.004 0.022" numOctaves="5" seed="${uid % 9 + 3}" result="t"/>
      <feColorMatrix in="t" values="0 0 0 0 0.52  0 0 0 0 0.47  0 0 0 0 0.45  -2.6 -2.6 -2.6 0 2.05" result="v"/><feGaussianBlur in="v" stdDeviation="0.6"/></filter>
    <clipPath id="cl${uid}"><path d="M${w / 2 - base},${h * .62} a${base},${ry * 1.15} 0 0 0 ${base * 2},0 V${h * .5} H${w / 2 - base} Z"/><path d="M34,${ry} a${rx},${ry} 0 0 0 ${rx * 2},0 V${h * .52} a${rx},${ry} 0 0 1 -${rx * 2},0 Z"/><ellipse cx="${w / 2}" cy="${ry}" rx="${rx}" ry="${ry}"/></clipPath>
  </defs>
  <ellipse cx="${w / 2}" cy="${h * .62 + ry * 1.1}" rx="${base + 30}" ry="${ry * 1.1}" fill="rgba(60,30,25,.18)" filter="blur(10px)"/>
  <path d="M${w / 2 - base},${h * .5} V${h * .62} a${base},${ry * 1.15} 0 0 0 ${base * 2},0 V${h * .5} Z" fill="url(#side${uid})"/>
  <ellipse cx="${w / 2}" cy="${h * .5}" rx="${base}" ry="${ry * 1.15}" fill="url(#top${uid})"/>
  <path d="M34,${ry} V${h * .52} a${rx},${ry} 0 0 0 ${rx * 2},0 V${ry} Z" fill="url(#side${uid})"/>
  <ellipse cx="${w / 2}" cy="${ry}" rx="${rx}" ry="${ry}" fill="url(#top${uid})"/>
  <g clip-path="url(#cl${uid})" opacity=".85"><rect width="${w}" height="${h}" filter="url(#mb${uid})"/></g>
  <path d="M${w / 2 - base},${h * .62} a${base},${ry * 1.15} 0 0 0 ${base * 2},0" fill="none" stroke="url(#rim${uid})" stroke-width="3"/>
  <ellipse cx="${w / 2}" cy="${ry}" rx="${rx}" ry="${ry}" fill="none" stroke="rgba(255,255,255,.95)" stroke-width="2.5"/>
  <path d="M34,${ry} a${rx},${ry} 0 0 0 ${rx * 2},0" fill="none" stroke="url(#rim${uid})" stroke-width="2.5" opacity=".9"/>
  </svg>`;
}

const swoosh = acc => `<svg width="380" height="26" viewBox="0 0 380 26" style="display:block;margin:6px auto 0"><defs><linearGradient id="sw" x1="0" x2="1"><stop offset="0" stop-color="${acc}" stop-opacity="0"/><stop offset=".5" stop-color="${acc}"/><stop offset="1" stop-color="${acc}" stop-opacity="0"/></linearGradient></defs><path d="M6 20 Q190 -6 374 14" fill="none" stroke="url(#sw)" stroke-width="3" stroke-linecap="round"/></svg>`;

const CSS = `
.hero{position:absolute;inset:0;overflow:hidden}
.hero .bg{position:absolute;inset:0}
.hero .bg img{width:100%;height:100%;object-fit:cover}
.hero .satin{position:absolute;width:900px;height:1400px;border-radius:50%;filter:blur(38px);opacity:.75}
.hero .ray{position:absolute;inset:-200px;background:repeating-linear-gradient(115deg,rgba(255,255,255,0) 0 80px,rgba(255,255,255,.16) 80px 120px,rgba(255,255,255,0) 120px 230px);mask:radial-gradient(70% 60% at 15% 0%,#000,transparent 70%);-webkit-mask:radial-gradient(70% 60% at 15% 0%,#000,transparent 70%)}
.hero .bokeh{position:absolute;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.45),rgba(255,255,255,0))}
.hero .glow{position:absolute;left:50%;transform:translateX(-50%);border-radius:50%}
.hero .frame2{position:absolute;inset:30px;border:1.5px solid var(--acc2);z-index:6;pointer-events:none}
.hero .hd2{position:absolute;top:44px;left:70px;right:70px;display:grid;grid-template-columns:minmax(0,1fr) 260px minmax(0,1fr);align-items:center;z-index:5}
.hero .hd2 .cap2{display:flex;align-items:center;gap:16px;font-family:Montserrat;font-weight:500;font-size:19px;letter-spacing:.26em;color:var(--ink);direction:ltr;white-space:nowrap;opacity:.85}
.hero .hd2 .cap2 i{flex:1;height:1px;background:var(--acc2)}
.hero .hd2 .r{flex-direction:row-reverse}.hero .hd2 .l{flex-direction:row}
.hero .lg{display:flex;flex-direction:column;align-items:center;gap:4px;direction:ltr}
.hero .lg img{width:82px;height:82px;filter:brightness(.62) saturate(1.5) contrast(1.15)}
.hero .lg b{font-family:"Cormorant Garamond",serif;font-weight:500;font-size:50px;letter-spacing:.32em;padding-left:.32em;color:var(--ink);line-height:1}
.hero .lg i{font-style:normal;font-family:Montserrat;font-size:14px;letter-spacing:.62em;padding-left:.62em;color:var(--ink);opacity:.75}
.hero .top{position:absolute;left:0;right:0;text-align:center;z-index:5}
.hero .kick2{display:inline-flex;align-items:center;gap:20px;font-size:30px;color:var(--ink);font-weight:500}
.hero .kick2:before,.hero .kick2:after{content:"";width:70px;height:1.5px;background:var(--acc)}
.hero h1{font-family:"Noto Naskh Arabic","Amiri",serif;font-weight:700;font-size:96px;line-height:1.22;color:var(--ink);padding:6px 90px 0;text-shadow:0 2px 0 rgba(255,255,255,.35)}
.hero h1.m{font-size:80px}.hero h1.s2{font-size:66px}
.hero .prod2{position:absolute;display:flex;align-items:flex-end;justify-content:center;z-index:3}
.hero .prod2 img{max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 26px 30px rgba(60,30,25,.22)) drop-shadow(0 6px 8px rgba(60,30,25,.18))}
.hero .pod{position:absolute;left:50%;transform:translateX(-50%);z-index:2}
.hero .name2{position:absolute;left:0;right:0;text-align:center;font-size:31px;color:var(--ink);z-index:5}
.hero .name2 .lat{font-family:Montserrat;font-weight:500;letter-spacing:.14em;text-transform:uppercase;font-size:24px}
.hero .bens{position:absolute;left:70px;right:70px;display:flex;justify-content:center;align-items:center;z-index:5}
.hero .ben{display:flex;align-items:center;gap:16px;padding:0 26px;font-size:31px;font-weight:500;color:var(--ink);white-space:nowrap}
.hero .ben+.ben{border-right:1.5px solid var(--acc2)}
.hero .ben .ic{width:72px;height:72px;flex:none;border-radius:50%;border:1.8px solid var(--acc);color:var(--acc);display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.35)}
.hero .ben .ic svg{width:40px;height:40px}
.hero .bens.tight .ben{font-size:26px;padding:0 16px;gap:12px}.hero .bens.tight .ic{width:60px;height:60px}.hero .bens.tight .ic svg{width:34px;height:34px}
.hero .bens.tighter .ben{font-size:23px;padding:0 12px;gap:10px}.hero .bens.tighter .ic{width:52px;height:52px}
.hero .ft2{position:absolute;left:70px;right:70px;text-align:center;z-index:5}
.hero .ft2 .ln{display:flex;align-items:center;gap:26px;justify-content:center;font-size:27px;color:var(--ink);font-weight:500}
.hero .ft2 .ln i{flex:1;height:1.5px;background:var(--acc2)}
.hero .glass{position:absolute;left:58px;right:58px;border-radius:30px;background:rgba(255,255,255,.62);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1.5px solid rgba(255,255,255,.75);box-shadow:0 18px 40px rgba(60,30,25,.10);z-index:4}
.hero .ft2 .site{font-family:Montserrat;font-weight:500;font-size:24px;letter-spacing:.34em;color:var(--ink);margin-top:14px;direction:ltr;opacity:.85}
/* multi-product stage posts (guide, routine, compare, trust, end card, reel) */
.hero .badge{position:absolute;z-index:4;width:58px;height:58px;border-radius:50%;background:rgba(255,255,255,.85);border:1.8px solid var(--acc);color:var(--acc);font-family:"Cormorant Garamond",serif;font-size:30px;font-weight:600;display:flex;align-items:center;justify-content:center;direction:ltr}
.hero .or2{position:absolute;z-index:4;font-family:"Noto Naskh Arabic",Amiri;font-weight:700;font-size:64px;color:var(--acc);text-shadow:0 2px 0 rgba(255,255,255,.6)}
.hero .en2{font-family:"Cormorant Garamond",Georgia,serif;font-style:italic;font-weight:500;font-size:38px;line-height:1.2;color:var(--ink);opacity:.82;margin-top:2px;padding:0 120px;letter-spacing:.01em}
.hero.tallf .en2{font-size:42px}
.hero .sub2{font-size:30px;color:var(--ink);opacity:.8;margin-top:4px;padding:0 120px;line-height:1.5}
.hero .cardin{position:absolute;left:96px;right:96px;z-index:5;color:var(--ink)}
.hero .pts2{list-style:none}
.hero .pts2 li{font-size:30px;line-height:1.45;padding:9px 0;display:flex;gap:18px;align-items:baseline;border-bottom:1px solid var(--acc2)}
.hero .pts2 li:last-child{border-bottom:0}
.hero .pts2 li:before{content:"";flex:none;width:10px;height:10px;transform:rotate(45deg) translateY(-3px);background:var(--acc)}
.hero .rows .rw{display:flex;align-items:center;gap:20px;padding:10px 0;border-bottom:1px solid var(--acc2)}
.hero .rows .rw:last-child{border-bottom:0}
.hero .rows .n{font-family:"Cormorant Garamond",serif;font-size:46px;color:var(--acc);width:58px;text-align:center;flex:none;direction:ltr}
.hero .rows b{font-family:"Noto Naskh Arabic",Amiri;font-weight:700;font-size:34px}
.hero .rows span{font-size:25px;opacity:.85;margin-right:10px}
.hero .cols{display:flex}
.hero .cols>div{flex:1;text-align:center;padding:4px 16px}
.hero .cols>div+div{border-right:1.5px solid var(--acc2)}
.hero .cols h4{font-family:"Noto Naskh Arabic",Amiri;font-weight:700;font-size:34px;line-height:1.3}
.hero .cols p{font-size:23px;opacity:.85;line-height:1.45;margin-top:4px}
.hero .cols .lat{font-family:Montserrat;font-size:18px;letter-spacing:.24em;text-transform:uppercase;opacity:.8;display:block;margin-top:6px}
.hero .cols .ic{width:56px;height:56px;margin:0 auto 6px;border-radius:50%;border:1.6px solid var(--acc);color:var(--acc);display:flex;align-items:center;justify-content:center}
.hero .cols .ic svg{width:32px;height:32px}
.hero .wa2{display:inline-block;border:1.8px solid var(--acc);border-radius:60px;padding:12px 44px;font-family:Montserrat;font-size:34px;letter-spacing:.06em;direction:ltr;background:rgba(255,255,255,.5)}
`;

/* the post */
function heroPage(w, p, o = {}) {
  const tall = !!o.tall, H = tall ? 1920 : 1350, th = THEMES[o.theme] || THEMES[themeOf(p)];
  const scene = o.scene;
  const headline = String(w.headline || nm(p));
  const two = headline.length > 20;
  const hc = headline.length > 34 ? ' class="s2"' : two ? ' class="m"' : '';
  // where things go (feed / story); the story keeps clear of Instagram's top and bottom bars
  const L = tall
    ? { top: 300, podTop: 1240, podW: 720, prodH: two ? 640 : 700, name: 1440, bens: 1505, ft: 1620 }
    : { top: 206, podTop: 860, podW: 720, prodH: two ? 450 : 520, name: 1072, bens: 1130, ft: 1250 };
  let cx = 540, prodW = Math.round(L.podW * 0.9), prodBottom = L.podTop + Math.round(L.podW * 0.06) + 6, shift = 0;
  if (scene) {   // the picture moves so its podium sits where the layout wants it; the product stands on its top surface
    const target = tall ? 1235 : 860;
    shift = target - scene.podium.cy; cx = scene.podium.cx; prodW = Math.round(scene.podium.w * 0.86);
    prodBottom = target + Math.round(scene.podium.w * 0.012);
    L.prodH = tall ? (two ? 600 : 660) : (two ? 400 : 455);
    Object.assign(L, tall ? { name: 1425, bens: 1490, ft: 1610, card: [1395, 1680] } : { name: 1040, bens: 1100, ft: 1218, card: [1008, 1282] });
  }
  const en = String(w.headline_en || '').trim();
  if (en) L.prodH -= tall ? 50 : 46;   // the English line under the headline needs a little room
  if (!(w.chips || []).length) { L.ft = L.name + (tall ? 85 : 70); if (L.card) L.card = [L.card[0], L.ft + (tall ? 75 : 65)]; }
  const vars = `--ink:${th.ink};--acc:${th.acc};--acc2:${th.acc2}`;
  const sh = scene ? (scene.h || 1341) : 0;
  const bensLen = (w.chips || []).slice(0, 3).join('').length;   // long benefits get smaller so they always fit
  const bg = scene
    ? `<div class="bg" style="background:linear-gradient(180deg,${scene.top || th.bg1} 0,${scene.top || th.bg1} ${Math.max(0, shift)}px,${scene.base || th.bg2} ${shift + sh - 2}px)">
         <img src="${hx(scene.src)}" style="position:absolute;left:0;top:${shift}px;width:1080px;height:${sh}px;object-fit:fill">
         ${shift > 0 ? `<div style="position:absolute;left:0;right:0;top:${shift - 2}px;height:120px;background:linear-gradient(${scene.top || th.bg1},transparent)"></div>` : ''}
         ${shift + sh < H ? `<div style="position:absolute;left:0;right:0;top:${shift + sh - 120}px;height:122px;background:linear-gradient(transparent,${scene.base || th.bg2})"></div>` : ''}</div>`
    : `<div class="bg" style="background:radial-gradient(60% 40% at 50% ${tall ? 55 : 58}%,${th.glow},transparent 70%),linear-gradient(180deg,${th.bg1},${th.bg2})"></div>
       <div class="satin" style="right:-560px;top:${tall ? 600 : 380}px;background:linear-gradient(200deg,${th.satin},transparent 60%);transform:rotate(-18deg)"></div>
       <div class="satin" style="left:-620px;top:${tall ? 900 : 560}px;background:linear-gradient(160deg,${th.satin},transparent 55%);transform:rotate(14deg)"></div>
       <div class="ray"></div>
       <div class="bokeh" style="width:180px;height:180px;left:60px;top:${tall ? 520 : 330}px"></div><div class="bokeh" style="width:110px;height:110px;right:90px;top:${tall ? 760 : 470}px"></div><div class="bokeh" style="width:70px;height:70px;right:200px;top:${tall ? 420 : 300}px"></div>
       <div class="glow" style="top:${L.podTop - L.prodH - 40}px;width:${L.podW + 120}px;height:${L.prodH + 160}px;background:radial-gradient(closest-side,rgba(255,255,255,.75),rgba(255,255,255,0))"></div>`;
  return `<div class="s${tall ? ' tall' : ''}" style="${vars}"><div class="hero">${bg}
    <div class="frame2"></div>
    <div class="hd2" style="${tall ? 'top:150px' : ''}"><div class="cap2 r"><span>FROM GERMANY</span><i></i></div><div class="lg"><img src="logo-mark.png"><b>LUMIA</b><i>CARE</i></div><div class="cap2 l"><span>ORIGINAL</span><i></i></div></div>
    <div class="top" style="top:${L.top}px">${o.chip ? `<div class="kick2">${hx(o.chip)}</div>` : ''}<h1${hc}>${hx(headline)}</h1>${swoosh(th.acc)}${en ? `<div class="en2" dir="ltr">${hx(en)}</div>` : ''}</div>
    ${scene ? '' : `<div class="pod" style="top:${L.podTop}px">${podium(L.podW, th.acc, (p.id || 'x').length * 7 + headline.length)}</div>`}
    ${scene ? `<div style="position:absolute;z-index:3;left:${cx - prodW * 0.42}px;width:${prodW * 0.84}px;top:${prodBottom - 22}px;height:40px;border-radius:50%;background:radial-gradient(closest-side,rgba(70,40,30,.38),rgba(70,40,30,0));filter:blur(5px)"></div>` : ''}
    <div class="prod2" style="left:${cx - prodW / 2}px;width:${prodW}px;top:${prodBottom - L.prodH}px;height:${L.prodH}px"><img class="cut" src="${hx(p.image)}"></div>
    ${scene ? `<div class="glass" style="top:${L.card[0]}px;height:${L.card[1] - L.card[0]}px"></div>` : ''}
    <div class="name2" style="top:${L.name}px"><span class="lat">${hx(p.brand)}</span> · ${hx(nm(p))}${p.size ? ` · <span class="lat">${hx(p.size)}</span>` : ''}</div>
    <div class="bens${bensLen > 34 ? ' tight' : ''}${bensLen > 44 ? ' tighter' : ''}" style="top:${L.bens}px">${(w.chips || []).slice(0, 3).map(c => `<div class="ben"><span class="ic">${icon(iconFor(c))}</span>${hx(c)}</div>`).join('')}</div>
    <div class="ft2" style="top:${L.ft}px"><div class="ln"><i></i>التوصيل لجميع المحافظات · الدفع عند الاستلام<i></i></div></div>
  </div></div>`;
}

/* a stage post with several products (or none) on the podium:
   o = { theme, scene, tall, kick, headline, sub, items: [src], badges: bool, over: html between two products,
         target: podium height, card: [top, bottom], cardHtml } */
function stagePage(o) {
  const tall = !!o.tall, H = tall ? 1920 : 1350, th = THEMES[o.theme] || THEMES.blush, scene = o.scene;
  const headline = String(o.headline || ''), two = headline.length > 20;
  const hc = headline.length > 34 ? ' class="s2"' : two ? ' class="m"' : '';
  const target = o.target || (tall ? 1235 : 860);
  const podW = scene ? scene.podium.w : 720, cx = scene ? scene.podium.cx : 540;
  const shift = scene ? target - scene.podium.cy : 0, sh = scene ? (scene.h || 1341) : 0;
  const bottom = target + Math.round(podW * (scene ? 0.012 : 0.075));
  const items = (o.items || []).slice(0, 3), k = items.length;
  const en = String(o.headlineEn || '').trim();
  const room = target - (o.top || (tall ? 300 : 206)) - (two ? 250 : 170) - (o.sub ? 50 : 0) - (en ? 48 : 0);   // space between the headline and the podium
  const hMax = Math.max(200, Math.min(o.maxH || (tall ? 700 : 470), room));
  const spec = k === 1 ? [[0, 0.86, 1]] : k === 2 ? [[-0.25, 0.44, 0.92], [0.25, 0.44, 0.92]] : [[-0.31, 0.3, 0.8], [0, 0.34, 0.9], [0.31, 0.3, 0.8]];
  const vars = `--ink:${th.ink};--acc:${th.acc};--acc2:${th.acc2}`;
  const bg = scene
    ? `<div class="bg" style="background:linear-gradient(180deg,${scene.top || th.bg1} 0,${scene.top || th.bg1} ${Math.max(0, shift)}px,${scene.base || th.bg2} ${shift + sh - 2}px)">
         <img src="${hx(scene.src)}" style="position:absolute;left:0;top:${shift}px;width:1080px;height:${sh}px;object-fit:fill">
         ${shift > 0 ? `<div style="position:absolute;left:0;right:0;top:${shift - 2}px;height:140px;background:linear-gradient(${scene.top || th.bg1},transparent)"></div>` : ''}
         ${shift + sh < H ? `<div style="position:absolute;left:0;right:0;top:${shift + sh - 140}px;height:142px;background:linear-gradient(transparent,${scene.base || th.bg2})"></div>` : ''}</div>`
    : `<div class="bg" style="background:radial-gradient(60% 40% at 50% 58%,${th.glow},transparent 70%),linear-gradient(180deg,${th.bg1},${th.bg2})"></div>
       <div class="satin" style="right:-560px;top:380px;background:linear-gradient(200deg,${th.satin},transparent 60%);transform:rotate(-18deg)"></div>
       <div class="ray"></div><div class="pod" style="top:${target - Math.round(podW * 0.075)}px">${podium(podW, th.acc, headline.length + 11)}</div>`;
  const prods = items.map((src, i) => {
    const [dx, ww, hh] = spec[i], w = Math.round(podW * ww), h = Math.round(hMax * hh), left = Math.round(cx + dx * podW - w / 2);
    return `<div style="position:absolute;z-index:3;left:${left + w * 0.1}px;width:${w * 0.8}px;top:${bottom - 20}px;height:36px;border-radius:50%;background:radial-gradient(closest-side,rgba(70,40,30,.34),rgba(70,40,30,0));filter:blur(5px)"></div>
      <div class="prod2" style="left:${left}px;width:${w}px;top:${bottom - h}px;height:${h}px"><img class="${o.noCut ? '' : 'cut'}" src="${hx(src)}"${o.darken ? ' style="filter:brightness(.55) saturate(1.5) contrast(1.15) drop-shadow(0 10px 14px rgba(60,30,25,.18))"' : ''}></div>
      ${o.badges ? `<div class="badge" style="left:${Math.round(cx + dx * podW - 29)}px;top:${bottom + 14}px">0${i + 1}</div>` : ''}`;
  }).join('');
  const card = o.card || (tall ? [1395, 1690] : [1008, 1282]);
  return `<div class="s${tall ? ' tall' : ''}" style="${vars}"><div class="hero">${bg}
    <div class="frame2"></div>
    <div class="hd2" style="${tall ? 'top:150px' : ''}"><div class="cap2 r"><span>FROM GERMANY</span><i></i></div><div class="lg"><img src="logo-mark.png"><b>LUMIA</b><i>CARE</i></div><div class="cap2 l"><span>ORIGINAL</span><i></i></div></div>
    <div class="top" style="top:${o.top || (tall ? 300 : 206)}px">${o.kick ? `<div class="kick2">${hx(o.kick)}</div>` : ''}${headline ? `<h1${hc}>${hx(headline)}</h1>${swoosh(th.acc)}` : ''}${en ? `<div class="en2" dir="ltr">${hx(en)}</div>` : ''}${o.sub ? `<div class="sub2">${hx(o.sub)}</div>` : ''}</div>
    ${prods}${o.over ? `<div class="or2" style="left:${cx - 40}px;top:${bottom - Math.round(hMax * 0.62)}px">${o.over}</div>` : ''}
    ${o.cardHtml ? `<div class="glass" style="top:${card[0]}px;height:${card[1] - card[0]}px"></div><div class="cardin" style="top:${card[0]}px;height:${card[1] - card[0]}px;display:flex;flex-direction:column;justify-content:center">${o.cardHtml}</div>` : ''}
  </div></div>`;
}

/* in the page: cut each product out of its white photo background (flood fill from the edges, so white parts
   inside the product stay), soften the edge, and crop to the product so it fills its space */
const CUTOUT_JS = `async () => {
  for (const img of document.querySelectorAll('img.cut')) {
    try {
      if (!img.complete) await img.decode();
      const w = img.naturalWidth, h = img.naturalHeight; if (!w || !h) continue;
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, w, h), a = d.data, seen = new Uint8Array(w * h), st = [];
      const light = i => { const r = a[i * 4], g = a[i * 4 + 1], b = a[i * 4 + 2], mn = Math.min(r, g, b), mx = Math.max(r, g, b); return mn >= 247 && mx - mn < 9; };
      for (let X = 0; X < w; X++) st.push(X, (h - 1) * w + X); for (let Y = 0; Y < h; Y++) st.push(Y * w, Y * w + w - 1);
      while (st.length) { const i = st.pop(); if (seen[i]) continue; seen[i] = 1; if (!light(i)) continue; a[i * 4 + 3] = 0; const X = i % w;
        if (X > 0) st.push(i - 1); if (X < w - 1) st.push(i + 1); if (i >= w) st.push(i - w); if (i < w * (h - 1)) st.push(i + w); }
      // soft edge: light pixels touching the removed background fade out
      for (let i = 0; i < w * h; i++) { if (a[i * 4 + 3] === 0) continue; const X = i % w;
        const nb = (X > 0 && a[(i - 1) * 4 + 3] === 0) || (X < w - 1 && a[(i + 1) * 4 + 3] === 0) || (i >= w && a[(i - w) * 4 + 3] === 0) || (i < w * (h - 1) && a[(i + w) * 4 + 3] === 0);
        if (nb) { const mn = Math.min(a[i * 4], a[i * 4 + 1], a[i * 4 + 2]); a[i * 4 + 3] = mn > 238 ? 150 : 235; } }
      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) if (a[(Y * w + X) * 4 + 3] > 30) { if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }
      if (x1 <= x0 || y1 <= y0) continue;
      x.putImageData(d, 0, 0);
      const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1; o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
      img.src = o.toDataURL('image/png'); await img.decode();
    } catch (e) { /* keep the original photo */ }
  }
  return true;
}`;

module.exports = { THEMES, themeOf, sceneFor, scenesIn, heroPage, stagePage, podium, CSS, CUTOUT_JS, iconFor, icon, hx, nm };
